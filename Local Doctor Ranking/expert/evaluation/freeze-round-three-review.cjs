'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sample = require('../.cache/evaluation-holdout-round-three-projected.json');
const identity = new Map([
  [31, { note: 'A same-name source contamination survives the shared GMC merge: the linked Ramsay Dr Christopher Wong is a nephrologist with GMC 6038036, while the grouped surgeon has recorded GMC 3613441. The Ramsay NHS base is also attached to the surgeon. Same-name/shared raw identifiers are not sufficient to approve this mixed record.', urls: ['https://www.ramsayhealth.co.uk/specialists/dr-christopher-wong'], excerpt: 'GMC Number 6038036' }],
  [36, { note: 'Robert Moverley and Robert Morley are different source identities. Nuffield identifies Moverley as an orthopaedic shoulder/elbow surgeon, GMC 6166627; Ramsay identifies Morley as a podiatric surgeon, HCPC CH14313. The combined candidate retains both registrations and the wrong podiatric specialty without an identity hold.', urls: ['https://www.nuffieldhealth.com/consultants/mr-robert-moverley', 'https://www.ramsayhealth.co.uk/specialists/mr-robert-morley'], excerpt: 'GMC number: 6166627; HCPC CH14313' }],
  [45, { note: 'A linked HCA profile belongs to Eric Clarke, an Australian-trained sports physiotherapist, while the candidate is Enrico Clarke, a clinical oncologist. Both raw registrations and the unrelated HCA profile survive without an identity hold. This is a conflicting source attachment, not an inference that dual registration itself is invalid.', urls: ['https://www.hcahealthcare.co.uk/finder/stepconsultantprofile/mr-eric-clarke', 'https://www.spirehealthcare.com/spire-southampton-hospital/consultants/dr-enrico-clarke-c7117994'], excerpt: 'Eric Clarke; Physiotherapy', failedFreshFetch: ['https://www.spirehealthcare.com/spire-southampton-hospital/consultants/dr-enrico-clarke-c7117994', 'https://www.phin.org.uk/consultants/309199'] }]
]);
const unsupported = new Map([
  [16, 'Conducting sub-specialty fellowship training is classified as research, although this passage describes training received and no research work.'],
  [69, 'Experience in public health, health education and support work in higher education is classified as training received. No received qualification or training is stated in this passage.'],
  [73, 'Training patients in autoinjector/nasal-spray use during consultations is classified as the clinician receiving training; retain the clinical-service/patient-education context.'],
  [135, 'Cancer is extracted as a clinical-interest attribute from an institutional cancer-research-centre appointment. The passage supports academic/research leadership, not a direct clinical cancer-interest claim.']
]);
const quality = new Map([
  [4, 'Source excerpt ends mid-phrase after Aortic. Research involvement is stated, but the incomplete clinical topic should not be presented as precise expertise.'],
  [8, 'Two source sentences are truncated. The investigator/publication assertions are present, but incomplete endings impair display and specificity.'],
  [107, 'Generic experience and safe-care marketing is labelled clinical interest without a specific clinical topic.'],
  [118, 'A statement about parenthood is faithfully retained but is unnecessary personal biography rather than expertise evidence.'],
  [122, 'Aspirational learning/treatment marketing is retained as clinical interest without a specific clinical topic.'],
  [176, 'A telephone/video service is presented as a location with literal None placeholders; it must not imply a physical practice address.'],
  [197, 'A telephone/video service is presented as a location with literal None placeholders; it must not imply a physical practice address.']
]);
const utility = new Map([
  [19, 'Explicit teaching of ophthalmologists, optometrists and nurses has no teaching attribute.'],
  [27, 'An industry-funded device study is retained as research but its funding relationship is not structured for independence review.'],
  [28, 'Explicit interventional pain services remain background only.'],
  [37, 'Leading thrombosis services and routinely reviewing patients remain clinical interest rather than practice.'],
  [60, 'Setting up a fellowship and training international trainees are hidden inside received training.'],
  [64, 'Teaching higher trainees and junior doctors is hidden inside received training.'],
  [65, 'A historical vascular-surgery tutor role is hidden inside received training.'],
  [102, 'An endoscopy teaching-faculty role is retained as background without teaching activity.'],
  [106, 'Development of a national paediatric interventional-radiology service is retained as background only.'],
  [108, 'Explicitly running lung clinics and services is retained as background only.'],
  [109, 'A described clinical role in haematology is retained as background only.'],
  [110, 'Responsibility for a stated patient caseload remains background; count is self-reported and not comparable.'],
  [117, 'A named research-fellow role is reduced to research interest.'],
  [123, 'Explicit publication authorship remains background rather than research contribution.'],
  [125, 'Explicit publication/presentation contribution remains background.'],
  [129, 'Providing specified fertility treatments is reduced to clinical interest.'],
  [131, 'A named research award is reduced to research interest.'],
  [136, 'Undertaken research culminating in a degree is reduced to research interest.'],
  [144, 'Conference delivery and scientific-journal reviewing are hidden inside a research-interest passage.'],
  [161, 'Reported completed foot operations are retained as background rather than clinical practice.']
]);
const treatment = new Set([...unsupported.keys(), ...quality.keys()]);
const report = {
  version: 'expert-heldout-source-review-round-three-v1', reviewDate: '2026-10-06',
  corpusVersion: sample.corpusVersion, anchorCorpusVersion: sample.anchorCorpusVersion,
  sampleFingerprint: sample.sampleFingerprint,
  projectionFingerprint: createHash('sha256').update(JSON.stringify(sample)).digest('hex'),
  independence: { candidateIdentitiesSourceRowsAndExactTextsDisjointFromAllEarlierSamples: true, selectionFrozenBeforeCorrections: true, contentFirstReadAfterNormalizerFreeze: true, decisionsFrozenBeforeFindingsDisclosed: true },
  method: 'Reviewed all 100 frozen identity groups and all 200 claim anchors (203 current passages). Compared each text constituent against the same raw source field, with location and detailed-qualification components checked against the same structured source object. Investigated three identity inconsistencies using primary provider pages. These targeted external checks are not a random sample of live regulator checks.',
  identityReviews: sample.groups.map((g, i) => ({ index: i, candidateId: g.anchor.candidateId, inputHash: g.anchor.inputHash, sourceRecordIds: g.anchor.sources.map(s => s.id), decision: identity.has(i) ? 'critical-source-identity-conflict' : 'source-consistent-identity-handling', held: g.current.some(c => c.needsIdentityReview), ...(identity.has(i) ? identity.get(i) : { note: i === 93 ? 'Identity anchors agree, but the display name is duplicated and needs presentation cleanup.' : 'Recorded anchors, names and regulator bodies are consistent at source-record review depth; this is not a live regulator check.' }) })),
  claimReviews: sample.claims.map(c => ({ index: c.index, anchorId: c.anchor.id, inputHash: c.anchor.inputHash, candidateId: c.anchor.candidateId, sourceReferences: c.anchor.sources.map(s => ({ sourceRecordId: s.sourceRecordId, field: s.field, sourceUrl: s.sourceUrl })), currentEvidenceIds: c.current.map(p => p.id), sourceTextFidelity: 'pass', sourceSupport: unsupported.has(c.index) ? 'correction-required' : 'pass', treatment: treatment.has(c.index) ? 'correction-required' : 'safe-source-treatment', ...(unsupported.has(c.index) ? { supportFinding: unsupported.get(c.index) } : {}), ...(quality.has(c.index) ? { qualityFinding: quality.get(c.index) } : {}), ...(utility.has(c.index) ? { usefulnessFinding: utility.get(c.index) } : {}) })),
  firstPass: { identityHandling: { pass: 97, total: 100, criticalConflicts: 3 }, sourceTextFidelity: { pass: 200, total: 200 }, sourceSupport: { pass: 196, total: 200 }, safeTreatment: { pass: 189, total: 200 }, usefulnessMisses: { anchors: utility.size, total: 200 }, retainedAnchors: 200, currentPassages: 203, fullyWithheldAnchors: 0, targetedFreshPublicIdentityInvestigations: 3, gate: 'FAIL: claim source-support reaches 98%, but three critical identity/source-association conflicts violate the zero-critical-error gate.' },
  limitations: ['Stratified diagnostic audit, not a prevalence estimate or clinical validation.', 'Text fidelity does not establish that the source was attached to the correct person.', 'The earlier 84% treatment and 97% source-support results remain unchanged.', 'Conservative extraction misses are recorded separately and are not treated as false credentials.', 'Only suspicious identity cases received targeted fresh provider-page checks; no blanket external verification is claimed.', 'Any fixes guided by this sample require a separately reported regression recheck; they do not change this first-pass score.']
};
const target = path.join(__dirname, 'heldout-round-three-review.cjs');
if (fs.existsSync(target)) throw new Error('Round-three first-pass ledger is immutable.');
fs.writeFileSync(target, "'use strict';\n// Immutable third independent source-review first-pass findings.\nmodule.exports=" + JSON.stringify(report, null, 2) + ';\n');
console.log(JSON.stringify(report.firstPass));
