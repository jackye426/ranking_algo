'use strict';
// Immutable practice preparation. Runtime apply performs no lookup, timestamp
// refresh, persistence or source-row mutation. Query location lookup is separate.
const {createHash}=require('node:crypto');
const {validCoordinates,recordedUK}=require('./geo.cjs');
const FORMAT='expert-practice-locations-v1';
const COORDINATE_FIELDS=['latitude','longitude','coordinateSource','coordinatePrecision','coordinateProvenance'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=message=>{throw Error('Invalid prepared practice locations: '+message);};
function canonical(v){if(v===undefined||v===null)return 'null';if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';if(typeof v==='number'&&!Number.isFinite(v))fail('non-finite source value');return JSON.stringify(v);}
const sha=v=>createHash('sha256').update(canonical(v)).digest('hex');
const code=v=>String(v||'').toUpperCase().replace(/\s/g,'');
const date=v=>text(v,40)&&Number.isFinite(Date.parse(v));
function keys(v,allowed,label){if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail('unsupported '+label);}
function safeURL(v){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&text(v,2000);}catch{return false;}}
function coordinates(location){return Object.fromEntries(COORDINATE_FIELDS.filter(k=>Object.hasOwn(location,k)).map(k=>[k,structuredClone(location[k])]));}
function binding(corpus){
 if(!text(corpus?.version,180)||!corpus.version.startsWith('expert-corpus-')||!Array.isArray(corpus.candidates)||corpus.candidates.length>100000)fail('corpus required');
 const ids=new Set(),entries=[],candidateKeys=[];
 for(const c of [...corpus.candidates].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
  if(!text(c?.id,180)||ids.has(c.id))fail('duplicate or invalid candidate');ids.add(c.id);
  if(c.needsIdentityReview)continue;
  if(!Array.isArray(c.sourceRecordIds)||!c.sourceRecordIds.length||c.sourceRecordIds.some(id=>!text(id,160))||!Array.isArray(c.locations)||c.locations.length>1000)fail('candidate source ownership');
  candidateKeys.push([c.id,[...c.sourceRecordIds].sort()]);
  c.locations.forEach((location,locationIndex)=>{
   if(!object(location)||location.field!=='locations'||!c.sourceRecordIds.includes(location.sourceRecordId))fail('practice source ownership');
   const practiceKey=sha([c.id,locationIndex,location]);entries.push({candidate:c,location,locationIndex,practiceKey});
  });
 }
 return {entries,candidates:corpus.candidates.filter(c=>!c.needsIdentityReview),fingerprint:sha([candidateKeys,entries.map(e=>[e.candidate.id,e.locationIndex,e.practiceKey])])};
}
function validatePracticeSnapshot(s,{releaseId,corpusVersion}={}){
 keys(s,['schemaVersion','format','releaseId','corpusVersion','practiceFingerprint','preparedAt','entries','coverage'],'snapshot');
 if(s.schemaVersion!==1||s.format!==FORMAT||s.releaseId!==releaseId||!text(releaseId,120)||s.corpusVersion!==corpusVersion||!text(corpusVersion,180)||!digest(s.practiceFingerprint)||!date(s.preparedAt)||!Array.isArray(s.entries)||s.entries.length>1000000||!object(s.coverage))fail('snapshot identity');
 const seen=new Set();
 for(const e of s.entries){
  keys(e,['candidateId','locationIndex','practiceKey','outcome','coordinates','reason'],'entry');
  if(!text(e.candidateId,180)||!Number.isSafeInteger(e.locationIndex)||e.locationIndex<0||e.locationIndex>999||!digest(e.practiceKey)||!['recorded','geocoded','unresolved'].includes(e.outcome))fail('practice entry');
  const k=e.candidateId+'|'+e.locationIndex;if(seen.has(k))fail('duplicate practice entry');seen.add(k);
  if(e.outcome==='unresolved'){if(e.coordinates!==null||!text(e.reason,300))fail('unresolved practice');continue;}
  keys(e.coordinates,COORDINATE_FIELDS,'coordinates');
  if(e.reason!==null||!validCoordinates(e.coordinates)||!text(e.coordinates.coordinatePrecision,160)||!text(e.coordinates.coordinateSource,2000)||!object(e.coordinates.coordinateProvenance))fail('coordinate record');
  if(e.outcome==='geocoded'){
   const v=e.coordinates,p=v.coordinateProvenance;
   keys(p,['kind','sourceUrl','postcode','retrievedAt'],'geocode provenance');
   if(v.latitude<49.8||v.latitude>61.1||v.longitude< -8.3||v.longitude>2.2||!['postcode centre','postcode district centre'].includes(v.coordinatePrecision)||!safeURL(v.coordinateSource)||p.kind!=='geocoded-postcode'||p.sourceUrl!==v.coordinateSource||!text(p.postcode,12)||!(p.retrievedAt===null||date(p.retrievedAt)))fail('geocode provenance');
  }
 }
 return s;
}
function coverage(candidates,entries){
 const byCandidate=new Map();for(const e of entries){if(!byCandidate.has(e.candidateId))byCandidate.set(e.candidateId,[]);byCandidate.get(e.candidateId).push(e);}
 const stats={candidates:candidates.length,locations:entries.length,sourceCoordinates:0,geocoded:0,candidatesWithUKLocation:0,candidatesWithCoordinates:0,missingCoordinates:0,unresolvedLocations:0,cachePersistence:true,immutablePracticePreparation:true};
 for(const c of candidates){let uk=false,located=false;for(const e of byCandidate.get(c.id)||[]){const source=c.locations[e.locationIndex];if(e.outcome==='recorded')stats.sourceCoordinates++;if(e.outcome==='geocoded')stats.geocoded++;if(e.outcome==='unresolved')stats.unresolvedLocations++;if(recordedUK(source)){uk=true;if(e.coordinates&&e.coordinates.latitude>=49.8&&e.coordinates.latitude<=61.1&&e.coordinates.longitude>=-8.3&&e.coordinates.longitude<=2.2)located=true;else stats.missingCoordinates++;}}if(uk)stats.candidatesWithUKLocation++;if(located)stats.candidatesWithCoordinates++;}
 return stats;
}
function validateBindings(corpus,s,{releaseId}){
 validatePracticeSnapshot(s,{releaseId,corpusVersion:corpus.version});const b=binding(corpus);
 if(b.fingerprint!==s.practiceFingerprint||b.entries.length!==s.entries.length)fail('practice fingerprint or count changed');
 const mapped=new Map(s.entries.map(e=>[e.candidateId+'|'+e.locationIndex,e]));
 for(const item of b.entries){
  const e=mapped.get(item.candidate.id+'|'+item.locationIndex);if(!e||e.practiceKey!==item.practiceKey)fail('practice ownership changed');
  if(validCoordinates(item.location)){
   if(e.outcome!=='recorded'||canonical(e.coordinates)!==canonical(coordinates(item.location)))fail('recorded source coordinates changed');
  }else if(e.outcome==='recorded')fail('invented source coordinates');
  else if(e.outcome==='geocoded'&&(!recordedUK(item.location)||code(item.location.postcode)!==code(e.coordinates.coordinateProvenance.postcode)))fail('geocode assigned to another practice');
 }
 const stats=coverage(b.candidates,s.entries);if(canonical(stats)!==canonical(s.coverage))fail('coverage differs from snapshot');return {binding:b,entries:mapped,coverage:stats};
}
function applyPracticeSnapshot(corpus,s,{releaseId}={}){
 // Complete validation first: rejected snapshots cannot partly mutate a corpus.
 const checked=validateBindings(corpus,s,{releaseId});
 for(const e of checked.binding.entries){const prepared=checked.entries.get(e.candidate.id+'|'+e.locationIndex);if(prepared.outcome==='geocoded')Object.assign(e.location,structuredClone(prepared.coordinates));}
 return structuredClone(checked.coverage);
}
async function createPracticeSnapshot(corpus,{geo,releaseId,preparedAt=new Date().toISOString()}={}){
 if(!geo||typeof geo.prepareLocations!=='function')fail('offline geography adapter required');
 const b=binding(corpus),clones=structuredClone(b.candidates);await geo.prepareLocations(clones);const byId=new Map(clones.map(c=>[c.id,c]));
 const entries=b.entries.map(item=>{
  const original=item.location,prepared=byId.get(item.candidate.id).locations[item.locationIndex],recorded=validCoordinates(original),resolved=validCoordinates(prepared);
  const point=recorded?coordinates(original):resolved?coordinates(prepared):null;
  // The mutable geo adapter timestamps preparation even for cached responses.
  // It supplies no independently recorded original lookup date. Keep that
  // unknown, separately from this snapshot's explicit preparation timestamp.
  if(!recorded&&point?.coordinateProvenance)point.coordinateProvenance.retrievedAt=null;
  return {candidateId:item.candidate.id,locationIndex:item.locationIndex,practiceKey:item.practiceKey,outcome:recorded?'recorded':resolved?'geocoded':'unresolved',coordinates:point,reason:resolved||recorded?null:recordedUK(original)?'No usable coordinates were available during frozen preparation.':'No supported UK practice postcode or recorded coordinates.'};
 });
 const snapshot={schemaVersion:1,format:FORMAT,releaseId,corpusVersion:corpus.version,practiceFingerprint:b.fingerprint,preparedAt,entries,coverage:coverage(b.candidates,entries)};validateBindings(corpus,snapshot,{releaseId});return snapshot;
}
module.exports={FORMAT,COORDINATE_FIELDS,createPracticeSnapshot,validatePracticeSnapshot,applyPracticeSnapshot,practiceFingerprint:corpus=>binding(corpus).fingerprint};
