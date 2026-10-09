'use strict';
// Pure, narrow recovery of reviewed professional spans from a suppressed About.
const {createHash}=require('node:crypto');
const {applyRepairs,hashValue}=require('../../releases.cjs');
const {validatePolicy}=require('../../reviewed-segmentation.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex'),digest=/^[a-f0-9]{64}$/;
function fail(s){throw Error('Context recovery rejected: '+s);}
function core(d){const {secondaryReview,...rest}=d;return rest;}
function validateDecision(d){
  if(!d||d.approved!==true||d.action!=='recover-suppressed-about-as-context'||!d.decisionId||!d.reviewId?.trim()||!d.reviewer?.trim()||!d.reason?.trim()||d.field!=='about'||!digest.test(d.beforeHash))fail('unapproved or incomplete decision');
  const s=d.secondaryReview;
  if(!s||s.approved!==true||!s.reviewer?.trim()||s.reviewer===d.reviewer||!s.reviewId?.trim()||s.primaryDecisionSha256!==hashValue(core(d)))fail('independent secondary approval');
  if(typeof d.sourceText!=='string'||sha(d.sourceText)!==d.sourceTextSha256||!Array.isArray(d.retainedSpans)||!d.retainedSpans.length)fail('source text or retained spans');
  let end=0;for(const p of d.retainedSpans){if(!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end)||p.start<end||p.end<=p.start||p.end>d.sourceText.length||d.sourceText.slice(p.start,p.end)!==p.text||!p.text.trim())fail('literal retained span or order');if(p.segmentationPolicy){validatePolicy(p.text,d.reviewId,p.segmentationPolicy);if(p.segmentationPolicy.spans.some(s=>s.mode!=='source-context'))fail('recovery policy must preserve neutral source context');}end=p.end;}
  if(d.professionSpans!==undefined){if(!Array.isArray(d.professionSpans))fail('profession spans');let priorEnd=0;for(const p of d.professionSpans){if(!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end)||p.start<priorEnd||p.end<=p.start||p.end>d.sourceText.length||d.sourceText.slice(p.start,p.end)!==p.text||!p.text.trim()||p.text.length>5000||p.segmentationPolicy||!d.retainedSpans.some(s=>s.start<=p.start&&s.end>=p.end))fail('literal independently reviewed profession span');priorEnd=p.end;}}
  const p=d.provenance;
  if(!p||p.reviewId!==d.reviewId||p.parserVersion!=='suppressed-professional-biography-recovery-v1'||!digest.test(p.snapshotSha256)||!p.sourceField?.trim())fail('source provenance');
}
function compileContextRecovery({baselineRows,baselineSha256,targetPacket,decisions,releaseId}){
  if(!targetPacket||sha(targetPacket.bytes)!==targetPacket.sha256)fail('target packet hash');
  const prior=JSON.parse(targetPacket.bytes),packet=structuredClone(prior),rows=new Map(baselineRows.map(r=>[r.id,r]));
  if(rows.size!==baselineRows.length||prior.baselineSha256!==baselineSha256||!releaseId||releaseId===prior.releaseId||!Array.isArray(decisions))fail('baseline, fresh release ID or decisions');
  packet.releaseId=releaseId;packet.schemaVersion=2;const seen=new Set(),outcomes=[];
  for(const d of decisions){
    validateDecision(d);if(seen.has(d.sourceRecordId))fail('duplicate source decision');seen.add(d.sourceRecordId);
    const row=rows.get(d.sourceRecordId);if(!row||typeof row.about!=='string'||hashValue(row.about)!==d.beforeHash||row.about!==d.sourceText)fail('original About differs from reviewed source');
    const suppressions=packet.suppressions.filter(s=>s.sourceRecordId===d.sourceRecordId&&s.field==='about');
    const patches=packet.patches.filter(p=>p.sourceRecordId===d.sourceRecordId&&p.field==='professional_context');
    const bound=d.currentBindings?.filter(b=>b.packetSha256===targetPacket.sha256);
    if(bound?.length!==1||suppressions.length!==1||patches.length>1||hashValue(suppressions[0])!==bound[0].suppressionHash||hashValue(patches[0]??null)!==bound[0].contextPatchHash)fail('current suppression or context binding');
    if(packet.patches.some(p=>p.sourceRecordId===d.sourceRecordId&&p.field==='about'))fail('About replacement conflicts with suppression');
    let patch=patches[0];if(!patch){if(row.professional_context?.length)fail('baseline context requires explicit prior projection');patch={sourceRecordId:d.sourceRecordId,field:'professional_context',beforeHash:hashValue(row.professional_context),value:[],approved:true};packet.patches.push(patch);}
    const added=[],already=[];
    const spans=[...d.retainedSpans.map(span=>({kind:'biography',span})),...(d.professionSpans||[]).map(span=>({kind:'profession',span}))];
    for(const {kind,span} of spans){const item={kind,text:span.text,provenance:structuredClone(d.provenance),...(span.segmentationPolicy?{segmentationPolicy:structuredClone(span.segmentationPolicy)}:{})};
      const matching=patch.value.filter(i=>i.kind===item.kind&&i.text.trim()===item.text.trim()&&i.provenance.sourceUrl===item.provenance.sourceUrl&&(i.provenance.sourceField||null)===(item.provenance.sourceField||null)&&i.provenance.sourceDate===item.provenance.sourceDate&&i.provenance.observedAt===item.provenance.observedAt);
      if(matching.length>1)fail('ambiguous existing source span');
      if(matching.length){if(matching[0].provenance.snapshotSha256!==item.provenance.snapshotSha256||matching[0].provenance.sourceLabel!==item.provenance.sourceLabel)fail('equivalent wording has different source origin');if(item.segmentationPolicy){const a=matching[0].segmentationPolicy,b=item.segmentationPolicy;if(!a||hashValue({...a,reviewId:null})!==hashValue({...b,reviewId:null}))fail('existing source item requires an explicit policy amendment');}already.push(hashValue(matching[0]));}
      else{patch.value.push(item);added.push(hashValue(item));}
    }
    outcomes.push({decisionId:d.decisionId,sourceRecordId:d.sourceRecordId,decisionSha256:hashValue(d),sourceTextSha256:d.sourceTextSha256,retainedSpans:structuredClone(d.retainedSpans),professionSpans:structuredClone(d.professionSpans||[]),addedItemSha256s:added,alreadyPresentItemSha256s:already,suppressionPreservedSha256:hashValue(suppressions[0]),primaryReviewer:d.reviewer,secondaryReviewer:d.secondaryReview.reviewer});
  }
  if(hashValue(packet.holds)!==hashValue(prior.holds)||hashValue(packet.suppressions)!==hashValue(prior.suppressions))fail('safety decisions changed');
  const applied=applyRepairs(baselineRows,packet,{baselineSha256,releaseId});
  return {packet,rows:applied.rows,outcomes,summary:{decisions:decisions.length,addedItems:outcomes.reduce((n,o)=>n+o.addedItemSha256s.length,0),alreadyPresent:outcomes.reduce((n,o)=>n+o.alreadyPresentItemSha256s.length,0),holdsUnchanged:true,suppressionsUnchanged:true,applied:applied.summary},lineage:{targetPacketSha256:targetPacket.sha256,baselineSha256}};
}
module.exports={compileContextRecovery,primaryDecision:core};
