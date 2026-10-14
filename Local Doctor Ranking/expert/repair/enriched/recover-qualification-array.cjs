'use strict';
// Pure, source-bound containment. The baseline array remains in private history;
// independently reviewed safe strings become qualification context, never role.
const {createHash}=require('node:crypto');
const {applyRepairs,hashValue}=require('../../releases.cjs');
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=/^[a-f0-9]{64}$/;
const primaryDecision=d=>{const {secondaryReview,...primary}=d;return primary;};
function fail(message){throw Error('Qualification recovery rejected: '+message);}
function compileQualificationRecovery({baselineRows,baselineSha256,targetPacket,decisions,releaseId,scopePreparation}){
  if(!targetPacket||sha(targetPacket.bytes)!==targetPacket.sha256)fail('target packet hash');
  const prior=JSON.parse(targetPacket.bytes),rows=new Map(baselineRows.map(r=>[r.id,r]));
  if(rows.size!==baselineRows.length||prior.baselineSha256!==baselineSha256||!releaseId||releaseId===prior.releaseId||!Array.isArray(decisions))fail('baseline or fresh release binding');
  // Approvals bind the original immutable packet. Compile source-copy
  // containment here, with its own independent reviews, before restoration.
  // An arbitrary externally modified packet is never accepted as a rebind.
  if(scopePreparation&&Object.keys(scopePreparation).some(k=>!['referenceRows','ledger','reviews','secondaryReviews','holds'].includes(k)))fail('unsupported scope preparation input');
  const scope=scopePreparation?require('./prepare-scope-release.cjs').prepareScopeRelease({baselineRows,baselineSha256,priorPacket:prior,releaseId,referenceRows:scopePreparation.referenceRows,ledger:scopePreparation.ledger,reviews:scopePreparation.reviews,secondaryReviews:scopePreparation.secondaryReviews,holds:scopePreparation.holds}):null;
  const packet=scope?scope.packet:structuredClone(prior);
  packet.releaseId=releaseId;packet.schemaVersion=2;packet.suppressions||=[];
  const seen=new Set(),outcomes=[];
  for(const d of decisions){
    if(d.approved!==true||d.action!=='withhold-qualification-array-and-recover-reviewed-entries'||!['qualifications','detailed_qualifications'].includes(d.field)||!d.sourceRecordId||!d.reviewId?.trim()||!d.reviewer?.trim()||!d.reason?.trim()||!digest.test(d.beforeHash))fail('incomplete reviewed decision');
    const key=d.sourceRecordId+'|'+d.field;if(seen.has(key))fail('duplicate decision');seen.add(key);
    const secondary=d.secondaryReview;
    if(!secondary||secondary.approved!==true||!secondary.reviewer?.trim()||secondary.reviewer===d.reviewer||!secondary.reviewId?.trim()||secondary.primaryDecisionSha256!==hashValue(primaryDecision(d)))fail('independent secondary review');
    const row=rows.get(d.sourceRecordId),original=row?.[d.field];
    if(!Array.isArray(original)||hashValue(original)!==d.beforeHash||hashValue(d.sourceValues)!==d.beforeHash||!Array.isArray(d.entries)||d.entries.length!==original.length)fail('complete original array');
    const bound=d.currentBindings?.filter(b=>b.packetSha256===targetPacket.sha256);
    const existingSuppression=packet.suppressions.filter(s=>s.sourceRecordId===d.sourceRecordId&&s.field===d.field);
    const context=packet.patches.filter(p=>p.sourceRecordId===d.sourceRecordId&&p.field==='professional_context');
    // Each approval binds the same immutable input. Earlier approved array
    // recoveries in this pure call may append context; they are not source drift.
    const originalSuppression=prior.suppressions?.filter(s=>s.sourceRecordId===d.sourceRecordId&&s.field===d.field)||[];
    const originalContext=prior.patches.filter(p=>p.sourceRecordId===d.sourceRecordId&&p.field==='professional_context');
    if(bound?.length!==1||existingSuppression.length>1||context.length>1||originalSuppression.length>1||originalContext.length>1||hashValue(originalSuppression[0]??null)!==bound[0].suppressionHash||hashValue(originalContext[0]??null)!==bound[0].contextPatchHash)fail('current packet binding');
    if(packet.patches.some(p=>p.sourceRecordId===d.sourceRecordId&&p.field===d.field))fail('protected field replacement');
    const p=d.provenance;
    if(!p||p.reviewId!==d.reviewId||p.parserVersion!=='reviewed-qualification-array-recovery-v1'||p.sourceField!==d.field||!digest.test(p.snapshotSha256)||!Array.isArray(d.sourceEvidence)||!d.sourceEvidence.length||d.sourceEvidence.some(s=>s.sourceRecordId!==d.sourceRecordId||s.sourceField!==d.field||s.snapshotSha256!==p.snapshotSha256))fail('source provenance');
    const indexes=new Set(),retained=[],withheld=[];
    for(const entry of d.entries){
      if(!Number.isSafeInteger(entry.index)||entry.index<0||entry.index>=original.length||indexes.has(entry.index)||hashValue(entry.sourceValue)!==hashValue(original[entry.index])||!entry.reason?.trim())fail('source entry ownership');
      indexes.add(entry.index);
      if(entry.action==='retain'){
        if(d.field==='qualifications'){
          if(typeof entry.sourceValue!=='string'||!entry.sourceValue.trim()||entry.sourceValue.length>5000)fail('unsupported qualification restoration');
          retained.push({...entry,recoveries:[{sourcePath:[],text:entry.sourceValue}]});
        }else{
          // Structured entries have real field boundaries. Review every literal
          // value; never compose degree, institution and year into a new quote.
          if(!entry.sourceValue||typeof entry.sourceValue!=='object'||Array.isArray(entry.sourceValue)||!Array.isArray(entry.recoveries))fail('unsupported qualification restoration');
          const fields=Object.keys(entry.sourceValue).filter(k=>entry.sourceValue[k]!=null&&entry.sourceValue[k]!=='');
          if(entry.recoveries.length!==fields.length||!fields.length)fail('complete literal detailed fields required');
          const seenFields=new Set();
          for(const r of entry.recoveries){
            if(!Array.isArray(r.sourcePath)||r.sourcePath.length!==1||!fields.includes(r.sourcePath[0])||typeof r.text!=='string'||!r.text.trim()||r.text.length>5000||r.text!==entry.sourceValue[r.sourcePath[0]])fail('literal detailed field ownership');
            if(seenFields.has(r.sourcePath[0]))fail('duplicate detailed field');seenFields.add(r.sourcePath[0]);
          }
          retained.push(entry);
        }
      }else if(entry.action==='withhold')withheld.push(entry);
      else fail('unresolved entry');
    }
    // A copied unsafe qualification needs its own explicit context-removal
    // decision. Never hide it by changing only the original array.
    for(const entry of withheld)if(typeof entry.sourceValue==='string'&&context[0]?.value.some(i=>i.kind==='qualification'&&i.text.trim()===entry.sourceValue.trim()))fail('unsafe context copy remains');
    if(!existingSuppression.length)packet.suppressions.push({sourceRecordId:d.sourceRecordId,field:d.field,beforeHash:d.beforeHash,reason:d.reason.slice(0,2000),reviewId:d.reviewId,sourceEvidence:structuredClone(d.sourceEvidence),approved:true});
    let cp=context[0];
    if(retained.length&&!cp){if(row.professional_context?.length)fail('baseline context has no explicit projection');cp={sourceRecordId:d.sourceRecordId,field:'professional_context',beforeHash:hashValue(row.professional_context),value:[],approved:true};packet.patches.push(cp);}
    const additions=[];
    for(const entry of retained.sort((a,b)=>a.index-b.index))for(const recovery of entry.recoveries){
      const sourceField=[d.field,entry.index,...recovery.sourcePath].join('.');
      const item={kind:'qualification',text:recovery.text,provenance:{...structuredClone(p),sourceField}};
      const itemKey=hashValue([item.kind,item.text.trim(),item.provenance.sourceUrl,item.provenance.sourceField,item.provenance.sourceDate,item.provenance.observedAt,null]);
      if(cp.value.some(i=>hashValue([i.kind,i.text.trim(),i.provenance.sourceUrl,i.provenance.sourceField||null,i.provenance.sourceDate,i.provenance.observedAt,i.activity||null])===itemKey))fail('duplicate context requires explicit provenance review');
      cp.value.push(item);additions.push({index:entry.index,sourceField,itemSha256:hashValue(item)});
    }
    outcomes.push({sourceRecordId:d.sourceRecordId,field:d.field,decisionSha256:hashValue(d),beforeHash:d.beforeHash,retained:additions,withheld:withheld.map(e=>({index:e.index,sourceValueSha256:hashValue(e.sourceValue),reason:e.reason})),originalPreservedPrivately:true});
  }
  if(hashValue(packet.holds)!==hashValue(prior.holds)||prior.suppressions?.some(s=>!packet.suppressions.some(t=>hashValue(t)===hashValue(s))))fail('safety decisions changed');
  const applied=applyRepairs(baselineRows,packet,{baselineSha256,releaseId});
  return {packet,rows:applied.rows,outcomes,sourceHistory:scope?.sourceHistory||[],summary:{decisions:outcomes.length,retainedEntries:outcomes.reduce((n,o)=>n+new Set(o.retained.map(e=>e.index)).size,0),retainedPassages:outcomes.reduce((n,o)=>n+o.retained.length,0),withheldEntries:outcomes.reduce((n,o)=>n+o.withheld.length,0),holdsUnchanged:true,scope:scope?.summary||null,applied:applied.summary},lineage:{targetPacketSha256:targetPacket.sha256,baselineSha256}};
}
module.exports={compileQualificationRecovery,primaryDecision};
