'use strict';
// Pure proposal compiler. It does not read files, approve decisions, mutate a
// baseline, or deploy a release. Both source-bound reviews are prerequisites.
const {createHash}=require('node:crypto');
const {applyRepairs,hashValue,EVIDENCE_FIELDS,SUPPRESSIBLE_FIELDS}=require('../../releases.cjs');
const {validatePolicy}=require('../../reviewed-segmentation.cjs');
const {retainedSpans}=require('./source-spans.cjs');
const sha=s=>createHash('sha256').update(s).digest('hex');
const clone=v=>structuredClone(v);
const RECOVERABLE_KINDS=new Set(['qualification','academic-background','research-background','treatment-listing','biography']);
function fail(message){throw Error('Scope release rejected: '+message);}
function at(value,parts){for(const part of parts){if(value==null||!Object.hasOwn(value,part))return undefined;value=value[part];}return value;}
function exactSpans(text,spans,label){let end=0;for(const s of spans||[]){if(!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.start<end||s.end<=s.start||s.end>text.length||text.slice(s.start,s.end)!==s.text)fail(label+' bounds or wording');end=s.end;}return spans||[];}
function normalizedDecision(target,entry){
  const d=entry.decision;if(!entry.reviewer||d.approved!==true||d.targetId!==target.targetId||d.sourceTextSha256!==sha(target.sourceText))fail('unapproved or wrong-source decision');
  const omissions=exactSpans(target.sourceText,d.omissions,'omission'),kept=retainedSpans(target.sourceText,omissions);
  const recorded=exactSpans(target.sourceText,d.retainedSpans,'retained span');
  // Some reviewers omit whitespace-only gaps; no substantive character may go missing.
  if(kept.map(s=>s.text).join('').replace(/\s/g,'')!==recorded.map(s=>s.text).join('').replace(/\s/g,''))fail('retained spans are not the omission complement');
  if(!d.reason?.trim())fail('missing review rationale');
  if(d.recoveredSpans!==undefined){
    if(!Array.isArray(d.recoveredSpans))fail('recovered fragments');
    for(const s of exactSpans(target.sourceText,d.recoveredSpans,'recovered fragment'))if(!RECOVERABLE_KINDS.has(s.kind)||!omissions.some(o=>o.start<=s.start&&o.end>=s.end)||!s.text.trim()||s.text.length>5000)fail('recovery must be an independently reviewed literal fragment within an omission');
  }
  return {reviewer:entry.reviewer,decision:d,decisionSha256:hashValue(d),omissions,retainedSpans:kept,text:kept.map(s=>s.text).join('')};
}
function provenanceFor(target,origin,baselineSha256,reviewId){
  return {sourceUrl:origin?.sourceUrl||null,sourceLabel:origin?.sourceLabel||'Stored professional record',sourceDate:origin?.dates?.sourceDate??null,observedAt:origin?.dates?.observedAt??null,snapshotSha256:origin?.repairProvenance?.snapshotSha256||baselineSha256,parserVersion:'professional-scope-source-spans-v1',reviewId,sourceField:origin?.repairProvenance?.originalSourceField||origin?.field||target.field};
}
function rebindPolicy(oldText,newText,policy,omissions,reviewId){
  if(!policy)return {policy:null,status:'no-existing-policy'};
  validatePolicy(oldText,policy.reviewId,policy);
  const spans=[];
  for(const span of policy.spans){
    const overlap=omissions.filter(o=>o.start<span.end&&o.end>span.start);
    if(overlap.length){if(overlap.some(o=>o.start<=span.start&&o.end>=span.end))continue;fail('reviewed segmentation overlap requires explicit new policy review');}
    const shift=omissions.filter(o=>o.end<=span.start).reduce((n,o)=>n+o.end-o.start,0);
    spans.push({...span,start:span.start-shift,end:span.end-shift});
  }
  if(!spans.length)return {policy:null,status:'all-prior-policy-spans-explicitly-withheld'};
  const next={...policy,reviewId,textSha256:sha(newText),spans};validatePolicy(newText,reviewId,next);return {policy:next,status:'exact-unaffected-spans-rebound'};
}
function contextKey(item){return hashValue([item.kind,item.text.trim(),item.provenance.sourceUrl,item.provenance.sourceField||null,item.provenance.sourceDate,item.provenance.observedAt,item.activity||null]);}
function contextKind(field){return field==='nhs_base'?'affiliation':field==='clinical_interests'||field==='areas_of_interest'?'clinical-interest':field==='research_interests'?'research-interest':'biography';}
function prepareScopeRelease({baselineRows,baselineSha256,priorPacket,referenceRows,ledger,reviews,secondaryReviews,releaseId,holds}){
  if(!Array.isArray(baselineRows)||!Array.isArray(referenceRows)||!Array.isArray(ledger?.sourceTargets)||!Array.isArray(reviews)||!Array.isArray(secondaryReviews)||!releaseId||releaseId===priorPacket.releaseId)fail('complete inputs and a fresh release ID required');
  if(ledger.baselineSha256!==baselineSha256||priorPacket.baselineSha256!==baselineSha256)fail('baseline binding');
  const reviewMap=new Map();for(const entry of reviews){if(reviewMap.has(entry.decision?.targetId))fail('duplicate primary decision');reviewMap.set(entry.decision?.targetId,entry);}
  if(reviewMap.size!==ledger.sourceTargets.length)fail('every target needs one primary review');
  const secondMap=new Map();for(const d of secondaryReviews){if(secondMap.has(d.targetId))fail('duplicate secondary decision');secondMap.set(d.targetId,d);}
  const packet=clone(priorPacket);packet.releaseId=releaseId;packet.holds=clone(holds);packet.schemaVersion=2;packet.suppressions||=[];
  // Current guards may have added newly confirmed holds. Apply those to the old
  // packet copy solely to reconstruct professional fields, never to its saved bytes.
  const start=applyRepairs(baselineRows,{...clone(priorPacket),holds:clone(holds)},{baselineSha256,releaseId:priorPacket.releaseId});
  const current=new Map(start.rows.map(r=>[r.id,r])),reference=new Map(referenceRows.map(r=>[r.id,r])),base=new Map(baselineRows.map(r=>[r.id,r]));
  const patchMap=new Map(packet.patches.map(p=>[p.sourceRecordId+'|'+p.field,p])),sourceHistory=[],pending=new Map(),contextRemovals=new Map(),contextAdditions=new Map();
  const addContext=(id,item)=>{if(!contextAdditions.has(id))contextAdditions.set(id,[]);contextAdditions.get(id).push(item);};
  for(const target of ledger.sourceTargets){
    const entry=reviewMap.get(target.targetId),review=normalizedDecision(target,entry),second=secondMap.get(target.targetId);
    if(!second||second.approved!==true||second.primaryDecisionSha256!==review.decisionSha256||second.reviewer===entry.reviewer||!second.reviewer||!second.reviewId)fail('independent source-bound secondary approval missing for '+target.targetId);
    const ref=reference.get(target.sourceRecordId),original=base.get(target.sourceRecordId),row=current.get(target.sourceRecordId);
    if(!ref||!original||!row||hashValue(ref[target.field])!==target.expectedCurrentFieldHash||hashValue(original[target.field])!==target.baselineFieldHash||at(ref,target.path)!==target.sourceText)fail('source/field/path ownership changed for '+target.targetId);
    const record={targetId:target.targetId,sourceRecordId:target.sourceRecordId,field:target.field,path:target.path,sourceTextSha256:target.sourceTextSha256,expectedCurrentFieldHash:target.expectedCurrentFieldHash,baselineFieldHash:target.baselineFieldHash,primaryDecisionSha256:review.decisionSha256,primaryReviewer:entry.reviewer,secondaryReviewId:second.reviewId,secondaryReviewer:second.reviewer,omissions:review.omissions,retainedSpans:review.retainedSpans,origins:clone(target.origins),reason:review.decision.reason};
    if(!review.omissions.length){record.outcome='retained-without-mutation';sourceHistory.push(record);continue;}
    const reviewId='scope-'+sha(target.targetId+'|'+review.decisionSha256+'|'+second.reviewId).slice(0,32);
    const recoverReviewedFragments=()=>{if(review.decision.recoveredSpans!==undefined){
      const recovered=exactSpans(target.sourceText,review.decision.recoveredSpans,'recovered fragment');
      for(const span of recovered){
        if(!RECOVERABLE_KINDS.has(span.kind)||!review.omissions.some(o=>o.start<=span.start&&o.end>=span.end)||!span.text.trim()||span.text.length>5000)fail('recovery must be an independently reviewed literal fragment within an omission');
        for(const origin of target.origins){
          const item={kind:span.kind,text:span.text,provenance:provenanceFor(target,origin,baselineSha256,reviewId)};
          // Narrative fragments remain searchable, but cannot acquire performed
          // activity from a detached predicate or a removed promotional claim.
          if(span.kind==='biography'){
            const start=span.text.search(/\S/u),end=span.text.trimEnd().length;
            item.segmentationPolicy={schemaVersion:1,reviewId,textSha256:sha(span.text),spans:[{start,end,text:span.text.slice(start,end),mode:'source-context'}]};
            validatePolicy(item.text,reviewId,item.segmentationPolicy);
          }
          addContext(target.sourceRecordId,item);
        }
      }
      record.recoveredSpans=clone(recovered);
    }};
    if(target.field==='professional_context'){
      const cp=patchMap.get(target.sourceRecordId+'|professional_context'),source=at(ref,target.path.slice(0,-1));
      const indexes=(cp?.value||[]).flatMap((item,i)=>item.text===target.sourceText&&item.kind===source.kind&&item.provenance.reviewId===source.repairProvenance.reviewId?[i]:[]);
      if(!indexes.length){record.outcome='source-item-absent-from-this-release';sourceHistory.push(record);continue;}
      if(indexes.length!==1)fail('ambiguous context ownership');
      recoverReviewedFragments();
      const index=indexes[0],key=target.sourceRecordId+'|context|'+index;if(pending.has(key))fail('conflicting context correction');
      const item=clone(cp.value[index]);const policy=rebindPolicy(item.text,review.text,item.segmentationPolicy,review.omissions,reviewId);record.segmentation=policy.status;
      if(!review.text.trim()){if(!contextRemovals.has(target.sourceRecordId))contextRemovals.set(target.sourceRecordId,new Set());contextRemovals.get(target.sourceRecordId).add(index);record.outcome='withheld-source-item';}
      else{item.text=review.text;item.provenance={...item.provenance,parserVersion:'professional-scope-source-spans-v1',reviewId};if(policy.policy)item.segmentationPolicy=policy.policy;else delete item.segmentationPolicy;cp.value[index]=item;record.outcome='replaced-with-exact-retained-spans';record.newTextSha256=sha(item.text);}
      pending.set(key,true);sourceHistory.push(record);continue;
    }
    const field=target.field;
    if(field==='publications'&&(target.path.length!==2||target.path[0]!==field||!Number.isSafeInteger(target.path[1])||target.path[1]<0||target.path[1]>99999||!Array.isArray(original[field])))fail('unsupported publication leaf path');
    const suppressionField=field==='about_alternatives'||field==='publications'?target.path.slice(0,2).join('.'):field;
    if(at(row,target.path)!==target.sourceText)fail('source version differs in this release for '+target.targetId);
    recoverReviewedFragments();
    if(EVIDENCE_FIELDS.includes(field)){
      // Ordinary text replacements keep the original field provenance. Multiple
      // reviewed leaves in an array share one final baseline-bound field patch.
      const key=target.sourceRecordId+'|'+field;let work=pending.get(key);
      if(!work){const existing=patchMap.get(key);let value=existing?clone(existing.value):clone(original[field]);if(typeof value==='object'&&!Array.isArray(value)&&typeof value?.text==='string')value=value.text;work={value,existing,targets:[]};pending.set(key,work);}
      const p=target.path.slice(1).filter(x=>x!=='text');if(!p.length)work.value=review.text;else if(p.length===1&&Number.isSafeInteger(p[0])&&Array.isArray(work.value))work.value[p[0]]=review.text;else fail('unsupported text leaf path');
      work.targets.push({target,reviewId});record.outcome=review.text.trim()?'replaced-with-exact-retained-spans':'withheld-source-leaf';record.newTextSha256=sha(review.text);sourceHistory.push(record);continue;
    }
    if(!SUPPRESSIBLE_FIELDS.includes(field))fail('field remains protected: '+field);
    const sk=target.sourceRecordId+'|'+suppressionField;if(pending.has(sk))fail('conflicting suppression correction');pending.set(sk,true);
    const originalValue=at(original,suppressionField.split('.'));if(originalValue===undefined)fail('missing baseline suppression');
    if(packet.suppressions.some(s=>s.sourceRecordId===target.sourceRecordId&&(s.field===suppressionField||s.field.startsWith(suppressionField+'.')||suppressionField.startsWith(s.field+'.'))))fail('existing suppression conflict');
    packet.suppressions.push({sourceRecordId:target.sourceRecordId,field:suppressionField,beforeHash:hashValue(originalValue),reason:review.decision.reason.slice(0,2000),reviewId,sourceEvidence:[...new Map((target.origins||[]).map(o=>{const p={sourceRecordId:target.sourceRecordId,sourceField:o.field||suppressionField,snapshotSha256:o.repairProvenance?.snapshotSha256||baselineSha256};return [hashValue(p),p];})).values()],approved:true});
    if(review.text.trim())for(const origin of target.origins)addContext(target.sourceRecordId,{kind:contextKind(field),text:review.text,provenance:provenanceFor(target,origin,baselineSha256,reviewId)});
    record.outcome=review.text.trim()?'suppressed-original-restored-exact-context':'suppressed-original';record.newTextSha256=sha(review.text);sourceHistory.push(record);
  }
  for(const[key,work]of pending){if(!work||typeof work!=='object'||!work.targets)continue;const cut=key.lastIndexOf('|'),id=key.slice(0,cut),field=key.slice(cut+1),value=Array.isArray(work.value)?work.value.filter(v=>String(v).trim()):work.value;
    if(!value?.length){packet.patches=packet.patches.filter(p=>p.sourceRecordId!==id||p.field!==field);for(const t of work.targets){const record=sourceHistory.find(r=>r.targetId===t.target.targetId);record.outcome='suppressed-original-field';}const t=work.targets[0];packet.suppressions.push({sourceRecordId:id,field,beforeHash:hashValue(base.get(id)[field]),reason:'Whole source field withheld after independent exact-boundary review',reviewId:t.reviewId,sourceEvidence:[{sourceRecordId:id,sourceField:field,snapshotSha256:baselineSha256}],approved:true});}
    else{const t=work.targets[0],patch={sourceRecordId:id,field,beforeHash:hashValue(base.get(id)[field]),value,provenance:work.existing?{...work.existing.provenance,parserVersion:'professional-scope-source-spans-v1',reviewId:t.reviewId}:provenanceFor(t.target,t.target.origins[0],baselineSha256,t.reviewId),approved:true};const i=packet.patches.findIndex(p=>p.sourceRecordId===id&&p.field===field);if(i<0)packet.patches.push(patch);else packet.patches[i]=patch;}}
  for(const id of new Set([...contextRemovals.keys(),...contextAdditions.keys()])){let cp=packet.patches.find(p=>p.sourceRecordId===id&&p.field==='professional_context');if(!cp){cp={sourceRecordId:id,field:'professional_context',beforeHash:hashValue(base.get(id).professional_context),value:[],approved:true};packet.patches.push(cp);}const removed=contextRemovals.get(id)||new Set();cp.value=cp.value.filter((_,i)=>!removed.has(i));const seen=new Map(cp.value.map(item=>[contextKey(item),item]));for(const item of contextAdditions.get(id)||[]){const key=contextKey(item),existing=seen.get(key);if(!existing){cp.value.push(item);seen.set(key,item);}else if(existing.provenance.snapshotSha256!==item.provenance.snapshotSha256||existing.provenance.sourceLabel!==item.provenance.sourceLabel)fail('duplicate context has distinct source origin; review provenance representation');}if(!cp.value.length){if(base.get(id).professional_context?.length)fail('removing patch would restore original unsafe context');packet.patches=packet.patches.filter(p=>p!==cp);}}
  const applied=applyRepairs(baselineRows,packet,{baselineSha256,releaseId});
  return {packet,sourceHistory,summary:{targets:sourceHistory.length,outcomes:sourceHistory.reduce((a,r)=>(a[r.outcome]=(a[r.outcome]||0)+1,a),{}),applied:applied.summary},rows:applied.rows};
}
module.exports={prepareScopeRelease,normalizedDecision,rebindPolicy};
