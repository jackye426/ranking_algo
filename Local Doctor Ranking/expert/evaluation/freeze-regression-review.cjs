'use strict';
// Records the evaluator's completed review; never rewrites an independent ledger.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const specs=[['initial','review-ledger.cjs'],['holdout','heldout-review.cjs'],...['two','three','four','five'].map(n=>['holdout-round-'+n,'heldout-round-'+n+'-review.cjs'])];
const remainingQuality={
  'holdout-round-three':[4,8,107,118,122,176,197],
  'holdout-round-four':[73,79,115,116,161,170],
  'holdout-round-five':[60,66,67,75,80,107,121,128,135,137,151,156,160,179,190,195]
};
const held=new Set(['initial:23','initial:119','holdout:65','holdout-round-two:50']);
const findings=[];
for(const [round,file]of specs){
  const ledger=require('./'+file);
  const projection=JSON.parse(fs.readFileSync(path.join(__dirname,'../.cache/evaluation-regression-final-'+round+'.json'),'utf8'));
  if(projection.corpusVersion!=='expert-corpus-v1-ee9449e83c05a7a62986')throw Error('Unexpected reviewed corpus');
  ledger.claimReviews.forEach((review,position)=>{
    if((review.classificationDecision||review.treatmentDecision||review.treatment)!=='correction-required')return;
    const index=review.index??position;
    const claim=projection.claims.find(c=>c.anchor.id===(review.anchorId||review.id))||projection.claims[index];
    const residual=remainingQuality[round]?.includes(index)||false;
    let disposition=residual?'residual-display-quality':claim.current.length?'original-defect-corrected':'selected-fragment-withheld';
    if(held.has(round+':'+index))disposition='identity-quarantined';
    if(round==='initial'&&index===100)disposition='booking-fragment-removed-professional-continuation-retained';
    findings.push({round,index,anchorId:claim.anchor.id,inputHash:claim.anchor.inputHash,
      originalFinding:review.supportFinding||review.qualityFinding||review.note,
      disposition,criticalOriginalInterpretationResolved:true,
      currentEvidenceIds:claim.current.map(p=>p.id),currentTypes:[...new Set(claim.current.map(p=>p.type))],
      ...(round==='initial'&&[145,149].includes(index)?{additionalQualityFinding:'The selected fragment is withheld, but other broken word fragments from the same source field remain. Source extraction quality is not fully repaired.'}:{})
    });
  });
}
const identityRegressions=[
  ...[
    ['hca_2701','HCPC','CS023816',true],['bupa_4050','HCPC','PYL039042',false],
    ['hca_2720','HCPC','PYL039383',false],['hca_1285','HCPC','PYL041091',false],
    ['hca_107','HCPC','PYL043963',false],['hca_1041','HCPC','PYL046247',false],
    ['hca_1128','HCPC','PH102381',false],['hca_1059','HCPC','PH102479',false],
    ['hca_175','HCPC','PH104088',false],['hca_2290','HCPC','PH105645',false]
  ].map(([sourceRecordId,body,identifier,held])=>({sourceRecordIds:[sourceRecordId],disposition:'typed-registration-preserved-invalid-GMC-dropped',registration:{body,identifier},held})),
  {sourceRecordIds:['bupa_21909','bupa_3767'],disposition:'quarantined',reason:'reviewed-source-registration-conflict'},
  {sourceRecordIds:['bupa_27553'],disposition:'quarantined',reason:'profile-name-mismatch and reviewed-source-name-conflict'},
  {sourceRecordIds:['bupa_5348'],disposition:'quarantined',reason:'profile-name-mismatch and reviewed-source-name-conflict'},
  {sourceRecordIds:['bupa_3846'],disposition:'quarantined',reason:'hcpc-profession-role-conflict and reviewed-source-registration-conflict; raw PH value not silently repaired'}
];
const report={version:'expert-post-systemic-adverse-regression-v1',reviewDate:'2026-10-06',corpusVersion:'expert-corpus-v1-ee9449e83c05a7a62986',
  method:'Read current text, type, attributes and qualifiers for all 126 previously adverse claim anchors. Separately inspect all 14 adverse identity groups. For every unmatched anchor, build only its raw source rows and inspect candidate quarantine and same-field passages to distinguish changed packing from withholding. This is post-fix regression, not independent validation; no first-pass decision is edited.',
  findings,identityRegressions,
  summary:{previouslyAdverseClaimsReviewed:findings.length,adverseIdentityGroupsReviewed:identityRegressions.length,
    originalCriticalInterpretationFailuresRemaining:0,originalCriticalIdentityFailuresRemaining:0,
    originalDisplayQualityFindingsRemaining:findings.filter(f=>f.disposition==='residual-display-quality').length,
    relatedSourceFieldsWithAdditionalBrokenFragments:2,
    identityQuarantinedClaimAnchors:findings.filter(f=>f.disposition==='identity-quarantined').length},
  limitations:[
    'The numerical source-support and identity scores belong to the immutable independent ledgers. This regression cannot turn them into independent passes.',
    'Zero remaining original critical defects is scoped to the reviewed adverse anchors. The final independent sample separately exposed qualification-to-practice promotion and remains failed until its bounded correction is verified.',
    'Generic marketing, personal-biography tails, broken source excerpts and placeholder address strings remain a presentation/data-cleaning backlog. Conservative professional-background classifications also miss useful actual research, clinical work and relationships.',
    'Withholding and identity quarantine reduce coverage. The four held adverse anchors are not counted as recovered source evidence.',
    'None of these checks establishes current registration, clinical suitability, assessor approval or independence.'
  ]};
report.reviewFingerprint=createHash('sha256').update(JSON.stringify(report)).digest('hex');
const output=path.join(__dirname,'post-systemic-regression-review.cjs');
if(fs.existsSync(output))throw Error('Immutable review already exists');
fs.writeFileSync(output,"'use strict';\n// Frozen post-fix review of previously disclosed failures; not an independent sample.\nmodule.exports="+JSON.stringify(report,null,2)+';\n');
console.log(JSON.stringify(report.summary));
