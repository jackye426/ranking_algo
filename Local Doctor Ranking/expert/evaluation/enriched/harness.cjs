'use strict';

// Prospective evaluation only. No ranking implementations or source claims are
// modified here. Source excerpts, run files and judgement files belong outside Git.
const fs=require('node:fs'),path=require('node:path');
const {createHash,createHmac,randomBytes}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const contract=require('./contract.json');
const hash=value=>createHash('sha256').update(value).digest('hex');
const mean=items=>items.length?items.reduce((sum,x)=>sum+x,0)/items.length:null;
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const expertRoot=path.resolve(__dirname,'../..');
function writeNew(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
function verifyFrozenPack(file){
  const bytes=fs.readFileSync(file),pack=JSON.parse(bytes),manifest=require('./freeze-manifest.json');
  const kind=pack.split==='development'?'development':pack.split==='heldout'?'heldout':null;
  if(!kind||hash(bytes)!==manifest[kind].sha256)throw Error('Pack does not match frozen manifest');
  if(hash(fs.readFileSync(path.join(__dirname,'contract.json')))!==manifest.contractSha256)throw Error('Contract changed after freeze');
  if(manifest.contractId!==contract.contractId)throw Error('Contract identifier does not match freeze manifest');
  if(pack.scenarios.length!==manifest[kind].cases)throw Error('Unexpected scenario count');
  for(const [file,digest] of Object.entries(manifest.unchangedLegacyPacks))if(hash(fs.readFileSync(path.join(__dirname,'..',file)))!==digest)throw Error('Original legacy scenario pack changed: '+file);
  return {pack,sha256:hash(bytes)};
}
async function fileHash(file){const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
async function loadCorpus(file){
  const stat=fs.statSync(file);
  if(stat.isDirectory()){
    const manifestFile=path.join(file,'segments-manifest.json'),bytes=fs.readFileSync(manifestFile),manifest=JSON.parse(bytes);
    if(manifest.format!=='expert-corpus-array-segments-v1')throw Error('Unknown segmented corpus format');
    const corpus={...manifest.metadata};
    for(const field of ['candidates','passages','identityLedger']){
      const description=manifest.fields[field];if(!description)throw Error('Missing corpus field: '+field);
      const rows=[];
      for(const segment of description.segments){
        if(path.basename(segment.file)!==segment.file)throw Error('Unsafe corpus segment path');
        const b=fs.readFileSync(path.join(file,segment.file));
        if(b.length!==segment.bytes||hash(b)!==segment.sha256)throw Error('Corpus segment checksum mismatch');
        const values=JSON.parse(b);if(!Array.isArray(values)||values.length!==segment.count)throw Error('Corpus segment count mismatch');
        for(const value of values)rows.push(value);
      }
      if(rows.length!==description.count)throw Error('Corpus count mismatch');corpus[field]=rows;
    }
    return {corpus,checksum:manifest.sourceCorpusSha256,segmentsChecksum:hash(bytes)};
  }
  const bytes=fs.readFileSync(file);return {corpus:JSON.parse(bytes),checksum:hash(bytes)};
}
async function loadSelectedCorpus(file,ids){
  if(!fs.statSync(file).isDirectory()){
    const loaded=await loadCorpus(file);return {...loaded,corpus:{...loaded.corpus,candidates:loaded.corpus.candidates.filter(c=>ids.has(c.id)),passages:loaded.corpus.passages.filter(p=>ids.has(p.candidateId)),identityLedger:[]}};
  }
  const bytes=fs.readFileSync(path.join(file,'segments-manifest.json')),m=JSON.parse(bytes);
  if(m.format!=='expert-corpus-array-segments-v1')throw Error('Unknown segmented corpus format');
  const corpus={...m.metadata,candidates:[],passages:[],identityLedger:[]};
  // Validate every input segment, but retain only the exact review pool. This
  // avoids keeping two complete multi-provider corpora resident for blinding.
  for(const field of ['candidates','passages','identityLedger']){
    let count=0;const description=m.fields[field];if(!description)throw Error('Missing corpus field');
    for(const s of description.segments){if(path.basename(s.file)!==s.file)throw Error('Unsafe corpus segment path');const b=fs.readFileSync(path.join(file,s.file));if(b.length!==s.bytes||hash(b)!==s.sha256)throw Error('Corpus segment checksum mismatch');const rows=JSON.parse(b);if(!Array.isArray(rows)||rows.length!==s.count)throw Error('Corpus segment count mismatch');count+=rows.length;
      if(field!=='identityLedger')for(const row of rows)if(ids.has(field==='candidates'?row.id:row.candidateId))corpus[field].push(row);
    }
    if(count!==description.count)throw Error('Corpus count mismatch');
  }
  return {corpus,checksum:m.sourceCorpusSha256,segmentsChecksum:hash(bytes)};
}
async function moduleHashes(){
  const files=['brief.cjs','brief-context.cjs','search.cjs','data.cjs','profile.cjs','geo.cjs','practice-cache.cjs','clarifications.cjs','classification-registry.cjs','device-context.cjs','device-context-set.cjs','mdr-taxonomy.cjs','emdn-taxonomy.cjs','cache-release.cjs','../demo/models.cjs','evaluation/enriched/harness.cjs','evaluation/enriched/seed-compatibility.cjs'];
  return Object.fromEntries(await Promise.all(files.map(async file=>[file,await fileHash(path.join(expertRoot,file))])));
}
function offlineInterpretation(){
  const {createBriefInterpreter,removeRequirement}=require('../../brief.cjs');
  const {createDeviceInterpreter}=require('../../device-context.cjs');
  const {createExpertGeoService,splitLocationInstruction}=require('../../geo.cjs');
  const interpret=createDeviceInterpreter({interpret:createBriefInterpreter({client:null})});
  const geo=createExpertGeoService({cacheFile:null,fetchImpl:async()=>{throw Error('Network disabled in evaluation geography');}});
  return async function turn(message,previous){
    const split=splitLocationInstruction(message),parsed=await interpret({message:split.clinicalMessage,previous});
    if(parsed.interpretationIncomplete||parsed.deviceError)return parsed;
    const legacy=parsed.brief?.geography||previous?.geography;
    const request=split.location!==undefined?split.location:previous?.locationFilter!==undefined?(previous.locationFilter?{query:previous.locationFilter.query,radiusMiles:previous.locationFilter.radiusMiles}:null):legacy?{query:legacy}:null;
    const resolved=await geo.resolveLocation(request);
    if(resolved.status!=='resolved')return {...parsed,needsClarification:true,interpretationIncomplete:true,unresolvedInstructions:[resolved.message],question:resolved.message,locationResolution:resolved.status};
    parsed.brief.locationFilter=resolved.location;
    for(const r of [...parsed.brief.requirements])if(r.kind==='geography')removeRequirement(parsed.brief,r.id);
    parsed.brief.geography=null;
    if(parsed.documentedOnlyUpdate!==undefined)parsed.brief.documentedOnly=parsed.documentedOnlyUpdate;
    return parsed;
  };
}
function validatePreparedQueries(q,{packSha256,modelArtifacts,code}){
  const required=['search.cjs','brief.cjs','brief-context.cjs','geo.cjs','device-context.cjs','device-context-set.cjs','classification-registry.cjs','mdr-taxonomy.cjs','emdn-taxonomy.cjs'];
  if(q.passed!==true||q.runtime?.platform!=='linux'||q.networkDisabled!==true||q.packSha256!==packSha256||q.model!=='Xenova/all-MiniLM-L6-v2'||q.dtype!=='q8'||q.dimensions!==384||JSON.stringify(q.modelFiles)!==JSON.stringify(modelArtifacts)||!Array.isArray(q.entries)||hash(JSON.stringify(q.entries))!==q.entriesSha256||q.entries.some(row=>!Array.isArray(row)||typeof row[0]!=='string'||!Array.isArray(row[1])||row[1].length!==384||row[1].some(x=>!Number.isFinite(x))))throw Error('Invalid deployment-runtime query vectors');
  for(const file of required)if(!q.code?.[file]||code[file]!==q.code[file])throw Error('Query planning changed after Linux generation: '+file);
  const map=new Map(q.entries);if(map.size!==q.entries.length)throw Error('Duplicate prepared queries');return map;
}
function applyPreparedPractices(corpus,practiceFile,releaseId){
  if(!practiceFile){if(releaseId)throw Error('Release-bound evaluation requires a prepared practice snapshot');return null;}
  if(typeof releaseId!=='string'||!releaseId)throw Error('Prepared practices require the expected release identifier');
  const bytes=fs.readFileSync(practiceFile),snapshot=JSON.parse(bytes),coverage=require('../../practice-cache.cjs').applyPracticeSnapshot(corpus,snapshot,{releaseId});
  return {fileSha256:hash(bytes),releaseId,corpusVersion:corpus.version,practiceFingerprint:snapshot.practiceFingerprint,resolutionSha256:hash(JSON.stringify(snapshot.entries)),coverage};
}
async function collect({packFile,corpusFile,cacheDir,models,out,label,queryFile,practiceFile,releaseId}){
  if(!label||!cacheDir||!models||!out)throw Error('collect requires label, cache, models and out');
  if(fs.existsSync(out))throw Error('Run output already exists; preserve first runs');
  const checkpointDir=out+'.checkpoints';if(fs.existsSync(checkpointDir))throw Error('Preserve prior checkpoints; choose a new run output');
  const memory={sampleIntervalMs:1000,peaks:{},phases:[],notes:['Sampled heap/external peaks may miss synchronous intervals; process peak RSS is also recorded from resourceUsage.','Measurements describe this offline evaluation process, not a hosted service load test.']};
  const measure=phase=>{const usage=process.memoryUsage();for(const [key,value] of Object.entries(usage))memory.peaks[key]=Math.max(memory.peaks[key]||0,value);if(phase)memory.phases.push({phase,at:new Date().toISOString(),...usage});};
  measure('before-corpus');const memoryTimer=setInterval(()=>measure(),1000);memoryTimer.unref();
  const frozen=verifyFrozenPack(packFile),loaded=await loadCorpus(corpusFile),code=await moduleHashes();measure('corpus-loaded');
  const practicePreparation=applyPreparedPractices(loaded.corpus,practiceFile,releaseId);measure('prepared-practices-applied');
  writeNew(path.join(checkpointDir,'run-start.json'),{state:'in-progress-not-acceptance',createdAt:new Date().toISOString(),label,contractId:contract.contractId,packSha256:frozen.sha256,corpusVersion:loaded.corpus.version,corpusSha256:loaded.checksum,code});
  const {MODEL_FILES,CACHE_FILES}=require('../../cache-release.cjs');
  const artifacts=async(root,names)=>Promise.all(names.map(async file=>({file,bytes:fs.statSync(path.join(root,file)).size,sha256:await fileHash(path.join(root,file))})));
  const modelRoot=path.join(models,'Xenova/all-MiniLM-L6-v2'),modelArtifacts=await artifacts(modelRoot,MODEL_FILES),cacheArtifactsBefore=await artifacts(cacheDir,CACHE_FILES),prepared=json(path.join(cacheDir,'passage-embeddings.meta.json'));
  if(prepared.model!=='Xenova/all-MiniLM-L6-v2'||prepared.completed!==prepared.count||prepared.corpusVersion!==loaded.corpus.version||prepared.dimensions!==384)throw Error('Collection requires a complete corpus-matched prepared cache');
  // Local MiniLM only. Neither data nor briefs leave this process.
  globalThis.fetch=async()=>{throw Error('Network disabled in evaluation');};
  let embedder,queryVectorReceipt=null,preparedQueries=null;
  if(queryFile){
    const q=json(queryFile);preparedQueries=validatePreparedQueries(q,{packSha256:frozen.sha256,modelArtifacts,code});queryVectorReceipt={fileSha256:await fileHash(queryFile),runtime:q.runtime,inputSha256:q.inputSha256,runnerSha256:q.runnerSha256,entriesSha256:q.entriesSha256};
  }else{
    const transformers=require(require.resolve('@huggingface/transformers',{paths:[path.dirname(expertRoot)]}));
    transformers.env.allowRemoteModels=false;transformers.env.allowLocalModels=true;transformers.env.localModelPath=models;transformers.env.cacheDir=models;
    embedder=await transformers.pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
  }
  const queryCache=new Map(),embedQuery=async texts=>{const missing=[...new Set(texts.filter(x=>!queryCache.has(x)))];if(missing.length){if(preparedQueries&&missing.some(text=>!preparedQueries.has(text)))throw Error('Runtime requested an unprepared query; refusing local vector substitution');const vectors=preparedQueries?missing.map(text=>preparedQueries.get(text)):(await embedder(missing,{pooling:'mean',normalize:true,truncation:true})).tolist();missing.forEach((text,i)=>queryCache.set(text,vectors[i]));}return texts.map(text=>queryCache.get(text));};
  const {ExpertSearchEngine}=require('../../search.cjs'),{filterCandidates}=require('../../geo.cjs');
  const interpret=offlineInterpretation(),cases=[];
  try{
    const engine=new ExpertSearchEngine({embedQuery,cacheDir,onProgress:message=>console.log(JSON.stringify({event:'prepare',message}))});engine.verifiedCache={fingerprint:prepared.fingerprint,count:prepared.count,dimensions:prepared.dimensions,model:prepared.model};await engine.init(loaded.corpus);measure('engine-initialized');
    for(const scenario of frozen.pack.scenarios){
      let accepted=null,parsed=null;const turns=[];
      for(const message of [scenario.message,...scenario.followups]){
        parsed=await interpret(message,accepted);
        const failed=parsed.needsClarification===true||parsed.interpretationIncomplete===true||!!parsed.deviceError;
        turns.push({message,needsClarification:!!parsed.needsClarification,mode:parsed.mode,brief:parsed.brief,interpretationIncomplete:!!parsed.interpretationIncomplete,unresolvedInstructions:parsed.unresolvedInstructions||[],clarification:parsed.clarification||parsed.question||null,deviceError:parsed.deviceError||null});
        if(!failed)accepted=parsed.brief;
      }
      if(parsed.brief?.locationFilter&&!practicePreparation)throw Error('Geographically restricted evaluation requires the release-bound prepared practice snapshot');
      const byMode={};
      for(const mode of ['bm25','semantic','hybrid']){
        const start=performance.now();
        const response=parsed.needsClarification||parsed.interpretationIncomplete||parsed.deviceError?{results:[],needsClarification:true}:await engine.search(parsed.brief,{retrievalMode:mode,documentedOnly:!!parsed.brief.documentedOnly});
        const geographic=filterCandidates(response.results,parsed.brief.locationFilter||null);
        byMode[mode]={durationMs:Math.round(performance.now()-start),needsClarification:!!response.needsClarification,resultCount:geographic.results.length,results:geographic.results.slice(0,20),locationStats:geographic.stats,diagnostics:response.diagnostics||null};
      }
      cases.push({id:scenario.id,family:scenario.family,turns,byMode});
      measure('case-'+cases.length);
      writeNew(path.join(checkpointDir,'case-'+String(cases.length).padStart(2,'0')+'.json'),{state:'unvalidated-checkpoint-not-acceptance',...cases.at(-1)});
      // Never echo held-out prompts/labels during a collection run.
      console.log(JSON.stringify({event:'case-collected',caseNumber:cases.length,total:frozen.pack.scenarios.length}));
    }
    const after=await moduleHashes();if(JSON.stringify(code)!==JSON.stringify(after))throw Error('Implementation changed during evaluation');
    if(JSON.stringify(modelArtifacts)!==JSON.stringify(await artifacts(modelRoot,MODEL_FILES)))throw Error('Model artifacts changed during evaluation');
    const cacheArtifacts=await artifacts(cacheDir,CACHE_FILES);if(JSON.stringify(cacheArtifactsBefore)!==JSON.stringify(cacheArtifacts))throw Error('Prepared vectors changed during evaluation');
    if(practicePreparation&&await fileHash(practiceFile)!==practicePreparation.fileSha256)throw Error('Prepared practices changed during evaluation');
    measure('collection-complete');memory.processPeakRssBytes=process.resourceUsage().maxRSS*1024;memory.heapLimitBytes=require('node:v8').getHeapStatistics().heap_size_limit;
    const queryVectorsSha256=hash(JSON.stringify([...queryCache.entries()].sort((a,b)=>a[0].localeCompare(b[0]))));
    const report={schemaVersion:1,contractId:contract.contractId,packSha256:frozen.sha256,split:frozen.pack.split,createdAt:new Date().toISOString(),label,corpusVersion:loaded.corpus.version,corpusSha256:loaded.checksum,segmentsSha256:loaded.segmentsChecksum||null,code,modelArtifacts,cacheArtifacts,practicePreparation,queryVectorReceipt,queryVectorsSha256,queryVectorsCount:queryCache.size,memory,health:engine.health(),networkDisabled:true,modelBackedInterpretation:false,cases};
    writeNew(out,report);return {out,cases:cases.length,runSha256:await fileHash(out)};
  }finally{clearInterval(memoryTimer);await embedder?.dispose();}
}

// Preserve exact text and source qualifications. Exclude technical release IDs,
// names and ranks from reviewer packets. URLs may reveal identity; this residual
// limitation is explicitly reported and URLs stay available for source checks.
function sourceView(p){
  return {text:p.text,type:p.type,field:p.field,provider:p.sourceLabel||null,sourceUrl:p.sourceUrl||null,sourceQuote:p.sourceQuote||null,dates:p.dates?{sourceDate:p.dates.sourceDate||null,observedAt:p.dates.observedAt||null}:null,qualifiers:p.qualifiers||[],attribution:p.attribution||null,limitations:p.review?.limitations||[],sources:(p.sources||[]).map(s=>({field:s.field,provider:s.sourceLabel||null,sourceUrl:s.sourceUrl||null,dates:s.dates?{sourceDate:s.dates.sourceDate||null,observedAt:s.dates.observedAt||null}:null,attribution:s.attribution||null})),...(Array.isArray(p.volumes)&&p.volumes.length?{volumes:structuredClone(p.volumes)}:{})};
}
function profileFingerprint(passages){
  // Differences in owned evidence, source origin or snapshot must not disappear
  // merely because the visible quotation happens to be identical. Arbitrary
  // release names are excluded, allowing genuinely identical evidence to reuse
  // a judgement without revealing the release to reviewers.
  const proof=p=>({evidenceId:p.id||null,sourceRecordId:p.sourceRecordId||null,view:sourceView(p),origins:(p.sources||[]).map(s=>({sourceRecordId:s.sourceRecordId||null,field:s.field||null,sourceUrl:s.sourceUrl||null,dates:s.dates||null})),snapshot:p.repairProvenance?{snapshotSha256:p.repairProvenance.snapshotSha256||null,originalSourceField:p.repairProvenance.originalSourceField||null,parserVersion:p.repairProvenance.parserVersion||null,reviewId:p.repairProvenance.reviewId||null}:null});
  return hash(JSON.stringify(passages.map(proof).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))));
}
function hmac(key,text){return createHmac('sha256',key).update(text).digest('hex').slice(0,24);}
function seededOrder(items,key){return [...items].sort((a,b)=>hmac(key,JSON.stringify(a)).localeCompare(hmac(key,JSON.stringify(b))));}
function createPool({pack,runs,corpora,key,anchorLedger={}}){
  if(runs.length<2)throw Error('Pool needs baseline and enriched runs');
  const packDigest=runs[0].packSha256;
  if(runs.some(run=>run.packSha256!==packDigest||run.contractId!==contract.contractId))throw Error('Runs use different packs/contracts');
  if(runs.some(run=>JSON.stringify(run.code)!==JSON.stringify(runs[0].code)))throw Error('Corpus comparison requires the same implementation');
  if(runs.some(run=>run.queryVectorsSha256)&&runs.some(run=>run.queryVectorsSha256!==runs[0].queryVectorsSha256))throw Error('Corpus comparison requires identical query vectors');
  if(runs.some(run=>run.practicePreparation)&&runs.some(run=>!run.practicePreparation||run.practicePreparation.resolutionSha256!==runs[0].practicePreparation?.resolutionSha256))throw Error('Corpus comparison requires identical prepared practice coordinates');
  const indexed=corpora.map(({corpus,checksum})=>{
    const candidates=new Map(corpus.candidates.map(c=>[c.id,c])),passages=new Map();
    for(const p of corpus.passages){if(!passages.has(p.candidateId))passages.set(p.candidateId,[]);passages.get(p.candidateId).push(p);}
    return {checksum,candidates,passages};
  });
  const packets=[],mapping={schemaVersion:1,packSha256:packDigest,profiles:{},runs:runs.map(run=>({label:run.label,corpusVersion:run.corpusVersion,corpusSha256:run.corpusSha256,practicePreparation:run.practicePreparation||null,caseMappings:{}}))};
  for(const scenario of pack.scenarios){
    const profiles=new Map();
    const unionIds=new Set(runs.flatMap(run=>Object.values(run.cases.find(c=>c.id===scenario.id)?.byMode||{}).flatMap(mode=>mode.results.slice(0,contract.poolDepth||20).map(r=>r.id))));
    for(const ref of scenario.sourceReferenceKeys||[]){const anchor=anchorLedger[ref];if(anchor?.reviewStatus==='accepted')unionIds.add(anchor.candidateId);}
    for(const [runIndex,run] of runs.entries()){
      const corpus=indexed.find(c=>c.checksum===run.corpusSha256);if(!corpus)throw Error('Missing matching corpus for run');
      const result=run.cases.find(c=>c.id===scenario.id);if(!result)throw Error('Missing run case '+scenario.id);
      const idMap={};
      for(const id of unionIds){
        const candidate=corpus.candidates.get(id),isReturned=Object.values(result.byMode).some(m=>m.results.some(r=>r.id===id));
        if(!candidate||candidate.needsIdentityReview){if(isReturned)throw Error('Missing or held identity included in search results');continue;}
        const owned=corpus.passages.get(id)||[],fingerprint=profileFingerprint(owned),opaque='profile-'+hmac(key,scenario.id+'|'+id+'|'+fingerprint);
        idMap[id]=opaque;
        if(!profiles.has(opaque)){
          const sorted=owned.map(p=>({p,view:sourceView(p)})).sort((a,b)=>JSON.stringify(a.view).localeCompare(JSON.stringify(b.view)));
          const evidence=sorted.map(({view},i)=>({token:'E'+String(i+1).padStart(3,'0'),...view}));
          profiles.set(opaque,{profileToken:opaque,evidence});
          mapping.profiles[opaque]={caseId:scenario.id,candidateId:id,evidenceFingerprint:fingerprint,sourceRecordIds:candidate.sourceRecordIds||[],evidenceTokens:Object.fromEntries(sorted.map(({p},i)=>['E'+String(i+1).padStart(3,'0'),{evidenceId:p.id,sourceRecordId:p.sourceRecordId,textSha256:hash(p.text)}]))};
        }
      }
      mapping.runs[runIndex].caseMappings[scenario.id]={candidateTokens:idMap,byMode:Object.fromEntries(Object.entries(result.byMode).map(([mode,data])=>[mode,{...data,results:data.results.map(r=>({id:r.id,profileToken:idMap[r.id]||'unpooled-'+hmac(key,scenario.id+'|'+r.id)})),diagnostics:undefined}]))};
    }
    packets.push({caseId:scenario.id,family:scenario.family,message:scenario.message,followups:scenario.followups,expectation:scenario.expectation,observedInterpretation:runs[0].cases.find(c=>c.id===scenario.id).turns,profiles:seededOrder([...profiles.values()],key+'|'+scenario.id)});
  }
  return {packet:{schemaVersion:1,contractId:contract.contractId,packSha256:packDigest,blindingLimitations:['Source URLs and self-identifying text can reveal identity. All exact professional wording is preserved; no source is rewritten to fake complete blinding.','Corpus differences may reveal that two anonymous profiles represent the same person; release and ranking are never provided.'],cases:packets},mapping};
}
async function blind({packFile,runFiles,corpusFiles,outDir,anchors}){
  if(fs.existsSync(outDir))throw Error('Use a fresh private pool output directory');
  const frozen=verifyFrozenPack(packFile),runs=runFiles.map(json);
  if(runs.some(run=>run.packSha256!==frozen.sha256))throw Error('Run/pack mismatch');
  const anchorLedger=anchors?json(anchors).references:{},ids=new Set(runs.flatMap(r=>r.cases.flatMap(c=>Object.values(c.byMode).flatMap(m=>m.results.slice(0,contract.poolDepth||20).map(x=>x.id)))));
  for(const scenario of frozen.pack.scenarios)for(const ref of scenario.sourceReferenceKeys||[]){const a=anchorLedger[ref];if(a?.reviewStatus==='accepted')ids.add(a.candidateId);}
  const corpora=[];for(const file of corpusFiles)corpora.push(await loadSelectedCorpus(file,ids));
  for(const run of runs){const c=corpora.find(c=>c.checksum===run.corpusSha256);if(!c||run.segmentsSha256&&run.segmentsSha256!==c.segmentsChecksum)throw Error('Review corpus does not match collected source artifact');}
  const pool=createPool({pack:frozen.pack,runs,corpora,key:randomBytes(32).toString('hex'),anchorLedger});
  writeNew(path.join(outDir,'private-mapping.json'),pool.mapping);
  writeNew(path.join(outDir,'blind-pool.json'),pool.packet);
  // Review source relevance first; this separate packet is for checking the
  // product's claims afterwards. It deliberately omits rank/method/release.
  const presentations=new Map();
  for(const [i,run] of runs.entries())for(const c of run.cases)for(const method of Object.values(c.byMode))for(const result of method.results.slice(0,contract.poolDepth||20)){
    const token=pool.mapping.runs[i].caseMappings[c.id].candidateTokens[result.id];if(!token)throw Error('Missing presentation ownership');
    const evidence=pool.mapping.profiles[token].evidenceTokens,reverse=new Map(Object.entries(evidence).map(([t,e])=>[e.evidenceId,t])),refs=ids=>(ids||[]).map(id=>reverse.get(id)||'UNOWNED-EVIDENCE');
    const view={profileToken:token,caseId:c.id,requirements:(result.requirementMatrix||[]).map(r=>({label:r.label,kind:r.kind,importance:r.importance,matchIntent:r.matchIntent,status:r.status,note:r.note,evidence:refs(r.evidenceIds)})),reasons:(result.reasons||[]).map(r=>({text:r.text,status:r.status,evidence:refs(r.evidenceIds)})),gaps:(result.gaps||[]).map(g=>({label:g.label,status:g.status,importance:g.importance,note:g.note}))};
    presentations.set(hash(JSON.stringify(view)),view);
  }
  writeNew(path.join(outDir,'blind-presentations.json'),{schemaVersion:1,poolSha256:await fileHash(path.join(outDir,'blind-pool.json')),instruction:'Read only after recording source relevance. Verify that missing direct evidence remains indirect/unknown and that displayed support is no stronger than the owned passages. No release/method/rank is included.',presentations:[...presentations.values()].sort((a,b)=>a.profileToken.localeCompare(b.profileToken))});
  for(const c of pool.packet.cases){
    // Small packets support source-by-source review without losing passages to
    // context truncation. The complete pool remains the scoring authority.
    const parts=Math.max(1,Math.ceil(c.profiles.length/10));
    for(let i=0;i<parts;i++)writeNew(path.join(outDir,'review-batches',`${c.caseId}-${String(i+1).padStart(2,'0')}.json`),{schemaVersion:1,contractId:contract.contractId,caseId:c.caseId,message:c.message,followups:c.followups,expectation:c.expectation,observedInterpretation:c.observedInterpretation,batch:i+1,batches:parts,profiles:c.profiles.slice(i*10,(i+1)*10)});
  }
  const profileCount=pool.packet.cases.reduce((sum,c)=>sum+c.profiles.length,0);
  for(const reviewer of ['reviewer-a','reviewer-b'])writeNew(path.join(outDir,reviewer+'.json'),{schemaVersion:1,reviewer,independent:true,packetSha256:await fileHash(path.join(outDir,'blind-pool.json')),judgements:pool.packet.cases.flatMap(c=>c.profiles.map(p=>({caseId:c.caseId,profileToken:p.profileToken,grade:null,centralEvidence:[],materialGaps:[],reason:'',attributionConcern:false}))),interpretation:frozen.pack.scenarios.map(c=>({caseId:c.id,pass:null,reason:'',criticalFailure:false})),insufficientEvidence:frozen.pack.scenarios.filter(c=>c.expectation.outcome==='discover').map(c=>({caseId:c.id,pass:null,reason:'',unsupportedClaim:false}))});
  return {outDir,cases:pool.packet.cases.length,profiles:profileCount,requiresIndependentReviewers:2};
}

function mergeReviews(packet,a,b,adjudications={}){
  if(!a.reviewer||!b.reviewer||a.reviewer===b.reviewer||a.independent!==true||b.independent!==true)throw Error('Two different independent reviewers required');
  const rows=new Map(),disagreements=[],missing=[];
  const build=review=>{const map=new Map();for(const row of review.judgements||[]){if(map.has(row.profileToken))throw Error('Duplicate judgement');map.set(row.profileToken,row);}return map;};
  const am=build(a),bm=build(b);
  for(const c of packet.cases)for(const p of c.profiles){
    const ra=am.get(p.profileToken),rb=bm.get(p.profileToken),validTokens=new Set(p.evidence.map(e=>e.token));
    for(const r of [ra,rb])if(r&&r.grade!==null){if(r.caseId!==c.caseId||!Number.isInteger(r.grade)||r.grade<0||r.grade>3||!r.reason?.trim()||!Array.isArray(r.centralEvidence)||r.centralEvidence.some(t=>!validTokens.has(t))||r.grade>=2&&!r.centralEvidence.length)throw Error('Invalid or unsupported review row '+p.profileToken);}
    if(!ra||!rb||ra.grade===null||rb.grade===null){missing.push(p.profileToken);continue;}
    if(ra.grade===rb.grade&&!ra.attributionConcern&&!rb.attributionConcern){rows.set(p.profileToken,ra.grade);continue;}
    const decision=adjudications[p.profileToken];
    if(decision&&Number.isInteger(decision.grade)&&decision.grade>=0&&decision.grade<=3&&decision.reason?.trim()&&decision.attributionResolved===true)rows.set(p.profileToken,decision.grade);
    else disagreements.push({profileToken:p.profileToken,a:ra.grade,b:rb.grade,attributionConcern:!!ra.attributionConcern||!!rb.attributionConcern});
  }
  return {grades:rows,disagreements,missing,complete:!disagreements.length&&!missing.length};
}
function rankingMetrics(tokens,grades,poolTokens,knownTokens=[]){
  if(new Set(tokens).size!==tokens.length)throw Error('Duplicate candidate in ranked results');
  const all=[...new Set([...tokens.slice(0,10),...poolTokens])];for(const token of all)if(!grades.has(token))throw Error('Unjudged candidate; cannot score '+token);
  const first5=tokens.slice(0,5),usefulPool=poolTokens.filter(t=>grades.get(t)>=2).length;
  const useful=first5.filter(t=>grades.get(t)>=2).length;
  const gain=g=>2**g-1,dcg=list=>list.slice(0,10).reduce((sum,t,i)=>sum+gain(grades.get(t))/Math.log2(i+2),0);
  const ideal=[...new Set(poolTokens)].sort((x,y)=>grades.get(y)-grades.get(x));
  const idcg=dcg(ideal);
  return {usefulPrecisionAt5:first5.length?useful/first5.length:0,usefulCoverageAt5:usefulPool?useful/Math.min(5,usefulPool):null,ndcgAt10:idcg?dcg(tokens)/idcg:null,knownRecallAt20:knownTokens.length?knownTokens.filter(t=>tokens.slice(0,20).includes(t)).length/knownTokens.length:null,returnedAt5:first5.length,poolUseful:usefulPool,poolSize:new Set(poolTokens).size};
}
function bootstrap(values,iterations=2000){
  if(!values.length)return null;let seed=1337;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const samples=[];
  for(let i=0;i<iterations;i++){let sum=0;for(let j=0;j<values.length;j++)sum+=values[Math.floor(rnd()*values.length)];samples.push(sum/values.length);}samples.sort((a,b)=>a-b);return {low:samples[Math.floor(.025*iterations)],high:samples[Math.floor(.975*iterations)],iterations,unit:'brief',seed:1337};
}
function summarize(items){
  const output={cases:items.length};
  for(const key of ['usefulPrecisionAt5','usefulCoverageAt5','ndcgAt10','knownRecallAt20']){const values=items.map(i=>i.metrics[key]).filter(v=>v!==null);output[key]={mean:mean(values),scoredCases:values.length,interval95:bootstrap(values)};}
  return output;
}
function score({packet,mapping,pack,reviewA,reviewB,adjudications={},anchors={}}){
  const merged=mergeReviews(packet,reviewA,reviewB,adjudications);
  if(!merged.complete)return {passed:false,state:'incomplete-review',missing:merged.missing,disagreements:merged.disagreements,metrics:null};
  const reviews=[reviewA,reviewB],interpretation=[];
  for(const scenario of pack.scenarios){
    const decisions=reviews.map(r=>(r.interpretation||[]).find(d=>d.caseId===scenario.id));
    if(decisions.some(d=>!d||typeof d.pass!=='boolean'||!d.reason?.trim()))return {passed:false,state:'incomplete-interpretation-review',caseId:scenario.id,metrics:null};
    interpretation.push({id:scenario.id,eligible:scenario.simpleInterpretationEligible,pass:decisions.every(d=>d.pass),criticalFailure:decisions.some(d=>d.criticalFailure)});
  }
  const answerable=new Set(packet.cases.filter(c=>c.profiles.some(p=>merged.grades.get(p.profileToken)>=2)).map(c=>c.caseId)),insufficientEvidence=[];
  for(const scenario of pack.scenarios.filter(c=>c.expectation.outcome==='discover'&&!answerable.has(c.id))){
    const decisions=reviews.map(r=>(r.insufficientEvidence||[]).find(d=>d.caseId===scenario.id));
    if(decisions.some(d=>!d||typeof d.pass!=='boolean'||!d.reason?.trim()||typeof d.unsupportedClaim!=='boolean'))return{passed:false,state:'incomplete-insufficient-evidence-review',caseId:scenario.id,metrics:null};
    insufficientEvidence.push({id:scenario.id,family:scenario.family,description:'Insufficient evidence in the reviewed pool; not a claim of full-corpus absence.',pass:decisions.every(d=>d.pass)&&decisions.every(d=>!d.unsupportedClaim),reviews:decisions});
  }
  const runs=mapping.runs.map(run=>{
    const scores=[];
    for(const scenario of pack.scenarios){
      const candidateMapping=run.caseMappings[scenario.id],allProfiles=packet.cases.find(c=>c.caseId===scenario.id).profiles.map(p=>p.profileToken);
      // Do not double-count the same person twice in the ideal pool because two
      // release variants differ. Score each run against its own version when
      // available, retaining union candidates for which this run has no result.
      const ownByCandidate=candidateMapping.candidateTokens;
      const idealByCandidate=new Map();
      for(const token of allProfiles){const id=mapping.profiles[token].candidateId,own=ownByCandidate[id];if(own)idealByCandidate.set(id,own);else if(!idealByCandidate.has(id)||merged.grades.get(token)>merged.grades.get(idealByCandidate.get(id)))idealByCandidate.set(id,token);}
      const ideal=[...idealByCandidate.values()];
      const known=[];
      if(scenario.recallScope==='bounded')for(const key of scenario.sourceReferenceKeys||[]){const a=anchors[key];if(!a||a.reviewStatus!=='accepted')throw Error('Bounded source anchor not independently accepted: '+key);known.push(ownByCandidate[a.candidateId]||'missing-reference:'+a.candidateId);}
      for(const [mode,response] of Object.entries(candidateMapping.byMode)){
        const tokens=response.results.map(r=>r.profileToken);
        scores.push({id:scenario.id,family:scenario.family,mode,metrics:rankingMetrics(tokens,merged.grades,ideal,known),outcome:scenario.expectation.outcome,answerableInReviewedUnion:answerable.has(scenario.id)});
      }
    }
    const byMode={};for(const mode of ['bm25','semantic','hybrid']){const all=scores.filter(s=>s.mode===mode&&s.outcome==='discover'),cases=all.filter(s=>s.answerableInReviewedUnion);byMode[mode]={...summarize(cases),denominator:'Answerable in complete independently judged union (at least one grade >=2); shared by all runs/methods',insufficientEvidenceCases:all.filter(s=>!s.answerableInReviewedUnion).map(s=>s.id),allDiscoveryCases:summarize(all),allDiscoveryByFamily:Object.fromEntries(contract.families.map(family=>[family,summarize(all.filter(s=>s.family===family))])),byFamily:Object.fromEntries(contract.families.map(family=>[family,summarize(cases.filter(s=>s.family===family))]))};}
    return {label:run.label,corpusVersion:run.corpusVersion,byMode,cases:scores};
  });
  const last=runs.at(-1).byMode.hybrid,baseline=runs[0].byMode.hybrid,t=contract.thresholds;
  const eligible=interpretation.filter(x=>x.eligible),interpretationRate=eligible.filter(x=>x.pass).length/eligible.length;
  const gates={completeIndependentReview:true,interpretation:interpretationRate>=t.simpleInterpretation,zeroCriticalFailures:interpretation.every(x=>!x.criticalFailure),insufficientEvidenceHonesty:insufficientEvidence.every(x=>x.pass),usefulPrecision:last.usefulPrecisionAt5.mean>=t.usefulPrecisionAt5,noUnderfilling:last.usefulCoverageAt5.mean>=t.usefulPrecisionAt5,familyPrecision:Object.values(last.byFamily).filter(x=>x.usefulPrecisionAt5.scoredCases).every(x=>x.usefulPrecisionAt5.mean>=t.familyUsefulPrecisionAt5),ndcg:last.ndcgAt10.mean>=t.ndcgAt10,knownRecall:last.knownRecallAt20.scoredCases>0&&last.knownRecallAt20.mean>=t.knownRecallAt20,precisionRegression:last.usefulPrecisionAt5.mean>=baseline.usefulPrecisionAt5.mean-t.maximumBaselineDrop,ndcgRegression:last.ndcgAt10.mean>=baseline.ndcgAt10.mean-t.maximumBaselineDrop};
  return {passed:Object.values(gates).every(Boolean),state:'scored',gates,answerableCases:pack.scenarios.filter(c=>c.expectation.outcome==='discover'&&answerable.has(c.id)).map(c=>c.id),insufficientEvidence,interpretation:{cases:eligible.length,rate:interpretationRate,criticalFailures:interpretation.filter(x=>x.criticalFailure).map(x=>x.id)},runs,limitations:['Relevance grades are source-based review, not clinical approval.','nDCG and useful coverage are relative to the judged union pool, not exhaustive corpus recall.','Intervals are deterministic brief-level bootstrap estimates, not independent-patient or corpus sampling confidence.','Interpretation used the deterministic local path; optional model availability is evaluated separately.']};
}
function args(argv){const out={};for(const arg of argv){const i=arg.indexOf('=');if(!arg.startsWith('--')||i<3)throw Error('Use --name=value arguments');out[arg.slice(2,i)]=arg.slice(i+1);}return out;}
async function main(){
  const [command,...rest]=process.argv.slice(2),a=args(rest);let result;
  if(command==='collect')result=await collect({packFile:a.pack,corpusFile:a.corpus,cacheDir:a.cache,models:a.models,out:a.out,label:a.label,queryFile:a.queries,practiceFile:a.practice,releaseId:a.release});
  else if(command==='blind')result=await blind({packFile:a.pack,runFiles:a.runs.split('|'),corpusFiles:a.corpora.split('|'),outDir:a.out,anchors:a.anchors});
  else if(command==='score'){
    const frozen=verifyFrozenPack(a.pack),packet=json(a.pool),reviewA=json(a.a),reviewB=json(a.b),packetHash=await fileHash(a.pool);
    if(reviewA.packetSha256!==packetHash||reviewB.packetSha256!==packetHash)throw Error('Reviewer packet mismatch');
    result=score({packet,mapping:json(a.mapping),pack:frozen.pack,reviewA,reviewB,adjudications:a.adjudications?json(a.adjudications):{},anchors:a.anchors?json(a.anchors).references:{}});writeNew(a.out,result);
  }else throw Error('Commands: collect, blind, score');
  console.log(JSON.stringify(result));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={verifyFrozenPack,loadCorpus,loadSelectedCorpus,sourceView,profileFingerprint,createPool,mergeReviews,rankingMetrics,bootstrap,summarize,score,collect,blind,offlineInterpretation,validatePreparedQueries,applyPreparedPractices};
