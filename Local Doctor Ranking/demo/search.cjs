const { rankPractitionersBM25 } = require('../bm25Service.cjs');
const { embed, cosine, getGenerator, EMBEDDING_MODEL, GENERATION_MODEL } = require('./models.cjs');
const { initGeo, enrichLocations, resolveLocation, distanceTo } = require('./geo.cjs');
const { loadRecords } = require('./data-source.cjs');
const {matchesClinicalCriteria,matchClinicalCriteria,positiveClinicalText} = require('./clinical-filters.cjs');
const {createPersonalizedMatch} = require('./personalized-match.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');

function mapToRanking(record) {
  return { ...record, description:'', about:'', clinical_expertise: record.clinicalInterests.join('. '),
    procedure_groups: [...record.clinicalInterests,...(record.procedures||[])].map(procedure_group_name => ({procedure_group_name})),
    insuranceProviders: record.insurers.map(name => ({name})) };
}
function reciprocalRankFusion(lists, k=60) {
  const scores = new Map();
  for (const list of lists) list.forEach((id,index) => scores.set(id,(scores.get(id)||0) + 1/(k+index+1)));
  return scores;
}
// The mapped clinical fields include attributed practice evidence extracted from
// profiles. A raw biography also contains hobbies and administrative prose;
// those must not improve clinical matching for a patient's activity or goal.
function clinicalText(r) { return [r.specialty,...r.clinicalInterests,...(r.procedures||[])].filter(Boolean).join('. '); }
function lexicalClinicalQuery(query) {
  const filler=new Set('the and with have has had been very want would like discuss find someone specialist consultant doctor for that this who what where when how from into also about can could should myself my your our they them their not does did get still already diagnosed diagnosis'.split(' '));
  const terms=String(query).toLowerCase().replace(/\b(?:get|getting)\s+back\s+to\b/g,' ').match(/[a-z]+/g)||[];
  // Inflection expansion helps everyday symptom wording reach exact source
  // language. These remain query terms scored by the real BM25 implementation.
  const variants={painful:['painful','pain','pains'],pain:['pain','painful','pains'],pains:['pains','pain','painful'],periods:['periods','period'],runner:['runner','running'],running:['running','runner']};
  return [...new Set(terms.filter(t=>t.length>2&&!filler.has(t)).flatMap(t=>variants[t]||[t]))].join(' ');
}
function clinicalRetrievalQuery(criteria,{forEvidence=false}={}) {
  const text=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
  const topic=text(criteria.topic),specialty=text(criteria.specialty);
  const procedures=(Array.isArray(criteria.procedures)?criteria.procedures:[]).map(text).filter(Boolean);
  const clinical=[topic,...procedures].filter(Boolean);
  const anchors=forEvidence && clinical.length?clinical:[topic,specialty,...procedures].filter(Boolean);
  // Patient context is a bounded relevance signal, not consultant evidence or a
  // new hard criterion. Keep explicit anchors first even for a long narrative.
  let context=text(positiveClinicalText(criteria.clinicalContext));
  if(context.length>320) context=context.slice(0,320).replace(/\s+\S*$/,'').trim();
  return [...anchors,context].filter(Boolean).join('. ') || 'consultant specialist';
}
function explicitClinicalMatch(r,query) {
  const anchors = {knee:/\bknee\b/i,hip:/\bhip\b/i,shoulder:/\bshoulder\b/i,spine:/spine|spinal|back pain/i,heart:/cardiol|heart|cardiac/i,skin:/dermatol|skin/i};
  const mentioned = Object.entries(anchors).filter(([key])=>new RegExp(`\\b${key}\\b`,'i').test(query));
  if (/\barthroplasty\b|\bjoint replacement\b/i.test(query) && !/orthopaed|joint replacement/i.test(clinicalText(r))) return false;
  if(/\bpainful\s+periods?\b|\bperiod\s+pains?\b/i.test(query) && !/\bpainful\s+periods?\b|\bperiod\s+pains?\b|\bmenstrual\b|\bdysmenorrh(?:oea|ea)\b|\bheavy\s+and\s+painful\s+periods?\b/i.test(clinicalText(r))) return false;
  return !mentioned.length || (/\bor\b/i.test(query) ? mentioned.some(([,pattern])=>pattern.test(clinicalText(r))) : mentioned.every(([,pattern])=>pattern.test(clinicalText(r))));
}
function matchesFilters(r,c) {
  if(c.insurance && !r.insurers.some(x=>x.toLowerCase()===c.insurance.toLowerCase())) return false;
  if(c.gender && r.gender?.toLowerCase() !== c.gender.toLowerCase()) return false;
  if(c.language && !r.languages.some(x=>x.toLowerCase().replace(/\s+/g,' ').trim().split(/\s*[-–—:(]\s*/)[0].trim()===c.language.toLowerCase())) return false;
  if(!matchesClinicalCriteria(r,c)) return false;
  // Body-area alternatives belong only to the clinical concern. A separately
  // requested procedure must never become another arm of that OR expression.
  return explicitClinicalMatch(r,c.topic || '');
}
function explanationFacts(record) {
  const fallback = record.evidenceUrl || record.profileUrl;
  const clinicalProvenance = Array.isArray(record.fieldProvenance?.clinicalInterests) ? record.fieldProvenance.clinicalInterests : [];
  const specialtyProvenance = Array.isArray(record.fieldProvenance?.specialty) ? record.fieldProvenance.specialty : [];
  const facts = record.clinicalInterests.map(text => ({
    text:`Profile lists: ${text}`,
    value:text,
    sourceUrl:clinicalProvenance.find(evidence => evidence.values?.includes(text) && evidence.sourceUrl)?.sourceUrl || fallback,
  }));
  for(const text of record.procedures||[]) facts.push({text:`Record lists: ${text}`,value:text,
    sourceUrl:record.procedureEvidence?.find(e=>e.text===text)?.sourceUrl || fallback});
  if (record.specialty) facts.push({text:`Specialty: ${record.specialty}.`,sourceUrl:specialtyProvenance.find(evidence => evidence.sourceUrl)?.sourceUrl || fallback});
  if (record.locations.length) facts.push({text:`Practises at ${record.locations.map(location => location.name).join(' and ')}.`,sourceUrl:fallback});
  return facts;
}
function shortlistEvidence(query, facts, limit = 8) {
  if (!facts.length) return [];
  // Retrieve within this consultant's evidence independently of the profile
  // ranking. Long profiles otherwise hide the relevant fact after the model's
  // context window, or invite it to choose an unrelated but grounded fact.
  const documents = facts.map((fact, index) => ({id:String(index), description:fact.text, fact}));
  const matching = rankPractitionersBM25(documents, query)
    .filter(result => result.bm25Score > 0)
    .sort((a,b) => b.bm25Score-a.bm25Score || Number(a.document.id)-Number(b.document.id));
  // Semantic-only consultant matches may have no exact evidence terms. In that
  // case retain original source facts; never invent a lexical match or a source.
  // Prefer a specific relevant phrase over isolated tags such as "Knee".
  // Keep those tags only when no richer matching evidence exists.
  const informative=matching.filter(result=>{
    const fact=result.document.fact;
    const value=fact.value || fact.text.replace(/^(?:Profile lists|Record lists|Specialty):\s*/i,'');
    return (value.match(/[\p{L}\d]+/gu)||[]).length>1;
  });
  return matching.length ? (informative.length?informative:matching).slice(0,limit).map(result => result.document.fact) : facts.slice(0,limit);
}
function rerankCandidates(eligible, lexical, semantic, criteria, origin) {
  const eligibleIds = new Set(eligible.map(record => record.id));
  // Keep the full matching union. Truncating before distance ordering hides
  // nearby relevant consultants and understates the number of matching records.
  const lexicalCandidates = lexical.filter(item => eligibleIds.has(item.document.id) && item.bm25Score > 0);
  const semanticCandidates = semantic.filter(item => eligibleIds.has(item.id) && item.score >= 0.30);
  const fusion = reciprocalRankFusion([lexicalCandidates.map(item => item.document.id), semanticCandidates.map(item => item.id)]);
  const semMap = new Map(semantic.map(item => [item.id, item.score]));
  const lexMap = new Map(lexical.map(item => [item.document.id, item.bm25Score]));
  const hasTopic = Boolean(criteria.topic?.trim() || criteria.specialty || criteria.procedures?.length);
  const ranked = eligible.filter(record => !hasTopic || fusion.has(record.id)).map(record => {
    const distance = distanceTo(record, origin);
    const relevance = (fusion.get(record.id) || 0) * 30 + Math.max(0, semMap.get(record.id) || 0) * 0.35;
    return {record, distance, relevance};
  }).sort((a,b) => criteria.sortByDistance && origin
    ? (a.distance?.miles ?? Infinity) - (b.distance?.miles ?? Infinity) || b.relevance - a.relevance || a.record.name.localeCompare(b.record.name)
    : b.relevance - a.relevance || a.record.name.localeCompare(b.record.name));
  return {ranked, lexicalCandidates, semanticCandidates, fusion, semMap, lexMap};
}
class SearchEngine {
  constructor({embedQuery=embed,personalize=createPersonalizedMatch}={}) {
    this.ready=false; this.status='Loading consultant profiles'; this.answerCache=new Map();
    this.embedQuery=embedQuery; this.personalize=personalize;
  }
  async init() {
    const started=Date.now();
    const progress=status=>{this.status=status;console.log(`[DocMap startup] ${status} (${((Date.now()-started)/1000).toFixed(1)}s)`);};
    progress('Loading consultant profiles');
    const loaded = await loadRecords(); Object.assign(this,loaded);
    progress(`Resolving practice coordinates for ${this.records.length} verified profiles`);
    await initGeo(); await enrichLocations(this.records);
    progress('Preparing semantic search');
    this.documents = this.records.map(mapToRanking);
    const texts=this.records.map(clinicalText);
    const fingerprint=createHash('sha256').update(JSON.stringify([EMBEDDING_MODEL,texts])).digest('hex');
    const indexFile=path.join(__dirname,'.cache','embedding-index.json');
    try { const cached=JSON.parse(await fs.readFile(indexFile,'utf8')); if(cached.fingerprint===fingerprint && cached.vectors.length===texts.length) this.vectors=cached.vectors; } catch {}
    if(!this.vectors) {
      this.vectors=[];
      progress(`Embedding consultant profiles: 0/${texts.length}`);
      for(let start=0;start<texts.length;start+=24) {
        this.vectors.push(...await embed(texts.slice(start,start+24)));
        if((Math.floor(start/24)+1)%10===0 || this.vectors.length===texts.length) progress(`Embedding consultant profiles: ${this.vectors.length}/${texts.length}`);
      }
      await fs.mkdir(path.dirname(indexFile),{recursive:true}); await fs.writeFile(indexFile,JSON.stringify({fingerprint,vectors:this.vectors}));
    } else progress(`Reused semantic index for ${texts.length} profiles`);
    progress('Preparing local evidence selection');
    await getGenerator();
    this.ready=true; progress('Ready');
  }
  health() { return {ready:this.ready, status:this.status, recordCount:this.records?.length || 0,
    dataSource:this.source,sourceLabel:this.sourceLabel,embeddingReady:!!this.records?.length && this.vectors?.length===this.records.length,
    insuranceEvidenceCount:this.quality?.withInsuranceEvidence ?? null,
    notice: this.source === 'public-profile-snapshot' ? 'Demo collection from official Spire and insurer profiles. This is not the full Spire directory or a live Supabase connection.'
      : this.source === 'supabase' && Number.isFinite(this.quality?.withInsuranceEvidence)
        ? `Insurance evidence is verified for ${this.quality.withInsuranceEvidence} consultant${this.quality.withInsuranceEvidence===1?'':'s'}; other insurance status is unknown.` : null}; }
  async search(criteria) {
    if (!this.ready) throw new Error('Search is still preparing.');
    const notices=[];
    const query=clinicalRetrievalQuery(criteria);
    const evidenceQuery=clinicalRetrievalQuery(criteria,{forEvidence:true});
    const origin=await resolveLocation(criteria.location);
    const knownCity=origin?.city;
    if(criteria.location && !origin) notices.push(criteria.radiusMiles || criteria.sortByDistance
      ? `I could not resolve “${criteria.location}” to coordinates, so I cannot apply your distance criterion. Enter a UK postcode or remove the distance criterion.`
      : `I could not resolve “${criteria.location}” to coordinates. Results use recorded location text; try a UK postcode for distance ordering.`);
    const eligible=this.records.filter(r=>{
      if(!criteria.location) return true;
      if(!origin && (criteria.radiusMiles || criteria.sortByDistance)) return false;
      const d=distanceTo(r,origin);
      if(origin) return d && d.miles <= (criteria.radiusMiles || (knownCity ? 35 : 50));
      return r.locations.some(l=>`${l.name} ${l.address} ${l.city} ${l.postcode}`.toLowerCase().includes(criteria.location.toLowerCase()));
    }).filter(r=>matchesFilters(r,criteria));
    if(knownCity) notices.push(`${criteria.location} covers Spire hospitals within ${criteria.radiusMiles || 35} ${criteria.radiusMiles===1?'mile':'miles'} of the ${origin.precision}. Recorded hospital locations are shown on each card.`);
    if(origin && !knownCity) notices.push(`Distances are approximate straight-line distances from the ${origin.precision} for ${criteria.location}, not travel distances. Search radius: ${criteria.radiusMiles || 50} ${criteria.radiusMiles===1?'mile':'miles'}.`);
    // Both retrieval methods run independently against the same verified corpus.
    const lexical=rankPractitionersBM25(this.documents,lexicalClinicalQuery(query)).filter(x=>x.bm25Score>0).sort((a,b)=>b.bm25Score-a.bm25Score);
    const [qv]=await this.embedQuery([query]);
    const semantic=this.records.map((r,i)=>({id:r.id,score:cosine(qv,this.vectors[i])})).sort((a,b)=>b.score-a.score);
    const {ranked,lexicalCandidates,semanticCandidates,fusion,semMap,lexMap}=rerankCandidates(eligible,lexical,semantic,criteria,origin);
    const generationModes=[];
    const results=[];
    for(const {record:r,distance} of ranked.slice(0,6)) {
      const availableFacts=explanationFacts(r);
      const facts=shortlistEvidence(lexicalClinicalQuery(evidenceQuery),availableFacts);
      const key=JSON.stringify([r.id,criteria]);
      let generated=this.answerCache.get(key);
      if(!generated) {
        generated=await this.personalize(r,criteria,{distance,facts,clinicalFacts:availableFacts.filter(f=>typeof f.value==='string'),clinicalMatch:matchClinicalCriteria(r,criteria)});
        this.answerCache.set(key,generated);
        if(this.answerCache.size>500) this.answerCache.delete(this.answerCache.keys().next().value);
      }
      generationModes.push(generated.generationMode);
      const reasons=[...generated.selected];
      if(criteria.insurance) { const e=r.insuranceEvidence.find(e=>e.insurer.toLowerCase()===criteria.insurance.toLowerCase()); if(e) reasons.push({text:e.text,sourceUrl:e.sourceUrl}); }
      if(distance && origin) reasons.push({text:`${distance.miles.toFixed(1)} miles from ${criteria.location} to ${distance.location.name} (straight line).`,sourceUrl:distance.location.sourceUrl});
      results.push({...r,personalizedMatch:generated.personalizedMatch,reasons:reasons.slice(0,4),distanceMiles:distance ? Math.round(distance.miles*10)/10 : null,
        distanceLabel:distance ? `${distance.miles.toFixed(1)} mi from ${criteria.location}` : null,
        locations:[...(distance?[distance.location]:[]),...r.locations.filter(l=>l !== distance?.location)]});
    }
    const total=ranked.length;
    if(criteria.insurance) notices.push(`Only records with linked ${criteria.insurance} evidence are included; other consultants’ insurance status is unknown.${total ? ' Check your policy, procedure and any fee shortfall with the insurer before booking.' : ''}`);
    let message=total ? `I found ${total} matching Spire consultant${total===1?'':'s'}${criteria.insurance ? ` with documented ${criteria.insurance} recognition` : ''}. ${criteria.sortByDistance && origin ? `Nearest to ${criteria.location} first.` : 'Ranked by profile relevance.'}` : 'I couldn’t find a verified match for all your criteria. Try removing a filter or widening the location.';
    if(this.source==='public-profile-snapshot') message += ' Results are limited to this demo collection.';
    return {results,total,message,notices,suggestions:!total?['Search anywhere','Any insurer']: !criteria.insurance ? ['Only those accepting Bupa','Closer to SW5'] : !criteria.sortByDistance ? ['Closer to SW5','Any insurer'] : ['Within 20 miles','Any insurer'],
      diagnostics:{embeddingModel:EMBEDDING_MODEL,generationModel:GENERATION_MODEL,
        generationModes,keywordMethod:'BM25 (k1=1.5, b=0.75)',fusion:'RRF (k=60)',
        bm25Candidates:lexicalCandidates.map(x=>({id:x.document.id,score:x.bm25Score})),semanticCandidates:semanticCandidates,
        ranking:ranked.map(x=>({id:x.record.id,bm25:lexMap.get(x.record.id)||0,semantic:semMap.get(x.record.id),rrf:fusion.get(x.record.id),rerank:x.relevance,distanceMiles:x.distance?.miles??null}))}};
  }
}
module.exports={SearchEngine,mapToRanking,reciprocalRankFusion,matchesFilters,explicitClinicalMatch,rerankCandidates,explanationFacts,shortlistEvidence,clinicalRetrievalQuery,clinicalText,lexicalClinicalQuery};
