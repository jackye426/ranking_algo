'use strict';

// Professional discovery projection only. This module never reads credentials,
// contacts, patient material, appointment history or recruitment decisions.
const {createHash} = require('node:crypto');
const VERSION = 'expert-corpus-v1';
const SENTENCES=typeof Intl.Segmenter==='function' ? new Intl.Segmenter('en',{granularity:'sentence'}) : null;
const hash = value => createHash('sha256').update(String(value)).digest('hex').slice(0,20);
const unique = values => [...new Set(values.filter(Boolean))];
const asArray = value => Array.isArray(value) ? value : value == null ? [] : [value];
const flag = value => value === true || value === 1 || value === 'true';
function normalizeText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?\s*>|<\/(?:p|li|div)>/gi,'\n').replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').trim();
}
function safeUrl(value) {
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
  const sourceUrl=safeUrl(item.sourceUrl||item.source_url||item.url||row[`${field}_source_url`]) || safeUrl(provider?.[1]);
  return {sourceRecordId:String(row.id),field,sourceUrl,sourceLabel:supplied||'Integrated professional record',
    dates:{sourceDate:dateValue(item.sourceDate||item.source_date||item.published_at),observedAt:dateValue(item.observedAt||item.retrieved_at||row.source_retrieved_at),mergeDate:dateValue(row.merge_date)},
    attribution:sourceUrl?'linked-source':'source-record'};
}
const ATTRIBUTES={
  modality:[['cardiac CT',/\b(?:cardiac[ /-]*(?:coronary[ /-]*)?(?:CT|computed tomography)|coronary[ /-]*(?:CT|computed tomography)|CT\s+coronary|CTCA)\b/i],['cardiac MRI',/\b(?:cardiac|cardiovascular)\s+(?:MRI|magnetic resonance)|\bCMR\b/i],['CT',/\bCT\b|computed tomography/i],['MRI',/\bMRI\b|magnetic resonance/i],['dermoscopy',/dermoscop/i],['ultrasound',/ultrasound|sonograph/i],['echocardiography',/echocardiog|\becho\b/i],['radiography',/radiograph|x[ -]?ray/i],['endoscopy',/endoscop/i],['robotic surgery',/robotic\s+(?:surg|procedure)|da vinci|hugo platform/i],['electrocardiography',/\bECG\b|electrocardiogra/i]],
  condition:[['coronary artery disease',/coronary\s+(?:artery\s+|heart\s+)?disease|ischaemic\s+heart\s+disease|ischemic\s+heart\s+disease/i],['skin lesions',/skin\s+lesions?|mole\s+(?:check|assess|screen|map)/i],['skin cancer',/skin\s+cancer|melanoma|basal\s+cell\s+carcinoma|squamous\s+cell\s+carcinoma/i],['heart failure',/heart\s+failure/i],['diabetes',/diabet/i],['endometriosis',/endometriosis/i],['knee pain',/knee\s+pain/i],['stroke',/\bstroke\b/i],['cancer',/\bcancer\b|oncolog/i]],
  population:[['adults',/\badults?\b/i],['children',/\bchildren\b|paediatric|pediatric/i],['older adults',/older\s+(?:adults?|people)|elderly|geriatric/i],['pregnancy',/pregnan|antenatal/i],['adolescents',/adolescen|teenage/i],['athletes',/\bathletes?\b|\bsportspeople\b|\bsportsmen\b|\bsportswomen\b/i]],
  setting:[['primary care',/primary\s+care|\bgeneral\s+practi(?:ce|tioner)|\bGPs?\b/i],['community',/community\s+(?:care|practice|clinic|setting|service)/i],['home',/\bhome\s+(?:care|monitor|use|setting|treatment)/i],['emergency care',/emergency\s+(?:care|department|medicine)|accident\s+and\s+emergency/i],['teaching hospital',/teaching\s+hospital/i],['NHS',/\bNHS\b/i],['hospital',/\bhospital\b/i],['outpatient',/outpatient/i]],
  activity:[['image interpretation',/\b(?:interpret|report|read)(?:s|ing)?\b.{0,65}\b(?:scan|CT|MRI|imag)|\b(?:scan|CT|MRI|imag).{0,65}\b(?:interpret|report)(?:s|ing|ation)?\b/i],['clinical practice',/\b(?:perform|treat|manage|diagnose|supervise|practis|practic)(?:s|es|ing|e)?\b/i],['clinical research',/research|\btrials?\b|clinical\s+stud/i],['diagnostic study evaluation',/diagnostic\s+(?:accuracy|performance|stud)|(?:evaluat|assess|validat).{0,50}(?:diagnostic\s+stud|clinical\s+evidence)/i],['device evaluation',/(?:medical\s+device|technology).{0,45}(?:evaluat|assess|validat)|(?:evaluat|assess|validat).{0,45}(?:medical\s+device|technology)/i],['teaching',/\bteach|\btrain(?:ing|s|ed)?\b|lectur/i],['implementation',/implement|establish.{0,30}(?:service|programme)|set\s+up.{0,30}(?:service|programme)/i]],
};
const PURE_METADATA_FIELDS=/^(?:locations|registration|qualifications|detailed_qualifications|professional_memberships|nhs_posts|nhs_base|professional_role|specialty|specialties|specialty_alternatives|publications)$/;
const emptyAttributes=()=>Object.fromEntries(Object.keys(ATTRIBUTES).map(key=>[key,[]]));
const aspirationalActivity=text=>/\b(?:hopes? to|plans? to|would like to|aims? to|interested in becoming|aspir(?:e|es|ing) to)\b/i.test(text);
const activityClauses=text=>sourceStatements(text).flatMap(part=>part.split(/\s+(?=(?:but|however|whereas)\b)/i)).filter(Boolean);
const degreeStatement=text=>/\b(?:MSc|MClinRes|BSc|MBBS|MBChB|Master[’']?s|Bachelor[’']?s|Research MD|PhD|doctorate|degree|diploma|certificates?)\b/i.test(text)&&/\b(?:complet(?:ed|ing|es)|stud(?:y|ied|ying)|hold(?:s|ing)?|has|have|obtain(?:ed|ing)|award(?:ed)?|graduat(?:ed|ing)|undertook|pursu(?:ed|ing))\b/i.test(text);
const interestScoped=text=>/\b(?:interests?\s+(?:is|are|was|were|in|to|includes?|involves?)|interested in|interest\s+is\s+to|expertise\s+in)\b/i.test(text);
const personalActivity=text=>/\b(?:marathon runner|triathlete|keen runner|amateur athlete|my\s+(?:wife|husband|children|family)|spare\s+time|outside\s+(?:of\s+)?work|hobbies|golf club|married with)\b|\benjoys?\s+(?:running|strength training|playing|skiing|golf|tennis|travel|music|cycling|walking)\b/i.test(text);
function teachingActivity(text) {
  // A training placement or a teaching-hospital name identifies the learner or
  // institution. Require delivery, supervision or an explicit educator role.
  return activityClauses(text).some(clause=>!aspirationalActivity(clause)&&/\b(?:teach(?:es|ing)?|train(?:s|ing|ed)?|educat(?:e|es|ing)|supervis(?:e|es|ing))\s+(?:(?:many|numerous|several|medical|junior|trainee|surgical|hospital|undergraduate|postgraduate|other)\s+)*(?:students?|doctors?|surgeons?|colleagues|nurses?|GPs?|residents?|trainees?|techniques)\b|\b(?:clinical teacher|lectur(?:er|ing|es|ed)|accredited trainer|teaching awards?|faculty member|training program(?:me)? director|lead for education)\b|\b(?:provid(?:e|es|ed|ing)|deliver(?:s|ed|ing)?|leads?)\s+(?:clinical |medical |surgical )?(?:teaching|training|education)\b|\b(?:run(?:s)?|direct(?:s|ed)?|develop(?:s|ed)?)\b.{0,100}\b(?:teaching programme|educational courses?|courses?|symposium)\b|\bfaculty\s+on\b.{0,45}\b(?:teaching|training|educational)\b|\bteach(?:es|ing)?\b.{0,100}\bto\s+(?:other\s+)?(?:doctors?|surgeons?|students?)\b|\b(?:national |clinical )?lead for\b.{0,45}\b(?:training|education)\b|\b(?:teaching|training|education)\s+of\s+(?:future\s+)?(?:medical professionals|doctors|surgeons|students|trainees)\b|\b(?:provid(?:e|es|ed|ing)|deliver(?:s|ed|ing)?)\b.{0,45}\bsupervision\s+for\b.{0,70}\b(?:trainees|students|doctors|surgeons)\b|\b(?:co[- ]?organiser|organizer|organises|organizes|organised|organized)\b.{0,80}\b(?:training events?|teaching courses?|educational courses?)\b/i.test(clause));
}
function receivedTraining(text) {
  return degreeStatement(text)||/\b(?:trained|graduated|qualified|studied|learnt|learned)\b|\btaught\s+(?:me|him|her|them)\b|\b(?:received|complet(?:ed|ing)|undertook|underwent|pursued)\b.{0,65}\b(?:education|training|fellowship)\b|\bconducted\s+(?:sub[- ]specialty\s+|specialist\s+)?fellowship\s+training\b|\b(?:my|his|her|their)\s+(?:(?:specialist|medical|surgical)\s+)?(?:training|fellowship)\b|\btraining\s+(?:in|at|under)\b|\b(?:completed|undertook|awarded)\s+(?:an?\s+)?fellowships?\b/i.test(text);
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
    if(aspirationalActivity(clause)||interestScoped(clause)||/\b(?:learnt|learned|taught (?:me|him|her|them)|trained to|training to|learn(?:ing)? to)\b|\b(?:undertak\w*|undertook|complet\w*)\b.{0,40}\b(?:training|fellowship|education|courses?)\b/i.test(clause))return false;
    return /\b(?:undertak(?:e|es|ing)|perform(?:s|ed|ing)?|offer(?:s|ed|ing)?)\b.{0,65}\b(?:procedures?|clinics?|surgery|operations?|surgical treatment|cryotherapy|patient care|echocardiography|dermoscopy|endoscopy|bronchoscopy|angiography|ultrasound|CT|MRI|scans?|imaging|injections?|diagnostic tests?)\b|\brun(?:s|ning)?\b.{0,50}\bclinics?\b|\b(?:surgical |clinical )?procedures? undertaken\b|\b(?:I|he|she)\s+(?:only\s+)?see(?:s)?\s+(?:patients|children|adults)\b|\b(?:report(?:s|ed|ing)?|interpret(?:s|ed|ing)?|read(?:s|ing)?|supervis(?:e|es|ed|ing))\b.{0,45}\b(?:CT|MRI|scans?|images?|imaging|echocardiography|ultrasound|radiographs?|pathology|patient care)\b|\b(?:treat(?:s|ed|ing)?|diagnos(?:e|es|ed|ing))\s+(?!myself\b|himself\b|herself\b|themselves\b)[^.;]{2,70}|\bmanag(?:e|es|ed|ing)\s+(?:patients?|people|children|adults|diabetes|heart failure|cancer|pain|disease)\b|\bpracti[cs](?:e|es|ed|ing)\s+(?:as a |in )?(?:surgeon|physician|cardiolog\w*|radiolog\w*|dermatolog\w*|medicine)\b/i.test(clause);
  });
}
function extractAttributes(text,context={}) {
  const field=typeof context==='string'?context:context.field||'',type=typeof context==='string'?classifyPassage(text,field):context.type;
  const clean=normalizeText(text),output=emptyAttributes();
  if(PURE_METADATA_FIELDS.test(field)||type==='location')return output;
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
  // Several source bios omit the space between complete sentences. Split at
  // recognised sentence starts without rewriting any supporting words. Share
  // these boundaries with activity classification and the requirement matrix.
  const parts=text.split(/(?<=\.)(?=(?:Dr |Mr |Mrs |Ms |Miss |Prof |Professor |He |She |His |Her |I |My |Aside |After |During |Currently\b|Presently\b|Previously\b|Today\b|Now\b|At present\b|[A-Z][a-z]{2,} (?:enjoys?|is |has |was )))|(?<=;)\s*(?=(?:I|he|she|we|they|currently|presently|at present)\b)|\s+(?=(?:and|but)\s+(?:I|he|she|we|they)\b)/i);
  const sentenceSegments=parts.flatMap(part=>{
    const units=SENTENCES ? [...SENTENCES.segment(part)].map(x=>x.segment) : part.split(/(?<=[.!?])\s+(?=[A-Z])/),joined=[];
    for(const unit of units){
      // Intl sentence segmentation treats Dr. and St. as sentence ends in some
      // runtimes. Keep abbreviations and initials attached to their source text.
      if(joined.length&&/\b(?:Dr|Mr|Mrs|Ms|Prof|St|Mt|Rd|Jr|Sr|[A-Z])\.\s*$/.test(joined.at(-1)))joined[joined.length-1]+=unit;
      else joined.push(unit);
    }
    return joined.flatMap(line=>line.split(/\n+/)).map(line=>line.trim()).filter(Boolean);
  });
  return sentenceSegments;
}
function splitPassages(value) {
  const sentenceSegments=sourceStatements(value);
  const output=[];
  for(const sentence of sentenceSegments) for(const line of sentence.split(/\n+/)) {
    let rest=line.trim(); while(rest.length>900) {
      let at=rest.lastIndexOf('; ',900); if(at<200) at=rest.lastIndexOf(' ',900); if(at<1) at=900;
      output.push(rest.slice(0,at).trim()); rest=rest.slice(at).trim();
    }
    if(rest) output.push(rest);
  }
  return output;
}
function useful(text,field) {
  if(text.length<3||/^(?:null|none|unknown|n\/?a|not available|undefined)$/i.test(text)) return false;
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return false;
  if(/\b(?:telephone|phone|mobile|contact|booking|book an appointment)\b/i.test(text)&&/\+?\d[\d ()-]{8,}\d|https?:\/\//i.test(text)) return false;
  if(/\b(?:my\s+(?:wife|husband|children|family)|spare\s+time|outside\s+(?:of\s+)?work|hobbies|enjoy\s+(?:golf|ski|travel|music)|married\s+with|golf\s+club)\b/i.test(text)) return false;
  if(/\benjoys?\s+(?:running|strength training|playing|skiing|golf|tennis|travel|music|cycling|walking)\b/i.test(text))return false;
  if(/about/.test(field)&&/^(?:(?:I|he|she)\s+(?:was|am|is)\s+)?(?:born|brought up)\b|\b(?:I was|he was|she was)\s+born\b|^(?:(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+)?[A-Z][A-Za-z’'-]+(?:\s+[A-Z][A-Za-z’'-]+){0,2}\s+was\s+born\b|\b(?:I am|he is|she is)\s+(?:married|a (?:mother|father) of)\b|\b(?:I|he|she)\s+ha(?:ve|s)\s+(?:one|two|three|four|five|\d+)\s+children\b/i.test(text)&&!directClinicalActivity(text)&&!researchActivity(text)&&!receivedTraining(text))return false;
  if(/\b(?:please see|refer to|see)\s+(?:the\s+)?(?:list|below|above|website)\b/i.test(text)&&!/[;:]/.test(text))return false;
  if(/\b(?:we hope|you (?:may|will)|please)\b.{0,70}\b(?:find|view|read)\b.{0,80}\b(?:information|pages|website)\b/i.test(text))return false;
  if(/^(?:clinical|research|specialist|personal|professional)\s+(?:interests?|experience|background|memberships?)\s*:?\s*$/i.test(text))return false;
  if(/\b(?:renowned globally|globally renowned|world renowned|world[- ]leading)\b/i.test(text)&&/\b(?:pioneer in the field|not just a|leading light)\b/i.test(text)&&!researchActivity(text)&&!Object.values(extractAttributes(text)).some(values=>values.length))return false;
  if((text.match(/[a-z]{1,4};\s+[a-z]{1,5}\b/g)||[]).length>=4)return false;
  if((text.match(/;\s+[a-z]{1,6}(?=[A-Z])/g)||[]).length>=3)return false;
  if(/^(?:book|call|contact|click|make an enquiry|find out more|read more|consultation fee)/i.test(text)) return false;
  if(/\b(?:pay member claim|missing information|cancellation (?:charge|fee)|billing|sign[ -]?up|register online)\b/i.test(text)) return false;
  if(/https?:\/\/\S*\/(?:patients|appointments|accounts|register|sign-up)\b/i.test(text)) return false;
  if(/^(?:being able to provide a clear understanding to patients|I always want to help patients)/i.test(text)) return false;
  if(/^(?:initial|follow[ -]up|new|review)\s+(?:out[ -]patient\s+)?consultation(?:\s*[-–]\s*(?:remote|face.to.face|video|telephone))?\s*$/i.test(text)) return false;
  if(/^(?:e medicine|ts inju)$/i.test(text)) return false;
  if(/about/.test(field)&&text.length<15) return false;
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
  const range=normalizeText(item.count_range||item.count_bucket||item.range||item.volume||item.count||'')||null;
  const numeric=typeof item.count_numeric==='number' ? item.count_numeric : null;
  const reportedAdmissions=Number.isFinite(item.admissions)?item.admissions:null;
  if(!period&&!range&&numeric==null&&reportedAdmissions==null) return null;
  return {activity:normalizeText(item.description||item.procedure_name||item.procedure||item.name||item.text),reportedRange:range,reportingPeriod:period,
    reportedAdmissions,countNumeric:numeric,countNumericDerived:numeric!==null,comparable:false,sourceField:field};
}
function rowEvidence(row) {
  const output=[];
  const fields=['about','about_alternatives','specialty','specialty_alternatives','specialties','professional_role','clinical_interests','areas_of_interest','procedures',
    'procedures_completed','procedure_volumes_phin','research_interests','publications','qualifications','detailed_qualifications','professional_memberships',
    'nhs_posts','nhs_base','professional_experience','isrctn_trials','trials','teaching_interests'];
  for(const field of fields) for(const item of valueEntries(row[field])) {
    const source=sourceFor(row,field,item); const volume=volumeFor(item,field);
    // A bibliography/profile link is useful metadata, not proof of authorship,
    // study design or a clinician's contribution to any named paper.
    if(field==='publications'&&(/^(?:https?:\/\/|doi\s*[:/]|10\.\d{4,9}\/)/i.test(item.text))) {
      output.push({...source,text:`Publication or research reference supplied in the professional record: ${item.text}`,type:'professional-background',qualifiers:['publication-listing-link-not-authorship'],publication:{listingUrl:safeUrl(item.text),unverifiedReference:item.text}});
      continue;
    }
    const extra=field==='publications' ? {publication:{title:item.text,doi:normalizeText(item.doi)||null,journal:normalizeText(item.journal)||null,year:dateValue(item.year),authors:asArray(item.authors).filter(x=>typeof x==='string')}} : {};
    for(const text of splitPassages(item.text)) if(useful(text,field)) output.push({text,...source,...extra,...(volume?{volume}:{})});
  }
  // Compact complete statements from the same source, field, evidential type and
  // qualifier state. Nothing is truncated: additional chunks retain the rest.
  // Keeping training/negated/historical material separate prevents a grouped
  // paragraph from silently acquiring the strength of its neighbouring claim.
  const packed=[],buckets=new Map();
  for(const entry of output) {
    const type=entry.type||classifyPassage(entry.text,entry.field);
    const qs=unique([...(entry.qualifiers||[]),...qualifiers(entry.text,type),...(entry.field==='research_interests'&&type!=='research'?['stated-interest','research-interest-not-study-experience']:[])]);
    const key=JSON.stringify([entry.field,entry.sourceUrl,entry.sourceLabel,entry.dates,type,qs]);
    let current=buckets.get(key);
    if(current&&current.text.split('\n').includes(entry.text)) {
      if(entry.volume) (current.volumes??=[]).push(entry.volume);
      continue;
    }
    if(current&&current.text.length+entry.text.length+1<=900&&!entry.publication&&!current.publication) {
      current.text+='\n'+entry.text;
      if(entry.volume) (current.volumes??=[]).push(entry.volume);
      if(current.volumes?.length>1) delete current.volume;
    } else {
      current={...entry,type,qualifiers:qs,...(entry.volume?{volumes:[entry.volume]}:{})};
      packed.push(current);buckets.set(key,current);
    }
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
    const key=`${candidate.id}|${entry.text}`; const type=entry.type||classifyPassage(entry.text,entry.field);
    const source={sourceRecordId:entry.sourceRecordId,field:entry.field,sourceUrl:entry.sourceUrl,sourceLabel:entry.sourceLabel,dates:entry.dates,attribution:entry.attribution,
      ...(entry.reviewedParaphrase?{reviewedParaphrase:true,sourceQuote:entry.sourceQuote||null}:{}),...(entry.review?{review:entry.review}:{}),...(entry.identityBasis?{identityBasis:entry.identityBasis}:{})};
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
    const passage={id:`evidence-${hash(key)}`,candidateId:candidate.id,...entry,type,attributes:extractAttributes(entry.text,{field:entry.field,type}),qualifiers:unique([...(entry.qualifiers||[]),...qualifiers(entry.text,type)]),sources:[source]};
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
    const candidate={id,name:normalizeText(group[0].row.name),role:unique(group.map(x=>normalizeText(x.row.professional_role||x.row.role||x.row.specialty))).join(' / '),
      specialty:unique(group.map(x=>normalizeText(x.row.specialty))).join(' / '),registrations:regs,organisations:unique(locations.map(x=>x.name)),locations,
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
module.exports={buildCorpus,extractAttributes,classifyPassage,normalizeRegistration,normalizeText,splitPassages,activityClauses,compatibleNames,safeUrl,VERSION};
