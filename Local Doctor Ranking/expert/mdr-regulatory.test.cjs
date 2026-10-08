'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {matrixFor,directMatch}=require('./search.cjs');
const criterion=(label='Medical-device assessment experience')=>({id:'reg',kind:'regulatory',label,text:label,importance:'preferred'});
const passage=text=>({id:'e',candidateId:'c',sourceRecordId:'r',field:'about',type:'professional-background',text});
for(const text of ['I reviewed MDR tuberculosis treatment outcomes.','I assess technical documentation for building services.','MDA0315 software assessor']){
 test('ambiguous context cannot establish device assessment: '+text,()=>{const r=criterion(),p=passage(text);assert.equal(directMatch(r,p),false);assert.equal(matrixFor({id:'c'},[p],{requirements:[r]})[0].status,'unknown');});
}
test('generic assessment does not establish requested software lifecycle competence',()=>{const r=criterion('Software lifecycle assessment'),p=passage('I assessed medical-device clinical evaluation reports.');assert.equal(directMatch(r,p),false);assert.equal(matrixFor({id:'c'},[p],{requirements:[r]})[0].status,'unknown');});
test('explicit specialised assessment retains attributable evidence',()=>{const r=criterion('Software lifecycle assessment'),p=passage('As a notified body reviewer, I assessed medical device software lifecycle documentation.');assert.equal(directMatch(r,p),true);assert.equal(matrixFor({id:'c'},[p],{requirements:[r]})[0].status,'documented');});
test('explicit general notified-body activity remains supported',()=>{const r=criterion(),p=passage('I act as a clinical assessor for a notified body and evaluate clinical evaluation reports under MDR.');assert.equal(matrixFor({id:'c'},[p],{requirements:[r]})[0].status,'documented');});
