'use strict';
// Read-only verification of a frozen, segmented private corpus. This does not
// rewrite historical projects or treat identical text from another valid source
// as a suppressed claim. Suppression ownership is record + field + provider.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {buildProfile,VERSION:profileVersion}=require('../../profile.cjs');
const {renderSourcePage}=require('../../sources.cjs');
const projects=require('../../public/projects.js');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function suppressionIndex(packet){
 const records=new Map();
 for(const decision of packet.suppressions||[]){
  const [field,provider,...extra]=decision.field.split('.');assert.equal(extra.length,0,'Unexpected suppression path');
  if(!records.has(decision.sourceRecordId))records.set(decision.sourceRecordId,[]);
  records.get(decision.sourceRecordId).push({field,provider:provider?.toLowerCase(),reviewId:decision.reviewId});
 }
 return records;
}
function forbiddenProvenance(value,index){
 const failures=[];
 function visit(item){
  if(!item||typeof item!=='object')return;
  if(Array.isArray(item)){item.forEach(visit);return;}
  for(const d of index.get(item.sourceRecordId)||[]){
   if(item.field===d.field&&(!d.provider||String(item.sourceLabel||'').toLowerCase()===d.provider))failures.push({reviewId:d.reviewId,sourceRecordId:item.sourceRecordId,field:item.field,sourceLabel:item.sourceLabel,evidenceId:item.id||null});
  }
  for(const child of Object.values(item))if(child&&typeof child==='object')visit(child);
 }
 visit(value);return failures;
}
function* segments(manifestFile,manifest,field){
 let count=0;
 for(const entry of manifest.fields[field].segments){
  assert.equal(path.basename(entry.file),entry.file,'Segment path must stay within its manifest directory');
  const bytes=fs.readFileSync(path.join(path.dirname(manifestFile),entry.file));
  assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256,'Segment checksum mismatch');
  const rows=JSON.parse(bytes);assert.equal(rows.length,entry.count);count+=rows.length;
  yield*rows;
 }
 assert.equal(count,manifest.fields[field].count);
}
function verify(packetFile,manifestFile,replayFile,outputFile){
 if(fs.existsSync(outputFile))throw Error('Use a new report path; preserve previous verification.');
 const packetBytes=fs.readFileSync(packetFile),manifestBytes=fs.readFileSync(manifestFile),replayBytes=fs.readFileSync(replayFile);
 const packet=JSON.parse(packetBytes),manifest=JSON.parse(manifestBytes),replay=JSON.parse(replayBytes),index=suppressionIndex(packet);
 assert.equal(replay.packetSha256,sha(packetBytes));assert.equal(replay.corpusVersion,manifest.metadata.version);
 assert.equal(replay.corpusArtifact.sha256,manifest.sourceCorpusSha256);assert.equal(replay.passed,true);
 assert.equal(replay.releaseId,packet.releaseId);
 const version=manifest.metadata.version,heldRecords=new Set((packet.holds||[]).map(x=>x.sourceRecordId));
 const owners=new Map(),affected=new Map(),heldCandidates=new Set();
 for(const candidate of segments(manifestFile,manifest,'candidates')){
  owners.set(candidate.id,new Set(candidate.sourceRecordIds));
  if(candidate.needsIdentityReview){heldCandidates.add(candidate.id);assert.equal(candidate.evidenceIds.length,0,'Held identity still has evidence');}
  if(candidate.sourceRecordIds.some(id=>heldRecords.has(id)))assert.equal(candidate.needsIdentityReview,true,'Mandatory hold is missing');
  if(!candidate.needsIdentityReview&&candidate.sourceRecordIds.some(id=>index.has(id)))affected.set(candidate.id,{candidate,passages:[]});
 }
 const violations=[],ownershipFailures=[];let passagesChecked=0,provenanceEntriesChecked=0;
 for(const passage of segments(manifestFile,manifest,'passages')){
  passagesChecked++;assert(!heldCandidates.has(passage.candidateId),'Held candidate contributes a passage');
  for(const source of [passage,...(passage.sources||[])]){provenanceEntriesChecked++;if(!owners.get(passage.candidateId)?.has(source.sourceRecordId))ownershipFailures.push({candidateId:passage.candidateId,evidenceId:passage.id,sourceRecordId:source.sourceRecordId});}
  violations.push(...forbiddenProvenance(passage,index));
  affected.get(passage.candidateId)?.passages.push(passage);
 }
 assert.equal(violations.length,0,'Suppressed source fields are still in prepared evidence');
 assert.equal(ownershipFailures.length,0,'Prepared evidence ownership does not match its candidate');
 const surfaceReceipts=[],brief={version:1,summary:'Saved professional evidence',requirements:[]};
 for(const {candidate,passages} of affected.values()){
  if(!passages.length)continue;
  const profile=buildProfile(candidate,passages,{corpusVersion:version,dataReleaseId:packet.releaseId});
  assert(profile);assert.equal(forbiddenProvenance(profile,index).length,0);
  const sourceHtml=renderSourcePage(candidate,passages,passages[0],{corpusVersion:version,profileVersion,dataRelease:{releaseId:packet.releaseId}});
  const displayCandidate={...candidate,evidence:passages,requirementMatrix:[],reasons:[],dataReleaseId:packet.releaseId,profileBackground:profile};
  let project=projects.createProject('Private exclusion verification');
  project=projects.setBrief(project,brief,version,{dataReleaseId:packet.releaseId});
  project=projects.saveCandidate(project,displayCandidate,brief,version,{dataReleaseId:packet.releaseId});
  const backup=projects.exportJSON(project),restored=projects.importJSON(backup),exportHtml=projects.exportHTML(project);
  assert.deepEqual(restored.candidates,project.candidates);assert.equal(forbiddenProvenance(restored,index).length,0);
  assert.equal(restored.events.length,0);assert.equal(restored.candidates[0].qualification,'not-reviewed');
  assert.equal(restored.dataReleaseId,packet.releaseId);assert.equal(restored.corpusVersion,version);
  assert(sourceHtml.includes(version));assert(exportHtml.includes('dataReleaseId='+packet.releaseId));
  surfaceReceipts.push({candidateId:candidate.id,sourceRecords:candidate.sourceRecordIds,passages:passages.length,profileSha256:sha(JSON.stringify(profile)),sourcePageSha256:sha(sourceHtml),backupSha256:sha(backup),exportSha256:sha(exportHtml)});
 }
 const runtimeFiles=['data.cjs','profile.cjs','sources.cjs','public/evidence.js','public/projects.js'];
 const report={schemaVersion:1,scope:'All prepared passage provenance; profile, source-reader and save/export projections for every non-held affected candidate with evidence. Historical saved projects are not changed.',packetSha256:sha(packetBytes),manifestSha256:sha(manifestBytes),replaySha256:sha(replayBytes),dataReleaseId:packet.releaseId,corpusVersion:version,sourceCorpusSha256:manifest.sourceCorpusSha256,suppressionDecisions:packet.suppressions.length,affectedSourceRecords:index.size,passagesChecked,provenanceEntriesChecked,heldCandidates:heldCandidates.size,ownershipFailures,forbiddenSources:violations,surfaceCandidates:surfaceReceipts.length,surfaceReceipts,runtimeSha256:Object.fromEntries(runtimeFiles.map(file=>[file,sha(fs.readFileSync(path.join(__dirname,'../..',file)))])),networkCalls:0,modelCalls:0,realProjectsChanged:0,passed:true};
 fs.mkdirSync(path.dirname(outputFile),{recursive:true});fs.writeFileSync(outputFile,JSON.stringify(report,null,2));
 return {passed:true,suppressionDecisions:report.suppressionDecisions,affectedSourceRecords:index.size,passagesChecked,surfaceCandidates:surfaceReceipts.length,outputFile};
}
if(require.main===module){try{console.log(JSON.stringify(verify(...process.argv.slice(2))));}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={suppressionIndex,forbiddenProvenance,verify};
