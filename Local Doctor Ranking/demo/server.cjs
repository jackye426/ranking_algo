require('dotenv').config({path:require('node:path').join(__dirname,'../.env.local'),quiet:true});
const express=require('express');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {SearchEngine}=require('./search.cjs');
const {criteriaLabels}=require('./criteria.cjs');
const {explanationSnapshot,createMatchExplainer}=require('./match-explanation.cjs');
const {createQueryInterpreter}=require('./query-interpreter.cjs');
// Only static metric names and finite durations/counts enter this diagnostic
// header. Search text, identifiers and provider responses are never included.
function serverTiming(res,name,durationMs,calls) {
  res.append('Server-Timing',`${name};dur=${Math.max(0,durationMs).toFixed(2)}${calls===undefined?'':`;desc="calls=${calls}"`}`);
}
async function timed(res,name,operation) {
  const started=performance.now();
  try {return await operation();}
  finally {serverTiming(res,name,performance.now()-started);}
}
function createApp(engine,{explainMatch=createMatchExplainer(),interpretQuery=createQueryInterpreter(),publicOrigin=process.env.PUBLIC_ORIGIN,publicOrigins=process.env.PUBLIC_ORIGINS,trustProxy=process.env.TRUST_PROXY==='1',limits={},clock=Date.now}={}) {
  const app=express(); const sessions=new Map(); const requests=new Map();
  const budget={concurrent:2,concurrentSearches:2,sessionGenerations:24,ipGenerationsPerHour:60,globalGenerationsPerHour:200,cardAttempts:3,sessionInterpretations:40,ipInterpretationsPerHour:120,globalInterpretationsPerHour:400,...limits};
  let activeGenerations=0; let activeSearches=0; let globalWindow={start:clock(),count:0,interpretations:0};
  const configuredOrigins=new Set([publicOrigin,...String(publicOrigins || '').split(',')].filter(value=>value?.trim()).map(value=>{
    const url=new URL(value.trim());
    if(!['http:','https:'].includes(url.protocol)) throw new Error('Public origins must use HTTP or HTTPS.');
    return url.origin;
  }));
  if(trustProxy) app.set('trust proxy',1);
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'"});
    next();
  });
  app.use(express.json({limit:'8kb'}));
  app.get('/api/health',(req,res)=>res.status(engine.ready?200:503).json({...engine.health(),explanationProvider:explainMatch.provider || (explainMatch.configured?'openai':'evidence'),explanationModel:explainMatch.model || null,queryInterpreterProvider:interpretQuery.provider || (interpretQuery.configured?'openrouter':'deterministic'),queryInterpreterModel:interpretQuery.model || null}));
  app.get('/sources/:id',(req,res)=>{
    const record=engine.records?.find(r=>r.id===req.params.id);
    if(!record) return res.status(404).type('text').send('Profile source not found.');
    res.set('Cache-Control','no-store').type('html').send(require('./evidence-page.cjs').evidencePage(record,engine.source));
  });
  const prepare=(req,res,kind)=>{
    const origin=req.get('origin');
    if(origin && !(configuredOrigins.size ? configuredOrigins.has(origin) : origin===`${req.protocol}://${req.get('host')}`)) {res.status(403).json({error:'This request must be sent from the demo page.'});return null;}
    const now=clock();
    for(const [k,v] of sessions) if(now-v.updated>7200000) sessions.delete(k);
    for(const [k,v] of requests) if(now-v.hourStart>3600000) requests.delete(k);
    if(now-globalWindow.start>3600000) globalWindow={start:now,count:0,interpretations:0};
    if(!requests.has(req.ip) && requests.size>=1000) {res.set('Retry-After','60').status(429).json({error:'The demo is busy. Try again shortly.'});return null;}
    const rate=requests.get(req.ip)||{start:now,hourStart:now,chat:0,explanation:0,generations:0,interpretations:0};
    if(now-rate.start>60000) {rate.start=now;rate.chat=0;rate.explanation=0;}
    rate[kind]++; requests.set(req.ip,rate);
    if(rate[kind]>(kind==='chat'?60:24)) {res.set('Retry-After','60').status(429).json({error:'Please wait a moment before sending another request.'});return null;}
    if(!engine.ready) {res.status(503).json({error:engine.failure ? 'Search could not start. Check the server configuration and model downloads.' : 'Search is preparing. Please try again in a moment.'});return null;}
    res.set('Cache-Control','no-store');
    return {now,rate};
  };
  app.post('/api/chat',async(req,res)=>{
    const state=prepare(req,res,'chat'); if(!state) return;
    const {now}=state;
    const {message,sessionId,removeCriterion}=req.body || {};
    if((typeof message !== 'string' || !message.trim() || message.length>1500) && typeof removeCriterion !== 'string') return res.status(400).json({error:'Enter a request of 1–1,500 characters.'});
    if(sessionId && (typeof sessionId !== 'string' || !sessions.has(sessionId))) return res.status(410).json({error:'This conversation expired. Start a new search.'});
    if(!sessionId && sessions.size>=200) return res.status(503).json({error:'The demo is busy. Please try again shortly.'});
    const id=sessionId || randomUUID(); const session=sessions.get(id)||{criteria:{},updated:now,snapshots:new Map(),generations:0,interpretations:0};
    if(session.busy) return res.status(409).json({error:'Please wait for your current search to finish.'});
    if(activeSearches>=budget.concurrentSearches) return res.set('Retry-After','5').status(429).json({error:'Other searches are running. Please retry in a few seconds.'});
    const interpretationInput={previous:structuredClone(session.criteria),message:message||'',removeCriterion};
    const paidInterpretation=interpretQuery.configured===true && (interpretQuery.requiresAI ? interpretQuery.requiresAI(interpretationInput) : !removeCriterion);
    if(paidInterpretation && (session.interpretations>=budget.sessionInterpretations || state.rate.interpretations>=budget.ipInterpretationsPerHour || globalWindow.interpretations>=budget.globalInterpretationsPerHour)) return res.set('Retry-After','3600').status(429).json({error:'The demo’s AI search limit has been reached. Your current results and filters are unchanged; you can still remove a filter.'});
    if(paidInterpretation) {session.interpretations++;state.rate.interpretations++;globalWindow.interpretations++;}
    activeSearches++; session.busy=true; sessions.set(id,session);
    try {
      const parsed=await timed(res,'interpretation',()=>interpretQuery(interpretationInput));
      if(parsed.mode==='clarification') return res.status(422).json({error:parsed.notices.join(' ') || 'Please name the condition or procedure you want to search for. Your existing preferences are unchanged.',clarifications:parsed.notices});
      const response=await timed(res,'search',()=>engine.search(parsed.criteria));
      session.criteria=parsed.criteria; session.updated=now;
      const searchId=randomUUID();
      const snapshot={results:new Map(response.results.slice(0,6).map(result=>[result.id,explanationSnapshot(parsed.criteria,result)])),cache:new Map(),pending:new Map(),attempts:new Map()};
      session.snapshots.set(searchId,snapshot);
      while(session.snapshots.size>10) session.snapshots.delete(session.snapshots.keys().next().value);
      const {diagnostics,...publicResponse}=response;
      const labels=criteriaLabels(parsed.criteria);
      if(parsed.criteria.clinicalContext) labels.push({key:'clinicalContext',label:`You shared: ${parsed.criteria.clinicalContext}`});
      res.set('Cache-Control','no-store').json({sessionId:id,searchId,criteria:parsed.criteria,criteriaLabels:labels,...publicResponse,queryInterpretation:{mode:parsed.mode||'deterministic'},
        clarifications:parsed.notices,notices:[...parsed.notices,...response.notices],sourceLabel:engine.sourceLabel});
    } catch(e) { console.error('[DocMap] Search failed:',e.name); res.status(500).json({error:'Search couldn’t complete. Please try again; your previous criteria are preserved.'}); }
    finally {session.busy=false;activeSearches--;}
  });
  app.post('/api/match-explanation',async(req,res)=>{
    const state=prepare(req,res,'explanation'); if(!state) return;
    const body=req.body;
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).sort().join(',')!=='consultantId,searchId,sessionId' || [body.sessionId,body.searchId,body.consultantId].some(value=>typeof value!=='string' || !value || value.length>200)) return res.status(400).json({error:'Provide the conversation, search and consultant identifiers from a search result.'});
    const session=sessions.get(body.sessionId);
    const snapshot=session?.snapshots.get(body.searchId);
    if(!snapshot) return res.status(410).json({error:'This search has expired. Run the search again to explain its matches.'});
    const context=snapshot.results.get(body.consultantId);
    if(!context) return res.status(404).json({error:'This consultant was not returned by that search.'});
    session.updated=state.now;
    const cacheStarted=performance.now();
    if(snapshot.cache.has(body.consultantId)) {
      const answer=snapshot.cache.get(body.consultantId);
      serverTiming(res,'cache',performance.now()-cacheStarted);
      return res.json(answer);
    }
    if(snapshot.pending.has(body.consultantId)) return res.json(await timed(res,'dedup',()=>snapshot.pending.get(body.consultantId)));
    const attempts=snapshot.attempts.get(body.consultantId)||0;
    const paid=explainMatch.configured===true;
    if(activeGenerations>=budget.concurrent) return res.set('Retry-After','5').status(429).json({error:'Other explanations are being prepared. Please retry in a few seconds.'});
    if(paid && (attempts>=budget.cardAttempts || session.generations>=budget.sessionGenerations || state.rate.generations>=budget.ipGenerationsPerHour || globalWindow.count>=budget.globalGenerationsPerHour)) return res.set('Retry-After','3600').status(429).json({error:'The demo’s AI explanation limit has been reached. The sourced profile evidence remains available.'});
    if(paid) {session.generations++;state.rate.generations++;globalWindow.count++;}
    snapshot.attempts.set(body.consultantId,attempts+1); activeGenerations++;
    const phases={draft:{durationMs:0,calls:0},check:{durationMs:0,calls:0}}; const measured=new Set();
    const onTiming=event=>{
      if(!event || !['draft','check'].includes(event.phase) || ![1,2].includes(event.attempt) || !['ok','error'].includes(event.outcome)
        || !Number.isFinite(event.durationMs) || event.durationMs<0 || event.durationMs>600000) return;
      const key=`${event.phase}:${event.attempt}`; if(measured.has(key)) return; measured.add(key);
      phases[event.phase].durationMs+=event.durationMs; phases[event.phase].calls++;
    };
    const addPhaseTimings=()=>{for(const phase of ['draft','check']) if(phases[phase].calls) serverTiming(res,`ai_${phase}`,phases[phase].durationMs,phases[phase].calls);};
    const pending=Promise.resolve().then(()=>explainMatch(context,{onTiming})).then(answer=>{
      if(!answer.retryable) snapshot.cache.set(body.consultantId,answer);
      return answer;
    }).finally(()=>{snapshot.pending.delete(body.consultantId);activeGenerations--;});
    snapshot.pending.set(body.consultantId,pending);
    try {const answer=await timed(res,'explanation',()=>pending);addPhaseTimings();res.json(answer);}
    catch {addPhaseTimings();res.status(503).json({error:'The explanation could not be prepared. Please retry.'});}
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  app.use(express.static(path.join(__dirname,'../public'),{index:'index.html',dotfiles:'deny'}));
  app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.status===413?'Your request is too long.':'The request could not be read.'}));
  return app;
}
if(require.main===module) {
  const engine=new SearchEngine(); const app=createApp(engine); const port=process.env.PORT || process.env.SERVER_PORT || 3000;
  app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`[DocMap] Preview: http://localhost:${port}`));
  engine.init().then(()=>console.log(`[DocMap] Ready: ${engine.records.length} verified records; BM25 + sentence embeddings.`)).catch(e=>{engine.failure=true;engine.status='Setup required';console.error('[DocMap] Startup:',e.message);});
}
module.exports={createApp};
