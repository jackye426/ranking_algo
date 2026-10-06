'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyPassage}=require('./data.cjs');
const {matrixFor}=require('./search.cjs');
const {outcome}=require('./public/evidence.js');
const candidate={id:'fictional',name:'Fictional clinician',locations:[]};
const modality={id:'ct',kind:'modality',label:'Cardiac CT',importance:'essential'},report={id:'report',kind:'activity',label:'Image interpretation',importance:'essential'},brief={requirements:[modality,report]};
const p=text=>({id:'owned',candidateId:candidate.id,sourceRecordId:'synthetic-profile',text,type:'clinical-practice',field:'about',attributes:{},qualifiers:[]});

for(const text of [
  'My primary interests involves the use of advanced non-invasive cardiac imaging modalities eg cardiac MRI, cardiac CT, echocardiography to investigate and treat a variety of cardiac conditions including coronary artery disease.',
  'My primary interests involve the use of cardiac CT to investigate and treat coronary artery disease.',
  'Her clinical interest involves reporting cardiac CT.',
  'My clinical interests include reporting cardiac CT.',
  'Clinical interests includes the use of cardiac CT to treat cardiovascular disease.'
])test('a stated interest predicate is not performed clinical activity: '+text,()=>{
  assert.equal(classifyPassage(text,'about'),'clinical-interest');
  const source=p(text),rows=matrixFor(candidate,[source],brief);
  assert.equal(rows[0].supportingEvidence[0].evidenceType,'clinical-interest');assert.notEqual(rows[1].status,'documented');
  assert.equal(outcome(rows[0],{...candidate,evidence:[source]},modality).label,'Listed interest');
});

for(const text of [
  'I personally report cardiac CT.',
  'Dr Fictional has extensive experience in reporting CT coronary angiograms.',
  'I perform cardiac CT to investigate coronary artery disease.',
  'My clinical interests include cardiac MRI. I personally report cardiac CT.',
  'My interests involve cardiac MRI, and I routinely report cardiac CT.'
])test('explicit separate clinical work stays clinical: '+text,()=>{
  assert.equal(classifyPassage(text,'about'),'clinical-practice');
  const rows=matrixFor(candidate,[p(text)],brief);assert.equal(rows[0].supportingEvidence[0].evidenceType,'clinical-practice');
  if(/report/i.test(text))assert.equal(rows[1].status,'documented');
});
