'use strict';

function positiveClinicalText(raw) {
  // Preserve unconfirmed diagnoses in the original patient context, but do not
  // turn them into positive clinical topics, retrieval terms or match evidence.
  // A new patient clause ends the scope; a condition list does not.
  return String(raw || '').replace(/[’‘]/g,"'").replace(/\b(?:i\s+)?(?:have\s+not|haven't|have\s+never|am\s+not|was\s+not|wasn't|not|never)\s+(?:been\s+)?diagnosed\b(?:\s+with\s+[^.!?;,]+?(?=\s+(?:and\s+(?:i|my|the)\b|but\b|although\b|however\b|while\b)|[.!?;,]|$))?/gi,' ');
}

// Shared parser/filter vocabulary. These are search labels, not diagnoses.
const SPECIALTIES = [
  {label:'Orthopaedics',aliases:/\b(?:orthop(?:a)?edic(?:s|\s+surgeons?|\s+surgery)?|trauma\s*(?:and|&)\s*orthop(?:a)?edic\s+surgery|(?:hip|knee)(?:\s*(?:and|&)\s*(?:hip|knee))?\s+surgeons?)\b/gi},
  {label:'Cardiology',aliases:/\b(?:cardiolog(?:y|ists?)|heart\s+(?:specialists?|doctors?))\b/gi},
  {label:'Dermatology',aliases:/\b(?:dermatolog(?:y|ists?)|skin\s+(?:specialists?|doctors?))\b/gi},
  {label:'Gastroenterology',aliases:/\b(?:gastroenterolog(?:y|ists?)|hepatolog(?:y|ists?))\b/gi},
  {label:'Neurology',aliases:/\bneurolog(?:y|ists?)\b/gi},
  {label:'Neurosurgery',aliases:/\bneurosurg(?:ery|eons?)\b/gi},
  {label:'General surgery',aliases:/\b(?:general(?:\s*(?:and|&)\s*(?:colorectal|upper\s+gi))?\s+surg(?:ery|eons?)|colorectal\s*(?:and|&)\s*general\s+surg(?:ery|eons?))\b/gi},
  {label:'Urology',aliases:/\burolog(?:y|ists?|ical(?:\s+surgeons?)?)\b/gi},
  {label:'Gynaecology',aliases:/\b(?:gyn(?:a)?ecolog(?:y|ists?|ical)|obstetric(?:s|ians?))\b/gi},
  {label:'Ophthalmology',aliases:/\b(?:ophthalmolog(?:y|ists?)|ophthalmic\s+surgeons?|eye\s+(?:specialists?|surgeons?))\b/gi},
  {label:'ENT',aliases:/\b(?:ent|otolaryngolog(?:y|ists?)|ear[ ,]+nose\s*(?:and|&)\s*throat)\b/gi},
  {label:'Rheumatology',aliases:/\brheumatolog(?:y|ists?)\b/gi},
  {label:'Respiratory medicine',aliases:/\b(?:respiratory\s+(?:medicine|physicians?|specialists?)|pulmonolog(?:y|ists?))\b/gi},
  {label:'Endocrinology',aliases:/\bendocrinolog(?:y|ists?)\b/gi},
  {label:'Oncology',aliases:/\boncolog(?:y|ists?)\b/gi},
  {label:'Paediatrics',aliases:/\b(?:p(?:a)?ediatric(?:s|ians?)|children'?s\s+specialists?)\b/gi},
  {label:'Plastic surgery',aliases:/\bplastic(?:\s*(?:and|&)\s*(?:reconstructive|hand))?\s+surg(?:ery|eons?)\b/gi},
  {label:'Pain medicine',aliases:/\b(?:pain\s+(?:medicine|management|specialists?)|algolog(?:y|ists?))\b/gi},
  {label:'Sports medicine',aliases:/\bsports?(?:\s*(?:and|&)\s*exercise)?\s+(?:medicine|physicians?)\b/gi},
  {label:'General practice',aliases:/\b(?:general\s+pract(?:ice|itioners?)|gps?)\b/gi},
  {label:'Psychiatry',aliases:/\bpsychiatr(?:y|ists?)\b/gi},
  {label:'Cardiothoracic surgery',aliases:/\b(?:cardiothoracic|cardiac|thoracic)\s+surg(?:ery|eons?)\b/gi},
  {label:'Radiology',aliases:/\bradiolog(?:y|ists?)\b/gi},
  {label:'Haematology',aliases:/\bh(?:a)?ematolog(?:y|ists?)\b/gi},
  {label:'Vascular surgery',aliases:/\bvascular(?:\s*(?:and|&)\s*endovascular)?\s+surg(?:ery|eons?)\b/gi},
  {label:'Nephrology',aliases:/\bnephrolog(?:y|ists?)\b/gi},
  {label:'Anaesthetics',aliases:/\ban(?:a)?esthe(?:tics|tists?|sia|siolog(?:y|ists?))\b/gi},
];

const ortho=['Orthopaedics'];
const PROCEDURES = [
  {label:'Revision knee replacement',specialties:ortho,implies:['Knee replacement','Joint replacement'],aliases:/\brevision(?:\s+of)?\s+(?:(?:a|the)\s+)?(?:total\s+)?knee[ -]+(?:replacements?|arthroplast(?:y|ies))\b/gi},
  {label:'Total knee replacement',specialties:ortho,implies:['Knee replacement','Joint replacement'],aliases:/\b(?:total[ -]+knee(?:[ -]+joint)?[ -]+(?:replacements?|arthroplast(?:y|ies))|tkr|tka)\b/gi},
  {label:'Partial knee replacement',specialties:ortho,implies:['Knee replacement','Joint replacement'],aliases:/\b(?:(?:partial|uni[ -]?compartmental|uni[ -]?condylar|patellofemoral|patello[ -]femoral)[ -]+(?:knee[ -]+)?(?:replacements?|arthroplast(?:y|ies))|ukr|uka)\b/gi},
  {label:'Knee replacement',specialties:ortho,implies:['Joint replacement'],aliases:/\bknee(?:[ -]+joint)?[ -]+(?:replacements?|arthroplast(?:y|ies))\b|\bknee(?=\s*(?:and|&|\/)\s*hip\s+replacements?\b)/gi},
  {label:'Hip replacement',specialties:ortho,implies:['Joint replacement'],aliases:/\b(?:hip(?:[ -]+joint)?[ -]+(?:replacements?|arthroplast(?:y|ies))|thr|tha)\b|\bhip(?=\s*(?:and|&|\/)\s*knee\s+replacements?\b)/gi},
  {label:'Shoulder replacement',specialties:ortho,implies:['Joint replacement'],aliases:/\bshoulder[ -]+(?:replacements?|arthroplast(?:y|ies))\b/gi},
  {label:'Joint replacement',specialties:ortho,aliases:/\b(?:joint[ -]+replacements?|arthroplast(?:y|ies))\b/gi},
  {label:'Knee arthroscopy',specialties:ortho,implies:['Arthroscopy'],aliases:/\b(?:knee[ -]+arthroscop(?:y|ies|ic(?:[ -]+surgery)?)|arthroscop(?:y|ies|ic(?:[ -]+(?:surgery|operations?))?)\s+(?:of\s+|on\s+|to\s+)?(?:the\s+)?knees?)\b/gi},
  {label:'Hip arthroscopy',specialties:ortho,implies:['Arthroscopy'],aliases:/\b(?:hip[ -]+arthroscop(?:y|ies|ic(?:[ -]+surgery)?)|arthroscop(?:y|ies|ic(?:[ -]+surgery)?)\s+(?:of\s+|on\s+)?(?:the\s+)?hips?)\b/gi},
  {label:'Shoulder arthroscopy',specialties:ortho,implies:['Arthroscopy'],aliases:/\b(?:shoulder[ -]+arthroscop(?:y|ies|ic(?:[ -]+surgery)?)|arthroscop(?:y|ies|ic(?:[ -]+surgery)?)\s+(?:of\s+|on\s+)?(?:the\s+)?shoulders?)\b/gi},
  {label:'Arthroscopy',specialties:ortho,aliases:/\barthroscop(?:y|ies|ic(?:\s+(?:surgery|operations?))?)\b/gi},
  {label:'ACL reconstruction',specialties:ortho,aliases:/\b(?:(?:acl|anterior[ -]+cruciate[ -]+ligament)(?:\s*\((?:acl|knee\s+ligament)\))?[ -]+reconstructions?|reconstructions?\s+of\s+(?:the\s+)?(?:acl|anterior[ -]+cruciate[ -]+ligament))\b/gi},
  {label:'Meniscal repair',specialties:ortho,aliases:/\b(?:menisc(?:al|us)[ -]+repairs?|repair\s+of\s+(?:the\s+)?menisc(?:us|al\s+(?:tear|injury)))\b/gi},
  {label:'Meniscectomy',specialties:ortho,aliases:/\bmeniscectom(?:y|ies)\b/gi},
  {label:'Cartilage repair',specialties:ortho,aliases:/\b(?:cartilage[ -]+(?:repair|restoration|transplantation)|chondroplasty|microfracture)\b/gi},
  {label:'Rotator cuff repair',specialties:ortho,aliases:/\b(?:rotator[ -]+cuff[ -]+repairs?|repair\s+of\s+(?:the\s+)?rotator[ -]+cuff)\b/gi},
  {label:'Spinal surgery',specialties:['Orthopaedics','Neurosurgery'],aliases:/\b(?:spin(?:al|e)[ -]+surgery|back[ -]+surgery|spinal\s+(?:fusion|decompression)|laminectomy|discectomy|microdiscectomy)\b/gi},
  {label:'Cataract surgery',specialties:['Ophthalmology'],aliases:/\b(?:cataract[ -]+(?:surgery|removal|extraction)|phacoemulsification)\b/gi},
  {label:'Hernia repair',specialties:['General surgery'],aliases:/\b(?:hernia[ -]+repairs?|repair\s+of\s+(?:(?:an?|the)\s+)?(?:(?:inguinal|femoral|umbilical|incisional|hiatus)\s+)?hernia)\b/gi},
  {label:'Coronary angioplasty',specialties:['Cardiology'],aliases:/\b(?:coronary[ -]+angioplasty|percutaneous[ -]+coronary[ -]+intervention|coronary[ -]+stenting|pci)\b/gi},
  {label:'Catheter ablation',specialties:['Cardiology'],aliases:/\b(?:catheter[ -]+ablation|ablation\s+(?:of|for)\s+(?:atrial\s+fibrillation|arrhythmias?))\b/gi},
  {label:'Pacemaker implantation',specialties:['Cardiology'],aliases:/\b(?:pacemaker[ -]+(?:implantation|insertion)|implantation\s+of\s+(?:a\s+)?pacemaker)\b/gi},
  // Keep excision tied to endometriosis in the same treatment phrase. Neither
  // general endometriosis care nor ablation/destruction establishes excision.
  {label:'Endometriosis excision',specialties:['Gynaecology'],aliases:/\b(?:(?:(?:laparoscopic|robot(?:ic)?[ -]+assisted|robotic)[ -]+)?(?:endo(?:metriosis)?[ -]+excisions?(?:[ -]+surgery)?|excisions?(?:[ -]+surgery)?\s+(?:of|for)\s+(?:(?:the|deep(?:ly)?(?:[ -]+infiltrating)?|complex|severe|recto[ -]?vaginal|pelvic|bowel)\s+)*endo(?:metriosis)?))\b/gi},
  {label:'Skin lesion removal',specialties:['Dermatology','Plastic surgery'],aliases:/\b(?:(?:skin[ -]+lesion|mole|skin[ -]+cancer)[ -]+(?:removal|excision)|excision\s+of\s+(?:a\s+)?(?:skin\s+lesion|mole|skin\s+cancer))\b/gi},
];

function detections(value, vocabulary) {
  const input=typeof value==='string'?value:'';
  const all=vocabulary.flatMap(item=>[...input.matchAll(new RegExp(item.aliases.source,'gi'))].map(m=>({label:item.label,start:m.index,end:m.index+m[0].length,text:m[0]})));
  // A specific phrase such as "total knee replacement" wins over overlapping
  // "knee replacement" and "joint replacement"; separate phrases remain AND.
  all.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start);
  const chosen=[];
  for(const match of all) if(!chosen.some(m=>match.start<m.end&&match.end>m.start)) chosen.push(match);
  return chosen.sort((a,b)=>a.start-b.start);
}
const detectSpecialties=value=>detections(value,SPECIALTIES);
const detectProcedures=value=>detections(value,PROCEDURES);
function inferTopicSpecialties(topic) {
  const labels=new Set(detectSpecialties(topic).map(m=>m.label));
  for(const p of detectProcedures(topic)) for(const s of PROCEDURES.find(x=>x.label===p.label).specialties) labels.add(s);
  if(/\b(?:knee|hip|shoulder|ankle|wrist|elbow|orthop(?:a)?edic)\b/i.test(topic||'')) ['Orthopaedics','Rheumatology','Sports medicine','Pain medicine'].forEach(s=>labels.add(s));
  if(/\b(?:skin|acne|eczema|psoriasis)\b/i.test(topic||'')) labels.add('Dermatology');
  if(/\b(?:heart|cardiac|palpitations?)\b/i.test(topic||'')) labels.add('Cardiology');
  if(/\bendometriosis\b/i.test(topic||'')) labels.add('Gynaecology');
  return [...labels];
}
function sentenceAt(text,start,end) {
  const before=text.slice(0,start),after=text.slice(end);
  const left=Math.max(before.lastIndexOf('.'),before.lastIndexOf(';'),before.lastIndexOf('\n'),before.lastIndexOf('!'),before.lastIndexOf('?'))+1;
  const boundary=after.search(/[.;\n!?]/); const right=boundary<0?text.length:end+boundary+1;
  return {text:text.slice(left,right).trim(),before:text.slice(left,start),after:text.slice(end,right)};
}
function positiveProcedureMention(full,match,{description=false}={}) {
  const sentence=sentenceAt(full,match.start,match.end);
  // Negation cannot be rescued by an unrelated positive occurrence elsewhere in
  // the same source field. "but/however" starts a new contrast clause.
  const before=sentence.before.split(/\b(?:but|however|although)\b/i).at(-1).replace(/\bnot\s+only\b/gi,'');
  const after=sentence.after.split(/\b(?:but|however|although)\b/i)[0];
  if(/\b(?:no\s+longer|never|not|doesn['’]t|don['’]t|without|except|excluding|exclude|avoid|unable\s+to)\b/i.test(before.slice(-180))) return false;
  if(/\bno\b/i.test(before.slice(-90))) return false;
  if(/^[\s,:-]*(?:surgery\s+)?(?:(?:is|are|was|were)\s+)?(?:not\b|no\s+longer\b|unavailable|excluded)/i.test(after)) return false;
  // "Robotic assisted" describes a treatment method in the stored procedure
  // catalogue; assisting another clinician remains insufficient evidence.
  const attributionText=sentence.text.replace(/\brobot(?:ic)?[ -]+assisted\b/gi,'robotic');
  if(/\b(?:training|trained|fellowship|research(?:ed|ing)?|publications?|published|thesis|courses?|lectures?|observed|assisted|shadowed|refer(?:red|s|ring)?)\b/i.test(attributionText)) return false;
  if(/\b(?:my|his|her|their)\s+(?:colleague|mentor|trainer)|\b(?:under\s+(?:mr|dr|prof)|department\s+offers|hospital\s+offers)\b/i.test(sentence.text)) return false;
  if(/\b(?:rather\s+than|instead\s+of|alternative\s+to|alternatives\s+to)\s*$/i.test(before)) return false;
  // Free biography prose must positively attribute the procedure to the
  // consultant's own practice; a treatment mentioned in a story does not pass.
  const ownPractice=/\b(?:i\s+(?:offer|perform|undertake|specialis[ez]e?|treat|provide)|(?:my|his|her|their)\s+(?:practice|special(?:ist|ty)\s+interests?|expertise)|special(?:ist|ises?|izes?|ising|izing)\s+(?:in|interest)|areas?\s+of\s+(?:interest|expertise)|(?:clinical|special)\s+interests?|(?:he|she)\s+(?:offers?|performs?|undertakes?|specialis[ez]es?))\b/i.test(sentence.text)
    || /\b(?:i(?:['’]m|\s+am)|(?:he|she)\s+is)\s+(?:(?:an?|experienced)\s+){0,2}consultant\b[^.;\n!?]{0,100}\bwith\s+a\s+(?:particular\s+)?focus\s+on\b/i.test(sentence.text);
  if(description&&!ownPractice) return false;
  return true;
}
function procedureEvidence(record) {
  const listed=Array.isArray(record.procedureEvidence)?record.procedureEvidence.filter(e=>e&&typeof e.text==='string'):[];
  const items=listed.map(e=>({...e,field:e.sourceField||'procedures',description:false}));
  for(const value of record.procedures||[]) if(typeof value==='string'&&!listed.some(e=>e.text===value)) items.push({text:value,field:'procedures',sourceUrl:record.evidenceUrl||record.profileUrl,description:false});
  for(const value of record.clinicalInterests||[]) if(typeof value==='string') {
    const provenance=(record.fieldProvenance?.clinicalInterests||[]).find(p=>p.values?.includes(value));
    items.push({text:value,field:provenance?.field||'clinicalInterests',sourceRecordId:provenance?.sourceRecordId,
      sourceUrl:provenance?.sourceUrl||record.evidenceUrl||record.profileUrl,description:provenance?.derivedBy==='exact-sentence-extraction'});
  }
  if(typeof record.description==='string'&&record.description) {
    const provenance=record.fieldProvenance?.description?.[0];
    items.push({text:record.description,field:'description',sourceRecordId:provenance?.sourceRecordId,
      sourceUrl:provenance?.sourceUrl||record.evidenceUrl||record.profileUrl,description:true});
  }
  return items;
}
function findProcedureEvidence(record,label) {
  if(!PROCEDURES.some(p=>p.label===label)) return null;
  // Match only the required procedure and its narrower forms. Scanning every
  // unrelated treatment expression through every biography makes refinements
  // needlessly expensive across the full consultant directory.
  const relevant=PROCEDURES.filter(p=>p.label===label||p.implies?.includes(label));
  for(const item of procedureEvidence(record)) for(const match of detections(item.text,relevant)) {
    const rule=PROCEDURES.find(p=>p.label===match.label);
    if(match.label!==label&&!rule.implies?.includes(label)) continue;
    if(!positiveProcedureMention(item.text,match,{description:item.description})) continue;
    return {kind:'procedure',criterion:label,matchedProcedure:match.label,text:sentenceAt(item.text,match.start,match.end).text,
      sourceField:item.field,sourceRecordId:item.sourceRecordId||null,sourceUrl:item.sourceUrl||record.evidenceUrl||record.profileUrl||null,
      hospital:item.hospital||null};
  }
  return null;
}
function matchClinicalCriteria(record,criteria={}) {
  const evidence=[],unmet=[];
  if(criteria.specialty) {
    if(!specialtyMatches(record,criteria.specialty)) unmet.push({kind:'specialty',criterion:criteria.specialty});
    else evidence.push({kind:'specialty',criterion:criteria.specialty,text:record.specialty,sourceField:'specialty',sourceUrl:record.evidenceUrl||record.profileUrl||null});
  }
  for(const label of [...new Set(Array.isArray(criteria.procedures)?criteria.procedures:[])]) {
    const found=findProcedureEvidence(record,label);
    if(found) evidence.push(found); else unmet.push({kind:'procedure',criterion:label});
  }
  return {matches:unmet.length===0,evidence,unmet};
}
const matchesClinicalCriteria=(record,criteria)=>matchClinicalCriteria(record,criteria).matches;
const specialtyMatches=(record,specialty)=>detectSpecialties(record.specialty||'').some(m=>m.label===specialty);
const matchesClinicalFilters=matchesClinicalCriteria;
const procedureEvidenceFor=findProcedureEvidence;
module.exports={SPECIALTIES,PROCEDURES,detectSpecialties,detectProcedures,inferTopicSpecialties,matchClinicalCriteria,matchesClinicalCriteria,matchesClinicalFilters,findProcedureEvidence,procedureEvidenceFor,specialtyMatches,positiveProcedureMention,positiveClinicalText};
