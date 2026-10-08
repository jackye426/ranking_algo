'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('./server.cjs'),{createBriefInterpreter}=require('./brief.cjs');
async function harness(t,limits={}){
  const searches=[],engine={ready:true,search:async brief=>{searches.push(structuredClone(brief));return {corpusVersion:'test-v1',results:[{id:'candidate',name:'Candidate',locations:[{name:'UK practice',country:'UK',latitude:51.5,longitude:-.1}],evidence:[],requirementMatrix:[]}]};}};
  const geo={resolveLocation:async input=>({status:'resolved',location:input?{kind:'country',country:'GB',query:'UK',label:'UK-wide'}:null})};
  const app=createApp(engine,{interpret:createBriefInterpreter({client:null}),geo,limits}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  return {searches,post:async(path,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/expert/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}};
}
test('device-only request searches without a model or location and metadata is returned in the same snapshot',async t=>{
  const h=await harness(t),r=await h.post('search',{deviceCode:'Z12040118'});assert.equal(r.status,200);assert.equal(r.body.brief.deviceContext.classifications[0].code,'Z12040118');assert.equal(r.body.brief.locationFilter,null);assert.equal(h.searches.length,1);const saved=await h.post('shortlist-view',{sessionId:r.body.sessionId,searchId:r.body.searchId,candidateIds:['candidate']});assert.deepEqual(saved.body.brief,r.body.brief);
});
test('clarification keeps the previous accepted brief, shortlist and geography intact',async t=>{
  const h=await harness(t),first=await h.post('search',{message:'Only cardiologists for cardiac CT',locationFilter:{query:'UK'}}),before=first.body.brief;
  const question=await h.post('search',{sessionId:first.body.sessionId,message:'EMDN Z11030692'});assert.equal(question.status,422);assert.equal(question.body.code,'device-clarification');assert.equal(question.body.deviceDraft.classifications[0].code,'Z11030692');assert.equal(h.searches.length,1);
  const old=await h.post('shortlist-view',{sessionId:first.body.sessionId,searchId:first.body.searchId,candidateIds:['candidate']});assert.deepEqual(old.body.brief,before);
  const answer=await h.post('search',{sessionId:first.body.sessionId,deviceCode:question.body.deviceDraft.classifications[0].code,message:'Coronary artery disease diagnosis'});assert.equal(answer.status,200);assert.equal(answer.body.brief.locationFilter.country,'GB');assert.equal(answer.body.brief.roleMode,'only');assert.equal(answer.body.brief.deviceContext.classifications[0].code,'Z11030692');assert.equal(h.searches.length,2);
});
test('unknown, multiple, negated and conflicting device changes never execute the old criteria as a new search',async t=>{
  const h=await harness(t),first=await h.post('search',{message:'Dermoscopy'});
  for(const message of ['EMDN X999999','EMDN J010792 and Z12040118','not EMDN J010792','Z11030692 for dermoscopy']){const r=await h.post('search',{sessionId:first.body.sessionId,message});assert.equal(r.status,422,message);assert.match(r.body.code,/^device-/);assert.equal(h.searches.length,1);}
  const old=await h.post('shortlist-view',{sessionId:first.body.sessionId,searchId:first.body.searchId,candidateIds:['candidate']});assert.deepEqual(old.body.brief,first.body.brief);
});
test('code removal preserves separately requested role and hard geographic scope',async t=>{
  const h=await harness(t),first=await h.post('search',{message:'Dermatologists for Z12040118',locationFilter:{query:'UK'}}),removed=await h.post('search',{sessionId:first.body.sessionId,deviceCode:null});assert.equal(removed.status,200);assert.equal(removed.body.brief.deviceContext,undefined);assert.equal(removed.body.brief.locationFilter.country,'GB');assert.deepEqual(removed.body.brief.requirements.map(r=>r.label),['Dermatologist']);
});
test('resume retains official code and exact active criteria without trusting client-supplied metadata changes',async t=>{
  const h=await harness(t),first=await h.post('search',{message:'Z12040118'}),resumed=await h.post('search',{resumeBrief:first.body.brief});assert.equal(resumed.status,200);assert.deepEqual(resumed.body.brief,first.body.brief);
  const forged=structuredClone(first.body.brief);forged.deviceContext.classifications[0].officialTerm='Coronary CT';const rejected=await h.post('search',{resumeBrief:forged});assert.equal(rejected.status,422);assert.equal(rejected.body.code,'device-version-changed');assert.equal(h.searches.length,2);
});
test('device request accepts only code text or explicit null, never client mappings or source claims',async t=>{
  const h=await harness(t);for(const body of [{deviceCode:{code:'Z12040118'}},{deviceCode:true},{deviceCode:''},{deviceCode:'x'.repeat(33)},{deviceCode:'Z12040118',deviceContext:{approved:true}}])assert.equal((await h.post('search',body)).status,400);assert.equal(h.searches.length,0);
});
test('unresolved first requests do not consume the live-session pool',async t=>{
  const h=await harness(t,{sessions:1});for(let i=0;i<3;i++)assert.equal((await h.post('search',{message:'EMDN Z11030692'})).status,422);assert.equal((await h.post('search',{message:'Z12040118'})).status,200);
});
test('adding a code to an incomplete resumed brief rechecks its new sufficiency',async t=>{
  const h=await harness(t),first=await h.post('search',{message:'Z12040118'}),removed=await h.post('search',{sessionId:first.body.sessionId,removeRequirementId:first.body.brief.requirements[0].id});assert.equal(removed.body.needsClarification,true);const resumed=await h.post('search',{resumeBrief:removed.body.brief,deviceCode:'J010792'});assert.equal(resumed.status,200);assert.equal(resumed.body.needsClarification,false);assert.equal(h.searches.length,2);assert.equal(resumed.body.brief.deviceContext.classifications[0].code,'J010792');
});
test('generic clarification returns a proposed partial brief and structured examples without running discovery',async t=>{
  const h=await harness(t),r=await h.post('search',{message:'Adults in primary care'});
  assert.equal(r.status,200);assert.equal(r.body.needsClarification,true);assert.equal(r.body.question,r.body.clarification.question);assert.equal(r.body.clarification.kind,'expertise');assert.deepEqual(r.body.clarification.quickReplies.map(x=>x.message),['Cardiologists','Dermatologists','Cardiac imaging research']);assert.deepEqual(r.body.brief.requirements.map(r=>r.label),['Adults','Primary care']);assert.equal(h.searches.length,0);assert.equal(r.body.searchId,undefined);
  const answered=await h.post('search',{resumeBrief:r.body.brief,message:'Cardiologists'});assert.equal(answered.status,200);assert.equal(answered.body.needsClarification,false);assert.equal(answered.body.clarification,undefined);assert.ok(answered.body.brief.requirements.some(r=>r.label==='Primary care'));assert.equal(h.searches.length,1);
});
test('cancelling a generic proposal can resume the accepted brief in a new session while the old snapshot stays readable',async t=>{
  const h=await harness(t),accepted=await h.post('search',{message:'Cardiologists in primary care'}),pending=await h.post('search',{sessionId:accepted.body.sessionId,removeRequirementId:accepted.body.brief.requirements.find(r=>r.kind==='role').id});
  assert.equal(pending.body.needsClarification,true);assert.equal(pending.body.clarification.kind,'expertise');assert.ok(!pending.body.brief.requirements.some(r=>r.kind==='role'));assert.equal(h.searches.length,1);
  const afterCancel=await h.post('search',{resumeBrief:accepted.body.brief,message:'Clinical research helpful'});assert.equal(afterCancel.body.needsClarification,false);assert.notEqual(afterCancel.body.sessionId,accepted.body.sessionId);assert.ok(afterCancel.body.brief.requirements.some(r=>r.label==='Cardiologist'));assert.ok(afterCancel.body.brief.requirements.some(r=>r.label==='Primary care'));
  const old=await h.post('shortlist-view',{sessionId:accepted.body.sessionId,searchId:accepted.body.searchId,candidateIds:['candidate']});assert.equal(old.status,200);assert.deepEqual(old.body.brief,accepted.body.brief);
});
test('device clarification exposes deterministic CT and V92 steps while genuine errors expose no quick replies',async t=>{
  const h=await harness(t),ct=await h.post('search',{message:'Z11030692'});assert.equal(ct.status,422);assert.equal(ct.body.code,'device-clarification');assert.equal(ct.body.clarification.kind,'ct-application');assert.equal(ct.body.clarification.question,'That’s CT medical-device software. What will it be used for?');assert.equal(ct.body.question,ct.body.clarification.question);assert.deepEqual(ct.body.clarification.quickReplies.map(x=>x.message),['Cardiac CT','Brain CT','Lung CT','General CT']);
  const first=await h.post('search',{message:'V92'});assert.equal(first.status,422);assert.equal(first.body.clarification.kind,'device-purpose');
  for(const reply of first.body.clarification.quickReplies){const next=await h.post('search',{deviceCode:'V92',message:reply.message});assert.equal(next.status,422);assert.equal(next.body.clarification.kind,'device-clinical-subject');assert.deepEqual(next.body.clarification.quickReplies,[]);}
  for(const message of ['EMDN X999999','Z11030692 for dermoscopy','Remove photonics experience']){const bad=await h.post('search',{message});assert.equal(bad.status,422);assert.notEqual(bad.body.code,'device-clarification');assert.equal(bad.body.clarification,undefined);}
  assert.equal(h.searches.length,0);
});
