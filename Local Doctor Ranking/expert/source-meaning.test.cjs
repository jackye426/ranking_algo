'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyPassage,extractAttributes,buildCorpus}=require('./data.cjs');
const {matrixFor}=require('./search.cjs');
const candidate={id:'fictional-owner',name:'Dr Alex Jones',role:'Consultant Oncologist'};
const passage=(text,field='about')=>({id:'fictional-evidence',candidateId:candidate.id,sourceRecordId:'fictional-row',text,field,type:classifyPassage(text,field),attributes:extractAttributes(text,field),qualifiers:[],dates:{}});
const outcome=(text,requirement,field='about')=>matrixFor(candidate,[passage(text,field)],{requirements:[{id:'requested',importance:'focus',...requirement}]})[0];
const role={kind:'role',label:'Physiotherapist',text:'Physiotherapist'};
const modality={kind:'modality',label:'Cardiac CT',text:'Cardiac CT',matchIntent:'activity'};

test('an enabling CT accreditation is training evidence, not performed clinical activity',()=>{
  for(const text of [
    'He has achieved level II accreditation in cardiovascular CT enabling independent performance & reporting of cardiac CT.',
    'I hold cardiac CT accreditation which permits independent reporting of cardiac CT.',
    'She is certified to interpret cardiac CT scans.',
  ]){
    assert.equal(classifyPassage(text,'about'),'training',text);
    assert.notEqual(outcome(text,modality).status,'documented',text);
    assert.ok(!extractAttributes(text,'about').activity.includes('image interpretation'),text);
  }
});

test('a separate actual reporting statement survives alongside an accreditation',()=>{
  assert.equal(outcome('I hold level II cardiac CT accreditation. I routinely report cardiac CT scans.',modality).status,'documented');
  assert.equal(outcome('She reports cardiac CT scans at the hospital.',modality).status,'documented');
  assert.equal(outcome('She reports cardiac CT scans and holds accreditation enabling independent cardiac CT reporting.',modality).status,'documented');
});

test('training and teaching clinical techniques do not assert personal clinical performance',()=>{
  for(const text of [
    'He is trained in using the dermatoscope to diagnose skin cancers and to perform mole check.',
    'He lectures on the diagnosis of skin lesions using dermoscopy, recommended as a standard of care when diagnosing skin cancers.',
    'He trains doctors to perform dermoscopy.',
  ]){
    assert.notEqual(classifyPassage(text,'about'),'clinical-practice',text);
    assert.notEqual(outcome(text,{kind:'modality',label:'Skin-lesion imaging',text:'Skin-lesion imaging',matchIntent:'activity'}).status,'documented',text);
  }
  assert.equal(classifyPassage('He teaches doctors to perform dermoscopy and routinely reports cardiac CT scans.','about'),'clinical-practice');
});

test('a named collaborator role does not become the profile owner profession',()=>{
  for(const text of [
    'He is co-founder of a joint tendon clinic with Jamie Brown, world-renowned consultant physiotherapist and previous head of medical services.',
    'I work alongside Jamie Brown, consultant physiotherapist.',
    'My wife is a consultant physiotherapist.',
    'Dr Jamie Brown is a consultant physiotherapist.',
    'The service employs a consultant physiotherapist.',
    'His colleague is a physiotherapist. She is a chartered physiotherapist.',
  ])assert.notEqual(outcome(text,role).status,'documented',text);
});

test('explicit owner roles and independently recorded profession fields remain supported',()=>{
  for(const text of ['I am a physiotherapist.','She is a chartered physiotherapist.','Dr Alex Jones is a consultant physiotherapist.','Consultant physiotherapist'])assert.equal(outcome(text,role).status,'documented',text);
  assert.equal(outcome('Physiotherapist',role,'professional_context.profession').status,'documented');
});

test('source splitting retains a colleague antecedent without assigning their role to the owner',()=>{
 const corpus=buildCorpus([{id:'fictional-row',name:'Dr Alex Jones',gmc_number:'1234567',specialty:'Oncology',about:'His colleague is a physiotherapist. She is a chartered physiotherapist.'}]);
 const owner=corpus.candidates[0],m=matrixFor(owner,corpus.passages,{requirements:[{id:'role',importance:'focus',...role}]})[0];
 assert.notEqual(m.status,'documented');assert.ok(corpus.passages.filter(p=>p.field==='about').every(p=>p.qualifiers.includes('colleague-context-not-owner-evidence')));
});

test('under-eighteen refusal is a visible limitation for a children requirement',()=>{
 const result=outcome('Dr Alex Jones does not see patients under the age 18.',{kind:'population',label:'Children',text:'Children'});
 assert.equal(result.status,'mismatch');assert.match(result.supportingEvidence[0].text,/does not see/);
});

test('explicit past reporting of coordinated scan types supports interpretation without confirming currency',()=>{
 const text='To date, I performed / supervised and reported close to 2,000 cardiac magnetic resonance scans, over 1,800 cardiac computed tomography scans, over 300 transoesophageal echocardiography scans and close to 300 stress echocardiography scans.';
 const m=matrixFor(candidate,[passage(text)],{requirements:[{id:'ct',...modality,importance:'focus'},{id:'report',kind:'activity',label:'Image interpretation',text:'Image interpretation',importance:'focus'}]});
 assert.equal(m.find(r=>r.requirementId==='report').status,'documented');
 assert.equal(m.find(r=>r.requirementId==='report').supportingEvidence[0].sourceDate,null);
 assert.ok(m.find(r=>r.requirementId==='report').supportingEvidence[0].text.includes('reported'));
});

test('procedure ranges attach to their specific knee operation without a fabricated count',()=>{
 const p=passage('Knee ligament reconstruction','procedure_volumes_phin');p.volumes=[{activity:'Knee ligament reconstruction',reportedRange:'<=7',reportedAdmissions:null,reportingPeriod:null,countNumeric:null,countNumericDerived:false}];
 const m=matrixFor(candidate,[p],{requirements:[{id:'knee',kind:'procedure',label:'Knee surgery',text:'Knee surgery',importance:'focus'},{id:'count',kind:'activity',label:'Reported range of seven or fewer',text:'Reported range of seven or fewer',importance:'focus'}]});
 assert.equal(m.find(r=>r.requirementId==='count').status,'documented');assert.equal(p.volumes[0].reportedAdmissions,null);
});

test('an unpunctuated new research sentence cannot borrow complications from clinical care',()=>{
 const text='He provides care for patients with cirrhosis and its complications, including ascites and pre- and post-transplant medical careDr Jones is actively involved in clinical research and has a keen interest in care for patients with cirrhosis and prevention of liver fibrosis.';
 assert.notEqual(outcome(text,{kind:'research',label:'liver cirrhosis and its complications',text:'liver cirrhosis and its complications',matchIntent:'interest'}).status,'documented');
});

test('explicit clinical population wording remains usable without borrowing training or team context',()=>{
 const requirement={id:'adults',kind:'population',label:'Adults',text:'Adults',importance:'essential'},ct={id:'ct',...modality,importance:'focus'};
 for(const clinical of ['I see adult cardiology patients.','Dr Alex Jones manages the full spectrum of adult cardiovascular conditions, including coronary artery disease.']){
  const corpus=buildCorpus([{id:'population-owner',name:'Dr Alex Jones',gmc_number:'1234567',specialty:'Cardiology',about:clinical+' I report cardiac CT scans.'}]);
  const result=matrixFor(corpus.candidates[0],corpus.passages,{requirements:[requirement,ct]});
  assert.equal(result.find(r=>r.requirementId==='adults').status,'documented',clinical);
 }
 for(const clinical of ['I am trained to see adult cardiology patients.','Our team manages the full spectrum of adult cardiovascular conditions.','I teach doctors to see adult cardiology patients.']){
  const corpus=buildCorpus([{id:'population-owner',name:'Dr Alex Jones',gmc_number:'1234567',specialty:'Cardiology',about:clinical+' I report cardiac CT scans.'}]);
  const result=matrixFor(corpus.candidates[0],corpus.passages,{requirements:[requirement,ct]});
  assert.notEqual(result.find(r=>r.requirementId==='adults').status,'documented',clinical);
 }
});
