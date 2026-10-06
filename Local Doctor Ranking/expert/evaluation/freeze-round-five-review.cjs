'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const sample=require('../.cache/evaluation-holdout-round-five-projected.json');
const unsupported=new Map([
 [12,'The selected passage describes receiving a Master in Clinical Research. It is labelled research activity rather than received training. A later sentence in the full biography describes actual research work, but that different sentence is not this selected evidence.'],
 [33,'A Global Health and Pharma award is classified as an industry relationship. Receiving this award does not establish advisory, employment, consulting or financial links with a pharmaceutical manufacturer.'],
 [34,'Prizes from professional bodies and a Medical Research Council grant are classified as an industry relationship. The selected wording does not establish an industry/company relationship; the Worshipful Company name is not sufficient.'],
 [63,'Directing a cardiology training programme and leading arrhythmia training are training delivery/leadership, not training received. The emitted training type and training-not-practice qualifier lose that distinction.'],
 [73,'Teaching and clinically supervising trainees and co-organising a cadaveric course are education delivery, not received training.'],
 [89,'An expressed main clinical interest in performing minimal-access surgery is asserted as clinical-practice activity without its interest qualification. Preserve it as a stated interest unless separate practice evidence is cited.'],
 [92,'The passage describes the professional personally running marathons/triathlons and helping others improve their practices. It incorrectly creates both an athlete patient-population attribute and clinical-practice activity.']
]);
const quality=new Map([
 [60,'Training snippets end at St. and omit the following source continuation.'],
 [62,'A training snippet ends at St. and omits the following source continuation.'],
 [66,'Training snippets end at St. and Mr. and retain an unseparated heading.'],
 [67,'An irrelevant personal rugby award remains attached to received medical training.'],
 [75,'Several otherwise useful clinical/background excerpts end with stray Prof. fragments.'],
 [80,'A family and personal sports hobby remains attached to clinical-practice evidence.'],
 [107,'An unnecessary spouse/children reference remains in professional background.'],
 [121,'A subjectless fragment about screening programmes lacks the source context needed for useful interpretation.'],
 [128,'Training snippets end at St. and omit the following source continuation.'],
 [135,'A subjectless research-interest fragment and general disease commentary are retained without their antecedent.'],
 [137,'Severely broken word fragments remain in a clinical-interest list.'],
 [146,'Trial-status fragments remain without named trials or topics.'],
 [151,'Concatenated unexplained membership acronyms remain.'],
 [156,'Concatenated unexplained membership acronyms remain.'],
 [160,'Concatenated memberships remain alongside readable memberships.'],
 [179,'An unexplained concatenated acronym fragment remains beside a readable membership.'],
 [190,'A literal None sentinel remains in a recorded address.'],
 [195,'Concatenated unexplained membership acronyms remain.']
]);
const utility=new Map([
 [2,'Explicit consultant clinical work is hidden within research.'],[7,'Actual undergraduate teaching is hidden within research.'],[9,'Actual postgraduate/undergraduate teaching is hidden within research.'],[11,'Explicit industry collaboration on devices is hidden within research.'],[24,'Leading an inflammatory arthritis service is hidden within research.'],[26,'Explicit clinical-trial involvement is hidden within a relationship passage.'],[28,'Principal-investigator clinical-trial work is hidden within a relationship passage.'],[29,'Explicit cataract/laser/corneal surgical skills are retained only as background.'],[36,'An explicit honorary teaching post is hidden within a relationship passage.'],[61,'Completed wound-healing research is hidden within received training.'],[68,'Completed tissue-engineering research is hidden within received training.'],[69,'A past ten-year consultant post is hidden within received training.'],[71,'Explicit adult/paediatric ENT services are hidden within received training.'],[74,'Education delivery and a deputy clinical director role are hidden within received training.'],[75,'Pacemaker/defibrillator implantation and proctoring contracts are partly retained only as background.'],[108,'Explicit MAKO robot use and revision surgery experience are retained only as background.'],[111,'Publication contributions are retained only as background.'],[113,'Leading/running multicentre research studies is reduced to research interest.'],[115,'Explicit endoscopy procedures and screening leadership are retained only as background.'],[117,'Treating elite/recreational athletes is hidden within received training.'],[118,'Specific surgical scope is retained only as background.'],[122,'Radiotherapy and chemotherapy work is retained only as background.'],[123,'An offered skin-cancer service is hidden within received training.'],[127,'Participating in a novel defibrillator implantation team is retained only as background.'],[129,'Introducing a surgical day-case pathway is reduced to interest.'],[133,'Explicit specialist treatment is reduced to interest.'],[136,'A historical pitch-side clinical role is reduced to interest.'],[177,'Explicit complex glaucoma/cataract scope is retained only as background.'],[178,'Specific endoscopic sinus surgical experience is retained only as background.']
]);
const retained=sample.claims.filter(c=>c.current.length), failures=new Set([...unsupported.keys(),...quality.keys()]);
const report={version:'expert-heldout-source-review-round-five-v1',reviewDate:'2026-10-06',corpusVersion:sample.corpusVersion,anchorCorpusVersion:sample.anchorCorpusVersion,sampleFingerprint:sample.sampleFingerprint,projectionFingerprint:createHash('sha256').update(JSON.stringify(sample)).digest('hex'),
 independence:{candidateIdentitiesSourceRowsAndExactTextsDisjointFromAllEarlierSamples:true,selectionFrozenBeforeCorrections:true,contentFirstReadAfterNormalizerFreeze:true,decisionsFrozenBeforeFindingsDisclosed:true},
 method:'Read all 100 identity groups and all 200 fixed claim anchors after the normalizer freeze. Compared every emitted newline constituent against the frozen original source-field values after Unicode/whitespace normalization; location components were checked against their original objects. All 200 anchors retain literal source support for their text. Separately assessed interpreted type, attributes, context and extraction usefulness. No fresh public-page/regulator investigation was needed for these 100 source-record identity groups.',
 identityReviews:sample.groups.map((g,i)=>({index:i,candidateId:g.anchor.candidateId,inputHash:g.anchor.inputHash,sourceRecordIds:g.anchor.sources.map(s=>s.id),decision:'source-consistent-identity-handling',held:g.current.some(c=>c.needsIdentityReview),note:[2,3,11,36,59].includes(i)?'Conservative hold for a possible shortened name/profile variant; source corroboration is required before restoring coverage.':'Source-record names, typed identifiers and source associations are consistent or conservatively held; this is not a live regulator check.'})),
 claimReviews:sample.claims.map(c=>({index:c.index,anchorId:c.anchor.id,inputHash:c.anchor.inputHash,candidateId:c.anchor.candidateId,sourceReferences:c.anchor.sources.map(s=>({sourceRecordId:s.sourceRecordId,field:s.field,sourceUrl:s.sourceUrl})),currentEvidenceIds:c.current.map(p=>p.id),sourceTextFidelity:'pass',sourceSupport:unsupported.has(c.index)?'correction-required':'pass',treatment:failures.has(c.index)?'correction-required':'safe-source-treatment',...(unsupported.has(c.index)?{supportFinding:unsupported.get(c.index)}:{}),...(quality.has(c.index)?{qualityFinding:quality.get(c.index)}:{}),...(utility.has(c.index)?{usefulnessFinding:utility.get(c.index)}:{})})),
 firstPass:{identityHandling:{pass:100,total:100,criticalConflicts:0},sourceTextFidelity:{pass:200,total:200},sourceSupport:{pass:200-unsupported.size,total:200},sampleSafeHandling:{pass:200-unsupported.size,total:200,includesWithheld:true},safeTreatment:{pass:200-failures.size,total:200},usefulnessMisses:{anchors:utility.size,total:200},retainedAnchors:retained.length,currentPassages:retained.reduce((n,c)=>n+c.current.length,0),fullyWithheldAnchors:0,targetedFreshPublicIdentityInvestigations:0,gate:'FAIL: 193/200 emitted claim anchors are source-supported (96.5%). No critical identity conflicts observed, but false industry-relationship and athlete-population/activity interpretations remain.'},
 limitations:['Stratified diagnostic sample, not prevalence, clinical validation or regulator verification.','Earlier first-pass findings remain immutable.','No fully withheld claim anchors in this round; conservatively held identity groups are nevertheless reported as coverage limitations.','Conservative background/interest misses are reported separately from unsupported claims.','Repeated audits expose general extraction failure modes; they are not evidence that all other corpus records are correct.']};
const target=path.join(__dirname,'heldout-round-five-review.cjs');
if(fs.existsSync(target))throw new Error('Round-five first-pass ledger is immutable.');
fs.writeFileSync(target,"'use strict';\n// Immutable fifth independent source-review first-pass findings.\nmodule.exports="+JSON.stringify(report,null,2)+';\n');
console.log(JSON.stringify(report.firstPass));
