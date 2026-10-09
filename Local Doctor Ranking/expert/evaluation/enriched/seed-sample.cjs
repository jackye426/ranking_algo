'use strict';
// A small private transfer packet avoids uploading a full corpus solely to
// check an existing vector seed on its intended native inference platform.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {MODEL,MODEL_FILES,hashFile}=require('../../cache-release.cjs'),{compareVectors}=require('./seed-compatibility.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex'),clean=t=>String(t||'').replace(/\s+/g,' ').trim();
async function createPacket({proofFile,seedDir,segmentsDir,out}){
 if(fs.existsSync(out))throw Error('Packet already exists');const proof=JSON.parse(fs.readFileSync(proofFile)),manifestBytes=fs.readFileSync(path.join(segmentsDir,'segments-manifest.json')),manifest=JSON.parse(manifestBytes);
 if(sha(manifestBytes)!==proof.lookupSegmentsSha256)throw Error('Lookup corpus changed');
 for(const f of proof.cacheFiles)if(await hashFile(path.join(seedDir,f.file))!==f.sha256)throw Error('Seed changed');
 const wanted=new Map(proof.comparisons.map(c=>[c.normalizedTextSha256,c])),found=new Map();
 for(const s of manifest.fields.passages.segments){if(path.basename(s.file)!==s.file)throw Error('Unsafe path');const b=fs.readFileSync(path.join(segmentsDir,s.file));if(sha(b)!==s.sha256||b.length!==s.bytes)throw Error('Segment changed');for(const p of JSON.parse(b)){const text=clean(p.text),key=sha(text);if(wanted.has(key)&&!found.has(key))found.set(key,{normalizedTextSha256:key,text,candidateId:p.candidateId,evidenceId:p.id,sourceRecordId:p.sourceRecordId,sourceField:p.field});}}
 if(found.size!==wanted.size)throw Error('Missing sampled source');const fh=await fsp.open(path.join(seedDir,'passage-embeddings.f32'),'r');
 try{for(const [key,s]of found){const i=wanted.get(key).cacheIndex,b=Buffer.alloc(384*4);if((await fh.read(b,0,b.length,i*384*4)).bytesRead!==b.length)throw Error('Vector incomplete');s.expectedVector=Array.from({length:384},(_,n)=>b.readFloatLE(n*4));s.cacheIndex=i;}}finally{await fh.close();}
 const samples=[...found.values()].sort((a,b)=>a.normalizedTextSha256.localeCompare(b.normalizedTextSha256));
 const packet={schemaVersion:1,purpose:'Private offline vector compatibility sample; not source-claim approval',createdAt:new Date().toISOString(),originProofSha256:await hashFile(proofFile),cacheFiles:proof.cacheFiles,lookupCorpusSha256:proof.lookupCorpusSha256,lookupSegmentsSha256:proof.lookupSegmentsSha256,model:MODEL,modelFiles:proof.modelFiles,dtype:'q8',dimensions:384,pooling:'mean',normalize:true,truncation:true,limits:proof.limits,samples};
 await fsp.writeFile(out,JSON.stringify(packet)+'\n',{flag:'wx'});return {out,sha256:await hashFile(out),samples:samples.length,bytes:(await fsp.stat(out)).size,possibleContactText:samples.filter(s=>/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:tel|phone|mobile|fax)\s*[:+]\s*\d/i.test(s.text)).length};
}
async function checkPacket({packetFile,expectedPacketSha256,modelsDir,out}){
 if(fs.existsSync(out))throw Error('Receipt already exists');if(await hashFile(packetFile)!==expectedPacketSha256)throw Error('Packet checksum mismatch');const p=JSON.parse(fs.readFileSync(packetFile));
 if(p.schemaVersion!==1||p.model!==MODEL||p.dtype!=='q8'||p.dimensions!==384||!Array.isArray(p.samples)||p.samples.length<16||p.limits.minimumCosine!==0.999||p.limits.maximumAbsoluteDifference!==0.01)throw Error('Invalid sample contract');
 for(const s of p.samples)if(sha(s.text)!==s.normalizedTextSha256||clean(s.text)!==s.text||s.expectedVector.length!==384||s.expectedVector.some(x=>!Number.isFinite(x)))throw Error('Invalid sampled text/vector');
 const modelRoot=path.join(modelsDir,...MODEL.split('/'));if(p.modelFiles.length!==MODEL_FILES.length)throw Error('Incomplete model pin');for(const f of p.modelFiles){if(!MODEL_FILES.includes(f.file)||await hashFile(path.join(modelRoot,f.file))!==f.sha256)throw Error('Model artifact mismatch');}
 globalThis.fetch=async()=>{throw Error('Network disabled for sample proof');};const t=require(require.resolve('@huggingface/transformers',{paths:[path.resolve(__dirname,'../../..')]}));t.env.allowRemoteModels=false;t.env.allowLocalModels=true;t.env.localModelPath=modelsDir;t.env.cacheDir=modelsDir;
 const model=await t.pipeline('feature-extraction',MODEL,{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});let rows;
 try{const vectors=(await model(p.samples.map(s=>s.text),{pooling:'mean',normalize:true,truncation:true})).tolist();rows=p.samples.map((s,i)=>{const metrics=compareVectors(s.expectedVector,vectors[i]);return{normalizedTextSha256:s.normalizedTextSha256,...metrics,passed:metrics.cosine>=p.limits.minimumCosine&&metrics.maxAbsoluteDifference<=p.limits.maximumAbsoluteDifference};});}finally{await model.dispose();}
 const report={schemaVersion:1,createdAt:new Date().toISOString(),networkDisabled:true,runtime:{platform:process.platform,arch:process.arch,node:process.version,osRelease:os.release()},packetSha256:expectedPacketSha256,originProofSha256:p.originProofSha256,cacheFiles:p.cacheFiles,modelFiles:p.modelFiles,limits:p.limits,comparisons:rows,passed:rows.every(x=>x.passed)};await fsp.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return{out,passed:report.passed,samples:rows.length,minimumCosine:Math.min(...rows.map(x=>x.cosine)),maximumAbsoluteDifference:Math.max(...rows.map(x=>x.maxAbsoluteDifference)),sha256:await hashFile(out)};
}
if(require.main===module){const[command,...a]=process.argv.slice(2),fn=command==='create'?createPacket({proofFile:a[0],seedDir:a[1],segmentsDir:a[2],out:a[3]}):command==='check'?checkPacket({packetFile:a[0],expectedPacketSha256:a[1],modelsDir:a[2],out:a[3]}):Promise.reject(Error('Commands: create/check'));fn.then(r=>{console.log(JSON.stringify(r));if(r.passed===false)process.exitCode=2;}).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={createPacket,checkPacket};
