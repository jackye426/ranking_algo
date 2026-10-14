'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto'),U=require('./util.cjs');
// Legacy binding-v1 for the v19 corpus pins profile-v3. Never inherit the
// hosting application's latest profile version. Older/new bindings must state
// their profile version explicitly.
const PROFILE_VERSION='expert-profile-v3';
const compatible=r=>[1,2].includes(r.schema_version)&&['expert-repair-v1','expert-repair-v2'].includes(r.projection_version)&&/^expert-corpus-v[23]-[a-f0-9]{20}$/.test(r.corpus_version)&&(r.binding.profileVersion!==undefined?['expert-profile-v1','expert-profile-v2','expert-profile-v3'].includes(r.binding.profileVersion):r.schema_version===2&&r.projection_version==='expert-repair-v2'&&r.corpus_version.startsWith('expert-corpus-v3-'));
async function release(db,pin,{staging=false}={}){
  for(const k of ['releaseId','manifestSha256','bindingSha256','corpusVersion'])if(!pin[k])throw Error('Incomplete explicit release pin');
  const r=(await db.query('select * from docmap_professional.releases where release_id=$1',[pin.releaseId])).rows[0];
  if(!r||!compatible(r)||r.manifest_sha256!==pin.manifestSha256||r.binding_sha256!==pin.bindingSha256||r.corpus_version!==pin.corpusVersion)throw Error('Pinned database release unavailable, corrupt or incompatible');
  if(U.sha(r.binding_json)!==r.binding_sha256||U.sha(r.manifest_json)!==r.manifest_sha256||U.hash(JSON.parse(r.binding_json))!==U.hash(r.binding)||U.hash(JSON.parse(r.manifest_json))!==U.hash(r.manifest))throw Error('Database release descriptors are corrupt');
  if(!staging){const e=(await db.query('select * from docmap_professional.publication_events where release_id=$1 order by publication_order desc limit 1',[pin.releaseId])).rows[0];if(!pin.approvalSha256||!e||e.decision!=='approved'||e.receipt_sha256!==pin.approvalSha256||U.hash(e.receipt)!==e.receipt_sha256||e.receipt.releaseId!==r.release_id||e.receipt.decision!=='approved'||e.receipt.authority!=='main-validation-human-approval'||e.receipt.corpusVersion!==r.corpus_version||e.receipt.projectionVersion!==r.projection_version||e.receipt.manifestSha256!==r.manifest_sha256||e.receipt.safetySha256!==r.safety_sha256||e.receipt.corpusSha256!==r.corpus_sha256)throw Error('Pinned release has no current exact approval');}
  r.selected_approval_sha256=staging?null:pin.approvalSha256;return r;
}
function versions(r){return {dataReleaseId:r.release_id,manifestSha256:r.manifest_sha256,corpusVersion:r.corpus_version,corpusSha256:r.corpus_sha256,projectionVersion:r.projection_version,profileVersion:r.binding.profileVersion||PROFILE_VERSION,bindingSha256:r.binding_sha256,safetySha256:r.safety_sha256,runtimeManifestSha256:r.manifest.runtimeManifestSha256||null,cacheManifestSha256:r.manifest.cacheManifest?.sha256||null,inferenceRuntimeSha256:r.manifest.runtimeDependencyManifest?.sha256||null,baselineSha256:r.manifest.baseline.sha256,repairsSha256:r.manifest.repairs.sha256,approvalSha256:r.selected_approval_sha256||null};}
async function *items(db,r,table){if(!['members','evidence','identity_decisions'].includes(table))throw Error('Internal reader table required');let after=-1;for(;;){const page=await db.query(`select ordinal,payload_sha256,payload_json,payload from docmap_professional.${table} where release_id=$1 and ordinal>$2 order by ordinal limit 500`,[r.release_id,after]);if(!page.rows.length)return;for(const row of page.rows){const value=JSON.parse(row.payload_json);if(U.hash(value)!==row.payload_sha256||U.hash(row.payload)!==row.payload_sha256)throw Error('Corrupt release item');after=row.ordinal;yield value;}}}
async function loadCorpus(db,pin,options={}){
  const r=await release(db,pin,options),candidates=[],passages=[],identityLedger=[],fingerprint=crypto.createHash('sha256');
  for await(const c of items(db,r,'members')){candidates.push(c);fingerprint.update(JSON.stringify(c));}
  for await(const p of items(db,r,'evidence')){passages.push(p);fingerprint.update(JSON.stringify(p));}
  for await(const d of items(db,r,'identity_decisions'))identityLedger.push(d);
  if(candidates.length!==r.counts.members||passages.length!==r.counts.evidence||identityLedger.length!==r.counts.records||!r.corpus_version.endsWith('-'+fingerprint.digest('hex').slice(0,20)))throw Error('Database corpus is incomplete or differs from pinned package');
  return {corpus:{candidates,passages,identityLedger,audit:r.counts.audit||{},version:r.corpus_version},dataRelease:{...versions(r),releaseId:r.release_id,baselineSha256:r.manifest.baseline.sha256,repairsSha256:r.manifest.repairs.sha256},status:options.staging?'staged-unapproved':'approved'};
}
async function loadSearchCorpus(db,pin,options={}){
  const r=await release(db,pin,options),candidates=[],passages=[],fingerprint=crypto.createHash('sha256');let decisions=0;
  for await(const c of items(db,r,'members')){fingerprint.update(JSON.stringify(c));candidates.push({id:c.id,name:c.name,needsIdentityReview:c.needsIdentityReview});}
  for await(const p of items(db,r,'evidence')){fingerprint.update(JSON.stringify(p));passages.push({id:p.id,text:p.text,candidateId:p.candidateId});}
  for await(const d of items(db,r,'identity_decisions'))decisions++;
  if(candidates.length!==r.counts.members||passages.length!==r.counts.evidence||decisions!==r.counts.records||!r.corpus_version.endsWith('-'+fingerprint.digest('hex').slice(0,20)))throw Error('Database corpus differs from pinned package');
  return {corpus:{candidates,passages,audit:r.counts.audit||{},version:r.corpus_version},dataRelease:{releaseId:r.release_id,...versions(r)},status:options.staging?'staged-unapproved':'approved'};
}
async function profileEvidence(db,pin,candidateId,options={}){
  const r=await release(db,pin,options),member=(await db.query('select payload_json,payload_sha256,payload,held from docmap_professional.members where release_id=$1 and professional_id=$2',[r.release_id,candidateId])).rows[0];
  if(!member||member.held)return null;const candidate=JSON.parse(member.payload_json);if(U.hash(candidate)!==member.payload_sha256||U.hash(member.payload)!==member.payload_sha256)throw Error('Corrupt professional');
  const passages=[];let after=-1;for(;;){const page=await db.query('select ordinal,payload_json,payload_sha256,payload from docmap_professional.evidence where release_id=$1 and professional_id=$2 and ordinal>$3 order by ordinal limit 200',[r.release_id,candidateId,after]);if(!page.rows.length)break;for(const x of page.rows){const p=JSON.parse(x.payload_json);if(U.hash(p)!==x.payload_sha256||U.hash(x.payload)!==x.payload_sha256)throw Error('Corrupt professional evidence');passages.push(p);after=x.ordinal;}}
  // Corpus ordinal order is evidence-ID order; candidate IDs retain source
  // traversal order. Validate membership without changing either ordering.
  if(U.hash(passages.map(p=>p.id).sort())!==U.hash([...candidate.evidenceIds].sort()))throw Error('Incomplete professional evidence');return {candidate,passages,versions:versions(r)};
}
async function historicalCitation(db,pin,{candidateId,evidenceId},options={}){
  let r;try{r=await release(db,pin,options);}catch{return {status:410,error:'Historical release unavailable; saved evidence is unchanged.'};}
  const x=(await db.query('select e.payload_json,e.payload_sha256,e.payload,m.held from docmap_professional.evidence e join docmap_professional.members m using(release_id,professional_id) where e.release_id=$1 and e.evidence_id=$2 and e.professional_id=$3',[r.release_id,evidenceId,candidateId])).rows[0];
  if(!x||x.held)return {status:410,error:'Historical evidence unavailable; saved evidence is unchanged.'};
  let evidence;try{evidence=JSON.parse(x.payload_json);if(U.hash(evidence)!==x.payload_sha256||U.hash(x.payload)!==x.payload_sha256)throw Error('Integrity');}catch{return {status:410,error:'Historical evidence integrity failed; saved evidence is unchanged.'};}
  return {status:200,evidence,versions:versions(r)};
}
async function publish(db,{receiptFile,receiptSha256}){
  const receipt=await U.json(receiptFile);if(U.hash(receipt)!==receiptSha256)throw Error('Approval receipt canonical hash mismatch');
  const required=['schemaVersion','eventId','releaseId','decision','manifestSha256','corpusSha256','corpusVersion','projectionVersion','safetySha256','authority','approvalReference'];
  if(Object.keys(receipt).some(k=>!required.includes(k))||required.some(k=>receipt[k]===undefined)||receipt.schemaVersion!==1||!['approved','revoked'].includes(receipt.decision)||receipt.authority!=='main-validation-human-approval'||typeof receipt.approvalReference!=='string'||!receipt.approvalReference.trim())throw Error('Explicit exact-package approval linkage required');
  const r=(await db.query('select * from docmap_professional.releases where release_id=$1',[receipt.releaseId])).rows[0];
  if(!r||!compatible(r)||receipt.manifestSha256!==r.manifest_sha256||receipt.corpusSha256!==r.corpus_sha256||receipt.corpusVersion!==r.corpus_version||receipt.projectionVersion!==r.projection_version||receipt.safetySha256!==r.safety_sha256)throw Error('Approval belongs to a different package');
  const old=(await db.query('select receipt_sha256 from docmap_professional.publication_events where event_id=$1',[receipt.eventId])).rows[0];if(old){if(old.receipt_sha256!==receiptSha256)throw Error('Approval event collision');return {idempotent:true,receiptSha256};}
  await U.insertBatch(db,'publication_events',[{event_id:receipt.eventId,release_id:receipt.releaseId,decision:receipt.decision,receipt_sha256:receiptSha256,receipt}]);return {receiptSha256,releaseId:receipt.releaseId,decision:receipt.decision};
}
async function loadRows(db,pin,options={}){const r=await release(db,pin,options),rows=[];let after=-1;for(;;){const page=await db.query('select ordinal,projected_sha256,projected_json from docmap_professional.records where release_id=$1 and ordinal>$2 order by ordinal limit 500',[r.release_id,after]);if(!page.rows.length)break;for(const x of page.rows){const row=JSON.parse(x.projected_json);if(U.hash(row)!==x.projected_sha256)throw Error('Corrupt professional row');rows.push(row);after=x.ordinal;}}if(rows.length!==r.counts.records)throw Error('Incomplete professional rows');return {rows,readerVersion:1,dataRelease:{releaseId:r.release_id,...versions(r)}};}
async function compatibleSelection(db,fromPin,toPin){const from=await release(db,fromPin),to=await release(db,toPin);if(from.safety_sha256!==to.safety_sha256||from.projection_version!==to.projection_version)throw Error('Rollback safety/projection policy differs; separate compatibility review required');const mappings=await db.query('select count(*)::int n from (select record_id,professional_id from docmap_professional.identity_decisions where release_id=$1) a full join (select record_id,professional_id from docmap_professional.identity_decisions where release_id=$2) b using(record_id) where a.record_id is null or b.record_id is null or a.professional_id is distinct from b.professional_id',[from.release_id,to.release_id]);if(mappings.rows[0].n)throw Error('Release identity membership is incompatible');const holds=await db.query('select count(*)::int n from (select professional_id,held from docmap_professional.members where release_id=$1) a full join (select professional_id,held from docmap_professional.members where release_id=$2) b using(professional_id) where a.professional_id is null or b.professional_id is null or a.held is distinct from b.held',[from.release_id,to.release_id]);if(holds.rows[0].n)throw Error('Release identity holds are incompatible');return {compatible:true,from:versions(from),to:versions(to)};}
module.exports={release,versions,items,loadCorpus,loadSearchCorpus,profileEvidence,loadRows,historicalCitation,publish,compatibleSelection};
