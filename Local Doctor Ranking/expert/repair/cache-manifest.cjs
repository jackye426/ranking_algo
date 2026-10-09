'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {MODEL,CACHE_FILES,PRACTICE_FILE,MODEL_FILES,hashFile,verifyPreparedCache}=require('../cache-release.cjs');
async function createManifest({releaseId,cacheDir,modelDir,output}){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(releaseId||'')||[cacheDir,modelDir,output].some(p=>!p||!path.isAbsolute(p)))throw Error('Explicit release ID and absolute artifact paths required');
 const meta=JSON.parse(await fs.readFile(path.join(cacheDir,'passage-embeddings.meta.json'),'utf8'));
 const files=async(root,names)=>Promise.all(names.map(async file=>({file,bytes:(await fs.stat(path.join(root,file))).size,sha256:await hashFile(path.join(root,file))})));
 const manifest={schemaVersion:2,releaseId,corpusVersion:meta.corpusVersion,model:MODEL,dtype:'q8',dimensions:meta.dimensions,count:meta.count,fingerprint:meta.fingerprint,cacheFiles:await files(cacheDir,CACHE_FILES),modelFiles:await files(modelDir,MODEL_FILES),practiceFile:(await files(cacheDir,[PRACTICE_FILE]))[0]};
 await verifyPreparedCache(manifest,{releaseId,cacheDir,modelDir,corpusVersion:meta.corpusVersion});await fs.writeFile(output,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;
}
if(require.main===module){const [releaseId,cacheDir,modelDir,output]=process.argv.slice(2);createManifest({releaseId,cacheDir,modelDir,output}).then(m=>console.log(JSON.stringify({releaseId:m.releaseId,corpusVersion:m.corpusVersion,count:m.count,verified:true}))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={createManifest};
