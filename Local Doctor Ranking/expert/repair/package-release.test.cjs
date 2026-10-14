'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {buildPackage,validateFrozenCode,validateBaselineCommit,validateRuntimeManifest}=require('./package-release.cjs'),{MANDATORY_HOLDS,REQUIRED_RUNTIME_FILES}=require('../releases.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'docmap-package-proof-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const repository=path.join(dir,'repository'),baselineCode=path.join(repository,'Local Doctor Ranking'),baselineDir=path.join(dir,'baseline');await fs.mkdir(path.join(baselineCode,'expert'),{recursive:true});await fs.mkdir(baselineDir);
  const files=[];
  for(const name of ['identity-reviews.cjs','enrichments.cjs','data.cjs']){const bytes=await fs.readFile(path.join(__dirname,'..',name));await fs.writeFile(path.join(baselineCode,'expert',name),bytes);await fs.writeFile(path.join(baselineDir,name),bytes);files.push({name,sha256:hash(bytes)});}
  const git=args=>execFileSync('git',['-c','safe.directory='+repository,'-c','core.autocrlf=false',...args],{cwd:repository,encoding:'utf8',stdio:['ignore','pipe','pipe']});git(['init']);git(['add','Local Doctor Ranking']);git(['-c','user.name=DocMap Test','-c','user.email=test@example.invalid','commit','-m','Frozen synthetic source fixture']);const baselineCommit=git(['rev-parse','HEAD']).trim();
  const raw={readerVersion:1,fetchedAt:'2026-10-08T00:00:00.000Z',rows:MANDATORY_HOLDS.map((id,i)=>({id,name:'Held Source '+i,gmc_number:String(7001000+i)}))},bytes=JSON.stringify(raw),frozen={schemaVersion:1,createdAt:'2026-10-08T00:00:00.000Z',fetchedAt:raw.fetchedAt,rawSha256:hash(bytes),codeCommit:baselineCommit,files};await fs.writeFile(path.join(baselineDir,'raw.json'),bytes);await fs.writeFile(path.join(baselineDir,'baseline-manifest.json'),JSON.stringify(frozen));
  return {dir,baselineDir,baselineCode,baselineCommit,baselineRepository:repository,frozen,output:path.join(dir,'release'),releaseId:'package-fixture'};
}
async function runtimeFixture(t){
  const f=await fixture(t),runtime=path.join(f.dir,'runtime'),files=[];await fs.mkdir(path.join(runtime,'expert'),{recursive:true});
  for(const file of REQUIRED_RUNTIME_FILES){const bytes=await fs.readFile(path.join(__dirname,'../..',file));await fs.mkdir(path.dirname(path.join(runtime,file)),{recursive:true});await fs.writeFile(path.join(runtime,file),bytes);files.push({file,bytes:bytes.length,sha256:hash(bytes)});}
  const runtimeManifest=path.join(runtime,'deployment-manifest.json');await fs.writeFile(runtimeManifest,JSON.stringify({files}));const packet={schemaVersion:2,releaseId:f.releaseId,baselineSha256:f.frozen.rawSha256,patches:[],suppressions:[],holds:MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Explicit safety hold'}))},repairsFile=path.join(f.dir,'repairs.json');await fs.writeFile(repairsFile,JSON.stringify(packet));return {...f,runtime,runtimeManifest,repairsFile};
}
test('packaging accepts any explicitly verified full baseline commit instead of a historical prefix',async t=>{
  const f=await fixture(t);const proof=await validateBaselineCommit(f);assert.equal(proof.baselineCommit,f.baselineCommit);assert.equal(Object.keys(proof.files).length,3);
  const summary=await buildPackage(f),manifest=JSON.parse(await fs.readFile(path.join(f.output,'manifest.json'),'utf8'));assert.equal(summary.baselineCodeCommit,f.baselineCommit);assert.deepEqual(summary.gitProof,proof);assert.equal(manifest.schemaVersion,1);assert.equal(summary.sourceRows,MANDATORY_HOLDS.length);assert.equal(summary.dataRelease.declaredHoldRows,MANDATORY_HOLDS.length);
});
test('missing, abbreviated or false baseline references cannot package source exports',async t=>{
  const f=await fixture(t);for(const baselineCommit of [undefined,f.baselineCommit.slice(0,7),'f'.repeat(40)])await assert.rejects(buildPackage({...f,baselineCommit}),/exact full baseline commit/);
  await fs.appendFile(path.join(f.baselineCode,'expert','data.cjs'),'\n// uncommitted substitute');await assert.rejects(buildPackage(f),/does not match the explicitly selected Git commit/);await assert.rejects(fs.stat(f.output),{code:'ENOENT'});
});
test('Git lineage accepts only CRLF-to-LF equivalence for all three exported baseline modules',async t=>{
 const f=await fixture(t),names=['identity-reviews.cjs','enrichments.cjs','data.cjs'],original={};
 const git=args=>execFileSync('git',['-c','safe.directory='+f.baselineRepository,'-c','core.autocrlf=false',...args],{cwd:f.baselineRepository,stdio:['ignore','pipe','pipe']});
 for(const name of names){const file=path.join(f.baselineCode,'expert',name),bytes=await fs.readFile(file);original[name]=Buffer.from(bytes.toString('latin1').replace(/\r\n/g,'\n'),'latin1');await fs.writeFile(file,original[name]);}
 git(['add','Local Doctor Ranking']);git(['-c','user.name=DocMap Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','Synthetic LF Git blobs']);f.baselineCommit=git(['rev-parse','HEAD']).toString().trim();f.frozen.codeCommit=f.baselineCommit;
 for(const name of names)await fs.writeFile(path.join(f.baselineCode,'expert',name),Buffer.from(original[name].toString('latin1').replace(/\n/g,'\r\n'),'latin1'));
 const proof=await validateBaselineCommit(f);for(const name of names){assert.equal(proof.files[name].byteIdentical,false);assert.equal(proof.files[name].normalizedLineEndingsEqual,true);assert.equal(proof.files[name].gitSha256,hash(original[name]));assert.equal(proof.files[name].exportedSha256,hash(await fs.readFile(path.join(f.baselineCode,'expert',name))));}
 // Neither a real source edit, extra whitespace, lone CR nor malformed bytes
 // are line-ending conversion. Exercise each module, not just data.cjs.
 for(const name of names){const file=path.join(f.baselineCode,'expert',name),approved=await fs.readFile(file);for(const change of [b=>Buffer.concat([b,Buffer.from('\n// changed claim')]),b=>Buffer.concat([b,Buffer.from(' ')]),b=>Buffer.from(b.toString('latin1').replace(/\r\n/,'\r'),'latin1'),b=>Buffer.concat([Buffer.from([0xff]),b])]){await fs.writeFile(file,change(approved));await assert.rejects(validateBaselineCommit(f),error=>error.message.endsWith(name)&&/does not match/.test(error.message));}await fs.writeFile(file,approved);}
});
test('Git line-ending tolerance does not weaken frozen or staged identity byte pins',async t=>{
 const f=await runtimeFixture(t);
 for(const name of ['identity-reviews.cjs','enrichments.cjs']){
  const file=path.join(f.baselineCode,'expert',name),original=await fs.readFile(file),text=original.toString('latin1'),altered=Buffer.from(text.includes('\r\n')?text.replace(/\r\n/g,'\n'):text.replace(/\n/g,'\r\n'),'latin1');assert.notEqual(hash(altered),hash(original));
  await fs.writeFile(file,altered);assert.equal((await validateBaselineCommit(f)).files[name].normalizedLineEndingsEqual,true);await assert.rejects(validateFrozenCode(f.baselineDir,f.baselineCode,f.frozen),error=>error.message.endsWith(name)&&/differs from committed baseline/.test(error.message));await fs.writeFile(file,original);
  const staged=path.join(f.runtime,'expert',name),manifest=JSON.parse(await fs.readFile(f.runtimeManifest,'utf8'));await fs.writeFile(staged,altered);const item=manifest.files.find(x=>x.file==='expert/'+name);item.sha256=hash(altered);item.bytes=altered.length;await fs.writeFile(f.runtimeManifest,JSON.stringify(manifest));await assert.rejects(buildPackage(f),/Staged runtime identity decisions or enrichments differ/);await assert.rejects(fs.stat(f.output),{code:'ENOENT'});
  await fs.writeFile(staged,original);item.sha256=hash(original);item.bytes=original.length;await fs.writeFile(f.runtimeManifest,JSON.stringify(manifest));
 }
});
test('version-two package records its verified runtime pin without modifying frozen source manifests',async t=>{
  const f=await runtimeFixture(t),before=await fs.readFile(path.join(f.baselineDir,'baseline-manifest.json')),summary=await buildPackage(f),manifest=JSON.parse(await fs.readFile(path.join(f.output,'manifest.json'),'utf8'));
  assert.equal(manifest.schemaVersion,2);assert.equal(manifest.runtimeManifestSha256,hash(await fs.readFile(f.runtimeManifest)));assert.equal(summary.runtimeManifestSha256,manifest.runtimeManifestSha256);assert.deepEqual(await fs.readFile(path.join(f.baselineDir,'baseline-manifest.json')),before);await assert.rejects(buildPackage(f),/new or empty/);
});
test('packaging binds installed dependency receipts and rejects a different dependency lockfile',async t=>{
 const f=await runtimeFixture(t),R=require('../inference-runtime.cjs'),identity=R.runtimeIdentity(),names=[...R.REQUIRED,`onnxruntime-node/bin/napi-v6/${identity.platform}/${identity.arch}/onnxruntime_binding.node`,...(identity.platform==='linux'?[`onnxruntime-node/bin/napi-v6/linux/${identity.arch}/libonnxruntime.so.1`]:[])].sort(),files=names.map(file=>({file,bytes:1,sha256:'a'.repeat(64)}));
 const proof={schemaVersion:1,format:R.SCHEMA,runtime:identity,executable:{bytes:1,sha256:'b'.repeat(64)},lockfileSha256:hash(await fs.readFile(path.join(f.runtime,'package-lock.json'))),files,filesSha256:hash(JSON.stringify(files)),excludedDirectories:['.bin']},runtimeDependencyFile=path.join(f.dir,'inference-runtime.json');
 await fs.writeFile(runtimeDependencyFile,JSON.stringify({...proof,lockfileSha256:'c'.repeat(64)}));await assert.rejects(buildPackage({...f,runtimeDependencyFile}),/another lockfile/);await assert.rejects(fs.stat(f.output),{code:'ENOENT'});
 await fs.writeFile(runtimeDependencyFile,JSON.stringify(proof));const summary=await buildPackage({...f,runtimeDependencyFile}),manifest=JSON.parse(await fs.readFile(path.join(f.output,'manifest.json'),'utf8'));assert.equal(manifest.runtimeDependencyManifest.sha256,hash(await fs.readFile(runtimeDependencyFile)));assert.equal(summary.dataRelease.runtimeDependencyManifestSha256,manifest.runtimeDependencyManifest.sha256);assert.deepEqual(await fs.readFile(path.join(f.output,'inference-runtime.json')),await fs.readFile(runtimeDependencyFile));
});
test('enriched packets without runtime pins and corrupt staged runtime never leave a promotable package',async t=>{
  const f=await runtimeFixture(t);await assert.rejects(buildPackage({...f,runtimeManifest:undefined}),/requires its staged runtime manifest/);await assert.rejects(fs.stat(f.output),{code:'ENOENT'});
  await fs.appendFile(path.join(f.runtime,'expert','server.cjs'),'\n// altered build');await assert.rejects(buildPackage(f),/Runtime artifact checksum/);await assert.rejects(fs.stat(f.output),{code:'ENOENT'});
});
test('runtime validation rejects missing required modules and unsafe or duplicate manifest paths',async t=>{
  const f=await runtimeFixture(t),original=JSON.parse(await fs.readFile(f.runtimeManifest,'utf8'));
  for(const edit of [m=>m.files=m.files.filter(f=>f.file!=='expert/profile.cjs'),m=>m.files.push({...m.files[0]}),m=>m.files[0].file='../releases.cjs']){const changed=structuredClone(original);edit(changed);await fs.writeFile(f.runtimeManifest,JSON.stringify(changed));await assert.rejects(validateRuntimeManifest(f.runtimeManifest),/omits required runtime|Invalid or duplicate runtime artifact/);}
});
test('packaging rejects omitted HTML, styles, fonts and branding descriptors',async t=>{
  const f=await runtimeFixture(t),original=JSON.parse(await fs.readFile(f.runtimeManifest,'utf8'));
  for(const missing of ['expert/public/index.html','expert/public/styles.css','public/fonts/inter-variable.ttf','public/fonts/OFL-Inter.txt','public/brand/docmap-logo.jpg']){
    const changed={...original,files:original.files.filter(item=>item.file!==missing)};
    await fs.writeFile(f.runtimeManifest,JSON.stringify(changed));
    await assert.rejects(validateRuntimeManifest(f.runtimeManifest),error=>error.message.includes('omits required runtime: '+missing));
  }
});
test('the actual staging allowlist pins every runtime dependency while retaining fonts and Docker metadata',async t=>{
  const f=await fixture(t),destination=path.join(f.dir,'actual-stage');execFileSync(process.execPath,[path.join(__dirname,'..','stage.cjs'),destination],{stdio:['ignore','pipe','pipe']});const manifest=await validateRuntimeManifest(path.join(destination,'deployment-manifest.json'));
  assert.deepEqual([...manifest.files.keys()].sort(),[...REQUIRED_RUNTIME_FILES].sort(),'new staged assets must also become required runtime pins');
  const docker=await fs.readFile(path.join(destination,'Dockerfile'),'utf8');const runtimeDocker=docker.split('FROM base AS runtime')[1],copied=runtimeDocker.split(/\r?\n/).filter(line=>/^COPY (?!\-\-)/.test(line)).flatMap(line=>line.trim().split(/\s+/).slice(1,-1));for(const file of REQUIRED_RUNTIME_FILES)assert.ok(copied.some(source=>source===file||source.endsWith('/')&&file.startsWith(source)),'Docker runtime omits pinned artifact: '+file);assert.match(docker.split('FROM base AS runtime')[1],/COPY package\.json package-lock\.json deployment-manifest\.json Dockerfile \.\//);assert.ok(!(await fs.readFile(path.join(destination,'expert','entrypoint.sh'),'utf8')).includes('\r\n'),'entrypoint bytes must survive Docker shell normalization unchanged');
});
test('package runtime checks enforce descriptor types and reject hidden manifest fields',async t=>{
  const f=await runtimeFixture(t),original=JSON.parse(await fs.readFile(f.runtimeManifest,'utf8'));
  for(const edit of [m=>m.createdAt=null,m=>m.hidden={path:'unverified'},m=>m.files[0].bytes='100',m=>m.files[0].bytes++,m=>m.files[0].unchecked=true,m=>m.files=m.files.filter(f=>f.file!=='expert/brief-context.cjs')]){const changed=structuredClone(original);edit(changed);await fs.writeFile(f.runtimeManifest,JSON.stringify(changed));await assert.rejects(validateRuntimeManifest(f.runtimeManifest),/unsupported metadata|Invalid or duplicate runtime artifact|checksum|omits required runtime/);}
});
