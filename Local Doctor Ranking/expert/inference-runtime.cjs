'use strict';

// Private, offline receipts bind installed dependencies, not just npm's intended
// lockfile. No downloads, environment values or professional text enter them.
const fs=require('node:fs/promises'),{createReadStream}=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const SCHEMA='expert-inference-runtime-v1';
const SYSTEM_SCHEMA='expert-inference-runtime-v2',SYSTEM_METHOD='ldd-resolved-v1';
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),runFile=promisify(execFile);
const SYSTEM_ROOTS=['node','onnx-binding','onnx-runtime'];
const REQUIRED=['@huggingface/transformers/package.json','@huggingface/transformers/dist/transformers.node.cjs','@huggingface/transformers/dist/transformers.node.mjs','onnxruntime-node/package.json','onnxruntime-node/dist/backend.js','onnxruntime-common/package.json'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=message=>{throw Error('Invalid expert inference runtime: '+message);};
async function hashFile(file){const h=createHash('sha256');for await(const part of createReadStream(file))h.update(part);return h.digest('hex');}
function runtimeIdentity(){return {node:process.version,platform:process.platform,arch:process.arch,modules:process.versions.modules,napi:process.versions.napi,v8:process.versions.v8};}
function validateReceipt(value){
 if(!value||!([1,2].includes(value.schemaVersion))||value.format!==(value.schemaVersion===1?SCHEMA:SYSTEM_SCHEMA)||Object.keys(value).some(k=>!['schemaVersion','format','createdAt','runtime','executable','lockfileSha256','files','filesSha256','excludedDirectories',...(value.schemaVersion===2?['systemLibraries']:[])].includes(k)))fail('receipt shape');
 if(!value.runtime||Object.keys(value.runtime).sort().join('|')!==Object.keys(runtimeIdentity()).sort().join('|')||Object.values(value.runtime).some(v=>typeof v!=='string'||!v||v.length>100))fail('runtime identity');
 if(!value.executable||Object.keys(value.executable).some(k=>!['bytes','sha256'].includes(k))||!Number.isSafeInteger(value.executable.bytes)||value.executable.bytes<1||!digest(value.executable.sha256)||!digest(value.lockfileSha256))fail('executable or lockfile digest');
 if(JSON.stringify(value.excludedDirectories)!=='[".bin"]'||!Array.isArray(value.files)||!value.files.length||value.files.length>30000||!digest(value.filesSha256)||value.filesSha256!==sha(JSON.stringify(value.files)))fail('dependency inventory');
 let previous='';const names=new Set();
 for(const f of value.files){
  if(!f||Object.keys(f).some(k=>!['file','bytes','sha256'].includes(k))||typeof f.file!=='string'||f.file.length>500||f.file<=previous||path.isAbsolute(f.file)||/[\\\0<>:"|?*]/.test(f.file)||f.file.split('/').some(p=>!p||p==='.'||p==='..'||p==='.bin')||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>2*1024**3||!digest(f.sha256))fail('dependency descriptor');
  previous=f.file;names.add(f.file);
 }
 for(const name of REQUIRED)if(!names.has(name))fail('missing inference implementation: '+name);
 const native=`onnxruntime-node/bin/napi-v6/${value.runtime.platform}/${value.runtime.arch}/onnxruntime_binding.node`;
 if(!names.has(native))fail('missing native inference binding');
 if(value.runtime.platform==='linux'&&!names.has(`onnxruntime-node/bin/napi-v6/linux/${value.runtime.arch}/libonnxruntime.so.1`))fail('missing native inference library');
 if(value.schemaVersion===2){if(value.runtime.platform==='linux')validateSystemLibraries(value.systemLibraries);else if(value.systemLibraries!==null)fail('non-Linux system inventory');}
 return value;
}
const safeLinuxPath=file=>typeof file==='string'&&file.length<=1000&&/^\/[A-Za-z0-9_./+@-]+$/.test(file)&&!file.split('/').some(part=>part==='.'||part==='..')&&!file.includes('//');
function validateSystemLibraries(value){
 if(!value||Object.keys(value).sort().join('|')!=='files|method|resolver|roots|sha256'||value.method!==SYSTEM_METHOD||!digest(value.sha256))fail('system-library inventory');
 const descriptor=file=>file&&Object.keys(file).sort().join('|')==='bytes|file|sha256'&&safeLinuxPath(file.file)&&Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<2*1024**3&&digest(file.sha256);
 if(!descriptor(value.resolver)||!/^\/usr\/(?:s?bin)\/ldd$/.test(value.resolver.file)||!Array.isArray(value.files)||!value.files.length||value.files.length>256)fail('system-library descriptors');
 const names=new Set();let previous='';for(const file of value.files){if(!descriptor(file)||file.file<=previous)fail('system-library descriptor');previous=file.file;names.add(file.file);}
 if(!Array.isArray(value.roots)||value.roots.length!==SYSTEM_ROOTS.length)fail('system-library roots');
 const used=new Set();for(let i=0;i<SYSTEM_ROOTS.length;i++){const root=value.roots[i];if(!root||Object.keys(root).sort().join('|')!=='dependencies|kind'||root.kind!==SYSTEM_ROOTS[i]||!Array.isArray(root.dependencies)||!root.dependencies.length||root.dependencies.length>256)fail('system-library root');let prior='';for(const file of root.dependencies){if(!names.has(file)||file<=prior)fail('system-library dependency');prior=file;used.add(file);}}
 if(used.size!==names.size||value.sha256!==sha(JSON.stringify({method:value.method,resolver:value.resolver,roots:value.roots,files:value.files})))fail('system-library inventory checksum');
 return value;
}
function parseLdd(output){
 if(typeof output!=='string'||output.length>256*1024)fail('invalid dependency resolver output');
 const files=[];for(const line of output.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
  if(/^linux-vdso(?:64)?\.so\.\d+\s+\(0x[a-f0-9]+\)$/i.test(line))continue; // Kernel-provided virtual object, no file bytes.
  if(/=>\s*not found\b/i.test(line))fail('unresolved system inference library');
  const match=line.match(/^(?:[^\s=]+\s+=>\s+)?(\/[^\s]+)\s+\(0x[a-f0-9]+\)$/i);
  if(!match||!safeLinuxPath(match[1]))fail('unrecognised dependency resolver output');
  files.push(match[1]);
 }
 if(!files.length)fail('empty system dependency graph');return [...new Set(files)].sort();
}
async function systemLibraries(appRoot,{executable=process.execPath,identity=runtimeIdentity(),run=runFile,fileSystem=fs,hash=hashFile,environment=process.env}={}){
 if(identity.platform!=='linux')return null;
 if(!safeLinuxPath(appRoot)||!safeLinuxPath(executable)||!/^[a-z0-9_]+$/i.test(identity.arch))fail('unsafe inference dependency roots');
 for(const key of ['LD_PRELOAD','LD_LIBRARY_PATH','LD_AUDIT'])if(environment[key])fail('unsupported dynamic-loader override: '+key);
 const libraryRoot=path.posix.join(appRoot,'node_modules'),native=libraryRoot+`/onnxruntime-node/bin/napi-v6/linux/${identity.arch}`;
 const roots=[executable,native+'/onnxruntime_binding.node',native+'/libonnxruntime.so.1'],known=new Map(),graphs=[];
 const describe=async file=>{const resolved=await fileSystem.realpath(file);if(!safeLinuxPath(resolved))fail('unsafe resolved dependency path');const stat=await fileSystem.stat(resolved);if(!stat.isFile())fail('non-file inference dependency');return {file:resolved,bytes:stat.size,sha256:await hash(resolved)};};
 const resolver=await describe('/usr/bin/ldd');if(!/^\/usr\/(?:s?bin)\/ldd$/.test(resolver.file))fail('unexpected dependency resolver');
 for(let i=0;i<roots.length;i++){
  const target=await fileSystem.realpath(roots[i]);if(!safeLinuxPath(target)||(i>0&&!target.startsWith(libraryRoot+'/')))fail('inference root escaped dependency directory');
  const stat=await fileSystem.stat(target);if(!stat.isFile())fail('non-file inference root');
  // Fixed executable and individually passed absolute paths; no shell, command
  // interpolation, caller-provided flags or inherited loader overrides.
  const {stdout,stderr}=await run('/usr/bin/ldd',[target],{encoding:'utf8',timeout:15000,maxBuffer:256*1024,windowsHide:true,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'}});
  if(stderr?.trim())fail('dependency resolver warning');
  const dependencies=[];for(const file of parseLdd(stdout)){
   const info=await describe(file);
   if(!/^(?:\/usr\/lib(?:64)?|\/lib(?:64)?)\//.test(info.file)&&!info.file.startsWith(libraryRoot+'/'))fail('system dependency outside verified library directories');
   known.set(info.file,info);dependencies.push(info.file);
  }
  graphs.push({kind:SYSTEM_ROOTS[i],dependencies:[...new Set(dependencies)].sort()});
 }
 const value={method:SYSTEM_METHOD,resolver,roots:graphs,files:[...known.values()].sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0)};value.sha256=sha(JSON.stringify(value));return validateSystemLibraries(value);
}
async function dependencyFiles(root){
 if(!path.isAbsolute(root))fail('absolute dependency root required');
 if((await fs.lstat(root)).isSymbolicLink())fail('dependency root symlink');
 const result=[];
 async function walk(directory,prefix=''){
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
   if(item.name==='.bin')continue; // npm executable aliases, not imported runtime files.
   const relative=prefix+item.name,target=path.join(directory,item.name);
   if(item.isSymbolicLink())fail('dependency symlink: '+relative);
   if(item.isDirectory())await walk(target,relative+'/');
   else if(item.isFile()){const stat=await fs.stat(target);result.push({file:relative,bytes:stat.size,sha256:await hashFile(target)});}
   else fail('non-file dependency: '+relative);
   if(result.length>30000)fail('dependency inventory exceeds bound');
  }
 }
 await walk(root);return result.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
}
async function createReceipt(appRoot,{executable=process.execPath,identity=runtimeIdentity(),systemScanner=systemLibraries}={}){
 if(!path.isAbsolute(appRoot)||!path.isAbsolute(executable))fail('absolute runtime paths required');
 const files=await dependencyFiles(path.join(appRoot,'node_modules'));
 return validateReceipt({schemaVersion:2,format:SYSTEM_SCHEMA,createdAt:new Date().toISOString(),runtime:identity,executable:{bytes:(await fs.stat(executable)).size,sha256:await hashFile(executable)},lockfileSha256:await hashFile(path.join(appRoot,'package-lock.json')),files,filesSha256:sha(JSON.stringify(files)),excludedDirectories:['.bin'],systemLibraries:await systemScanner(appRoot,{executable,identity})});
}
async function verifyReceipt(receipt,appRoot,{executable=process.execPath,identity=runtimeIdentity(),systemScanner=systemLibraries,strict=process.env.EXPERT_RELEASE_STRICT==='1'}={}){
 validateReceipt(receipt);
 if(strict&&identity.platform==='linux'&&receipt.schemaVersion!==2)fail('strict Linux readiness requires a version-two system-library receipt');
 if(JSON.stringify(receipt.runtime)!==JSON.stringify(identity))fail('Node/platform/ABI mismatch');
 const stat=await fs.stat(executable);
 if(stat.size!==receipt.executable.bytes||await hashFile(executable)!==receipt.executable.sha256)fail('Node executable checksum mismatch');
 if(await hashFile(path.join(appRoot,'package-lock.json'))!==receipt.lockfileSha256)fail('dependency lockfile mismatch');
 const actual=await dependencyFiles(path.join(appRoot,'node_modules'));
 if(sha(JSON.stringify(actual))!==receipt.filesSha256)fail('installed dependency bytes or inventory changed');
 if(receipt.schemaVersion===2){const actualSystem=await systemScanner(appRoot,{executable,identity});if(JSON.stringify(actualSystem)!==JSON.stringify(receipt.systemLibraries))fail('system inference libraries or resolution changed');}
 return {runtime:receipt.runtime,executableSha256:receipt.executable.sha256,dependenciesSha256:receipt.filesSha256,fileCount:actual.length,...(receipt.systemLibraries?{systemLibrariesSha256:receipt.systemLibraries.sha256,systemLibraryCount:receipt.systemLibraries.files.length}:{})};
}
async function warmQueryModel(embedQuery,{dimensions=384}={}){
 const output=await embedQuery(['Professional evidence discovery']);
 if(!Array.isArray(output)||output.length!==1||!Array.isArray(output[0])||output[0].length!==dimensions||output[0].some(v=>!Number.isFinite(v)))fail('query-model warm-up returned invalid dimensions or values');
 const norm=Math.sqrt(output[0].reduce((n,v)=>n+v*v,0));
 if(norm<.99||norm>1.01)fail('query-model warm-up returned an invalid normalized vector');
 return {dimensions,normalized:true};
}
if(require.main===module){const [action,appRoot,filename]=process.argv.slice(2);(async()=>{if(!path.isAbsolute(appRoot||'')||!path.isAbsolute(filename||''))fail('absolute application and receipt paths required');if(action==='capture'){const receipt=await createReceipt(appRoot);await fs.writeFile(filename,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({captured:true,files:receipt.files.length,sha256:await hashFile(filename),runtime:receipt.runtime}));}else if(action==='verify'){const result=await verifyReceipt(JSON.parse(await fs.readFile(filename,'utf8')),appRoot);console.log(JSON.stringify({verified:true,...result}));}else fail('use capture or verify');})().catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={SCHEMA,SYSTEM_SCHEMA,REQUIRED,validateReceipt,validateSystemLibraries,parseLdd,systemLibraries,dependencyFiles,createReceipt,verifyReceipt,warmQueryModel,runtimeIdentity};
