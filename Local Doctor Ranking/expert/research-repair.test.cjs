'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assess}=require('./repair/research.cjs');
const source=extra=>({caseId:'synthetic-review-fixture',trialId:'ISRCTN12345678',sourceUrl:'https://www.isrctn.com/ISRCTN12345678',sourceFileSha256:'a'.repeat(64),recordedRole:'Principal investigator',proposedRole:'Principal investigator',sourceChecked:true,identity:{state:'reviewed',reviewed:true,method:'registration-and-independent-profile',candidateId:'synthetic-professional',evidenceUrls:['https://provider.example/professional']},...extra});
test('an independently reviewed explicit role can prepare a role packet without asserting current clinical activity',()=>{
  const result=assess(source());assert.equal(result.status,'eligible-for-reviewed-role-packet');assert.equal(result.eligibleEvidenceType,'research');assert.ok(result.limits.some(x=>x.includes('current activity')));assert.equal(result.verified,undefined);
});
for(const role of ['Public','Scientific','Public, Scientific','Contact'])test(role+' cannot be promoted into principal investigator',()=>{const result=assess(source({recordedRole:role}));assert.equal(result.status,'withheld');assert.ok(result.reasons.includes('first-contact-is-not-an-explicit-investigator-role'));});
test('reviewed public contact remains professional background rather than performed research',()=>{const result=assess(source({recordedRole:'Public',proposedRole:'Public'}));assert.equal(result.status,'eligible-for-reviewed-role-packet');assert.equal(result.eligibleEvidenceType,'professional-background');});
for(const matchMethod of ['arbitrary-seven-digit-number','institution-only','recruitment-status-only'])test(matchMethod+' is quarantined even with a reviewed identity',()=>{assert.equal(assess(source({matchMethod})).status,'withheld');});
for(const state of ['unreviewed','ambiguous','conflict'])test(state+' candidate identity cannot inherit a registry investigator role',()=>{assert.equal(assess(source({identity:{state,reviewed:false}})).status,'withheld');});
test('source role, source digest and independent identity corroboration are required separately',()=>{
  for(const change of [{sourceChecked:false},{sourceFileSha256:'bad'},{identity:{reviewed:true,candidateId:'synthetic-professional',method:'name-only',evidenceUrls:['https://provider.example/professional']}},{identity:{reviewed:true,candidateId:'synthetic-professional',method:'registration-and-independent-profile',evidenceUrls:['https://www.isrctn.com/ISRCTN12345678']}}])assert.equal(assess(source(change)).status,'withheld');
});
