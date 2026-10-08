'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {VERSION,MANDATORY_HOLDS,hashValue,applyRepairs,loadDataRelease}=require('./releases.cjs');
const digest=v=>createHash('sha256').update(v).digest('hex');
const baselineSha256='a'.repeat(64),releaseId='test-r1';
const provenance={sourceUrl:'https://www.finder.bupa.co.uk/Consultant/view/12345/',sourceLabel:'Bupa Finder',sourceDate:null,observedAt:null,snapshotSha256:'b'.repeat(64),parserVersion:'fixture-parser-v1',reviewId:'automated-source-comparison-1'};
const fixture=()=>[
 {id:'bupa_1',name:'Dr Alex Example',gmc_number:'7654321',specialty:'Radiology',clinical_interests:'cardiac; CT',about:'I report cardiac CT.',profile_urls:{bupa:null}},
 ...MANDATORY_HOLDS.map((id,i)=>({id,name:'Dr Pending '+['One','Two','Three'][i],gmc_number:String(7654322+i),about:'I perform ultrasound.'})),
 {id:'excluded',name:'Dr Excluded Example',gmc_number:'7654327',about:'I perform ultrasound.',do_not_recommend:true},
 {id:'review',name:'Dr Review Example',gmc_number:'7654328',about:'I perform ultrasound.',requires_review:true}
];
function packet(rows=fixture()){return {schemaVersion:1,releaseId,baselineSha256,patches:[{sourceRecordId:'bupa_1',field:'clinical_interests',beforeHash:hashValue(rows[0].clinical_interests),value:['Cardiac CT','Cardiac MRI'],provenance:{...provenance},approved:true}],holds:MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Unresolved source identity conflict'}))};}
const apply=(rows,p)=>applyRepairs(rows,p,{releaseId,baselineSha256});
test('approved repairs preserve baseline identity and holds while binding evidence provenance',()=>{
 const rows=fixture(),before=structuredClone(rows),result=apply(rows,packet(rows));assert.deepEqual(rows,before);
 assert.deepEqual(result.rows[0].profile_urls,{bupa:null});assert.equal(result.rows[0].gmc_number,'7654321');
 assert.equal(result.rows[0].clinical_interests[0].text,'Cardiac CT');assert.equal(result.rows[0].clinical_interests[0].sourceUrl,provenance.sourceUrl);
 assert.equal(result.rows[0].clinical_interests[0].repairProvenance.beforeHash,hashValue(before[0].clinical_interests));
 assert.equal(result.rows[0].clinical_interests[0].verified,undefined);
 for(const id of MANDATORY_HOLDS)assert.equal(result.rows.find(r=>r.id===id).requires_review,true);
 assert.equal(result.rows.find(r=>r.id==='excluded').do_not_recommend,true);assert.equal(result.rows.find(r=>r.id==='review').requires_review,true);
 const {buildCorpus}=require('./data.cjs'),corpus=buildCorpus(result.rows);
 assert.equal(corpus.candidates.find(c=>c.sourceRecordIds.includes('bupa_1')).id,'expert-gmc-7654321');
 assert.equal(corpus.passages.some(p=>MANDATORY_HOLDS.includes(p.sourceRecordId)||['excluded','review'].includes(p.sourceRecordId)),false);
 const repaired=corpus.passages.find(p=>p.field==='clinical_interests');assert.equal(repaired.attribution,'linked-source');assert.equal(repaired.repairProvenance.releaseId,releaseId);
});
test('R0 accepts empty patches and still requires all three explicit identity holds',()=>{const p=packet();p.patches=[];assert.equal(apply(fixture(),p).summary.patches,0);p.holds.pop();assert.throws(()=>apply(fixture(),p),/mandatory identity holds/);});
test('newly confirmed mixed-source row and every row in its identity group are withheld',()=>{
 const rows=fixture(),mixed=rows.find(row=>row.id==='bupa_22318');mixed.clinical_interests='Recorded osteopathy interests';mixed.specialty='Ophthalmology';rows.push({id:'linked-provider-row',name:mixed.name,gmc_number:mixed.gmc_number,about:'Recorded eye surgery practice.'});const p=packet(rows);p.patches=[];
 const corpus=require('./data.cjs').buildCorpus(apply(rows,p).rows),group=corpus.candidates.find(c=>c.sourceRecordIds.includes('bupa_22318'));assert.equal(group.needsIdentityReview,true);assert.deepEqual(new Set(group.sourceRecordIds),new Set(['bupa_22318','linked-provider-row']));assert.equal(group.evidenceIds.length,0);assert.equal(corpus.passages.some(p=>p.candidateId===group.id),false);
});
test('protected fields, unknown rows, stale before hashes and duplicate patches fail closed',()=>{
 for(const mutate of [p=>p.patches[0].field='profile_urls',p=>p.patches[0].field='gmc_number',p=>p.patches[0].sourceRecordId='missing',p=>p.patches[0].beforeHash='c'.repeat(64),p=>p.patches[0].approved=false,p=>p.patches.push(structuredClone(p.patches[0])),p=>p.patches[0].extra='ignored',p=>p.holds.push({...p.holds[0]})]){const p=packet();mutate(p);assert.throws(()=>apply(fixture(),p),/Invalid expert data release/);}
 const rows=fixture();rows.push({...rows[0]});assert.throws(()=>apply(rows,packet()),/duplicate baseline identity/);
});
test('every approved field requires bounded source and snapshot provenance',()=>{
 for(const mutate of [p=>delete p.patches[0].provenance.reviewId,p=>p.patches[0].provenance.sourceUrl='javascript:alert(1)',p=>p.patches[0].provenance.sourceUrl='https://user:pass@example.org/',p=>p.patches[0].provenance.snapshotSha256='not-a-digest',p=>p.patches[0].provenance.observedAt='yesterday',p=>p.patches[0].value=[{text:'unapproved shape'}],p=>p.patches[0].value='x'.repeat(100001),p=>p.patches[0].provenance.localPath='D:/private/source.html']){const p=packet();mutate(p);assert.throws(()=>apply(fixture(),p),/Invalid expert data release/);}
});
test('approved patches cannot silently erase populated evidence or add unapproved blanket identity holds',()=>{
 for(const value of ['', '   ', [], [''], ['Cardiac CT','\n']]){const p=packet();p.patches[0].value=value;assert.throws(()=>apply(fixture(),p),/empty replacement text/);}
 const p=packet();p.holds.push({sourceRecordId:'bupa_1',reason:'Historical URL proposal conflict'});assert.throws(()=>apply(fixture(),p),/unapproved or duplicate hold/);
});
test('professional context is source-bound metadata and cannot mutate identity or declare performed practice',()=>{
 const p=packet();p.patches=[{sourceRecordId:'bupa_1',field:'professional_context',beforeHash:hashValue(null),approved:true,value:[{kind:'condition',text:'Listed condition: atrial fibrillation',provenance:{...provenance,sourceField:'conditions'}}]}];
 const r=apply(fixture(),p).rows[0];assert.equal(r.professional_context[0].kind,'condition');assert.equal(r.specialty,'Radiology');assert.equal(r.professional_context[0].repairProvenance.releaseId,releaseId);
 assert.equal(r.professional_context[0].repairProvenance.originalSourceField,'conditions');p.patches[0].value[0].provenance.sourceField='x'.repeat(161);assert.throws(()=>apply(fixture(),p),/original source field/);p.patches[0].value[0].provenance.sourceField='conditions';
 p.patches[0].value[0].kind='clinical-practice';assert.throws(()=>apply(fixture(),p),/context kind/);
});
test('duplicate context corrections and duplicate context items fail instead of inflating evidence',()=>{
 const p=packet();p.patches=[{sourceRecordId:'bupa_1',field:'professional_context',beforeHash:hashValue(null),approved:true,value:[{kind:'language',text:'English',provenance:{...provenance}}]}];
 p.patches.push(structuredClone(p.patches[0]));assert.throws(()=>apply(fixture(),p),/duplicate field patch/);p.patches.pop();
 p.patches[0].value.push(structuredClone(p.patches[0].value[0]));assert.throws(()=>apply(fixture(),p),/duplicate professional context item/);
 p.patches[0].value=[];assert.throws(()=>apply(fixture(),p),/invalid professional context/);
});
test('canonical before hashes are stable across object order and explicitly treat missing as null',()=>{assert.equal(hashValue({b:2,a:1}),hashValue({a:1,b:2}));assert.equal(hashValue(undefined),hashValue(null));assert.throws(()=>hashValue(Infinity),/non-finite/);});
async function packageFixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'docmap-release-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const raw={rows:fixture(),readerVersion:1,fetchedAt:'2000-01-01T00:00:00.000Z'},rawBytes=JSON.stringify(raw),p=packet(raw.rows);p.baselineSha256=digest(rawBytes);
 const patchBytes=JSON.stringify(p),manifest={schemaVersion:1,releaseId,projectionVersion:VERSION,baseline:{path:'raw.json',sha256:digest(rawBytes)},repairs:{path:'repairs.json',sha256:digest(patchBytes)}};
 await fs.writeFile(path.join(dir,'raw.json'),rawBytes);await fs.writeFile(path.join(dir,'repairs.json'),patchBytes);
 const file=path.join(dir,'manifest.json'),save=()=>fs.writeFile(file,JSON.stringify(manifest));await save();return {dir,file,manifest,save,cacheDir:path.join(dir,'cache',releaseId)};
}
test('pinned release bypasses expired cache and forced refresh without a network call',async t=>{
 const p=await packageFixture(t),old={release:process.env.EXPERT_DATA_RELEASE,cache:process.env.EXPERT_CACHE_DIR,refresh:process.env.EXPERT_REFRESH_DATA},originalFetch=global.fetch;let fetched=0;
 t.after(()=>{for(const [key,value]of [['EXPERT_DATA_RELEASE',old.release],['EXPERT_CACHE_DIR',old.cache],['EXPERT_REFRESH_DATA',old.refresh]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}global.fetch=originalFetch;});
 process.env.EXPERT_DATA_RELEASE=p.file;process.env.EXPERT_CACHE_DIR=p.cacheDir;process.env.EXPERT_REFRESH_DATA='1';global.fetch=async()=>{fetched++;throw Error('Unexpected network');};
 const {loadRows,fetchRows}=require('./reader.cjs'),loaded=await loadRows();assert.equal(loaded.dataRelease.releaseId,releaseId);assert.equal(loaded.fetchedAt,'2000-01-01T00:00:00.000Z');assert.equal(fetched,0);
 await assert.rejects(fetchRows(),/cannot fetch live/);await fs.writeFile(path.join(p.dir,'repairs.json'),'{}');await assert.rejects(loadRows(),/checksum mismatch/);process.env.EXPERT_DATA_RELEASE='';await assert.rejects(loadRows(),/absolute manifest path/);assert.equal(fetched,0);
});
test('artifact corruption, path traversal, duplicate paths and cache cross-use fail closed',async t=>{
 const p=await packageFixture(t);await assert.rejects(loadDataRelease(p.file,{cacheDir:path.join(p.dir,'cache','different-release')}),/end with the release ID/);
 p.manifest.baseline.path='../raw.json';await p.save();await assert.rejects(loadDataRelease(p.file,{cacheDir:p.cacheDir}),/inside the release package/);
 p.manifest.baseline.path='repairs.json';await p.save();await assert.rejects(loadDataRelease(p.file,{cacheDir:p.cacheDir}),/duplicate artifact paths/);
 p.manifest.baseline.path='raw.json';await p.save();await fs.appendFile(path.join(p.dir,'raw.json'),' ');await assert.rejects(loadDataRelease(p.file,{cacheDir:p.cacheDir}),/checksum mismatch/);
});
test('symlink or junction artifacts cannot escape the package even with matching hashes',async t=>{
 const p=await packageFixture(t),target=path.join(p.dir,'actual');await fs.mkdir(target);await fs.copyFile(path.join(p.dir,'raw.json'),path.join(target,'raw.json'));
 try{await fs.symlink(target,path.join(p.dir,'linked'),process.platform==='win32'?'junction':'dir');}catch(e){if(['EPERM','EACCES'].includes(e.code)){t.skip('Host does not allow symlink creation');return;}throw e;}
 p.manifest.baseline.path='linked/raw.json';await p.save();await assert.rejects(loadDataRelease(p.file,{cacheDir:p.cacheDir}),/symlink paths/);
});

test('runtime identity pins, projection versions and baseline schema mismatches fail closed',async t=>{
 const p=await packageFixture(t);
 for(const key of ['identityReviewsSha256','enrichmentsSha256']){
  p.manifest[key]='f'.repeat(64);await p.save();await assert.rejects(loadDataRelease(p.file,{cacheDir:p.cacheDir}),/runtime identity evidence checksum mismatch/);delete p.manifest[key];
 }
 for(const [key,value] of [['schemaVersion',2],['projectionVersion','unapproved-projection']]){
  const before=p.manifest[key];p.manifest[key]=value;await p.save();await assert.rejects(loadDataRelease(p.file,{cacheDir:p.cacheDir}),/unsupported manifest version/);p.manifest[key]=before;
 }
 const rawPath=path.join(p.dir,'raw.json'),raw=JSON.parse(await fs.readFile(rawPath,'utf8'));raw.readerVersion=2;const bytes=JSON.stringify(raw);await fs.writeFile(rawPath,bytes);p.manifest.baseline.sha256=digest(bytes);await p.save();
 await assert.rejects(loadDataRelease(p.file,{cacheDir:p.cacheDir}),/invalid frozen professional baseline/);
});
