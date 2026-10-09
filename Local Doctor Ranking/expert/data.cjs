'use strict';

// Professional discovery projection only. This module never reads credentials,
// contacts, patient material, appointment history or recruitment decisions.
const {createHash} = require('node:crypto');
const {reviewedBiographySegments}=require('./reviewed-segmentation.cjs');
const VERSION = 'expert-corpus-v3';
const SENTENCES=typeof Intl.Segmenter==='function' ? new Intl.Segmenter('en',{granularity:'sentence'}) : null;
const hash = value => createHash('sha256').update(String(value)).digest('hex').slice(0,20);
const unique = values => [...new Set(values.filter(Boolean))];
const asArray = value => Array.isArray(value) ? value : value == null ? [] : [value];
const flag = value => value === true || value === 1 || value === 'true';
function normalizeText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?\s*>|<\/(?:p|li|div)>/gi,'\n')
    // These fields mix plain medical text with occasional HTML. A generic
    // <...> pattern erased everything between "<1%" and a later ">90%".
    // Strip actual common markup only; inequalities and unfamiliar notation
    // remain literal source text and are escaped by the renderer.
    .replace(/<\/?(?:a|abbr|b|cite|code|del|em|i|small|span|strong|sub|sup|u)\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi,'')
    .replace(/<\/?(?:address|article|aside|blockquote|body|br|caption|dd|details|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|html|img|label|li|main|nav|ol|p|pre|section|summary|table|tbody|td|th|thead|tr|ul)\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi,' ')
    .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').trim();
}
function safeUrl(value) {
  // Missing per-item URLs are common in procedure records. Avoid constructing
  // and catching an invalid URL for every optional provenance lookup.
  if(value==null)return null;
  try { const u = new URL(String(value)); return /^(?:http|https):$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function dateValue(value) {
  const s=normalizeText(value); return /^\d{4}(?:-\d{2}(?:-\d{2}(?:T[^\s]+)?)?)?$/.test(s) ? s : null;
}
function normalizeRegistration(body, value) {
  const names={gmc:'GMC','general medical council':'GMC',hcpc:'HCPC','health and care professions council':'HCPC',gdc:'GDC','general dental council':'GDC',nmc:'NMC','nursing and midwifery council':'NMC'};
  const canonical=names[normalizeText(body).toLowerCase()]; if(!canonical) return null;
  const identifier=normalizeText(value).toUpperCase().replace(new RegExp(`^${canonical}\\s*[:#-]?\\s*`),'').replace(/\s/g,'');
  const patterns={GMC:/^\d{7}$/,HCPC:/^(?:AS|BS|CH|CS|DT|HAD|OT|ODP|OR|PA|PH|PO|PYL|RA|SL)\d{3,8}$/,GDC:/^\d{4,8}$/,NMC:/^\d{2}[A-Z]\d{4}[A-Z]$/};
  return patterns[canonical].test(identifier) && !/^0+$/.test(identifier) ? {body:canonical,identifier} : null;
}
function nameTokens(value) {
  return normalizeText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\([^)]*\)/g,' ')
    .replace(/[^a-z\s'-]/g,' ').replace(/'/g,'').replace(/-/g,' ').split(/\s+/)
    .filter(x=>x&&!['mr','mrs','ms','miss','dr','doctor','prof','professor','sir','consultant','associate','frcs','frcp','mbbs','mbchb','phd','mrcs','mrcp'].includes(x));
}
function compatibleNames(a,b) {
  const aa=nameTokens(a),bb=nameTokens(b); if(!aa.length||!bb.length) return false;
  if(aa.join(' ')===bb.join(' ')) return true;
  if(aa.length<2||bb.length<2||aa.at(-1)!==bb.at(-1)) return false;
  if(aa[0]===bb[0]) return true;
  return (aa[0].length===1||bb[0].length===1)&&aa[0][0]===bb[0][0];
}
function profileIdentity(value,name) {
  const url=safeUrl(value); if(!url) return null;
  const u=new URL(url); u.hash=''; u.search='';
  let path; try { path=decodeURIComponent(u.pathname); } catch { return null; }
  if(!path || path==='/' || /\.(?:pdf|png|jpg|jpeg|gif)$/i.test(path)) return null;
  const slug=path.split('/').filter(Boolean).at(-1);
  const person=slug.replace(/\.html?$/i,'').replace(/-(?:c|p|n|ch)\d{4,9}$/i,'').replace(/-/g,' ');
  const tokens=nameTokens(name),pathTokens=nameTokens(person);
  const named=compatibleNames(name,person)||(tokens.length>=2&&tokens.every((token,index)=>pathTokens[index]===token));
  const known=/\b(?:consultants?|consultant-profiles|stepconsultantprofile|practitioners?|doctors?|specialists?|consultant-view)\b/i.test(path)
    || /finder\.bupa\.co\.uk$/i.test(u.hostname) && /\d{4,}/.test(path)
    || /phin\.org\.uk$/i.test(u.hostname) && /profiles?\//i.test(path);
  if(!named&&!known) return null;
  const spire=/^(?:www\.)?spirehealthcare\.com$/i.test(u.hostname);
  const suffix=spire ? slug.match(/-([cpn]|ch)(\d{4,9})$/i) : null;
  // Opaque provider IDs have no comparable person name. A named URL is only a
  // corroboration signal; disagreement is a review hold, never a reassignment.
  const nameComparable=pathTokens.length>=2&&(known||/^(?:mr|mrs|ms|miss|dr|prof|professor|sir)-/i.test(slug));
  return {url:u.href.replace(/\/$/,''),named,known,spire,nameComparable,sourceName:nameComparable?person:null,suffix:suffix?{type:suffix[1].toLowerCase(),number:suffix[2]}:null};
}
function canonicalProfileUrl(value) {const url=safeUrl(value);if(!url)return null;const u=new URL(url);u.hash='';u.search='';return u.href.replace(/\/$/,'');}
// Official HCPC profession prefixes are an inconsistency check, not register
// verification or permission to replace an identifier in a merged source row.
const HCPC_PROFESSION_CODES=[
  ['AS',/\b(?:art|drama|music)\s+therap(?:ist|y)\b/i],['BS',/\bbiomedical scientist\b/i],
  ['CH',/\b(?:chiropod(?:ist|y)|podiatr(?:ist|y|ic surgeon|ic surgery))\b/i],['CS',/\bclinical scientist\b/i],
  ['DT',/\b(?:dietitian|dietician|dietetics)\b/i],['HAD',/\bhearing aid dispenser\b/i],
  ['ODP',/\boperating department practitioner\b/i],['OR',/\borthopt(?:ist|ics)\b/i],
  ['OT',/\boccupational therap(?:ist|y)\b/i],['PA',/\bparamedic\b/i],
  ['PH',/\bphysiotherap(?:ist|y)\b/i],['PO',/\b(?:prosthetist|orthotist)\b/i],
  ['PYL',/\bpsycholog(?:ist|y)\b/i],['RA',/\bradiograph(?:er|y)\b/i],
  ['SL',/\bspeech (?:and |& )?language therap(?:ist|y)\b/i],
];
function sourceIdentityChecks(row,regs,identities,reviews) {
  const assertions=[];
  const add=(issue,evidence)=>assertions.push({issue,...evidence});
  for(const registration of regs.filter(r=>r.body==='HCPC')) {
    const prefix=registration.identifier.match(/^[A-Z]+/)?.[0];
    for(const [field,value]of [['specialty',row.specialty],['professional_role',row.professional_role||row.role]]) {
      const role=normalizeText(value),compatiblePrefixes=HCPC_PROFESSION_CODES.filter(([,re])=>re.test(role)).map(([code])=>code);
      if(compatiblePrefixes.length&&!compatiblePrefixes.includes(prefix))add('hcpc-profession-role-conflict',{field,role,registration,prefix,compatiblePrefixes,sourceLabel:normalizeText(row[`${field}_source`])||'Integrated professional record',sourceUrl:sourceFor(row,field).sourceUrl,basis:'official-hcpc-profession-code-inconsistency',ruleSourceUrl:'https://www.hcpc-uk.org/check-the-register/how-to-check/',limitations:['The prefix/role disagreement needs human source reconciliation; no identifier has been changed or register status verified.']});
    }
  }
  for(const p of identities) if(p.nameComparable&&!p.named) add('profile-name-mismatch',{field:'profile_urls',sourceUrl:p.url,recordedName:normalizeText(row.name),sourceName:p.sourceName,basis:'named-provider-profile-url'});
  for(const [source,value]of Object.entries(row.name_alternatives||{})) {
    const name=normalizeText(value);if(name&&nameTokens(name).length>=2&&!compatibleNames(row.name,name))add('source-name-conflict',{field:`name_alternatives.${source}`,sourceUrl:safeUrl(row.profile_urls?.[source]),recordedName:normalizeText(row.name),sourceName:name,basis:'recorded-source-name'});
  }
  const boundUrls=new Set(professionalProfiles(row).map(canonicalProfileUrl));
  for(const review of reviews) {
    const sourceUrl=canonicalProfileUrl(review?.sourceUrl),observedAt=dateValue(review?.observedAt);
    const directBinding=boundUrls.has(sourceUrl),investigationBinding=asArray(review?.reviewedSourceRecordIds).map(String).includes(String(row.id))&&safeUrl(review?.corroboratingUrl);
    if(review?.checked!==true||!sourceUrl||!observedAt||(!directBinding&&!investigationBinding))continue;
    const name=normalizeText(review.name),registration=review.registration&&normalizeRegistration(review.registration.body,review.registration.identifier);
    const evidence={field:'profile_urls',sourceUrl,sourceLabel:normalizeText(review.sourceLabel),recordedName:normalizeText(row.name),sourceName:name||null,registration:registration||null,role:normalizeText(review.role)||null,sourceDate:dateValue(review.sourceDate),observedAt,excerpts:asArray(review.excerpts).map(normalizeText).filter(Boolean),basis:'reviewed-primary-provider-page',binding:directBinding?'exact-profile-url':'reviewed-source-record-investigation',...(investigationBinding?{corroboratingUrl:safeUrl(review.corroboratingUrl)}:{}),limitations:asArray(review.limitations).map(normalizeText).filter(Boolean)};
    if(name&&!compatibleNames(row.name,name))add('reviewed-source-name-conflict',evidence);
    const sameBody=registration&&regs.filter(r=>r.body===registration.body);
    if(sameBody?.length&&!sameBody.some(r=>r.identifier===registration.identifier))add('reviewed-source-registration-conflict',{...evidence,recordedRegistrations:sameBody});
    // Matching observations remain auditable too. They do not promote an
    // upstream mixed record into an approved identity or current practitioner.
    if(!assertions.some(a=>a.basis===evidence.basis&&a.sourceUrl===sourceUrl))assertions.push({issue:null,...evidence});
  }
  return assertions;
}
function registrations(row,issues) {
  const input=[['GMC',row.gmc_number],['HCPC',row.hcpc_number],['GDC',row.gdc_number],['NMC',row.nmc_number],
    ...asArray(row.registrations).filter(x=>x&&typeof x==='object').map(x=>[x.body||x.registration_body,x.identifier||x.number])];
  const output=[];
  for(const [body,value] of input) {
    if(value==null||normalizeText(value)==='') continue;
    const parsed=normalizeRegistration(body,value);
    if(parsed) output.push(parsed); else issues.push(`invalid-${body.toLowerCase()}-identifier`);
  }
  let distinct=[...new Map(output.map(x=>[`${x.body}:${x.identifier}`,x])).values()];
  const hcpc=distinct.find(x=>x.body==='HCPC'),gmc=distinct.find(x=>x.body==='GMC');
  const clearlyNonMedical=/\b(?:physiotherap(?:ist|y)|dietiti(?:an|cs)|dietician|clinical psychologist|counselling psychologist|genetic counsellor|podiatr(?:ist|y)|occupational therap|speech and language therap|radiographer|orthoptist)\b/i.test(normalizeText(row.specialty));
  if(gmc&&((hcpc&&Number(hcpc.identifier.replace(/^\D+/,''))===Number(gmc.identifier))||clearlyNonMedical)) {
    distinct=distinct.filter(x=>x!==gmc);issues.push('invalid-gmc-attribution');
  }
  for(const body of unique(distinct.map(x=>x.body))) if(distinct.filter(x=>x.body===body).length>1) issues.push('conflicting-registration-identifiers');
  return distinct;
}
function professionalProfiles(row) {
  const urls=typeof row.profile_urls==='object'&&row.profile_urls ? Object.values(row.profile_urls).filter(x=>typeof x==='string') : [];
  return unique([...urls,...asArray(row.profile_url),...asArray(row.profileUrl),...asArray(row.urls).filter(url=>profileIdentity(url,row.name)?.named)].map(safeUrl));
}
function sourceFor(row,field,item={}) {
  const supplied=normalizeText(item.source||item.sourceLabel||row[`${field}_source`]||'');
  const profiles=row.profile_urls&&typeof row.profile_urls==='object'?row.profile_urls:{};
  const provider=Object.entries(profiles).find(([key])=>key.toLowerCase()===supplied.toLowerCase());
  const sourceUrl=item.repairProvenance&&item.sourceUrl===null?null:safeUrl(item.sourceUrl||item.source_url||item.url||row[`${field}_source_url`]) || safeUrl(provider?.[1]);
  return {sourceRecordId:String(row.id),field,sourceUrl,sourceLabel:supplied||'Integrated professional record',
    dates:{sourceDate:dateValue(item.sourceDate||item.source_date||item.published_at),observedAt:item.repairProvenance&&item.observedAt===null?null:dateValue(item.observedAt||item.retrieved_at||row.source_retrieved_at),mergeDate:dateValue(row.merge_date)},
    attribution:sourceUrl?'linked-source':'source-record',...repairProvenance(item.repairProvenance)};
}
function repairProvenance(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const kept={};
  for(const [key,max]of Object.entries({releaseId:160,baselineSha256:64,beforeHash:64,snapshotSha256:64,parserVersion:160,reviewId:240,originalSourceField:160})){
    const item=value[key];if(typeof item!=='string'||!item||item.length>max)continue;
    if(/Sha256$|Hash$/.test(key)&&!/^[a-f0-9]{64}$/.test(item))continue;
    kept[key]=item;
  }
  return Object.keys(kept).length?{repairProvenance:kept}:{};
}
const ATTRIBUTES={
  modality:[['cardiac CT',/\b(?:cardiac[ /-]*(?:coronary[ /-]*)?(?:CT|computed tomography)|coronary[ /-]*(?:CT|computed tomography)|CT\s+coronary|CTCA)\b/i],['cardiac MRI',/\b(?:cardiac|cardiovascular)\s+(?:MRI|magnetic resonance)|\bCMR\b/i],['CT',/\bCT\b|computed tomography/i],['MRI',/\bMRI\b|magnetic resonance/i],['dermoscopy',/dermoscop/i],['ultrasound',/ultrasound|sonograph/i],['echocardiography',/echocardiog|\becho\b/i],['radiography',/radiograph|x[ -]?ray/i],['endoscopy',/endoscop/i],['robotic surgery',/robotic\s+(?:surg|procedure)|da vinci|hugo platform/i],['electrocardiography',/\bECG\b|electrocardiogra/i]],
  condition:[['coronary artery disease',/coronary\s+(?:artery\s+|heart\s+)?disease|ischaemic\s+heart\s+disease|ischemic\s+heart\s+disease/i],['skin lesions',/skin\s+lesions?|mole\s+(?:check|assess|screen|map)/i],['skin cancer',/skin\s+cancer|melanoma|basal\s+cell\s+carcinoma|squamous\s+cell\s+carcinoma/i],['heart failure',/heart\s+failure/i],['diabetes',/diabet/i],['endometriosis',/endometriosis/i],['knee pain',/knee\s+pain/i],['stroke',/\bstroke\b/i],['cancer',/\bcancer\b|oncolog/i]],
  population:[['adults',/\badults?\b/i],['children',/\bchildren\b|paediatric|pediatric/i],['older adults',/older\s+(?:adults?|people)|elderly|geriatric/i],['pregnancy',/pregnan|antenatal/i],['adolescents',/adolescen|teenage/i],['athletes',/\bathletes?\b|\bsportspeople\b|\bsportsmen\b|\bsportswomen\b/i]],
  setting:[['primary care',/primary\s+care|\bgeneral\s+practi(?:ce|tioner)|\bGPs?\b/i],['community',/community\s+(?:care|practice|clinic|setting|service)/i],['home',/\bhome\s+(?:care|monitor|use|setting|treatment)/i],['emergency care',/emergency\s+(?:care|department|medicine)|accident\s+and\s+emergency/i],['teaching hospital',/teaching\s+hospital/i],['NHS',/\bNHS\b/i],['hospital',/\bhospital\b/i],['outpatient',/outpatient/i]],
  activity:[['image interpretation',/\b(?:interpret|report|read)(?:s|ed|ing)?\b.{0,65}\b(?:scan|CT|MRI|imag)|\b(?:scan|CT|MRI|imag).{0,65}\b(?:interpret|report)(?:s|ing|ation)?\b/i],['clinical practice',/\b(?:perform|treat|manage|diagnose|supervise|practis|practic)(?:s|es|ing|e)?\b/i],['clinical research',/research|\btrials?\b|clinical\s+stud/i],['diagnostic study evaluation',/diagnostic\s+(?:accuracy|performance|stud)|(?:evaluat|assess|validat).{0,50}(?:diagnostic\s+stud|clinical\s+evidence)/i],['device evaluation',/(?:medical\s+device|technology).{0,45}(?:evaluat|assess|validat)|(?:evaluat|assess|validat).{0,45}(?:medical\s+device|technology)/i],['teaching',/\bteach|\btrain(?:ing|s|ed)?\b|lectur/i],['implementation',/implement|establish.{0,30}(?:service|programme)|set\s+up.{0,30}(?:service|programme)/i]],
};
const PURE_METADATA_FIELDS=/^(?:locations|registration|qualifications|detailed_qualifications|professional_memberships|nhs_posts|nhs_base|professional_role|specialty|specialties|specialty_alternatives|publications)$/;
const emptyAttributes=()=>Object.fromEntries(Object.keys(ATTRIBUTES).map(key=>[key,[]]));
const aspirationalActivity=text=>/\b(?:hopes? to|plans? to|would like to|aims? to|interested in becoming|aspir(?:e|es|ing) to)\b/i.test(text);
const activityClauses=text=>sourceStatements(text).flatMap(part=>part.split(/\s+(?=(?:but|however|whereas)\b)|\s+and\s+(?=(?:(?:routinely|regularly|currently|weekly)\s+)?(?:holds?|reports|performs|lectures|teaches)\b)/i)).filter(Boolean);
const degreeStatement=text=>/\b(?:MSc|MClinRes|BSc|MBBS|MBChB|Master[’']?s|Bachelor[’']?s|Research MD|PhD|doctorate|degree|diploma|certificates?)\b/i.test(text)&&/\b(?:complet(?:ed|ing|es)|stud(?:y|ied|ying)|hold(?:s|ing)?|has|have|obtain(?:ed|ing)|award(?:ed)?|graduat(?:ed|ing)|undertook|pursu(?:ed|ing))\b/i.test(text);
// A credential may permit an activity without saying it has been performed.
// Evaluate within each source clause so a separate reporting statement survives.
const credentialCapability=text=>/\b(?:accreditation|certification|certificate|credential|accredited|certified|qualified|authori[sz]ed|licensed)\b/i.test(text)&&/\b(?:enabl(?:e|es|ing)|permit(?:s|ting)?|allow(?:s|ing)?|eligible|entitl(?:e|es|ed|ing)|qualified\s+to|certified\s+to|accredited\s+to|authori[sz]ed\s+to|licensed\s+to)\b/i.test(text);
const interestScoped=text=>/\b(?:interests?\s+(?:is|are|was|were|in|to|includes?|involves?)|interested in|interest\s+is\s+to|expertise\s+in)\b/i.test(text);
const personalActivity=text=>/\b(?:marathon runner|triathlete|keen runner|amateur athlete|my\s+(?:wife|husband|children|family)|spare\s+time|outside\s+(?:of\s+)?(?:work|medicine|my professional life)|hobbies|golf club|married with)\b|\benjoys?\s+(?:running|strength training|playing|skiing|golf|tennis|travel|music|cycling|walking)\b/i.test(text);
function teachingActivity(text) {
  // A training placement or a teaching-hospital name identifies the learner or
  // institution. Require delivery, supervision or an explicit educator role.
  return activityClauses(text).some(clause=>!aspirationalActivity(clause)&&/\b(?:teach(?:es|ing)?|train(?:s|ing|ed)?|educat(?:e|es|ing)|supervis(?:e|es|ing))\s+(?:(?:many|numerous|several|medical|junior|trainee|surgical|hospital|undergraduate|postgraduate|other)\s+)*(?:students?|doctors?|surgeons?|colleagues|nurses?|GPs?|residents?|trainees?|techniques)\b|\b(?:clinical teacher|lectur(?:er|ing|es|ed)|accredited trainer|teaching awards?|faculty member|training program(?:me)? director|lead for education)\b|\b(?:provid(?:e|es|ed|ing)|deliver(?:s|ed|ing)?|leads?)\s+(?:clinical |medical |surgical )?(?:teaching|training|education)\b|\b(?:run(?:s)?|direct(?:s|ed)?|develop(?:s|ed)?)\b.{0,100}\b(?:teaching programme|educational courses?|courses?|symposium)\b|\bfaculty\s+on\b.{0,45}\b(?:teaching|training|educational)\b|\bteach(?:es|ing)?\b.{0,100}\bto\s+(?:other\s+)?(?:doctors?|surgeons?|students?)\b|\b(?:national |clinical )?lead for\b.{0,45}\b(?:training|education)\b|\b(?:teaching|training|education)\s+of\s+(?:future\s+)?(?:medical professionals|doctors|surgeons|students|trainees)\b|\b(?:provid(?:e|es|ed|ing)|deliver(?:s|ed|ing)?)\b.{0,45}\bsupervision\s+for\b.{0,70}\b(?:trainees|students|doctors|surgeons)\b|\b(?:co[- ]?organiser|organizer|organises|organizes|organised|organized)\b.{0,80}\b(?:training events?|teaching courses?|educational courses?)\b/i.test(clause));
}
function receivedTraining(text) {
  return degreeStatement(text)||credentialCapability(text)||/\b(?:trained|graduated|qualified|studied|learnt|learned)\b|\btaught\s+(?:me|him|her|them)\b|\b(?:received|complet(?:ed|ing)|undertook|underwent|pursued)\b.{0,65}\b(?:education|training|fellowship)\b|\bconducted\s+(?:sub[- ]specialty\s+|specialist\s+)?fellowship\s+training\b|\b(?:my|his|her|their)\s+(?:(?:specialist|medical|surgical)\s+)?(?:training|fellowship)\b|\btraining\s+(?:in|at|under)\b|\b(?:completed|undertook|awarded)\s+(?:an?\s+)?fellowships?\b/i.test(text);
}
function researchActivity(text) {
  return activityClauses(text).some(clause=>{
    if(aspirationalActivity(clause))return false;
    const source=clause.replace(/\b(?:undergraduate|postgraduate|medical|university)\s+studies\b/gi,'education');
    const role=/\b(?:principal|chief|co[- ]?)\s*investigator\b|\b(?:am|is|was|appointed|became)\b.{0,45}\bresearch\s+(?:lead|fellow|director|associate|coordinator)\b|\b(?:director|head|lead)\s+(?:of|for)\s+research\b|\b(?:my|his|her|our|their)\s+(?:clinical |translational )?research\b.{0,70}\b(?:focus(?:s?ed|es)|investigat\w*|examin\w*|programme|program)\b|\b(?:active\s+)?contributor\s+to\s+(?:clinical\s+)?research\b/i.test(source);
    const work=/\b(?:lead(?:s|ing)?|led|conduct(?:s|ed|ing)?|undertak(?:e|es|en|ing)|undertook|complet(?:e|es|ed|ing))\s+(?:(?:a|an|the|my|his|her|our|their|several|many|multicentre|clinical|diagnostic|translational|programme|program|of|systematic)\s+){0,8}(?:research(?!\s+(?:MD|MSc|degree|Master))|trials?|stud(?:y|ies))\b|\b(?:involv(?:ed|ement)|engaged|participat(?:e|es|ed|ing|ion)|recruit(?:ed|s|ing))\s+(?:actively\s+)?(?:in|to|for)\b.{0,65}\b(?:research|trials?|stud(?:y|ies))\b|\b(?:co-?author(?:ed)?|authored|published|presented)\b.{0,85}\b(?:research|papers?|articles?|stud(?:y|ies)|protocol|findings|results|publications?)\b/i.test(source);
    return role||work;
  });
}
const RELATIONSHIP_ORGANISATION='(?:compan(?:y|ies)|industry|industrial|pharmaceutical|pharma|manufacturers?|start[- ]up|St Jude Medical|AGA Medical|Medtronic|Siemens|Philips|Acumed|Swemac)';
const RELATIONSHIP_ACTIVE=new RegExp(`\\b(?:consults|consulting|advises?|advising|proctors?)\\b.{0,100}\\b${RELATIONSHIP_ORGANISATION}\\b|\\b(?:serves?|acts?|works?)\\s+(?:as )?(?:an? )?(?:consultant|advisor|adviser)\\s+(?:to|for|with)\\b.{0,100}\\b${RELATIONSHIP_ORGANISATION}\\b`,'i');
const RELATIONSHIP_DIRECT=new RegExp(`\\b(?:consultant|advisor|adviser|advisory)\\s+(?:(?:clinical|medical|scientific|independent|external|international)\\s+){0,3}(?:for|to|with|at|on)\\b.{0,100}\\b${RELATIONSHIP_ORGANISATION}\\b|\\b(?:directors?|shareholders?|co[- ]?founder|founder|chief (?:clinical|medical|executive|scientific) officer)\\s+(?:(?:and|chief|clinical|medical|executive|scientific|officer)\\s+){0,6}(?:for|to|with|at|of|on)\\b.{0,100}\\b${RELATIONSHIP_ORGANISATION}\\b|\\b${RELATIONSHIP_ORGANISATION}\\b.{0,35}\\b(?:advisory (?:boards?|panels?)|consultant|shareholder|co[- ]?founder)\\b`,'i');
const RELATIONSHIP_FUNDING=new RegExp(`\\b(?:funded|funding|sponsored|sponsorship|employed|employment)\\s+(?:by|from|with)\\b.{0,100}\\b${RELATIONSHIP_ORGANISATION}\\b|\\b${RELATIONSHIP_ORGANISATION}\\b.{0,50}\\b(?:funded|funds|sponsors|sponsored|employs|employed)\\b`,'i');
function relationshipActivity(text) {
  // Insurance acceptance and self-payment are not manufacturer relationships;
  // 'pharmacologist' is a clinical role, not the word 'pharmaceutical'.
  return activityClauses(text).some(clause=>{
    if(aspirationalActivity(clause))return false;
    const clean=clause.replace(/\bself[- ]funded\b|\bself[- ]pay(?:ing)?\b/gi,'').replace(/\b(?:major |private |health )?insurance companies\b/gi,'').replace(/\b(?:hospital(?:s)? (?:and|&) )?health\s*care industry\b/gi,'healthcare sector').replace(/\bWorshipful Company\b/gi,'Professional livery body');
    // Award titles can themselves contain 'consultant' or a commercial brand.
    // Retain a separately asserted active advisory/funding relationship, but
    // never infer one from a role-shaped title inside recognition prose.
    const recognition=/\b(?:awards?|prizes?|medals?|honou?r|recognised|recognized)\b/i.test(clean);
    return RELATIONSHIP_ACTIVE.test(clean)||RELATIONSHIP_FUNDING.test(clean)||(!recognition&&RELATIONSHIP_DIRECT.test(clean));
  });
}
function bibliographicReference(text) {
  // Author-initials/title listings are searchable references; a title about a
  // training model does not describe training received by the profile owner.
  return /^(?:(?!Dr\b|Mr\b|Mrs\b|Ms\b|Prof\b)[A-Z][A-Za-z’'-]+\s+[A-Z]{1,4}[.,])/.test(text.trim())||/\bdoi\s*:\s*10\.\d{4,9}\//i.test(text);
}
function directClinicalActivity(text) {
  return activityClauses(text).some(clause=>{
    if(aspirationalActivity(clause)||interestScoped(clause)||credentialCapability(clause)||teachingActivity(clause)||/\btrained\s+(?:in|using|with)\b/i.test(clause)||/\b(?:learnt|learned|taught (?:me|him|her|them)|trained to|training to|learn(?:ing)? to)\b|\b(?:undertak\w*|undertook|complet\w*)\b.{0,40}\b(?:training|fellowship|education|courses?)\b/i.test(clause))return false;
    if(/\b(?:I|he|she)\s+(?:only\s+)?see(?:s)?\s+(?:adult|paediatric|pediatric)\s+(?:(?:cardiology|cardiovascular|dermatology|respiratory|neurology|gastroenterology|ophthalmology)\s+)?patients\b|\bmanag(?:e|es|ed|ing)\s+(?:the\s+|a\s+)?(?:(?:full|broad|wide|entire)\s+)?(?:range|spectrum)\s+of\s+(?:adult\s+|paediatric\s+|pediatric\s+)?(?:cardiovascular|cardiac|dermatological|respiratory|neurological|gastrointestinal|ophthalmic)\s+(?:conditions?|diseases?|disorders?)\b/i.test(clause))return true;
    return /\b(?:undertak(?:e|es|ing)|perform(?:s|ed|ing)?|offer(?:s|ed|ing)?)\b.{0,65}\b(?:procedures?|clinics?|surgery|operations?|surgical treatment|cryotherapy|patient care|echocardiography|dermoscopy|endoscopy|bronchoscopy|angiography|ultrasound|CT|MRI|scans?|imaging|injections?|diagnostic tests?)\b|\brun(?:s|ning)?\b.{0,50}\bclinics?\b|\b(?:surgical |clinical )?procedures? undertaken\b|\b(?:I|he|she)\s+(?:only\s+)?see(?:s)?\s+(?:patients|children|adults)\b|\b(?:report(?:s|ed|ing)?|interpret(?:s|ed|ing)?|read(?:s|ing)?|supervis(?:e|es|ed|ing))\b.{0,45}\b(?:CT|MRI|scans?|images?|imaging|echocardiography|ultrasound|radiographs?|pathology|patient care)\b|\b(?:treat(?:s|ed|ing)?|diagnos(?:e|es|ed|ing))\s+(?!myself\b|himself\b|herself\b|themselves\b)[^.;]{2,70}|\bmanag(?:e|es|ed|ing)\s+(?:patients?|people|children|adults|diabetes|heart failure|cancer|pain|disease)\b|\bpracti[cs](?:e|es|ed|ing)\s+(?:as a |in )?(?:surgeon|physician|cardiolog\w*|radiolog\w*|dermatolog\w*|medicine)\b/i.test(clause);
  });
}
function extractAttributes(text,context={}) {
  const field=typeof context==='string'?context:context.field||'',type=typeof context==='string'?classifyPassage(text,field):context.type;
  const clean=normalizeText(text),output=emptyAttributes();
  if(PURE_METADATA_FIELDS.test(field)||/^professional_context\.(?!(?:condition|biography|clinical-interest|recorded-procedure|research-interest|treatment-listing)$)/.test(field)||type==='location')return output;
  // Background affiliations and qualifications can contain clinical words in
  // organisation or journal names. Keep their exact text searchable, without
  // promoting those names into individual practice/population attributes.
  if(type==='professional-background') {
    if(teachingActivity(clean))output.activity.push('teaching');
    return output;
  }
  const attributable=activityClauses(clean).filter(part=>{
    const practice=directClinicalActivity(part);
    if(personalActivity(part)&&!practice&&!researchActivity(part)&&!teachingActivity(part))return false;
    if(degreeStatement(part)&&!researchActivity(part)&&!practice)return false;
    const institutional=/\b(?:professor|academic|honorary|based at|appointment)\b/i.test(part)&&/\b(?:university|hospital|research cent(?:re|er)|institute)\b/i.test(part);
    if(institutional&&!practice)return false;
    return !(/\b(?:journal|society|association|specialist register|institute of)\b/i.test(part)&&!researchActivity(part)&&!practice);
  }).join('\n');
  const therapeuticUltrasound=/\bultrasound\s+phacoemulsification\b|\bhigh[- ]intensity focused ultrasound\b|\btherapeutic ultrasound\b|\bHIFU\b/gi;
  for(const [key,terms]of Object.entries(ATTRIBUTES))output[key]=terms.filter(([label,re])=>re.test(key==='modality'&&label==='ultrasound'?attributable.replace(therapeuticUltrasound,''):attributable)).map(([label])=>label);
  if(therapeuticUltrasound.test(attributable))output.modality.push('therapeutic ultrasound');
  output.activity=output.activity.filter(activity=>{
    if(activity==='teaching')return teachingActivity(clean);
    if(activity==='clinical practice')return type==='clinical-practice'&&directClinicalActivity(attributable)&&!/\b(?:medico[ -]?legal|expert witness|legal firms?)\b/i.test(clean);
    if(activity==='clinical research')return ['research','trial'].includes(type)&&researchActivity(clean);
    if(activity==='image interpretation')return type==='clinical-practice'&&directClinicalActivity(attributable);
    if(activity==='device evaluation'||activity==='diagnostic study evaluation')return ['clinical-practice','research','trial'].includes(type)&&(directClinicalActivity(attributable)||researchActivity(attributable));
    return true;
  });
  return output;
}
function classifyPassage(text,field='') {
  if(bibliographicReference(text))return 'professional-background';
  if(/publication/i.test(field)) return 'publication';
  if(/trial|isrctn/i.test(field)) return 'trial';
  if(/research/i.test(field)) return researchActivity(text)?'research':'clinical-interest';
  if(/qualifications?|memberships?|nhs_(?:posts|base)|specialt|professional_experience/i.test(field)) return 'professional-background';
  if(/procedure/i.test(field)) return 'procedure';
  if(relationshipActivity(text))return 'relationship';
  if(degreeStatement(text)&&!researchActivity(text)&&!directClinicalActivity(text)&&!teachingActivity(text))return 'training';
  if(/\b(?:awards?|prizes?|medals?|studentships?|scholarships?|grants?|funding)\b/i.test(text)&&!researchActivity(text)&&!directClinicalActivity(text)&&!teachingActivity(text))return 'professional-background';
  if(/\b(?:GMC|HCPC|GDC|NMC)\s+(?:specialist\s+)?register|\bspecialist register\b|^\s*(?:clinical |research )?interests\s*:?[\s]*$/i.test(text))return 'professional-background';
  if(/\bqualifications?\s+and\s+memberships?\b/i.test(text))return 'professional-background';
  if(/\b(?:member|fellow)\s+of\b.{0,120}\b(?:society|association|academy|college)\b/i.test(text)&&!researchActivity(text)&&!/\b(?:treat(?:s|ed|ing)?|perform(?:s|ed|ing)?|interest(?:s)? in)\b/i.test(text))return 'professional-background';
  if(/\b(?:medico[ -]?legal|expert witness|legal firms?|medical reports?)\b/i.test(text)&&!/\b(?:treat(?:s|ed|ing)?|perform(?:s|ed|ing)?|diagnos(?:e|es|ed|ing))\b/i.test(text))return /interests|areas_of_interest/i.test(field)?'clinical-interest':'professional-background';
  if(/clinical_interests|areas_of_interest|teaching_interests/.test(field)&&!researchActivity(text))return 'clinical-interest';
  if(aspirationalActivity(text))return 'clinical-interest';
  if(/\b(?:training|teaching|instruction)\b/i.test(text)&&/\b(?:patients?|consultation|if prescribed)\b/i.test(text)&&/\b(?:autoinjectors?|inhalers?|nasal spray|self[- ](?:care|administration)|injection technique|use of (?:a |the )?device)\b/i.test(text))return 'clinical-practice';
  if(directClinicalActivity(text))return 'clinical-practice';
  if(teachingActivity(text)&&!researchActivity(text))return 'professional-background';
  if(receivedTraining(text) && !/\b(?:routinely|regularly|currently)\b/i.test(text)&&!researchActivity(text)) return 'training';
  if(researchActivity(text)) return 'research';
  if(/\b(?:supervis(?:e|es|ing)|lead(?:s|ing)?|conduct(?:s|ing|ed)?)\b.{0,110}\baudit\b/i.test(text)&&!directClinicalActivity(text)&&!/\b(?:treat(?:s|ed|ing)?|interpret(?:s|ed|ing)?|diagnos(?:e|es|ed|ing))\b/i.test(text))return 'professional-background';
  if(/\binterests?\b.{0,60}\b(?:research|trials?|clinical studies)\b/i.test(text))return 'clinical-interest';
  if(teachingActivity(text)&&!/\b(?:perform(?:s|ed|ing)?|interpret(?:s|ed|ing)?|treat(?:s|ed|ing)?|diagnos(?:e|es|ed|ing))\b/i.test(text))return 'professional-background';
  // Unscoped words such as 'practice', 'manage' or 'report' do not identify a
  // clinical action. Preserve uncertain professional prose as background.
  if(/interest|specialis|specializ|expertise/i.test(text)||/interests|areas_of_interest/i.test(field)) return 'clinical-interest';
  return 'professional-background';
}
function qualifiers(text,type) {
  const output=[];
  if(/\b(?:previously|formerly|retired|until\s+\d{4}|was\s+a|used\s+to)\b/i.test(text)) output.push('historical');
  if(type==='clinical-interest'||/developing\s+interest|interested\s+in|interests?\s+in/i.test(text)) output.push('stated-interest');
  if(type==='clinical-interest'&&/research|trial|stud(?:y|ies)/i.test(text))output.push('research-interest-not-study-experience');
  if(bibliographicReference(text))output.push('bibliographic-reference-not-training-or-authorship');
  if(/\b(?:medico[ -]?legal|expert witness|legal firms?)\b/i.test(text))output.push('legal-work-not-clinical-care');
  if(type==='training') output.push('training-not-practice');
  if(/\b(?:currently|routinely|regularly|weekly|full[ -]time)\b/i.test(text)&&type==='clinical-practice') output.push('reported-current-practice');
  if(/\b(?:no|not|never|without|do not|does not|did not)\b/i.test(text)) output.push('contains-negation');
  if(type==='relationship') output.push('relationship-not-conflict-determination');
  if(/\b(?:(?:more than|over|approximately|around|up to)\s+)?\d[\d,]*\s+(?:(?:peer[- ]reviewed|clinical|surgical|diagnostic|medical)\s+){0,2}(?:procedures|operations|scans|cases|patients|publications|articles)\b/i.test(text)) output.push('self-reported-activity');
  return output;
}
function sourceStatements(value) {
  const text=normalizeText(value); if(!text) return [];
  // A detached "No" cannot safely be discarded while retaining its adjacent
  // list as positive evidence. Keep the complete source block and its scope.
  if(negativeList(text))return [text];
  // Several source bios omit the space between complete sentences. Split at
  // recognised sentence starts without rewriting any supporting words. Share
  // these boundaries with activity classification and the requirement matrix.
  // The glued professional-title boundary is deliberately case-sensitive:
  // /i would read the tail of "problems and has" as "Ms And has", changing
  // the original word. Other sentence/pronoun boundaries remain insensitive.
  const parts=text.split(/(?<=[a-z])(?=(?:Dr|Mr|Mrs|Ms|Miss|Professor)\s+[A-Z][a-z’'-]+\s+(?:is|has|provides|performs|reports)\b)/).flatMap(part=>part.split(/(?<=\.)(?=(?:Dr |Mr |Mrs |Ms |Miss |Prof |Professor |He |She |His |Her |I |My |Aside |After |During |Currently\b|Presently\b|Previously\b|Today\b|Now\b|At present\b|[A-Z][a-z]{2,} (?:enjoys?|is |has |was )))|(?<=;)\s*(?=(?:I|he|she|we|they|currently|presently|at present)\b)|\n+(?=(?:Currently|Presently|Previously|Today|Now|At present)\b)|\s+(?=(?:and|but)\s+(?:I|he|she|we|they)\b)/i));
  const sentenceSegments=parts.flatMap(part=>{
    // Intl treats every newline as a sentence boundary, including soft wraps
    // inside "running\ninjuries" and "Chris is\npassionate". Segment a
    // length-preserving shadow, then slice the ORIGINAL text at those offsets.
    // This retains explicit list/paragraph breaks without dropping short tails
    // or turning the following list into unqualified positive activity.
    const shadow=part.replace(/\n/g,' ');
    const units=SENTENCES ? [...SENTENCES.segment(shadow)].map(x=>part.slice(x.index,x.index+x.segment.length)) : part.split(/(?<=[.!?])\s+(?=[A-Z])/),joined=[];
    for(const unit of units){
      // Intl sentence segmentation treats Dr. and St. as sentence ends in some
      // runtimes. Keep abbreviations and initials attached to their source text.
      if(joined.length&&/\b(?:Dr|Mr|Mrs|Ms|Prof|St|Mt|Rd|Jr|Sr|[A-Z])\.\s*$/.test(joined.at(-1)))joined[joined.length-1]+=unit;
      else joined.push(unit);
    }
    return joined.map(line=>line.trim()).filter(Boolean);
  });
  return sentenceSegments;
}
function negativeList(text){return /(?:^|\n|[•*])\s*No\s*[:.!]?\s*(?=$|\n|[•*])/i.test(text)||/\b(?:do not|does not|did not|never|no longer)\b[^\n]*:\s*(?:\n|[•*])/i.test(text);}
function splitPassages(value) {
  const normalized=normalizeText(value);
  // Oversized ambiguous lists are withheld rather than split into unqualified
  // positive fragments. This bound matches the owned-source/profile contract.
  if(negativeList(normalized))return normalized.length<=5000?[normalized]:[];
  const sentenceSegments=sourceStatements(value);
  const output=[];
  for(const sentence of sentenceSegments) {
    let rest=sentence.trim(); while(rest.length>900) {
      let at=rest.lastIndexOf('; ',900); if(at<200) at=rest.lastIndexOf(' ',900); if(at<1) at=900;
      // A boundary created here must not leave a tiny tail that the biography
      // noise filter would discard. Rebalance using an original word boundary.
      if(rest.slice(at).trim().length<15){const earlier=rest.lastIndexOf(' ',rest.length-16);if(earlier>0&&earlier<at)at=earlier;}
      output.push(rest.slice(0,at).trim()); rest=rest.slice(at).trim();
    }
    if(rest) output.push(rest);
  }
  return output;
}
function splitRecordedBlock(value,{qualification=false}={}){
  const text=normalizeText(value);if(!text)return [];
  if(negativeList(text))return text.length<=5000?[text]:[];
  // Qualifications are structured source entries, not sentences. Full stops
  // in FRCS. (Ed.) / M.Sc. and repeated years bind different qualifications.
  if(qualification)return text.length<=5000?[text]:[];
  const output=[];let rest=text;
  while(rest.length>900){let at=rest.lastIndexOf('\n',900);if(at<200)at=rest.lastIndexOf('; ',900);if(at<200)at=rest.lastIndexOf(' ',900);if(at<1)at=900;output.push(rest.slice(0,at).trim());rest=rest.slice(at).trim();}
  if(rest)output.push(rest);return output;
}
function namedColleague(text,ownerName=''){
  // A named professional immediately after with/alongside owns this title.
  // Preserve capitalised name boundaries; do not interpret a clinical topic
  // or a generic multidisciplinary team as a newly identified person.
  const pattern=/\b(?:[Ww]ith|[Aa]longside)\s+((?:(?:Dr|Mr|Mrs|Ms|Miss|Professor|Prof)\.?\s+)?[A-Z][\p{L}’'-]+(?:\s+[A-Z][\p{L}’'-]+){1,3})\s*,\s*(?:(?:[Ww]orld[- ]renowned|[Cc]onsultant|[Ss]enior|[Cc]linical|[Cc]hartered|[Rr]egistered)\s+){0,4}(?:[Pp]hysiotherapist|[Dd]ietitian|[Rr]adiologist|[Cc]ardiologist|[Dd]ermatologist|[Oo]ncologist|[Ss]urgeon|[Pp]hysician|[Pp]sychologist|[Pp]sychiatrist|[Nn]urse|[Pp]odiatrist|[Rr]adiographer|[Oo]steopath)\b/u;
  const match=pattern.exec(text);
  return match&&(!ownerName||!compatibleNames(match[1],ownerName))?match:null;
}
function ownerAndColleaguePieces(text,ownerName){
  const match=namedColleague(text,ownerName);if(!match||match.index===0)return [text];
  const prefix=text.slice(0,match.index).trimEnd();
  // Splitting only this literal, explicit boundary retains an independently
  // stated owner activity without transferring the colleague's profession.
  // Generic joint-clinic descriptions remain qualified as a complete passage.
  return prefix.length>=15&&(directClinicalActivity(prefix)||researchActivity(prefix)||teachingActivity(prefix))?[prefix,text.slice(match.index).trimStart()]:[text];
}
function otherPersonScope(text,source,ownerName=''){
  if(namedColleague(text,ownerName))return true;
  const relationship=/\b(?:my|his|her|their)\s+(?:colleague|wife|husband|partner|assistant)\b/i;
  if(/^(?:my|his|her|their)\s+(?:colleague|wife|husband|partner|assistant)\b/i.test(text.trim()))return true;
  if(!/^(?:and\s+)?(?:he|she|they|his|her|their)\b/i.test(text.trim()))return false;
  const normalized=normalizeText(source),offset=normalized.indexOf(text);
  if(offset<=0)return false;
  const preceding=normalized.slice(0,offset);
  return relationship.test(preceding)||/\b(?:alongside|with)\s+(?:(?:Dr|Mr|Ms|Professor)\.?\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+/.test(preceding);
}
function collectiveContext(text,source,sourceContexts){
  const plural=/^(?:(?:and|but|together|in addition)[, ]+)?(?:we\b|our\b|(?:the|this|his|her|my|their)\s+(?:(?:clinical|specialist|multidisciplinary|medical)\s+)?(?:team|service|clinic|practice|hospital|department|unit)\b)/i;
  if(plural.test(text.trim()))return true;
  if(!/\b(?:we|our|team|service|clinic|practice|hospital|department|unit)\b/i.test(source))return false;
  // A long sentence may be split for display; its trailing chunk retains the
  // explicit team subject. A separate I/he/she sentence does not inherit it.
  if(!sourceContexts.has(source))sourceContexts.set(source,sourceStatements(source).filter(statement=>plural.test(statement)));
  return sourceContexts.get(source).some(statement=>statement.includes(text));
}
function subjectQualifiers(text,source,ownerName,sourceContexts){return [
  ...(otherPersonScope(text,source,ownerName)?['colleague-context-not-owner-evidence']:[]),
  ...(collectiveContext(text,source,sourceContexts)?['team-context-not-individual-activity']:[])
];}
function administrativeText(text){
  // Match actual navigation/booking instructions, never word prefixes such as
  // Contact dermatitis, Callus, Clicking shoulder or Books and publications.
  return /^(?:(?:book|call|contact|click)\s*$|book\s+(?:(?:an?|and|your|my|the)\s+)?(?:appointment|consultation|visit|online|now)\b|call\s+(?:us|me|now|today|to\s+book|or\s+book)\b|contact\s+(?:us|me|our|the\s+(?:team|clinic|hospital|practice)|for\s+(?:appointments?|enquir\w*)|details|information)\b|click\s*(?:here|to|on)\b|clickhere(?:to)?\b|contact\s+.{1,100}\bto\s+book\b|bookings?\s+and\s+referrals\b|make an enquiry\b|find out more\b|read more\b|consultation fees?\b)/i.test(text);
}
function contactDetails(text){
  // Keep a contact label attached to its value. 'Medical Contact Lens' with
  // role dates and 'mobile-bearing' with reference numbers are clinical text.
  // A career-appointment year range is not a phone number. Use this shadow
  // only for privacy detection; other contacts still trigger withholding.
  const contactText=text.replace(/\b(?:previous|past|clinical|academic|hospital|professional|training)\s+appointments?\s*:\s*(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\b/gi,match=>match.replace(/appointments?/i,'posts'));
  return /\b(?:(?:telephone|phone|tel\.?|mobile)(?:\s+(?:number|telephone|phone))?|contact(?:\s+(?:us|me|our team))?|(?:for\s+)?(?:bookings?|appointments?))\s*(?:(?:us|me)\s+)?(?:(?:on|at|via|is)\s*)?[:=]?\s*\+?\d[\d ()-]{8,}\d/i.test(contactText)||/\b(?:contact\s+(?:us|me)|book(?:\s+an?)?\s+(?:appointment|consultation)|booking(?:\s+page|\s+link)?)\s*(?:on|at|via)?\s*:?\s*https?:\/\//i.test(text);
}
function useful(text,field,{reviewedContext=false,reviewedShort=false}={}) {
  if(text.length<2||/^(?:null|none|unknown|n\/?a|not available|undefined)$/i.test(text)) return false;
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return false;
  if(contactDetails(text)) return false;
  if(/\b(?:my\s+(?:wife|husband|children|family)|spare\s+time|outside\s+(?:of\s+)?(?:work|medicine|my professional life)|hobbies|enjoy\s+(?:golf|ski|travel|music)|married\s+with|golf\s+club)\b/i.test(text)) return false;
  if(/\benjoys?\s+(?:running|strength training|playing|skiing|golf|tennis|travel|music|cycling|walking)\b/i.test(text))return false;
  if(/about/.test(field)&&/^(?:(?:I|he|she)\s+(?:was|am|is)\s+)?(?:born|brought up)\b|\b(?:I was|he was|she was)\s+born\b|^(?:(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+)?[A-Z][A-Za-z’'-]+(?:\s+[A-Z][A-Za-z’'-]+){0,2}\s+was\s+born\b|\b(?:I am|he is|she is)\s+(?:married|a (?:mother|father) of)\b|\b(?:I|he|she)\s+ha(?:ve|s)\s+(?:one|two|three|four|five|\d+)\s+children\b/i.test(text)&&!directClinicalActivity(text)&&!researchActivity(text)&&!receivedTraining(text))return false;
  if(/^(?:please see|refer to|see)\s+(?:the\s+)?(?:list|below|above|website)\b/i.test(text)&&!/[;:]/.test(text))return false;
  if(/\b(?:we hope|you (?:may|will)|please)\b.{0,70}\b(?:find|view|read)\b.{0,80}\b(?:information|pages|website)\b/i.test(text))return false;
  if(/^(?:clinical|research|specialist|personal|professional)\s+(?:interests?|experience|background|memberships?)\s*:?\s*$/i.test(text))return false;
  if(/\b(?:renowned globally|globally renowned|world renowned|world[- ]leading)\b/i.test(text)&&/\b(?:pioneer in the field|not just a|leading light)\b/i.test(text)&&!researchActivity(text)&&!Object.values(extractAttributes(text)).some(values=>values.length))return false;
  // The legacy broken-word heuristic also catches intact semicolon lists.
  // Only explicitly approved source-bound context may bypass this weak test;
  // unreconciled historical fields remain withheld. The stronger joined-word
  // corruption check below still applies to every field.
  if(!reviewedContext&&(text.match(/[a-z]{1,4};\s+[a-z]{1,5}\b/g)||[]).length>=4)return false;
  if((text.match(/;\s+[a-z]{1,6}(?=[A-Z])/g)||[]).length>=3)return false;
  if(administrativeText(text)) return false;
  if(/\b(?:pay member claim|missing information|cancellation (?:charge|fee)|billing|sign[ -]?up|register online)\b/i.test(text)) return false;
  if(/https?:\/\/\S*\/(?:patients|appointments|accounts|register|sign-up)\b/i.test(text)) return false;
  if(/^(?:being able to provide a clear understanding to patients|I always want to help patients)/i.test(text)) return false;
  if(/^(?:initial|follow[ -]up|new|review)\s+(?:out[ -]patient\s+)?consultation(?:\s*[-–]\s*(?:remote|face.to.face|video|telephone))?\s*$/i.test(text)) return false;
  if(/^(?:e medicine|ts inju)$/i.test(text)) return false;
  if(/about/.test(field)&&text.length<15&&!reviewedShort) return false;
  return true;
}
function valueEntries(value) {
  if(typeof value==='string'||typeof value==='number') return [{text:normalizeText(value)}];
  if(Array.isArray(value)) return value.flatMap(valueEntries);
  if(!value||typeof value!=='object') return [];
  const direct=value.text||value.about||value.procedure_name||(value.degree?[value.degree,value.description].filter(Boolean).join(' — '):null)||value.description||value.title||value.name||value.qualification||value.membership||value.post;
  if(direct) return [{...value,text:normalizeText(direct)}];
  // Source-keyed alternative biographies are common in the integrated table.
  return Object.entries(value).filter(([key])=>!/contact|email|phone|patient|booking|review|satisfaction/i.test(key))
    .flatMap(([key,item])=>valueEntries(item).map(x=>({...x,source:x.source||key})));
}
function volumeFor(item,field) {
  if(!item||typeof item!=='object'||!/procedure|volume/i.test(field)) return null;
  const period=normalizeText(item.reporting_period||item.period||item.date_range||item.year||'')||null;
  const range=normalizeText(item.count_range||item.count_bucket||item.range||item.volume||item.count||(typeof item.admissions==='string'&&/^(?:[<>]=?\s*\d+|\d+\s*[-–]\s*\d+)$/.test(item.admissions.trim())?item.admissions:'')||'')||null;
  const numeric=typeof item.count_numeric==='number' ? item.count_numeric : null;
  const reportedAdmissions=Number.isFinite(item.admissions)?item.admissions:null;
  if(!period&&!range&&numeric==null&&reportedAdmissions==null) return null;
  return {activity:normalizeText(item.description||item.procedure_name||item.procedure||item.name||item.text),reportedRange:range,reportingPeriod:period,
    reportedAdmissions,countNumeric:numeric,countNumericDerived:numeric!==null,comparable:false,sourceField:field,
    hospital:normalizeText(item.hospital)||null,procedureCode:normalizeText(item.code||item.procedure_id)||null,
    sourceUrl:safeUrl(item.source_url||item.sourceUrl),sourceDate:dateValue(item.sourceDate||item.source_date||item.last_updated)};
}
function projectedProfessionalField(row,field) {
  const exclusion=row._expertEvidenceExclusions?.[field];
  if(!exclusion)return row[field];
  if(!['nhs_base','specialty'].includes(field)||exclusion.approved!==true||!exclusion.reviewId||!exclusion.releaseId||require('./releases.cjs').hashValue(row[field])!==exclusion.beforeHash)throw Error('Invalid source-bound evidence projection exclusion');
  return null;
}
function rowEvidence(row) {
  // Scope analysis belongs to this preparation row only. Reuse the exact
  // source statements across its display chunks, then release them with it.
  const output=[],sourceContexts=new Map();
  const fields=['about','about_alternatives','specialty','specialty_alternatives','specialties','professional_role','clinical_interests','areas_of_interest','procedures',
    'procedures_completed','procedure_volumes_phin','research_interests','publications','qualifications','detailed_qualifications','professional_memberships',
    'nhs_posts','nhs_base','professional_experience','isrctn_trials','trials','teaching_interests'];
  for(const field of fields) {
    if(projectedProfessionalField(row,field)===null&&row._expertEvidenceExclusions?.[field])continue;
    const entries=[...new Map(valueEntries(row[field]).map(item=>[JSON.stringify(item),item])).values()],bySource=new Map();
    for(const item of entries){const key=JSON.stringify(sourceFor(row,field,item));if(!bySource.has(key))bySource.set(key,[]);bySource.get(key).push(item);}
    const contextual=[...bySource.values()].flatMap(items=>items.some(item=>/^No\s*[:.!]?$/i.test(item.text))?[{...items[0],text:items.map(item=>item.text).join('\n')}]:items);
    for(const item of contextual) {
    const source=sourceFor(row,field,item); const volume=volumeFor(item,field);
    // A bibliography/profile link is useful metadata, not proof of authorship,
    // study design or a clinician's contribution to any named paper.
    if(field==='publications'&&(/^(?:https?:\/\/|doi\s*[:/]|10\.\d{4,9}\/)/i.test(item.text))) {
      output.push({...source,text:`Publication or research reference supplied in the professional record: ${item.text}`,type:'professional-background',qualifiers:['publication-listing-link-not-authorship'],publication:{listingUrl:safeUrl(item.text),unverifiedReference:item.text}});
      continue;
    }
    const extra=field==='publications' ? {publication:{title:item.text,doi:normalizeText(item.doi)||null,journal:normalizeText(item.journal)||null,year:dateValue(item.year),authors:asArray(item.authors).filter(x=>typeof x==='string')}} : {};
    const pieces=(/^(?:qualifications|detailed_qualifications)$/.test(field)?splitRecordedBlock(item.text,{qualification:true}):field==='publications'?splitRecordedBlock(item.text):splitPassages(item.text)).flatMap(text=>/^about/.test(field)?ownerAndColleaguePieces(text,row.name):[text]);
    for(const text of pieces) if(useful(text,field)){const subject=subjectQualifiers(text,item.text,row.name,sourceContexts);output.push({text,...source,...extra,...(volume?{volume}:{}),...(subject.length?{type:'professional-background',qualifiers:subject}:{})});}
    }
  }
  // Only a trusted, professional-only release adapter supplies these fields.
  // They add attributed context; they never change canonical identity or role.
  const kinds={profession:'professional-background',condition:'clinical-interest',population:'professional-background',language:'professional-background',service:'professional-background',biography:null,qualification:'qualification',membership:'affiliation',affiliation:'affiliation','academic-background':'professional-background','clinical-interest':'clinical-interest','recorded-procedure':'procedure','research-interest':'clinical-interest','reported-activity':'activity-volume','treatment-listing':'treatment-listing','professional-body':'professional-background','research-background':'professional-background'};
  for(const item of asArray(row.professional_context)){
    if(!item||!Object.hasOwn(kinds,item.kind)||typeof item.text!=='string'||!(safeUrl(item.sourceUrl)||item.sourceUrl===null)||!item.repairProvenance?.releaseId||!item.repairProvenance?.reviewId)continue;
    const field='professional_context.'+item.kind;
    const qualifier={condition:['listed-condition-not-performed-care'],'clinical-interest':['stated-interest'],'research-interest':['stated-interest','research-interest-not-study-experience'],'recorded-procedure':['listed-procedure-not-observed-activity'],'treatment-listing':['listed-treatment-not-performed-activity'],'reported-activity':['reported-historical-activity-not-current-practice'],'research-background':['profile-reported-research-not-verified-authorship'],biography:[]}[item.kind]||['recorded-context-not-performed-activity'];
    const activity=item.activity,volume=activity?{activity:normalizeText(activity.procedureName)||item.text,reportedRange:activity.reportedRange||null,reportingPeriod:activity.period||null,reportedAdmissions:Number.isSafeInteger(activity.reportedAdmissions)?activity.reportedAdmissions:null,countNumeric:null,countNumericDerived:false,comparable:false,sourceField:item.repairProvenance.originalSourceField||field,hospital:activity.hospital||null,procedureCode:activity.procedureCode||null,sourceUrl:item.sourceUrl,sourceDate:item.sourceDate}:null;
    const pieces=(item.kind==='biography'?reviewedBiographySegments(item.text,{reviewId:item.repairProvenance.reviewId,policy:item.segmentationPolicy,split:splitPassages}):splitRecordedBlock(item.text,{qualification:['qualification','academic-background'].includes(item.kind)}).map(text=>({text}))).flatMap(piece=>item.kind==='biography'&&!piece.neutral?ownerAndColleaguePieces(piece.text,row.name).map(text=>({...piece,text})):[piece]);
    for(const piece of pieces){const text=normalizeText(piece.text),subject=subjectQualifiers(text,item.text,row.name,sourceContexts);if(useful(text,item.kind==='biography'?'about':field,{reviewedContext:true,reviewedShort:piece.reviewedShort===true}))output.push({text,...sourceFor(row,field,item),type:piece.neutral||subject.length?'professional-background':kinds[item.kind]||classifyPassage(text,'about'),qualifiers:[...qualifier,...(piece.neutral?['reviewed-source-context-not-independent-activity']:[]),...subject],...(volume?{volume}:{})});}
  }
  // Compact complete statements from the same source, field, evidential type and
  // qualifier state. Nothing is truncated: additional chunks retain the rest.
  // Keeping training/negated/historical material separate prevents a grouped
  // paragraph from silently acquiring the strength of its neighbouring claim.
  const packed=[];let previousKey=null;
  for(const entry of output) {
    const type=entry.type||classifyPassage(entry.text,entry.field);
    const qs=unique([...(entry.qualifiers||[]),...qualifiers(entry.text,type),...(entry.field==='research_interests'&&type!=='research'?['stated-interest','research-interest-not-study-experience']:[])]);
    const key=JSON.stringify([entry.field,entry.sourceUrl,entry.sourceLabel,entry.dates,type,qs,entry.repairProvenance||null]);
    // Only adjacent statements may share a chunk. Reusing a bucket after an
    // intervening activity moved later training/limitations out of source order.
    let current=key===previousKey?packed.at(-1):null;
    if(current&&entry.volume&&current.text.split('\n').includes(entry.text)) {
      if(entry.volume) (current.volumes??=[]).push(entry.volume);
      continue;
    }
    if(current&&current.text.length+entry.text.length+1<=900&&!entry.publication&&!current.publication) {
      current.text+='\n'+entry.text;
      if(entry.volume) (current.volumes??=[]).push(entry.volume);
      if(current.volumes?.length>1) delete current.volume;
    } else {
      current={...entry,type,qualifiers:qs,...(entry.volume?{volumes:[entry.volume]}:{})};
      packed.push(current);
    }
    previousKey=key;
  }
  return packed;
}
function cleanLocations(row) {
  const locationValue=value=>{const text=normalizeText(value);return /^(?:none|null|undefined|unknown|not (?:available|known)|n\/?a|-)$/i.test(text)?'':text;};
  const numeric=value=>typeof value==='number'?value:typeof value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())?Number(value):NaN;
  return asArray(row.locations).filter(x=>x&&typeof x==='object').map(item=>{
    const latitude=numeric(item.latitude??item.lat),longitude=numeric(item.longitude??item.lng??item.lon);
    const coordinates=Number.isFinite(latitude)&&Math.abs(latitude)<=90&&Number.isFinite(longitude)&&Math.abs(longitude)<=180;
    return {
    name:locationValue(item.hospital||item.name||item.organisation||item.organization),address:locationValue(item.address||item.street),
    city:locationValue(item.city),region:locationValue(item.region),postcode:locationValue(item.postcode),country:locationValue(item.country)||null,
    sourceUrl:safeUrl(item.website||item.sourceUrl),source:normalizeText(item.source)||null,sourceRecordId:String(row.id),field:'locations',
    provenance:sourceFor(row,'locations',item),
    ...(coordinates?{latitude,longitude,coordinateSource:safeUrl(item.coordinateSource)||safeUrl(item.sourceUrl||item.website)||'source-record',coordinatePrecision:locationValue(item.coordinatePrecision)||'recorded coordinates',coordinateProvenance:{kind:'source-record',sourceRecordId:String(row.id),field:'locations',sourceUrl:safeUrl(item.coordinateSource||item.sourceUrl||item.website)}}:{}),
  };}).filter(x=>x.name||x.address||x.postcode||x.city);
}
function reviewedProfessionHeading(row) {
  // A reviewed owner-profession assertion can improve the display heading
  // without changing canonical identity or becoming new requirement evidence.
  // Prefer its first literal profession noun, never a discipline adjective,
  // registration claim, biography inference or provider membership.
  const noun=/\b(?:general practitioner|clinical researcher|dietitian|nutritionist|physiotherapist|radiographer|podiatrist|psychologist|psychotherapist|occupational therapist|speech and language therapist|nurse|dentist|surgeon|cardiologist|radiologist|dermatologist|gastroenterologist|oncologist|ophthalmologist|gynaecologist|haematologist)\b/i;
  const labels=[];
  for(const item of asArray(row.professional_context)){
    if(item?.kind!=='profession'||!item.repairProvenance?.releaseId||!item.repairProvenance?.reviewId||!(safeUrl(item.sourceUrl)||item.sourceUrl===null))continue;
    const text=normalizeText(item.text),match=noun.exec(text);if(!match)continue;
    if(qualifiers(text,'professional-background').some(q=>q==='historical'||q==='contains-negation')||subjectQualifiers(text,text,row.name,new Map()).length)continue;
    if(/\b(?:worked|trained|experience|offering|offers|teaches|teaching|with|colleague|team)\b[^.!?;\n]*$/i.test(text.slice(0,match.index)))continue;
    labels.push(match[0][0].toUpperCase()+match[0].slice(1).toLowerCase());
  }
  const distinct=unique(labels);return distinct.length===1?distinct[0]:'';
}
function buildCorpus(input,{enrichments=[],identityReviews=[]}={}) {
  const rows=Array.isArray(input)?input:input?.rows;
  if(!Array.isArray(rows)) throw new TypeError('Expert corpus requires a professional row array.');
  const audit={inputRows:rows.length,candidates:0,searchableCandidates:0,passages:0,duplicateRowsMerged:0,heldForIdentityReview:0,excludedRows:0,invalidRegistrations:0,rejectedEnrichments:0,issues:{},types:{},attribution:{},scope:'Connected professional records; identities and source evidence are not recruitment approval.'};
  const prepared=[]; const identityLedger=[];
  for(let n=0;n<rows.length;n++) {
    const row=rows[n]; const issues=[];
    if(!row||row.id==null||!normalizeText(row.name)) {audit.excludedRows++;identityLedger.push({sourceRecordId:row?.id==null?null:String(row.id),candidateId:null,decision:'excluded',issues:['missing-source-identity']});continue;}
    const regs=registrations(row,issues); audit.invalidRegistrations+=issues.filter(x=>x.startsWith('invalid-')).length;
    const profileUrls=professionalProfiles(row); const identities=profileUrls.map(url=>profileIdentity(url,row.name)).filter(Boolean);
    const sourceAssertions=sourceIdentityChecks(row,regs,identities,identityReviews);issues.push(...sourceAssertions.map(x=>x.issue).filter(Boolean));
    for(const p of identities.filter(x=>x.spire)) {
      if(!p.named) issues.push('profile-name-mismatch');
      const gmc=regs.find(x=>x.body==='GMC');
      if(gmc&&p.suffix?.type==='c'&&Number(p.suffix.number)!==Number(gmc.identifier)) issues.push('profile-registration-mismatch');
      if(gmc&&p.suffix&&p.suffix.type!=='c') issues.push('profile-registration-body-conflict');
    }
    if(!regs.length&&!identities.some(x=>x.named)) issues.push('insufficient-identity-corroboration');
    if(flag(row.requires_review)) issues.push('source-requires-review');
    if(flag(row.do_not_recommend)||flag(row.blacklisted)) issues.push('source-excluded');
    const keyRegs=regs.map(r=>`${r.body}:${r.identifier}`);
    prepared.push({row,regs,profileUrls,identities,sourceAssertions,issues:unique(issues),keys:[...keyRegs,...identities.map(p=>`profile:${p.url}`)]});
  }
  const parent=prepared.map((_,i)=>i); const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const byKey=new Map();
  for(let i=0;i<prepared.length;i++) for(const key of prepared[i].keys) {
    if(!byKey.has(key)) byKey.set(key,[]); byKey.get(key).push(i);
  }
  for(const indices of byKey.values()) {
    const names=indices.map(i=>prepared[i].row.name);
    const regGroups={}; for(const i of indices) for(const r of prepared[i].regs) (regGroups[r.body]??=new Set()).add(r.identifier);
    const conflict=names.some(n=>!compatibleNames(n,names[0]))||Object.values(regGroups).some(set=>set.size>1);
    if(conflict) {for(const i of indices) prepared[i].issues.push('shared-identity-conflict');continue;}
    for(const i of indices.slice(1)) parent[find(i)]=find(indices[0]);
  }
  const groups=new Map(); for(let i=0;i<prepared.length;i++) {const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(prepared[i]);}
  const candidates=[],passages=[]; const passageByKey=new Map(); const candidateById=new Map();const sourceToCandidate=new Map();
  function addPassage(candidate,entry) {
    const type=entry.type||classifyPassage(entry.text,entry.field),entryQualifiers=unique([...(entry.qualifiers||[]),...qualifiers(entry.text,type)]).sort();
    const key=JSON.stringify([candidate.id,entry.text,type,entryQualifiers,entry.dates||{},entry.reviewedParaphrase===true,entry.sourceQuote||null]);
    const source={sourceRecordId:entry.sourceRecordId,field:entry.field,sourceUrl:entry.sourceUrl,sourceLabel:entry.sourceLabel,dates:entry.dates,attribution:entry.attribution,
      ...(entry.reviewedParaphrase?{reviewedParaphrase:true,sourceQuote:entry.sourceQuote||null}:{}),...(entry.review?{review:entry.review}:{}),...(entry.identityBasis?{identityBasis:entry.identityBasis}:{}),...repairProvenance(entry.repairProvenance)};
    const old=passageByKey.get(key);
    if(old) {
      if(!old.sources.some(s=>JSON.stringify(s)===JSON.stringify(source))) old.sources.push(source);
      const additionalVolumes=entry.volumes||(entry.volume?[entry.volume]:[]);
      if(additionalVolumes.length) {
        old.volumes=[...new Map([...(old.volumes||(old.volume?[old.volume]:[])),...additionalVolumes].map(v=>[JSON.stringify(v),v])).values()];
        if(old.volumes.length===1) old.volume=old.volumes[0];else delete old.volume;
      }
      const weight={'source-record':0,'linked-source':1,'verified-source':2};
      if(weight[entry.attribution]>weight[old.attribution]) Object.assign(old,source,{type,attributes:extractAttributes(entry.text,{field:entry.field,type}),qualifiers:unique([...(old.qualifiers||[]),...(entry.qualifiers||[]),...qualifiers(entry.text,type)])});
      return;
    }
    const passage={id:`evidence-${hash(key)}`,candidateId:candidate.id,...entry,type,attributes:extractAttributes(entry.text,{field:entry.field,type}),qualifiers:entryQualifiers,sources:[source]};
    passageByKey.set(key,passage);passages.push(passage);candidate.evidenceIds.push(passage.id);
  }
  for(const group of groups.values()) {
    group.sort((a,b)=>String(a.row.id).localeCompare(String(b.row.id)));
    const regs=[...new Map(group.flatMap(x=>x.regs).map(x=>[`${x.body}:${x.identifier}`,x])).values()].sort((a,b)=>`${a.body}:${a.identifier}`.localeCompare(`${b.body}:${b.identifier}`));
    const issues=unique(group.flatMap(x=>x.issues));
    for(const body of unique(regs.map(x=>x.body))) if(regs.filter(x=>x.body===body).length>1) issues.push('merged-registration-conflict');
    if(group.some(x=>!compatibleNames(x.row.name,group[0].row.name))) issues.push('merged-name-conflict');
    const needsIdentityReview=issues.some(x=>!x.startsWith('invalid-'));
    const registry=regs.find(x=>x.body==='GMC')||regs[0]; const namedProfile=group.flatMap(x=>x.identities).find(x=>x.named);
    let id=registry?`expert-${registry.body.toLowerCase()}-${registry.identifier}`:namedProfile?`expert-profile-${hash(namedProfile.url)}`:`expert-record-${hash(group[0].row.id)}`;
    if(candidateById.has(id)) id+=`-${hash(group.map(x=>x.row.id).join('|'))}`;
    const locationMap=new Map();for(const location of group.flatMap(x=>cleanLocations(x.row))){const key=`${location.name}|${location.postcode}|${location.address}`,prior=locationMap.get(key);locationMap.set(key,prior&&Number.isFinite(prior.latitude)&&!Number.isFinite(location.latitude)?prior:location);}const locations=[...locationMap.values()];
    const candidate={id,name:normalizeText(group[0].row.name),role:unique(group.map(x=>normalizeText(x.row.professional_role||x.row.role||reviewedProfessionHeading(x.row)||projectedProfessionalField(x.row,'specialty')))).join(' / '),
      specialty:unique(group.map(x=>normalizeText(projectedProfessionalField(x.row,'specialty')))).join(' / '),registrations:regs,organisations:unique(locations.map(x=>x.name)),locations,
      sourceRecordIds:group.map(x=>String(x.row.id)),profileUrls:unique(group.flatMap(x=>x.profileUrls)),evidenceIds:[],needsIdentityReview,identityIssues:issues};
    candidates.push(candidate);candidateById.set(id,candidate);audit.duplicateRowsMerged+=group.length-1;
    for(const item of group) {
      sourceToCandidate.set(String(item.row.id),candidate);
      identityLedger.push({sourceRecordId:String(item.row.id),candidateId:id,decision:needsIdentityReview?'held-for-review':group.length>1?'merged':'retained',issues:unique(item.issues),identityKeys:item.keys,sourceAssertions:item.sourceAssertions});
    }
    if(needsIdentityReview) {audit.heldForIdentityReview++;continue;}
    for(const item of group) {
      for(const entry of rowEvidence(item.row)) addPassage(candidate,entry);
      for(const location of cleanLocations(item.row)) {
        const text=unique([location.name,location.address,location.city,location.region,location.postcode,location.country]).join(', ');
        // Addresses contain abbreviations (St., Rd., etc.), not prose sentences.
        // Preserve the complete recorded address whenever it fits one passage.
        const chunks=[];let rest=text;while(rest.length>900){let at=rest.lastIndexOf(' ',900);if(at<1)at=900;chunks.push(rest.slice(0,at));rest=rest.slice(at).trim();}if(rest)chunks.push(rest);
        for(const chunk of chunks) addPassage(candidate,{text:chunk,...location.provenance,type:'location',qualifiers:['recorded-location-not-residence-or-current-practice']});
      }
    }
  }
  for(const enrichment of enrichments) {
    const reg=enrichment.registration&&normalizeRegistration(enrichment.registration.body,enrichment.registration.identifier);
    const candidate=enrichment.candidateId?candidateById.get(enrichment.candidateId):enrichment.sourceRecordId?sourceToCandidate.get(String(enrichment.sourceRecordId)):reg?candidateById.get(`expert-${reg.body.toLowerCase()}-${reg.identifier}`):null;
    const sourceUrl=safeUrl(enrichment.sourceUrl);const observedAt=dateValue(enrichment.observedAt);
    if(!candidate||candidate.needsIdentityReview||!sourceUrl||!observedAt||enrichment.verified!==true) {audit.rejectedEnrichments++;continue;}
    const sourceRecordId=enrichment.sourceRecordId?String(enrichment.sourceRecordId):`enrichment:${hash(sourceUrl+'|'+observedAt)}`;
    for(const text of splitPassages(enrichment.text)) if(useful(text,enrichment.field||'reviewed-professional-source')) addPassage(candidate,{text,field:enrichment.field||'reviewed-professional-source',sourceRecordId,sourceUrl,sourceLabel:normalizeText(enrichment.sourceLabel)||'Reviewed public professional source',type:enrichment.type==='clinical'?'clinical-practice':enrichment.type,
      dates:{sourceDate:dateValue(enrichment.sourceDate),observedAt,mergeDate:null},attribution:'verified-source',qualifiers:asArray(enrichment.qualifiers),
      sourceQuote:normalizeText(enrichment.excerpt)||null,reviewedParaphrase:true,
      ...(enrichment.review?{review:enrichment.review}:{}),...((enrichment.identityBasis||enrichment.review?.identityBasis)?{identityBasis:enrichment.identityBasis||enrichment.review.identityBasis}:{}),...(enrichment.relatedOrganisation?{relatedOrganisation:normalizeText(enrichment.relatedOrganisation)}:{})});
  }
  for(const p of passages) {audit.types[p.type]=(audit.types[p.type]||0)+1;audit.attribution[p.attribution]=(audit.attribution[p.attribution]||0)+1;}
  for(const candidate of candidates) for(const issue of candidate.identityIssues) audit.issues[issue]=(audit.issues[issue]||0)+1;
  audit.candidates=candidates.length;audit.searchableCandidates=candidates.filter(x=>!x.needsIdentityReview&&x.evidenceIds.length).length;audit.passages=passages.length;
  candidates.sort((a,b)=>a.id.localeCompare(b.id));passages.sort((a,b)=>a.id.localeCompare(b.id));identityLedger.sort((a,b)=>String(a.sourceRecordId).localeCompare(String(b.sourceRecordId)));
  const fingerprint=createHash('sha256');for(const c of candidates) fingerprint.update(JSON.stringify(c));for(const p of passages) fingerprint.update(JSON.stringify(p));
  return {candidates,passages,audit,identityLedger,version:`${VERSION}-${fingerprint.digest('hex').slice(0,20)}`};
}
module.exports={buildCorpus,extractAttributes,classifyPassage,normalizeRegistration,normalizeText,splitPassages,activityClauses,compatibleNames,safeUrl,repairProvenance,administrativeText,contactDetails,VERSION};
