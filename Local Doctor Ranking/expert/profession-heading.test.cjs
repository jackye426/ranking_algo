'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{buildCorpus}=require('./data.cjs');
function corpus(text,extra={},kind='profession'){
 const row={id:'source',name:'Alex Example',hcpc_number:'DT54321',specialty:'Coaching / mentoring',professional_context:[{kind,text,sourceUrl:'https://example.org/alex',sourceLabel:'Professional source',sourceRecordId:'source',repairProvenance:{releaseId:'reviewed-release',reviewId:'reviewed-owner-role'}}],...extra};
 return {row,value:buildCorpus([row])};
}
test('reviewed profession heads cards without rewriting canonical identity, specialty or evidence',()=>{
 const {row,value}=corpus('I am an Advanced Practice Gastroenterology Dietitian.'),c=value.candidates[0];
 assert.equal(c.role,'Dietitian');assert.equal(c.specialty,row.specialty);
 assert.ok(value.passages.some(p=>p.field==='professional_context.profession'&&p.text==='I am an Advanced Practice Gastroenterology Dietitian.'));
 assert.equal(row.specialty,'Coaching / mentoring');assert.equal(row.professional_role,undefined);
 assert.equal(corpus('Registered Dietitian and Registered Nutritionist').value.candidates[0].role,'Dietitian');
 assert.equal(corpus('I am a dietitian.',{professional_role:'Clinical lead'}).value.candidates[0].role,'Clinical lead');
});
test('headings never infer profession from a specialty topic, provider, biography, colleague or historical experience',()=>{
 for(const text of ['Gastroenterology','I am not a dietitian.','Previously I was a dietitian.','I worked as a dietitian.','My colleague is a dietitian.','Our team includes a dietitian.','I offer services with a dietitian.','Experience as a dietitian.'])
  assert.equal(corpus(text).value.candidates[0].role,'Coaching / mentoring',text);
 assert.equal(corpus('I am a dietitian.',{},'biography').value.candidates[0].role,'Coaching / mentoring');
 const unsafe=corpus('I am a dietitian.',{professional_context:[{kind:'profession',text:'Dietitian'}]});
 assert.equal(unsafe.value.candidates[0].role,'Coaching / mentoring');
});
