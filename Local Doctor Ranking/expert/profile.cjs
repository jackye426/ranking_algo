'use strict';

// Readable professional background, independent of the search evidence matrix.
// This is a projection of owned corpus passages, not a generated biography or
// a claim that the professional satisfies a search requirement.
const {normalizeText,safeUrl,splitPassages}=require('./data.cjs');
const VERSION='expert-profile-v1';
const LIMITS={about:8,clinicalInterests:12,procedures:16,research:10,qualifications:8,practiceLocations:24};
const list=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value:'';
const unique=values=>[...new Set(values.filter(Boolean))];
const key=value=>normalizeText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const labels={'clinical-practice':'Recorded activity','clinical-interest':'Listed interest',procedure:'Listed procedure',research:'Recorded research',trial:'Recorded study contribution',publication:'Recorded publication',training:'Recorded training',teaching:'Recorded teaching','professional-background':'Recorded background',qualification:'Recorded qualification'};
const unsafeQualifier=/colleague|uncertain-identity|wrong-person|attribution-conflict|quarantin|publication-listing-link-not-authorship|bibliographic-reference-not-training-or-authorship/i;
const unsafeText=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:ignore|disregard|override)\b.{0,65}\b(?:instructions|prompt|rules|system)\b|\b(?:system prompt|assistant must|developer message)\b|\b(?:my\s+(?:wife|husband|children|family)|spare\s+time|outside\s+(?:of\s+)?work|hobbies|married\s+with)\b|\benjoys?\s+(?:running|playing|skiing|golf|tennis|travel|music|cycling|walking)\b|\b(?:telephone|phone|mobile|contact|booking)\b.{0,30}\+?\d[\d ()-]{8,}\d/i;
const administrative=/^(?:book|call|contact|click|make an enquiry|find out more|read more|consultation fee|initial consultation|follow.up consultation|practice$)|\b(?:cancellation (?:charge|fee)|billing|sign[ -]?up|register online)\b/i;
const date=value=>typeof value==='string'&&/^\d{4}(?:-\d{2}(?:-\d{2}(?:T[^\s]+)?)?)?$/.test(value)?value:null;
function dates(value){return {sourceDate:date(value?.sourceDate),observedAt:date(value?.observedAt),mergeDate:date(value?.mergeDate)};}
function strings(value,max=20,length=1200){return unique(list(value).filter(v=>typeof v==='string').map(v=>v.slice(0,length))).slice(0,max);}
function recordUrl(candidateId,evidenceId){const path='/api/expert/sources/'+encodeURIComponent(candidateId);return evidenceId?path+'?evidence='+encodeURIComponent(evidenceId)+'#evidence-'+encodeURIComponent(evidenceId):path;}
function provenance(value){return {sourceRecordId:text(value?.sourceRecordId)||null,field:text(value?.field)||null,sourceUrl:safeUrl(value?.sourceUrl),sourceLabel:normalizeText(value?.sourceLabel)||'Stored professional record',dates:dates(value?.dates),attribution:text(value?.attribution)||'source-record'};}
function review(value){if(!value||typeof value!=='object')return null;return {limitations:strings(value.limitations),...(typeof value.identityBasis==='string'?{identityBasis:value.identityBasis.slice(0,300)}:{})};}
function blocks(value){
  // Insert presentation boundaries only. All words remain available in `text`
  // and the exact-passage citation; bullets must not become generated claims.
  const lines=text(value).split(/\n+|\s*[•*]\s*/).map(v=>v.trim()).filter(v=>v.length>2);
  return lines.map((line,index)=>({kind:index>0&&/[•*]/.test(value)?'list-item':'paragraph',text:line}));
}
function safePassage(p,candidate,ownedIds,ownedRecords){
  if(!p||p.candidateId!==candidate.id||!ownedIds.has(p.id)||typeof p.text!=='string'||p.text.length>5000||p.text.trim().length<3)return false;
  // Source-linked public enrichment is identity-bound during corpus preparation.
  // An arbitrary row claiming the same candidate ID cannot bypass ownership.
  if(!ownedRecords.has(String(p.sourceRecordId))&&!(p.attribution==='verified-source'&&String(p.sourceRecordId).startsWith('enrichment:')&&safeUrl(p.sourceUrl)&&date(p.dates?.observedAt)))return false;
  if(list(p.qualifiers).some(q=>unsafeQualifier.test(q))||unsafeText.test(p.text)||administrative.test(p.text)||unsafeText.test(text(p.sourceQuote)))return false;
  if(/^(?:locations|registration|specialt(?:y|ies|y_alternatives)|professional_role|professional_memberships|nhs_posts|nhs_base)$/.test(p.field))return false;
  if(['location','registration','relationship','affiliation'].includes(p.type))return false;
  return /^(?:about(?:_alternatives)?|clinical_interests|areas_of_interest|procedures(?:_completed)?|procedure_volumes_phin|research_interests|publications|qualifications|detailed_qualifications|professional_experience|isrctn_trials|trials|teaching_interests|reviewed-professional-source)$/.test(p.field)||p.attribution==='verified-source';
}
function evidence(p,candidate){
  const sources=list(p.sources).map(provenance),main=provenance(p),all=[main,...sources];
  const result={id:p.id,candidateId:candidate.id,text:p.text,type:text(p.type)||'professional-background',...main,
    qualifiers:strings(p.qualifiers),sources:[...new Map(all.map(s=>[JSON.stringify(s),s])).values()].slice(0,12),
    reviewedParaphrase:p.reviewedParaphrase===true,sourceQuote:text(p.sourceQuote)||null,review:review(p.review),
    recordUrl:recordUrl(candidate.id,p.id),blocks:blocks(p.text)};
  // Keep reported ranges/periods distinct from derived figures. Never turn a
  // procedure list or bucket midpoint into performed-activity totals.
  const volume=v=>({activity:normalizeText(v.activity),reportedRange:normalizeText(v.reportedRange)||null,reportingPeriod:normalizeText(v.reportingPeriod)||null,reportedAdmissions:Number.isFinite(v.reportedAdmissions)?v.reportedAdmissions:null,countNumeric:Number.isFinite(v.countNumeric)?v.countNumeric:null,countNumericDerived:v.countNumericDerived===true,comparable:false,sourceField:text(v.sourceField)||p.field});
  if(p.volume)result.volume=volume(p.volume);
  if(list(p.volumes).length)result.volumes=p.volumes.slice(0,20).map(volume);
  return result;
}
function sectionFor(p){
  if(/^(?:qualifications|detailed_qualifications)$/.test(p.field))return 'qualifications';
  if(/^procedures|^procedure_volumes/.test(p.field)||['procedure','activity-volume'].includes(p.type))return 'procedures';
  if(['research','trial','publication'].includes(p.type)||/^(?:research_interests|publications|isrctn_trials|trials)$/.test(p.field))return 'research';
  // Retain narrative alternative biographies as readable About excerpts.
  if(/^(?:about(?:_alternatives)?|professional_experience)$/.test(p.field))return 'about';
  if(p.type==='clinical-interest'||/clinical_interests|areas_of_interest/.test(p.field))return 'clinicalInterests';
  return 'about';
}
function detailScore(p){return ({'clinical-practice':10,'clinical-interest':9,training:8,research:7,trial:7,publication:6,teaching:5,'professional-background':3})[p.type]||2;}
function deduplicateLocations(candidate){
  const locations=[];
  for(const item of list(candidate.locations)){
    if(!item||typeof item!=='object'||item.sourceRecordId&&!list(candidate.sourceRecordIds).includes(String(item.sourceRecordId)))continue;
    const location={name:normalizeText(item.name),address:normalizeText(item.address),city:normalizeText(item.city),region:normalizeText(item.region),postcode:normalizeText(item.postcode),country:normalizeText(item.country)||null,sourceUrl:safeUrl(item.sourceUrl),source:normalizeText(item.source)||null,provenance:provenance(item.provenance||item)};
    if(!location.name&&!location.address||/^(?:practice|unknown|not available|n\/?a|none)$/i.test(location.name)&&!location.address)continue;
    if(unsafeText.test(Object.values(location).filter(v=>typeof v==='string').join(' ')))continue;
    const name=key(location.name).replace(/^the /,''),postcode=key(location.postcode).replace(/ /g,''),address=key(location.address);
    const prior=locations.find(l=>{
      const n=key(l.name).replace(/^the /,''),p=key(l.postcode).replace(/ /g,''),a=key(l.address);
      // Equal names at different postcodes can represent separate branches.
      if(postcode&&p&&postcode!==p)return false;
      return name&&name===n&&(postcode&&p||address&&a?postcode===p||address===a:(!postcode||!p)&&(!address||!a))||address&&address===a&&(!name||!n||name===n);
    });
    if(prior){for(const field of ['name','address','city','region','postcode','country','sourceUrl','source'])if(!prior[field]&&location[field])prior[field]=location[field];prior.sources.push(location.provenance);}
    else locations.push({...location,sources:[location.provenance],qualifiers:['recorded-location-not-residence-or-current-practice']});
  }
  return locations;
}
function buildProfile(candidate,passages,{corpusVersion=null}={}){
  if(!candidate?.id||candidate.needsIdentityReview)return null;
  const ownedIds=new Set(list(candidate.evidenceIds)),ownedRecords=new Set(list(candidate.sourceRecordIds).map(String)),groups={about:[],clinicalInterests:[],procedures:[],research:[],qualifications:[]},seen=new Map();
  for(const p of list(passages)){
    if(!safePassage(p,candidate,ownedIds,ownedRecords))continue;
    const dedupKey=JSON.stringify([key(p.text),p.type,strings(p.qualifiers).sort(),dates(p.dates).sourceDate]);
    if(seen.has(dedupKey)){
      const existing=seen.get(dedupKey);existing.sources=[...new Map([...existing.sources,...evidence(p,candidate).sources].map(s=>[JSON.stringify(s),s])).values()].slice(0,12);continue;
    }
    const item=evidence(p,candidate);seen.set(dedupKey,item);groups[sectionFor(p)].push(item);
  }
  const counts={};let truncated=false;
  for(const [section,items] of Object.entries(groups)){
    items.sort((a,b)=>detailScore(b)-detailScore(a)||a.id.localeCompare(b.id));counts[section]=items.length;if(items.length>LIMITS[section])truncated=true;groups[section]=items.slice(0,LIMITS[section]);
  }
  const locations=deduplicateLocations(candidate);counts.practiceLocations=locations.length;if(locations.length>LIMITS.practiceLocations)truncated=true;
  return {candidateId:candidate.id,corpusVersion,profileVersion:VERSION,name:normalizeText(candidate.name),role:normalizeText(candidate.role),specialty:normalizeText(candidate.specialty),
    registrations:list(candidate.registrations).filter(r=>typeof r?.body==='string'&&typeof r?.identifier==='string').map(r=>({body:r.body,identifier:r.identifier})),
    profileUrls:unique(list(candidate.profileUrls).map(safeUrl)).slice(0,12),sourceUrl:recordUrl(candidate.id),...groups,practiceLocations:locations.slice(0,LIMITS.practiceLocations),counts,truncated};
}
const STOP=new Set('a an the and or to of in for with i we need needs find looking want specialist specialists expert experts experience experienced has have who uk united kingdom clinical recorded consultant doctor background'.split(' '));
function tokens(value){return key(value).split(' ').filter(word=>word.length>2&&!STOP.has(word));}
function excerpt(p,queryTokens){
  // Do not lift a positive bullet out of a passage containing negation. Keeping
  // its lead sentence avoids turning "I do not perform: ..." into experience.
  const negative=list(p.qualifiers).includes('contains-negation');
  const units=negative?[{text:p.text}]:list(p.blocks).flatMap(b=>splitPassages(b.text).map(text=>({text})));
  const overlap=value=>tokens(value).filter(token=>queryTokens.has(token)).length;
  const selected=[...units].sort((a,b)=>overlap(b.text)-overlap(a.text)||Number(a.text.length>260)-Number(b.text.length>260))[0]?.text||p.text;
  if(selected.length<=260)return selected;
  const sentence=selected.match(/^.{30,255}?[.!?](?:\s|$)/)?.[0]?.trim();if(sentence)return sentence;
  const end=selected.lastIndexOf(' ',257);return selected.slice(0,end>60?end:257).trimEnd()+'…';
}
function profilePreview(profile,{query=''}={}){
  if(!profile)return [];
  const wanted=new Set(tokens(typeof query==='string'?query:'')),pool=['about','clinicalInterests','procedures','research'].flatMap(section=>list(profile[section]).map(p=>({...p,section})));
  const score=p=>{const hits=new Set(tokens(p.text).filter(t=>wanted.has(t))).size;return hits*20+detailScore(p)+(p.text.length>=40?2:0)-Number(p.reviewedParaphrase)*1;};
  pool.sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
  const selected=[],seen=new Set();
  for(const p of pool){
    const snippet=excerpt(p,wanted),canonical=key(snippet);if(seen.has(canonical)||snippet.length<12)continue;
    if(selected.some(s=>key(s.excerpt).includes(canonical)||canonical.includes(key(s.excerpt))))continue;
    seen.add(canonical);selected.push({...p,corpusVersion:profile.corpusVersion,profileVersion:profile.profileVersion,excerpt:snippet,label:labels[p.type]||'Recorded background',section:p.section});if(selected.length===2)break;
  }
  return selected;
}
module.exports={buildProfile,profilePreview,VERSION,LIMITS};
