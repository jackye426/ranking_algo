'use strict';
// Offline packaging only. Source files are read, never overwritten or fetched.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {VERSION,MANDATORY_HOLDS,REQUIRED_RUNTIME_FILES,loadDataRelease}=require('../releases.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
async function validateFrozenCode(baselineDir,baselineCode,frozen){
 const files={};
 for(const name of ['identity-reviews.cjs','enrichments.cjs','data.cjs']){
  const expected=frozen.files?.find(f=>f.name===name)?.sha256,source=await fs.readFile(path.join(baselineDir,name)),committed=await fs.readFile(path.join(baselineCode,'expert',name));
  if(!expected||hash(source)!==expected)throw Error('Frozen source code checksum mismatch: '+name);
  const byteIdentical=hash(committed)===expected,normalizedEqual=source.toString('utf8').replace(/\r\n/g,'\n')===committed.toString('utf8').replace(/\r\n/g,'\n');
  if(name==='data.cjs'?!normalizedEqual:!byteIdentical)throw Error('Frozen code differs from committed baseline: '+name);
  if(name!=='data.cjs'&&hash(await fs.readFile(path.join(__dirname,'..',name)))!==expected)throw Error('Runtime identity reviews or enrichments changed');
  files[name]={frozenSha256:expected,committedSha256:hash(committed),byteIdentical,normalizedLineEndingsEqual:normalizedEqual};
 }
 return {replayUses:'frozen baseline code',committedReference:frozen.codeCommit,files};
}
async function validateBaselineCommit({baselineCode,frozen,baselineCommit,baselineRepository}){
 if(!/^[a-f0-9]{40}$/.test(baselineCommit||'')||baselineCommit!==frozen.codeCommit)throw Error('Provide the exact full baseline commit recorded by the frozen manifest');
 if(!baselineRepository||!path.isAbsolute(baselineRepository))throw Error('Use an absolute baseline repository for committed-code verification');
 const files={};
 for(const name of ['identity-reviews.cjs','enrichments.cjs','data.cjs']){
  const reference=baselineCommit+':Local Doctor Ranking/expert/'+name;
  let committed;try{committed=execFileSync('git',['-c','safe.directory='+baselineRepository,'show',reference],{cwd:baselineRepository,stdio:['ignore','pipe','pipe'],maxBuffer:25*1024*1024});}catch{throw Error('Cannot verify baseline code against committed repository content: '+name);}
  const exported=await fs.readFile(path.join(baselineCode,'expert',name)),matches=name==='data.cjs'?committed.toString('utf8').replace(/\r\n/g,'\n')===exported.toString('utf8').replace(/\r\n/g,'\n'):hash(committed)===hash(exported);
  if(!matches)throw Error('Baseline export does not match the explicitly selected Git commit: '+name);
  files[name]={gitReference:reference,gitSha256:hash(committed),exportedSha256:hash(exported)};
 }
 return {baselineCommit,files};
}
async function validateRuntimeManifest(filename){
 if(!filename||!path.isAbsolute(filename)||path.basename(filename)!=='deployment-manifest.json')throw Error('Use an absolute staged deployment-manifest.json path');
 const directory=path.dirname(filename),bytes=await fs.readFile(filename);let manifest;try{manifest=JSON.parse(bytes);}catch{throw Error('Runtime deployment manifest is not valid JSON');}
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||Object.keys(manifest).some(k=>!['createdAt','files'].includes(k))||manifest.createdAt!==undefined&&(typeof manifest.createdAt!=='string'||manifest.createdAt.length>40||!Number.isFinite(Date.parse(manifest.createdAt)))||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1000)throw Error('Runtime deployment manifest has no bounded file list or contains unsupported metadata');
 const files=new Map();
 for(const item of manifest.files){
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['file','sha256','bytes'].includes(k))||typeof item.file!=='string'||item.file.length>500||files.has(item.file)||!digest(item.sha256)||item.bytes!==undefined&&(!Number.isSafeInteger(item.bytes)||item.bytes<0)||path.isAbsolute(item.file)||/[\0<>:"|?*]/.test(item.file)||item.file.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'))throw Error('Invalid or duplicate runtime artifact');
  const file=path.resolve(directory,item.file);if(!file.startsWith(directory+path.sep))throw Error('Runtime artifact escapes staging directory');
  let current=path.parse(file).root;for(const part of file.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw Error('Runtime symlink artifacts are not allowed');}
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size>25*1024*1024||item.bytes!==undefined&&stat.size!==item.bytes||hash(await fs.readFile(file))!==item.sha256)throw Error('Runtime artifact checksum or file type mismatch: '+item.file);
  files.set(item.file,item);
 }
 for(const file of REQUIRED_RUNTIME_FILES)if(!files.has(file))throw Error('Runtime deployment manifest omits required runtime: '+file);
 if(files.get('expert/releases.cjs').sha256!==hash(await fs.readFile(path.join(__dirname,'..','releases.cjs'))))throw Error('Staged release adapter differs from this packaging implementation');
 return {sha256:hash(bytes),directory,files};
}
async function buildPackage({baselineDir,baselineCode,output,releaseId,repairsFile,baselineCommit,baselineRepository=path.resolve(__dirname,'../../..'),runtimeManifest,cacheManifestFile,runtimeDependencyFile}){
 if([baselineDir,baselineCode,output].some(p=>!p||!path.isAbsolute(p)))throw Error('Use absolute baseline, baseline-code and new output directories');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(releaseId||''))throw Error('Invalid release ID');
 try{if((await fs.readdir(output)).length)throw Error('Release output must be new or empty');}catch(e){if(e.code!=='ENOENT')throw e;}
 const frozen=JSON.parse(await fs.readFile(path.join(baselineDir,'baseline-manifest.json'),'utf8')),raw=await fs.readFile(path.join(baselineDir,'raw.json'));
 if(frozen.schemaVersion!==1||frozen.rawSha256!==hash(raw)||!frozen.fetchedAt||!frozen.createdAt||!/^[a-f0-9]{40}$/.test(frozen.codeCommit||''))throw Error('Frozen baseline manifest, checksum or committed-code reference mismatch');
 const gitProof=await validateBaselineCommit({baselineCode,frozen,baselineCommit,baselineRepository}),codeProof=await validateFrozenCode(baselineDir,baselineCode,frozen),pinned=Object.fromEntries(Object.entries(codeProof.files).map(([name,proof])=>[name,proof.frozenSha256]));
 const runtime=runtimeManifest?await validateRuntimeManifest(runtimeManifest):null;
 let packet=repairsFile?JSON.parse(await fs.readFile(repairsFile,'utf8')):{schemaVersion:1,releaseId,baselineSha256:frozen.rawSha256,patches:[],holds:MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Unresolved current provider identity conflict; preserve all existing exclusions and withhold this group pending reconciliation.'}))};
 if(packet.releaseId!==releaseId||packet.baselineSha256!==frozen.rawSha256)throw Error('Repair packet belongs to another release or baseline');
 if(packet.schemaVersion===2&&!runtime)throw Error('A schema-two repair release requires its staged runtime manifest');
 for(const name of ['identity-reviews.cjs','enrichments.cjs'])if(runtime&&runtime.files.get('expert/'+name).sha256!==pinned[name])throw Error('Staged runtime identity decisions or enrichments differ from the verified baseline');
 let cacheBytes=null;if(cacheManifestFile){if(!path.isAbsolute(cacheManifestFile)||(await fs.stat(cacheManifestFile)).size>1024*1024)throw Error('Use a bounded absolute cache manifest');cacheBytes=await fs.readFile(cacheManifestFile);require('../cache-release.cjs').validateDescriptor(JSON.parse(cacheBytes),{releaseId});}
 let dependencyBytes=null;if(runtimeDependencyFile){if(!runtime||!path.isAbsolute(runtimeDependencyFile)||(await fs.stat(runtimeDependencyFile)).size>8*1024*1024)throw Error('Use a bounded installed-runtime receipt with a staged runtime');dependencyBytes=await fs.readFile(runtimeDependencyFile);const proof=require('../inference-runtime.cjs').validateReceipt(JSON.parse(dependencyBytes));if(proof.lockfileSha256!==runtime.files.get('package-lock.json').sha256)throw Error('Installed dependency receipt uses another lockfile');}
 const patchBytes=JSON.stringify(packet,null,2),manifest={schemaVersion:runtime?2:1,releaseId,projectionVersion:VERSION,baseline:{path:'baseline/raw.json',sha256:frozen.rawSha256},repairs:{path:'repairs.json',sha256:hash(patchBytes)},identityReviewsSha256:pinned['identity-reviews.cjs'],enrichmentsSha256:pinned['enrichments.cjs'],...(runtime?{runtimeManifestSha256:runtime.sha256}:{}),...(cacheBytes?{cacheManifest:{path:'cache-manifest.json',sha256:hash(cacheBytes)}}:{}),...(dependencyBytes?{runtimeDependencyManifest:{path:'inference-runtime.json',sha256:hash(dependencyBytes)}}:{})};
 await fs.mkdir(path.join(output,'baseline'),{recursive:true});await fs.writeFile(path.join(output,'baseline','raw.json'),raw,{flag:'wx'});await fs.writeFile(path.join(output,'repairs.json'),patchBytes,{flag:'wx'});await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 if(cacheBytes)await fs.writeFile(path.join(output,'cache-manifest.json'),cacheBytes,{flag:'wx'});
 if(dependencyBytes)await fs.writeFile(path.join(output,'inference-runtime.json'),dependencyBytes,{flag:'wx'});
 const loader=runtime?require(path.join(runtime.directory,'expert','releases.cjs')).loadDataRelease:loadDataRelease;
 const loaded=await loader(path.join(output,'manifest.json'),{cacheDir:path.join(output,'cache',releaseId)});
 const summary={schemaVersion:runtime?2:1,createdAt:new Date().toISOString(),releaseId,baselineFetchedAt:frozen.fetchedAt,baselineCodeCommit:frozen.codeCommit,codeProof,gitProof,...(runtime?{runtimeManifestSha256:runtime.sha256}:{}),sourceRows:loaded.rows.length,dataRelease:loaded.dataRelease};
 await fs.writeFile(path.join(output,'package-summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});return summary;
}
if(require.main===module){const [baselineDir,baselineCode,output,releaseId,repairsFile,baselineCommit,baselineRepository,runtimeManifest,cacheManifestFile,runtimeDependencyFile]=process.argv.slice(2);buildPackage({baselineDir,baselineCode,output,releaseId,repairsFile:repairsFile||undefined,baselineCommit,baselineRepository:baselineRepository||undefined,runtimeManifest:runtimeManifest||undefined,cacheManifestFile:cacheManifestFile||undefined,runtimeDependencyFile:runtimeDependencyFile||undefined}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={buildPackage,validateFrozenCode,validateBaselineCommit,validateRuntimeManifest};
