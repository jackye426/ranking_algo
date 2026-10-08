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
  if(r.kind==='role')return {Cardiologist:'cardiologist cardiology',Radiologist:'radiologist radiology',Dermatologist:'dermatologist dermatology','General practitioner':'general practitioner family medicine GP'}[r.label]||r.text||r.label;
  return alternatives[r.label]||r.text||r.label;
}
// Broad discovery uses related modalities as alternatives, not as additional
// qualifications. These are retrieval aids only; the active brief stays intact.
const IMAGING_EXPANSIONS={
  'Medical imaging':['radiology','diagnostic imaging','CT computed tomography','MRI magnetic resonance imaging','echocardiography echocardiogram ultrasound','nuclear imaging PET SPECT','dermoscopy'],
  'Cardiovascular imaging':['cardiac imaging','cardiac CT coronary computed tomography CCTA','cardiac MRI magnetic resonance CMR','echocardiography echocardiogram stress echo','cardiac nuclear imaging myocardial perfusion']
};
function requirementQueries(r){
  const primary=clean(requirementQuery(r)),terms=r.kind==='modality'?IMAGING_EXPANSIONS[r.label]:null;
  return [{query:primary,expanded:false},...(terms?[{query:terms.join(' '),expanded:true,terms}]:[])];
}
// Exact metadata still participates in BM25 and structured requirement checks.
// It should not spend vector capacity on registration/address/degree strings.
function semanticEligible(p){if(p.type==='location'||p.qualifiers?.includes('publication-listing-link-not-authorship'))return false;if(p.type!=='professional-background')return true;if(/^(?:qualifications|detailed_qualifications)$/.test(p.field))return p.text.length>=100||Object.values(p.attributes||{}).some(values=>values.length>0);return !/^(?:specialty|specialty_alternatives|specialties|professional_memberships|nhs_posts|nhs_base|registration|locations)$/.test(p.field);}
function negative(text){return /\b(?:does not|do not|doesn['’]t|don['’]t|not currently|no longer|no experience|without experience|never)\b/i.test(text);}
// Imported biographies sometimes lose sentence spaces and bullet separators.
// Recover only literal boundaries before deciding which activity a topic
// belongs to; otherwise CT training can borrow an unrelated research verb.
const segments=text=>activityClauses(text).flatMap(part=>part.split(/[•●]|(?<=[.!?])(?=(?:I|He|She|His|Her|My|Our|The|Their|Research|Whether|Clinical|Professional|In|After|Since|This|Dr|Mr|Professor)\b)/)).map(part=>part.trim()).filter(Boolean);
const evidenceStrength=p=>({'clinical-practice':6,research:5,trial:5,publication:4,'clinical-interest':3,procedure:2,training:1})[p.type]||0;
const researchAttributed=p=>!p.qualifiers?.some(q=>/publication-listing-link-not-authorship|bibliographic-reference-not-training-or-authorship/i.test(q))&&classifyPassage(p.text,'about')==='research';
const explicitResearchDescription=text=>!negative(text)&&/\b(?:my|his|her|our)\s+(?:field|area|focus|topic)\s+of\s+research\s+(?:was|is|has been)\s+(?:the\s+)?(?:investigation|investigating|evaluation|evaluating|examination|examining|study|studying)\b/i.test(text);
// This exception is for optional source presentation only. Do not feed it into
// matrix qualification or ranking: imported interests keep their original type.
const optionalResearchAttributed=p=>!negative(p.text)&&!/\b(?:did not|was not|were not)\s+(?:participat|contribut|author|research)\w*/i.test(p.text)&&(researchAttributed(p)||(p.type==='clinical-interest'&&explicitResearchDescription(p.text)));
function intentEvidenceStrength(requirement,p){
  if(requirement.matchIntent==='interest')return ({'clinical-interest':6,'clinical-practice':5.8,research:5.2,trial:5.2,publication:4.8,procedure:3,training:1})[p.type]||0;
  if(requirement.matchIntent==='research')return ({research:6,trial:6,publication:5.8,'clinical-interest':/\bresearch|stud(?:y|ies)|trials?\b/i.test(p.text)?4:1,'clinical-practice':1,training:.5})[p.type]||0;
  return evidenceStrength(p);
}
// Source-only analysis is reused across requirements and refinements. Keep
// just compact clause descriptors, never query-specific support decisions or
// copied evidence objects. Weak keys release old corpora, and relevant source
// corrections invalidate both the original and literal-quote descriptors.
const clauseCache=new WeakMap();
function baseScopes(passage,source=passage.text){
  let cached=clauseCache.get(passage);
  if(!cached||cached.text!==passage.text||cached.quote!==passage.sourceQuote||cached.field!==passage.field||cached.type!==passage.type||cached.attribution!==passage.attribution){
    cached={text:passage.text,quote:passage.sourceQuote,field:passage.field,type:passage.type,attribution:passage.attribution,main:null,literal:null};
    clauseCache.set(passage,cached);
  }
  const slot=source===passage.text?'main':source===passage.sourceQuote?'literal':null;
  if(slot&&cached[slot])return cached[slot];
  const reviewedResearch=passage.attribution==='verified-source'&&passage.reviewedParaphrase&&['research','trial','publication'].includes(passage.type)&&source===passage.text;
  const clauses=reviewedResearch?[source]:segments(source);
  const descriptors=clauses.map(text=>{
    let type=passage.type;
    if(type==='clinical-practice'){
      const localType=classifyPassage(text,passage.field||'about');
      // A mixed imported paragraph can have an overly broad parent type. A
      // qualification never inherits clinical strength from a different clause.
      // Reviewed summaries keep their deliberately reviewed type unless the
      // matching clause explicitly describes training or interest.
      if(['training','clinical-interest'].includes(localType)||(clauses.length>1&&passage.attribution!=='verified-source'))type=localType;
    }
    if(['research','trial','publication'].includes(type)&&clauses.length>1&&passage.attribution!=='verified-source')type=classifyPassage(text,'about');
    return {text,type};
  });
  if(slot)cached[slot]=descriptors;
  return descriptors;
}
function requirementScopes(requirement,passage,source=passage.text){
  return baseScopes(passage,source).map(({text,type})=>{
    // Explicitly listed interest is not evidence of performing an activity,
    // even if an older imported passage has a broad clinical-practice label.
    if(requirement.kind==='activity'&&/\b(?:interests?\s+(?:includes?|is|are|in|to)|interested\s+in)\b/i.test(text))type='clinical-interest';
    return {...passage,text,type,attributes:{}};
  }).filter(p=>directMatch(requirement,p));
}
function effectiveEvidenceType(requirement,passage){return requirementScopes(requirement,passage).sort((a,b)=>intentEvidenceStrength(requirement,b)-intentEvidenceStrength(requirement,a))[0]?.type||passage.type;}
// An explicit adult/paediatric clinical role can scope a separately recorded
// modality in the SAME source. This relates two positive professional claims;
// it never derives a population from a specialty alone or unrelated practice.
const clinicalDomains=[
  [/\b(?:cardiolog\w*|cardiovascular)\b/i,/\b(?:cardiac|coronary|heart|cardiovascular)\b/i],
  [/\b(?:dermatolog\w*|skin)\b/i,/\b(?:skin|dermoscop\w*|melanoma)\b/i],
  [/\b(?:respiratory|pulmonolog\w*)\b/i,/\b(?:lung|respiratory|pulmonary|bronchoscop\w*)\b/i],
  [/\b(?:neurolog\w*|neurosurg\w*)\b/i,/\b(?:brain|neurolog\w*|epilepsy|stroke)\b/i],
  [/\b(?:ophthalmolog\w*|ophthalmic)\b/i,/\b(?:eye|retina\w*|cataract|ophthalm\w*)\b/i],
  [/\b(?:gastroenterolog\w*)\b/i,/\b(?:gastro\w*|bowel|colonoscopy|gastroscopy)\b/i]
];
function populationDomainRelation(requirement,scope,parent,passages,brief){
  if(requirement.kind!=='population'||scope.type!=='clinical-practice'||!parent.sourceRecordId||negative(scope.text))return false;
  const domains=clinicalDomains.filter(([clinical])=>clinical.test(scope.text));
  if(!domains.length)return false;
  const related=brief.requirements.filter(r=>['modality','condition','procedure'].includes(r.kind)&&domains.some(([,anchor])=>anchor.test(r.label||r.text||'')));
  const anchors=related.some(r=>r.kind==='modality')?related.filter(r=>r.kind==='modality'):related;
  if(!anchors.length)return false;
  const supported=passages.filter(p=>p.sourceRecordId===parent.sourceRecordId&&p.candidateId===parent.candidateId).flatMap(p=>anchors.flatMap(a=>requirementScopes(a,p))).filter(p=>p.type==='clinical-practice'&&!negative(p.text));
  // A source that limits this modality to another population must not inherit
  // the broad professional role's population (e.g. adult clinician, child CT).
  const populations=CONCEPTS.filter(([kind])=>kind==='population');
  const hasOtherPopulation=p=>populations.some(([kind,label,re])=>label!==requirement.label&&re.test(p.text))&&!directMatch(requirement,p);
  return supported.length>0&&!supported.some(hasOtherPopulation);
}
function populationModalityConflict(requirement,parent,passages,brief){
  if(requirement.kind!=='population'||!parent.sourceRecordId)return false;
  const populations=CONCEPTS.filter(([kind])=>kind==='population');
  return brief.requirements.filter(r=>r.kind==='modality').some(modality=>{
    const scopes=passages.filter(p=>p.candidateId===parent.candidateId&&p.sourceRecordId===parent.sourceRecordId).flatMap(p=>requirementScopes(modality,p)).filter(p=>p.type==='clinical-practice'&&!negative(p.text));
    if(scopes.some(p=>directMatch(requirement,p)))return false;
    return scopes.some(p=>populations.some(([kind,label,re])=>label!==requirement.label&&re.test(p.text)));
  });
}
function rolePattern(label){
  const known={Radiologist:/\bradiolog(?:ists?|y)\b/i,Cardiologist:/\bcardiolog(?:ists?|y)\b/i,Dermatologist:/\bdermatolog(?:ists?|y)\b/i,'General practitioner':/\b(?:general practi(?:tioners?|ce)|family (?:medicine|physicians?)|GPs?)\b/i,'Clinical researcher':/\b(?:clinical researchers?|research specialists?)\b/i}[label];
  if(known)return known;
  const words=clean(label).split(/\s+/).filter(Boolean);if(!words.length)return null;
  // Unknown but explicitly supplied professional roles get the same identity
  // predicate checks as known roles. Escape input and allow noun plurals only;
  // a collaborator's job title is not the profile owner's credential.
  words[words.length-1]=words.at(-1).replace(/s$/i,'');
  return new RegExp('\\b'+words.map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+')+'s?\\b','i');
}
function explicitRole(requirement,passage){
  const pattern=rolePattern(requirement.label);if(!pattern)return false;
  const match=pattern.exec(passage.text);if(!match||negative(passage.text))return false;
  if(/^(?:specialt|professional_role|role$|registration)/.test(passage.field||''))return true;
  // GP referrals, teaching radiologists and working with a dermatologist do not
  // establish the profile owner's role. Keep generic mentions as potential.
  return /\b(?:I am|he is|she is|works? as|practi[cs](?:e|es) as|(?:my|his|her|their) (?:professional )?role is|(?:Dr\.?|Mr\.?|Ms\.?|Professor)\s+[\p{L}’'-]+(?:\s+[\p{L}’'-]+){0,2}\s+is|consultant)\s+(?:(?:an?|consultant|general|adult|paediatric|pediatric|clinical|practising|practicing|senior|registered|chartered|licensed)\s+){0,5}$/iu.test(passage.text.slice(0,match.index));
}
function interpretationSupportsModality(modality,scope){
  for(const match of scope.text.matchAll(/\b(?:report(?:s|ed|ing)?|interpret(?:s|ed|ing)?|read(?:s|ing)?)\b([^.;:\n]{0,160})/gi)){
    // A second predicate does not belong to the reporting verb's object. Keep
    // coordinated objects ("MRI and cardiac CT"), not a separate CT interest.
    const object=match[1].split(/\b(?:and|but|whereas|however)\b(?=[^.;:\n]{0,70}\b(?:is|are|was|were|has|have|develop\w*|interest\w*|train\w*|teach\w*|refer\w*)\b)/i)[0];
    if(directMatch(modality,{...scope,text:object,attributes:{}}))return true;
  }
  return false;
}
function activityRelevant(requirement,scope,brief){
  if(requirement.kind!=='activity'||requirement.label!=='Image interpretation')return true;
  const modalities=brief.requirements.filter(r=>r.kind==='modality');
  return !modalities.length||modalities.some(a=>interpretationSupportsModality(a,scope));
}
function supportingSpan(requirement,passage,status,brief={requirements:[]}){
  const literal=passage.sourceQuote||passage.text;
  const literalSupports=!!passage.sourceQuote&&directMatch(requirement,{...passage,text:passage.sourceQuote,attributes:{}})&&(!(passage.reviewedParaphrase&&['interest','research'].includes(requirement.matchIntent)&&['research','trial','publication'].includes(passage.type))||researchAttributed({...passage,text:passage.sourceQuote}));
  const reviewedSummary=!!passage.reviewedParaphrase&&!literalSupports;
  const source=reviewedSummary?passage.text:literal;
  // Some imported biographies concatenate list tails with a new first-person
  // clinical sentence ("cholesterol levelsHe also offers CT..."). Split only
  // at an explicit pronoun + clinical verb, or a punctuated pronoun start.
  // This is excerpt selection only: no stored text or ranking scope changes.
  const joinedStart=/(?<=[a-z0-9)])(?=(?:He|She|I)\s+(?:(?:also|currently|routinely|regularly|personally|now)\s+)*(?:(?:can|does not|do not|doesn['’]t|don['’]t)\s+)?(?:offers?|performs?|reports?|interprets?|treats?|manages?|provides?|runs?)\b)|(?<=[.!?])(?=(?:He|She|I|His|Her|My)\s)/g;
  const sourceSegments=baseScopes(passage,source).flatMap(({text})=>text.split(joinedStart).flatMap(part=>{
    // Imported interest fields often contain one long semicolon list. Selecting
    // the matching list entry keeps the relevant modality visible on a card.
    // Preserve qualified/negative clauses whole so a shortened quote cannot
    // lose the scope of "does not" or turn an interest into an activity.
    const listField=passage.type==='clinical-interest'||/clinical_interests|areas_of_interest|procedures/i.test(passage.field||'');
    return listField&&!negative(part)&&['modality','condition','procedure'].includes(requirement.kind)?part.split(/;|\n|(?<=[a-z0-9)])(?=(?:Cardiac|Coronary|Cardiovascular|Echocardiogra\w*|Dermoscopy|MRI|CT)\b)/):[part];
  }).map(part=>part.trim()).filter(Boolean));
  const matches=sourceSegments.filter(text=>directMatch(requirement,{...passage,text,attributes:{}})&&(!(status==='documented'&&requirement.kind==='activity')||activityRelevant(requirement,{...passage,text},brief)));
  const sourceScopes=requirementScopes(requirement,passage,source);
  matches.sort((a,b)=>{
    const localStrength=text=>{const original=sourceScopes.filter(p=>p.text===text);return original.length?Math.max(0,...original.map(p=>intentEvidenceStrength(requirement,p))):intentEvidenceStrength(requirement,{text,type:classifyPassage(text,passage.field||'about')});};
    const incomplete=text=>/\b(?:including|such as|with|and)\s*:?[\s]*$/i.test(text);
    return Number(incomplete(a))-Number(incomplete(b))||localStrength(b)-localStrength(a)||(passage.type==='clinical-interest'?Number(a.length>230)-Number(b.length>230):0);
  });
  const matching=reviewedSummary?source:matches.find(text=>status==='mismatch'?negative(text):!negative(text))||matches[0]||source;
  // Clauses are selected, never rewritten. If segmentation ever normalizes a
  // source in a way that is not a literal substring, retain the complete text.
  const text=source.includes(matching)?matching:source;
  // Some historical research is imported under an interests field. This exact
  // self-attributed investigation wording warrants a research display label;
  // retain the original passage type and ranking so this is not a new claim of
  // current activity, a particular investigator role, or clinical practice.
  const scopedType=effectiveEvidenceType(requirement,passage),describedResearch=scopedType==='clinical-interest'&&explicitResearchDescription(text);
  const evidenceType=describedResearch?'research':scopedType,researchContext=['research','trial','publication'].includes(evidenceType)&&!describedResearch&&!researchAttributed({...passage,text});
  return {evidenceId:passage.id,text,kind:reviewedSummary?'reviewed-summary':'source-quote',evidenceType,...(researchContext?{evidenceScope:'research-context'}:{}),sourceQuote:passage.sourceQuote||null,sourceQuoteSupportsRequirement:literalSupports,limits:[...(passage.review?.limitations||[])],sourceDate:passage.dates?.sourceDate||null};
}
function deviceAssessment(text){return /\b(?:medical[- ]device|notified body|technical documentation|clinical evaluation reports?|\bMDR\b)\b/i.test(text)&&/\b(?:assess(?:ed|es|ing)|evaluat(?:ed|es|ing)|review(?:ed|s|ing)|(?:clinical|regulatory)\s+(?:assessor|evaluator|reviewer))\b/i.test(text);}
function directMatch(requirement,passage){
  const text=passage.text||'',label=requirement.label||requirement.text;
  if(requirement.kind==='activity'&&label==='Implanted cardiac device monitoring'){
    const pattern=CONCEPTS.find(([kind,name])=>kind==='activity'&&name===label)[2];
    // Monitoring one condition cannot borrow an unrelated implant procedure
    // from a second predicate in the same biography.
    return activityClauses(text).flatMap(clause=>clause.split(/\band\s+(?=(?:(?:I|we|he|she|they)\s+)?(?:(?:also|currently)\s+)?(?:implant\w*|perform\w*|offer\w*|provid\w*|treat\w*|ha(?:s|ve)|(?:am|is|are)\s+interested)\b)/i)).some(clause=>pattern.test(clause));
  }
  if(requirement.kind==='modality'&&label==='Medical imaging')return /\b(?:radiolog\w*|(?:medical|diagnostic|cardiac|cardiovascular|coronary|heart|non[- ]invasive|cross[- ]sectional) imag(?:ing|es?)|CT|CCTA|computed tomography|MRI|CMR|magnetic resonance|echocardiogra(?:ph|m)\w*|(?:stress|transoesophageal|transthoracic) echo|ultrasound|nuclear (?:medicine|imaging)|PET|SPECT|dermoscop\w*|mammograph\w*)\b/i.test(text.replace(/\bultrasound\s+phacoemulsification\b|\bhigh[- ]intensity focused ultrasound\b|\btherapeutic ultrasound\b|\bHIFU\b/gi,''));
  if(requirement.kind==='modality'&&label==='Cardiovascular imaging')return /\b(?:(?:cardiac|cardiovascular|heart|coronary)\s+(?:imag\w*|CT|MRI|magnetic resonance|computed tomography|nuclear|ultrasound)|CCTA|CMR|echocardiogra(?:ph|m)\w*|(?:stress|transoesophageal|transthoracic) echo|myocardial perfusion)\b/i.test(text)||!!CONCEPTS.find(([kind,name])=>kind==='modality'&&name==='Cardiac CT')?.[2].test(text);
  if(requirement.kind==='modality'&&label==='Ultrasound'){
    // Ultrasound energy used for treatment is not diagnostic imaging expertise.
    // Keep the full source in retrieval; scope only this requirement assertion.
    const diagnosticText=text.replace(/\bultrasound\s+phacoemulsification\b|\bhigh[- ]intensity focused ultrasound\b|\btherapeutic ultrasound\b|\bHIFU\b/gi,'');
    return /\b(?:ultrasound|echocardiograph\w*)\b/i.test(diagnosticText);
  }
  if(requirement.kind==='research'&&label==='Clinical research')return ['research','trial','publication'].includes(passage.type)&&/\b(?:research|trials?|stud(?:y|ies)|investigator|coauthor|authored|publications?)\b/i.test(text)&&!passage.qualifiers?.includes('publication-listing-link-not-authorship');
  if(requirement.kind==='regulatory'&&deviceAssessment(text))return true;
  if(requirement.kind==='role'&&rolePattern(label)?.test(text))return true;
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
  passages=passages.filter(p=>p.candidateId===candidate.id);
  return brief.requirements.map(requirement=>{
    const base={requirementId:requirement.id,label:requirement.label,kind:requirement.kind,importance:requirement.importance,...(requirement.matchIntent?{matchIntent:requirement.matchIntent}:{}),...(requirement.polarity?{polarity:requirement.polarity}:{}),...(requirement.strictRole?{strictRole:true}:{}),evidenceIds:[]};
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
    const strength=p=>Math.max(0,...scopes(p).map(scope=>intentEvidenceStrength(requirement,scope)));
    const matched=passages.filter(p=>p.type!=='location'&&directMatch(requirement,p)).sort((a,b)=>strength(b)-strength(a));
    const negativeFor=p=>{const related=scopes(p);return related.length>0&&related.every(s=>negative(s.text));};
    const positive=matched.filter(p=>!negativeFor(p)&&!(p.qualifiers||[]).some(q=>/colleague|uncertain-identity/i.test(q)));
    const direct=positive.filter(parent=>scopes(parent).filter(p=>!negative(p.text)).some(p=>{
      if(['population','setting'].includes(requirement.kind)){
        if(populationModalityConflict(requirement,parent,passages,brief))return false;
        const anchors=brief.requirements.filter(r=>['modality','condition','procedure'].includes(r.kind));
        if(anchors.length&&!segments(p.text).some(text=>directMatch(requirement,{...p,text,attributes:{}})&&anchors.some(a=>directMatch(a,{...p,text,attributes:{}})))&&!populationDomainRelation(requirement,p,parent,passages,brief))return false;
      }
      if(requirement.kind==='regulatory')return ['clinical-practice','research','relationship','professional-background'].includes(p.type)&&!p.qualifiers?.some(q=>/interest|training/.test(q))&&deviceAssessment(p.text);
      if(requirement.kind==='research'){
        if(!['research','trial','publication'].includes(p.type)||/(?:interest in research|hopes to|plans to)/i.test(p.text))return false;
        if(requirement.label==='Diagnostic study evaluation')return /\b(?:evaluat(?:ed|es|ing)|apprais(?:ed|es|ing)|validat(?:ed|es|ing)|(?:principal|chief) investigator|led (?:the |a )?(?:diagnostic|validation) study)\b/i.test(p.text)&&!p.review?.limitations?.some(x=>/not a specific investigator task|not.*appraisal/i.test(x));
        return true;
      }
      if(requirement.kind==='role')return /professional-background|registration|clinical-practice/.test(p.type)&&explicitRole(requirement,p);
      if(requirement.kind==='activity'){
        if(!activityRelevant(requirement,p,brief))return false;
        return p.type==='clinical-practice'&&!p.qualifiers?.includes('historical')&&!p.qualifiers?.includes('stated-interest');
      }
      if(requirement.matchIntent==='activity')return p.type==='clinical-practice'&&!p.qualifiers?.includes('historical')&&!p.qualifiers?.includes('stated-interest');
      if(requirement.matchIntent==='research')return (['research','trial','publication'].includes(p.type)&&researchAttributed(p))||(p.type==='clinical-interest'&&/\b(?:research|stud(?:y|ies)|trials?)\b/i.test(p.text));
      if(requirement.matchIntent==='interest')return ['clinical-practice','clinical-interest','procedure'].includes(p.type)||(['research','trial','publication'].includes(p.type)&&researchAttributed(p));
      return ['clinical-practice','clinical-interest','procedure'].includes(p.type);
    }));
    if(direct.length)return {...base,status:'documented',evidenceIds:direct.slice(0,3).map(p=>p.id),note:'Supported by the recorded text; scope and current activity require qualification.'};
    if(positive.length)return {...base,status:'potential',evidenceIds:positive.slice(0,2).map(p=>p.id),note:'Related evidence is recorded, but it does not directly establish this requirement.'};
    if(matched.some(negativeFor)){const explicit=matched.filter(p=>segments(p.text).some(text=>/\b(?:does not|do not|no experience (?:in|of|with))\b/i.test(text)&&directMatch(requirement,{...p,text,attributes:{}})));return {...base,status:explicit.length?'mismatch':'needs-review',evidenceIds:(explicit.length?explicit:matched.filter(negativeFor)).slice(0,2).map(p=>p.id),note:explicit.length?'The source explicitly states a limitation relevant to this requirement. Confirm the scope and date before a decision.':'The source contains a qualification or negative statement that needs review.'};}
    return {...base,status:'unknown',note:'Not established by the available records; this is not evidence of absence.'};
  }).map(row=>({...row,supportingEvidence:row.evidenceIds.map(id=>passages.find(p=>p.id===id)).filter(Boolean).map(p=>supportingSpan(brief.requirements.find(r=>r.id===row.requirementId),p,row.status,brief))}));
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
      if(['geography','currentPractice'].includes(requirement.kind)||requirement.polarity==='exclude')continue;
      // Role text adds a useful retrieval path only when it is the search's
      // population. Broad generic role hits cannot swamp a clinical query.
      if(requirement.kind==='role'&&anchorRequirements.length)continue;
      const variants=requirementQueries(requirement);
      for(const variant of variants){
        let query=variant.query;
        if(contextKinds.has(requirement.kind))for(const excluded of brief.requirements.filter(r=>r.kind==='role'&&r.polarity==='exclude')){const pattern=rolePattern(excluded.label);if(pattern)query=query.replace(new RegExp(pattern.source,'gi'),' ');}
        query=clean(query);if(!query||!tokens(query).length)continue;
        const channel=contextKinds.has(requirement.kind)?'context':anchorIds.has(requirement.id)?'anchor':requirement.kind==='role'?'role':'supporting';
        const key=channel+'\0'+query;
        if(!plans.has(key))plans.set(key,{query,channel,requirementIds:[],weight:(channel==='context'?.25:1)/variants.length,...(variant.expanded?{expanded:true,terms:variant.terms}: {})});
        plans.get(key).requirementIds.push(requirement.id);
      }
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
      const support=matrix.filter(r=>r.status==='documented'&&r.polarity!=='exclude');
      if(matrix.some(r=>r.kind==='role'&&r.polarity==='exclude'&&r.status==='documented'))continue;
      const permittedRoles=matrix.filter(r=>r.kind==='role'&&r.polarity!=='exclude');
      const strictRoles=permittedRoles.some(r=>r.strictRole)?permittedRoles.filter(r=>r.strictRole):permittedRoles;
      if(brief.roleMode==='only'&&strictRoles.length&&!strictRoles.some(r=>r.status==='documented'))continue;
      // A stronger role priority cannot widen the requested profession. Broad
      // complementary panel perspectives remain inclusive: "a practising
      // clinician and a researcher" is not one mandatory job-title filter.
      const perspectiveRole=r=>['Practising clinician','Clinical researcher'].includes(r.label);
      const complementaryPanel=permittedRoles.length>1&&permittedRoles.some(perspectiveRole);
      const discoveryRoles=complementaryPanel?[]:permittedRoles.filter(r=>['focus','essential'].includes(r.importance)&&!perspectiveRole(r));
      if(discoveryRoles.length&&!discoveryRoles.some(r=>r.status==='documented'))continue;
      const anchorMatches=matrix.filter(m=>anchorRequirements.some(r=>r.id===m.requirementId)&&['documented','potential'].includes(m.status));
      // Expanded broad-imaging queries are deliberately generous for recall.
      // A general cardiology biography can be semantically close to all of
      // them; that alone must not become a radiology-interest match. The owned
      // source must mention at least one requested imaging family or modality.
      const broadDiscovery=anchorRequirements.filter(r=>r.importance!=='preferred'&&IMAGING_EXPANSIONS[r.label]);
      if(broadDiscovery.length&&!anchorMatches.some(m=>broadDiscovery.some(r=>r.id===m.requirementId)))continue;
      // A generic research/AI passage alone cannot qualify a clinician for a
      // device-specific clinical use. Strong semantic-only evidence remains a
      // possible lead and is labelled, never claimed as documented expertise.
      if(anchorRequirements.length&&!anchorMatches.length&&(anchorSemanticMaximum.get(id)||0)<.58)continue;
      const essential=matrix.filter(r=>r.importance==='essential'&&!['context','role'].includes(r.status)&&r.kind!=='role');
      const essentialRoles=permittedRoles.filter(r=>r.importance==='essential');
      if(documentedOnly&&(essential.some(r=>r.status!=='documented')||essentialRoles.length&&!essentialRoles.some(r=>r.status==='documented')))continue;
      const contextualEvidence=[...(contextMatches.get(id)?.values()||[])].sort((a,b)=>b.score-a.score);
      // The matrix remains engagement context. Its cited passage explains the
      // relevance signal but cannot turn an assessment question into a credential.
      for(const m of matrix.filter(m=>m.status==='context')){
        m.evidenceIds=[...new Set(contextualEvidence.filter(hit=>hit.requirementIds.includes(m.requirementId)).map(hit=>hit.passageId))];
        m.supportingEvidence=m.evidenceIds.map(id=>passages.find(p=>p.id===id)).filter(Boolean).map(p=>supportingSpan(brief.requirements.find(r=>r.id===m.requirementId),p,m.status,brief));
        if(m.evidenceIds.length)m.note='Related recorded material may inform this assessment question; it does not establish qualification to perform the assessment.';
      }
      const selectedIds=new Set(matrix.flatMap(m=>m.evidenceIds));
      const evidence=passages.filter(p=>selectedIds.has(p.id)).sort((a,b)=>(evidenceScore.get(b.id)||0)-(evidenceScore.get(a.id)||0));
      // Useful adjacent research is optional context from the same person's
      // evidence, never an inferred criterion or an unrequested gap. Require
      // the clinical subject in the research passage itself: a generic research
      // biography next to a CT interest is not necessarily research about CT.
      const primaryEvidenceIds=new Set(matrix.map(m=>m.evidenceIds[0]).filter(Boolean));
      const requiredResearchIds=new Set(matrix.filter(m=>m.kind==='research'||m.matchIntent==='research').flatMap(m=>m.evidenceIds));
      const relatedEvidence=[],relatedTexts=new Set();
      for(const p of [...passages].sort((a,b)=>Number(b.attribution==='verified-source')-Number(a.attribution==='verified-source')||evidenceStrength(b)-evidenceStrength(a))){
        if(relatedEvidence.length>=2)break;
        if(!['research','trial','publication','clinical-interest'].includes(p.type)||primaryEvidenceIds.has(p.id)||requiredResearchIds.has(p.id)||p.qualifiers?.some(q=>/publication-listing-link-not-authorship|bibliographic-reference-not-training-or-authorship|colleague|uncertain-identity/i.test(q)))continue;
        // The containing profile's owner is not automatically a participant in
        // every study it describes. Recheck contribution wording independent of
        // an imported type/field label before adding a research badge.
        if(!optionalResearchAttributed(p))continue;
        const related=anchorRequirements.filter(r=>directMatch(r,p)&&requirementScopes(r,p).some(scope=>!negative(scope.text)&&optionalResearchAttributed(scope)));
        if(!related.length)continue;
        const support=supportingSpan({...related[0],matchIntent:'research'},p,'potential',brief),key=clean(support.text).toLowerCase();
        if(relatedTexts.has(key))continue;relatedTexts.add(key);
        relatedEvidence.push({...support,relatedToRequirementIds:related.map(r=>r.id)});
        if(!selectedIds.has(p.id)){evidence.push(p);selectedIds.add(p.id);}
      }
      // Keep contextual proof within the explanation's bounded evidence window
      // without replacing the strongest clinical support.
      const contextualIds=new Set(contextualEvidence.map(hit=>hit.passageId));
      const primaryAnchorIds=new Set(anchorMatches.map(m=>m.evidenceIds[0]).filter(Boolean)),allAnchorIds=new Set(anchorMatches.flatMap(m=>m.evidenceIds));
      const evidencePriority=p=>primaryAnchorIds.has(p.id)?3:contextualIds.has(p.id)?2:allAnchorIds.has(p.id)?1:0;
      evidence.sort((a,b)=>evidencePriority(b)-evidencePriority(a)||(evidenceScore.get(b.id)||0)-(evidenceScore.get(a.id)||0));
      if(evidence.length<3)for(const p of [...passages].sort((a,b)=>(evidenceScore.get(b.id)||0)-(evidenceScore.get(a.id)||0)).slice(0,3))if(!selectedIds.has(p.id)){evidence.push(p);selectedIds.add(p.id);}
      const gaps=matrix.filter(m=>m.polarity!=='exclude'&&!['documented','context'].includes(m.status)).map(m=>({requirementId:m.requirementId,label:m.label,status:m.status,importance:m.importance,note:m.note}));
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
        const owned=passages.filter(p=>m.evidenceIds.includes(p.id)).sort((a,b)=>requirement.matchIntent?m.evidenceIds.indexOf(a.id)-m.evidenceIds.indexOf(b.id):Number(b.attribution==='verified-source')-Number(a.attribution==='verified-source')||Number(b.type==='clinical-practice')-Number(a.type==='clinical-practice'));
        const fact=owned[0],proof=fact?supportingSpan(requirement,fact,m.status,brief):null;
        const reviewedSummary=proof?.kind==='reviewed-summary';
        const statement=proof?.text||m.note;
        const scopedType=proof?.evidenceType||(fact?effectiveEvidenceType(requirement,fact):null);
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
        if(m.polarity==='exclude'||['context','unknown','mismatch','needs-review'].includes(m.status)||['geography','currentPractice'].includes(m.kind))continue;
        const requirement=brief.requirements.find(r=>r.id===m.requirementId);
        const matching=passages.filter(p=>m.evidenceIds.includes(p.id));
        let strength=0;
        for(const p of matching){
          const related=anchors.some(a=>directMatch(a,p));
          let value=({'clinical-practice':1,'clinical-interest':.38,procedure:.3,research:.7,trial:.7,publication:.55,training:.12,'professional-background':.15})[effectiveEvidenceType(requirement,p)]||.1;
          if(requirement.matchIntent==='interest'||requirement.matchIntent==='research')value=intentEvidenceStrength(requirement,{...p,type:effectiveEvidenceType(requirement,p)})/6;
          if(['research','population','setting'].includes(m.kind)&&!related)value*=.2;
          if(m.status==='potential')value*=.4;
          strength=Math.max(strength,value);
        }
        const weight={modality:10,activity:8,procedure:8,condition:5,research:4,setting:3,population:1,role:1,regulatory:2}[m.kind]||1;
        const fit=weight*strength*(m.importance==='preferred'?.5:1);
        evidenceFit+=fit;
        // Explicit essential work (e.g. personally reporting the requested CT)
        // belongs in the primary clinical fit, not only a secondary tie-break.
        // matrixFor has already scoped that activity to the requested modality.
        // Interests, optional activities and research/context do not acquire
        // this priority merely by sharing clinical vocabulary.
        if(anchorIds.has(m.requirementId)||(m.kind==='activity'&&m.importance==='essential'&&m.status==='documented'))clinicalFit+=fit;
      }
      const contextFit=Math.min(.75,contextualEvidence.reduce((sum,hit)=>sum+hit.score*hit.weight,0));
      const relevance=evidenceFit+rrf*4+contextFit;
      results.push({...candidate,requirementMatrix:matrix,evidence,relatedEvidence,reasons,gaps,questions,relationships,roleMatches,qualificationStatus:'not-reviewed',relationshipStatus:'not-reviewed',coverage:{documented:support.length,essentialDocumented:essentialSupport,essentialTotal:essential.length},relevance,clinicalRelevance:clinicalFit,contextRelevance:contextFit});
    }
    results.sort((a,b)=>b.clinicalRelevance-a.clinicalRelevance||b.relevance-a.relevance||a.name.localeCompare(b.name));
    results.forEach((r,index)=>r.rank=index+1);
    return {results,brief,corpusVersion:this.corpus.version,diagnostics:{keywordMethod:'BM25 (k1=1.5, b=0.75)',embeddingModel:EMBEDDING_MODEL,fusion:'RRF (k=60) with capped context contribution',retrievalMode,bm25Candidates:lexicalIds.size,semanticCandidates:semanticIds.size,bm25CandidateIds:[...lexicalIds],semanticCandidateIds:[...semanticIds],ranking:results.map(r=>({id:r.id,rank:r.rank,relevance:r.relevance,clinicalRelevance:r.clinicalRelevance,contextRelevance:r.contextRelevance})),mergedCandidates:fused.size,queryCount:queries.length,queryChannels:queryPlans.map(({query,channel,weight,requirementIds,expanded})=>({query,channel,weight,requirementIds,...(expanded?{expanded:true}:{})})),retrievalExpansions:queryPlans.filter(p=>p.expanded).map(({requirementIds,terms})=>({requirementIds,terms})),documentedOnly},panel:{requested:brief.panelSize||null,roles:brief.roles||[],note:'Panel size is a recruitment goal; no candidates are added merely to fill it.'}};
  }
}
module.exports={ExpertSearchEngine,SearchEngine:ExpertSearchEngine,BM25Index,tokens,directMatch,matrixFor,requirementQuery,requirementQueries,questionFor,semanticEligible};
