'use strict';
// Runs synthetic patient requests against a ready service; incurs bounded AI calls.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {matchesClinicalCriteria}=require('../clinical-filters.cjs');
const base=process.env.DOCMAP_VERIFY_URL || 'http://localhost:3000';
async function post(route,body,expected=200) {
  const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
}
const counts=data=>({criteria:data.criteria,total:data.total,returned:data.results.length,interpretation:data.queryInterpretation});
async function explanation(search) {
  const request={sessionId:search.sessionId,searchId:search.searchId,consultantId:search.results[0].id};
  const answer=await post('/api/match-explanation',request);
  assert.equal(answer.provider,'openrouter',JSON.stringify(answer));
  assert.ok(answer.summary.length>180 && answer.summary.length<=800);
  assert.ok(answer.reasons.length>0 && answer.citations.length>0);
  const ids=new Set(answer.citations.map(c=>c.id));
  assert.ok(answer.reasons.every(reason=>reason.evidenceIds.every(id=>ids.has(id))));
  assert.equal(new Set(answer.citations.map(c=>`${c.sourceUrl}\n${c.text}`)).size,answer.citations.length,'Duplicate source facts');
  assert.ok(!/\+\/-|ureterolysis/i.test(answer.summary),'Technical source shorthand leaked into summary');
  const cached=await post('/api/match-explanation',request);assert.deepEqual(cached,answer);
  return {consultant:search.results[0].name,profileUrl:search.results[0].profileUrl,...answer};
}
(async()=>{
  const health=await fetch(base+'/api/health').then(r=>r.json());
  assert.equal(health.ready,true);assert.equal(health.dataSource,'supabase');
  assert.equal(health.queryInterpreterModel,'deepseek/deepseek-v3.2');assert.equal(health.explanationModel,'deepseek/deepseek-v3.2');
  // Detailed first-person/staging behavior is covered in mocked unit tests.
  // Live provider checks use generic directory queries, without patient context.
  const exact='Find an endometriosis specialist who knows how to perform excision surgery';
  const first=await post('/api/chat',{message:exact});
  assert.equal(first.queryInterpretation.mode,'openrouter',JSON.stringify(first.notices));
  assert.equal(first.criteria.topic,'endometriosis');assert.deepEqual(first.criteria.procedures,['Endometriosis excision']);
  assert.equal(first.criteria.clinicalContext,null);assert.ok(first.results.length);
  assert.ok(first.results.every(record=>matchesClinicalCriteria(record,first.criteria)));
  const london=await post('/api/chat',{sessionId:first.sessionId,message:'In London'});
  assert.equal(london.criteria.location,'London');assert.deepEqual(london.criteria.procedures,first.criteria.procedures);
  assert.equal(london.criteria.clinicalContext,first.criteria.clinicalContext);assert.ok(london.results.length);
  assert.ok(london.results.every(record=>record.distanceMiles<=35 && matchesClinicalCriteria(record,london.criteria)));
  const bupa=await post('/api/chat',{sessionId:first.sessionId,message:'Only those accepting Bupa'});
  assert.equal(bupa.criteria.insurance,'Bupa');assert.deepEqual(bupa.criteria.procedures,first.criteria.procedures);
  assert.ok(bupa.results.every(record=>record.insurers.includes('Bupa')));
  const again=await post('/api/chat',{sessionId:first.sessionId,removeCriterion:'insurance'});
  assert.equal(again.criteria.clinicalContext,first.criteria.clinicalContext);assert.ok(again.results.length);
  const detail=await explanation(london);
  const ambiguous=await post('/api/chat',{sessionId:first.sessionId,message:'I want a surgeon who performs cyberknife surgery'},422);
  assert.ok(ambiguous.clarifications.length);
  const nearby=await post('/api/chat',{sessionId:first.sessionId,message:'Closer to SW5'});
  assert.equal(nearby.criteria.topic,'endometriosis');assert.equal(nearby.criteria.location,'SW5');assert.deepEqual(nearby.criteria.procedures,first.criteria.procedures);
  const cleared=await post('/api/chat',{sessionId:first.sessionId,removeCriterion:'clinicalContext'});
  assert.equal(cleared.criteria.clinicalContext,null);assert.deepEqual(cleared.criteria.procedures,first.criteria.procedures);
  const simple=await post('/api/chat',{message:'endometriosis in London'});
  assert.equal(simple.criteria.topic,'endometriosis');assert.equal(simple.criteria.location,'London');assert.deepEqual(simple.criteria.procedures,[]);
  const simpleExplanation=await explanation(simple);
  const checks=['natural-language clinical query uses validated DeepSeek interpretation','every returned excision match has positive recorded procedure evidence','London then Bupa preserve clinical preferences','missing insurer evidence never relaxes the filter','unsupported procedure asks for clarification without replacing criteria','postcode refinement and context-only removal preserve procedure','detailed and simple searches receive sourced DeepSeek explanations','citations are deduplicated and completed explanations cached'];
  const report={passed:true,base,checkedAt:new Date().toISOString(),health,checks,turns:[first,london,bupa,again,nearby,cleared,simple].map(counts),explanation:detail,simpleExplanation};
  const output=path.join(__dirname,'../.cache/patient-search-live-verification.json');
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,checks,turns:report.turns,explanation:detail.summary,simpleExplanation:simpleExplanation.summary,output},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
