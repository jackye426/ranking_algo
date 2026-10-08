'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {verifyHosted,baseOrigin,ownedLink,p95}=require('./verify-hosted.cjs'),{createApp}=require('../server.cjs'),{parseBrief}=require('../brief.cjs');
async function fixture(t,{fallback=false}={}){
 const password='synthetic-verification-only-password',saved=process.env.EXPERT_PREVIEW_PASSWORD,savedUser=process.env.EXPERT_PREVIEW_USERNAME;process.env.EXPERT_PREVIEW_PASSWORD=password;process.env.EXPERT_PREVIEW_USERNAME='docmap';
 const passages=Array.from({length:7},(_,i)=>({id:'fixture-evidence-'+i,candidateId:'expert-fixture-'+i,text:'This synthetic source records cardiac CT practice.',sourceRecordId:'fixture-source-'+i,field:'about',type:'clinical-practice',dates:{sourceDate:null,observedAt:null,mergeDate:null},sourceUrl:'https://provider.example/fixture-'+i,sourceLabel:'Synthetic provider',qualifiers:[]}));
 const candidates=passages.map((p,i)=>({id:p.candidateId,name:'Dr Synthetic Example '+i,sourceRecordIds:[p.sourceRecordId],evidenceIds:[p.id],evidence:[p],locations:[],profileUrls:[],registrations:[],requirementMatrix:[],questions:[],reasons:[],gaps:[]}));let searches=0,generations=0;
 const engine={ready:true,corpus:{version:'synthetic-corpus',candidates,passages},dataRelease:{releaseId:'synthetic-release',manifestSha256:'a'.repeat(64),baselineSha256:'b'.repeat(64)},search:async brief=>{searches++;return {brief,results:candidates,corpusVersion:'synthetic-corpus'};}};
 const app=createApp(engine,{interpret:async input=>parseBrief(input),generate:async({candidates})=>{generations++;return {provider:fallback?'evidence':'deepseek',model:fallback?undefined:'deepseek/deepseek-v3.2',retryable:fallback,notice:fallback?'Synthetic timeout fallback':null,sections:candidates.map(c=>({candidateId:c.id,text:'Synthetic fixture only.',evidenceIds:c.evidence.map(p=>p.id)})),citations:candidates.flatMap(c=>c.evidence)};}}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root=await fs.mkdtemp(path.join(os.tmpdir(),'expert-hosted-fixture-'));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});if(saved===undefined)delete process.env.EXPERT_PREVIEW_PASSWORD;else process.env.EXPERT_PREVIEW_PASSWORD=saved;if(savedUser===undefined)delete process.env.EXPERT_PREVIEW_USERNAME;else process.env.EXPERT_PREVIEW_USERNAME=savedUser;});return {base:'http://127.0.0.1:'+server.address().port,password,output:path.join(root,'synthetic-report.json'),counts:()=>({searches,generations})};
}
test('verification targets and owned citations cannot carry credentials or escape their origin',()=>{
 for(const base of ['http://public.example','https://user:secret@example.org','https://example.org/?token=secret','https://example.org/path'])assert.throws(()=>baseOrigin(base));assert.equal(baseOrigin('https://example.org'),'https://example.org');assert.equal(p95(Array.from({length:20},(_,i)=>i+1)),19);
 const versions={corpusVersion:'c',profileVersion:'p'};assert.throws(()=>ownedLink('https://foreign.example/api/expert/sources/a?evidence=e&corpusVersion=c&profileVersion=p','https://example.org','a','e',versions));assert.throws(()=>ownedLink('/api/expert/sources/other?evidence=e&corpusVersion=c&profileVersion=p','https://example.org','a','e',versions));
});
test('offline synthetic hosted harness exercises twenty warm searches and complete authenticated evidence flows',async t=>{
 const h=await fixture(t),report=await verifyHosted(h.base,'synthetic-release',h.output,{ai:true,password:h.password});assert.equal(report.status,'passed',JSON.stringify(report.checks.filter(c=>!c.passed)));assert.equal(report.latency.measuredSearches,20);assert.equal(report.warmups.length,3);assert.equal(report.workflows.length,3);assert.equal(report.ai.status,'passed');assert.deepEqual(h.counts(),{searches:23,generations:3});const saved=await fs.readFile(h.output,'utf8');assert.equal(saved.includes(h.password),false);assert.equal(saved.includes('Dr Synthetic'),false);assert.equal(saved.includes('records cardiac CT practice'),false);assert.equal(saved.includes('synthetic-verification-only'),false);
});
test('an honest AI fallback is recorded as incomplete AI acceptance, never a successful DeepSeek explanation',async t=>{
 const h=await fixture(t,{fallback:true}),report=await verifyHosted(h.base,'synthetic-release',h.output,{ai:true,password:h.password});assert.equal(report.status,'failed');assert.equal(report.ai.status,'failed-or-fallback');assert.equal(report.ai.checks.length,3);assert.ok(report.ai.checks.every(c=>c.fallback&&c.noticePresent));assert.equal(report.checks.filter(c=>!c.passed).length,3);
});

test('exact deployment receipts stop a same-ID manifest or corpus mismatch before searches or models',async t=>{
 const h=await fixture(t);
 for(const [key,value,check] of [['expectedManifestSha256','c'.repeat(64),'health-exact-manifest'],['expectedCorpusVersion','unexpected-corpus','health-exact-corpus']]){
  const report=await verifyHosted(h.base,'synthetic-release',h.output+'.'+key,{password:h.password,expectedManifestSha256:'a'.repeat(64),expectedCorpusVersion:'synthetic-corpus',[key]:value});
  assert.equal(report.status,'failed');assert.equal(report.failure.check,check);assert.deepEqual(h.counts(),{searches:0,generations:0});
 }
 const report=await verifyHosted(h.base,'synthetic-release',h.output,{password:h.password,expectedManifestSha256:'a'.repeat(64),expectedCorpusVersion:'synthetic-corpus'});
 assert.equal(report.status,'passed');assert.equal(report.expectedManifestSha256,'a'.repeat(64));assert.equal(report.expectedCorpusVersion,'synthetic-corpus');
 for(const options of [{expectedManifestSha256:'not-a-hash'},{expectedCorpusVersion:''}])await assert.rejects(verifyHosted(h.base,'synthetic-release',h.output+'.invalid',{password:h.password,...options}),/Expected manifest/);
});
