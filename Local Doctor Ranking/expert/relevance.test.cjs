'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ExpertSearchEngine,directMatch,matrixFor}=require('./search.cjs');
const {parseBrief}=require('./brief.cjs');
const ct={id:'ct',kind:'modality',label:'Cardiac CT',text:'Cardiac CT',importance:'essential'};
const person=id=>({id,name:id,role:'Clinician',specialty:'Cardiology',locations:[],organisations:[],sourceRecordIds:[id],profileUrls:[],evidenceIds:[]});
const fact=(id,candidateId,text,type='clinical-practice')=>({id,candidateId,text,type,field:'about',attributes:{},qualifiers:[],sourceRecordId:candidateId,sourceUrl:'https://example.org/'+candidateId,dates:{},attribution:'source-record'});
test('unrelated cardiac and CT terms in a list do not establish cardiac CT',()=>{assert.equal(directMatch(ct,fact('x','a','Cardiac rhythm disorders; CT colonography.')),false);assert.equal(directMatch(ct,fact('x','a','I report cardiac CT.')),true);});
test('explicit coronary CT phrase variants retain their clinical meaning',()=>{for(const text of ['I supervise and report adult cardiac/coronary CT.','I routinely report CT coronary angiograms.','CTCA reporting.'])assert.equal(directMatch(ct,fact('x','a',text)),true);assert.equal(directMatch(ct,fact('x','a','Coronary angiography.')),false);});
test('historical protocol coauthorship does not establish diagnostic appraisal activity',()=>{const p=fact('x','a','Coauthor of a protocol evaluating diagnostic accuracy.','research');p.review={limitations:['Historical coauthorship supports study involvement, not a specific investigator task or appraisal competence.']};const r={id:'r',kind:'research',label:'Diagnostic study evaluation',text:'Diagnostic study evaluation',importance:'preferred'};assert.equal(matrixFor(person('a'),[p],{requirements:[r]})[0].status,'potential');});
test('explicit study involvement supports research without implying a researcher qualification',()=>{const r={id:'r',kind:'research',label:'Clinical research',text:'Clinical research',importance:'preferred'};assert.equal(directMatch(r,fact('x','a','Coauthor of a 2010 study protocol.','research')),true);});
test('practice evidence outranks a repeated clinical-interest list with identical coverage',async()=>{const candidates=['a','b'].map(person),passages=[fact('a1','a','I supervise and report cardiac CT.'),...Array.from({length:12},(_,i)=>fact('b'+i,'b','Cardiac CT; coronary disease; hypertension; chest pain.','clinical-interest'))];const e=new ExpertSearchEngine({cacheDir:null,embedQuery:async ts=>ts.map(()=>[1,0])});await e.init({version:'fixture',candidates,passages});const x=await e.search({requirements:[ct],roles:[]});assert.equal(x.results[0].id,'a');});
test('reviewed summaries are not presented as literal quotations in card reasons',async()=>{const p=fact('x','a','The biography describes cardiac CT reporting.');p.reviewedParaphrase=true;p.sourceQuote='I report cardiac CT.';const e=new ExpertSearchEngine({cacheDir:null,embedQuery:async ts=>ts.map(()=>[1,0])});await e.init({version:'fixture',candidates:[person('a')],passages:[p]});const x=await e.search({requirements:[ct],roles:[]});assert(x.results[0].reasons[0].text.includes('I report cardiac CT.'));assert(!x.results[0].reasons[0].text.includes('The biography'));});
test('substantive practice evidence is retained when several earlier interest passages exist',()=>{const ps=[1,2,3,4].map(i=>fact('i'+i,'a','Cardiac CT','clinical-interest'));ps.push(fact('practice','a','I report cardiac CT.'));const m=matrixFor(person('a'),ps,{requirements:[ct]})[0];assert(m.evidenceIds.includes('practice'));});

test('therapeutic ultrasound does not establish diagnostic ultrasound expertise',()=>{
  const r={id:'ultrasound',kind:'modality',label:'Ultrasound',text:'Ultrasound',importance:'essential'};
  for(const text of ['Ultrasound phacoemulsification of cataract, with lens implant.','High-intensity focused ultrasound treatment.','Therapeutic ultrasound.'])assert.equal(directMatch(r,fact('p','a',text,'procedure')),false);
  assert.equal(directMatch(r,fact('p','a','Therapeutic ultrasound. I also report abdominal ultrasound.')),true);
  assert.equal(directMatch(r,fact('p','a','I perform echocardiography.')),true);
});

test('a supplied technology retains clinical context without inventing its function',()=>{
  const p=parseBrief({message:'We need two perspectives for heart-failure software.'});
  assert.equal(p.needsClarification,false);
  const technology=p.brief.requirements.find(r=>r.kind==='technology');
  assert.equal(technology.label,'Device context');assert.equal(technology.text,'software');
  assert(!/diagnos|monitor|detect/i.test(technology.text));
  for(const message of ['We need a specialist.','We need someone for software.'])assert.equal(parseBrief({message}).needsClarification,true);
  assert.equal(parseBrief({message:'Find a dermatologist.'}).needsClarification,false);
  const removed=parseBrief({previous:p.brief,removeRequirementId:technology.id});assert.equal(removed.needsClarification,false);assert.equal(removed.brief.requirements.length,1);assert.equal(removed.brief.requirements[0].label,'Heart failure');
});
