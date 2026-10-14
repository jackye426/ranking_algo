'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{matrixFor}=require('./search.cjs');
const candidate={id:'owner',name:'Alex Example',sourceRecordIds:['source'],evidenceIds:[]};
const brief={requirements:[{id:'role-dietitian',kind:'role',label:'Dietitian',importance:'essential'}]};
const passage=(text,field)=>({id:'p',candidateId:'owner',sourceRecordId:'source',text,field,type:'professional-background',qualifiers:[],attributes:{}});
test('professional-body membership cannot establish the owner profession',()=>{
 // Source review B: Circle professional-body item “Dietitians in Obesity
 // Management” was wrongly presented as the owner's documented role.
 const matrix=matrixFor(candidate,[passage('Dietitians in Obesity Management','professional_context.professional-body')],brief);
 assert.notEqual(matrix[0].status,'documented');
});
test('qualification and membership labels retain background without role certification',()=>{
 for(const field of ['memberships','qualifications','professional_context.membership','professional_context.qualification']){
  const p=passage('Dietitians in Obesity Management',field),matrix=matrixFor(candidate,[p],brief);
  assert.notEqual(matrix[0].status,'documented');
  assert.equal(p.text,'Dietitians in Obesity Management');
 }
});
test('plural professional-body title in prose is not an individual role',()=>{
 assert.notEqual(matrixFor(candidate,[passage('Dietitians in Obesity Management','about')],brief)[0].status,'documented');
});
test('explicit recorded role and owner statement remain documented',()=>{
 for(const [text,field] of [['Dietitian','professional_context.profession'],['I am a registered dietitian.','about'],['Alex Example is a dietitian.','about']]){
  assert.equal(matrixFor(candidate,[passage(text,field)],brief)[0].status,'documented');
 }
});
test('the owner role has priority over a generic description of dietitians',()=>{
 const about=passage('My name is Alex Example\nand I am a knowledgeable and experienced HCPC registered dietitian.','about');
 const general={...passage('Dietitians are the only qualified healthcare professionals to assess, diagnose and treat dietary and nutritional problems.','about'),id:'general',type:'clinical-practice'};
 const matrix=matrixFor(candidate,[general,about],brief);
 assert.equal(matrix[0].status,'documented');
 assert(matrix[0].evidenceIds.includes('p'));
 assert(!matrix[0].evidenceIds.includes('general'));
});
test('the alternative spelling dietician is recognised only with an owner role',()=>{
 assert.equal(matrixFor(candidate,[passage('Alex Example, Dietician at Albyn Hospital.','about')],brief)[0].status,'documented');
});
