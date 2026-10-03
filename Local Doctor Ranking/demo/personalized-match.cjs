const {chooseEvidence} = require('./models.cjs');
const {positiveClinicalText}=require('./clinical-filters.cjs');
const clean=value=>String(value || '').replace(/\s+/g,' ').trim();
const sourceText=fact=>clean(fact?.value || fact?.text).replace(/^(?:Profile lists|Record lists|Specialty):\s*/i,'');
const factKey=text=>sourceText({text}).toLowerCase().replace(/[“”"'’.,;:]+/g,'').replace(/\s+/g,' ').trim();

// Small linguistic equivalences for choosing quoted evidence, not diagnoses or
// retrieval substitutes. In particular, painful periods and period pains are
// the same words expressed as an adjective or a noun phrase.
const wordForms={painful:'pain',pains:'pain',periods:'period',running:'run',runner:'run',runners:'run',injuries:'injury',injures:'injury',sports:'sport'};
const words=value=>(clean(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).map(word=>wordForms[word]||word);
const phraseWords=value=>words(value).filter(word=>!['the','a','an','my','of','in','with','s'].includes(word));
function directTopicSupport(value,topic) {
  const wanted=phraseWords(topic);
  if(!wanted.length)return false;
  const alternatives=[wanted];
  if(wanted.length===2&&wanted.includes('pain')&&wanted.some(word=>['period','knee','hip','shoulder','back','neck','ankle','wrist','elbow','joint','chest'].includes(word))) alternatives.push([...wanted].reverse());
  // Do not bridge separate items such as "painful sex; heavy periods".
  return clean(value).split(/[.;:\n]/).some(clause=>{
    const available=phraseWords(clause);
    return alternatives.some(needle=>available.some((_word,index)=>{
      if(!needle.every((word,offset)=>available[index+offset]===word))return false;
      // "Painful knee replacements" describes the replacements, whereas
      // "investigation of painful knee" directly supports knee pain.
      const next=available[index+needle.length];
      return needle===wanted||!next||['and','or','with'].includes(next);
    }));
  });
}
const contextNoise=new Set(['i','m','ve','am','my','me','a','an','the','and','or','but','with','without','have','has','had','been','be','to','for','of','in','on','at','is','are','was','were','want','would','like','get','back','return','can','could','still','very','not','no','haven','hasn','t','diagnosed','diagnosis','help','helped','work','worked','tried','discuss','specialist','consultant','doctor','care','treatment','previous','months','month','years','year']);
function contextWords(criteria) {
  const topic=new Set(words(criteria.topic));
  return [...new Set(words(positiveClinicalText(criteria.clinicalContext)).filter(word=>!topic.has(word)&&!contextNoise.has(word)&&!/^\d+$/.test(word)))];
}
function contextFactScore(fact,terms) {
  const value=sourceText(fact);
  // A clinical-interest pool must not turn a hobby or administrative use of
  // "running" into evidence about treating a runner.
  if(/\b(?:keen|avid)\s+runner|\benjoy\w*\b[^.;]{0,60}\brunn|\b(?:spare\s+time|outside\s+(?:work|medicine))\b|\brunning\s+(?:our|the)\b[^.;]{0,40}\b(?:meeting|network|service|clinic)\b/i.test(value))return 0;
  const available=new Set(words(value));
  return terms.filter(term=>available.has(term)).length;
}
function alignedEvidence(criteria,generated,clinicalFacts) {
  const pool=deduplicateCitations(clinicalFacts).filter(f=>f&&clean(f.text)&&!/^\s*(?:Specialty:|Practises at\b)/i.test(f.text));
  const direct=criteria.topic?pool.filter(f=>directTopicSupport(sourceText(f),criteria.topic)):[];
  direct.sort((a,b)=>phraseWords(sourceText(a)).length-phraseWords(sourceText(b)).length);
  // With an explicit concern, partial word overlap is not enough to label a
  // fact clinical fit (for example painful sex for painful periods).
  const supported=generated.filter(f=>!criteria.topic||directTopicSupport(sourceText(f),criteria.topic));
  const primary=direct[0]||supported[0]||null;
  const terms=contextWords(criteria);
  const contextKeys=new Set();
  const context=pool.map((fact,index)=>({fact,index,score:contextFactScore(fact,terms)})).filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score||phraseWords(sourceText(a.fact)).length-phraseWords(sourceText(b.fact)).length||sourceText(b.fact).length-sourceText(a.fact).length||a.index-b.index)
    .map(item=>item.fact).filter(f=>{
      const key=phraseWords(sourceText(f)).join(' ');
      if((primary&&factKey(f.text)===factKey(primary.text))||contextKeys.has(key))return false;
      contextKeys.add(key);return true;
    }).slice(0,2);
  return {primary,supported,context,selected:deduplicateCitations([primary,...context,...supported].filter(Boolean)).slice(0,4)};
}

// Audited NHS terminology, 2026-10-01. These are educational definitions,
// never evidence of a named consultant's experience or a treatment recommendation.
const TERMINOLOGY=Object.freeze([
  {key:'laparoscopy',pattern:/\blaparoscop(?:y|ic)\b/i,text:'Terminology only: laparoscopy means keyhole surgery, using small cuts to look inside the abdomen or pelvis.',sourceUrl:'https://www.nhs.uk/tests-and-treatments/laparoscopy/'},
  {key:'endometriosis-excision',pattern:/\bexcis(?:ion|e|ing)\b/i,condition:/\bendometriosis\b/i,text:'Terminology only: excision of endometriosis means surgically removing endometriosis tissue.',sourceUrl:'https://www.uclh.nhs.uk/our-services/find-service/womens-health-1/gynaecology/endometriosis/surgical-treatment-endometriosis'},
  {key:'arthroscopy',pattern:/\barthroscop(?:y|ic)\b/i,text:'Terminology only: arthroscopy is keyhole surgery used to examine or repair a joint through small cuts.',sourceUrl:'https://www.nhs.uk/tests-and-treatments/arthroscopy/'},
]);
function deduplicateCitations(entries=[]) {
  const seen=new Set();
  return entries.filter(e=>{
    if(!e || !clean(e.text)) return false;
    const key=factKey(e.text);
    if(seen.has(key)) return false;
    seen.add(key);return true;
  });
}
function terminologyFor(citations=[]) {
  const facts=citations.filter(c=>c.kind!=='terminology');
  return TERMINOLOGY.flatMap(term=>{
    const appliesTo=facts.filter(c=>term.pattern.test(c.text) && (!term.condition || term.condition.test(c.text))).map(c=>c.id).filter(Boolean);
    return appliesTo.length ? [{id:'term-'+term.key,text:term.text,sourceUrl:term.sourceUrl,criterion:'Plain-English terminology',kind:'terminology',appliesTo}] : [];
  });
}
function stageOf(text) {
  const stage=clean(text).match(/\bstage\s*([1-4]|iv|iii|ii|i)\b/i)?.[1]?.toLowerCase();
  return stage ? ({i:'1',ii:'2',iii:'3',iv:'4'}[stage] || stage) : null;
}
function clinicalContextCaveat(criteria,citations=[]) {
  const stage=stageOf(criteria.clinicalContext);
  if(!stage) return null;
  const topic=clean(criteria.topic).toLowerCase();
  const supported=citations.some(c=>c.kind!=='terminology' && stageOf(c.text)===stage && (!topic || c.text.toLowerCase().includes(topic)));
  return supported ? null : 'You mentioned stage '+stage+', but the profile does not confirm experience with that stage; ask the consultant about this.';
}
function plainClinicalPhrase(text,criteria={}) {
  const value=sourceText({text}).replace(/\b[A-Z]\d{4}\b/g,'').replace(/^\s*[-:()]+\s*/,'').trim();
  const need=clean(criteria.topic);
  // A direct symptom phrase wins over an unrelated diagnosis elsewhere in a
  // long list. Required procedures retain their specific wording/translation.
  if(need&&need.length<=70&&phraseWords(need).length>1&&!criteria.procedures?.length&&directTopicSupport(value,need))return need;
  // Link the technique to the condition only when the source actually does so.
  // A list such as “laparoscopic hysterectomy, endometriosis” does not establish
  // laparoscopic endometriosis surgery.
  if(/\bendometriosis\b/i.test(value)&&(!need||/\bendometriosis\b/i.test(need)||criteria.procedures?.includes('Endometriosis excision'))) {
    if(/\blaparoscopic\s+(?:excision|removal)\s+(?:of\s+)?(?:deep\s+|severe\s+)?endometriosis\b/i.test(value)) return 'keyhole surgery to remove endometriosis tissue';
    if(/\b(?:excision|removal)\s+(?:of\s+)?(?:deep\s+|severe\s+)?endometriosis\b/i.test(value)) return 'surgery to remove endometriosis tissue';
    if(/\blaparoscopic\s+(?:(?:surgery|treatment)\s+(?:for|of)\s+)?endometriosis\b/i.test(value)) return 'keyhole surgery for endometriosis';
    return 'endometriosis';
  }
  const joint=value.match(/\b(knee|hip|shoulder|ankle|elbow|wrist)\b/i)?.[1]?.toLowerCase();
  if(joint && /\barthroscop(?:y|ic)\b/i.test(value)) return 'keyhole procedures involving the '+joint;
  if(joint && /\breplacement\b/i.test(value)) return joint+' replacement';
  if(need && need.length<=70 && value.toLowerCase().includes(need.toLowerCase())) return need;
  const readable=value.replace(/\s*(?:\+\/-|±).*$/,'').replace(/\([^)]*\)/g,'').replace(/[“”"]/g,'').trim().replace(/[.。]$/,'');
  return readable.length<=120 && !/[+/=]|\b(?:ureterolysis|adhesiolysis|arthroplasty)\b/i.test(readable) ? readable : '';
}
function consultantIdentity(record={}) {
  const name=clean(record.name).slice(0,160);
  const specialty=clean(Array.isArray(record.specialty)?record.specialty.join(', '):record.specialty).slice(0,200);
  return {name,specialty};
}
function patientSummary({consultant={},criteria={},citations=[],caveats=[]}={}) {
  const profile=citations.filter(c=>c.kind!=='terminology');
  const primary=profile.find(c=>!['Location','Specialty','Consultant identity','Gender','Language',criteria.insurance].filter(Boolean).includes(c.criterion));
  const phrase=primary ? plainClinicalPhrase(primary.text,criteria) : '';
  const name=clean(consultant.name).length<=100 ? clean(consultant.name) || 'This consultant' : 'This consultant';
  const specialty=clean(consultant.specialty).length<=120 ? clean(consultant.specialty) : '';
  const role=specialty ? (/^consultant\b/i.test(specialty) ? 'a '+specialty.toLowerCase() : 'a specialist in '+specialty.toLowerCase()) : null;
  const sentences=[];
  if(phrase) sentences.push(name+(role?' is '+role+' whose profile includes ':' has a profile that includes ')+phrase+'.');
  else sentences.push(name+(role?' is '+role+'.':' has limited linked clinical information in this directory.'));
  if(phrase) {
    const need=clean(criteria.topic || criteria.procedures?.join(' and ') || criteria.specialty);
    const relevance=need && need.length<=70 ? 'your interest in '+need.toLowerCase()+' care' : 'the clinical interests you described';
    sentences.push('That connects with '+relevance+' and gives you a specific area of practice to discuss, without assuming which treatment would be right for you.');
  }
  const location=profile.find(c=>c.criterion==='Location');
  const place=location?.text.match(/^(.+?) is approximately (\d+(?:\.\d+)?) miles from (.+?) by straight line\.?$/i);
  if(place) sentences.push('The nearest listed Spire practice'+(place[1].length<=90?' is '+place[1]+',':' is')+' about '+place[2]+' miles from '+place[3]+' in a straight line.');
  const insurance=criteria.insurance && profile.find(c=>c.criterion===criteria.insurance);
  if(insurance) {
    let clause=criteria.insurance+' lists this consultant';
    if(/not fee assured/i.test(insurance.text)) clause+=', but they are not fee assured, so some fees may exceed your cover';
    else if(/not in (?:the |bupa.s )?open referral/i.test(insurance.text)) clause+=', but they are not in its Open Referral network';
    else clause+='; confirm your policy and procedure are covered before booking';
    sentences.push(clause+'.');
  }
  const contextCaveat=clinicalContextCaveat(criteria,profile);
  if(contextCaveat) sentences.push(contextCaveat);
  if(!phrase) sentences.push('Check the full profile and ask whether their practice covers your needs before arranging an appointment.');
  // Drop only a complete, generic bridge sentence when substantial practical
  // information needs the space. Never clip a clinical claim or qualification.
  if(sentences.length>4 || sentences.join(' ').length>800) {
    const bridge=sentences.findIndex(s=>s.startsWith('That connects with'));
    if(bridge>=0) sentences.splice(bridge,1);
  }
  if(sentences.join(' ').length>800) {
    const locationSentence=sentences.findIndex(s=>s.startsWith('The nearest listed Spire practice'));
    if(locationSentence>=0) sentences.splice(locationSentence,1);
  }
  return sentences.join(' ');
}

async function createPersonalizedMatch(record,criteria,{distance,facts=[],clinicalFacts=facts,clinicalMatch={evidence:[]},selectEvidence=chooseEvidence}={}) {
  const request={clinicalNeed:criteria.topic || null,specialty:criteria.specialty || null,procedures:criteria.procedures || [],
    location:criteria.location || null,insurer:criteria.insurance || null,radiusMiles:criteria.radiusMiles || null,
    nearestFirst:!!criteria.sortByDistance,language:criteria.language || null,gender:criteria.gender || null,
    clinicalContext:criteria.clinicalContext || null,contextIsUserProvided:true};
  let generated;
  try {generated=await selectEvidence(JSON.stringify(request),facts);}
  catch {generated={selected:facts.slice(0,1),mode:'extractive-fallback'};}
  const generatedSelection=(Array.isArray(generated?.selected)?generated.selected:[]).map(f=>facts.find(original=>original.text===f.text&&original.sourceUrl===f.sourceUrl)).filter(Boolean).slice(0,2);
  const alignment=alignedEvidence(criteria,generatedSelection,clinicalFacts);
  const selected=alignment.selected;
  const validSelection=alignment.supported.length>0;
  const mode=validSelection && /^(local|openai)-constrained-rag$/.test(generated?.mode) ? generated.mode : 'extractive-fallback';
  const evidenceUrl=record.evidenceUrl || record.profileUrl;
  const clinicalEvidence=clinicalMatch.evidence || [];
  const procedures=clinicalEvidence.filter(e=>e.kind==='procedure');
  const specialty=clinicalEvidence.find(e=>e.kind==='specialty');
  const insurance=criteria.insurance ? (record.insuranceEvidence || []).find(e=>e.insurer.toLowerCase()===criteria.insurance.toLowerCase()) : null;
  const entries=[];
  const add=(e,criterion)=>{if(e && clean(e.text)) entries.push({text:clean(e.text),sourceUrl:e.sourceUrl || evidenceUrl,criterion});};
  const primary=procedures[0] || alignment.primary || specialty;
  add(primary,procedures[0]?.criterion || criteria.topic || 'Clinical fit');
  add(insurance,criteria.insurance);
  if(distance && criteria.location) add({text:distance.location.name+' is approximately '+distance.miles.toFixed(1)+' miles from '+criteria.location+' by straight line.',sourceUrl:evidenceUrl},'Location');
  for(const evidence of procedures.slice(1)) add(evidence,evidence.criterion);
  if(specialty) add(specialty,'Specialty');
  else if(!primary&&!alignment.context.length&&clean(record.specialty)) {
    // A broader semantic match may lack a directly supported symptom phrase.
    // Cite its recorded role, without turning that role into an exact-fit claim.
    add({text:'Recorded specialty: '+clean(record.specialty),sourceUrl:record.fieldProvenance?.specialty?.find(e=>e.sourceUrl)?.sourceUrl||evidenceUrl},'Specialty');
  }
  for(const evidence of alignment.context) add(evidence,'Relevant patient context');
  for(const evidence of selected) add(evidence,'Relevant practice');
  if(criteria.language) add({text:'The record lists '+(record.languages || []).filter(l=>l.toLowerCase().startsWith(criteria.language.toLowerCase())).join(', ')+'.',sourceUrl:evidenceUrl},'Language');
  if(criteria.gender) add({text:"The record lists the consultant's gender as "+record.gender+'.',sourceUrl:evidenceUrl},'Gender');
  const citations=deduplicateCitations(entries).map((e,i)=>({...e,id:'e'+(i+1)}));
  const glossary=terminologyFor(citations);
  const caveats=[];
  if(insurance && /not fee assured|not in (?:the |bupa.s )?open referral|exceed cover|shortfall/i.test(insurance.text)) caveats.push(insurance.text);
  if(procedures.length) caveats.push('Procedure evidence describes the recorded practice; current availability at your chosen Spire site still needs confirmation.');
  const contextCaveat=clinicalContextCaveat(criteria,citations);if(contextCaveat) caveats.push(contextCaveat);
  const summary=patientSummary({consultant:consultantIdentity(record),criteria,citations,caveats});
  return {personalizedMatch:{summary,citations:[...citations,...glossary],caveats,provider:mode==='openai-constrained-rag'?'openai':mode==='local-constrained-rag'?'local-ai':'extractive'},generationMode:mode,selected};
}
module.exports={createPersonalizedMatch,consultantIdentity,deduplicateCitations,terminologyFor,clinicalContextCaveat,stageOf,plainClinicalPhrase,patientSummary};
