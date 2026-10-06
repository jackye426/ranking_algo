'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const sample=require('../.cache/evaluation-holdout-round-two-projected.json');
const unsupported=new Map([
 [28,'A clinical pharmacologist\'s hospital appointment is classified as a company/industry relationship although no such relationship is stated.'],
 [36,'Accepting insurance and self-funded patients is billing/coverage information, not an advisory, financial or employment relationship for independence review.'],
 [40,'An area limit of 25cm2 is tagged as self-reported activity; it is a procedure descriptor, not an activity/volume claim.'],
 [50,'An area limit of 9cm2 is tagged as self-reported activity; it is a procedure descriptor, not an activity/volume claim.'],
 [57,'A scar size limit of 5cm is tagged as self-reported activity; it is a procedure descriptor, not an activity/volume claim.'],
 [126,'An author-and-title style research reference about a training model is classified as the candidate\'s training without evidence that training was received.']
]);
const quality=new Map([
 [67,'The qualifications/memberships statement is classified as clinical interest. It contains no specific clinical-interest evidence; retain as background metadata.'],
 [146,'Corrupted words remain in a displayed clinical-interest passage. The text is faithfully copied but not reliable enough to display as useful expertise evidence.']
]);
const utility=new Map([
 [1,'Presented research and a laboratory research award are reduced to a research-interest label. Historical research contribution is not the same as current study/assessor qualification.'],
 [11,'An explicit research programme and lecturing are retained but structured only as interest/background.'],
 [12,'A historical research-fellow appointment is retained only as clinical interest.'],
 [13,'Completed PhD research is retained only as interest/background.'],
 [14,'Completed Research MD/publications and service leadership are retained only as interest.'],
 [16,'An explicit statement of engagement in research and development is retained only as interest.'],
 [18,'A research-lead role is retained only as interest.'],
 [22,'A description of undertaken research is retained only as interest.'],
 [26,'An explicit international industry advisory-panel role is hidden in background because the same sentence also mentions medico-legal work.'],
 [65,'Developing and directing an annual educational symposium is retained as training without a teaching/education-delivery attribute.'],
 [96,'Principal-investigator work appears inside clinical practice and may be missed by research requirement matching.'],
 [112,'Explicit heart-failure services, an echocardiography teaching programme, and primary-care pathway design are retained only as background.'],
 [115,'A clinical lead for Education and Training and national teaching-course faculty role loses its teaching attribute.'],
 [117,'Co-founder/Chief Clinical Officer at an implant start-up and consulting for orthopaedic companies are retained only as clinical interest, absent from relationship extraction.'],
 [124,'Explicitly having trained many surgeons is retained as training received and loses its teaching attribute.'],
 [128,'Undertaking endoscopic surgical procedures is reduced to training because the same sentence says trained.'],
 [159,'Advising pharmaceutical companies on cancer drug development is retained only as background, absent from relationship extraction.'],
 [169,'Explicit procedures, teaching and a minimum patient age are retained only as background.'],
 [188,'Explicit dermatology clinics, skin-cancer surgery and cryotherapy are retained only as background.']
]);
const failures=new Set([...unsupported.keys(),...quality.keys()]);
const report={version:'expert-heldout-source-review-round-two-v1',reviewDate:'2026-10-06',corpusVersion:sample.corpusVersion,anchorCorpusVersion:sample.anchorCorpusVersion,
 sampleFingerprint:sample.sampleFingerprint,projectionFingerprint:createHash('sha256').update(JSON.stringify(sample)).digest('hex'),
 independence:{sourceRowsAndExactTextsDisjointFromBothEarlierSamples:true,selectionFrozenBeforeCorrections:true,contentFirstReadAfterNormalizerFreeze:true,decisionsFrozenBeforeFindingsDisclosed:true},
 method:'Reviewed all 100 frozen identity groups and all 200 frozen claim anchors, represented by 219 current passages. Checked text constituents against original source fields and assembled location components against the same source objects. Three packing mismatches were resolved by source sentence boundaries, without selecting replacement claims. Conservative omissions are reported as usefulness limitations, not unsupported credentials.',
 identityReviews:sample.groups.map((g,i)=>({index:i,candidateId:g.anchor.candidateId,inputHash:g.anchor.inputHash,sourceRecordIds:g.anchor.sources.map(s=>s.id),decision:'source-consistent-identity-handling',held:g.current.some(c=>c.needsIdentityReview),note:'Recorded anchors, names and regulator bodies remain consistent. This does not constitute a live regulator check.'})),
 claimReviews:sample.claims.map(c=>({index:c.index,anchorId:c.anchor.id,inputHash:c.anchor.inputHash,candidateId:c.anchor.candidateId,sourceReferences:c.anchor.sources.map(s=>({sourceRecordId:s.sourceRecordId,field:s.field,sourceUrl:s.sourceUrl})),currentEvidenceIds:c.current.map(p=>p.id),sourceTextFidelity:'pass',sourceSupport:unsupported.has(c.index)?'correction-required':'pass',treatment:failures.has(c.index)?'correction-required':'safe-source-treatment',...(unsupported.has(c.index)?{supportFinding:unsupported.get(c.index)}:{}),...(quality.has(c.index)?{qualityFinding:quality.get(c.index)}:{}),...(utility.has(c.index)?{usefulnessFinding:utility.get(c.index)}:{})})),
 firstPass:{identityHandling:{pass:100,total:100},sourceTextFidelity:{pass:200,total:200},sourceSupport:{pass:200-unsupported.size,total:200},safeTreatment:{pass:200-failures.size,total:200},usefulnessMisses:{anchors:utility.size,total:200},retainedAnchors:200,currentPassages:219,fullyWithheldAnchors:0,freshPublicVerifications:0,gate:'FAIL: source-support precision is 97%, and independence/claim-context defects remain. Faithful source text and conservative omissions do not override those findings.'},
 limitations:['Diagnostic stratified sample, not a prevalence estimate.','The original first-holdout 84% treatment result remains immutable; this is an independent round with separate metric definitions.','Source text fidelity, support precision, safe treatment and useful structured extraction are different measures.','Conservative background/interest treatment is not counted as an unsupported credential merely because it loses usefulness.','False-negative relationship and research extraction must remain visible as coverage limitations; absence never establishes conflict-free status or lack of expertise.','Post-fix rechecks informed by this sample are regression results, not untouched holdout validation.']
};
const target=path.join(__dirname,'heldout-round-two-review.cjs');
if(fs.existsSync(target))throw new Error('Round-two first-pass ledger is immutable.');
fs.writeFileSync(target,"'use strict';\n// Immutable second independent source-review first-pass findings.\nmodule.exports="+JSON.stringify(report,null,2)+';\n');
console.log(JSON.stringify(report.firstPass));
