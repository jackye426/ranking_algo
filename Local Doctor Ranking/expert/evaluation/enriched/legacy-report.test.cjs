'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyFailure,report}=require('./legacy-report.cjs');
test('only the explicitly documented clarification conflict receives that label',()=>{
 assert.equal(classifyFailure({id:'dev-insufficient-evidence-1',name:'clarification'}).classification,'documented-contract-conflict');
 assert.equal(classifyFailure({id:'dev-insufficient-evidence-1',name:'correct-candidate-evidence'}).classification,'other-failure');
 assert.equal(classifyFailure({id:'unknown-new-case',name:'clarification'}).classification,'other-failure');
});
test('known unresolved control failures remain functional defects',()=>{
 assert.equal(classifyFailure({id:'final-insufficient-03',name:'requirement:Cardiac CT'}).classification,'known-functional-control');
});
test('disposition reporting preserves raw failure and gate status',()=>{
 const failure={id:'dev-insufficient-evidence-1',name:'clarification',pass:false};
 const source={passed:false,gates:{criticalChecks:false},summary:Object.fromEntries(['bm25','semantic','hybrid'].map(m=>[m,{cases:1,checks:3,failedChecks:[failure]}])),cases:[]};
 const before=JSON.stringify(source),result=report([{name:'main',sha256:'source-hash',value:source}]);
 assert.equal(JSON.stringify(source),before);assert.equal(result.rawLegacyAcceptance,false);assert.equal(result.byMode.hybrid.rawFailedChecks,1);assert.equal(result.byMode.hybrid.documentedContractConflicts,1);assert.equal(result.byMode.hybrid.remainingFailedChecks,0);assert(result.byMode.hybrid.functionalControls.every(c=>!c.present));
});
