'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {matrixFor,directMatch}=require('./search.cjs');
const req=(label,extra={})=>({id:label,label,text:label,kind:'activity',importance:'focus',...extra});
const reported=req('Reported procedure activity'),small=req('Reported range of seven or fewer');
const fact=(volume,extra={})=>({id:'e1',candidateId:'c',sourceRecordId:'r',text:'Cataract extraction',field:'procedure_volumes_phin',type:'procedure',attributes:{},qualifiers:[],volume,...extra});
const check=(r,p,anchors=[])=>matrixFor({id:'c'},Array.isArray(p)?p:[p],{requirements:[r,...anchors]})[0];
const cataract=req('Cataract',{kind:'procedure'});

test('reported procedure data is usable without presenting derived midpoint or unknown period as observed practice',()=>{
 const p=fact({activity:'Cataract extraction',reportedRange:'<=7',countNumeric:3.5,countNumericDerived:true,reportingPeriod:null});
 const result=check(reported,p,[cataract]);assert.equal(result.status,'documented');assert.equal(result.supportingEvidence[0].evidenceType,'activity-volume');assert.match(result.note,/may include zero/);
 assert.equal(check(req('Cataract',{matchIntent:'activity'}),p).status,'potential');
 assert.equal(check(req('Current practice',{kind:'currentPractice'}),p).status,'unknown');
 assert.equal(check(reported,fact({activity:'Cataract extraction',countNumeric:3.5,countNumericDerived:true})).status,'unknown');
});
test('bounded range requests use the source range including zero without assuming a positive count',()=>{
 for(const range of ['<=7','≤7','0–7','<8','1-6'])assert.equal(check(small,fact({activity:'Cataract extraction',reportedRange:range})).status,'documented',range);
 for(const range of ['<=10','8-7','<0','maybe7',''])assert.equal(check(small,fact({activity:'Cataract extraction',reportedRange:range,countNumeric:3.5})).status,'unknown',range);
 assert.equal(check(reported,fact({activity:'Cataract extraction',reportedAdmissions:0})).status,'documented');
 assert.equal(check(reported,fact({activity:'Cataract extraction',reportedRange:'>100'})).status,'documented');
});
test('other procedure volumes and unowned/free-text claims cannot prove requested procedure figures',()=>{
 const p=fact({activity:'Knee arthroscopy',reportedRange:'<=7'});
 assert.equal(check(reported,p,[cataract]).status,'unknown');
 assert.equal(check(reported,fact({activity:'Cataract extraction',reportedRange:'<=7'},{candidateId:'wrong'})).status,'unknown');
 assert.equal(check(reported,fact({activity:'Cataract extraction',reportedRange:'<=7'},{field:'about'})).status,'unknown');
 assert.equal(directMatch(reported,{...p,volume:null,text:'I report procedure activity.'}),false);
});
test('each requested procedure must have its own recorded figures before the compound request is supported',()=>{
 const knee=req('Knee',{kind:'procedure'}),p=fact({activity:'Cataract extraction',reportedAdmissions:4});
 assert.equal(check(reported,p,[cataract,knee]).status,'potential');
 assert.equal(check(reported,[p,fact({activity:'Knee arthroscopy',reportedRange:'<=7'},{id:'e2'})],[cataract,knee]).status,'documented');
});
test('professional specialty metadata supports explicit role aliases without borrowing a colleague role',()=>{
 const role=req('Haematologist',{kind:'role'}),p=fact(null,{type:'professional-background',field:'specialty',text:'Haematology'});
 assert.equal(check(role,p).status,'documented');
 assert.equal(check(role,{...p,field:'about',text:'I work with a haematologist.'}).status,'potential');
 assert.equal(check(role,{...p,field:'about',text:'I am interested in haematology research.'}).status,'potential');
});
