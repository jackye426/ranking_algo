'use strict';
// Pure source-item withholding. Review decisions are inputs, never outputs.
// No database/filesystem/network access; source arrays are never joined by index.
const {createHash}=require('node:crypto');
const {applyRepairs,hashValue}=require('../../releases.cjs');
const {retainedSpans}=require('./source-spans.cjs');
const {rebindPolicy}=require('./prepare-scope-release.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x);
function fail(message){throw Error('Context withholding rejected: '+message);}
function pinned(input,label){if(!input||!Buffer.isBuffer(input.bytes)&&typeof input.bytes!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256)||sha(input.bytes)!==input.sha256)fail(label+' bytes/hash');try{return JSON.parse(input.bytes);}catch{fail(label+' JSON');}}
function patchFor(packet,id,lookup){if(!lookup.has(packet)){const index=new Map();for(const p of packet.patches){if(p.field!=='professional_context')continue;if(index.has(p.sourceRecordId))fail('duplicate context patch');index.set(p.sourceRecordId,p);}lookup.set(packet,index);}return lookup.get(packet).get(id);}
function sameOrigin(a,b){return a.kind===b.kind&&a.provenance?.reviewId===b.provenance?.reviewId&&a.provenance?.snapshotSha256===b.provenance?.snapshotSha256&&a.provenance?.sourceUrl===b.provenance?.sourceUrl&&a.provenance?.sourceField===b.provenance?.sourceField;}
function exactItem(packet,id,digest,lookup){const patch=patchFor(packet,id,lookup),items=(patch?.value||[]).filter(x=>hashValue(x)===digest);if(items.length>1)fail('ambiguous exact context item');return items[0];}
function emptyBaseline(value){return value==null||Array.isArray(value)&&value.length===0;}
function lineageContext(lineage,targetSha,baselineSha){
  if(!lineage)return null;
  const report=pinned(lineage.report,'scope report'),history=pinned(lineage.history,'scope history'),prior=pinned(lineage.priorPacket,'scope prior packet');
  if(report.repairsSha256!==targetSha||report.sourceHistorySha256!==lineage.history.sha256||report.priorPacketSha256!==lineage.priorPacket.sha256||report.baselineSha256!==baselineSha||prior.baselineSha256!==baselineSha||!Array.isArray(history))fail('scope lineage binding');
  return {report,history,prior,reportSha256:lineage.report.sha256,historySha256:lineage.history.sha256};
}
function bindItem({decision,source,target,targetSha,baselineRow,lineage,lookup}){
  const original=exactItem(source,decision.sourceRecordId,decision.itemSha256,lookup);
  if(!original||original.kind!==decision.kind||hashValue(original.provenance)!==decision.provenanceSha256)fail('reviewed source item/provenance changed');
  const direct=exactItem(target,decision.sourceRecordId,decision.itemSha256,lookup);
  if(direct)return {outcome:'remove-reviewed-item',itemSha256:decision.itemSha256,lineage:'byte-equivalent-source-item'};
  let expected=original,record=null;
  if(lineage){
    const prior=exactItem(lineage.prior,decision.sourceRecordId,decision.itemSha256,lookup),history=lineage.history.filter(h=>h.sourceRecordId===decision.sourceRecordId&&h.field==='professional_context'&&h.sourceTextSha256===sha(original.text)&&h.origins?.some(o=>o.repairProvenance?.reviewId===original.provenance.reviewId&&o.repairProvenance?.snapshotSha256===original.provenance.snapshotSha256));
    if(history.length>1)fail('ambiguous reviewed span lineage');record=history[0];
    if(record){
      if(!record.primaryReviewer||!record.secondaryReviewer||record.primaryReviewer===record.secondaryReviewer||!record.primaryDecisionSha256||!record.secondaryReviewId)fail('unreviewed source span lineage');
      const spans=retainedSpans(original.text,record.omissions);
      if(hashValue(spans)!==hashValue(record.retainedSpans))fail('source span lineage wording/offsets changed');
      if(record.outcome==='source-item-absent-from-this-release'){
        if(prior)fail('false absent-item lineage');
      }else if(!prior)fail('scope lineage has no exact prior source item');
      if(record.outcome==='withheld-source-item'){
        if(spans.some(s=>s.text.trim()))fail('whole-item omission retained content');
        expected=null;
      }else if(record.outcome==='replaced-with-exact-retained-spans'){
        const reviewId='scope-'+sha(record.targetId+'|'+record.primaryDecisionSha256+'|'+record.secondaryReviewId).slice(0,32),text=spans.map(s=>s.text).join('');
        if(sha(text)!==record.newTextSha256)fail('changed retained source text');
        expected=clone(original);expected.text=text;expected.provenance={...expected.provenance,parserVersion:'professional-scope-source-spans-v1',reviewId};
        const rebound=rebindPolicy(original.text,text,original.segmentationPolicy,record.omissions,reviewId);if(rebound.policy)expected.segmentationPolicy=rebound.policy;else delete expected.segmentationPolicy;
        const current=exactItem(target,decision.sourceRecordId,hashValue(expected),lookup);if(!current)fail('current item differs from exact reviewed source span lineage');
        return {outcome:'remove-reviewed-item',itemSha256:hashValue(expected),lineage:'verified-reviewed-source-spans',sourceHistoryTarget:record.targetId,scopeReportSha256:lineage.reportSha256};
      }else if(record.outcome==='retained-without-mutation')fail('retained source item unexpectedly absent');
      else if(record.outcome!=='source-item-absent-from-this-release')fail('unsupported source lineage outcome');
    }
    if(prior&&!record)fail('reviewed item disappeared without bound source history');
  }
  const currentPatch=patchFor(target,decision.sourceRecordId,lookup);
  if((currentPatch?.value||[]).some(x=>sameOrigin(x,original)||expected&&sameOrigin(x,expected)))fail('stale or changed current source item');
  if(!currentPatch&&!emptyBaseline(baselineRow.professional_context))fail('absence would ignore populated baseline context');
  if(record?.outcome==='withheld-source-item')return {outcome:'already-withheld-by-reviewed-spans',itemSha256:null,lineage:'verified-reviewed-source-spans',sourceHistoryTarget:record.targetId,scopeReportSha256:lineage.reportSha256};
  if(!decision.absentAllowedPacketSha256s?.includes(targetSha))fail('absent item lacks explicit packet-scoped disposition');
  return {outcome:'source-addition-absent-from-this-release',itemSha256:null,lineage:record?'verified-absent-source-history':'explicit-packet-bound-absence'};
}
function compileContextWithholding({baselineRows,baselineSha256,sourcePacket,targetPacket,decisions,lineage,releaseId}){
  const source=pinned(sourcePacket,'review source packet'),target=pinned(targetPacket,'target packet'),lookup=new WeakMap();
  if(!releaseId||releaseId===target.releaseId||!Array.isArray(baselineRows)||!Array.isArray(decisions)||source.baselineSha256!==baselineSha256||target.baselineSha256!==baselineSha256)fail('baseline, decisions or fresh release ID');
  const base=new Map(baselineRows.map(r=>[r.id,r]));if(base.size!==baselineRows.length)fail('duplicate baseline identity');
  const boundLineage=lineageContext(lineage,targetPacket.sha256,baselineSha256),seenIds=new Set(),seenSources=new Set(),remove=new Map(),outcomes=[];
  for(const d of decisions){
    if(d.approved!==true||d.action!=='withhold-context-item'||!d.reviewer?.trim()||!d.reviewId?.trim()||!d.reason?.trim()||!d.decisionId||d.sourcePacketSha256!==sourcePacket.sha256||!d.targetPacketSha256s?.includes(targetPacket.sha256)||!base.has(d.sourceRecordId))fail('unapproved or wrong-packet/source decision');
    const approvals=d.currentBindings?.filter(x=>x.packetSha256===targetPacket.sha256);
    if(approvals?.length!==1)fail('exact current item approval missing or ambiguous');
    const expected=approvals[0];
    if(!['remove-reviewed-item','already-withheld-by-reviewed-spans','source-addition-absent-from-this-release'].includes(expected.outcome)||expected.outcome==='remove-reviewed-item'&&!/^[a-f0-9]{64}$/.test(expected.itemSha256)||expected.outcome!=='remove-reviewed-item'&&expected.itemSha256!==null)fail('invalid current item approval');
    const key=d.sourceRecordId+'|'+d.itemSha256;if(seenIds.has(d.decisionId)||seenSources.has(key))fail('duplicate withholding decision');seenIds.add(d.decisionId);seenSources.add(key);
    const binding=bindItem({decision:d,source,target,targetSha:targetPacket.sha256,baselineRow:base.get(d.sourceRecordId),lineage:boundLineage,lookup});
    if(binding.itemSha256!==expected.itemSha256||binding.outcome!==expected.outcome)fail('current item differs from approved binding');
    if(binding.itemSha256){if(!remove.has(d.sourceRecordId))remove.set(d.sourceRecordId,new Set());const set=remove.get(d.sourceRecordId);if(set.has(binding.itemSha256))fail('conflicting decisions remove same current item');set.add(binding.itemSha256);}
    outcomes.push({decisionId:d.decisionId,reviewId:d.reviewId,reviewer:d.reviewer,decisionSha256:hashValue(d),sourceRecordId:d.sourceRecordId,sourceItemSha256:d.itemSha256,sourceProvenanceSha256:d.provenanceSha256,reason:d.reason,...binding});
  }
  const packet=clone(target);packet.releaseId=releaseId;
  for(const[id,hashes]of remove){const patch=patchFor(packet,id,lookup),before=patch.value.length;patch.value=patch.value.filter(x=>!hashes.has(hashValue(x)));if(before-patch.value.length!==hashes.size)fail('removal count mismatch');if(!patch.value.length){if(!emptyBaseline(base.get(id).professional_context))fail('empty patch would restore populated baseline');packet.patches=packet.patches.filter(p=>p!==patch);}}
  const applied=applyRepairs(baselineRows,packet,{baselineSha256,releaseId});
  return {packet,outcomes,rows:applied.rows,summary:{decisions:decisions.length,removedItems:outcomes.filter(x=>x.itemSha256).length,alreadyWithheld:outcomes.filter(x=>x.outcome==='already-withheld-by-reviewed-spans').length,absentAdditions:outcomes.filter(x=>x.outcome==='source-addition-absent-from-this-release').length,changedContextRows:remove.size,holdsUnchanged:hashValue(packet.holds)===hashValue(target.holds),suppressionsUnchanged:hashValue(packet.suppressions)===hashValue(target.suppressions),applied:applied.summary},lineage:{sourcePacketSha256:sourcePacket.sha256,targetPacketSha256:targetPacket.sha256,baselineSha256,...(boundLineage?{scopeReportSha256:boundLineage.reportSha256,scopeHistorySha256:boundLineage.historySha256}:{})}};
}
function proposeContextWithholding({baselineRows,baselineSha256,sourcePacket,targetPacket,requests,lineage}){
  const source=pinned(sourcePacket,'proposal source packet'),target=pinned(targetPacket,'proposal target packet'),lookup=new WeakMap();
  if(!Array.isArray(baselineRows)||!Array.isArray(requests)||source.baselineSha256!==baselineSha256||target.baselineSha256!==baselineSha256)fail('proposal inputs or baseline');
  const base=new Map(baselineRows.map(r=>[r.id,r]));if(base.size!==baselineRows.length)fail('duplicate baseline identity');
  const boundLineage=lineageContext(lineage,targetPacket.sha256,baselineSha256),seen=new Set();
  return requests.map(r=>{
    if(!r.proposalId||!r.reason?.trim()||r.sourcePacketSha256!==sourcePacket.sha256||!base.has(r.sourceRecordId))fail('unbound proposal request');
    const key=r.sourceRecordId+'|'+r.itemSha256;if(seen.has(key))fail('duplicate proposal source');seen.add(key);
    const item=exactItem(source,r.sourceRecordId,r.itemSha256,lookup);if(!item)fail('proposal source item missing');
    // This flag permits describing an absence, never accepting it for release.
    // The returned proposal is explicitly unapproved and has no reviewer.
    const proposedDecision={sourceRecordId:r.sourceRecordId,itemSha256:r.itemSha256,provenanceSha256:hashValue(item.provenance),kind:item.kind,absentAllowedPacketSha256s:[targetPacket.sha256]};
    const binding=bindItem({decision:proposedDecision,source,target,targetSha:targetPacket.sha256,baselineRow:base.get(r.sourceRecordId),lineage:boundLineage,lookup});
    return {proposalId:r.proposalId,approved:false,reviewStatus:'awaiting-independent-source-decision',action:'withhold-context-item',reason:r.reason,sourceRecordId:r.sourceRecordId,sourcePacketSha256:sourcePacket.sha256,itemSha256:r.itemSha256,provenanceSha256:hashValue(item.provenance),kind:item.kind,targetPacketSha256s:[targetPacket.sha256],absentAllowedPacketSha256s:binding.outcome==='source-addition-absent-from-this-release'?[targetPacket.sha256]:[],currentBindings:[{packetSha256:targetPacket.sha256,itemSha256:binding.itemSha256,outcome:binding.outcome}],lineage:binding,source:{text:item.text,provenance:clone(item.provenance)}};
  });
}
module.exports={compileContextWithholding,proposeContextWithholding};
