'use strict';
// Produces review proposals only. Interpretation/presentation decisions are
// never carried forward; each reviewer must acknowledge exact-source reuse.
const {createHash}=require('node:crypto');
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function prepareReviewTransfer({previousPacket,nextPacket,previousReview,previousMapping,nextMapping}){
  if(previousPacket.packSha256!==nextPacket.packSha256||!previousPacket.packSha256)throw Error('Frozen brief pack changed');
  if(!previousReview.reviewer||previousReview.independent!==true)throw Error('Independent named source reviewer required');
  const oldCases=new Map(previousPacket.cases.map(c=>[c.caseId,c])),oldGrades=new Map(previousReview.judgements.map(j=>[j.profileToken,j])),proposals=[],pending=[];
  for(const c of nextPacket.cases){const old=oldCases.get(c.caseId),brief=digest({message:c.message,followups:c.followups,expectation:c.expectation});
    for(const p of c.profiles){const identity=nextMapping.profiles[p.profileToken]?.candidateId;if(!identity)throw Error('Missing next identity binding');const evidence=digest(p.evidence),provenance=nextMapping.profiles[p.profileToken]?.evidenceFingerprint,eligible=old&&/^[a-f0-9]{64}$/.test(provenance||'')&&brief===digest({message:old.message,followups:old.followups,expectation:old.expectation})?old.profiles.filter(o=>previousMapping.profiles[o.profileToken]?.candidateId===identity&&previousMapping.profiles[o.profileToken]?.evidenceFingerprint===provenance&&digest(o.evidence)===evidence):[];
      if(eligible.length>1)throw Error('Ambiguous previous source profile');const prior=eligible[0],j=prior&&oldGrades.get(prior.profileToken);
      if(!j||j.grade===null||j.attributionConcern||![0,1,2,3].includes(j.grade)){pending.push({caseId:c.caseId,profileToken:p.profileToken,reason:eligible.length?'Prior decision unresolved or unavailable':'Brief, identity or complete source evidence changed'});continue;}
      const tokens=new Set(p.evidence.map(e=>e.token));if(j.caseId!==c.caseId||!j.reason||j.centralEvidence.some(t=>!tokens.has(t))||j.grade>=2&&!j.centralEvidence.length)throw Error('Prior judgement is not source-owned');
      proposals.push({caseId:c.caseId,profileToken:p.profileToken,previousProfileToken:prior.profileToken,reviewer:previousReview.reviewer,briefSha256:brief,completeEvidenceSha256:evidence,completeProvenanceFingerprint:provenance,previousJudgementSha256:digest(j),proposedJudgement:{...structuredClone(j),profileToken:p.profileToken},reuseRequiresReviewerAcknowledgement:true});
    }
  }
  return {schemaVersion:1,status:'Exact-source reuse proposals; no new judgement made',reviewer:previousReview.reviewer,proposals,pending,reset:['All interpretation checks','All presentation honesty checks','All unresolved attribution decisions'],limitations:['Identity, complete visible evidence and private source/snapshot provenance must match; similarity, same names and partial quotations are insufficient.','Changed source views require new independent review. Existing adjudications must be rebound separately to exact unchanged briefs/evidence.']};
}
module.exports={prepareReviewTransfer,digest};
