'use strict';
// Private, immutable preview packages. This module never fetches or edits source data.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const VERSION='expert-repair-v1';
// Includes the subsequently confirmed osteopathy/ophthalmology mixed-source row.
// These holds protect the complete identity group; evidence repairs cannot lift them.
const MANDATORY_HOLDS=Object.freeze(['bupa_6445','bupa_26882','bupa_22318']);
const EVIDENCE_FIELDS=Object.freeze(['about','clinical_interests','areas_of_interest','research_interests']);
const CONTEXT_KINDS=Object.freeze(['profession','condition','population','language','service']);
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
  if(!sourceUrl(value.sourceUrl)||!bounded(value.sourceLabel,200)||!date(value.sourceDate)||!date(value.observedAt)||!DIGEST.test(value.snapshotSha256)||!bounded(value.parserVersion,160)||!bounded(value.reviewId,240))fail('incomplete source provenance');
  if(value.sourceField!==undefined&&!bounded(value.sourceField,160))fail('invalid original source field');
  return {sourceUrl:sourceUrl(value.sourceUrl),sourceLabel:value.sourceLabel,sourceDate:value.sourceDate,observedAt:value.observedAt,
    repairProvenance:{releaseId:release.releaseId,baselineSha256:release.baselineSha256,beforeHash:patch.beforeHash,snapshotSha256:value.snapshotSha256,parserVersion:value.parserVersion,reviewId:value.reviewId,...(value.sourceField?{originalSourceField:value.sourceField}:{})}};
}
function applyRepairs(rows,packet,{baselineSha256,releaseId}={}){
  keys(packet,['schemaVersion','releaseId','baselineSha256','patches','holds'],'repair packet');
  if(packet.schemaVersion!==1||packet.releaseId!==releaseId||packet.baselineSha256!==baselineSha256||!DIGEST.test(baselineSha256)||!bounded(releaseId,120))fail('repair packet version or baseline mismatch');
  if(!Array.isArray(rows)||!rows.length||rows.length>100000||!Array.isArray(packet.patches)||packet.patches.length>200000||!Array.isArray(packet.holds)||packet.holds.length>100000)fail('row or patch limits');
  const byId=new Map(),changes=new Map(),seen=new Set();
  for(const row of rows){if(!object(row)||!bounded(row.id,160)||byId.has(row.id))fail('missing or duplicate baseline identity');byId.set(row.id,row);}
  const mutable=id=>{if(!byId.has(id))fail('unknown source record');if(!changes.has(id))changes.set(id,{...byId.get(id)});return changes.get(id);};
  for(const patch of packet.patches){
    keys(patch,['sourceRecordId','field','beforeHash','value','provenance','approved'],'patch');
    if(patch.approved!==true||!bounded(patch.sourceRecordId,160)||![...EVIDENCE_FIELDS,'professional_context'].includes(patch.field)||!DIGEST.test(patch.beforeHash))fail('unapproved patch or protected field');
    const key=patch.sourceRecordId+'|'+patch.field;if(seen.has(key))fail('duplicate field patch');seen.add(key);
    const row=mutable(patch.sourceRecordId);if(hashValue(byId.get(patch.sourceRecordId)[patch.field])!==patch.beforeHash)fail('before-value hash mismatch');
    if(patch.field==='professional_context'){
      if(patch.provenance!==undefined||!Array.isArray(patch.value)||!patch.value.length||patch.value.length>100)fail('invalid professional context');
      const contextKeys=new Set();
      row[patch.field]=patch.value.map(item=>{keys(item,['kind','text','provenance'],'context item');if(!CONTEXT_KINDS.includes(item.kind)||!bounded(item.text,5000))fail('invalid context kind or text');const source=provenance(item.provenance,packet,patch),contextKey=item.kind+'|'+item.text.trim()+'|'+source.sourceUrl;if(contextKeys.has(contextKey))fail('duplicate professional context item');contextKeys.add(contextKey);return {kind:item.kind,text:item.text,...source};});
    }else{
      const values=typeof patch.value==='string'?[patch.value]:patch.value;
      if(!Array.isArray(values)||!values.length||values.length>1000||values.some(v=>!bounded(v,100000))||values.reduce((n,v)=>n+v.length,0)>300000)fail('invalid or empty replacement text');
      const source=provenance(patch.provenance,packet,patch);
      const wrapped=values.map(text=>({text,...source}));row[patch.field]=typeof patch.value==='string'?wrapped[0]:wrapped;
    }
  }
  const holdIds=new Set();
  for(const hold of packet.holds){keys(hold,['sourceRecordId','reason'],'hold');if(!MANDATORY_HOLDS.includes(hold.sourceRecordId)||!bounded(hold.reason,1000)||holdIds.has(hold.sourceRecordId))fail('unapproved or duplicate hold');holdIds.add(hold.sourceRecordId);mutable(hold.sourceRecordId).requires_review=true;}
  if(MANDATORY_HOLDS.some(id=>!holdIds.has(id)))fail('mandatory identity holds are missing');
  const output=rows.map(row=>changes.get(row.id)||row);
  for(let i=0;i<rows.length;i++)for(const field of ['requires_review','do_not_recommend','blacklisted'])if(flag(rows[i][field])&&!flag(output[i][field]))fail('baseline exclusion weakened');
  const additionalHoldRows=[...holdIds].filter(id=>!['requires_review','do_not_recommend','blacklisted'].some(field=>flag(byId.get(id)[field]))).length;
  return {rows:output,summary:{patches:packet.patches.length,changedRows:changes.size,declaredHoldRows:holdIds.size,additionalHoldRows,mandatoryHolds:[...MANDATORY_HOLDS]}};
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
  keys(manifest,['schemaVersion','releaseId','projectionVersion','baseline','repairs','identityReviewsSha256','enrichmentsSha256'],'manifest');
  if(manifest.schemaVersion!==1||!bounded(manifest.releaseId,120)||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(manifest.releaseId)||manifest.projectionVersion!==VERSION)fail('unsupported manifest version');
  if(!cacheDir||!path.isAbsolute(cacheDir)||path.basename(path.resolve(cacheDir))!==manifest.releaseId)fail('EXPERT_CACHE_DIR must be absolute and end with the release ID');
  const directory=path.dirname(filename);
  const baselinePath=artifactPath(directory,manifest.baseline?.path),repairsPath=artifactPath(directory,manifest.repairs?.path);
  if(baselinePath===repairsPath||baselinePath===filename||repairsPath===filename)fail('duplicate artifact paths');
  for(const [key,file] of [['identityReviewsSha256','identity-reviews.cjs'],['enrichmentsSha256','enrichments.cjs']])if(manifest[key]!==undefined){if(!DIGEST.test(manifest[key])||sha256(await fs.readFile(path.join(__dirname,file)))!==manifest[key])fail('runtime identity evidence checksum mismatch');}
  const raw=await verifiedJSON(directory,manifest.baseline,1024*1024*1024);
  if(!object(raw)||raw.readerVersion!==1||!Array.isArray(raw.rows)||!date(raw.fetchedAt)||raw.fetchedAt===null)fail('invalid frozen professional baseline');
  const packet=await verifiedJSON(directory,manifest.repairs,256*1024*1024);
  const applied=applyRepairs(raw.rows,packet,{baselineSha256:manifest.baseline.sha256,releaseId:manifest.releaseId});
  return {rows:applied.rows,fetchedAt:raw.fetchedAt,readerVersion:raw.readerVersion,dataRelease:{releaseId:manifest.releaseId,projectionVersion:VERSION,manifestSha256:sha256(bytes),baselineSha256:manifest.baseline.sha256,repairsSha256:manifest.repairs.sha256,...(manifest.identityReviewsSha256?{identityReviewsSha256:manifest.identityReviewsSha256}:{}),...(manifest.enrichmentsSha256?{enrichmentsSha256:manifest.enrichmentsSha256}:{}),...applied.summary}};
}
module.exports={VERSION,MANDATORY_HOLDS,EVIDENCE_FIELDS,CONTEXT_KINDS,canonicalJSON,hashValue,applyRepairs,loadDataRelease};
