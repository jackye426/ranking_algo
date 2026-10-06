'use strict';
// One real cached index; two search implementations; no database or model API.
// Run alone, after stopping the local workbench occupying port 3100.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {createHash}=require('node:crypto'),{performance}=require('node:perf_hooks');
const ROOT=path.resolve(__dirname,'..'),MODEL='Xenova/all-MiniLM-L6-v2';
const hash=value=>createHash('sha256').update(value).digest('hex');
const jsonHash=value=>hash(JSON.stringify(value));
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
function loadBaseline(file=path.join(ROOT,'.cache/search-before-performance.cjs')){
  const source=fs.readFileSync(file,'utf8'),filename=path.join(ROOT,'search-before-performance.virtual.cjs');
  const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(ROOT);loaded._compile(source,filename);
  if(typeof loaded.exports.ExpertSearchEngine?.prototype.search!=='function')throw Error('Baseline search implementation is missing.');
  return {SearchEngine:loaded.exports.ExpertSearchEngine,sha256:hash(source)};
}
function scenarios(){
  const packs=[['development','scenarios.cjs'],['holdout','holdout-final.cjs']],{parseBrief}=require('../brief.cjs');
  const cases=[],fingerprints=[];
  for(const [split,file]of packs){
    const pack=require('./'+file);fingerprints.push({split,file,sha256:hash(fs.readFileSync(path.join(__dirname,file)))});
    for(const scenario of pack.scenarios.filter(s=>s.split===split)){
      let parsed=parseBrief({message:scenario.message});
      for(const message of scenario.followups||[])parsed=parseBrief({message,previous:parsed.brief});
      cases.push({id:scenario.id,split,brief:parsed.brief,turns:1+(scenario.followups||[]).length,documentedOnly:!!scenario.documentedOnly});
    }
  }
  if(cases.length!==42||new Set(cases.map(c=>c.id)).size!==42)throw Error('Expected the frozen 14 development and 28 final cases.');
  return {cases,fingerprints};
}
function responseDigests(response){
  const results=response.results||[];
  return {full:jsonHash(response),ranking:jsonHash(results.map(c=>({id:c.id,rank:c.rank,relevance:c.relevance,clinicalRelevance:c.clinicalRelevance,contextRelevance:c.contextRelevance}))),matrix:jsonHash(results.map(c=>({id:c.id,requirementMatrix:c.requirementMatrix}))),evidence:jsonHash(results.map(c=>({id:c.id,evidence:c.evidence,reasons:c.reasons,gaps:c.gaps,questions:c.questions}))),total:results.length};
}
async function compareCases(engine,BaselineEngine,cases,onCase=()=>{}){
  let embeddingCalls=0,embeddingTexts=0,embeddingMs=0;
  const originalEmbed=engine.embedQuery;
  engine.embedQuery=async function(texts){embeddingCalls++;embeddingTexts+=texts.length;const start=performance.now();try{return await originalEmbed.call(this,texts);}finally{embeddingMs+=performance.now()-start;}};
  const records=[];
  try{
    for(const [index,scenario]of cases.entries()){
      const order=index%2?['optimized','baseline']:['baseline','optimized'],calls={};
      for(const implementation of order){
        const before={calls:embeddingCalls,texts:embeddingTexts,ms:embeddingMs},start=performance.now();
        const response=await (implementation==='baseline'?BaselineEngine.prototype.search:engine.search).call(engine,scenario.brief,{documentedOnly:scenario.documentedOnly,retrievalMode:'hybrid'});
        const elapsed=performance.now()-start;
        calls[implementation]={durationMs:Math.round(elapsed),embeddingCalls:embeddingCalls-before.calls,embeddingTexts:embeddingTexts-before.texts,embeddingMs:Math.round(embeddingMs-before.ms),rssBytes:process.memoryUsage().rss,digests:responseDigests(response)};
      }
      const record={id:scenario.id,split:scenario.split,turns:scenario.turns,briefSha256:jsonHash(scenario.brief),documentedOnly:scenario.documentedOnly,order,...calls,equal:calls.baseline.digests.full===calls.optimized.digests.full,comparableWarmPair:calls.baseline.embeddingCalls===0&&calls.optimized.embeddingCalls===0};
      record.changedComponents=['ranking','matrix','evidence'].filter(key=>calls.baseline.digests[key]!==calls.optimized.digests[key]);
      records.push(record);await onCase(record,records);
    }
  }finally{engine.embedQuery=originalEmbed;}
  return records;
}
function summarize(records){
  const warm=records.filter(r=>r.comparableWarmPair),duration=(list,key)=>list.map(r=>r[key].durationMs);
  const summary={cases:records.length,equivalent:records.filter(r=>r.equal).length,differentCaseIds:records.filter(r=>!r.equal).map(r=>r.id),warmPairs: warm.length,embeddingAffectedPairs:records.length-warm.length};
  for(const implementation of ['baseline','optimized'])summary[implementation]={allObservedP50Ms:percentile(duration(records,implementation),.5),allObservedP95Ms:percentile(duration(records,implementation),.95),warmPairP50Ms:percentile(duration(warm,implementation),.5),warmPairP95Ms:percentile(duration(warm,implementation),.95)};
  summary.warmMedianPerPairRatio=percentile(warm.filter(r=>r.optimized.durationMs>0).map(r=>r.baseline.durationMs/r.optimized.durationMs),.5);
  return summary;
}
async function localEmbedder(){
  const t=await import('@huggingface/transformers');
  t.env.allowRemoteModels=false;t.env.allowLocalModels=true;t.env.localModelPath=path.resolve(ROOT,'../demo/.cache/models');t.env.cacheDir=t.env.localModelPath;
  const extract=await t.pipeline('feature-extraction',MODEL,{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
  return async texts=>(await extract(texts,{pooling:'mean',normalize:true,truncation:true})).tolist();
}
async function main(){
  const round=process.argv.find(a=>a.startsWith('--round='))?.slice(8);
  if(!round||!/^[a-z0-9-]+$/.test(round))throw Error('Pass a unique --round name. Stop the workbench on port 3100 first.');
  const file=path.join(ROOT,'.cache',`search-performance-${round}.json`);
  if(fs.existsSync(file))throw Error('This round already exists; preserve it and select a new round.');
  const pack=scenarios(),report={version:'expert-search-performance-v1',round,startedAt:new Date().toISOString(),pending:true,stage:'initialising',parserSha256:hash(fs.readFileSync(path.join(ROOT,'brief.cjs'))),optimizedSha256:hash(fs.readFileSync(path.join(ROOT,'search.cjs'))),scenarioPacks:pack.fingerprints,execution:{platform:process.platform,architecture:process.arch,node:process.version,model:MODEL,retrievalMode:'hybrid',paidModelCalls:0,databaseRequests:0,httpRequests:0,queryModelInterpretation:false},cases:[],limitations:['One process and one index; this is a bounded observed benchmark, not a hosted SLA.','Exact full JSON response equality includes order, relevance, matrix, evidence, reasons and diagnostics.','Execution order alternates. Pairs that generate any query embeddings are excluded from the warm-pair comparison. No search is executed a third time.','Source-analysis cache warmth can accumulate across cases. OS scheduling and garbage collection are not controlled.','Frozen brief expectations are unchanged; this compares implementations, not expert qualification.']};
  fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  const originalFetch=globalThis.fetch,models=require('../../demo/models.cjs'),originalEmbed=models.embed;
  let server,reader,originalReader;
  try{
    // Block outbound transport even if a cache is missing or expired. Server
    // startup otherwise honours cache age and could attempt a database read.
    globalThis.fetch=async()=>{throw Error('Network is disabled for this benchmark.');};
    const {start}=require('../server.cjs');
    process.env.EXPERT_OFFLINE='1';process.env.EXPERT_REFRESH_DATA='0';process.env.HOST='127.0.0.1';process.env.PORT='3100';
    reader=require('../reader.cjs');originalReader=reader.loadRows;
    reader.loadRows=async()=>{const raw=JSON.parse(fs.readFileSync(path.join(reader.cacheDir(),'raw.json'),'utf8'));if(!Array.isArray(raw.rows)||raw.readerVersion!==1)throw Error('A valid local professional-record cache is required.');return raw;};
    models.embed=await localEmbedder();
    // Initialise the same local model once before timing individual searches.
    await models.embed(['Clinical assessment evidence']);
    const baseline=loadBaseline();report.baselineSha256=baseline.sha256;save();
    const runtime=await start();server=runtime.server;const engine=runtime.engine;
    if(!engine.ready)throw Error('The cached evidence index could not initialise.');
    report.stage='comparing';report.corpusVersion=engine.corpus.version;report.corpusCounts={candidates:engine.candidates.size,passages:engine.passages.length,embeddings:engine.embeddingCount};save();
    await compareCases(engine,baseline.SearchEngine,pack.cases,(record,records)=>{report.cases=records;report.summary=summarize(records);save();console.log('[search comparison]',record.id,record.equal?'identical':'DIFFERENT',`baseline=${record.baseline.durationMs}ms optimized=${record.optimized.durationMs}ms`,record.comparableWarmPair?'warm pair':'embedding-affected pair');});
    report.pending=false;report.stage='complete';report.completedAt=new Date().toISOString();report.passed=report.cases.length===42&&report.cases.every(r=>r.equal);save();
    console.log(JSON.stringify({report:path.basename(file),passed:report.passed,summary:report.summary},null,2));if(!report.passed)process.exitCode=1;
  }catch(error){report.pending=false;report.stage='failed';report.errorType=error.name;report.completedAt=new Date().toISOString();save();throw error;}
  finally{models.embed=originalEmbed;if(reader)reader.loadRows=originalReader;globalThis.fetch=originalFetch;if(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}}
}
if(require.main===module)main().catch(error=>{console.error('Search benchmark failed ('+error.name+'). Inspect the named local report and preserve it.');process.exitCode=1;});
module.exports={loadBaseline,scenarios,responseDigests,compareCases,summarize};
