'use strict';
// Post-hoc bounded recheck of the same frozen anchors. Not a new independent score.
module.exports={
  version:'expert-final-source-correction-regression-v1',
  reviewDate:'2026-10-06',
  originalLedger:'heldout-final-review.cjs',
  originalCorpusVersion:'expert-corpus-v1-ee9449e83c05a7a62986',
  sampleFingerprint:'a265c4d1a640702500046675589db0110506cb27a67a87e2c4de1741c04e81b9',
  normalizerSha256:'ce545346c2219034d4bd92d6ebc7981ef46854b40f945870572f45f77ecc1fd1',
  searchSha256:'cfb25b474eeffde67a24ce1480ab30144d1fa6b8a8cbe16f3f7d5090a5fa5cf6',
  scope:{sourceRows:314,fixedIdentityGroups:100,fixedClaimAnchors:200,retainedAnchors:200,currentPassages:220,
    fullCorpusRebuilt:false,newSample:false,paidApiCalls:0},
  method:'Build only the union of source rows in the final frozen identities and claims. Compare all current identity projections and complete text/type/attribute/qualifier signatures against the immutable first projection. Read all 15 changed claim projections; the other 185 are unchanged. Verify changed text constituents against original source values. Recheck the exact critical claim through the actual requirement matrix using both corrected passages and the legacy mixed passage.',
  identityChanges:[],
  changedClaimIndices:[16,20,30,39,61,65,74,75,78,91,99,106,110,112,115],
  changedClaimsSourceSupported:15,
  unchangedClaims:185,
  residualCriticalSourceFindings:0,
  criticalCorrection:{
    claimIndex:99,sourceRecordId:'bupa_33512',field:'about',
    originalFailure:'A joined diploma and current-role sentence made operative endoscopy documented practice.',
    correction:'Qualification wording is retained as training. The distinct pre-term-birth clinic statement is retained as clinical practice. No source assertion was invented and neither original constituent was dropped.',
    matrixChecks:[
      {input:'corrected source passages',requirement:'Endoscopy',actual:'potential',expected:'potential',pass:true},
      {input:'corrected source passages',requirement:'Pre-term birth screening',actual:'documented',expected:'documented',pass:true},
      {input:'legacy mixed passage',requirement:'Endoscopy',actual:'potential',expected:'potential',pass:true},
      {input:'legacy mixed passage',requirement:'Pre-term birth screening',actual:'documented',expected:'documented',pass:true}
    ]
  },
  earlierModalityRegressions:[
    {round:'four',claimIndex:159,requirement:'Ultrasound',actual:'unknown',pass:true},
    {round:'four',claimIndex:191,requirement:'Ultrasound',actual:'unknown',pass:true}
  ],
  conclusion:'The disclosed critical source error is corrected before display on the reviewed code. No critical source/identity finding remains in the same fixed final anchors. This is a targeted correction regression: the independent first-pass result remains 199/200 (99.5%) with one critical error, and its zero-critical failure is never overwritten.',
  limitations:[
    'The bounded build has no new full-corpus version or semantic index. Deployment must use the reviewed normalizer and rebuild its corpus/index.',
    'This recheck does not reassess every usefulness or presentation issue and does not establish broad extraction recall.',
    'The 100 identity reviews are source-record checks, not current regulator confirmation.',
    'Clinical suitability, availability, independence and approval still require human qualification.'
  ]
};
