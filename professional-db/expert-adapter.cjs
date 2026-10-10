'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),R=require('./reader.cjs');
async function prepareDatabaseExpert({db,pin,cacheDir,modelDir,runtimeRoot,staging=false,onProgress=()=>{}}){
  if(!path.isAbsolute(cacheDir||'')||path.basename(cacheDir)!==pin.releaseId||!path.isAbsolute(modelDir||''))throw Error('Dedicated release cache and verified model directory required');
  const r=await R.release(db,pin,{staging});
  if(!r.manifest.cacheManifest||!r.manifest.runtimeDependencyManifest)throw Error('Complete cache and inference runtime descriptors required');
  // The already-verified immutable package contains descriptors, not DB credentials.
  const root=path.dirname(r.binding.manifestPath),U=require('./util.cjs');
  await U.verify(U.inside(root,r.manifest.cacheManifest.path),r.manifest.cacheManifest.sha256);
  await U.verify(U.inside(root,r.manifest.runtimeDependencyManifest.path),r.manifest.runtimeDependencyManifest.sha256);
  if(!path.isAbsolute(runtimeRoot||''))throw Error('Exact immutable runtime directory required');
  await U.verify(path.join(runtimeRoot,'deployment-manifest.json'),r.manifest.runtimeManifestSha256);
  const runtimeManifest=await U.json(path.join(runtimeRoot,'deployment-manifest.json'));for(const f of runtimeManifest.files)await U.verify(U.inside(runtimeRoot,f.file),f.sha256);
  const cache=require(path.join(runtimeRoot,'expert/cache-release.cjs')),runtime=require(path.join(runtimeRoot,'expert/inference-runtime.cjs'));
  const receipt=runtime.validateReceipt(JSON.parse(await fs.readFile(U.inside(root,r.manifest.runtimeDependencyManifest.path),'utf8')));
  await runtime.verifyReceipt(receipt,runtimeRoot,{strict:true});
  // Reject a missing/incompatible inference runtime before loading a large
  // corpus or allocating retrieval state. Readiness must fail at the gate.
  const loaded=await R.loadCorpus(db,pin,{staging}),corpus=loaded.corpus;
  const verifiedCache=await cache.verifyPreparedCache(JSON.parse(await fs.readFile(U.inside(root,r.manifest.cacheManifest.path),'utf8')),{cacheDir,modelDir,releaseId:pin.releaseId,corpusVersion:corpus.version});
  const {ExpertSearchEngine}=require(path.join(runtimeRoot,'expert/search.cjs')),engine=new ExpertSearchEngine({cacheDir,onProgress});
  engine.dataRelease={...loaded.dataRelease,projectionVersion:r.projection_version};engine.corpus=corpus;engine.verifiedCache=verifiedCache;
  engine.publicCounts={sourceRows:r.counts.records,identityGroups:corpus.candidates.length,heldForIdentityReview:corpus.audit.heldForIdentityReview,indexedCandidates:corpus.audit.searchableCandidates,indexedPassages:corpus.passages.length};
  if(!verifiedCache.practiceSnapshot)throw Error('Pinned geography snapshot is missing');
  engine.publicCounts.geographicCoverage=require(path.join(runtimeRoot,'expert/practice-cache.cjs')).applyPracticeSnapshot(corpus,verifiedCache.practiceSnapshot,{releaseId:pin.releaseId});
  delete engine.verifiedCache.practiceSnapshot;
  engine.embedQuery=cache.createVerifiedEmbedder(modelDir);
  await engine.init(corpus);
  // Ready caches alone must not conceal a missing query embedder.
  await runtime.warmQueryModel(engine.embedQuery);
  engine.ready=true;engine.status='Ready';return engine;
}
module.exports={prepareDatabaseExpert};
