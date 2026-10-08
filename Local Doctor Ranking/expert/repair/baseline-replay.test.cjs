'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {validateFrozenCode}=require('./package-release.cjs'),{compareRows,compareIdentity}=require('./baseline-replay.cjs');
const {readCandidates}=require('./corpus-candidates.cjs');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
test('frozen code checks accept only line-ending equivalence for the committed data projection',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'expert-code-proof-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const baseline=path.join(root,'baseline'),code=path.join(root,'code');await fs.mkdir(baseline);await fs.mkdir(path.join(code,'expert'),{recursive:true});const frozen={codeCommit:'fixture',files:[]};
 for(const name of ['identity-reviews.cjs','enrichments.cjs','data.cjs']){const source=name==='data.cjs'?Buffer.from("'use strict';\nmodule.exports={};\n"):await fs.readFile(path.join(__dirname,'..',name));await fs.writeFile(path.join(baseline,name),source);await fs.writeFile(path.join(code,'expert',name),name==='data.cjs'?source.toString().replace(/\n/g,'\r\n'):source);frozen.files.push({name,sha256:digest(source)});}
 const proof=await validateFrozenCode(baseline,code,frozen);assert.equal(proof.files['data.cjs'].byteIdentical,false);assert.equal(proof.files['data.cjs'].normalizedLineEndingsEqual,true);
 await fs.appendFile(path.join(code,'expert','data.cjs'),'// unexpected code change');await assert.rejects(validateFrozenCode(baseline,code,frozen),/differs from committed baseline/);
});
test('professional row comparison ignores wrapper fetch metadata but detects field changes and removed IDs',()=>{
 const result=compareRows(new Map([['a','unchanged'],['b','new']]),new Map([['a','unchanged'],['b','old'],['c','removed']]));assert.equal(result.equalRows,1);assert.equal(result.changedOrMissingRows,2);assert.deepEqual(result.changedOrMissingIdSample,['b','c']);
});
function summary(held=false){const groups=new Map([['a',{id:'a',sourceRecordIds:['bupa_6445','linked'],held,passages:held?0:1}],['b',{id:'b',sourceRecordIds:['bupa_26882'],held,passages:held?0:1}],['c',{id:'c',sourceRecordIds:['previous-hold'],held:true,passages:0}],['d',{id:'d',sourceRecordIds:['bupa_22318'],held,passages:held?0:1}]]);return {groups,bySource:new Map([...groups.values()].flatMap(c=>c.sourceRecordIds.map(id=>[id,c.id])))};}
test('identity replay accepts mandatory whole-group holds and rejects released holds or remapped rows',()=>{
 const baseline=summary(),repaired=summary(true);assert.equal(compareIdentity(baseline,repaired).passed,true);assert.equal(compareIdentity(baseline,repaired).mandatoryGroups[0].groupRows,2);
 repaired.groups.get('c').held=false;assert.equal(compareIdentity(baseline,repaired).passed,false);repaired.groups.get('c').held=true;repaired.bySource.set('linked','b');assert.equal(compareIdentity(baseline,repaired).passed,false);
});
test('reused baseline candidate scan preserves Unicode and rejects changed bytes, length and version',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'expert-candidate-scan-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'corpus.json'),candidates=[{id:'fixture',name:'Dr Éxample',sourceRecordIds:['fixture-row'],evidenceIds:['e1'],needsIdentityReview:false,identityIssues:[]}],bytes=JSON.stringify({candidates,passages:[{text:'x'.repeat(150000)}],audit:{},identityLedger:[],version:'fixture-v1'});await fs.writeFile(file,bytes);const descriptor={sha256:digest(bytes),bytes:Buffer.byteLength(bytes),version:'fixture-v1'};
 assert.deepEqual((await readCandidates(file,descriptor)).candidates,candidates);for(const bad of [{...descriptor,sha256:'a'.repeat(64)},{...descriptor,bytes:1},{...descriptor,version:'wrong'}])await assert.rejects(readCandidates(file,bad),/checksum, length or version/);
});
