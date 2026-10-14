'use strict';
// Offline receipt: sampled cache keys are matched to exact normalized source
// text, re-embedded with the pinned local model, and compared numerically.
// This checks model compatibility; it is not a relevance or source-claim review.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks'),os=require('node:os');
const {MODEL,MODEL_FILES,CACHE_FILES,hashFile}=require('../../cache-release.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const clean=t=>String(t||'').replace(/\s+/g,' ').trim();
function compareVectors(a,b){
 if(a.length!==384||b.length!==384||[...a,...b].some(x=>!Number.isFinite(x)))throw Error('Expected 384 finite values');
 let dot=0,aa=0,bb=0,maxAbsoluteDifference=0,squared=0;
 for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]**2;bb+=b[i]**2;maxAbsoluteDifference=Math.max(maxAbsoluteDifference,Math.abs(a[i]-b[i]));squared+=(a[i]-b[i])**2;}
 if(!aa||!bb)throw Error('Zero vector');
 return {cosine:dot/Math.sqrt(aa*bb),maxAbsoluteDifference,rootMeanSquaredDifference:Math.sqrt(squared/a.length)};
}
async function artifactFiles(root,names){return Promise.all(names.map(async file=>({file,bytes:(await fsp.stat(path.join(root,file))).size,sha256:await hashFile(path.join(root,file))})));}
async function prove({seedDir,segmentsDir,modelsDir,out,sampleCount=24,batchStyle='combined'}){
 if(fs.existsSync(out))throw Error('Proof already exists; preserve original receipts');
 if(!Number.isSafeInteger(sampleCount)||sampleCount<16||sampleCount>128)throw Error('Use a sample of 16–128');
 const before=await artifactFiles(seedDir,CACHE_FILES),modelDir=path.join(modelsDir,...MODEL.split('/')),modelFiles=await artifactFiles(modelDir,MODEL_FILES);
 const meta=JSON.parse(fs.readFileSync(path.join(seedDir,CACHE_FILES[2]))),keyFile=JSON.parse(fs.readFileSync(path.join(seedDir,CACHE_FILES[1])));
 if(meta.model!==MODEL||meta.dimensions!==384||meta.count!==meta.completed||keyFile.fingerprint!==meta.fingerprint||keyFile.keys.length!==meta.count||new Set(keyFile.keys).size!==meta.count||before[0].bytes!==meta.count*384*4)throw Error('Incomplete or incompatible seed');
 const indices=new Map(keyFile.keys.map((k,i)=>[k,i])),manifestBytes=fs.readFileSync(path.join(segmentsDir,'segments-manifest.json')),manifest=JSON.parse(manifestBytes);
 if(manifest.format!=='expert-corpus-array-segments-v1')throw Error('Expected checksum-verified segments');
 // Lowest SHA keys among texts still present in the lookup corpus give a
 // deterministic content-blind sample, independent of ranking and relevance.
 const chosen=new Map();let eligibleMatches=0;
 for(const segment of manifest.fields.passages.segments){
  if(path.basename(segment.file)!==segment.file)throw Error('Unsafe segment path');
  const b=fs.readFileSync(path.join(segmentsDir,segment.file));if(b.length!==segment.bytes||sha(b)!==segment.sha256)throw Error('Segment hash mismatch');
  for(const p of JSON.parse(b)){const text=clean(p.text),key=sha(text);if(!indices.has(key)||chosen.has(key))continue;eligibleMatches++;chosen.set(key,{key,text,index:indices.get(key)});if(chosen.size>sampleCount)chosen.delete([...chosen.keys()].sort().at(-1));}
 }
 if(chosen.size!==sampleCount)throw Error('Insufficient matching normalized texts');
 globalThis.fetch=async()=>{throw Error('Network disabled for cache compatibility proof');};
 const t=require(require.resolve('@huggingface/transformers',{paths:[path.resolve(__dirname,'../../..')]}));t.env.allowRemoteModels=false;t.env.allowLocalModels=true;t.env.localModelPath=modelsDir;t.env.cacheDir=modelsDir;
 const model=await t.pipeline('feature-extraction',MODEL,{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}}),selected=[...chosen.values()].sort((a,b)=>a.key.localeCompare(b.key));
 if(!['combined','individual','diagnostic'].includes(batchStyle))throw Error('Unknown batch style');
 const limits={minimumCosine:0.999,maximumAbsoluteDifference:0.01};let comparisons,diagnostics=null;
 try{const options={pooling:'mean',normalize:true,truncation:true},generated=[];
  if(batchStyle==='individual'){for(const item of selected)generated.push((await model([item.text],options)).tolist()[0]);}
  else generated.push(...(await model(selected.map(s=>s.text),options)).tolist());
  if(batchStyle==='diagnostic'){
   const timings=[],repeats=[];for(let repeat=0;repeat<10;repeat++){const started=performance.now(),again=(await model(selected.map(s=>s.text),options)).tolist();timings.push(performance.now()-started);repeats.push(...again.map((v,i)=>compareVectors(generated[i],v)));}
   diagnostics={warmRepeatedIdenticalBatches:10,textsPerBatch:selected.length,batchMilliseconds:timings,meanMillisecondsPerText:timings.reduce((a,b)=>a+b,0)/(10*selected.length),minimumRepeatCosine:Math.min(...repeats.map(r=>r.cosine)),maximumRepeatAbsoluteDifference:Math.max(...repeats.map(r=>r.maxAbsoluteDifference)),limitation:'Timing samples these content-blind texts only; long evidence and corpus assembly can add materially more time.'};
  }
  const fh=await fsp.open(path.join(seedDir,CACHE_FILES[0]),'r');
  try{comparisons=await Promise.all(selected.map(async(s,i)=>{const bytes=Buffer.alloc(384*4),read=await fh.read(bytes,0,bytes.length,s.index*384*4);if(read.bytesRead!==bytes.length)throw Error('Missing vector');const vector=Array.from({length:384},(_,n)=>bytes.readFloatLE(n*4)),metrics=compareVectors(vector,generated[i]);return {normalizedTextSha256:s.key,cacheIndex:s.index,textCharacters:s.text.length,...metrics,passed:metrics.cosine>=limits.minimumCosine&&metrics.maxAbsoluteDifference<=limits.maximumAbsoluteDifference};}));}finally{await fh.close();}
 }finally{await model.dispose();}
 const after=await artifactFiles(seedDir,CACHE_FILES),afterModel=await artifactFiles(modelDir,MODEL_FILES);if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(modelFiles)!==JSON.stringify(afterModel))throw Error('Artifact changed during proof');
 const report={schemaVersion:1,createdAt:new Date().toISOString(),purpose:'Sampled local embedding-model compatibility, not dataset acceptance',networkDisabled:true,runtime:{platform:process.platform,arch:process.arch,node:process.version,osRelease:os.release()},model:MODEL,dtype:'q8',dimensions:384,pooling:'mean',normalize:true,truncation:true,batchStyle,seedDir,cacheFiles:before,modelFiles,lookupCorpusSha256:manifest.sourceCorpusSha256,lookupSegmentsSha256:sha(manifestBytes),sampling:'Lowest SHA-256 keys among normalized source texts matching completed cache entries; independent of relevance',eligiblePassageMatches:eligibleMatches,sampleCount,limits,diagnostics,comparisons,passed:comparisons.every(x=>x.passed)};
 await fsp.mkdir(path.dirname(out),{recursive:true});await fsp.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return {out,passed:report.passed,sampleCount,minimumCosine:Math.min(...comparisons.map(c=>c.cosine)),maximumAbsoluteDifference:Math.max(...comparisons.map(c=>c.maxAbsoluteDifference)),sha256:await hashFile(out)};
}
if(require.main===module){const [seedDir,segmentsDir,modelsDir,out,batchStyle='combined']=process.argv.slice(2);prove({seedDir,segmentsDir,modelsDir,out,batchStyle}).then(r=>{console.log(JSON.stringify(r));if(!r.passed)process.exitCode=2;}).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={compareVectors,prove};
