'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const R=require('./releases.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),releaseId='enriched-test',baselineSha256='a'.repeat(64);
const rows=()=>[{id:'source-one',name:'Dr Source Example',gmc_number:'7000001',specialty:'Radiology',about:'Unsafe imported biography.',about_alternatives:{bupa:'Unsafe provider passage.',spire:'I report cardiac CT.'},clinical_interests:'Cardiac imaging',locations:[{name:'Recorded hospital'}],profile_urls:{spire:'https://example.org/source-one'}},...R.MANDATORY_HOLDS.map((id,i)=>({id,name:'Held Person '+i,gmc_number:String(7000002+i),about:'Recorded interests.'})),{id:'excluded',name:'Excluded Person',gmc_number:'7000009',do_not_recommend:true,about:'Clinical biography.'}];
const sourceEvidence=()=>[{snapshotSha256:'b'.repeat(64),sourceField:'about',sourceRecordId:'source-one'}];
function packet(raw=rows(),field='about'){
  const value=field.split('.').reduce((v,key)=>v[key],raw[0]);return {schemaVersion:2,releaseId,baselineSha256,patches:[],holds:R.MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Known source identity conflict'})),suppressions:[{sourceRecordId:'source-one',field,beforeHash:R.hashValue(value),approved:true,reason:'Exact source review identified meaning-corrupt text.',reviewId:'review-fixture-1',sourceEvidence:sourceEvidence()}]};
}
const apply=(raw,p)=>R.applyRepairs(raw,p,{releaseId,baselineSha256});

test('NHS-base evidence exclusions preserve canonical metadata and recorded practice locations',()=>{
 const raw=rows();raw[0].nhs_base='Recorded hospital; ask the secretary for scheduling.';const original=structuredClone(raw),p=packet(raw,'nhs_base');
 const result=apply(raw,p);assert.deepEqual(raw,original);assert.equal(result.rows[0].nhs_base,original[0].nhs_base);assert.deepEqual(result.rows[0].locations,original[0].locations);
 const {buildCorpus}=require('./data.cjs'),corpus=buildCorpus(result.rows);
 assert.ok(!corpus.passages.some(e=>e.sourceRecordId==='source-one'&&e.field==='nhs_base'));
 assert.ok(corpus.candidates.some(c=>c.sourceRecordIds.includes('source-one')&&!c.needsIdentityReview));
 const forged=rows();forged[0]._expertEvidenceExclusions={};assert.throws(()=>apply(forged,packet(forged)),/reserved projection decisions/);
 result.rows[0].nhs_base='Changed source';assert.throws(()=>buildCorpus(result.rows),/source-bound evidence projection exclusion/);
});
test('field and nested-provider suppression remove only reviewed unsafe evidence and preserve source inputs',()=>{
  for(const field of ['about','about_alternatives.bupa']){const raw=rows(),before=structuredClone(raw),p=packet(raw,field),beforePacket=structuredClone(p),result=apply(raw,p);assert.deepEqual(raw,before);assert.deepEqual(p,beforePacket);assert.equal(result.summary.suppressedFields,1);assert.equal(result.rows[0].about_alternatives.spire,'I report cardiac CT.');if(field==='about')assert.equal(result.rows[0].about,null);else assert.equal(Object.hasOwn(result.rows[0].about_alternatives,'bupa'),false);assert.equal(result.rows[0].name,raw[0].name);assert.deepEqual(result.rows[0].locations,raw[0].locations);assert.deepEqual(result.rows[0].profile_urls,raw[0].profile_urls);assert.equal(result.rows.find(r=>r.id==='excluded').do_not_recommend,true);for(const id of R.MANDATORY_HOLDS)assert.equal(result.rows.find(r=>r.id===id).requires_review,true);}
});
test('suppressed biography wording cannot enter the prepared corpus, profile or evidence collection',()=>{
  const raw=rows(),p=packet(raw);p.suppressions.push({...packet(raw,'about_alternatives.bupa').suppressions[0]});const repaired=apply(raw,p),corpus=require('./data.cjs').buildCorpus(repaired.rows),candidate=corpus.candidates.find(c=>c.sourceRecordIds.includes('source-one')),profile=require('./profile.cjs').buildProfile(candidate,corpus.passages,{corpusVersion:corpus.version});
  assert.ok(corpus.passages.some(p=>p.text==='I report cardiac CT.'));assert.ok(!JSON.stringify(corpus.passages).includes('Unsafe'));assert.ok(!JSON.stringify(profile).includes('Unsafe'));assert.ok(!corpus.passages.some(p=>R.MANDATORY_HOLDS.includes(p.sourceRecordId)||p.sourceRecordId==='excluded'));
});
test('repaired rows are deeply isolated from the frozen baseline including unchanged rows and nested fields',()=>{
  const raw=rows(),before=structuredClone(raw),result=apply(raw,packet(raw));result.rows[0].locations[0].name='Downstream mutation';result.rows[0].about_alternatives.spire='Downstream edit';result.rows.find(r=>r.id==='excluded').about='Later mutation';assert.deepEqual(raw,before);
});
test('suppression rejects identity fields, unsafe nested keys, wrong ownership, stale hashes and unapproved decisions',()=>{
  const edits=[p=>p.suppressions[0].field='name',p=>p.suppressions[0].field='gmc_number',p=>p.suppressions[0].field='locations',p=>p.suppressions[0].field='profile_urls',p=>p.suppressions[0].field='about_alternatives.__proto__',p=>p.suppressions[0].field='about_alternatives.bupa.text',p=>p.suppressions[0].beforeHash='c'.repeat(64),p=>p.suppressions[0].approved=false,p=>p.suppressions[0].sourceEvidence[0].sourceRecordId='another-person',p=>p.suppressions[0].sourceEvidence[0].snapshotSha256='broken',p=>p.suppressions[0].sourceEvidence=[],p=>p.suppressions[0].field='about_alternatives.missing'];
  for(const edit of edits){const p=packet();edit(p);assert.throws(()=>apply(rows(),p),/Invalid expert data release/);}
});
test('duplicate and parent-child suppression decisions conflict with each other and approved patches',()=>{
  for(const fields of [['about','about'],['about_alternatives','about_alternatives.bupa'],['about_alternatives.bupa','about_alternatives']]){const raw=rows(),p=packet(raw,fields[0]);p.suppressions.push(packet(raw,fields[1]).suppressions[0]);assert.throws(()=>apply(raw,p),/conflicting field patch or suppression/);}
  const raw=rows(),p=packet(raw);p.patches.push({sourceRecordId:'source-one',field:'about',approved:true,beforeHash:R.hashValue(raw[0].about),value:'Source-supported replacement.',provenance:{sourceUrl:null,sourceLabel:'Stored Bupa profile',sourceDate:null,observedAt:null,snapshotSha256:'b'.repeat(64),parserVersion:'fixture',reviewId:'fixture'}});assert.throws(()=>apply(raw,p),/conflicting field patch or suppression/);
});
test('source-bound missing URLs and dated PHIN ranges remain qualifications rather than invented current activity',()=>{
  const raw=rows(),p=packet(raw),provenance={sourceUrl:null,sourceLabel:'Stored PHIN professional record',sourceDate:'2021-05-01',observedAt:null,snapshotSha256:'b'.repeat(64),parserVersion:'fixture',reviewId:'fixture',sourceField:'procedure_counts'};
  p.patches=[{sourceRecordId:'source-one',field:'professional_context',approved:true,beforeHash:R.hashValue(null),value:[{kind:'reported-activity',text:'Recorded procedure range: <=7',provenance,activity:{procedureName:'Recorded procedure',procedureCode:'Z12',hospital:'Recorded hospital',period:'2020',reportedRange:'<=7',reportedAdmissions:null}}]}];
  const value=apply(raw,p).rows[0].professional_context[0];assert.equal(value.sourceUrl,null);assert.equal(value.sourceDate,'2021-05-01');assert.equal(value.observedAt,null);assert.equal(value.activity.reportedRange,'<=7');assert.equal(value.activity.reportedAdmissions,null);
  for(const change of [v=>v.activity.reportedAdmissions=3.5,v=>v.kind='biography',v=>v.activity.principalInvestigator=true]){const bad=structuredClone(p);change(bad.patches[0].value[0]);assert.throws(()=>apply(raw,bad),/Invalid expert data release/);}
});
async function releaseFixture(t,{schemaVersion=2}={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'docmap-enriched-release-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const runtime=path.join(dir,'runtime');await fs.mkdir(path.join(runtime,'expert'),{recursive:true});const files=[];
  for(const file of R.REQUIRED_RUNTIME_FILES){const bytes=await fs.readFile(path.join(__dirname,'..',file));await fs.mkdir(path.dirname(path.join(runtime,file)),{recursive:true});await fs.writeFile(path.join(runtime,file),bytes);files.push({file,bytes:bytes.length,sha256:sha(bytes)});}
  const runtimeBytes=JSON.stringify({files}),runtimeManifest=path.join(runtime,'deployment-manifest.json');await fs.writeFile(runtimeManifest,runtimeBytes);
  const baseline={readerVersion:1,fetchedAt:'2026-10-08T00:00:00.000Z',rows:rows()},rawBytes=JSON.stringify(baseline),p=packet(baseline.rows);p.baselineSha256=sha(rawBytes);const patchBytes=JSON.stringify(p);
  const manifest={schemaVersion,releaseId,projectionVersion:R.VERSION,baseline:{path:'raw.json',sha256:sha(rawBytes)},repairs:{path:'repairs.json',sha256:sha(patchBytes)},identityReviewsSha256:files.find(f=>f.file==='expert/identity-reviews.cjs').sha256,enrichmentsSha256:files.find(f=>f.file==='expert/enrichments.cjs').sha256,runtimeManifestSha256:sha(runtimeBytes)};
  const cache=require('./cache-release.cjs'),cacheBytes=JSON.stringify({schemaVersion:2,releaseId,corpusVersion:'expert-corpus-fixture',model:cache.MODEL,dtype:'q8',dimensions:384,count:1,fingerprint:'f'.repeat(64),cacheFiles:cache.CACHE_FILES.map(file=>({file,bytes:1,sha256:'a'.repeat(64)})),modelFiles:cache.MODEL_FILES.map(file=>({file,bytes:1,sha256:'b'.repeat(64)})),practiceFile:{file:cache.PRACTICE_FILE,bytes:1,sha256:'c'.repeat(64)}});manifest.cacheManifest={path:'cache-manifest.json',sha256:sha(cacheBytes)};await fs.writeFile(path.join(dir,'cache-manifest.json'),cacheBytes);
  const inference=require('./inference-runtime.cjs'),runtimeIdentity=inference.runtimeIdentity(),native=`onnxruntime-node/bin/napi-v6/${runtimeIdentity.platform}/${runtimeIdentity.arch}/onnxruntime_binding.node`,dependencyFiles=[...inference.REQUIRED,native,...(runtimeIdentity.platform==='linux'?[`onnxruntime-node/bin/napi-v6/linux/${runtimeIdentity.arch}/libonnxruntime.so.1`]:[])].sort().map(file=>({file,bytes:1,sha256:'d'.repeat(64)}));
  const dependencies=JSON.stringify({schemaVersion:1,format:inference.SCHEMA,runtime:runtimeIdentity,executable:{bytes:1,sha256:'e'.repeat(64)},lockfileSha256:files.find(f=>f.file==='package-lock.json').sha256,files:dependencyFiles,filesSha256:sha(JSON.stringify(dependencyFiles)),excludedDirectories:['.bin']});manifest.runtimeDependencyManifest={path:'inference-runtime.json',sha256:sha(dependencies)};await fs.writeFile(path.join(dir,'inference-runtime.json'),dependencies);
  const file=path.join(dir,'manifest.json'),save=()=>fs.writeFile(file,JSON.stringify(manifest));await fs.writeFile(path.join(dir,'raw.json'),rawBytes);await fs.writeFile(path.join(dir,'repairs.json'),patchBytes);await save();return {dir,runtime,runtimeManifest,manifest,file,save,cacheDir:path.join(dir,'cache',releaseId),load:require(path.join(runtime,'expert','releases.cjs')).loadDataRelease};
}
test('version-two releases require all runtime pins and verify the exact runtime before reading data',async t=>{
  const p=await releaseFixture(t),loaded=await p.load(p.file,{cacheDir:p.cacheDir});assert.equal(loaded.dataRelease.suppressedFields,1);assert.equal(loaded.dataRelease.runtimeManifestSha256,p.manifest.runtimeManifestSha256);
  for(const key of ['identityReviewsSha256','enrichmentsSha256','runtimeManifestSha256']){const saved=p.manifest[key];delete p.manifest[key];await p.save();await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),/required runtime pins/);p.manifest[key]=saved;}
  await p.save();await fs.appendFile(path.join(p.runtime,'expert','profile.cjs'),'\n// altered build');await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),/runtime deployment artifact checksum mismatch/);
});
test('strict runtime rejects a mismatched manifest pin even when its internal artifact hashes are valid',async t=>{
  const p=await releaseFixture(t),beforeStrict=process.env.EXPERT_RELEASE_STRICT,beforeHash=process.env.EXPERT_DATA_RELEASE_SHA256;t.after(()=>{if(beforeStrict===undefined)delete process.env.EXPERT_RELEASE_STRICT;else process.env.EXPERT_RELEASE_STRICT=beforeStrict;if(beforeHash===undefined)delete process.env.EXPERT_DATA_RELEASE_SHA256;else process.env.EXPERT_DATA_RELEASE_SHA256=beforeHash;});process.env.EXPERT_RELEASE_STRICT='1';process.env.EXPERT_DATA_RELEASE_SHA256='f'.repeat(64);
  await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),/configured manifest checksum mismatch/);process.env.EXPERT_DATA_RELEASE_SHA256=sha(await fs.readFile(p.file));assert.equal((await p.load(p.file,{cacheDir:p.cacheDir})).dataRelease.releaseId,releaseId);
  const pinned=p.manifest.runtimeDependencyManifest;delete p.manifest.runtimeDependencyManifest;await p.save();process.env.EXPERT_DATA_RELEASE_SHA256=sha(await fs.readFile(p.file));await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),/installed runtime dependencies are required/);p.manifest.runtimeDependencyManifest=pinned;await p.save();process.env.EXPERT_DATA_RELEASE_SHA256=sha(await fs.readFile(p.file));await fs.appendFile(path.join(p.dir,'inference-runtime.json'),' ');await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),/artifact checksum mismatch/);
});
test('missing and corrupt package or runtime artifacts fail without fetching a substitute dataset',async t=>{
  const p=await releaseFixture(t),originalFetch=global.fetch;let fetched=0;global.fetch=async()=>{fetched++;throw Error('Unexpected network');};t.after(()=>{global.fetch=originalFetch;});
  await assert.rejects(p.load(path.join(p.dir,'missing.json'),{cacheDir:p.cacheDir}));await fs.rename(path.join(p.dir,'raw.json'),path.join(p.dir,'raw.saved'));await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}));await fs.rename(path.join(p.dir,'raw.saved'),path.join(p.dir,'raw.json'));await fs.appendFile(path.join(p.dir,'repairs.json'),' ');await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),/artifact checksum mismatch/);assert.equal(fetched,0);
});
test('runtime manifests cannot omit a required module, duplicate an artifact or point outside their build',async t=>{
  const p=await releaseFixture(t),original=JSON.parse(await fs.readFile(p.runtimeManifest,'utf8'));
  for(const edit of [r=>r.files=r.files.filter(f=>f.file!=='expert/search.cjs'),r=>r.files.push({...r.files[0]}),r=>r.files[0].file='../releases.cjs']){const runtime=structuredClone(original);edit(runtime);const bytes=JSON.stringify(runtime);await fs.writeFile(p.runtimeManifest,bytes);p.manifest.runtimeManifestSha256=sha(bytes);await p.save();await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),/omits required runtime|invalid deployment artifact|inside the release package/);}
});
test('mixed provider headings remain neutral and never turn treatment or research listings into performed activity',()=>{
  const raw=rows(),p=packet(raw),provenance={sourceUrl:null,sourceLabel:'Stored provider profile',sourceDate:null,observedAt:null,snapshotSha256:'b'.repeat(64),parserVersion:'source-fixture-v2',reviewId:'semantic-review',sourceField:'provider section'};
  p.patches=[{sourceRecordId:'source-one',field:'professional_context',approved:true,beforeHash:R.hashValue(null),value:[
    {kind:'treatment-listing',text:'Giant cell arteritis',provenance},
    {kind:'professional-body',text:'GMC 7000001; British Society of Example Medicine',provenance},
    {kind:'academic-background',text:'MD; teaching and research roles',provenance},
    {kind:'research-background',text:'Research interests include cardiac CT. Publications are listed on the original profile.',provenance},
    {kind:'qualification',text:'Speech and Language Therapy BSc (Hons)',provenance},
  ]}];
  const repaired=apply(raw,p),corpus=require('./data.cjs').buildCorpus(repaired.rows),candidate=corpus.candidates.find(c=>c.sourceRecordIds.includes('source-one')),owned=corpus.passages.filter(x=>x.candidateId===candidate.id),profile=require('./profile.cjs').buildProfile(candidate,owned,{corpusVersion:corpus.version});
  for(const kind of ['professional-body','academic-background','research-background'])assert.ok(owned.filter(x=>x.field==='professional_context.'+kind).every(x=>x.type==='professional-background'));
  const treatment=owned.find(x=>x.field==='professional_context.treatment-listing');assert.equal(treatment.type,'treatment-listing');assert.ok(treatment.qualifiers.includes('listed-treatment-not-performed-activity'));
  const {matrixFor}=require('./search.cjs'),{blankBrief}=require('./brief.cjs');
  const requested={...blankBrief(),requirements:[{id:'explicit-activity',kind:'activity',label:'Giant cell arteritis',text:'Giant cell arteritis',matchIntent:'activity',importance:'essential'}]};assert.notEqual(matrixFor(candidate,owned,requested)[0].status,'documented');
  assert.ok(JSON.stringify(profile).includes('Speech and Language Therapy BSc (Hons)'));assert.ok(JSON.stringify(profile).includes('profile-reported-research-not-verified-authorship'));
});
test('long source-ordered research background retains the tail and neutral provenance beyond profile display limits',()=>{
  const raw=rows(),p=packet(raw),lines=Array.from({length:90},(_,i)=>`Publication reference ${i+1}: a source-listed study about the clinical topic, journal year ${1990+i}, with its original context and authors as recorded.`),text='Research information reported on this profile.\n'+lines.join('\n');
  p.patches=[{sourceRecordId:'source-one',field:'professional_context',approved:true,beforeHash:R.hashValue(null),value:[{kind:'research-background',text,provenance:{sourceUrl:null,sourceLabel:'Stored provider profile',sourceDate:null,observedAt:null,snapshotSha256:'b'.repeat(64),parserVersion:'fixture',reviewId:'complete-block',sourceField:'Research'}}]}];
  const corpus=require('./data.cjs').buildCorpus(apply(raw,p).rows),candidate=corpus.candidates.find(c=>c.sourceRecordIds.includes('source-one')),passages=corpus.passages.filter(x=>x.candidateId===candidate.id&&x.field==='professional_context.research-background');
  assert.ok(passages.length>10);assert.ok(passages.some(x=>x.text.includes('Publication reference 90:')));assert.ok(passages.every(x=>x.type==='professional-background'&&x.qualifiers.includes('profile-reported-research-not-verified-authorship')&&x.sourceRecordId==='source-one'));
  const profile=require('./profile.cjs').buildProfile(candidate,corpus.passages,{corpusVersion:corpus.version,dataReleaseId:releaseId});assert.equal(profile.counts.research,passages.length);assert.equal(profile.truncated,true);assert.ok(profile.research.length<passages.length);assert.match(profile.sourceUrl,/dataReleaseId=enriched-test/);
});
test('runtime pins cover indirect modules, model selection, both catalogues and all browser assets',async t=>{
  const p=await releaseFixture(t),original=JSON.parse(await fs.readFile(p.runtimeManifest,'utf8'));
  for(const missing of ['package.json','package-lock.json','Dockerfile','expert/entrypoint.sh','expert/practice-cache.cjs','expert/brief-context.cjs','expert/clarifications.cjs','expert/device-context-set.cjs','demo/models.cjs','expert/data/emdn-2026.json','expert/data/mdr-2017-2185.json','expert/public/app.js','expert/public/projects.js','expert/public/evidence.js','expert/public/source-reader.js','expert/public/index.html','expert/public/styles.css','public/fonts/inter-variable.ttf','public/fonts/OFL-Inter.txt','public/brand/docmap-logo.jpg']){
    const runtime={...original,files:original.files.filter(f=>f.file!==missing)},bytes=JSON.stringify(runtime);await fs.writeFile(p.runtimeManifest,bytes);p.manifest.runtimeManifestSha256=sha(bytes);await p.save();await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),error=>error.message.includes('omits required runtime: '+missing));
  }
});
test('non-strict legacy manifests without runtime pins remain readable without rewriting their artifacts',async t=>{
  const p=await releaseFixture(t,{schemaVersion:1});
  delete p.manifest.runtimeManifestSha256;await p.save();
  const before=await fs.readFile(p.file),loaded=await p.load(p.file,{cacheDir:p.cacheDir});
  assert.equal(loaded.dataRelease.releaseId,releaseId);assert.deepEqual(await fs.readFile(p.file),before);
});
test('runtime manifest and descriptor metadata must have the expected types and no hidden keys',async t=>{
  const p=await releaseFixture(t),original=JSON.parse(await fs.readFile(p.runtimeManifest,'utf8'));
  for(const edit of [r=>r.createdAt='yesterday',r=>r.ignored=true,r=>r.files[0].file={path:'expert/server.cjs'},r=>r.files[0].bytes='500',r=>r.files[0].bytes=-1,r=>r.files[0].bytes++,r=>r.files[0].unchecked=true]){const runtime=structuredClone(original);edit(runtime);const bytes=JSON.stringify(runtime);await fs.writeFile(p.runtimeManifest,bytes);p.manifest.runtimeManifestSha256=sha(bytes);await p.save();await assert.rejects(p.load(p.file,{cacheDir:p.cacheDir}),/deployment manifest|deployment artifact/);}
});
test('legacy version-one release packets remain readable with their historical projection',()=>{
  const raw=rows(),p=packet(raw);p.schemaVersion=1;delete p.suppressions;const loaded=apply(raw,p);assert.equal(loaded.summary.patches,0);assert.equal(loaded.rows[0].about,raw[0].about);assert.equal(loaded.summary.mandatoryHolds.length,R.MANDATORY_HOLDS.length);
});
