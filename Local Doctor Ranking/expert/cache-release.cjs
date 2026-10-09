'use strict';
// Immutable model/vector receipts for a prepared release. This module never
// downloads, repairs or replaces an artifact when verification fails.
const fs=require('node:fs/promises'),{createReadStream}=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const MODEL='Xenova/all-MiniLM-L6-v2';
const CACHE_FILES=['passage-embeddings.f32','passage-embeddings.keys.json','passage-embeddings.meta.json'];
const PRACTICE_FILE='practice-locations.json';
const MODEL_FILES=['config.json','tokenizer.json','tokenizer_config.json','onnx/model_quantized.onnx'];
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=message=>{throw Error('Invalid expert release cache: '+message);};
function validateDescriptor(m,{releaseId}={}){
 if(!m||![1,2].includes(m.schemaVersion)||m.releaseId!==releaseId||m.model!==MODEL||m.dtype!=='q8'||m.dimensions!==384||!digest(m.fingerprint)||typeof m.corpusVersion!=='string'||!m.corpusVersion.startsWith('expert-corpus-')||!Number.isSafeInteger(m.count)||m.count<1||m.count>2000000)fail('manifest identity or embedding configuration');
 for(const [key,required]of [['cacheFiles',CACHE_FILES],['modelFiles',MODEL_FILES]]){
  if(!Array.isArray(m[key])||m[key].length!==required.length)fail('incomplete artifact list');const seen=new Set();
  for(const f of m[key]){if(!f||!required.includes(f.file)||seen.has(f.file)||!digest(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>4*1024*1024*1024)fail('artifact descriptor');seen.add(f.file);}
 }
 if(m.schemaVersion===2){const f=m.practiceFile;if(!f||Object.keys(f).some(k=>!['file','bytes','sha256'].includes(k))||f.file!==PRACTICE_FILE||!digest(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>200*1024*1024)fail('prepared practice descriptor');}
 return m;
}
async function hashFile(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
async function verifyFiles(root,files){
 if(!path.isAbsolute(root))fail('absolute artifact directory required');
 for(const f of files){const target=path.resolve(root,f.file);if(!target.startsWith(path.resolve(root)+path.sep))fail('artifact escaped root');let current=path.parse(target).root;for(const part of target.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())fail('symlink artifact');}const stat=await fs.stat(target);if(!stat.isFile()||stat.size!==f.bytes||await hashFile(target)!==f.sha256)fail('artifact checksum mismatch: '+f.file);}
}
async function verifyPreparedCache(m,{cacheDir,modelDir,releaseId,corpusVersion}){
 validateDescriptor(m,{releaseId});if(m.corpusVersion!==corpusVersion)fail('corpus version mismatch');
 await verifyFiles(cacheDir,m.cacheFiles);await verifyFiles(modelDir,m.modelFiles);
 const meta=JSON.parse(await fs.readFile(path.join(cacheDir,'passage-embeddings.meta.json'),'utf8')),keys=JSON.parse(await fs.readFile(path.join(cacheDir,'passage-embeddings.keys.json'),'utf8'));
 if(meta.model!==m.model||meta.fingerprint!==m.fingerprint||meta.corpusVersion!==m.corpusVersion||meta.dimensions!==m.dimensions||meta.count!==m.count||meta.completed!==m.count||keys.fingerprint!==m.fingerprint||!Array.isArray(keys.keys)||keys.keys.length!==m.count||keys.keys.some(k=>!digest(k))||new Set(keys.keys).size!==m.count)fail('incomplete or incompatible prepared vectors');
 if(m.cacheFiles.find(f=>f.file===CACHE_FILES[0]).bytes!==m.count*m.dimensions*4)fail('vector byte count');
 let practiceSnapshot=null;if(m.schemaVersion===2){await verifyFiles(cacheDir,[m.practiceFile]);practiceSnapshot=JSON.parse(await fs.readFile(path.join(cacheDir,PRACTICE_FILE),'utf8'));require('./practice-cache.cjs').validatePracticeSnapshot(practiceSnapshot,{releaseId,corpusVersion});}
 return {fingerprint:m.fingerprint,count:m.count,dimensions:m.dimensions,model:m.model,practiceSnapshot};
}
function createVerifiedEmbedder(modelDir){
 let pipeline;
 return async texts=>{if(!pipeline)pipeline=import('@huggingface/transformers').then(t=>{t.env.allowLocalModels=true;t.env.allowRemoteModels=false;t.env.localModelPath=path.resolve(modelDir,'../..')+path.sep;return t.pipeline('feature-extraction',MODEL,{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});});const fn=await pipeline,output=await fn(texts,{pooling:'mean',normalize:true,truncation:true});return output.tolist();};
}
module.exports={MODEL,CACHE_FILES,PRACTICE_FILE,MODEL_FILES,validateDescriptor,verifyPreparedCache,createVerifiedEmbedder,hashFile};
