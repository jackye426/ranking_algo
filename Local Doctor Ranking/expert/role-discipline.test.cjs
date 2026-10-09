'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {matrixFor}=require('./search.cjs');
function status(label,text,field='professional_context.profession'){
 const candidate={id:'person',name:'Alex Example'},p={id:'source-passage',candidateId:'person',sourceRecordId:'source',text,field,type:'professional-background',attributes:{},qualifiers:[]};
 return matrixFor(candidate,[p],{requirements:[{id:'role',kind:'role',label,text:label,importance:'focus'}]})[0].status;
}
test('discipline adjectives do not give allied professionals a physician role',()=>{
 for(const [label,discipline] of [['Gastroenterologist','gastroenterology'],['Cardiologist','cardiology'],['Radiologist','radiology'],['Dermatologist','dermatology'],['Oncologist','oncology']]){
  for(const field of ['professional_context.profession','professional_role','about'])
   for(const text of [`I am a ${discipline} dietitian.`,`Registered dietitian specialising in ${discipline}.`,`Alex Example is a ${discipline} dietitian.`])
    assert.notEqual(status(label,text,field),'documented',label+': '+field+': '+text);
 }
 assert.equal(status('Dietitian','I am an Advanced Practice Gastroenterology Dietitian.'),'documented');
 assert.notEqual(status('General practitioner','I work in general practice as a dietitian.'),'documented');
});
test('literal professions and recorded specialty semantics stay supported',()=>{
 for(const [label,specialty] of [['Gastroenterologist','Gastroenterology'],['Cardiologist','Cardiology'],['Radiologist','Radiology']]){
  assert.equal(status(label,`I am a consultant ${label.toLowerCase()}.`),'documented');
  assert.equal(status(label,specialty,'specialty'),'documented');
 }
 assert.equal(status('General practitioner','GP'),'documented');
 assert.notEqual(status('Radiologist','I work with a radiologist.','about'),'documented');
 assert.notEqual(status('Gastroenterologist','I am not a gastroenterologist.'),'documented');
});
