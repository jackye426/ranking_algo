'use strict';
// Pure compiler for independently reviewed field exclusions and exact recovery.
const {createHash}=require('node:crypto');
const {applyRepairs,hashValue,EVIDENCE_FIELDS,SUPPRESSIBLE_FIELDS}=require('../../releases.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex'),digest=/^[a-f0-9]{64}$/;
function fail(s){throw Error('Field safety rejected: '+s);}
function at(row,field){const parts=field.split('.');let value=row;for(const p of parts){if(!value||typeof value!=='object'||!Object.hasOwn(value,p))fail('missing source field');value=value[p];}return value;}
function sameTarget(a,b){return a.sourceRecordId===b.sourceRecordId&&a.field===b.field;}
function proof(d){
  if(d.approved!==true||!d.decisionId||!d.reviewId?.trim()||!d.reviewer?.trim()||!d.reason?.trim()||!digest.test(d.beforeHash)||!Array.isArray(d.sourceEvidence)||!d.sourceEvidence.length)fail('unapproved or incomplete field decision');
  for(const p of d.sourceEvidence)if(p.sourceRecordId!==d.sourceRecordId||!p.sourceField?.trim()||!digest.test(p.snapshotSha256))fail('source evidence ownership');
}
function contextOnlyPreparation(prior,prepared,targetSha,baselineSha,releaseId){
  if(!prepared||prepared.lineage?.targetPacketSha256!==targetSha||prepared.lineage?.baselineSha256!==baselineSha||prepared.packet?.releaseId!==releaseId||!Array.isArray(prepared.outcomes))fail('unbound context preparation');
  const withoutContext=p=>({...p,releaseId:null,patches:p.patches.filter(x=>x.field!=='professional_context')});
  if(hashValue(withoutContext(prior))!==hashValue(withoutContext(prepared.packet)))fail('context preparation changed other fields or safety decisions');
  const removed=new Map();for(const o of prepared.outcomes){if(!o.itemSha256)continue;if(o.outcome!=='remove-reviewed-item'||!o.decisionSha256||!o.reviewer||!o.reviewId)fail('unreviewed context removal');const key=o.sourceRecordId+'|'+o.itemSha256;if(removed.has(key))fail('duplicate prepared context removal');removed.set(key,o);}
  const expected=prior.patches.filter(x=>x.field==='professional_context').map(p=>({...p,value:p.value.filter(i=>!removed.delete(p.sourceRecordId+'|'+hashValue(i)))})).filter(p=>p.value.length);
  if(removed.size||hashValue(expected)!==hashValue(prepared.packet.patches.filter(x=>x.field==='professional_context')))fail('context preparation is not exact approved removals');
  return structuredClone(prepared.packet);
}
function compileFieldSafety({baselineRows,baselineSha256,targetPacket,decisions,releaseId,contextPreparation}){
  if(!targetPacket||sha(targetPacket.bytes)!==targetPacket.sha256)fail('target packet hash');
  const prior=JSON.parse(targetPacket.bytes),packet=contextPreparation?contextOnlyPreparation(prior,contextPreparation,targetPacket.sha256,baselineSha256,releaseId):structuredClone(prior),rows=new Map(baselineRows.map(r=>[r.id,r]));
  if(rows.size!==baselineRows.length||prior.baselineSha256!==baselineSha256||!releaseId||releaseId===prior.releaseId||!Array.isArray(decisions))fail('baseline, decisions or fresh release ID');
  packet.releaseId=releaseId;packet.schemaVersion=2;packet.suppressions||=[];
  const seen=new Set(),outcomes=[];
  for(const d of decisions){
    proof(d);const key=d.sourceRecordId+'|'+d.field;if(seen.has(key))fail('duplicate field decision');seen.add(key);
    const parts=d.field.split('.');
    if(!SUPPRESSIBLE_FIELDS.includes(parts[0])||parts.length>2||parts.length===2&&(parts[0]!=='about_alternatives'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(parts[1])||['constructor','prototype','__proto__'].includes(parts[1])))fail('protected field');
    const row=rows.get(d.sourceRecordId);if(!row||hashValue(at(row,d.field))!==d.beforeHash)fail('original field changed');
    const bindings=d.currentBindings?.filter(x=>x.packetSha256===targetPacket.sha256);if(bindings?.length!==1)fail('packet-specific field binding');const binding=bindings[0];
    const patches=packet.patches.filter(p=>sameTarget(p,d)),suppressions=packet.suppressions.filter(s=>sameTarget(s,d));
    if(patches.length>1||suppressions.length>1||hashValue(patches[0]??null)!==binding.patchHash||hashValue(suppressions[0]??null)!==binding.suppressionHash)fail('current patch or suppression changed');
    if(d.action==='exclude-field'){
      if(d.retainedSpans?.length||d.provenance)fail('exclusion cannot restore text');
      if(patches.length)packet.patches=packet.patches.filter(p=>p!==patches[0]);
      if(!suppressions.length)packet.suppressions.push({sourceRecordId:d.sourceRecordId,field:d.field,beforeHash:d.beforeHash,reason:d.reason,reviewId:d.reviewId,sourceEvidence:structuredClone(d.sourceEvidence),approved:true});
      outcomes.push({decisionId:d.decisionId,sourceRecordId:d.sourceRecordId,field:d.field,decisionSha256:hashValue(d),outcome:suppressions.length?'already-excluded':'excluded',supersededPatchSha256:patches[0]?hashValue(patches[0]):null,canonicalFieldPreserved:['specialty','nhs_base'].includes(d.field)});
    }else if(d.action==='replace-field-with-reviewed-spans'){
      if(!EVIDENCE_FIELDS.includes(d.field)||suppressions.length)fail('replacement field protected or previously suppressed');
      if(typeof d.sourceText!=='string'||sha(d.sourceText)!==d.sourceTextSha256||!Array.isArray(d.retainedSpans)||!d.retainedSpans.length)fail('source text or retained spans');
      let end=0;for(const s of d.retainedSpans){if(!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.start<end||s.end<=s.start||s.end>d.sourceText.length||d.sourceText.slice(s.start,s.end)!==s.text||!s.text.trim())fail('retained span wording/order');end=s.end;}
      const p=d.provenance;if(!p||p.reviewId!==d.reviewId||p.parserVersion!=='professional-source-field-repair-v1'||!d.sourceEvidence.some(s=>s.snapshotSha256===p.snapshotSha256&&s.sourceField===p.sourceField))fail('replacement provenance differs from reviewed source');
      const value=d.retainedSpans.length===1?d.retainedSpans[0].text:d.retainedSpans.map(s=>s.text);
      if(patches.length)packet.patches=packet.patches.filter(x=>x!==patches[0]);
      packet.patches.push({sourceRecordId:d.sourceRecordId,field:d.field,beforeHash:d.beforeHash,value,provenance:structuredClone(p),approved:true});
      outcomes.push({decisionId:d.decisionId,sourceRecordId:d.sourceRecordId,field:d.field,decisionSha256:hashValue(d),outcome:'exact-reviewed-source-span-replacement',sourceTextSha256:d.sourceTextSha256,retainedSpans:structuredClone(d.retainedSpans),supersededPatchSha256:patches[0]?hashValue(patches[0]):null});
    }else fail('unsupported field action');
  }
  const applied=applyRepairs(baselineRows,packet,{baselineSha256,releaseId});
  return {packet,rows:applied.rows,outcomes,summary:{decisions:decisions.length,newExclusions:outcomes.filter(x=>x.outcome==='excluded').length,alreadyExcluded:outcomes.filter(x=>x.outcome==='already-excluded').length,exactReplacements:outcomes.filter(x=>x.outcome==='exact-reviewed-source-span-replacement').length,holdsUnchanged:hashValue(packet.holds)===hashValue(prior.holds),applied:applied.summary},lineage:{targetPacketSha256:targetPacket.sha256,baselineSha256,...(contextPreparation?{contextPreparationOutcomesSha256:hashValue(contextPreparation.outcomes)}:{})}};
}
module.exports={compileFieldSafety};
