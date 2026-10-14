'use strict';
// Project a verified fresh cache onto another frozen corpus. Reuse requires
// identical normalized text/model; the source cache is never modified.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {segmentRows}=require('./prepare-cache.cjs');
const {semanticEligible}=require('../../search.cjs');
const {MODEL,MODEL_FILES,CACHE_FILES,hashFile}=require('../../cache-release.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex'),clean=x=>String(x||'').replace(/\s+/g,' ').trim();
async function hashes(dir,names){return Promise.all(names.map(async file=>({file,bytes:(await fsp.stat(path.join(dir,file))).size,sha256:await hashFile(path.join(dir,file))})));}
async function derive({segmentsDir,cacheDir,modelsDir,seedDir}){
 if(fs.existsSync(cacheDir))throw Error('Use a fresh output directory');
 const started=performance.now(),expert=path.resolve(__dirname,'../..'),moduleFiles=['search.cjs','data.cjs','cache-release.cjs','evaluation/enriched/prepare-cache.cjs','evaluation/enriched/derive-cache.cjs'],code=await hashes(expert,moduleFiles),modelRoot=path.join(modelsDir,...MODEL.split('/')),modelFiles=await hashes(modelRoot,MODEL_FILES);
 const seedReceiptFile=path.join(seedDir,'preparation-receipt.json'),seedReceipt=JSON.parse(await fsp.readFile(seedReceiptFile,'utf8'));
 if(!seedReceipt.passed||seedReceipt.completed!==seedReceipt.count||seedReceipt.model!==MODEL||seedReceipt.dimensions!==384||seedReceipt.dtype!=='q8'||JSON.stringify(seedReceipt.modelFiles)!==JSON.stringify(modelFiles))throw Error('Seed receipt/model is incompatible');
 if(JSON.stringify(seedReceipt.cacheFiles)!==JSON.stringify(await hashes(seedDir,CACHE_FILES)))throw Error('Seed cache changed after preparation');
 const oldKeyFile=JSON.parse(await fsp.readFile(path.join(seedDir,'passage-embeddings.keys.json'),'utf8')),oldMeta=JSON.parse(await fsp.readFile(path.join(seedDir,'passage-embeddings.meta.json'),'utf8'));
 if(oldKeyFile.keys.length!==seedReceipt.count||new Set(oldKeyFile.keys).size!==seedReceipt.count||oldKeyFile.fingerprint!==seedReceipt.fingerprint||oldMeta.completed!==seedReceipt.count)throw Error('Incomplete seed cache');
 const oldBytes=await fsp.readFile(path.join(seedDir,'passage-embeddings.f32'));if(oldBytes.length!==seedReceipt.count*384*4)throw Error('Invalid seed vector dimensions');
 const oldVectors=new Float32Array(oldBytes.buffer,oldBytes.byteOffset,oldBytes.byteLength/4),oldIndices=new Map(oldKeyFile.keys.map((k,i)=>[k,i]));
 const mb=await fsp.readFile(path.join(segmentsDir,'segments-manifest.json')),m=JSON.parse(mb);if(m.format!=='expert-corpus-array-segments-v1')throw Error('Expected segmented corpus');
 const candidates=new Set();for(const s of m.fields.candidates.segments)for(const c of segmentRows(segmentsDir,s))if(!c.needsIdentityReview&&c.evidenceIds?.length)candidates.add(c.id);
 const set=new Set();let eligiblePassages=0;for(const s of m.fields.passages.segments)for(const p of segmentRows(segmentsDir,s))if(p.id&&candidates.has(p.candidateId)&&clean(p.text)&&semanticEligible(p)){set.add(clean(p.text));eligiblePassages++;}
 const texts=[...set].sort((a,b)=>a.length-b.length||a.localeCompare(b)),keys=texts.map(sha),fingerprint=sha(MODEL+'\n'+JSON.stringify(texts)),vectors=new Float32Array(texts.length*384),missing=[];
 keys.forEach((key,i)=>{if(oldIndices.has(key))vectors.set(oldVectors.subarray(oldIndices.get(key)*384,(oldIndices.get(key)+1)*384),i*384);else missing.push(i);});
 const baseline={schemaVersion:1,createdAt:new Date().toISOString(),networkDisabled:true,source:'Verified fresh cache projection; identical normalized text and model only',seedReceiptSha256:await hashFile(seedReceiptFile),seedCacheFiles:seedReceipt.cacheFiles,corpusVersion:m.metadata.version,corpusSha256:m.sourceCorpusSha256,segmentsSha256:sha(mb),runtime:{platform:process.platform,arch:process.arch,node:process.version,osRelease:os.release()},code,model:MODEL,modelFiles,dtype:'q8',dimensions:384,pooling:'mean',normalize:true,truncation:true,batchSize:48,eligiblePassages,count:texts.length,fingerprint,reused:texts.length-missing.length,generated:missing.length};
 await fsp.mkdir(cacheDir,{recursive:true});await fsp.writeFile(path.join(cacheDir,'preparation-start.json'),JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({event:'cache-projection',reused:baseline.reused,missing:missing.length,total:texts.length}));
 const sampleBatches=[];if(missing.length){
  globalThis.fetch=async()=>{throw Error('Network disabled in derived cache preparation');};const t=require(require.resolve('@huggingface/transformers',{paths:[path.resolve(expert,'..')]}));t.env.allowRemoteModels=false;t.env.allowLocalModels=true;t.env.localModelPath=modelsDir;t.env.cacheDir=modelsDir;
  const model=await t.pipeline('feature-extraction',MODEL,{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}}),sampled=new Set([...missing].sort((a,b)=>keys[a].localeCompare(keys[b])).slice(0,24));
  try{for(let start=0;start<missing.length;start+=48){const indices=missing.slice(start,start+48),batch=indices.map(i=>texts[i]),values=(await model(batch,{pooling:'mean',normalize:true,truncation:true})).tolist();if(values.length!==batch.length||values.some(v=>v.length!==384||v.some(x=>!Number.isFinite(x))))throw Error('Invalid generated vectors');values.forEach((v,j)=>vectors.set(v,indices[j]*384));
    if(indices.some(i=>sampled.has(i)))sampleBatches.push({start,cacheIndices:indices,texts:batch,keys:indices.map(i=>keys[i]),samples:indices.flatMap((i,j)=>sampled.has(i)?[{cacheIndex:start+j,targetCacheIndex:i,normalizedTextSha256:keys[i],expectedVector:Array.from(vectors.subarray(i*384,(i+1)*384))}]:[])});
    if(start%480===0)console.log(JSON.stringify({event:'missing-vectors',completed:Math.min(start+48,missing.length),total:missing.length}));
  }}finally{await model.dispose();}
 }
 if(vectors.some(x=>!Number.isFinite(x)))throw Error('Invalid final cache');
 await fsp.writeFile(path.join(cacheDir,'passage-embeddings.keys.json'),JSON.stringify({fingerprint,keys}),{flag:'wx'});await fsp.writeFile(path.join(cacheDir,'passage-embeddings.f32'),Buffer.from(vectors.buffer),{flag:'wx'});await fsp.writeFile(path.join(cacheDir,'passage-embeddings.meta.json'),JSON.stringify({fingerprint,model:MODEL,corpusVersion:m.metadata.version,count:texts.length,dimensions:384,completed:texts.length}),{flag:'wx'});
 if(JSON.stringify(code)!==JSON.stringify(await hashes(expert,moduleFiles))||JSON.stringify(modelFiles)!==JSON.stringify(await hashes(modelRoot,MODEL_FILES))||JSON.stringify(seedReceipt.cacheFiles)!==JSON.stringify(await hashes(seedDir,CACHE_FILES)))throw Error('Runtime/model/seed changed while deriving');
 const proof={schemaVersion:1,model:MODEL,modelFiles,dtype:'q8',dimensions:384,pooling:'mean',normalize:true,truncation:true,limits:{minimumCosine:.999,maximumAbsoluteDifference:.01},corpusSha256:m.sourceCorpusSha256,fingerprint,batchSize:48,sampling:'Lowest 24 normalized SHA keys among generated missing texts, retaining exact generation batches; reused vectors are pinned to the seed receipt',batches:sampleBatches};await fsp.writeFile(path.join(cacheDir,'private-exact-batch-sample.json'),JSON.stringify(proof)+'\n',{flag:'wx'});
 const receipt={...baseline,completed:texts.length,finishedAt:new Date().toISOString(),elapsedSeconds:(performance.now()-started)/1000,cacheFiles:await hashes(cacheDir,CACHE_FILES),samplePacketSha256:await hashFile(path.join(cacheDir,'private-exact-batch-sample.json')),passed:true};await fsp.writeFile(path.join(cacheDir,'preparation-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return{cacheDir,reused:baseline.reused,generated:missing.length,count:texts.length,receiptSha256:await hashFile(path.join(cacheDir,'preparation-receipt.json'))};
}
if(require.main===module){const[segmentsDir,cacheDir,modelsDir,seedDir]=process.argv.slice(2);derive({segmentsDir,cacheDir,modelsDir,seedDir}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={derive};
