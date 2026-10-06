'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const sample=require('../.cache/evaluation-holdout-round-four-projected.json');
const unsupported=new Map([
 [30,'Working in the hospital and healthcare industry is a generic employment-sector description, not an industry/company relationship.'],
 [99,'Supervising a national clinical audit is classified as direct clinical practice. The selected passage states audit supervision, not treating patients or performing the audited surgery.'],
 [111,'Generic webpage copy about finding an NHS or private-sector specialist is labelled clinical interest and contributes an NHS setting attribute. It does not document this professional practising in that setting.'],
 [159,'Ultrasound phacoemulsification is cataract-treatment energy, not ultrasound imaging/interpretation expertise. The generic ultrasound modality attribute loses that distinction.'],
 [191,'Ultrasound phacoemulsification is cataract-treatment energy, not ultrasound imaging/interpretation expertise. The generic ultrasound modality attribute loses that distinction.']
]);
const quality=new Map([
 [73,'Several received-training snippets end mid-phrase; their literal wording is sourced but the incomplete fragments need withholding or repaired source extraction.'],
 [79,'Repeated names and sentence fragments interrupt an otherwise sourced clinical-practice passage.'],
 [115,'Mid-phrase source fragments and an irrelevant television reference remain in professional background.'],
 [116,'The professional-background passage retains an unnecessary reference to travelling with the clinician\'s spouse.'],
 [161,'A concatenated acronym fragment remains alongside readable professional memberships.'],
 [170,'Broken media URLs and incomplete source fragments remain in professional background.']
]);
const utility=new Map([
 [5,'Organising a medical conference is not structured as education delivery.'],
 [7,'Explicit orthopaedic treatment and workshop-faculty activity are hidden within a research passage.'],
 [9,'An explicit current oncology practice description is hidden within research.'],
 [25,'Conducting studies and acting as trial physician are hidden within the relationship passage.'],
 [27,'Principal/sub-investigator work is hidden within the relationship passage.'],
 [63,'Examiner and educational activity are hidden within received training.'],
 [66,'An explicitly offered injection service is hidden within received training.'],
 [107,'Founding/directing a named physiology service is retained only as background.'],
 [108,'Robotic kidney surgery and a national clinical-audit role are retained only as background.'],
 [109,'Explicit adult cardiology scope is retained only as background.'],
 [113,'A described consultant practice at named hospitals is retained only as background.'],
 [117,'Explicit knee reconstruction and joint-replacement work are retained only as background.'],
 [119,'Running trials and several clinical-research leadership roles are reduced to research interest.'],
 [121,'Scientific publications are retained only as background.'],
 [122,'A completed research degree and grant to lead a named study are reduced to research interest.'],
 [124,'Explicitly carrying out surgical procedures is reduced to clinical interest.'],
 [126,'Explicitly carrying out arthroscopy and revision surgery is reduced to clinical interest.'],
 [127,'Trial-management/governance experience and leadership of commercial trials are reduced to research interest.'],
 [128,'Publication/book-chapter contributions are retained only as background.'],
 [148,'A completed research degree is reduced to research interest.'],
 [149,'A completed research fellowship and active teaching are reduced to research interest.'],
 [170,'Described endoscopy contributions remain background.'],
 [176,'An explicit NHS clinical role remains background.'],
 [183,'An offered cardiac-screening service remains background.'],
 [188,'A professional topic list remains conservative background.']
]);
const identityFinding={
 note:'The unheld psychologist record bupa_3846 carries HCPC PH68586, a physiotherapy-coded identifier, and an HCA same-name source. The clinician-owned website linked by Bupa states practitioner-psychologist registration PYL26294. The raw record does not resolve this conflicting registration association. Hold for source reconciliation; do not silently overwrite identifiers or assume the person lacks a qualification.',
 urls:['https://www.finder.bupa.co.uk/Consultant/view/225728/dr_claire_hepworth','https://www.drclairehepworth.com/about-dr-hepworth','https://www.hcpc-uk.org/check-the-register/how-to-check/'],
 observedAt:'2026-10-06',sourceDate:null,
 excerpts:['Dr Claire Hepworth, Clinical Psychologist.','Health and Care Professions Council (PYL26294)'],
 sourceRegistration:{body:'HCPC',identifier:'PYL26294'},
 failedFreshFetch:['https://www.hcahealthcare.co.uk/finder/stepconsultantprofile/claire-hepworth'],
 limitations:['The clinician-owned page states PYL26294; it is not a fresh regulator status check.','A third-party directory also associates PH68586 with a same-name physiotherapist, but the critical hold is justified by the unresolved primary-source/typed-identifier conflict, not by treating that directory as regulator truth.']
};
const retained=sample.claims.filter(c=>c.current.length),withheld=sample.claims.filter(c=>!c.current.length);
const failures=new Set([...unsupported.keys(),...quality.keys()]);
const report={version:'expert-heldout-source-review-round-four-v1',reviewDate:'2026-10-06',corpusVersion:sample.corpusVersion,anchorCorpusVersion:sample.anchorCorpusVersion,sampleFingerprint:sample.sampleFingerprint,projectionFingerprint:createHash('sha256').update(JSON.stringify(sample)).digest('hex'),
 independence:{candidateIdentitiesSourceRowsAndExactTextsDisjointFromAllEarlierSamples:true,selectionFrozenBeforeCorrections:true,contentFirstReadAfterNormalizerFreeze:true,decisionsFrozenBeforeFindingsDisclosed:true},
 method:'Reviewed all 100 identity groups and 200 fixed claim anchors. All 192 retained anchors (194 current passages) were checked against their original source fields; detailed-qualification components and publication-link metadata were separately checked. Eight anchors are withheld because their candidate identities were quarantined. They are coverage losses, not supported emitted claims, and therefore are excluded from emitted-claim precision rather than counted as successes. The suspicious HCPC profession mismatch received targeted primary-source investigation.',
 identityReviews:sample.groups.map((g,i)=>({index:i,candidateId:g.anchor.candidateId,inputHash:g.anchor.inputHash,sourceRecordIds:g.anchor.sources.map(s=>s.id),decision:i===38?'critical-unresolved-registration-association':'source-consistent-identity-handling',held:g.current.some(c=>c.needsIdentityReview),...(i===38?identityFinding:{note:[31,33].includes(i)?'Conservative hold for a possible shortened given-name variant. No automatic repair; usefulness loss requires source corroboration.':'Source-record names, identifiers and source associations are consistent or conservatively held; not a live regulator check.'})})),
 claimReviews:sample.claims.map(c=>({index:c.index,anchorId:c.anchor.id,inputHash:c.anchor.inputHash,candidateId:c.anchor.candidateId,sourceReferences:c.anchor.sources.map(s=>({sourceRecordId:s.sourceRecordId,field:s.field,sourceUrl:s.sourceUrl})),currentEvidenceIds:c.current.map(p=>p.id),sourceTextFidelity:c.current.length?'pass':'not-emitted',sourceSupport:!c.current.length?'not-emitted':unsupported.has(c.index)?'correction-required':'pass',treatment:!c.current.length?'conservatively-withheld-identity':failures.has(c.index)?'correction-required':'safe-source-treatment',...(!c.current.length?{withholdingReason:'Candidate held for unresolved profile-name mismatch; source evidence not discarded from the raw record.'}:{}),...(unsupported.has(c.index)?{supportFinding:unsupported.get(c.index)}:{}),...(quality.has(c.index)?{qualityFinding:quality.get(c.index)}:{}),...(utility.has(c.index)?{usefulnessFinding:utility.get(c.index)}:{})})),
 technicalSources:[{url:'https://www.nhs.uk/tests-and-treatments/cataract-surgery/',purpose:'Confirms ultrasound used to break up a cataract lens; this procedural use does not establish diagnostic ultrasound interpretation.'},{url:'https://www.hcpc-uk.org/check-the-register/how-to-check/',purpose:'Confirms profession prefixes: PH physiotherapists; PYL practitioner psychologists.'}],
 firstPass:{identityHandling:{pass:99,total:100,criticalConflicts:1},sourceTextFidelity:{pass:retained.length,total:retained.length},sourceSupport:{pass:retained.length-unsupported.size,total:retained.length},sampleSafeHandling:{pass:200-unsupported.size,total:200,includesWithheld:true},safeTreatment:{pass:retained.length-failures.size,total:retained.length},usefulnessMisses:{anchors:utility.size,total:200},retainedAnchors:retained.length,currentPassages:retained.reduce((n,c)=>n+c.current.length,0),fullyWithheldAnchors:withheld.length,targetedFreshPublicIdentityInvestigations:1,gate:'FAIL: 187/192 emitted claim anchors are source-supported (97.4%), and one unresolved registration association plus a false industry-relationship classification violate safety gates.'},
 limitations:['Stratified diagnostic sample, not prevalence or clinical validation.','Earlier first-pass results remain immutable.','Eight identity-held anchors remain in the frozen sample and are explicitly reported as reduced coverage.','Repeated independent rounds are model development/auditing history, not proof of zero errors across the corpus.','Conservative extraction misses and nickname-related identity holds are usefulness issues that need source review, not grounds to assert absent expertise.','No regulator-wide identity audit or assessment qualification validation has been performed.']};
const target=path.join(__dirname,'heldout-round-four-review.cjs');
if(fs.existsSync(target))throw new Error('Round-four first-pass ledger is immutable.');
fs.writeFileSync(target,"'use strict';\n// Immutable fourth independent source-review first-pass findings.\nmodule.exports="+JSON.stringify(report,null,2)+';\n');
console.log(JSON.stringify(report.firstPass));
