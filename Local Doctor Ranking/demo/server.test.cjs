const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('./server.cjs');
const {updateCriteria}=require('./criteria.cjs');
const consultant={id:'allowed-consultant',personalizedMatch:{summary:'Recorded knee expertise.',citations:[{id:'e1',text:'Knee replacement.',sourceUrl:'/sources/allowed-consultant',criterion:'Knee replacement'}],caveats:[]},insuranceEvidence:[]};
const answer={summary:'AI match.',reasons:[{title:'Recorded evidence',text:'Knee replacement.',evidenceIds:['e1']}],citations:[],caveats:[],provider:'openai',retryable:false};
async function setup(t,{explainMatch,ready=true,search,...options}={}) {
  const engine={ready,health(){return {ready:this.ready};},search:search || (async()=>({results:[consultant],notices:[],total:1}))};
  const app=createApp(engine,{explainMatch:explainMatch || Object.assign(async()=>answer,{configured:true}),interpretQuery:Object.assign(async({previous,message,removeCriterion})=>({...updateCriteria(previous,message,{removeCriterion}),mode:'deterministic'}),{configured:false}),...options});
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body,headers={})=>{const response=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:response.status,body:await response.json(),headers:response.headers};};
  const chat=(message,sessionId)=>post('/api/chat',{message,...(sessionId?{sessionId}:{})});
  const explain=(search,extra={})=>post('/api/match-explanation',{sessionId:search.sessionId,searchId:search.searchId,consultantId:consultant.id,...extra});
  return {engine,url,post,chat,explain,server};
}
function timings(response) {
  const header=response.headers.get('server-timing'); assert.ok(header,'Server-Timing header is present');
  return Object.fromEntries(header.split(',').map(value=>{
    const match=value.trim().match(/^(interpretation|search|explanation|cache|dedup|ai_draft|ai_check);dur=(\d+\.\d{2})(?:;desc="calls=([12])")?$/);
    assert.ok(match,`Only fixed labels and bounded numeric metrics are emitted: ${value}`);
    return [match[1],{durationMs:Number(match[2]),...(match[3]?{calls:Number(match[3])}:{})}];
  }));
}

test('search timing separates interpretation and retrieval, including clarification without retrieval',async t=>{
  let searches=0;
  const pause=()=>new Promise(resolve=>setTimeout(resolve,8));
  const interpretQuery=Object.assign(async input=>{
    await pause();
    return input.message==='PRIVATE_CLARIFICATION_TEXT' ? {criteria:input.previous,notices:['Please clarify.'],mode:'clarification'} : {...updateCriteria(input.previous,input.message),mode:'deterministic'};
  },{configured:false});
  const api=await setup(t,{interpretQuery,search:async()=>{searches++;await pause();return {results:[consultant],notices:[],total:1};}});
  const first=await api.chat('Knee specialist in London');
  assert.equal(first.status,200);const measured=timings(first);
  assert.deepEqual(Object.keys(measured),['interpretation','search']);
  assert.ok(measured.interpretation.durationMs>=5);assert.ok(measured.search.durationMs>=5);
  const clarification=await api.chat('PRIVATE_CLARIFICATION_TEXT',first.body.sessionId);
  assert.equal(clarification.status,422);assert.deepEqual(Object.keys(timings(clarification)),['interpretation']);assert.equal(searches,1);
  assert.doesNotMatch(clarification.headers.get('server-timing'),/PRIVATE|London|knee|session/i);
});

test('generation timing aggregates valid provider phases while dedup and cache report only their own paths',async t=>{
  let calls=0,release,started;const gate=new Promise(resolve=>{release=resolve;});const beginning=new Promise(resolve=>{started=resolve;});
  const explainMatch=Object.assign(async(_context,{onTiming})=>{
    calls++;started();await gate;
    onTiming({phase:'draft',durationMs:10.25,attempt:1,outcome:'ok'});
    onTiming({phase:'check',durationMs:2.25,attempt:1,outcome:'error'});
    onTiming({phase:'draft',durationMs:20.75,attempt:2,outcome:'ok'});
    onTiming({phase:'check',durationMs:3.75,attempt:2,outcome:'ok'});
    for(const event of [
      {phase:'PRIVATE_REQUEST_TEXT',durationMs:50,attempt:1,outcome:'ok'},
      {phase:'draft',durationMs:999,attempt:1,outcome:'ok'},
      {phase:'draft',durationMs:Infinity,attempt:2,outcome:'ok'},
      {phase:'check',durationMs:-1,attempt:2,outcome:'ok'},
      {phase:'draft',durationMs:1,attempt:3,outcome:'ok'},
      {phase:'check',durationMs:1,attempt:2,outcome:'PRIVATE_PROVIDER_TEXT'},
    ]) onTiming(event);
    return answer;
  },{configured:true});
  const api=await setup(t,{explainMatch});
  const search=(await api.chat('Knee specialist')).body;
  let requests=0,arrived;const bothArrived=new Promise(resolve=>{arrived=resolve;});
  api.server.on('request',req=>{
    if(req.url==='/api/match-explanation' && ++requests===2) req.once('end',()=>setImmediate(arrived));
  });
  const first=api.explain(search);await beginning;const second=api.explain(search);await bothArrived;release();
  const [generated,shared]=await Promise.all([first,second]);
  assert.equal(generated.status,200);assert.equal(shared.status,200);assert.equal(calls,1);
  const measured=timings(generated);
  assert.deepEqual(Object.keys(measured),['explanation','ai_draft','ai_check']);
  assert.deepEqual(measured.ai_draft,{durationMs:31,calls:2});assert.deepEqual(measured.ai_check,{durationMs:6,calls:2});
  assert.deepEqual(Object.keys(timings(shared)),['dedup']);
  assert.deepEqual(shared.body,generated.body);
  const cached=await api.explain(search);assert.deepEqual(Object.keys(timings(cached)),['cache']);assert.equal(calls,1);
  assert.deepEqual(cached.body,generated.body);
});

test('failed generation retains safe duration diagnostics and releases the generation slot for retry',async t=>{
  let calls=0;
  const explainMatch=Object.assign(async(_context,{onTiming})=>{
    calls++;onTiming({phase:'draft',durationMs:7,attempt:1,outcome:calls===1?'error':'ok'});
    if(calls===1) throw new Error('PRIVATE_PROVIDER_ERROR');
    return answer;
  },{configured:true});
  const api=await setup(t,{explainMatch,limits:{concurrent:1}});
  const search=(await api.chat('Knee specialist')).body;
  const failed=await api.explain(search);assert.equal(failed.status,503);
  const measured=timings(failed);assert.deepEqual(Object.keys(measured),['explanation','ai_draft']);assert.deepEqual(measured.ai_draft,{durationMs:7,calls:1});
  assert.doesNotMatch(JSON.stringify(failed.body)+failed.headers.get('server-timing'),/PRIVATE/);
  const retried=await api.explain(search);assert.equal(retried.status,200);assert.equal(calls,2);assert.equal(timings(retried).ai_draft.calls,1);
});

test('chat creates snapshots without calling paid explanation and rejects cross-session/record injection',async t=>{
  let calls=0;const api=await setup(t,{explainMatch:Object.assign(async()=>{calls++;return answer;},{configured:true})});
  const a=(await api.chat('Knee specialist in London')).body;const b=(await api.chat('Hip specialist')).body;
  assert.ok(a.searchId);assert.notEqual(a.searchId,b.searchId);assert.equal(calls,0);
  assert.equal((await api.explain(a,{sessionId:b.sessionId})).status,410);
  assert.equal((await api.explain(a,{consultantId:'not-returned'})).status,404);
  assert.equal((await api.explain(a,{criteria:{topic:'invented'}})).status,400);
  assert.equal(calls,0);assert.equal((await api.explain(a)).status,200);assert.equal(calls,1);
});

test('old cards retain original criteria after later refinements and external mutations',async t=>{
  const contexts=[];const api=await setup(t,{explainMatch:Object.assign(async context=>{contexts.push(context);return answer;},{configured:true})});
  const first=(await api.chat('Knee specialist in London accepting Bupa')).body;
  const next=(await api.chat('Closer to SW5',first.sessionId)).body;
  first.criteria.location='injected';
  await api.explain(first);await api.explain(next);
  assert.equal(contexts[0].criteria.location,'London');assert.equal(contexts[1].criteria.location,'SW5');
  assert.equal(contexts[1].criteria.insurance,'Bupa');assert.equal(contexts[1].criteria.topic,'knee');assert.ok(Object.isFrozen(contexts[0]));
});

test('identical reveals deduplicate concurrent requests and cache successful output',async t=>{
  let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const api=await setup(t,{explainMatch:Object.assign(async()=>{calls++;await gate;return answer;},{configured:true})});
  const search=(await api.chat('Knee specialist')).body;
  const first=api.explain(search);const second=api.explain(search);
  while(!calls) await new Promise(resolve=>setTimeout(resolve,1));
  release();const responses=await Promise.all([first,second]);assert.ok(responses.every(r=>r.status===200));
  await api.explain(search);assert.equal(calls,1);
});

test('transient provider fallback can be retried, but attempts are bounded',async t=>{
  let calls=0;const api=await setup(t,{limits:{cardAttempts:2},explainMatch:Object.assign(async()=>{calls++;return {...answer,provider:'evidence',retryable:true};},{configured:true})});
  const search=(await api.chat('Knee specialist')).body;
  assert.equal((await api.explain(search)).body.retryable,true);assert.equal((await api.explain(search)).status,200);
  const limited=await api.explain(search);assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));assert.equal(calls,2);
});

test('saved turns are bounded at ten, and expired sessions cannot generate',async t=>{
  let now=1;const api=await setup(t,{clock:()=>now});
  const first=(await api.chat('Knee specialist')).body;let current=first;
  for(let i=0;i<10;i++) current=(await api.chat('Only accepting Bupa',first.sessionId)).body;
  assert.equal((await api.explain(first)).status,410);assert.equal((await api.explain(current)).status,200);
  now+=7200001;assert.equal((await api.explain(current)).status,410);
});

test('public origin and readiness work behind a configured trusted proxy',async t=>{
  const api=await setup(t,{ready:false,publicOrigin:'https://docmap.example',trustProxy:true});
  let health=await fetch(api.url+'/api/health');assert.equal(health.status,503);
  api.engine.ready=true;health=await fetch(api.url+'/api/health');assert.equal(health.status,200);
  const wrong=await api.post('/api/chat',{message:'Knee specialist'},{Origin:'https://other.example','X-Forwarded-Proto':'https'});assert.equal(wrong.status,403);
  const right=await api.post('/api/chat',{message:'Knee specialist'},{Origin:'https://docmap.example','X-Forwarded-Proto':'https'});assert.equal(right.status,200);
});

test('an explicit preview-origin allowlist retains the primary origin and rejects unlisted sites',async t=>{
  const api=await setup(t,{publicOrigin:'https://search.docmap.co.uk',publicOrigins:' https://demo-preview.up.railway.app , https://another-preview.example ',trustProxy:true});
  for(const origin of ['https://search.docmap.co.uk','https://demo-preview.up.railway.app','https://another-preview.example']) {
    assert.equal((await api.post('/api/chat',{message:'Knee specialist'},{Origin:origin})).status,200,origin);
  }
  for(const origin of ['https://unlisted.up.railway.app','https://search.docmap.co.uk.attacker.example']) {
    assert.equal((await api.post('/api/chat',{message:'Knee specialist'},{Origin:origin})).status,403,origin);
  }
});

test('global concurrency cap rejects extra generation without invoking provider',async t=>{
  let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const api=await setup(t,{limits:{concurrent:1},explainMatch:Object.assign(async()=>{calls++;await gate;return answer;},{configured:true})});
  const first=(await api.chat('Knee specialist')).body;const second=(await api.chat('Hip specialist')).body;
  const pending=api.explain(first);while(!calls) await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal((await api.explain(second)).status,429);assert.equal(calls,1);release();await pending;
});

test('paid generation budgets apply per session and globally, and cached reveals cost nothing',async t=>{
  let calls=0;const api=await setup(t,{limits:{sessionGenerations:1,globalGenerationsPerHour:2},explainMatch:Object.assign(async()=>{calls++;return answer;},{configured:true})});
  const first=(await api.chat('Knee specialist')).body;
  const followup=(await api.chat('Closer to SW5',first.sessionId)).body;
  assert.equal((await api.explain(first)).status,200);
  assert.equal((await api.explain(first)).status,200);assert.equal(calls,1);
  assert.equal((await api.explain(followup)).status,429);assert.equal(calls,1);
  const other=(await api.chat('Hip specialist')).body;assert.equal((await api.explain(other)).status,200);
  const third=(await api.chat('Shoulder specialist')).body;assert.equal((await api.explain(third)).status,429);assert.equal(calls,2);
});

test('concurrent search cap protects shared retrieval models and releases after completion',async t=>{
  let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const api=await setup(t,{limits:{concurrentSearches:1},search:async()=>{calls++;await gate;return {results:[consultant],notices:[],total:1};}});
  const pending=api.chat('Knee specialist');while(!calls) await new Promise(resolve=>setTimeout(resolve,1));
  const busy=await api.chat('Hip specialist');assert.equal(busy.status,429);assert.equal(busy.headers.get('retry-after'),'5');assert.equal(calls,1);
  release();assert.equal((await pending).status,200);assert.equal((await api.chat('Hip specialist')).status,200);assert.equal(calls,2);
});

test('interpreted clinical criteria drive retrieval, visible context and immutable explanations',async t=>{
  const searched=[],explained=[];
  const interpretQuery=Object.assign(async({previous,message})=>({criteria:message==='Only accepting Bupa' ? {...previous,insurance:'Bupa'} : {topic:'endometriosis',procedures:['Endometriosis excision'],clinicalContext:'Stage 3 endometriosis'},notices:[],mode:'openrouter'}),{configured:true,provider:'openrouter',model:'deepseek/deepseek-v3.2',requiresAI:()=>true});
  const api=await setup(t,{interpretQuery,search:async criteria=>{searched.push(structuredClone(criteria));return {results:[consultant],notices:[],total:1};},explainMatch:Object.assign(async snapshot=>{explained.push(snapshot);return answer;},{configured:true})});
  const first=(await api.chat('I have stage 3 endometriosis and want excision surgery')).body;
  assert.deepEqual(searched[0].procedures,['Endometriosis excision']);
  assert.equal(first.queryInterpretation.mode,'openrouter');
  assert.ok(first.criteriaLabels.some(item=>item.key==='clinicalContext' && item.label==='You shared: Stage 3 endometriosis'));
  await api.chat('Only accepting Bupa',first.sessionId);
  await api.explain(first);
  assert.equal(searched[1].clinicalContext,'Stage 3 endometriosis');
  assert.equal(explained[0].criteria.clinicalContext,'Stage 3 endometriosis');
  assert.equal(explained[0].criteria.insurance,undefined);
  const health=await (await fetch(api.url+'/api/health')).json();
  assert.equal(health.queryInterpreterModel,'deepseek/deepseek-v3.2');
});

test('clarification does not run retrieval or replace the previous search criteria',async t=>{
  const searched=[];
  const interpretQuery=Object.assign(async({previous,message})=>message==='a mystery procedure' ? {criteria:{topic:'incorrect'},notices:['Which procedure do you mean?'],mode:'clarification'} : {...updateCriteria(previous,message),mode:'deterministic'},{configured:false});
  const api=await setup(t,{interpretQuery,search:async criteria=>{searched.push(structuredClone(criteria));return {results:[consultant],notices:[],total:1};}});
  const first=(await api.chat('Knee specialist in London')).body;
  const ambiguous=await api.chat('a mystery procedure',first.sessionId);
  assert.equal(ambiguous.status,422);assert.deepEqual(ambiguous.body.clarifications,['Which procedure do you mean?']);
  assert.equal(searched.length,1);
  const next=await api.chat('Only accepting Bupa',first.sessionId);
  assert.equal(next.status,200);assert.equal(next.body.criteria.topic,'knee');assert.equal(next.body.criteria.location,'London');
  assert.equal((await api.explain(first)).status,200);
});

test('AI interpretation limits preserve deterministic refinements and filter removal',async t=>{
  let paidCalls=0;
  const interpretQuery=Object.assign(async input=>{if(!input.removeCriterion && input.message!=='Only accepting Bupa') paidCalls++;return {...updateCriteria(input.previous,input.message,{removeCriterion:input.removeCriterion}),mode:'deterministic'};},{configured:true,requiresAI:input=>!input.removeCriterion && input.message!=='Only accepting Bupa'});
  const api=await setup(t,{interpretQuery,limits:{sessionInterpretations:1,globalInterpretationsPerHour:2}});
  const first=(await api.chat('Knee specialist in London')).body;
  assert.equal((await api.chat('Hip specialist',first.sessionId)).status,429);
  const refined=await api.chat('Only accepting Bupa',first.sessionId);assert.equal(refined.status,200);assert.equal(refined.body.criteria.topic,'knee');
  const removed=await api.post('/api/chat',{sessionId:first.sessionId,removeCriterion:'insurance'});assert.equal(removed.status,200);assert.equal(removed.body.criteria.insurance,null);
  assert.equal((await api.chat('Hip specialist')).status,200);
  assert.equal((await api.chat('Shoulder specialist')).status,429);
  assert.equal(paidCalls,2);
});

test('an interpreter failure releases the search lock without committing criteria',async t=>{
  const interpretQuery=Object.assign(async input=>{if(input.message==='Fail') throw new Error('Provider failed');return {...updateCriteria(input.previous,input.message),mode:'deterministic'};},{configured:false});
  const api=await setup(t,{interpretQuery,limits:{concurrentSearches:1}});
  const first=(await api.chat('Knee specialist in London')).body;
  assert.equal((await api.chat('Fail',first.sessionId)).status,500);
  const retry=await api.chat('Only accepting Bupa',first.sessionId);
  assert.equal(retry.status,200);assert.equal(retry.body.criteria.topic,'knee');assert.equal(retry.body.criteria.location,'London');
});
