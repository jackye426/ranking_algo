'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {profileFingerprint,releaseNeutralFingerprint}=require('./harness.cjs');
const {prepareReviewTransfer}=require('./review-transfer.cjs');
const passage={id:'evidence-one',candidateId:'person',text:'I perform cardiac CT.',type:'clinical-practice',field:'about',qualifiers:[],attributes:{activity:['image interpretation']},sources:[{sourceRecordId:'source-one',field:'about',sourceUrl:'https://example.org',repairProvenance:{releaseId:'old',reviewId:'review-one',snapshotSha256:'same',beforeHash:'same'}}]};
test('release-neutral fingerprint removes only repair release IDs',()=>{
 const next=structuredClone(passage);next.sources[0].repairProvenance.releaseId='new';
 assert.notEqual(profileFingerprint([passage]),profileFingerprint([next]));
 assert.equal(releaseNeutralFingerprint([passage]),releaseNeutralFingerprint([next]));
 for(const edit of [p=>p.text='I teach cardiac CT.',p=>p.sources[0].repairProvenance.reviewId='other',p=>p.sources[0].repairProvenance.snapshotSha256='other',p=>p.type='professional-background']){
  const changed=structuredClone(next);edit(changed);assert.notEqual(releaseNeutralFingerprint([passage]),releaseNeutralFingerprint([changed]));
 }
});
test('review transfer proposes only proven release-only reuse with acknowledgement',()=>{
 const old=structuredClone(passage),next=structuredClone(passage);next.sources[0].repairProvenance.releaseId='new';
 const evidence=[{token:'E001',text:old.text,type:old.type,sources:[{field:'about',provider:'Example',sourceDate:null}]}];
 const caseOld={caseId:'case',message:'Find CT practice.',followups:[],expectation:{outcome:'discover'},profiles:[{profileToken:'old',evidence}]};
 const options={previousPacket:{packSha256:'pack',cases:[caseOld]},nextPacket:{packSha256:'pack',cases:[{...structuredClone(caseOld),profiles:[{profileToken:'new',evidence:structuredClone(evidence)}]}]},previousReview:{reviewer:'independent-A',independent:true,judgements:[{caseId:'case',profileToken:'old',grade:3,centralEvidence:['E001'],reason:'Explicit performed CT.',attributionConcern:false}]},previousMapping:{profiles:{old:{candidateId:'person',evidenceFingerprint:profileFingerprint([old]),releaseNeutralFingerprint:releaseNeutralFingerprint([old])}}},nextMapping:{profiles:{new:{candidateId:'person',evidenceFingerprint:profileFingerprint([next]),releaseNeutralFingerprint:releaseNeutralFingerprint([next])}}}};
 const proposal=prepareReviewTransfer(options);
 assert.equal(proposal.proposals.length,1);
 assert.equal(proposal.proposals[0].reuseBasis,'proven-release-metadata-only');
 assert.equal(proposal.proposals[0].reuseRequiresReviewerAcknowledgement,true);
 const altered=structuredClone(next);altered.sources[0].repairProvenance.reviewId='other';
 options.nextMapping.profiles.new.releaseNeutralFingerprint=releaseNeutralFingerprint([altered]);
 assert.equal(prepareReviewTransfer(options).proposals.length,0);
});
