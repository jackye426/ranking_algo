'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {detectSpecialties,detectProcedures,matchesClinicalFilters,procedureEvidenceFor,specialtyMatches,matchClinicalCriteria,inferTopicSpecialties}=require('./clinical-filters.cjs');
const record=overrides=>({id:'example',specialty:'Trauma and orthopaedic surgery',clinicalInterests:[],procedures:[],procedureEvidence:[],description:'',profileUrl:'https://www.spirehealthcare.com/consultant-profiles/mr-example/',evidenceUrl:'/sources/example',...overrides});

test('specialty filters use the recorded specialty, not training or clinical prose',()=>{
  const r=record({specialty:'Dermatology',description:'I trained in orthopaedic surgery before dermatology.',clinicalInterests:['Orthopaedic surgery']});
  assert.equal(specialtyMatches(r,'Orthopaedics'),false);
  assert.equal(matchesClinicalFilters(r,{specialty:'Orthopaedics'}),false);
  assert.equal(matchesClinicalFilters(r,{specialty:'Dermatology'}),true);
  assert.deepEqual(detectSpecialties('a surgeon').map(m=>m.label),[]);
  assert.deepEqual(detectSpecialties('orthopaedic surgeons').map(m=>m.label),['Orthopaedics']);
  assert.equal(specialtyMatches(record({specialty:'Gastroenterology / General surgery'}),'General surgery'),true);
  assert.equal(specialtyMatches(record({specialty:'Consultant Specialist Hip and Knee Surgeon'}),'Orthopaedics'),true);
});

test('parser aliases keep exact spans and prefer specific procedures',()=>{
  const text='Only total-knee-replacement and ACL reconstruction please';
  const found=detectProcedures(text);
  assert.deepEqual(found.map(m=>m.label),['Total knee replacement','ACL reconstruction']);
  for(const m of found) assert.equal(text.slice(m.start,m.end),m.text);
  assert.deepEqual(detectProcedures('hip and knee replacements').map(m=>m.label),['Hip replacement','Knee replacement']);
  assert.deepEqual(detectProcedures('arthroscopy').map(m=>m.label),['Arthroscopy']);
  assert.deepEqual(detectProcedures('meniscectomy').map(m=>m.label),['Meniscectomy']);
});

test('general specialty tags never qualify as a documented procedure',()=>{
  const r=record({procedures:['Orthopaedics - hip and knee'],clinicalInterests:['Knee pain','Hip surgery']});
  assert.equal(matchesClinicalFilters(r,{specialty:'Orthopaedics',procedures:['Knee replacement']}),false);
  assert.equal(procedureEvidenceFor(r,'Arthroscopy'),null);
  assert.equal(procedureEvidenceFor(r,'Unrecognised treatment'),null);
});

test('all requested procedures are AND requirements',()=>{
  const r=record({clinicalInterests:['Total knee replacement','Hip replacement']});
  assert.equal(matchesClinicalFilters(r,{procedures:['Knee replacement','Hip replacement']}),true);
  assert.equal(matchesClinicalFilters(r,{procedures:['Knee replacement','ACL reconstruction']}),false);
  const result=matchClinicalCriteria(r,{procedures:['Knee replacement','ACL reconstruction']});
  assert.deepEqual(result.unmet,[{kind:'procedure',criterion:'ACL reconstruction'}]);
  assert.equal(result.evidence.length,1);
});

test('specific procedures support broader requests, never the reverse',()=>{
  const total=record({procedures:['Total knee replacement']});
  for(const p of ['Total knee replacement','Knee replacement','Joint replacement']) assert.ok(procedureEvidenceFor(total,p));
  assert.equal(procedureEvidenceFor(total,'Partial knee replacement'),null);
  assert.ok(procedureEvidenceFor(record({procedures:['Uni-compartmental knee replacement']}),'Partial knee replacement'));
  const generic=record({clinicalInterests:['Knee replacement']});
  assert.equal(procedureEvidenceFor(generic,'Total knee replacement'),null);
  assert.equal(procedureEvidenceFor(generic,'Revision knee replacement'),null);
  assert.ok(procedureEvidenceFor(record({procedures:['Arthroscopy of the knee']}),'Arthroscopy'));
  assert.equal(procedureEvidenceFor(record({procedures:['Hip arthroscopy']}),'Knee arthroscopy'),null);
});

test('real procedure descriptions match without counting optional exclusions as negative evidence',()=>{
  const entries=[
    'Multiple arthroscopic operations on knee (including meniscectomy, chondroplasty, drilling or microfracture) - unilateral',
    'Autograft anterior cruciate ligament reconstruction without lateral tendonesis +/- meniscectomy',
    'Unicompartmental knee replacement - unilateral',
    'Arthroscopic meniscal repair',
  ];
  const r=record({procedures:entries});
  for(const p of ['Knee arthroscopy','Arthroscopy','ACL reconstruction','Partial knee replacement','Knee replacement','Meniscal repair']) assert.ok(procedureEvidenceFor(r,p),p);
  assert.equal(procedureEvidenceFor(r,'Total knee replacement'),null);
});

test('negative, historical training and another clinician’s procedures are not evidence',()=>{
  const unsupported=[
    'I do not perform knee replacement.',
    'No knee replacement.',
    'Knee replacement is not offered.',
    'Knee replacement is not my area of practice.',
    'Knee replacement surgery is no longer undertaken.',
    'I no longer offer knee replacement.',
    'My fellowship was in knee replacement.',
    'I researched knee replacement outcomes.',
    'I refer patients needing knee replacement to my colleague.',
    'My colleague performs knee replacement.',
    'The hospital offers knee replacement.',
    'Alternatives to knee replacement.',
  ];
  for(const text of unsupported) assert.equal(procedureEvidenceFor(record({clinicalInterests:[text]}),'Knee replacement'),null,text);
});

test('contrast clauses preserve the positive procedure without rescuing a negative one',()=>{
  const r=record({description:'I do not perform knee replacement, but I perform hip replacement.'});
  assert.equal(procedureEvidenceFor(r,'Knee replacement'),null);
  assert.ok(procedureEvidenceFor(r,'Hip replacement'));
  assert.ok(procedureEvidenceFor(record({description:'I perform not only knee replacement but also hip replacement.'}),'Knee replacement'));
});

test('biographical mentions require an explicit own-practice attribution',()=>{
  assert.equal(procedureEvidenceFor(record({description:'Knee replacement is a treatment that patients ask about.'}),'Knee replacement'),null);
  assert.ok(procedureEvidenceFor(record({description:'I specialise in knee replacement.'}),'Knee replacement'));
  assert.ok(procedureEvidenceFor(record({description:'My clinical interests include knee replacement.'}),'Knee replacement'));
  assert.ok(procedureEvidenceFor(record({description:'He performs knee replacement.'}),'Knee replacement'));
});

test('evidence cites exact source field text and keeps completed-procedure hospital provenance',()=>{
  const text='Unicompartmental knee replacement - unilateral';
  const r=record({procedureEvidence:[{text,sourceRecordId:'db-123',sourceField:'procedures_completed',sourceUrl:null,hospital:'Spire Bushey Hospital',code:'W5210'}]});
  const proof=procedureEvidenceFor(r,'Knee replacement');
  assert.equal(proof.text,text); assert.equal(proof.sourceRecordId,'db-123');
  assert.equal(proof.sourceField,'procedures_completed'); assert.equal(proof.sourceUrl,'/sources/example');
  assert.equal(proof.hospital,'Spire Bushey Hospital'); assert.equal(proof.matchedProcedure,'Partial knee replacement');
});

test('clinical-field and extracted-description provenance survive as evidence',()=>{
  const value='I perform knee replacement.';
  const r=record({clinicalInterests:[value],fieldProvenance:{clinicalInterests:[{values:[value],sourceRecordId:'db-one',field:'about',derivedBy:'exact-sentence-extraction',sourceUrl:'https://example.test/profile'}]}});
  const proof=procedureEvidenceFor(r,'Knee replacement');
  assert.equal(proof.sourceField,'about'); assert.equal(proof.sourceRecordId,'db-one');
  assert.equal(proof.sourceUrl,'https://example.test/profile');
});

test('compatibility hints are conservative labels rather than inferred diagnoses',()=>{
  assert.ok(inferTopicSpecialties('knee pain').includes('Orthopaedics'));
  assert.ok(inferTopicSpecialties('knee pain').includes('Rheumatology'));
  assert.deepEqual(inferTopicSpecialties('mysterious tiredness'),[]);
  assert.ok(inferTopicSpecialties('cataract surgery').includes('Ophthalmology'));
  assert.deepEqual(inferTopicSpecialties('endometriosis'),['Gynaecology']);
});

test('endometriosis excision aliases require the named condition and preserve spans',()=>{
  const aliases=[
    'endometriosis excision', 'excision of endo', 'excision surgery for endometriosis',
    'laparoscopic excision of endometriosis, +/-ureterolysis',
    'Laparoscopic excision of recto-vaginal endometriosis including rectal shave, +/-ureterolysis',
    'Robotic assisted excision of endometriosis, +/-ureterolysis',
    'Robot-assisted excision of deep infiltrating endometriosis',
    'excision of complex endometriosis',
  ];
  for(const text of aliases) {
    const found=detectProcedures(text);
    assert.deepEqual(found.map(m=>m.label),['Endometriosis excision'],text);
    assert.equal(text.slice(found[0].start,found[0].end),found[0].text);
  }
  assert.deepEqual(detectProcedures('excision surgery'),[]);
  assert.deepEqual(detectProcedures('endometriosis treatment'),[]);
});

test('stored endometriosis excision procedures qualify with exact evidence and method',()=>{
  const entries=[
    'Laparoscopic excision of endometriosis, +/-ureterolysis',
    'Laparoscopic excision of recto-vaginal endometriosis including rectal shave, +/-ureterolysis',
    'Robotic assisted excision of recto-vaginal endometriosis including disc resection of rectum, +/-ureterolysis',
    'Laparoscopic excision of recto-vaginal endometriosis including bowel resection (including formation of stoma) +/- hysterectomy, +/-ureterolysis',
  ];
  for(const text of entries) {
    const r=record({specialty:'Gynaecology',procedureEvidence:[{text,sourceRecordId:'endo-one',sourceField:'procedures_completed',hospital:'Spire Example Hospital'}]});
    assert.equal(matchesClinicalFilters(r,{specialty:'Gynaecology',procedures:['Endometriosis excision']}),true,text);
    const proof=procedureEvidenceFor(r,'Endometriosis excision');
    assert.equal(proof.text,text); assert.equal(proof.sourceRecordId,'endo-one');
    assert.equal(proof.sourceField,'procedures_completed'); assert.equal(proof.sourceUrl,'/sources/example');
    assert.equal(proof.hospital,'Spire Example Hospital');
  }
});

test('general endometriosis, ablation, unrelated excision and stage alone do not prove excision',()=>{
  const unsupported=[
    'Endometriosis', 'Endometriosis surgery', 'Stage 3 endometriosis',
    'Laparoscopy and therapeutic procedures (including laser, diathermy and destruction e.g. endometriosis, adhesiolysis, tubal and ovarian surgery, +/-ureterolysis)',
    'Laparoscopy (including e.g. puncture of ovarian cysts, +/- biopsy, minor endometriosis, +/-ureterolysis)',
    'Endometriosis ablation', 'Burning endometriosis', 'Diathermy of endometriosis',
    'Excision of skin lesion; endometriosis', 'Excision of skin lesion and treatment of endometriosis',
    'Excision of retroperitoneal tumour, +/-ureterolysis', 'Ureterolysis - bilateral',
  ];
  for(const text of unsupported) assert.equal(procedureEvidenceFor(record({specialty:'Gynaecology',procedures:[text]}),'Endometriosis excision'),null,text);
  const onlyAblation=record({specialty:'Gynaecology',procedures:['Endometriosis ablation'],clinicalInterests:['Stage 3 endometriosis']});
  assert.equal(matchesClinicalFilters(onlyAblation,{topic:'endometriosis',clinicalContext:'Stage 3 endometriosis',procedures:['Endometriosis excision']}),false);
});

test('endometriosis excision still requires positive own-practice evidence',()=>{
  const unsupported=[
    'I do not perform endometriosis excision.',
    'Laparoscopic excision of endometriosis is not offered.',
    'I refer patients for excision of endometriosis.',
    'My colleague performs excision of endometriosis.',
    'I assisted laparoscopic excision of endometriosis.',
    'I assisted robotic assisted excision of endometriosis.',
    'My fellowship included robotic assisted excision of endometriosis.',
    'I research excision of endometriosis.',
    'Alternatives to excision of endometriosis.',
  ];
  for(const text of unsupported) assert.equal(procedureEvidenceFor(record({clinicalInterests:[text]}),'Endometriosis excision'),null,text);
  assert.equal(procedureEvidenceFor(record({description:'Excision of endometriosis is one treatment option.'}),'Endometriosis excision'),null);
  assert.ok(procedureEvidenceFor(record({description:'I perform robotic assisted excision of endometriosis.'}),'Endometriosis excision'));
  assert.ok(procedureEvidenceFor(record({description:'I specialise in laparoscopic excision of endometriosis.'}),'Endometriosis excision'));
  assert.ok(procedureEvidenceFor(record({description:"I'm an experienced Consultant Gynaecologist and Endometriosis Specialist with a particular focus on advanced minimally invasive surgery, especially for the excision of endometriosis."}),'Endometriosis excision'));
  assert.ok(procedureEvidenceFor(record({description:'I perform advanced laparoscopic surgery, including myomectomy and excision of complex endometriosis.'}),'Endometriosis excision'));
  const positive=record({specialty:'Gynaecology',procedures:['Excision of endometriosis']});
  assert.equal(matchesClinicalFilters(positive,{specialty:'Gynaecology',procedures:['Endometriosis excision'],clinicalContext:'Stage 3 endometriosis'}),true);
  assert.equal(matchesClinicalFilters(positive,{specialty:'Dermatology',procedures:['Endometriosis excision']}),false);
});
