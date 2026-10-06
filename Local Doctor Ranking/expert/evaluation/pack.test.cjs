'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {scenarios}=require('./scenarios.cjs');
const enrichments=require('../enrichments.cjs');
const ledger=require('./review-ledger.cjs');
const heldout=require('./heldout-review.cjs');
const roundTwo=require('./heldout-round-two-review.cjs');
const roundThree=require('./heldout-round-three-review.cjs');
const roundFour=require('./heldout-round-four-review.cjs');
const roundFive=require('./heldout-round-five-review.cjs');
const secondRetrievalPack=require('./holdout-round-two.cjs');
const finalRetrievalPack=require('./holdout-final.cjs');
const {scoreCase}=require('./evaluate.cjs');
test('frozen evaluation holds fourteen development and twenty-eight held-out fictional briefs across seven families',()=>{
  assert.equal(scenarios.filter(s=>s.split==='development').length,14);
  assert.equal(scenarios.filter(s=>s.split==='holdout').length,28);
  assert.equal(new Set(scenarios.map(s=>s.id)).size,42);
  const families=new Set(scenarios.map(s=>s.family));assert.equal(families.size,7);
  for(const family of families){assert.equal(scenarios.filter(s=>s.family===family&&s.split==='development').length,2);assert.equal(scenarios.filter(s=>s.family===family&&s.split==='holdout').length,4);}
  assert.ok(scenarios.every(s=>s.fictional));
});
test('second retrieval holdout has fresh fictional scenarios and preserves the same seven-family coverage',()=>{
  assert.equal(secondRetrievalPack.scenarios.length,28);
  assert.equal(new Set(secondRetrievalPack.scenarios.map(s=>s.id)).size,28);
  const conversation=s=>JSON.stringify([s.message,s.followups||[]]);
  const previousText=new Set(scenarios.map(conversation));
  for(const scenario of secondRetrievalPack.scenarios){
    assert.equal(scenario.split,'holdout');assert.equal(scenario.fictional,true);assert.ok(!previousText.has(conversation(scenario)));
  }
  for(const family of new Set(scenarios.map(s=>s.family)))assert.equal(secondRetrievalPack.scenarios.filter(s=>s.family===family).length,4);
});
test('targeted enrichment is identity-anchored, dated by observation, and bounded by reviewed source limitations',()=>{
  for(const e of enrichments){assert.ok(e.sourceRecordId||e.registration);assert.match(e.sourceUrl,/^https:\/\//);assert.equal(e.verified,true);assert.ok(e.review.identityBasis);assert.ok(e.review.limitations.length);assert.ok(e.observedAt);assert.ok(!/@|\b(?:fee|available for engagement)\b/i.test(e.text));}
  const trial=enrichments.find(e=>e.field==='targeted_publication');assert.equal(trial.sourceDate,'2010-05-11');assert.notEqual(trial.sourceDate,trial.observedAt);
  assert.ok(enrichments.some(e=>e.type==='relationship'&&e.relatedOrganisation==='Check 4 Cancer'));
});

test('final pack is fixed, distinct and preserves the evaluation limitations',()=>{
  const previous=new Set([...scenarios,...secondRetrievalPack.scenarios].map(s=>JSON.stringify([s.message,s.followups||[]])));
  assert.equal(finalRetrievalPack.scenarios.length,28);
  assert.equal(new Set(finalRetrievalPack.scenarios.map(s=>s.id)).size,28);
  const families=new Set(finalRetrievalPack.scenarios.map(s=>s.family));assert.equal(families.size,7);
  for(const family of families)assert.equal(finalRetrievalPack.scenarios.filter(s=>s.family===family).length,4);
  assert.ok(finalRetrievalPack.scenarios.every(s=>!previous.has(JSON.stringify([s.message,s.followups||[]]))));
  assert.match(finalRetrievalPack.authorship,/already been implemented/);
  assert.match(finalRetrievalPack.finalAuditPolicy,/remaining failure is reported/);
});
test('immutable initial source review retains adverse cases rather than only accepted examples',()=>{
  assert.equal(ledger.identityReviews.length,100);assert.equal(ledger.claimReviews.length,200);
  assert.equal(ledger.identityReviews.filter(r=>r.reviewDecision==='registration-body-correction-required').length,10);
  assert.ok(ledger.claimReviews.some(r=>r.expectedTreatment==='publication-link'));
  assert.ok(ledger.claimReviews.some(r=>r.expectedTreatment==='exclude'));
});
test('first disjoint holdout does not hide interpretation failures behind source fidelity',()=>{
  assert.equal(heldout.identityReviews.length,100);assert.equal(heldout.claimReviews.length,200);
  assert.equal(heldout.firstPass.sourceFidelity.pass,200);
  assert.equal(heldout.firstPass.claimTreatment.pass,168);
  assert.equal(heldout.claimReviews.filter(r=>r.treatmentDecision==='correction-required').length,32);
  assert.match(heldout.firstPass.gate,/FAIL/);
  assert.equal(heldout.independence.decisionsFrozenBeforeCorrections,true);
});
test('second independent review separates source precision from conservative usefulness misses',()=>{
  assert.equal(roundTwo.identityReviews.length,100);assert.equal(roundTwo.claimReviews.length,200);
  assert.equal(roundTwo.firstPass.sourceTextFidelity.pass,200);
  assert.equal(roundTwo.firstPass.sourceSupport.pass,194);
  assert.equal(roundTwo.firstPass.safeTreatment.pass,192);
  assert.equal(roundTwo.firstPass.usefulnessMisses.anchors,19);
  assert.equal(roundTwo.firstPass.fullyWithheldAnchors,0);
  assert.match(roundTwo.firstPass.gate,/FAIL/);
});
test('third independent review cannot pass by reaching claim precision while identity conflicts remain',()=>{
  assert.equal(roundThree.identityReviews.length,100);assert.equal(roundThree.claimReviews.length,200);
  assert.equal(roundThree.firstPass.sourceTextFidelity.pass,200);
  assert.equal(roundThree.firstPass.sourceSupport.pass,196);
  assert.equal(roundThree.firstPass.identityHandling.pass,97);
  assert.equal(roundThree.firstPass.identityHandling.criticalConflicts,3);
  assert.equal(roundThree.identityReviews.filter(r=>r.decision==='critical-source-identity-conflict').length,3);
  assert.equal(roundThree.firstPass.usefulnessMisses.anchors,20);
  assert.equal(roundThree.independence.candidateIdentitiesSourceRowsAndExactTextsDisjointFromAllEarlierSamples,true);
  assert.match(roundThree.firstPass.gate,/FAIL/);
});
test('fourth review separates withheld coverage from emitted-claim precision and preserves failures',()=>{
  assert.equal(roundFour.identityReviews.length,100);assert.equal(roundFour.claimReviews.length,200);
  assert.equal(roundFour.firstPass.fullyWithheldAnchors,8);
  assert.deepEqual(roundFour.firstPass.sourceSupport,{pass:187,total:192});
  assert.equal(roundFour.firstPass.identityHandling.criticalConflicts,1);
  assert.equal(roundFour.claimReviews.filter(r=>r.sourceSupport==='not-emitted').length,8);
  assert.match(roundFour.firstPass.gate,/FAIL/);
});
test('scoring rejects invented current-practice confirmation, AI approval and wrong-candidate citations',()=>{
  const scenario={id:'quality-control',split:'holdout',family:'control',expectations:{requirementLabels:[],unknownKinds:['currentPractice']},knownRelevantSourceIds:['r1']};
  const result={id:'c1',sourceRecordIds:['r1'],qualificationStatus:'approved',relationshipStatus:'conflict-free',requirementMatrix:[{kind:'currentPractice',status:'documented'}],evidence:[{candidateId:'other'}]};
  const score=scoreCase(scenario,{requirements:[]},{results:[result]}, {candidates:[],passages:[]});
  for(const name of ['no-ai-approval','no-conflict-free','current-practice-not-assumed','correct-candidate-evidence','no-inferred:currentPractice'])assert.equal(score.checks.find(c=>c.name===name).pass,false);
});

test('fifth independent review preserves unsupported interpretations despite identity and text fidelity passing',()=>{
  assert.equal(roundFive.identityReviews.length,100);assert.equal(roundFive.claimReviews.length,200);
  assert.deepEqual(roundFive.firstPass.identityHandling,{pass:100,total:100,criticalConflicts:0});
  assert.deepEqual(roundFive.firstPass.sourceSupport,{pass:193,total:200});
  assert.equal(roundFive.firstPass.sourceTextFidelity.pass,200);
  assert.equal(roundFive.firstPass.fullyWithheldAnchors,0);
  assert.equal(roundFive.claimReviews.filter(r=>r.sourceSupport==='correction-required').length,7);
  assert.match(roundFive.firstPass.gate,/FAIL/);
});
test('identity quarantine and missing references cannot silently improve known-candidate recall',()=>{
  const scenario={id:'reference-control',split:'development',family:'control',expectations:{requirementLabels:[]},knownRelevantSourceIds:['r1','r2','r3']};
  const c1={id:'c1',sourceRecordIds:['r1'],needsIdentityReview:false,requirementMatrix:[],evidence:[]};
  const c2={id:'c2',sourceRecordIds:['r2'],needsIdentityReview:true};
  const score=scoreCase(scenario,{requirements:[]},{results:[c1]},{candidates:[c1,c2],passages:[]});
  assert.equal(score.knownRecallAt20,1/3);
  assert.deepEqual(score.referenceAvailability.map(r=>r.state),['searchable','held-for-identity-review','missing']);
});

test('final independent precision cannot hide a critical qualification-to-practice error',()=>{
  const final=require('./heldout-final-review.cjs');
  assert.equal(final.identityReviews.length,100);assert.equal(final.claimReviews.length,200);
  assert.deepEqual(final.firstPass.sourceSupport,{pass:199,total:200});
  assert.equal(final.firstPass.numericalSourcePrecisionGate,true);
  assert.equal(final.firstPass.criticalClaimErrors,1);assert.equal(final.firstPass.zeroCriticalGate,false);
  assert.equal(final.firstPass.fullyWithheldAnchors,0);
  assert.equal(final.independence.noFurtherResampling,true);
  assert.match(final.firstPass.gate,/FAIL/);
});

test('known adverse regressions remain distinct from immutable holdout results and quality limitations',()=>{
  const regression=require('./post-systemic-regression-review.cjs');
  assert.equal(regression.findings.length,126);assert.equal(regression.identityRegressions.length,14);
  assert.equal(regression.summary.originalCriticalIdentityFailuresRemaining,0);
  assert.equal(regression.summary.originalCriticalInterpretationFailuresRemaining,0);
  assert.equal(regression.summary.originalDisplayQualityFindingsRemaining,29);
  assert.equal(regression.summary.identityQuarantinedClaimAnchors,4);
  assert.match(regression.method,/not independent/);
});

test('post-final correction keeps the original score and checks both qualification and real practice',()=>{
  const correction=require('./post-final-source-correction.cjs');
  assert.equal(correction.scope.newSample,false);assert.equal(correction.scope.fixedClaimAnchors,200);
  assert.equal(correction.scope.retainedAnchors,200);assert.equal(correction.identityChanges.length,0);
  assert.equal(correction.changedClaimsSourceSupported+correction.unchangedClaims,200);
  assert.equal(correction.residualCriticalSourceFindings,0);
  assert.ok(correction.criticalCorrection.matrixChecks.every(c=>c.pass));
  assert.match(correction.conclusion,/first-pass result remains 199\/200/);
});
test('scoring checks supplied technology presence and meaning independently of clinical labels',()=>{
  const scenario={id:'technology-control',split:'development',family:'control',expectations:{requirementLabels:[]},expectedTechnologyPresent:true,expectedTechnologyPattern:'sensor'};
  const empty=scoreCase(scenario,{requirements:[]},{results:[]},{candidates:[],passages:[]});
  assert.equal(empty.checks.find(c=>c.name==='technology-context-preserved').pass,false);
  assert.equal(empty.checks.find(c=>c.name==='technology-context-meaning').pass,false);
  const present=scoreCase(scenario,{requirements:[{kind:'technology',text:'sensor for a specified workflow'}]},{results:[]},{candidates:[],passages:[]});
  assert.equal(present.checks.find(c=>c.name==='technology-context-preserved').pass,true);
  assert.equal(present.checks.find(c=>c.name==='technology-context-meaning').pass,true);
});
