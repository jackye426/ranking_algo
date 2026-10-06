'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {embed,EMBEDDING_MODEL}=require('../demo/models.cjs');
const {CONCEPTS,sufficient}=require('./brief.cjs');
const {activityClauses,classifyPassage}=require('./data.cjs');
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const STOP=new Set('a an the and or to of in for with we us our their this that these those is are be been have has had would could should find need help expert experts specialist specialists clinical assessment assess software device purpose question current previous experience documented only useful optional essential practice outputs relevant relevance effects consequences incorrect results support supporting'.split(' '));
const aliases={computed:'computed',tomography:'tomography',scans:'scan',images:'image',imaging:'image',studies:'study',researcher:'research',researchers:'research',radiologists:'radiologist',cardiologists:'cardiologist',adults:'adult',lesions:'lesion'};
function tokens(text){return (clean(text).toLowerCase().match(/[a-z0-9]+/g)||[]).filter(t=>t.length>=2&&!STOP.has(t)).map(t=>aliases[t]||t);}
// The same Robertson BM25 formula and parameters as the patient ranker. A
// precomputed posting list avoids retokenizing a large passage corpus per query.
class BM25Index{
  constructor(passages){
    this.passages=passages;this.lengths=[];this.postings=new Map();let total=0;
    passages.forEach((p,index)=>{const words=tokens(p.text),frequency=new Map();this.lengths.push(words.length);total+=words.length;for(const word of words)frequency.set(word,(frequency.get(word)||0)+1);for(const [word,tf]of frequency){if(!this.postings.has(word))this.postings.set(word,[]);this.postings.get(word).push(index,tf);}});
    for(const [word,posting]of this.postings)this.postings.set(word,Uint32Array.from(posting));
    this.lengths=Uint32Array.from(this.lengths);
    this.average=total/Math.max(1,passages.length)||1;
  }
  search(query){
    const scores=new Map(),N=this.passages.length,k1=1.5,b=.75;
    for(const term of new Set(tokens(query))){const posting=this.postings.get(term)||[];const frequency=posting.length/2;const idf=Math.log((N-frequency+.5)/(frequency+.5)+1);for(let i=0;i<posting.length;i+=2){const index=posting[i],tf=posting[i+1];const value=idf*(tf*(k1+1))/(tf+k1*(1-b+b*this.lengths[index]/this.average));scores.set(index,(scores.get(index)||0)+value);}}
    return [...scores].map(([index,score])=>({index,score})).sort((a,b)=>b.score-a.score||a.index-b.index);
  }
}
function requirementQuery(r){
  const alternatives={'Cardiac CT':'cardiac CT coronary computed tomography CCTA','Skin-lesion imaging':'skin lesions dermoscopy dermatoscopy image','Diagnostic study evaluation':'diagnostic accuracy clinical performance validation study evaluation','Clinical research':'clinical research trials investigator','Medical-device assessment experience':'medical device assessment clinical evaluation regulatory MDR'};
  return alternatives[r.label]||r.text||r.label;
}
// Exact metadata still participates in BM25 and structured requirement checks.
// It should not spend vector capacity on registration/address/degree strings.
function semanticEligible(p){if(p.type==='location'||p.qualifiers?.includes('publication-listing-link-not-authorship'))return false;if(p.type!=='professional-background')return true;if(/^(?:qualifications|detailed_qualifications)$/.test(p.field))return p.text.length>=100||Object.values(p.attributes||{}).some(values=>values.length>0);return !/^(?:specialty|specialty_alternatives|specialties|professional_memberships|nhs_posts|nhs_base|registration|locations)$/.test(p.field);}
function negative(text){return /\b(?:does not|do not|not currently|no experience|without experience|never)\b/i.test(text);}
const segments=activityClauses;
const evidenceStrength=p=>({'clinical-practice':6,research:5,trial:5,publication:4,'clinical-interest':3,procedure:2,training:1})[p.type]||0;
function requirementScopes(requirement,passage){
  const clauses=segments(passage.text);
  return clauses.map(text=>{
    let type=passage.type;
    if(type==='clinical-practice'){
      const localType=classifyPassage(text,passage.field||'about');
      // A mixed imported paragraph can have an overly broad parent type. A
      // qualification never inherits clinical strength from a different clause.
      // Reviewed summaries keep their deliberately reviewed type unless the
      // matching clause explicitly describes training or interest.
      if(['training','clinical-interest'].includes(localType)||(clauses.length>1&&passage.attribution!=='verified-source'))type=localType;
    }
    return {...passage,text,type,attributes:{}};
  }).filter(p=>directMatch(requirement,p));
}
function effectiveEvidenceType(requirement,passage){return requirementScopes(requirement,passage).sort((a,b)=>evidenceStrength(b)-evidenceStrength(a))[0]?.type||passage.type;}
function deviceAssessment(text){return /\b(?:medical[- ]device|notified body|technical documentation|clinical evaluation reports?|\bMDR\b)\b/i.test(text)&&/\b(?:assess(?:ed|es|ing)|evaluat(?:ed|es|ing)|review(?:ed|s|ing)|(?:clinical|regulatory)\s+(?:assessor|evaluator|reviewer))\b/i.test(text);}
function directMatch(requirement,passage){
  const text=passage.text||'',label=requirement.label||requirement.text;
  if(requirement.kind==='modality'&&label==='Ultrasound'){
    // Ultrasound energy used for treatment is not diagnostic imaging expertise.
    // Keep the full source in retrieval; scope only this requirement assertion.
    const diagnosticText=text.replace(/\bultrasound\s+phacoemulsification\b|\bhigh[- ]intensity focused ultrasound\b|\btherapeutic ultrasound\b|\bHIFU\b/gi,'');
    return /\b(?:ultrasound|echocardiograph\w*)\b/i.test(diagnosticText);
  }
  if(requirement.kind==='research'&&label==='Clinical research')return ['research','trial','publication'].includes(passage.type)&&/\b(?:research|trials?|stud(?:y|ies)|investigator|coauthor|authored|publications?)\b/i.test(text)&&!passage.qualifiers?.includes('publication-listing-link-not-authorship');
  if(requirement.kind==='regulatory'&&deviceAssessment(text))return true;
  if(requirement.kind==='role'&&/specialt|professional_role/.test(passage.field||'')){
    const forms={Radiologist:/\bradiolog/i,Cardiologist:/\bcardiolog/i,Dermatologist:/\bdermatolog/i};
    if(forms[label]?.test(text))return true;
  }
  const concept=CONCEPTS.find(([kind,name])=>kind===requirement.kind&&name.toLowerCase()===label.toLowerCase());
  const allAttributes=Object.values(passage.attributes||{}).flat().filter(x=>typeof x==='string');
  // A known clinical concept requires its actual phrase or an attributable
  // extracted attribute. Unrelated words in a long list are not a relation.
  if(concept)return concept[2].test(text)||allAttributes.some(a=>a.toLowerCase()===label.toLowerCase());
  if(allAttributes.some(a=>a.toLowerCase()===label.toLowerCase()))return true;
  const wanted=tokens(requirement.text||label);
  if(!wanted.length)return false;
  const present=new Set(tokens(text));
  return wanted.every(t=>present.has(t));
}
function UKLocation(candidate){
  return (candidate.locations||[]).find(item=>/\b(?:United Kingdom|UK|England|Scotland|Wales|Northern Ireland)\b/i.test([item.country,item.region,item.address].filter(Boolean).join(' '))||/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(item.postcode||item.address||''));
}
function questionFor(requirement){
  if(requirement.kind==='currentPractice')return 'Do you currently practise in the relevant clinical pathway, and when did you last interpret these scans or perform this activity?';
  if(requirement.kind==='regulatory')return 'What medical-device clinical evaluation or regulatory assessment work have you undertaken, and in what scope?';
  if(requirement.kind==='research')return `Can you describe your role in ${requirement.label.toLowerCase()}, including the study methods and evidence you evaluated?`;
  if(requirement.kind==='population')return `Does your current practice cover ${requirement.label.toLowerCase()} for this clinical use?`;
  if(requirement.kind==='setting')return `What direct experience do you have of ${requirement.label.toLowerCase()} in this clinical pathway?`;
  return `Can you confirm your direct experience relevant to ${requirement.label.toLowerCase()} and provide a recent example?`;
}
function matrixFor(candidate,passages,brief){
  return brief.requirements.map(requirement=>{
    const base={requirementId:requirement.id,label:requirement.label,kind:requirement.kind,importance:requirement.importance,evidenceIds:[]};
    if(['question','technology','workflow'].includes(requirement.kind))return {...base,status:'context',note:'This describes the engagement. Clinical applicability must be discussed with the expert.'};
    if(requirement.kind==='geography'){
      const location=brief.geography==='UK'?UKLocation(candidate):null;
      const evidence=passages.filter(p=>p.type==='location'&&(/\b(?:United Kingdom|UK|England|Scotland|Wales|Northern Ireland)\b|\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/.test(p.text)));
      const supported=location&&evidence.length>0;
      return {...base,status:supported?'documented':'unknown',evidenceIds:supported?evidence.slice(0,2).map(p=>p.id):[],note:supported?'A recorded UK practice location supports geography; residence and availability are not established.':'Country of current practice needs confirmation.'};
    }
    if(requirement.kind==='currentPractice')return {...base,status:'unknown',note:'A professional profile does not verify current activity for this engagement.'};
    if(requirement.kind==='role'&&requirement.label==='Practising clinician')return {...base,status:'unknown',note:'The panel needs a practising clinical perspective; current activity must be confirmed directly.'};
    const scoped=new Map(),scopes=p=>{if(!scoped.has(p))scoped.set(p,requirementScopes(requirement,p));return scoped.get(p);};
    const strength=p=>Math.max(0,...scopes(p).map(evidenceStrength));
    const matched=passages.filter(p=>p.type!=='location'&&directMatch(requirement,p)).sort((a,b)=>strength(b)-strength(a));
    const negativeFor=p=>{const related=scopes(p);return related.length>0&&related.every(s=>negative(s.text));};
    const positive=matched.filter(p=>!negativeFor(p)&&!(p.qualifiers||[]).some(q=>/colleague|uncertain-identity/i.test(q)));
    const direct=positive.filter(parent=>scopes(parent).filter(p=>!negative(p.text)).some(p=>{
      if(['population','setting'].includes(requirement.kind)){
        const anchors=brief.requirements.filter(r=>['modality','condition','procedure'].includes(r.kind));
        if(anchors.length&&!segments(p.text).some(text=>directMatch(requirement,{...p,text,attributes:{}})&&anchors.some(a=>directMatch(a,{...p,text,attributes:{}}))))return false;
      }
      if(requirement.kind==='regulatory')return ['clinical-practice','research','relationship','professional-background'].includes(p.type)&&!p.qualifiers?.some(q=>/interest|training/.test(q))&&deviceAssessment(p.text);
      if(requirement.kind==='research'){
        if(!['research','trial','publication'].includes(p.type)||/(?:interest in research|hopes to|plans to)/i.test(p.text))return false;
        if(requirement.label==='Diagnostic study evaluation')return /\b(?:evaluat(?:ed|es|ing)|apprais(?:ed|es|ing)|validat(?:ed|es|ing)|(?:principal|chief) investigator|led (?:the |a )?(?:diagnostic|validation) study)\b/i.test(p.text)&&!p.review?.limitations?.some(x=>/not a specific investigator task|not.*appraisal/i.test(x));
        return true;
      }
      if(requirement.kind==='role')return /professional-background|registration|clinical-practice/.test(p.type)&&!['training'].includes(p.type);
      if(requirement.kind==='activity')return p.type==='clinical-practice'&&!p.qualifiers?.includes('historical')&&!p.qualifiers?.includes('stated-interest');
      return ['clinical-practice','clinical-interest','procedure'].includes(p.type);
    }));
    if(direct.length)return {...base,status:'documented',evidenceIds:direct.slice(0,3).map(p=>p.id),note:'Supported by the recorded text; scope and current activity require qualification.'};
    if(positive.length)return {...base,status:'potential',evidenceIds:positive.slice(0,2).map(p=>p.id),note:'Related evidence is recorded, but it does not directly establish this requirement.'};
    if(matched.some(negativeFor)){const explicit=matched.filter(p=>segments(p.text).some(text=>/\b(?:does not|do not|no experience (?:in|of|with))\b/i.test(text)&&directMatch(requirement,{...p,text,attributes:{}})));return {...base,status:explicit.length?'mismatch':'needs-review',evidenceIds:(explicit.length?explicit:matched.filter(negativeFor)).slice(0,2).map(p=>p.id),note:explicit.length?'The source explicitly states a limitation relevant to this requirement. Confirm the scope and date before a decision.':'The source contains a qualification or negative statement that needs review.'};}
    return {...base,status:'unknown',note:'Not established by the available records; this is not evidence of absence.'};
  });
}
class ExpertSearchEngine{
  constructor({embedQuery=embed,cacheDir=process.env.EXPERT_CACHE_DIR||path.join(__dirname,'.cache'),onProgress=()=>{},semanticThreshold=.4}={}){this.embedQuery=embedQuery;this.cacheDir=cacheDir;this.onProgress=onProgress;this.semanticThreshold=semanticThreshold;this.ready=false;this.status='Preparing expert evidence';}
  progress(status){this.status=status;this.onProgress(status);}
  async init(corpus){
    if(!Array.isArray(corpus?.candidates)||!Array.isArray(corpus?.passages))throw new Error('An audited expert corpus is required');
    this.corpus=corpus;this.candidates=new Map(corpus.candidates.filter(c=>!c.needsIdentityReview&&(c.evidenceIds?.length||corpus.passages.some(p=>p.candidateId===c.id))).map(c=>[c.id,c]));
    this.passages=corpus.passages.filter(p=>p.id&&this.candidates.has(p.candidateId)&&clean(p.text));
    this.byCandidate=new Map();this.passages.forEach(p=>{if(!this.byCandidate.has(p.candidateId))this.byCandidate.set(p.candidateId,[]);this.byCandidate.get(p.candidateId).push(p);});
    this.progress(`Indexing ${this.passages.length} sourced passages`);this.bm25=new BM25Index(this.passages);
    const texts=[...new Set(this.passages.filter(semanticEligible).map(p=>clean(p.text)))].sort((a,b)=>a.length-b.length||a.localeCompare(b));this.textIndices=new Map(texts.map((t,i)=>[t,i]));
    this.fingerprint=createHash('sha256').update(EMBEDDING_MODEL+'\n'+JSON.stringify(texts)).digest('hex');
    const metadataFile=path.join(this.cacheDir||'.','passage-embeddings.meta.json');
    const binaryFile=path.join(this.cacheDir||'.','passage-embeddings.f32'),keysFile=path.join(this.cacheDir||'.','passage-embeddings.keys.json');let cached={},completed=0;
    const keys=texts.map(t=>createHash('sha256').update(t).digest('hex')),prepared=new Uint8Array(texts.length);
    if(this.cacheDir)try{cached=JSON.parse(await fs.readFile(metadataFile,'utf8'));}catch{}
    if(cached.fingerprint===this.fingerprint&&cached.count===texts.length&&Number.isInteger(cached.dimensions)&&cached.dimensions>0&&cached.dimensions<=4096){
      try{const bytes=await fs.readFile(binaryFile);if(bytes.length===texts.length*cached.dimensions*4){this.dimensions=cached.dimensions;this.vectors=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);completed=Math.min(texts.length,cached.completed||0);}}catch{}
    }
    if(!this.vectors&&this.cacheDir&&cached.model===EMBEDDING_MODEL&&Number.isInteger(cached.dimensions)&&cached.dimensions>0&&cached.dimensions<=4096){
      try{const previous=JSON.parse(await fs.readFile(keysFile,'utf8'));if(previous.fingerprint===cached.fingerprint&&previous.keys.length===cached.count){const bytes=await fs.readFile(binaryFile);if(bytes.length===cached.count*cached.dimensions*4){const old=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),indices=new Map(previous.keys.slice(0,cached.completed).map((k,i)=>[k,i]));this.dimensions=cached.dimensions;this.vectors=new Float32Array(texts.length*this.dimensions);let reused=0;keys.forEach((key,i)=>{if(indices.has(key)){const offset=indices.get(key)*this.dimensions;this.vectors.set(old.subarray(offset,offset+this.dimensions),i*this.dimensions);prepared[i]=1;reused++;}});this.progress(`Reusing ${reused}/${texts.length} unchanged semantic passages`);}}}catch{}
    }
    let handle;
    try{
      if(this.cacheDir){await fs.mkdir(this.cacheDir,{recursive:true});await fs.writeFile(keysFile+'.tmp',JSON.stringify({fingerprint:this.fingerprint,keys}));await fs.rename(keysFile+'.tmp',keysFile);handle=await fs.open(binaryFile,completed?'r+':'w+');if(this.vectors&&!completed)await handle.truncate(this.vectors.byteLength);}
      for(let start=completed;start<texts.length;start+=48){
        this.progress(`Preparing semantic evidence ${start}/${texts.length}`);
        const end=Math.min(start+48,texts.length),missing=[];for(let i=start;i<end;i++)if(!prepared[i])missing.push(i);
        const generated=missing.length?await this.embedQuery(missing.map(i=>texts[i])):[];
        if(!Array.isArray(generated)||generated.length!==missing.length||generated.some(v=>!Array.isArray(v)||!v.length||v.some(n=>!Number.isFinite(n))))throw new Error('Invalid passage embeddings');
        if(!this.vectors){this.dimensions=generated[0].length;this.vectors=new Float32Array(texts.length*this.dimensions);if(handle)await handle.truncate(this.vectors.byteLength);}
        if(generated.some(v=>v.length!==this.dimensions))throw new Error('Embedding dimensions changed');
        generated.forEach((v,index)=>this.vectors.set(v,missing[index]*this.dimensions));
        completed=end;
        if(handle){const bytes=Buffer.from(this.vectors.buffer,this.vectors.byteOffset+start*this.dimensions*4,(end-start)*this.dimensions*4);await handle.write(bytes,0,bytes.length,start*this.dimensions*4);if(completed===texts.length||completed%480===0)await fs.writeFile(metadataFile,JSON.stringify({fingerprint:this.fingerprint,model:EMBEDDING_MODEL,corpusVersion:corpus.version,count:texts.length,dimensions:this.dimensions,completed}));}
      }
    }finally{await handle?.close();}
    this.embeddingCount=texts.length;
    this.passageVectorIndices=Int32Array.from(this.passages.map(p=>semanticEligible(p)?this.textIndices.get(clean(p.text))??-1:-1));
    this.ready=true;this.progress('Ready');return this;
  }
  health(){return {ready:this.ready,status:this.status,candidateCount:this.candidates?.size||0,passageCount:this.passages?.length||0,corpusVersion:this.corpus?.version,embeddingModel:EMBEDDING_MODEL,keywordMethod:'BM25 (k1=1.5, b=0.75)'};}
  async search(brief,{documentedOnly=false,retrievalMode='hybrid'}={}){
    if(!this.ready)throw new Error('Expert search is still preparing');
    if(!sufficient(brief))return {results:[],brief,corpusVersion:this.corpus.version,needsClarification:true,diagnostics:{bm25Candidates:0,semanticCandidates:0}};
    if(!['hybrid','bm25','semantic'].includes(retrievalMode))throw new Error('Invalid retrieval mode');
    const anchorRequirements=brief.requirements.filter(r=>['modality','condition','procedure'].includes(r.kind));
    const anchorIds=new Set(anchorRequirements.map(r=>r.id)),contextKinds=new Set(['question','technology','workflow']);
    const plans=new Map();
    for(const requirement of brief.requirements){
      if(['geography','currentPractice','role'].includes(requirement.kind))continue;
      const query=clean(requirementQuery(requirement));if(!query||!tokens(query).length)continue;
      const channel=contextKinds.has(requirement.kind)?'context':anchorIds.has(requirement.id)?'anchor':'supporting';
      const key=channel+'\0'+query;
      if(!plans.has(key))plans.set(key,{query,channel,requirementIds:[],weight:channel==='context'?.25:1});
      plans.get(key).requirementIds.push(requirement.id);
    }
    const queryPlans=[...plans.values()],queries=[...new Set(queryPlans.map(p=>p.query))];
    this.queryVectorCache||=new Map();
    let queryVectors=[];
    if(retrievalMode!=='bm25'){
      const missing=queries.filter(query=>!this.queryVectorCache.has(query));
      if(missing.length){const vectors=await this.embedQuery(missing);missing.forEach((query,index)=>this.queryVectorCache.set(query,vectors[index]));}
      queryVectors=queries.map(query=>this.queryVectorCache.get(query));
      while(this.queryVectorCache.size>128)this.queryVectorCache.delete(this.queryVectorCache.keys().next().value);
    }
    const fused=new Map(),lexicalIds=new Set(),semanticIds=new Set(),anchorSemanticMaximum=new Map(),contextMatches=new Map();
    const evidenceScore=new Map();
    const anchorTokens=new Set(tokens(anchorRequirements.map(requirementQuery).join(' ')));
    queryPlans.forEach(plan=>{
      const {query,channel}=plan,q=queries.indexOf(query);
      const lexical=retrievalMode==='semantic'?[]:this.bm25.search(query);
      const semantic=[];
      if(retrievalMode!=='bm25'&&this.embeddingCount>0){
        const scores=new Float32Array(this.embeddingCount),vector=queryVectors[q];
        if(vector.length!==this.dimensions)throw new Error('Query embedding dimensions changed');
        for(let index=0;index<this.embeddingCount;index++){let score=0;const offset=index*this.dimensions;for(let d=0;d<this.dimensions;d++)score+=vector[d]*this.vectors[offset+d];scores[index]=score;}
        for(let index=0;index<this.passages.length;index++){if(this.passageVectorIndices[index]<0)continue;const score=scores[this.passageVectorIndices[index]];if(score>=this.semanticThreshold)semantic.push({index,score});}
        semantic.sort((a,b)=>b.score-a.score||a.index-b.index);
      }
      const contextTokens=new Set(tokens(query).filter(t=>!anchorTokens.has(t))),lexicalMax=lexical[0]?.score||1;
      // Reuse the BM25 postings instead of retokenizing every retrieved source
      // paragraph for each context query on the full professional corpus.
      const contextOverlap=channel==='context'&&lexical.length?new Uint16Array(this.passages.length):null;
      if(contextOverlap)for(const term of contextTokens){const posting=this.bm25.postings.get(term)||[];for(let i=0;i<posting.length;i+=2)contextOverlap[posting[i]]++;}
      for(const [list,ids,method] of [[lexical,lexicalIds,'bm25'],[semantic,semanticIds,'semantic']]){
        const seen=new Set();for(const hit of list){
          const passage=this.passages[hit.index];ids.add(passage.candidateId);
          evidenceScore.set(passage.id,Math.max(evidenceScore.get(passage.id)||0,hit.score));
          if(channel==='context'){
            // Context is a bounded tie-breaker, not an alternative clinical gate.
            // Exclude metadata and discount lexical overlap that only repeats
            // the already-scored clinical anchor. Keep one strongest passage
            // per unique active context query so long biographies cannot vote.
            if(!semanticEligible(passage))continue;
            const overlap=contextOverlap?.[hit.index]||0;
            const score=method==='bm25'?(hit.score/lexicalMax)*Math.min(1,overlap/Math.min(3,contextTokens.size||1)):Math.max(0,(hit.score-this.semanticThreshold)/(1-this.semanticThreshold));
            if(score<=0)continue;
            if(!contextMatches.has(passage.candidateId))contextMatches.set(passage.candidateId,new Map());
            const matches=contextMatches.get(passage.candidateId),existing=matches.get(query);
            if(!existing||score>existing.score)matches.set(query,{score:Math.min(1,score),weight:plan.weight,passageId:passage.id,requirementIds:plan.requirementIds});
            if(!fused.has(passage.candidateId))fused.set(passage.candidateId,0);
            continue;
          }
          if(seen.has(passage.candidateId))continue;seen.add(passage.candidateId);
          fused.set(passage.candidateId,(fused.get(passage.candidateId)||0)+plan.weight/(60+seen.size));
        }
      }
      if(channel==='anchor')for(const hit of semantic){const id=this.passages[hit.index].candidateId;anchorSemanticMaximum.set(id,Math.max(anchorSemanticMaximum.get(id)||0,hit.score));}
    });
    const results=[];
    for(const [id,rrf]of fused){
      const candidate=this.candidates.get(id),passages=this.byCandidate.get(id)||[],matrix=matrixFor(candidate,passages,brief);
      const support=matrix.filter(r=>r.status==='documented');
      const anchorMatches=matrix.filter(m=>anchorRequirements.some(r=>r.id===m.requirementId)&&['documented','potential'].includes(m.status));
      // A generic research/AI passage alone cannot qualify a clinician for a
      // device-specific clinical use. Strong semantic-only evidence remains a
      // possible lead and is labelled, never claimed as documented expertise.
      if(anchorRequirements.length&&!anchorMatches.length&&(anchorSemanticMaximum.get(id)||0)<.58)continue;
      const essential=matrix.filter(r=>r.importance==='essential'&&!['context','role'].includes(r.status)&&r.kind!=='role');
      const essentialRoles=matrix.filter(r=>r.kind==='role'&&r.importance==='essential');
      if(documentedOnly&&(essential.some(r=>r.status!=='documented')||essentialRoles.length&&!essentialRoles.some(r=>r.status==='documented')))continue;
      const contextualEvidence=[...(contextMatches.get(id)?.values()||[])].sort((a,b)=>b.score-a.score);
      // The matrix remains engagement context. Its cited passage explains the
      // relevance signal but cannot turn an assessment question into a credential.
      for(const m of matrix.filter(m=>m.status==='context')){
        m.evidenceIds=[...new Set(contextualEvidence.filter(hit=>hit.requirementIds.includes(m.requirementId)).map(hit=>hit.passageId))];
        if(m.evidenceIds.length)m.note='Related recorded material may inform this assessment question; it does not establish qualification to perform the assessment.';
      }
      const selectedIds=new Set(matrix.flatMap(m=>m.evidenceIds));
      const evidence=passages.filter(p=>selectedIds.has(p.id)).sort((a,b)=>(evidenceScore.get(b.id)||0)-(evidenceScore.get(a.id)||0));
      // Keep contextual proof within the explanation's bounded evidence window
      // without replacing the strongest clinical support.
      const contextualIds=new Set(contextualEvidence.map(hit=>hit.passageId));
      const primaryAnchorIds=new Set(anchorMatches.map(m=>m.evidenceIds[0]).filter(Boolean)),allAnchorIds=new Set(anchorMatches.flatMap(m=>m.evidenceIds));
      const evidencePriority=p=>primaryAnchorIds.has(p.id)?3:contextualIds.has(p.id)?2:allAnchorIds.has(p.id)?1:0;
      evidence.sort((a,b)=>evidencePriority(b)-evidencePriority(a)||(evidenceScore.get(b.id)||0)-(evidenceScore.get(a.id)||0));
      if(evidence.length<3)for(const p of [...passages].sort((a,b)=>(evidenceScore.get(b.id)||0)-(evidenceScore.get(a.id)||0)).slice(0,3))if(!selectedIds.has(p.id)){evidence.push(p);selectedIds.add(p.id);}
      const gaps=matrix.filter(m=>!['documented','context'].includes(m.status)).map(m=>({requirementId:m.requirementId,label:m.label,status:m.status,importance:m.importance,note:m.note}));
      const questions=gaps.map(g=>({requirementId:g.requirementId,text:questionFor(brief.requirements.find(r=>r.id===g.requirementId))}));
      questions.push({kind:'availability',text:brief.timing?`Are you available ${brief.timing} for this engagement?`:'Are you available and willing to take part in this engagement?'});
      questions.push({kind:'independence',text:brief.manufacturer?`Have you worked with ${brief.manufacturer}, its related organisations, or helped develop the device? Please declare the scope and dates.`:'Have you worked with the manufacturer, its related organisations, or helped develop the device? Please declare the scope and dates.'});
      const relationships=passages.filter(p=>p.type==='relationship').map(p=>({...p,manufacturerMention:!!brief.manufacturer&&p.text.toLowerCase().includes(brief.manufacturer.toLowerCase())}));
      const roleMatches=brief.roles?.filter(role=>{
        if(/practising clinician/i.test(role))return /doctor|consultant|physician|surgeon|radiologist|cardiologist|dermatologist|nurse|dietitian|physiotherap/i.test(candidate.role+' '+candidate.specialty);
        if(/research/i.test(role))return passages.some(p=>['research','trial','publication'].includes(p.type));
        return (candidate.role+' '+candidate.specialty).toLowerCase().includes(role.toLowerCase());
      })||[];
      const reasons=support.filter(m=>!['geography','role'].includes(m.kind)).slice(0,3).map(m=>{
        const requirement=brief.requirements.find(r=>r.id===m.requirementId);
        const owned=passages.filter(p=>m.evidenceIds.includes(p.id)).sort((a,b)=>Number(b.attribution==='verified-source')-Number(a.attribution==='verified-source')||Number(b.type==='clinical-practice')-Number(a.type==='clinical-practice'));
        const fact=owned[0],quoteSupports=fact?.sourceQuote&&directMatch(requirement,{...fact,text:fact.sourceQuote,attributes:{}});
        const reviewedSummary=!!fact?.reviewedParaphrase&&!quoteSupports;
        const sourceText=reviewedSummary?fact.text:fact?.sourceQuote||fact?.text;
        // Imported biographies sometimes join sentences without a space. Find
        // the relevant local clause before truncating, preserving exact wording.
        const sentences=sourceText?segments(sourceText):[];
        const statement=sentences.find(text=>directMatch(requirement,{...fact,text,attributes:{}}))||sourceText||m.note;
        const scopedType=fact?effectiveEvidenceType(requirement,fact):null;
        const label={'clinical-practice':'Recorded practice','clinical-interest':'Listed interest',research:'Recorded research',trial:'Recorded study contribution',procedure:'Listed procedure','professional-background':'Recorded background'}[scopedType]||'Source evidence';
        const quote=statement.length>230?statement.slice(0,230).replace(/\s+\S*$/,'')+'…':statement;
        return {text:reviewedSummary?`Reviewed source summary: ${quote}`:`${label}: “${quote}”`,requirementId:m.requirementId,evidenceIds:fact?[fact.id]:m.evidenceIds,status:'documented'};
      }).filter((reason,index,all)=>all.findIndex(other=>other.text===reason.text)===index);
      if(!reasons.length)reasons.push({text:'Related source passages were retrieved. Direct experience for the assessment question needs confirmation.',evidenceIds:evidence.slice(0,2).map(p=>p.id),status:'potential'});
      const essentialSupport=support.filter(m=>m.importance==='essential'&&m.kind!=='geography').length;
      // Rank the strength and relation of evidence, not the size of a biography
      // or the number of generic terms it contains. Each requirement contributes
      // once, using its strongest passage; duplicate sources cannot add weight.
      const anchors=brief.requirements.filter(r=>['modality','condition','procedure'].includes(r.kind));
      let evidenceFit=0,clinicalFit=0;
      for(const m of matrix){
        if(['context','unknown','mismatch','needs-review'].includes(m.status)||['geography','currentPractice'].includes(m.kind))continue;
        const requirement=brief.requirements.find(r=>r.id===m.requirementId);
        const matching=passages.filter(p=>m.evidenceIds.includes(p.id));
        let strength=0;
        for(const p of matching){
          const related=anchors.some(a=>directMatch(a,p));
          let value=({'clinical-practice':1,'clinical-interest':.38,procedure:.3,research:.7,trial:.7,publication:.55,training:.12,'professional-background':.15})[effectiveEvidenceType(requirement,p)]||.1;
          if(['research','population','setting'].includes(m.kind)&&!related)value*=.2;
          if(m.status==='potential')value*=.4;
          strength=Math.max(strength,value);
        }
        const weight={modality:10,activity:8,procedure:8,condition:5,research:4,setting:3,population:1,role:1,regulatory:2}[m.kind]||1;
        const fit=weight*strength*(m.importance==='preferred'?.5:1);
        evidenceFit+=fit;if(anchorIds.has(m.requirementId))clinicalFit+=fit;
      }
      const contextFit=Math.min(.75,contextualEvidence.reduce((sum,hit)=>sum+hit.score*hit.weight,0));
      const relevance=evidenceFit+rrf*4+contextFit;
      results.push({...candidate,requirementMatrix:matrix,evidence,reasons,gaps,questions,relationships,roleMatches,qualificationStatus:'not-reviewed',relationshipStatus:'not-reviewed',coverage:{documented:support.length,essentialDocumented:essentialSupport,essentialTotal:essential.length},relevance,clinicalRelevance:clinicalFit,contextRelevance:contextFit});
    }
    results.sort((a,b)=>b.clinicalRelevance-a.clinicalRelevance||b.relevance-a.relevance||a.name.localeCompare(b.name));
    results.forEach((r,index)=>r.rank=index+1);
    return {results,brief,corpusVersion:this.corpus.version,diagnostics:{keywordMethod:'BM25 (k1=1.5, b=0.75)',embeddingModel:EMBEDDING_MODEL,fusion:'RRF (k=60) with capped context contribution',retrievalMode,bm25Candidates:lexicalIds.size,semanticCandidates:semanticIds.size,bm25CandidateIds:[...lexicalIds],semanticCandidateIds:[...semanticIds],ranking:results.map(r=>({id:r.id,rank:r.rank,relevance:r.relevance,clinicalRelevance:r.clinicalRelevance,contextRelevance:r.contextRelevance})),mergedCandidates:fused.size,queryCount:queries.length,queryChannels:queryPlans.map(({query,channel,weight,requirementIds})=>({query,channel,weight,requirementIds})),documentedOnly},panel:{requested:brief.panelSize||null,roles:brief.roles||[],note:'Panel size is a recruitment goal; no candidates are added merely to fill it.'}};
  }
}
module.exports={ExpertSearchEngine,SearchEngine:ExpertSearchEngine,BM25Index,tokens,directMatch,matrixFor,requirementQuery,questionFor,semanticEligible};
