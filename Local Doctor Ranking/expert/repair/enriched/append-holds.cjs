'use strict';
const {createHash}=require('node:crypto');
const {applyRepairs,hashValue,MANDATORY_HOLDS}=require('../../releases.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=s=>{throw Error('Hold amendment rejected: '+s);};
function compileHoldAmendment({baselineRows,baselineSha256,targetPacket,approval,primaryReceipt,releaseId}){
  for(const [label,p]of[['target',targetPacket],['approval',approval],['primary',primaryReceipt]])if(!p||sha(p.bytes)!==p.sha256)fail(label+' checksum');
  const prior=JSON.parse(targetPacket.bytes),decision=JSON.parse(approval.bytes),packet=structuredClone(prior);
  if(prior.baselineSha256!==baselineSha256||!releaseId||releaseId===prior.releaseId)fail('baseline or fresh release ID');
  if(decision.approved!==true||decision.action!=='hold-entire-affected-identity-group'||decision.scope!=='forward-and-safe-rollback'||!decision.reviewer?.trim()||!decision.decisionId?.trim()||!decision.reason?.trim()||decision.reassignmentApproved!==false||decision.registrationCorrectionApproved!==false||decision.primaryReceipt?.sha256!==primaryReceipt.sha256||!MANDATORY_HOLDS.includes(decision.sourceRecordId))fail('explicit independently reviewed mandatory hold');
  const row=baselineRows.filter(r=>r.id===decision.sourceRecordId);if(row.length!==1||hashValue(row[0])!==decision.baselineRowSha256)fail('source identity or baseline row changed');
  if(packet.holds.some(h=>h.sourceRecordId===decision.sourceRecordId))fail('hold already present');
  packet.holds.push({sourceRecordId:decision.sourceRecordId,reason:decision.reason});packet.releaseId=releaseId;
  const strip=p=>({...p,releaseId:null,holds:p.holds.filter(h=>h.sourceRecordId!==decision.sourceRecordId)});
  if(hashValue(strip(prior))!==hashValue(strip(packet)))fail('unrelated packet change');
  const applied=applyRepairs(baselineRows,packet,{baselineSha256,releaseId});
  return {packet,rows:applied.rows,report:{sourceRecordId:decision.sourceRecordId,approvalSha256:approval.sha256,primaryReceiptSha256:primaryReceipt.sha256,priorPacketSha256:targetPacket.sha256,baselineSha256,releaseId,holdCount:packet.holds.length,nonHoldContentUnchanged:true,existingHoldsUnchanged:true,applied:applied.summary}};
}
module.exports={compileHoldAmendment};
