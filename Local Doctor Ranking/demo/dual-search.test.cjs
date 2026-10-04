'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('./server.cjs');
const {createQueryInterpreter}=require('./query-interpreter.cjs');
const {explanationSnapshot}=require('./match-explanation.cjs');
const {comparisonSnapshot,validateComparison,createComparisonExplainer}=require('./comparison-explanation.cjs');
const records=Array.from({length:14},(_,i)=>({id:`doctor-${i}`,name:`Dr ${i}`,specialty:'Sports medicine',clinicalInterests:['Knee pain','Running injuries'],locations:[{name:'Spire Test Hospital'}],insuranceEvidence:[],evidenceUrl:`/sources/doctor-${i}`,personalizedMatch:{citations:[{text:'Running injuries',sourceUrl:`/sources/doctor-${i}`,criterion:'Clinical interest'}],caveats:[]}}));
async function api(t,options={}) {
  const calls={search:0,page:0,comparison:0};
  const engine={ready:true,records,health:()=>({ready:true}),search:async criteria=>{calls.search++;return {results:records.slice(0,6),total:records.length,notices:[],searchSnapshot:{records,criteria}};},resultsPage:async(_snapshot,offset)=>{calls.page++;return {results:records.slice(offset,offset+6)};}};
  const app=createApp(engine,{interpretQuery:createQueryInterpreter({client:null}),explainMatch:Object.assign(async()=>({provider:'evidence'}),{configured:false}),explainComparison:Object.assign(async()=>{calls.comparison++;return {provider:'openrouter',differences:[],citations:[],retryable:false};},{configured:true}),...options});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const root=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body)=>{const r=await fetch(root+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  return {post,calls,root};
}
test('insufficient input and removing the last topic clarify without generic ranking; history remains usable',async t=>{
  const {post,calls}=await api(t);
  const vague=await post('/api/chat',{message:'I need a specialist.'});assert.equal(vague.status,200);assert.equal(vague.data.needsClarification,true);assert.equal(calls.search,0);
  const found=await post('/api/chat',{sessionId:vague.data.sessionId,message:"I'm a runner with knee pain and want to get back to running"});assert.equal(found.status,200);assert.equal(calls.search,1);
  const retained=await post('/api/chat',{sessionId:found.data.sessionId,message:'I need a specialist.'});assert.equal(retained.data.criteria.topic,'knee pain');assert.match(retained.data.criteria.clinicalContext,/running/);
  const removed=await post('/api/chat',{sessionId:found.data.sessionId,removeCriterion:'topic'});assert.equal(removed.data.needsClarification,true);assert.equal(removed.data.criteria.clinicalContext,null);assert.equal(removed.data.criteria.topic,'');assert.equal(calls.search,2);
  const next=await post('/api/chat',{sessionId:found.data.sessionId,message:'I need a specialist.'});assert.equal(next.data.needsClarification,true);assert.equal(calls.search,2);
  assert.equal((await post('/api/match-explanation',{sessionId:found.data.sessionId,searchId:found.data.searchId,consultantId:records[0].id})).status,200);
});
test('snapshot pagination is idempotent, isolated, and authorises later profiles without a new search',async t=>{
  const {post,calls}=await api(t);const first=(await post('/api/chat',{message:'Knee pain'})).data;
  assert.equal(first.results.length,6);assert.ok(first.nextCursor);assert.equal(first.searchSnapshot,undefined);assert.equal(first.diagnostics,undefined);
  const request={sessionId:first.sessionId,searchId:first.searchId,cursor:first.nextCursor};
  const [page,again]=await Promise.all([post('/api/search-results',request),post('/api/search-results',request)]);
  assert.deepEqual(page.data,again.data);assert.equal(calls.page,1);assert.equal(calls.search,1);assert.equal(page.data.results[0].id,'doctor-6');
  assert.equal((await post('/api/match-explanation',{sessionId:first.sessionId,searchId:first.searchId,consultantId:'doctor-6'})).status,200);
  const last=(await post('/api/search-results',{...request,cursor:page.data.nextCursor})).data;assert.equal(last.results.length,2);assert.equal(last.nextCursor,null);
  const other=(await post('/api/chat',{message:'Knee pain'})).data;
  assert.equal((await post('/api/search-results',{...request,searchId:other.searchId})).status,410);
  assert.equal((await post('/api/search-results',{...request,cursor:'invented'})).status,400);
});
test('comparison uses only served snapshot members and shares cache and generation limits',async t=>{
  const {post,calls}=await api(t,{limits:{sessionGenerations:1}});const first=(await post('/api/chat',{message:'Knee pain'})).data;
  const base={sessionId:first.sessionId,searchId:first.searchId,consultantIds:['doctor-0','doctor-1']};
  assert.equal((await post('/api/comparison-explanation',{...base,consultantIds:['doctor-0','doctor-9']})).status,404);
  assert.equal((await post('/api/comparison-explanation',{...base,consultantIds:['doctor-0','doctor-0']})).status,400);
  assert.equal((await post('/api/comparison-explanation',{...base,profileFacts:'injected'})).status,400);
  assert.equal((await post('/api/comparison-explanation',base)).status,200);
  assert.equal((await post('/api/comparison-explanation',{...base,consultantIds:[...base.consultantIds].reverse()})).status,200);assert.equal(calls.comparison,1);
  assert.equal((await post('/api/comparison-explanation',{...base,consultantIds:['doctor-0','doctor-2']})).status,429);
});
test('direct entry routes serve the correct shell',async t=>{
  const {root}=await api(t);for(const mode of ['directory','guided']) {const response=await fetch(`${root}/${mode}`);assert.equal(response.status,200);assert.match(await response.text(),new RegExp(`data-entry="${mode}"`));}
});
const context=comparisonSnapshot(records.slice(0,2).map(r=>explanationSnapshot({topic:'knee pain',clinicalContext:'I want to return to running'},r)));
const draft={differences:context.consultants.map(person=>({consultantId:person.id,text:'The profile lists running injuries, relevant to your running goal.',evidenceIds:[person.evidence[0].id]}))};
test('comparison validation rejects cross-consultant citations and superiority',()=>{
  assert.equal(validateComparison(draft,context),true);
  const wrong=structuredClone(draft);wrong.differences[0].evidenceIds=[context.consultants[1].evidence[0].id];assert.equal(validateComparison(wrong,context),false);
  const inferred=structuredClone(draft);inferred.differences[0].text='The consultant has a non-surgical practice.';assert.equal(validateComparison(inferred,context),false);
  const superiority=structuredClone(draft);superiority.differences[0].text='The best doctor for you.';assert.equal(validateComparison(superiority,context),false);
});
test('comparison generation requires an independent support check and falls back on rejection',async()=>{
  const calls=[];const responses=[draft,{unsupportedClaims:[]}];
  const client={responses:{create:async(body)=>{calls.push(body);return {status:'completed',output_text:JSON.stringify(responses.shift())};}}};
  const answer=await createComparisonExplainer({client,provider:'openai',model:'test-model'})(context);assert.equal(answer.provider,'openai');assert.equal(calls.length,2);assert.ok(answer.citations.every(c=>/^c[12]:/.test(c.id)));assert.ok(calls.every(c=>c.store===false));
  responses.push(draft,{unsupportedClaims:['Unsupported claim']},draft,{unsupportedClaims:['Unsupported claim']});
  const rejected=await createComparisonExplainer({client,provider:'openai',model:'test-model'})(context);assert.equal(rejected.provider,'evidence');assert.equal(rejected.retryable,true);assert.deepEqual(rejected.differences,[]);assert.equal(calls.length,6);assert.deepEqual(JSON.parse(calls[4].input).repair,['Unsupported claim']);
});

test('comparison routes DeepSeek for latency while retaining privacy and price limits',async()=>{
  const calls=[];const responses=[draft,{unsupportedClaims:[]}];
  const client={chat:{completions:{create:async(body,options)=>{calls.push({body,options});return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(responses.shift())}}]};}}}};
  const answer=await createComparisonExplainer({client,provider:'openrouter',model:'deepseek/deepseek-v3.2'})(context);
  assert.equal(answer.provider,'openrouter');assert.equal(calls.length,2);
  for(const call of calls){assert.equal(call.body.provider.sort,'latency');assert.equal(call.body.provider.data_collection,'deny');assert.deepEqual(call.body.provider.max_price,{prompt:0.6,completion:1.7});assert.equal(call.options.timeout,25000);assert.ok(call.options.signal);}
  const checked=JSON.parse(calls[1].body.messages[1].content).context;
  assert.ok(checked.consultants.every(p=>p.evidence.length===1));
});
