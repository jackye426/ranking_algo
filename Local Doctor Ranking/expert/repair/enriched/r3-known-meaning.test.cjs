'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCorpus}=require('../../data.cjs');
const row=(about,id='fictitious-case')=>({id,name:'Alex Example',gmc_number:'1234567',about});
const passages=about=>buildCorpus([row(about)]).passages;

test('an undated FRCS (Tr. Orth.) credential remains an intact literal span',()=>{
 const source='Mr Alex Example\n\nMB ChB, FRCS (Tr. Orth.)';
 const found=passages(source).filter(p=>p.text.includes('FRCS (Tr.'));
 assert.ok(found.length);
 assert.ok(found.every(p=>p.text.includes('FRCS (Tr. Orth.)')));
 assert.ok(found.every(p=>source.includes(p.text)));
});

test('source-native New. Victoria Hospital stays contiguous without rewriting punctuation',()=>{
 const source='He sees patients at New. Victoria Hospital, Kingston upon Thames.';
 const found=passages(source).filter(p=>p.text.includes('New.')||p.text.includes('Victoria Hospital'));
 assert.ok(found.some(p=>p.text.includes('New. Victoria Hospital')));
 assert.ok(found.every(p=>source.includes(p.text)));
});

test('MR. initials in a historical supervision clause stay attached',()=>{
 const source='Between 1995 and 1996, I worked under MR. A.B. Nevelos supervision in Bradford, where I assisted and performed numerous THR and TKR.';
 const found=passages(source).filter(p=>p.text.includes('Nevelos'));
 assert.ok(found.some(p=>p.text.includes('MR. A.B. Nevelos')));
 assert.ok(found.every(p=>source.includes(p.text)));
});

test('singular owner practice clauses do not inherit team attribution',()=>{
 for(const source of ['My practice is exclusively knee surgery.','His practice entails MAKO robotic knee surgery.','His practice is based in North East London and Essex.','His practice style is grounded in careful assessment.']){
  const found=passages(source).find(p=>p.text===source);
  assert.ok(found,source);
  assert.ok(!found.qualifiers.includes('team-context-not-individual-activity'),source);
 }
 const team=passages('Our practice performs knee replacements.').find(p=>p.text.includes('Our practice'));
 assert.ok(team.qualifiers.includes('team-context-not-individual-activity'));
});

test('a flattened treatment heading/list stays whole and neutral without guessed word breaks',()=>{
 const body='Tibial osteotomyTibiofemoralToe Joint Fusion';
 const source='Professor Example specialises in the following treatments, tests and scans at Example Hospital:'+Array(25).fill(body).join('')+'.';
 assert.ok(source.length>900&&source.length<5000);
 const found=passages(source).filter(p=>p.text.includes('Tibiofemoral'));
 assert.equal(found.length,1);
 assert.equal(found[0].text,source);
 assert.equal(found[0].type,'treatment-listing');
 assert.ok(found[0].qualifiers.includes('listed-treatment-not-performed-activity'));
});

test('owner activity during dated supervised training retains its limits',()=>{
 const source='Between 1995 and 1996, I worked under MR. A.B. Nevelos supervision in Bradford, as part of the Overseas Doctors Training Scheme, where I assisted and performed numerous THR and TKR, both cemented and non-cemented.';
 const found=passages(source).find(p=>p.text===source);
 assert.ok(found);
 assert.equal(found.type,'clinical-practice');
 assert.ok(found.qualifiers.includes('historical'));
 assert.ok(found.qualifiers.includes('clinical-experience-during-training'));
});

test('a separately stated annual joint replacement count is clinical but self-reported',()=>{
 const source='I perform over 200 hip and knee replacements each year. I am involved in managerial roles at the hospital.';
 const found=passages(source).find(p=>p.text==='I perform over 200 hip and knee replacements each year.');
 assert.ok(found);
 assert.equal(found.type,'clinical-practice');
 assert.ok(found.qualifiers.includes('self-reported-activity'));
 assert.ok(!found.qualifiers.includes('team-context-not-individual-activity'));
});

test('a claimed first ever procedure remains a source claim',()=>{
 const source='His practice entails robotic surgery, for which he was fortunate to have performed the first ever MAKO procedure in the region.';
 const found=passages(source).find(p=>p.text.includes('first ever'));
 assert.ok(found);
 assert.ok(found.qualifiers.includes('source-reported-first-claim-not-independently-verified'));
});

test('explicit singular clinical practice scope stays distinct from performed replacements',()=>{
 const source='My clinical practice includes the surgical and non-surgical treatment of arthritis affecting the hip and knee. I perform hip replacement surgery.';
 const found=passages(source).find(p=>p.text.startsWith('My clinical practice includes'));
 assert.ok(found);
 assert.equal(found.type,'clinical-practice');
 assert.ok(!found.qualifiers.includes('team-context-not-individual-activity'));
 assert.ok(passages(source).some(p=>p.text.includes('I perform hip replacement surgery.')));
});

test('named owner resumes after colleagues named in a fellowship narrative',()=>{
 const source='Mr Alex Example then undertook post-accreditation fellowship training in knee surgery. The first was a fellowship in Harrogate, where he worked with Mr Nick London. The second was a national fellowship working alongside the late Mr Stuart Calder and Mr Ram Venkatesh at a teaching hospital. He was appointed as a Consultant knee surgeon in September 2014. Mr Example is an Honorary Senior Lecturer. He is a faculty member on national courses.';
 const found=passages(source).filter(p=>p.text.includes('He was appointed as a Consultant knee surgeon in September 2014.')||p.text.includes('He is a faculty member on national courses.'));
 assert.ok(found.some(p=>p.text.includes('He was appointed as a Consultant knee surgeon in September 2014.')),JSON.stringify(found));
 assert.ok(found.some(p=>p.text.includes('He is a faculty member on national courses.')),JSON.stringify(found));
 assert.ok(found.every(p=>!p.qualifiers.includes('colleague-context-not-owner-evidence')));
});

test('a singular practice scope that mentions a special interest stays background',()=>{
 const source='His practice encompasses knee surgery with a special interest in ligament reconstruction.';
 const found=passages(source).find(p=>p.text===source);
 assert.ok(found);
 assert.equal(found.type,'professional-background');
 assert.ok(!found.qualifiers.includes('team-context-not-individual-activity'));
 assert.ok(!found.qualifiers.includes('stated-interest'));
});

test('a later pronoun keeps colleague context until the previous sentence names the owner',()=>{
 const source='She trained alongside Mr Jamie Brown in Leeds. He publishes on joint replacement. Mr Alex Example is a consultant. He teaches on national courses.';
 const found=passages(source);
 const publishes=found.find(p=>p.text.startsWith('He publishes'));
 const teaches=found.find(p=>p.text.includes('He teaches on national courses.'));
 assert.ok(publishes);
 assert.ok(teaches);
 assert.ok(publishes.qualifiers.includes('colleague-context-not-owner-evidence'));
 assert.ok(!teaches.qualifiers.includes('colleague-context-not-owner-evidence'));
});

test('a practice description without the owner performing stays background',()=>{
 for(const source of [
  'His practice involves treating spinal conditions.',
  'His practice offers same-day ultrasound and hysteroscopy appointments.',
  'He is regularly invited to perform complex operations for a conference audience.',
  'He is able to offer bedside ultrasound and guided injections.'
 ]){
  const found=passages(source).find(p=>p.text===source);
  assert.ok(found,source);
  assert.equal(found.type,'professional-background',source);
 }
});

test('a finite owner performance stays clinical practice',()=>{
 const source='My practice covers upper limb surgery and I perform shoulder operations.';
 const found=passages(source);
 const practice=found.find(p=>p.text.startsWith('My practice covers'));
 const performed=found.find(p=>p.text.includes('I perform shoulder operations.'));
 assert.ok(practice);
 assert.ok(performed);
 assert.equal(practice.type,'professional-background');
 assert.equal(performed.type,'clinical-practice');
});
