'use strict';
// Run against a ready server. This intentionally requests one paid explanation.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.DOCMAP_VERIFY_URL || 'http://localhost:3000';
async function post(route,body) {
  const response=await fetch(`${base}${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  return data;
}
(async()=>{
  const health=await fetch(`${base}/api/health`).then(r=>r.json());
  assert.equal(health.ready,true); assert.equal(health.dataSource,'supabase');
  assert.equal(health.explanationProvider,'openrouter');
  const turns=[]; let sessionId;
  for(const message of ['Find a knee specialist in London','Only those accepting Bupa','Closer to SW5','Only orthopaedic consultants who perform knee replacement']) {
    const answer=await post('/api/chat',{message,...(sessionId?{sessionId}:{})});
    sessionId=answer.sessionId; turns.push(answer);
    assert.ok(answer.searchId); assert.ok(answer.results.length);
    console.log(JSON.stringify({message,criteria:answer.criteria,total:answer.totalMatches ?? answer.total,returned:answer.results.length}));
  }
  const search=turns.at(-1);
  assert.equal(search.criteria.insurance,'Bupa'); assert.equal(search.criteria.location,'SW5');
  assert.ok(search.criteria.specialty); assert.ok(search.criteria.procedures?.length);
  const consultant=search.results.find(r=>/Timothy Waters/i.test(r.name)) || search.results[0];
  const request={sessionId,searchId:search.searchId,consultantId:consultant.id};
  const changed=await post('/api/chat',{sessionId,message:'Any insurer, closer to Bushey'});
  assert.notEqual(changed.criteria.location,search.criteria.location);
  const start=Date.now(); const explanation=await post('/api/match-explanation',request);
  const generationMs=Date.now()-start;
  assert.equal(explanation.provider,'openrouter',explanation.notice);
  assert.ok(explanation.reasons.length);
  const ids=new Set(explanation.citations.map(c=>c.id));
  assert.ok(explanation.reasons.every(r=>r.evidenceIds.every(id=>ids.has(id))));
  assert.ok(JSON.stringify(explanation).includes('Bupa'));
  assert.ok(explanation.caveats.some(c=>/coverage|cover/i.test(c)));
  const cacheStart=Date.now(); const cached=await post('/api/match-explanation',request);
  assert.deepEqual(cached,explanation);
  const cacheMs=Date.now()-cacheStart;
  const tampered=await fetch(`${base}/api/match-explanation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...request,criteria:{insurance:'AXA'}})});
  assert.equal(tampered.status,400);
  const checks=['four-turn location/insurance/specialty/procedure refinement','old-card criteria preserved after a later refinement','real OpenRouter generation','valid evidence citations and insurance caveats','identical cached answer','client-supplied criteria rejected'];
  const report={base,checkedAt:new Date().toISOString(),health,checks,turns:turns.map(t=>({criteria:t.criteria,returned:t.results.length})),consultant:consultant.name,generationMs,cacheMs,explanation};
  const output=path.join(__dirname,'../.cache/explanation-live-verification.json');
  await fs.mkdir(path.dirname(output),{recursive:true}); await fs.writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,checks,consultant:consultant.name,generationMs,cacheMs,explanation,output},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
