'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {canonical,identity,indexedStrings}=require('./prepare-context.cjs');
const {merge}=require('./merge-context-release.cjs');
const {hashValue,applyRepairs,MANDATORY_HOLDS}=require('../releases.cjs');
const baselineSha256='a'.repeat(64),releaseId='context-review-fixture';
const rows=()=>[{id:'fixture-person',name:'Dr Example Person',about:'Existing baseline biography'},...MANDATORY_HOLDS.map(id=>({id,name:'Held fixture'}))];
const packet=()=>({schemaVersion:1,releaseId:'baseline-fixture',baselineSha256,patches:[],holds:MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Mandatory fixture hold'}))});
const item=(text='Greek - Conversational',url='https://provider.example/consultants/example-person')=>({kind:'language',text,provenance:{sourceUrl:url,sourceLabel:'Provider fixture',sourceDate:null,observedAt:null,snapshotSha256:'b'.repeat(64),parserVersion:'fixture-v1',reviewId:'fixture:1',sourceField:'languages'}});
const proposal=(value=[item()],sourceRecordId='fixture-person')=>({baselineSha256,patches:[{sourceRecordId,field:'professional_context',beforeHash:hashValue(null),value,approved:true}]});
const apply=merged=>applyRepairs(rows(),merged.packet,{baselineSha256,releaseId});

test('blank source array entries do not shift provenance indices or trim literal source text',()=>{
 const original=['', ' Greek - Conversational ', '   ', 'Danish'];
 const extracted=indexedStrings(original);
 assert.deepEqual(extracted,[{text:original[1],itemIndex:1},{text:original[3],itemIndex:3}]);
 for(const item of extracted)assert.equal(item.text,original[item.itemIndex]);
 assert.deepEqual(indexedStrings('Danish'),[{text:'Danish',itemIndex:0}]);
 assert.deepEqual(indexedStrings(['', '  ']),[]);
 assert.deepEqual(indexedStrings(['Danish',null]),[]);
});

test('canonical provider URLs discard tracking but reject credential-bearing or non-HTTPS URLs',()=>{
 assert.equal(canonical('https://provider.example/consultants/example-person/?tracking=1#section'),'https://provider.example/consultants/example-person');
 for(const url of ['http://provider.example/person','https://user:secret@provider.example/person','javascript:alert(1)'])assert.equal(canonical(url),null);
});
test('canonical URL cannot excuse a conflicting name or typed GMC',()=>{
 assert.equal(identity({name:'Dr Example Person',gmc_number:'1234567'},{name:'Example Person',gmc_number:'7654321'}),'registration-conflict');
 assert.equal(identity({name:'Dr Different Person',gmc_number:'1234567'},{name:'Example Person',gmc_number:'1234567'}),'name-conflict');
 assert.equal(identity({name:'Dr Example Person',gmc_number:'1234567'},{name:'Example Person',gmc_number:'1234567'}),'canonical-url-name-and-gmc');
});
test('two source contexts merge without changing identity or replacing the biography',()=>{
 const merged=merge(packet(),[proposal(),proposal([item('Danish','https://other.example/profile/example-person')])],releaseId);
 const source=rows(),result=applyRepairs(source,merged.packet,{baselineSha256,releaseId});
 assert.equal(result.rows[0].about,'Existing baseline biography');
 assert.equal(result.rows[0].name,'Dr Example Person');
 assert.equal(result.rows[0].professional_context.length,2);
 assert.equal(source[0].professional_context,undefined);
 assert.equal(merged.report.changesNotClaimedAsNovelFacts,true);
});
test('wrong baseline, occupied precondition, and mandatory held targets fail before merge',()=>{
 const wrong=proposal();wrong.baselineSha256='c'.repeat(64);
 assert.throws(()=>merge(packet(),[wrong],releaseId),/baseline mismatch/);
 const occupied=proposal();occupied.patches[0].beforeHash=hashValue('occupied');
 assert.throws(()=>merge(packet(),[occupied],releaseId),/occupied/);
 for(const id of MANDATORY_HOLDS)assert.throws(()=>merge(packet(),[proposal([item()],id)],releaseId),/held/);
});
test('runtime independently rejects unknown rows and changed original context',()=>{
 assert.throws(()=>apply(merge(packet(),[proposal([item()],'new-person')],releaseId)),/unknown source record/);
 const occupied=rows();occupied[0].professional_context=[{kind:'language',text:'Existing'}];
 assert.throws(()=>applyRepairs(occupied,merge(packet(),[proposal()],releaseId).packet,{baselineSha256,releaseId}),/before-value hash mismatch/);
});
test('identical input artifacts deduplicate while contradictory duplicate source items fail closed',()=>{
 const merged=merge(packet(),[proposal(),proposal()],releaseId);
 assert.equal(merged.report.sourceBoundContextItems,1);assert.equal(apply(merged).rows[0].professional_context.length,1);
 const duplicate=item();duplicate.provenance.reviewId='another-review';
 assert.throws(()=>apply(merge(packet(),[proposal(),proposal([duplicate])],releaseId)),/duplicate professional context item/);
});
test('combined arrays over the context limit are withheld as a whole',()=>{
 const first=Array.from({length:60},(_,i)=>item('Source language '+i));
 const second=Array.from({length:41},(_,i)=>item('Other source language '+i));
 const merged=merge(packet(),[proposal(first),proposal(second)],releaseId);
 assert.equal(merged.report.sourceBoundContextItems,0);assert.equal(merged.packet.patches.length,0);
 assert.equal(merged.report.outcomes[0].outcome,'withheld-combined-context-limit');
 assert.equal(apply(merged).rows[0].professional_context,undefined);
});
test('a base release with existing context requires explicit reconciliation',()=>{
 const base=packet();base.patches=proposal().patches;
 assert.throws(()=>merge(base,[proposal()],releaseId),/explicit reconciliation/);
});
test('runtime rejects performed-activity invention or absent provenance from context artifacts',()=>{
 const invented=item();invented.kind='performed-procedure';
 assert.throws(()=>apply(merge(packet(),[proposal([invented])],releaseId)),/invalid context kind/);
 const unbound=item();delete unbound.provenance.snapshotSha256;
 assert.throws(()=>apply(merge(packet(),[proposal([unbound])],releaseId)),/incomplete source provenance/);
});
