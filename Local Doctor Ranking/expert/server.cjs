'use strict';
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env.local'),quiet:true});
require('dotenv').config({path:path.join(__dirname,'.env.local'),quiet:true,override:true});
const express=require('express');
const {randomUUID}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createBriefInterpreter,sufficient,discoveryQuestion,removeRequirement}=require('./brief.cjs');
const {createExpertAI}=require('./ai.cjs');
const {restoreBrief}=require('./resume.cjs');
const {createExpertGeoService,filterCandidates,splitLocationInstruction}=require('./geo.cjs');
const {buildProfile,profilePreview}=require('./profile.cjs');
const {createDeviceInterpreter}=require('./device-context.cjs');
const {withClarification}=require('./clarifications.cjs');
function createApp(engine,{interpret=createBriefInterpreter(process.env.EXPERT_OFFLINE==='1'?{client:null}:{}),generate=createExpertAI(process.env.EXPERT_OFFLINE==='1'?{client:null}:{}),geo=createExpertGeoService(),taxonomy,clock=Date.now,limits={},publicOrigin=process.env.PUBLIC_ORIGIN}={}){
  const app=express(),sessions=new Map(),rates=new Map();
  const interpretDevice=createDeviceInterpreter({interpret,taxonomy});
  const limit={sessions:60,retainedCandidateRows:30000,concurrentSearches:2,concurrentAI:2,searchesPerHour:120,aiPerHour:40,globalAI:300,globalInterpretations:500,...limits};
  let activeSearches=0,activeAI=0,global={at:clock(),ai:0,interpretations:0};
  const origins=new Set([publicOrigin,...String(process.env.PUBLIC_ORIGINS||'').split(',')].filter(Boolean).map(v=>new URL(v).origin));
  if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});next();});
  app.use(express.json({limit:'48kb'}));
  const health=(req,res)=>res.status(engine.ready?200:503).json({ready:!!engine.ready,status:engine.status||'Preparing expert evidence',experience:'expert-discovery',corpusVersion:engine.corpus?.version||engine.version||null,counts:engine.publicCounts||{},model:process.env.OPENROUTER_EXPLANATION_MODEL||'deepseek/deepseek-v3.2',aiConfigured:process.env.EXPERT_OFFLINE!=='1'&&!!process.env.OPENROUTER_API_KEY});
  app.get('/api/health',health);app.get('/api/expert/health',health);
  function prepare(req,res,kind){
    const origin=req.get('origin');if(origin&&!(origins.size?origins.has(origin):origin===`${req.protocol}://${req.get('host')}`)){res.status(403).json({error:'Use the Expert Discovery page to make this request.'});return null;}
    const now=clock();for(const [id,s]of sessions)if(now-s.updated>7200000)sessions.delete(id);for(const [id,r]of rates)if(now-r.at>3600000)rates.delete(id);
    if(now-global.at>3600000)global={at:now,ai:0,interpretations:0};
    if(!rates.has(req.ip)&&rates.size>=1000){res.status(429).json({error:'The preview is busy. Please retry shortly.'});return null;}
    const rate=rates.get(req.ip)||{at:now,search:0,ai:0};rate[kind]++;rates.set(req.ip,rate);
    if(rate[kind]>(kind==='ai'?limit.aiPerHour:limit.searchesPerHour)){res.set('Retry-After','60').status(429).json({error:'This preview request limit has been reached. Your saved work remains available.'});return null;}
    if(!engine.ready){res.status(503).json({error:engine.failure?'Expert search could not prepare its evidence.':'The expert index is preparing. Please retry shortly.'});return null;}
    res.set('Cache-Control','no-store');return{now,rate};
  }
  const identifier=value=>typeof value==='string'&&value.length>0&&value.length<180;
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const fields=(body,allowed)=>object(body)&&Object.keys(body).every(k=>allowed.includes(k));
  const current=(body,res)=>{const s=sessions.get(body.sessionId),snap=s?.snapshots.get(body.searchId);if(!snap){res.status(410).json({error:'This live search expired. Saved projects remain available; run the brief again to refresh results.'});return null;}s.updated=clock();return{s,snap};};
  const profiles=new Map();let profileCorpus=null;
  function fullProfile(candidate,version){
    if(!engine.corpus||version!==engine.corpus.version)return null;
    if(profileCorpus!==version){profiles.clear();profileCorpus=version;}
    if(!profiles.has(candidate.id)){
      const owner=engine.corpus.candidates.find(c=>c.id===candidate.id&&!c.needsIdentityReview);
      if(!owner)return null;
      profiles.set(candidate.id,buildProfile(owner,engine.byCandidate?.get(candidate.id)||engine.corpus.passages,{corpusVersion:version}));
      if(profiles.size>100)profiles.delete(profiles.keys().next().value);
    }
    return profiles.get(candidate.id);
  }
  const decorate=(candidate,snap)=>{const profile=fullProfile(candidate,snap.corpusVersion);return {...candidate,backgroundPreview:profile?profilePreview(profile,{query:snap.brief.summary}):[]};};
  const page=(snap,offset)=>{const results=snap.results.slice(offset,offset+6).map(c=>decorate(c,snap));let nextCursor=null;if(offset+results.length<snap.results.length){nextCursor=randomUUID();snap.cursors.set(nextCursor,offset+results.length);}return{results,total:snap.results.length,nextCursor};};
  app.post('/api/expert/location',async(req,res)=>{
    if(!prepare(req,res,'search'))return;
    if(!fields(req.body,['query','radiusMiles'])||typeof req.body.query!=='string'||req.body.query.length>120)return res.status(400).json({error:'Enter a UK city, town or postcode.'});
    res.json(await geo.resolveLocation(req.body));
  });
  app.post('/api/expert/profile',(req,res)=>{
    if(!prepare(req,res,'search'))return;const body=req.body||{};
    if(!fields(body,['sessionId','searchId','candidateId','corpusVersion']))return res.status(400).json({error:'Invalid profile request.'});
    const state=current(body,res);if(!state)return;
    if(body.corpusVersion!==state.snap.corpusVersion)return res.status(409).json({error:'The requested profile and search use different evidence versions.'});
    const candidate=state.snap.results.find(c=>c.id===body.candidateId);if(!candidate)return res.status(404).json({error:'This candidate is not in this search.'});
    const profile=fullProfile(candidate,state.snap.corpusVersion);if(!profile)return res.status(410).json({error:'This profile version is no longer available. Run the search again; saved evidence is unchanged.'});
    res.json(profile);
  });
  app.post('/api/expert/search',async(req,res)=>{
    const prep=prepare(req,res,'search');if(!prep)return;
    const body=req.body||{};
    const operations=['message','removeRequirementId','patch'].filter(key=>body[key]!==undefined);
    if(!fields(body,['sessionId','resumeBrief','message','removeRequirementId','patch','documentedOnly','excludeContactedIds','locationFilter','deviceCode']) || operations.length>1 || (body.resumeBrief!==undefined&&body.sessionId!==undefined) || (body.sessionId!==undefined&&!identifier(body.sessionId)) || (body.message!==undefined&&(typeof body.message!=='string'||!body.message.trim()||body.message.length>4000)) || (body.removeRequirementId!==undefined&&!identifier(body.removeRequirementId)) || (body.patch!==undefined&&(!fields(body.patch,['requirementId','importance'])||!identifier(body.patch.requirementId)||!['focus','essential','preferred'].includes(body.patch.importance))) || (body.documentedOnly!==undefined&&typeof body.documentedOnly!=='boolean') || (body.locationFilter!==undefined&&body.locationFilter!==null&&(!fields(body.locationFilter,['query','radiusMiles'])||typeof body.locationFilter.query!=='string'||body.locationFilter.query.length>120||body.locationFilter.radiusMiles!==undefined&&![10,25,50].includes(body.locationFilter.radiusMiles))) || (body.deviceCode!==undefined&&body.deviceCode!==null&&(typeof body.deviceCode!=='string'||!body.deviceCode.trim()||body.deviceCode.length>32)) || (!operations.length&&body.resumeBrief===undefined&&body.locationFilter===undefined&&body.deviceCode===undefined)){return res.status(400).json({error:'Describe the expertise you need in up to 4,000 characters, update one search criterion or location, or resume a saved search.'});}
    let resumed=null;try{if(body.resumeBrief!==undefined)resumed=restoreBrief(body.resumeBrief);}catch(error){return res.status(400).json({error:error.message});}
    if(body.sessionId&&!sessions.has(body.sessionId))return res.status(410).json({error:'This search expired. Start a new live search; saved projects are unchanged.'});
    if(!body.sessionId&&sessions.size>=limit.sessions)return res.status(503).json({error:'The preview is busy. Retry shortly.'});
    if(body.excludeContactedIds&&(!Array.isArray(body.excludeContactedIds)||body.excludeContactedIds.length>1000||body.excludeContactedIds.some(id=>!identifier(id))))return res.status(400).json({error:'Invalid project contact filter.'});
    const id=body.sessionId||randomUUID(),s=sessions.get(id)||{brief:null,snapshots:new Map(),updated:prep.now,busy:false,ai:0,interpretations:0};
    if(s.busy||activeSearches>=limit.concurrentSearches)return res.set('Retry-After','3').status(429).json({error:'A search is already running. Please retry shortly.'});
    if(s.interpretations>=50)return res.status(429).json({error:'This conversation has reached its interpretation limit. Start a new live search; saved work remains available.'});
    if(body.message&&global.interpretations>=limit.globalInterpretations)return res.status(429).json({error:'The preview has reached its hourly interpretation budget. Your saved work and sourced evidence remain available.'});
    activeSearches++;s.busy=true;sessions.set(id,s);const start=performance.now();
    try{
      if(operations.length)s.interpretations++;
      if(body.message)global.interpretations++;
      const base=resumed?.brief||s.brief;
      const locationInstruction=splitLocationInstruction(body.message||''),inferred=locationInstruction.location;
      const locationOnly=inferred!==undefined&&!locationInstruction.clinicalMessage;
      const parsed=await interpretDevice({previous:base,message:locationInstruction.clinicalMessage,removeRequirementId:body.removeRequirementId,patch:body.patch,...(body.deviceCode!==undefined?{deviceCode:body.deviceCode}:{})});
      if(parsed.deviceError){if(!body.sessionId)sessions.delete(id);return res.status(422).json(parsed.deviceError);}
      if(parsed.interpretationIncomplete)return res.status(422).json({error:parsed.unresolvedInstructions?.join(' ')||parsed.question||'Your instruction could not be applied. Please retry or edit it.',code:'interpretation-incomplete',retryable:true});
      const legacy=parsed.brief?.geography||base?.geography;
      const removingPlace=body.removeRequirementId&&base?.requirements?.some(r=>r.id===body.removeRequirementId&&r.kind==='geography');
      const requested=body.locationFilter!==undefined?body.locationFilter:removingPlace?null:inferred!==undefined?inferred:base?.locationFilter!==undefined?(base.locationFilter?{query:base.locationFilter.query,radiusMiles:base.locationFilter.radiusMiles}:null):legacy?{query:legacy}:null;
      const resolved=await geo.resolveLocation(requested);
      if(resolved.status!=='resolved')return res.status(422).json({error:resolved.message,code:'location-'+resolved.status,location:resolved,retryable:true});
      parsed.brief.locationFilter=resolved.location;
      for(const criterion of [...parsed.brief.requirements])if(criterion.kind==='geography')removeRequirement(parsed.brief,criterion.id);parsed.brief.geography=null;
      if((!operations.length&&body.locationFilter!==undefined)||locationOnly)parsed.brief.version++;
      if(body.locationFilter!==undefined&&inferred!==undefined&&JSON.stringify(inferred)!==JSON.stringify(body.locationFilter))parsed.notices.push('Using the location selected in the location field.');
      if(resumed?.needsClarification&&!operations.length&&body.deviceCode===undefined)parsed.needsClarification=true;
      if(parsed.needsClarification){withClarification(parsed,'context');s.brief=parsed.brief||s.brief;s.updated=clock();return res.json({sessionId:id,brief:s.brief,needsClarification:true,question:parsed.question,clarification:parsed.clarification,notices:parsed.notices||[],results:[],total:0});}
      const found=await engine.search(parsed.brief,{documentedOnly:body.documentedOnly===true});
      const excluded=new Set(body.excludeContactedIds||[]);
      const geographic=filterCandidates(found.results,parsed.brief.locationFilter);
      const snap={brief:structuredClone(parsed.brief),corpusVersion:found.corpusVersion,locationStats:geographic.stats,results:geographic.results.filter(c=>!excluded.has(c.id)),cursors:new Map(),pages:new Map(),cache:new Map(),pending:new Map(),attempts:new Map()};
      const searchId=randomUUID();s.snapshots.set(searchId,snap);while(s.snapshots.size>10)s.snapshots.delete(s.snapshots.keys().next().value);
      const retained=[...sessions.values()].flatMap(session=>[...session.snapshots].map(([id,snapshot])=>({session,id,snapshot})));let retainedRows=retained.reduce((n,item)=>n+item.snapshot.results.length,0);for(const item of retained){if(retainedRows<=limit.retainedCandidateRows)break;if(item.id!==searchId){item.session.snapshots.delete(item.id);retainedRows-=item.snapshot.results.length;}}
      s.brief=parsed.brief;s.updated=clock();
      res.set('Server-Timing',`search;dur=${(performance.now()-start).toFixed(1)}`).json({sessionId:id,searchId,brief:snap.brief,corpusVersion:snap.corpusVersion,...page(snap,0),locationStats:snap.locationStats,notices:parsed.notices||[],needsClarification:false,scope:engine.publicCounts||{},interpretationMode:parsed.mode});
    }catch(e){console.error('[expert] search failed',e.name);res.status(500).json({error:'Search could not complete. Your previous results and saved project are unchanged.'});}
    finally{s.busy=false;activeSearches--;}
  });
  app.post('/api/expert/page',(req,res)=>{
    if(!prepare(req,res,'search'))return;const body=req.body||{};if(!fields(body,['sessionId','searchId','cursor']))return res.status(400).json({error:'Invalid page request.'});const state=current(body,res);if(!state)return;
    if(!identifier(body.cursor)||!state.snap.cursors.has(body.cursor))return res.status(400).json({error:'Invalid continuation cursor.'});
    if(!state.snap.pages.has(body.cursor))state.snap.pages.set(body.cursor,page(state.snap,state.snap.cursors.get(body.cursor)));
    res.json(state.snap.pages.get(body.cursor));
  });
  app.post('/api/expert/shortlist-view',(req,res)=>{
    if(!prepare(req,res,'search'))return;const body=req.body||{};if(!fields(body,['sessionId','searchId','candidateIds']))return res.status(400).json({error:'Invalid shortlist request.'});const state=current(body,res);if(!state)return;
    if(!Array.isArray(body.candidateIds)||body.candidateIds.length>100||body.candidateIds.some(id=>!identifier(id)))return res.status(400).json({error:'Invalid candidate selection.'});
    const ids=new Set(body.candidateIds);res.json({brief:state.snap.brief,results:state.snap.results.filter(c=>ids.has(c.id)),corpusVersion:state.snap.corpusVersion});
  });
  app.post('/api/expert/explain',async(req,res)=>{
    if(!prepare(req,res,'ai'))return;const body=req.body||{};if(!fields(body,['sessionId','searchId','candidateIds','kind'])||!Array.isArray(body.candidateIds))return res.status(400).json({error:'Invalid explanation request.'});const state=current(body,res);if(!state)return;
    const {s,snap}=state,kind=body.kind||'explanation';
    const ids=[...new Set(body.candidateIds||[])];
    if(!['explanation','comparison','outreach'].includes(kind)||ids.some(id=>!identifier(id))||!ids.length||ids.length>(kind==='comparison'?3:1)||(kind==='comparison'&&ids.length<2))return res.status(400).json({error:'Choose one candidate, or two to three for comparison.'});
    const candidates=ids.map(id=>snap.results.find(c=>c.id===id));if(candidates.some(c=>!c))return res.status(404).json({error:'A selected candidate was not returned by this search.'});
    const key=kind+':'+[...ids].sort().join('|');if(snap.cache.has(key))return res.json(snap.cache.get(key));
    if(snap.pending.has(key)){try{return res.json(await snap.pending.get(key));}catch{return res.status(502).json({error:'Personalisation could not complete. The original evidence is unchanged.',retryable:true});}}
    if(activeAI>=limit.concurrentAI||s.ai>=30||global.ai>=limit.globalAI||(snap.attempts.get(key)||0)>=3)return res.set('Retry-After','30').status(429).json({error:'The explanation limit has been reached. Sourced evidence remains available.'});
    activeAI++;s.ai++;global.ai++;snap.attempts.set(key,(snap.attempts.get(key)||0)+1);
    const operation=Promise.resolve().then(()=>generate({kind,brief:snap.brief,candidates})).then(answer=>{if(!answer.retryable)snap.cache.set(key,answer);return answer;}).finally(()=>{snap.pending.delete(key);activeAI--;});snap.pending.set(key,operation);
    try{res.json(await operation);}catch(e){console.error('[expert] explanation failed',e.name);res.status(502).json({error:'Personalisation could not complete. The original evidence is unchanged.',retryable:true});}
  });
  app.get('/api/expert/sources/:id',(req,res)=>{
    const corpus=engine.corpus,candidate=corpus?.candidates.find(c=>c.id===req.params.id&&!c.needsIdentityReview);if(!candidate)return res.status(404).type('text').send('Evidence record not found.');
    const facts=corpus.passages.filter(p=>p.candidateId===candidate.id);
    const requested=req.query.evidence;
    if(requested!==undefined&&(typeof requested!=='string'||requested.length>180))return res.status(400).type('text').send('Choose one evidence passage.');
    const selected=requested===undefined?null:facts.find(p=>p.id===requested);
    if(requested!==undefined&&!selected)return res.status(404).type('text').send('This passage is not available for this professional. It may have changed since the review pack was saved.');
    res.set('Cache-Control','no-store').type('html').send(require('./sources.cjs').renderSourcePage(candidate,facts,selected));
  });
  app.use('/expert-assets',express.static(path.join(__dirname,'public'),{dotfiles:'deny',index:false}));
  app.use('/brand',express.static(path.join(__dirname,'../public/brand'),{dotfiles:'deny',index:false}));
  app.use('/fonts',express.static(path.join(__dirname,'../public/fonts'),{dotfiles:'deny',index:false}));
  app.get('/',(req,res)=>res.redirect('/expert-discovery'));
  app.get(['/expert-discovery','/expert-discovery/directory','/expert-discovery/project'],(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
  app.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(error.status===413?413:400).json({error:'The request could not be read.'});});
  return app;
}
async function start(){
  const {loadRows,cacheDir}=require('./reader.cjs'),{buildCorpus}=require('./data.cjs'),{ExpertSearchEngine}=require('./search.cjs');
  let lastProgress=0;const engine=new ExpertSearchEngine({cacheDir:cacheDir(),onProgress:value=>{engine.status=typeof value==='string'?value:JSON.stringify(value);if(Date.now()-lastProgress>15000||engine.status==='Ready'){console.log('[expert]',engine.status);lastProgress=Date.now();}}});
  engine.ready=false;engine.status='Loading professional evidence';
  const geo=createExpertGeoService({cacheFile:path.join(cacheDir(),'geocodes-v1.json')});const app=createApp(engine,{geo});const port=Number(process.env.PORT||3100),host=process.env.HOST||'127.0.0.1';
  const server=app.listen(port,host,()=>console.log(`Expert Discovery listening on ${host}:${port}`));
  try{const raw=await loadRows({onProgress:({rows})=>{engine.status=`Reading professional records: ${rows}`;}});const enrichmentModule=require('./enrichments.cjs');const enrichments=Array.isArray(enrichmentModule)?enrichmentModule:enrichmentModule.enrichments||[];const identityReviews=require('./identity-reviews.cjs');const corpus=buildCorpus(raw.rows,{enrichments,identityReviews});engine.corpus=corpus;engine.publicCounts={sourceRows:raw.rows.length,identityGroups:corpus.candidates.length,identitySupportedCandidates:corpus.candidates.filter(c=>!c.needsIdentityReview).length,heldForIdentityReview:corpus.audit.heldForIdentityReview,indexedCandidates:corpus.audit.searchableCandidates,indexedPassages:corpus.passages.length,sourceCheckedCandidates:new Set(corpus.passages.filter(p=>p.attribution==='verified-source').map(p=>p.candidateId)).size};raw.rows=null;engine.status='Preparing recorded practice locations';engine.publicCounts.geographicCoverage=await geo.prepareLocations(corpus.candidates.filter(c=>!c.needsIdentityReview));await engine.init(corpus);engine.ready=true;engine.status='Ready';console.log('[expert] Ready',JSON.stringify(engine.publicCounts));}
  catch(e){engine.ready=false;engine.failure=true;engine.status='Expert evidence could not be prepared';console.error('[expert] startup failed',e.message);}
  return{app,engine,server};
}
module.exports={createApp,start};if(require.main===module)start();
