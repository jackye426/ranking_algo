'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('./server.cjs'),{createBriefInterpreter}=require('./brief.cjs');
async function harness(t){
 const calls=[],engine={ready:true,search:async brief=>{calls.push(structuredClone(brief));return {corpusVersion:'fixture-v1',results:[{id:'c',name:'Professional',evidence:[],requirementMatrix:[],locations:[]}]};}};
 const geo={resolveLocation:async input=>input?.query==='unavailable'?{status:'unavailable',message:'Location temporarily unavailable'}:{status:'resolved',location:input?{kind:'country',country:'GB',query:'UK',label:'UK-wide'}:null}};
 const server=createApp(engine,{interpret:createBriefInterpreter({client:null}),geo}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const post=async body=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/expert/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 return {post,calls,engine};
}
const refs=brief=>(brief.deviceContext?.classifications||[brief.deviceContext]).filter(Boolean).map(x=>x.system+':'+x.code);
const continuation=d=>({proposal:d,questionId:d.questionId,questionRevision:d.questionRevision});
test('MDR software has a structured two-step continuation with no accepted result before subject',async t=>{
 const h=await harness(t),q=await h.post({message:'mda0315',acceptedBriefVersion:0,requestId:'purpose-request'});
 assert.equal(q.status,422);assert.equal(q.body.code,'device-clarification');assert.equal(q.body.clarification.kind,'device-purpose');assert.equal(q.body.clarification.quickReplies.length,3);assert.equal(h.calls.length,0);
 const next=await h.post({message:q.body.clarification.quickReplies[0].message,classificationContinuation:continuation(q.body.deviceDraft),acceptedBriefVersion:0,requestId:'subject-request'});
 assert.equal(next.status,422);assert.equal(next.body.clarification.kind,'device-clinical-subject');assert.equal(h.calls.length,0);
 const done=await h.post({message:'Coronary artery disease on cardiac CT',classificationContinuation:continuation(next.body.deviceDraft),acceptedBriefVersion:0,requestId:'results-request'});
 assert.equal(done.status,200);assert.equal(done.body.needsClarification,false);assert.ok(refs(done.body.brief).includes('MDR:MDA0315'));assert.ok(done.body.brief.requirements.some(r=>r.label==='Cardiac CT'));assert.equal(h.calls.length,1);
});
test('code set, pending answer and explicit location remain one atomic proposal',async t=>{
 const h=await harness(t),first=await h.post({message:'Cardiologists'});
 const q=await h.post({sessionId:first.body.sessionId,message:'MDA0315 + MDS1009 + MDT2010 in the UK',acceptedBriefVersion:first.body.brief.version});
 assert.equal(q.status,422);assert.equal(q.body.deviceDraft.proposedBrief.locationFilter.country,'GB');assert.equal(h.calls.length,1);
 const reply=await h.post({sessionId:first.body.sessionId,message:'Diagnosing coronary artery disease using cardiac CT',classificationContinuation:continuation(q.body.deviceDraft),acceptedBriefVersion:first.body.brief.version});
 assert.equal(reply.status,200);assert.equal(refs(reply.body.brief).length,3);assert.equal(reply.body.brief.locationFilter.country,'GB');assert.equal(h.calls.length,2);
});
test('unknown bundle member cannot partially update accepted classifications',async t=>{
 const h=await harness(t),first=await h.post({message:'Z12040118'});
 const bad=await h.post({sessionId:first.body.sessionId,message:'MDA0315 + MDS9999 for cardiac CT diagnosis'});assert.equal(bad.status,422);assert.match(bad.body.error,/MDS9999/);assert.equal(h.calls.length,1);
 const next=await h.post({sessionId:first.body.sessionId,message:'Clinical research helpful'});assert.equal(next.status,200);assert.deepEqual(refs(next.body.brief),refs(first.body.brief));
});
test('successful retries share one snapshot and conflicting request reuse fails',async t=>{
 const h=await harness(t),body={message:'Cardiologists',acceptedBriefVersion:0,requestId:'fixed-request'};
 const first=await h.post(body),again=await h.post(body);assert.equal(first.status,200);assert.deepEqual(again.body,first.body);assert.equal(h.calls.length,1);
 const changed=await h.post({...body,message:'Dermatologists'});assert.equal(changed.status,409);assert.equal(h.calls.length,1);
});
test('stale accepted version cannot overwrite a newer result',async t=>{
 const h=await harness(t),first=await h.post({message:'Cardiologists'});
 const second=await h.post({sessionId:first.body.sessionId,message:'Clinical research helpful',acceptedBriefVersion:first.body.brief.version});assert.equal(second.status,200);
 const stale=await h.post({sessionId:first.body.sessionId,message:'Dermoscopy',acceptedBriefVersion:first.body.brief.version});assert.equal(stale.status,409);assert.equal(stale.body.code,'stale-brief');assert.equal(h.calls.length,2);
});
test('a generic clarification does not commit a partial brief',async t=>{
 const h=await harness(t),first=await h.post({message:'Cardiologists'});
 const pending=await h.post({sessionId:first.body.sessionId,removeRequirementId:first.body.brief.requirements[0].id,acceptedBriefVersion:first.body.brief.version});assert.equal(pending.body.needsClarification,true);
 const kept=await h.post({sessionId:first.body.sessionId,message:'Clinical research helpful',acceptedBriefVersion:first.body.brief.version});assert.equal(kept.status,200);assert.ok(kept.body.brief.requirements.some(r=>r.label==='Cardiologist'));
});
test('unavailable location cannot commit valid new codes',async t=>{
 const h=await harness(t),first=await h.post({message:'Cardiologists'});
 const bad=await h.post({sessionId:first.body.sessionId,message:'MDA0315 for coronary diagnosis',locationFilter:{query:'unavailable'}});assert.equal(bad.status,422);assert.equal(bad.body.code,'location-unavailable');
 const kept=await h.post({sessionId:first.body.sessionId,message:'Research helpful',acceptedBriefVersion:first.body.brief.version});assert.equal(kept.status,200);assert.equal(kept.body.brief.deviceContext,undefined);
});
test('mixed controls and malformed transaction versions are rejected before retrieval',async t=>{
 const h=await harness(t);
 for(const body of [{message:'Cardiologists',requestId:3},{message:'Cardiologists',acceptedBriefVersion:-1},{deviceCode:'Z12040118',classificationUpdate:{action:'clear'}},{classificationUpdate:{action:'invent'}},{message:'Cardiologists',classificationContinuation:{proposal:{},questionId:'q',questionRevision:0}}])assert.equal((await h.post(body)).status,400);
 assert.equal(h.calls.length,0);
});
