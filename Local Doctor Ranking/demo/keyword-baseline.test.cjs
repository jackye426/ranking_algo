const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('./server.cjs');
const {SearchEngine,mapToRanking}=require('./search.cjs');

const records=[
  {id:'knee',name:'Dr Knee',specialty:'Orthopaedic surgery',clinicalInterests:['Knee replacement'],procedures:[],insurers:[],locations:[{name:'Spire A',city:'London'}],profileUrl:'https://www.spirehealthcare.com/consultants/knee/',evidenceUrl:'/sources/knee'},
  {id:'hip',name:'Dr Hip',specialty:'Orthopaedic surgery',clinicalInterests:['Hip replacement'],procedures:[],insurers:[],locations:[{name:'Spire B',city:'London'}],profileUrl:'https://www.spirehealthcare.com/consultants/hip/',evidenceUrl:'/sources/hip'},
];

test('keyword baseline searches original terms against the exact search catalogue with no model call',()=>{
  const engine={records,documents:records.map(mapToRanking)};
  const answer=SearchEngine.prototype.keywordBaseline.call(engine,{records},'knee');
  assert.equal(answer.label,'Keyword-only baseline');
  assert.equal(answer.method,'BM25');
  assert.equal(answer.total,1);
  assert.equal(answer.results[0].id,'knee');
  assert.equal(answer.results[0].evidenceUrl,'/sources/knee');
  assert.equal(answer.results[0].profileUrl,records[0].profileUrl);
  assert.ok(!('description' in answer.results[0]));
  assert.equal(SearchEngine.prototype.keywordBaseline.call(engine,{records},'unmatchable').total,0);
  assert.throws(()=>SearchEngine.prototype.keywordBaseline.call(engine,{records:[...records]},'knee'),/expired/);
});

async function setup(t,{clock=Date.now,publicOrigins,limits}={}) {
  const calls={search:0,baseline:[]};
  const engine={ready:true,records,sourceLabel:'Verified Spire demo catalogue',health:()=>({ready:true,recordCount:records.length}),
    search:async criteria=>{calls.search++;return {results:[records[0]],total:1,notices:[],searchSnapshot:{records,criteria}};},
    keywordBaseline:(snapshot,query)=>{calls.baseline.push({snapshot,query});return {label:'Keyword-only baseline',method:'BM25',total:1,results:[{id:'knee',name:'Dr Knee'}]};}};
  const interpretQuery=Object.assign(async({previous,message})=>({criteria:{...previous,topic:message==='Only Bupa'?'knee':message},notices:[],mode:'deterministic'}),{configured:false});
  const app=createApp(engine,{clock,publicOrigins,limits,interpretQuery,explainMatch:Object.assign(async()=>({provider:'evidence'}),{configured:false}),
    explainComparison:Object.assign(async()=>({provider:'evidence'}),{configured:false})});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body,origin)=>{const response=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});return {status:response.status,body:await response.json(),headers:response.headers};};
  return {url,post,calls,engine};
}

test('baseline is bound to the first successful search and remains unchanged after refinement',async t=>{
  const {post,calls}=await setup(t);
  const first=(await post('/api/chat',{message:'knee pain near SW5'})).body;
  const request={sessionId:first.sessionId,searchId:first.searchId};
  const initial=await post('/api/keyword-baseline',request);
  assert.equal(initial.status,200);
  assert.equal(initial.body.sourceLabel,'Verified Spire demo catalogue');
  assert.equal(calls.baseline[0].query,'knee pain near SW5');
  assert.equal(calls.baseline[0].snapshot.records,records);
  const refined=(await post('/api/chat',{sessionId:first.sessionId,message:'Only Bupa'})).body;
  assert.equal((await post('/api/keyword-baseline',{sessionId:first.sessionId,searchId:refined.searchId})).status,410);
  assert.deepEqual((await post('/api/keyword-baseline',request)).body,initial.body);
  assert.equal(calls.baseline.length,1);
  assert.equal((await post('/api/keyword-baseline',{...request,query:'injected'})).status,400);
  assert.equal((await post('/api/keyword-baseline',{...request,sessionId:'another'})).status,410);
});

test('CORS allows fixed production and configured preview origins without credentials or wildcard matching',async t=>{
  const {url,post}=await setup(t,{publicOrigins:'https://docmap-preview.lovable.app'});
  for(const origin of ['https://search.docmap.co.uk','https://demo.docmap.co.uk',
    'https://id-preview--cb29d28c-6b46-4988-a3fa-7346e074fb97.lovable.app',
    'https://docmap-london-clinic-production.up.railway.app','https://docmap-preview.lovable.app']) {
    const response=await fetch(url+'/api/chat',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
    assert.equal(response.status,204,origin);
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    assert.equal(response.headers.get('access-control-allow-headers'),'Content-Type');
    assert.equal(response.headers.get('access-control-allow-credentials'),null);
    const chat=await post('/api/chat',{message:'knee'},origin);
    assert.equal(chat.status,200);
    assert.equal(chat.headers.get('access-control-allow-origin'),origin);
    const health=await fetch(url+'/api/health',{headers:{Origin:origin}});
    assert.equal(health.status,200);
    assert.equal(health.headers.get('access-control-allow-origin'),origin);
    const invalid=await post('/api/keyword-baseline',{},origin);
    assert.equal(invalid.status,400);
    assert.equal(invalid.headers.get('access-control-allow-origin'),origin);
  }
  const hostile='https://search.docmap.co.uk.attacker.example';
  const denied=await fetch(url+'/api/chat',{method:'OPTIONS',headers:{Origin:hostile,'Access-Control-Request-Method':'POST'}});
  assert.equal(denied.status,403);
  assert.equal(denied.headers.get('access-control-allow-origin'),null);
  assert.equal((await post('/api/chat',{message:'knee'},hostile)).status,403);
});

test('expired baseline and keyword service failures return actionable errors',async t=>{
  let now=0;const {post,calls}=await setup(t,{clock:()=>now});
  const first=(await post('/api/chat',{message:'knee'})).body;
  const request={sessionId:first.sessionId,searchId:first.searchId};
  now=7200001;
  assert.equal((await post('/api/keyword-baseline',request)).status,410);
  assert.equal(calls.baseline.length,0);
});

test('keyword baseline failure stays retryable without changing the search',async t=>{
  const {post,calls,engine}=await setup(t);
  const first=(await post('/api/chat',{message:'knee'})).body;
  const request={sessionId:first.sessionId,searchId:first.searchId};
  engine.keywordBaseline=()=>{throw new Error('Private backend diagnostic');};
  const failed=await post('/api/keyword-baseline',request);
  assert.equal(failed.status,503);
  assert.doesNotMatch(JSON.stringify(failed.body),/Private/);
  engine.keywordBaseline=()=>({label:'Keyword-only baseline',method:'BM25',total:0,results:[]});
  assert.equal((await post('/api/keyword-baseline',request)).status,200);
  assert.equal(calls.search,1);
});

test('an active keyword baseline shares the search concurrency cap and deduplicates the same snapshot',async t=>{
  const {post,engine}=await setup(t,{limits:{concurrentSearches:1}});
  const first=(await post('/api/chat',{message:'knee'})).body;
  const request={sessionId:first.sessionId,searchId:first.searchId};
  let begin,release;
  const started=new Promise(resolve=>{begin=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  let calls=0;
  engine.keywordBaseline=async()=>{calls++;begin();await gate;return {label:'Keyword-only baseline',method:'BM25',total:0,results:[]};};
  const pending=post('/api/keyword-baseline',request);
  await started;
  const duplicate=post('/api/keyword-baseline',request);
  assert.equal((await post('/api/chat',{message:'hip'})).status,429);
  release();
  const [initial,same]=await Promise.all([pending,duplicate]);
  assert.equal(initial.status,200);
  assert.deepEqual(same.body,initial.body);
  assert.equal(calls,1);
  assert.equal((await post('/api/chat',{message:'hip'})).status,200);
});

test('an OpenAI key alone cannot configure a silent explanation fallback',()=>{
  const priorOpenRouter=process.env.OPENROUTER_API_KEY,priorOpenAI=process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENAI_API_KEY='unused-test-key';
    const explainer=require('./match-explanation.cjs').createMatchExplainer();
    assert.equal(explainer.configured,false);
    assert.equal(explainer.provider,'evidence');
  } finally {
    if(priorOpenRouter===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=priorOpenRouter;
    if(priorOpenAI===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=priorOpenAI;
  }
});
