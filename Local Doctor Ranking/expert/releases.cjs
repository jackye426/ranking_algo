'use strict';
// Private, immutable preview packages. This module never fetches or edits source data.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const VERSION='expert-repair-v2';
const {validatePolicy}=require('./reviewed-segmentation.cjs');
// Every runtime module, browser asset and classification catalogue in the
// staging allowlist must be pinned, not only the direct server entrypoint.
const REQUIRED_RUNTIME_FILES=Object.freeze([
  'package.json','package-lock.json','Dockerfile','expert/entrypoint.sh','demo/models.cjs',
  ...['server','reader','releases','cache-release','inference-runtime','practice-cache','data','reviewed-segmentation','brief','brief-context','search','ai','transport','enrichments','identity-reviews','resume','sources','geo','profile','emdn-taxonomy','mdr-taxonomy','classification-registry','device-context','device-context-set','device-context-legacy','clarifications'].map(name=>'expert/'+name+'.cjs'),
  'expert/data/emdn-2026.json','expert/data/mdr-2017-2185.json',
  ...['app','projects','evidence','source-reader'].map(name=>'expert/public/'+name+'.js'),
  'expert/public/index.html','expert/public/styles.css',
  'public/fonts/inter-variable.ttf','public/fonts/OFL-Inter.txt','public/brand/docmap-logo.jpg'
]);
// Independently reviewed source ownership conflicts: 59 unresolved typed-GMC
// disagreements, five cross-person provider biographies, and three prior holds.
// Protect complete identity groups in both forward and rollback releases.
const MANDATORY_HOLDS=Object.freeze(["bupa_20870","bupa_6445","bupa_26882","bupa_22318","bupa_10063","bupa_10125","bupa_10129","bupa_10181","bupa_10354","bupa_10374","bupa_10628","bupa_10907","bupa_12243","bupa_12497","bupa_13125","bupa_13232","bupa_13389","bupa_13481","bupa_13484","bupa_13837","bupa_14373","bupa_15223","bupa_15288","bupa_15707","bupa_16470","bupa_1969","bupa_1981","bupa_20364","bupa_20404","bupa_20643","bupa_20894","bupa_20983","bupa_22245","bupa_22404","bupa_22410","bupa_23289","bupa_23942","bupa_24183","bupa_24662","bupa_24670","bupa_25337","bupa_25446","bupa_26619","bupa_26731","bupa_26782","bupa_27893","bupa_28297","bupa_28328","bupa_28351","bupa_2870","bupa_28708","bupa_28807","bupa_29352","bupa_32338","bupa_34897","bupa_3768","bupa_5564","bupa_5771","bupa_6687","bupa_6787","bupa_7258","bupa_7940","bupa_801","bupa_8842","bupa_8893","bupa_9139","spire_3626"]);
const EVIDENCE_FIELDS=Object.freeze(['about','clinical_interests','areas_of_interest','research_interests']);
const CONTEXT_KINDS=Object.freeze(['profession','condition','population','language','service','biography','qualification','membership','affiliation','academic-background','clinical-interest','recorded-procedure','research-interest','reported-activity','treatment-listing','professional-body','research-background']);
// Specialty and NHS base remain canonical inputs for identity decisions.
// Their exclusions affect the expert evidence/display projection only.
const SUPPRESSIBLE_FIELDS=Object.freeze([...EVIDENCE_FIELDS,'about_alternatives','procedures','procedures_completed','procedure_volumes_phin','publications','qualifications','detailed_qualifications','professional_memberships','professional_experience','isrctn_trials','trials','teaching_interests','nhs_base','specialty']);
const DIGEST=/^[a-f0-9]{64}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const bounded=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const flag=v=>v===true||v===1||v==='true';
const fail=message=>{throw Error('Invalid expert data release: '+message);};
function keys(value,allowed,label){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail(label+' has unsupported fields');}
function canonicalJSON(value,depth=0){
  if(depth>40)fail('value nesting limit exceeded');
  if(value===undefined||value===null)return 'null';
  if(typeof value==='number'&&!Number.isFinite(value))fail('non-finite value');
  if(['string','boolean','number'].includes(typeof value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(v=>canonicalJSON(v,depth+1)).join(',')+']';
  if(object(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k],depth+1)).join(',')+'}';
  fail('unsupported value type');
}
const sha256=value=>createHash('sha256').update(value).digest('hex');
const hashValue=value=>sha256(canonicalJSON(value));
function sourceUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||value.length>2000)return null;return u.href;}catch{return null;}}
function date(value){return value===null||typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value));}
function provenance(value,release,patch){
  keys(value,['sourceUrl','sourceLabel','sourceDate','observedAt','snapshotSha256','parserVersion','reviewId','sourceField'],'patch provenance');
  if(!(sourceUrl(value.sourceUrl)||value.sourceUrl===null&&release.schemaVersion===2)||!bounded(value.sourceLabel,200)||!date(value.sourceDate)||!date(value.observedAt)||!DIGEST.test(value.snapshotSha256)||!bounded(value.parserVersion,160)||!bounded(value.reviewId,240))fail('incomplete source provenance');
  if(value.sourceField!==undefined&&!bounded(value.sourceField,160))fail('invalid original source field');
  return {sourceUrl:sourceUrl(value.sourceUrl),sourceLabel:value.sourceLabel,sourceDate:value.sourceDate,observedAt:value.observedAt,
    repairProvenance:{releaseId:release.releaseId,baselineSha256:release.baselineSha256,beforeHash:patch.beforeHash,snapshotSha256:value.snapshotSha256,parserVersion:value.parserVersion,reviewId:value.reviewId,...(value.sourceField?{originalSourceField:value.sourceField}:{})}};
}
function applyRepairs(rows,packet,{baselineSha256,releaseId}={}){
  keys(packet,['schemaVersion','releaseId','baselineSha256','patches','holds','suppressions'],'repair packet');
  if(![1,2].includes(packet.schemaVersion)||packet.releaseId!==releaseId||packet.baselineSha256!==baselineSha256||!DIGEST.test(baselineSha256)||!bounded(releaseId,120)||packet.schemaVersion===1&&packet.suppressions!==undefined)fail('repair packet version or baseline mismatch');
  if(!Array.isArray(rows)||!rows.length||rows.length>100000||!Array.isArray(packet.patches)||packet.patches.length>200000||!Array.isArray(packet.holds)||packet.holds.length>100000)fail('row or patch limits');
  const byId=new Map(),changes=new Map(),seen=new Set();
  for(const row of rows){if(!object(row)||!bounded(row.id,160)||byId.has(row.id))fail('missing or duplicate baseline identity');if(Object.hasOwn(row,'_expertEvidenceExclusions'))fail('baseline contains reserved projection decisions');byId.set(row.id,row);}
  const mutable=id=>{if(!byId.has(id))fail('unknown source record');if(!changes.has(id))changes.set(id,{...byId.get(id)});return changes.get(id);};
  for(const patch of packet.patches){
    keys(patch,['sourceRecordId','field','beforeHash','value','provenance','approved'],'patch');
    if(patch.approved!==true||!bounded(patch.sourceRecordId,160)||![...EVIDENCE_FIELDS,'professional_context'].includes(patch.field)||!DIGEST.test(patch.beforeHash))fail('unapproved patch or protected field');
    const key=patch.sourceRecordId+'|'+patch.field;if(seen.has(key))fail('duplicate field patch');seen.add(key);
    const row=mutable(patch.sourceRecordId);if(hashValue(byId.get(patch.sourceRecordId)[patch.field])!==patch.beforeHash)fail('before-value hash mismatch');
    if(patch.field==='professional_context'){
      if(patch.provenance!==undefined||!Array.isArray(patch.value)||!patch.value.length||patch.value.length>(packet.schemaVersion===2?500:100))fail('invalid professional context');
      if(patch.value.reduce((n,item)=>n+(typeof item?.text==='string'?item.text.length:0),0)>1000000)fail('professional context size limit');
      const contextKeys=new Set();
      row[patch.field]=patch.value.map(item=>{keys(item,['kind','text','provenance','activity','segmentationPolicy'],'context item');if(!CONTEXT_KINDS.includes(item.kind)||!bounded(item.text,packet.schemaVersion===2&&['biography','clinical-interest','research-interest','research-background','academic-background'].includes(item.kind)?100000:5000))fail('invalid context kind or text');const source=provenance(item.provenance,packet,patch),contextKey=hashValue([item.kind,item.text.trim(),source.sourceUrl,item.provenance.sourceField||null,item.provenance.sourceDate,item.provenance.observedAt,item.activity||null]);if(contextKeys.has(contextKey))fail('duplicate professional context item');contextKeys.add(contextKey);if(item.segmentationPolicy!==undefined){if(packet.schemaVersion!==2||item.kind!=='biography')fail('segmentation policy on incompatible field');validatePolicy(item.text,item.provenance.reviewId,item.segmentationPolicy);}if(item.activity!==undefined){if(packet.schemaVersion!==2||item.kind!=='reported-activity')fail('activity metadata on an incompatible claim');keys(item.activity,['procedureName','procedureCode','hospital','period','reportedRange','reportedAdmissions'],'reported activity');for(const [key,value]of Object.entries(item.activity)){if(key==='reportedAdmissions'){if(value!==null&&(!Number.isSafeInteger(value)||value<0))fail('invalid reported admissions');}else if(value!==null&&!bounded(value,1000))fail('invalid activity metadata');}}return {kind:item.kind,text:item.text,...source,...(item.activity?{activity:structuredClone(item.activity)}:{}),...(item.segmentationPolicy?{segmentationPolicy:structuredClone(item.segmentationPolicy)}:{})};});
    }else{
      const values=typeof patch.value==='string'?[patch.value]:patch.value;
      if(!Array.isArray(values)||!values.length||values.length>1000||values.some(v=>!bounded(v,100000))||values.reduce((n,v)=>n+v.length,0)>300000)fail('invalid or empty replacement text');
      const source=provenance(patch.provenance,packet,patch);
      const wrapped=values.map(text=>({text,...source}));row[patch.field]=typeof patch.value==='string'?wrapped[0]:wrapped;
    }
  }
  const suppressions=packet.suppressions||[];
  if(!Array.isArray(suppressions)||suppressions.length>200000)fail('invalid suppression list');
  for(const decision of suppressions){
    keys(decision,['sourceRecordId','field','beforeHash','reason','reviewId','sourceEvidence','approved'],'suppression');
    const parts=typeof decision.field==='string'?decision.field.split('.'):[];
    const publicationEntry=parts.length===2&&parts[0]==='publications'&&/^(?:0|[1-9]\d{0,4})$/.test(parts[1]);
    const alternativeEntry=parts.length===2&&parts[0]==='about_alternatives'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(parts[1])&&!['constructor','prototype','__proto__'].includes(parts[1]);
    if(decision.approved!==true||!bounded(decision.sourceRecordId,160)||!SUPPRESSIBLE_FIELDS.includes(parts[0])||parts.length>2||parts.length===2&&!publicationEntry&&!alternativeEntry||!DIGEST.test(decision.beforeHash)||!bounded(decision.reason,2000)||!bounded(decision.reviewId,240))fail('unapproved suppression or protected field');
    const record=byId.get(decision.sourceRecordId);if(!record)fail('unknown suppression source record');
    if(publicationEntry&&(!Array.isArray(record.publications)||Number(parts[1])>=record.publications.length))fail('missing publication entry');
    let original=record;for(const part of parts){if(!(object(original)||publicationEntry&&Array.isArray(original))||!Object.hasOwn(original,part))fail('missing suppression field');original=original[part];}
    if(hashValue(original)!==decision.beforeHash)fail('suppression before-value hash mismatch');
    if(!Array.isArray(decision.sourceEvidence)||!decision.sourceEvidence.length||decision.sourceEvidence.length>20)fail('missing suppression source evidence');
    for(const proof of decision.sourceEvidence){keys(proof,['snapshotSha256','sourceField','sourceRecordId'],'suppression evidence');if(!DIGEST.test(proof.snapshotSha256)||!bounded(proof.sourceField,200)||proof.sourceRecordId!==decision.sourceRecordId)fail('invalid suppression ownership or provenance');}
    const key=decision.sourceRecordId+'|'+decision.field;
    if([...seen].some(other=>other===key||other.startsWith(key+'.')||key.startsWith(other+'.')))fail('conflicting field patch or suppression');seen.add(key);
    const row=mutable(decision.sourceRecordId);
    if(['nhs_base','specialty'].includes(decision.field))row._expertEvidenceExclusions={...row._expertEvidenceExclusions,[decision.field]:{beforeHash:decision.beforeHash,reviewId:decision.reviewId,releaseId,approved:true}};
    else if(parts.length===1)row[parts[0]]=null;
    // Preserve source positions and all unreviewed sibling entries. The raw
    // baseline and exact suppressed value remain in the immutable history.
    else if(publicationEntry){row.publications=[...row.publications];row.publications[Number(parts[1])]=null;}
    else{row[parts[0]]={...row[parts[0]]};delete row[parts[0]][parts[1]];}
  }
  const holdIds=new Set();
  for(const hold of packet.holds){keys(hold,['sourceRecordId','reason'],'hold');if(!MANDATORY_HOLDS.includes(hold.sourceRecordId)||!bounded(hold.reason,1000)||holdIds.has(hold.sourceRecordId))fail('unapproved or duplicate hold');holdIds.add(hold.sourceRecordId);mutable(hold.sourceRecordId).requires_review=true;}
  if(MANDATORY_HOLDS.some(id=>!holdIds.has(id)))fail('mandatory identity holds are missing');
  const output=rows.map(row=>structuredClone(changes.get(row.id)||row));
  for(let i=0;i<rows.length;i++)for(const field of ['requires_review','do_not_recommend','blacklisted'])if(flag(rows[i][field])&&!flag(output[i][field]))fail('baseline exclusion weakened');
  const additionalHoldRows=[...holdIds].filter(id=>!['requires_review','do_not_recommend','blacklisted'].some(field=>flag(byId.get(id)[field]))).length;
  return {rows:output,summary:{patches:packet.patches.length,suppressedFields:suppressions.length,changedRows:changes.size,declaredHoldRows:holdIds.size,additionalHoldRows,mandatoryHolds:[...MANDATORY_HOLDS]}};
}
async function regularFile(filename,maxBytes){
  const absolute=path.resolve(filename),parsed=path.parse(absolute);let current=parsed.root;
  for(const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);const st=await fs.lstat(current);if(st.isSymbolicLink())fail('symlink paths are not allowed');}
  const st=await fs.stat(absolute);if(!st.isFile()||st.size>maxBytes)fail('artifact size or file type');return absolute;
}
function artifactPath(directory,reference){
  if(!bounded(reference,500)||path.isAbsolute(reference)||/[\0<>:"|?*]/.test(reference)||reference.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'))fail('artifact path must stay inside the release package');
  const result=path.resolve(directory,reference);if(!result.startsWith(path.resolve(directory)+path.sep))fail('artifact path escapes release package');return result;
}
async function verifiedJSON(directory,descriptor,maxBytes){
  keys(descriptor,['path','sha256'],'artifact descriptor');if(!DIGEST.test(descriptor.sha256))fail('artifact digest');
  const filename=await regularFile(artifactPath(directory,descriptor.path),maxBytes),bytes=await fs.readFile(filename);if(sha256(bytes)!==descriptor.sha256)fail('artifact checksum mismatch');
  try{return JSON.parse(bytes.toString('utf8'));}catch{fail('artifact is not valid JSON');}
}
async function loadDataRelease(manifestPath,{cacheDir}={}){
  if(!bounded(manifestPath,2000)||!path.isAbsolute(manifestPath))fail('EXPERT_DATA_RELEASE must be an absolute manifest path');
  const filename=await regularFile(manifestPath,1024*1024),bytes=await fs.readFile(filename);let manifest;try{manifest=JSON.parse(bytes.toString('utf8'));}catch{fail('manifest is not valid JSON');}
  keys(manifest,['schemaVersion','releaseId','projectionVersion','baseline','repairs','identityReviewsSha256','enrichmentsSha256','runtimeManifestSha256','cacheManifest','runtimeDependencyManifest'],'manifest');
  if(![1,2].includes(manifest.schemaVersion)||!bounded(manifest.releaseId,120)||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(manifest.releaseId)||!['expert-repair-v1',VERSION].includes(manifest.projectionVersion))fail('unsupported manifest version');
  const strict=process.env.EXPERT_RELEASE_STRICT==='1';
  if(strict&&(!DIGEST.test(process.env.EXPERT_DATA_RELEASE_SHA256||'')||sha256(bytes)!==process.env.EXPERT_DATA_RELEASE_SHA256))fail('configured manifest checksum mismatch');
  if((strict||manifest.schemaVersion===2)&&(!DIGEST.test(manifest.identityReviewsSha256||'')||!DIGEST.test(manifest.enrichmentsSha256||'')||!DIGEST.test(manifest.runtimeManifestSha256||'')))fail('required runtime pins are missing');
  if(manifest.runtimeManifestSha256){
    const root=path.resolve(__dirname,'..'),runtimeFile=await regularFile(path.join(root,'deployment-manifest.json'),1024*1024),runtimeBytes=await fs.readFile(runtimeFile);
    if(sha256(runtimeBytes)!==manifest.runtimeManifestSha256)fail('deployment manifest checksum mismatch');
    const runtime=JSON.parse(runtimeBytes),paths=new Set();keys(runtime,['createdAt','files'],'deployment manifest');if(runtime.createdAt!==undefined&&(!date(runtime.createdAt)||runtime.createdAt===null)||!Array.isArray(runtime.files)||!runtime.files.length||runtime.files.length>1000)fail('invalid deployment manifest');
    for(const item of runtime.files){keys(item,['file','sha256','bytes'],'deployment artifact');if(!bounded(item.file,500)||!DIGEST.test(item.sha256)||paths.has(item.file)||item.bytes!==undefined&&(!Number.isSafeInteger(item.bytes)||item.bytes<0))fail('invalid deployment artifact');paths.add(item.file);const file=await regularFile(artifactPath(root,item.file),25*1024*1024),content=await fs.readFile(file);if(sha256(content)!==item.sha256||item.bytes!==undefined&&content.length!==item.bytes)fail('runtime deployment artifact checksum mismatch');}
    for(const required of REQUIRED_RUNTIME_FILES)if(!paths.has(required))fail('deployment manifest omits required runtime: '+required);
  }
  if(!cacheDir||!path.isAbsolute(cacheDir)||path.basename(path.resolve(cacheDir))!==manifest.releaseId)fail('EXPERT_CACHE_DIR must be absolute and end with the release ID');
  const directory=path.dirname(filename);
  if(strict&&!manifest.runtimeDependencyManifest)fail('verified installed runtime dependencies are required in strict release mode');
  const inferenceRuntime=manifest.runtimeDependencyManifest?require('./inference-runtime.cjs').validateReceipt(await verifiedJSON(directory,manifest.runtimeDependencyManifest,8*1024*1024)):null;
  if(strict&&!manifest.cacheManifest)fail('verified cache manifest is required in strict release mode');
  const cacheManifest=manifest.cacheManifest?require('./cache-release.cjs').validateDescriptor(await verifiedJSON(directory,manifest.cacheManifest,1024*1024),{releaseId:manifest.releaseId}):null;
  if(strict&&cacheManifest?.schemaVersion!==2)fail('prepared practice cache is required in strict release mode');
  const baselinePath=artifactPath(directory,manifest.baseline?.path),repairsPath=artifactPath(directory,manifest.repairs?.path);
  if(baselinePath===repairsPath||baselinePath===filename||repairsPath===filename)fail('duplicate artifact paths');
  for(const [key,file] of [['identityReviewsSha256','identity-reviews.cjs'],['enrichmentsSha256','enrichments.cjs']])if(manifest[key]!==undefined){if(!DIGEST.test(manifest[key])||sha256(await fs.readFile(path.join(__dirname,file)))!==manifest[key])fail('runtime identity evidence checksum mismatch');}
  const raw=await verifiedJSON(directory,manifest.baseline,1024*1024*1024);
  if(!object(raw)||raw.readerVersion!==1||!Array.isArray(raw.rows)||!date(raw.fetchedAt)||raw.fetchedAt===null)fail('invalid frozen professional baseline');
  const packet=await verifiedJSON(directory,manifest.repairs,256*1024*1024);
  const applied=applyRepairs(raw.rows,packet,{baselineSha256:manifest.baseline.sha256,releaseId:manifest.releaseId});
  return {rows:applied.rows,fetchedAt:raw.fetchedAt,readerVersion:raw.readerVersion,cacheManifest,inferenceRuntime,dataRelease:{releaseId:manifest.releaseId,projectionVersion:manifest.projectionVersion,manifestSha256:sha256(bytes),baselineSha256:manifest.baseline.sha256,repairsSha256:manifest.repairs.sha256,...(manifest.identityReviewsSha256?{identityReviewsSha256:manifest.identityReviewsSha256}:{}),...(manifest.enrichmentsSha256?{enrichmentsSha256:manifest.enrichmentsSha256}:{}),...(manifest.runtimeManifestSha256?{runtimeManifestSha256:manifest.runtimeManifestSha256}:{}),...(manifest.runtimeDependencyManifest?{runtimeDependencyManifestSha256:manifest.runtimeDependencyManifest.sha256}:{}),...(manifest.cacheManifest?{cacheManifestSha256:manifest.cacheManifest.sha256}:{}),...applied.summary}};
}
module.exports={VERSION,MANDATORY_HOLDS,REQUIRED_RUNTIME_FILES,EVIDENCE_FIELDS,CONTEXT_KINDS,SUPPRESSIBLE_FIELDS,canonicalJSON,hashValue,applyRepairs,loadDataRelease};
