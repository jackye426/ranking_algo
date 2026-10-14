'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {loadRows,fetchRows}=require('./reader.cjs');
async function fixture(t,{strict='1',release}={}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'docmap-reader-release-'));
  const variables=['EXPERT_RELEASE_STRICT','EXPERT_DATA_RELEASE','EXPERT_CACHE_DIR','EXPERT_REFRESH_DATA','EXPERT_SOURCE_MAX_AGE_HOURS'];
  const before=Object.fromEntries(variables.map(key=>[key,process.env[key]])),oldFetch=global.fetch;
  let fetchCalls=0;global.fetch=async()=>{fetchCalls++;throw Error('Network must not be used by this fixture');};
  for(const key of variables)delete process.env[key];
  if(strict!==undefined)process.env.EXPERT_RELEASE_STRICT=strict;
  if(release!==undefined)process.env.EXPERT_DATA_RELEASE=release;
  process.env.EXPERT_CACHE_DIR=directory;
  const data={readerVersion:1,fetchedAt:new Date().toISOString(),rows:[{id:'fictional-cached-professional'}]};
  await fs.writeFile(path.join(directory,'raw.json'),JSON.stringify(data));
  t.after(async()=>{
    global.fetch=oldFetch;
    for(const key of variables){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));
    assert.ok(path.basename(directory).startsWith('docmap-reader-release-'));
    await fs.rm(directory,{recursive:true,force:true});
  });
  return {directory,data,fetchCalls:()=>fetchCalls};
}
for(const [label,release]of [['missing',undefined],['empty',''],['relative','releases/manifest.json']])test('strict mode rejects a '+label+' release path before cache or network access',async t=>{
  const f=await fixture(t,{release});
  await assert.rejects(loadRows(),/Strict expert release mode requires an absolute EXPERT_DATA_RELEASE path/);
  await assert.rejects(fetchRows(),/Strict expert release mode requires an absolute EXPERT_DATA_RELEASE path/);
  assert.equal(f.fetchCalls(),0);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.directory,'raw.json'),'utf8')),f.data);
});
test('a missing pinned manifest never falls through to a fresh mutable cache',async t=>{
  const f=await fixture(t);process.env.EXPERT_DATA_RELEASE=path.join(f.directory,'missing-manifest.json');
  await assert.rejects(loadRows(),/ENOENT/);
  await assert.rejects(fetchRows(),/Pinned expert releases cannot fetch live source rows/);
  assert.equal(f.fetchCalls(),0);
});
test('non-strict legacy mode retains its existing cache behavior',async t=>{
  const f=await fixture(t,{strict:'0'});assert.deepEqual(await loadRows(),f.data);assert.equal(f.fetchCalls(),0);
});
test('an explicit pinned path forbids direct live reads even outside strict mode',async t=>{
  const f=await fixture(t,{strict:'0',release:path.resolve('fictional-manifest.json')});
  await assert.rejects(fetchRows(),/Pinned expert releases cannot fetch live source rows/);assert.equal(f.fetchCalls(),0);
});
