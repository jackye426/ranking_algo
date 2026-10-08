'use strict';
// Pure corpus replay and local backup restoration; no servers, models or DB calls.
const fs=require('node:fs/promises'),syncFs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {hashValue,loadDataRelease,MANDATORY_HOLDS}=require('../releases.cjs');
const {validateFrozenCode}=require('./package-release.cjs');
const {readCandidates}=require('./corpus-candidates.cjs');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const flag=value=>value===true||value===1||value==='true';
async function fileHash(file){const hash=crypto.createHash('sha256');for await(const chunk of syncFs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function exportCorpus(corpus,file){
 const handle=await fs.open(file,'wx');
 try{await handle.write('{');let firstKey=true;for(const [key,value] of Object.entries(corpus)){await handle.write((firstKey?'':',')+JSON.stringify(key)+':');firstKey=false;if(Array.isArray(value)){await handle.write('[');for(let i=0;i<value.length;i+=1000){const batch=value.slice(i,i+1000).map(item=>JSON.stringify(item)).join(',');await handle.write((i?',':'')+batch);}await handle.write(']');}else await handle.write(JSON.stringify(value));}await handle.write('}');}finally{await handle.close();}
 return {file:path.basename(file),sha256:await fileHash(file),bytes:(await fs.stat(file)).size};
}
function rowMap(rows){return new Map(rows.map(row=>[row.id,hashValue(row)]));}
function compareRows(a,b){const keys=[...new Set([...a.keys(),...b.keys()])].sort(),different=keys.filter(k=>a.get(k)!==b.get(k));return {freshRows:a.size,referenceRows:b.size,equalRows:keys.length-different.length,changedOrMissingRows:different.length,changedOrMissingIdSample:different.slice(0,30),fetchedMetadataExcluded:true};}
function summarize(corpus){
 const groups=new Map(corpus.candidates.map(c=>[c.id,{id:c.id,sourceRecordIds:[...c.sourceRecordIds].sort(),held:c.needsIdentityReview,issues:[...c.identityIssues].sort(),passages:c.evidenceIds.length}]));
 const bySource=new Map();for(const c of groups.values())for(const id of c.sourceRecordIds)bySource.set(id,c.id);
 return {version:corpus.version,audit:corpus.audit,groups,bySource};
}
function compareIdentity(baseline,repaired){
 const sourceIds=[...new Set([...baseline.bySource.keys(),...repaired.bySource.keys()])],changedMappings=sourceIds.filter(id=>baseline.bySource.get(id)!==repaired.bySource.get(id));
 const changedGroups=[...baseline.groups.keys()].filter(id=>hashValue(baseline.groups.get(id)?.sourceRecordIds)!==hashValue(repaired.groups.get(id)?.sourceRecordIds));
 const missingGroups=[...baseline.groups.keys()].filter(id=>!repaired.groups.has(id)),extraGroups=[...repaired.groups.keys()].filter(id=>!baseline.groups.has(id));
 const releasedHolds=[...baseline.groups.values()].filter(c=>c.held&&!repaired.groups.get(c.id)?.held).map(c=>c.id);
 const allowedNewGroups=new Set(MANDATORY_HOLDS.map(id=>baseline.bySource.get(id)));
 const newlyHeld=[...repaired.groups.values()].filter(c=>c.held&&!baseline.groups.get(c.id)?.held).map(c=>c.id);
 const unexpectedNewHolds=newlyHeld.filter(id=>!allowedNewGroups.has(id));
 const mandatoryGroups=MANDATORY_HOLDS.map(sourceRecordId=>{const candidateId=repaired.bySource.get(sourceRecordId),c=repaired.groups.get(candidateId);return {sourceRecordId,candidateId,groupRows:c?.sourceRecordIds.length||0,held:c?.held===true,passages:c?.passages??null};});
 return {passed:!changedMappings.length&&!changedGroups.length&&!missingGroups.length&&!extraGroups.length&&!releasedHolds.length&&!unexpectedNewHolds.length&&mandatoryGroups.every(g=>g.held&&g.passages===0),sourceMappingsCompared:sourceIds.length,changedMappings:changedMappings.slice(0,30),changedGroupMembership:changedGroups.slice(0,30),missingGroups:missingGroups.slice(0,30),extraGroups:extraGroups.slice(0,30),baselineHoldsReleased:releasedHolds.slice(0,30),newlyHeldGroups:newlyHeld,unexpectedNewHolds:unexpectedNewHolds.slice(0,30),mandatoryGroups};
}
function contained(root,relative){if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).some(p=>p==='..'||p==='.'||!p))throw Error('Unsafe backup path');const resolved=path.resolve(root,relative);if(!resolved.startsWith(path.resolve(root)+path.sep))throw Error('Backup path escapes root');return resolved;}
async function restoreSample(backupRoot,output){
 const manifestFile=path.join(backupRoot,'backup-manifest.json'),bytes=await fs.readFile(manifestFile),manifest=JSON.parse(bytes);
 const names=['dr_mark_gillett.html','dr_mark_hughes.html','dr_marinos_pericleous.html'],selected=names.map(name=>{const matches=manifest.files.filter(f=>path.basename(f.path)===name);if(matches.length!==1)throw Error('Backup target snapshot missing or ambiguous');return matches[0];});
 const restored=[];await fs.mkdir(output,{recursive:true});
 for(const file of selected){const source=contained(backupRoot,file.path),data=await fs.readFile(source);if(digest(data)!==file.sha256||data.length!==file.bytes)throw Error('Snapshot backup integrity failure');const target=path.join(output,path.basename(file.path));await fs.writeFile(target,data,{flag:'wx'});const sha256=await fileHash(target);if(sha256!==file.sha256)throw Error('Restored snapshot failed rehash');restored.push({snapshot:path.basename(file.path),bytes:file.bytes,sha256,restoredAndRehashed:true});}
 const metadata=manifest.files.filter(f=>/(?:^|[\\/])(?:bupa_latest\.json|profiles_v2\.jsonl)$/.test(f.path));const metadataChecks=[];
 for(const file of metadata){const actual=await fileHash(contained(backupRoot,file.path));if(actual!==file.sha256)throw Error('Source metadata backup integrity failure');metadataChecks.push({source:path.basename(file.path),bytes:file.bytes,sha256:actual,rehashMatches:true});}
 await fs.writeFile(path.join(output,'backup-manifest.json'),bytes,{flag:'wx'});if(await fileHash(path.join(output,'backup-manifest.json'))!==digest(bytes))throw Error('Restored backup manifest failed rehash');
 return {backupManifestSha256:digest(bytes),backupFileCount:manifest.count,backupBytes:manifest.bytes,restoredSnapshots:restored,sourceMetadata:metadataChecks,restoredManifestRehashed:true,sourceDriveRequired:false};
}
async function replay({baselineDir,baselineCode,releaseManifest,reference,backupRoot,output,reuseReport}){
 if([baselineDir,baselineCode,releaseManifest,reference,backupRoot,output].some(p=>!p||!path.isAbsolute(p)))throw Error('All replay paths must be absolute');
 try{if((await fs.readdir(output)).length)throw Error('Replay output must be new or empty');}catch(e){if(e.code!=='ENOENT')throw e;}
 const frozen=JSON.parse(await fs.readFile(path.join(baselineDir,'baseline-manifest.json'),'utf8'));if(await fileHash(path.join(baselineDir,'raw.json'))!==frozen.rawSha256)throw Error('Frozen baseline changed');
 const codeProof=await validateFrozenCode(baselineDir,baselineCode,frozen),timings={},corpusExports={};await fs.mkdir(output,{recursive:true});
 let raw=JSON.parse(await fs.readFile(path.join(baselineDir,'raw.json'),'utf8')),prior=JSON.parse(await fs.readFile(reference,'utf8'));
 const professionalRows=compareRows(rowMap(raw.rows),rowMap(prior.rows)),excluded=raw.rows.filter(r=>flag(r.do_not_recommend)).map(r=>r.id);prior=null;
 let corpus,started=Date.now();
 if(reuseReport){
  if(!path.isAbsolute(reuseReport))throw Error('Reused replay report must be absolute');const priorReport=JSON.parse(await fs.readFile(reuseReport,'utf8')),artifact=priorReport.corpusExports?.baseline;
  if(priorReport.baseline?.rawSha256!==frozen.rawSha256||hashValue(priorReport.baseline?.codeProof)!==hashValue(codeProof)||!artifact)throw Error('Reused corpus baseline or code provenance mismatch');
  raw=null;global.gc?.();const source=contained(path.dirname(reuseReport),artifact.file),candidateData=await readCandidates(source,{...artifact,version:priorReport.baseline.corpusVersion});
  corpus={candidates:candidateData.candidates,version:candidateData.version,audit:priorReport.baseline.audit};
  const destination=path.join(output,'baseline-corpus.json');await fs.copyFile(source,destination,syncFs.constants.COPYFILE_EXCL);if(await fileHash(destination)!==artifact.sha256)throw Error('Copied baseline corpus checksum mismatch');corpusExports.baseline={...artifact,reusedFromReportSha256:await fileHash(reuseReport)};timings.baselineCorpusReused=true;console.log('Reused checksum-verified frozen baseline corpus');
 }else{
  console.log('Building frozen baseline corpus (committed baseline code, line-ending equivalence verified)');
  const baselineBuilder=require(path.join(baselineDir,'data.cjs')),baselineEnrichment=require(path.join(baselineDir,'enrichments.cjs')),identityReviews=require(path.join(baselineDir,'identity-reviews.cjs'));
  corpus=baselineBuilder.buildCorpus(raw.rows,{enrichments:Array.isArray(baselineEnrichment)?baselineEnrichment:baselineEnrichment.enrichments||[],identityReviews});timings.baselineCorpusMs=Date.now()-started;console.log('Baseline corpus completed in '+timings.baselineCorpusMs+'ms');corpusExports.baseline=await exportCorpus(corpus,path.join(output,'baseline-corpus.json'));
 }
 const baseline=summarize(corpus);corpus=null;raw=null;global.gc?.();
 console.log('Building pinned release corpus');const descriptor=JSON.parse(await fs.readFile(releaseManifest,'utf8')),loaded=await loadDataRelease(releaseManifest,{cacheDir:path.join(path.dirname(releaseManifest),'cache',descriptor.releaseId)}),enrichment=require('../enrichments.cjs');
 started=Date.now();corpus=require('../data.cjs').buildCorpus(loaded.rows,{enrichments:Array.isArray(enrichment)?enrichment:enrichment.enrichments||[],identityReviews:require('../identity-reviews.cjs')});const repaired=summarize(corpus),identity=compareIdentity(baseline,repaired);timings.releaseCorpusMs=Date.now()-started;console.log('Release corpus completed in '+timings.releaseCorpusMs+'ms');
 const exclusionGroups=[...new Set(excluded.map(id=>repaired.bySource.get(id)).filter(Boolean))],missingExcludedRows=excluded.filter(id=>!repaired.bySource.has(id)),exclusionsSafe=!missingExcludedRows.length&&exclusionGroups.every(id=>repaired.groups.get(id)?.held&&repaired.groups.get(id)?.passages===0);corpusExports.release=await exportCorpus(corpus,path.join(output,'release-corpus.json'));
 corpus=null;loaded.rows=null;global.gc?.();
 console.log('Restoring and rehashing independent backup sample');await fs.mkdir(output,{recursive:true});const backup=await restoreSample(backupRoot,path.join(output,'restored-sample'));
 const report={schemaVersion:1,createdAt:new Date().toISOString(),baseline:{fetchedAt:frozen.fetchedAt,rawSha256:frozen.rawSha256,codeCommit:frozen.codeCommit,codeProof,corpusVersion:baseline.version,audit:baseline.audit},release:{...loaded.dataRelease,corpusVersion:repaired.version,audit:repaired.audit},timings,corpusExports,professionalRows,identity,exclusions:{sourceRows:excluded.length,distinctGroups:exclusionGroups.length,missingExcludedRows,allHeldWithoutPassages:exclusionsSafe},backup,passed:professionalRows.changedOrMissingRows===0&&identity.passed&&exclusionsSafe};
 await fs.writeFile(path.join(output,'replay-report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)throw Error('Baseline/release replay failed; inspect aggregate report');return report;
}
if(require.main===module){const [baselineDir,baselineCode,releaseManifest,reference,backupRoot,output,reuseReport]=process.argv.slice(2);replay({baselineDir,baselineCode,releaseManifest,reference,backupRoot,output,reuseReport}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={compareRows,compareIdentity,restoreSample,replay};
