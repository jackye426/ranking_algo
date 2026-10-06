'use strict';
// One-time transcription of an independent source-record review. The private
// sample was frozen before these decisions; never regenerate it after fixes.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const samplePath=path.join(__dirname,'../.cache/evaluation-sample-holdout.json');
const sample=JSON.parse(fs.readFileSync(samplePath,'utf8'));
const defects=new Map();
const flag=(index,category,note)=>defects.set(index,{category,note});
flag(14,'unsupported-research','A topic in areas_of_interest is not evidence of undertaken research.');
flag(31,'nonprofessional-content','A professional company role is followed by personal sports and club memberships. Remove personal content without suppressing the recorded company relationship.');
for(const i of [39,60,63,65,66,67,68,69,70,71,72,73,74,127,129])flag(i,'learner-not-teacher','The teaching activity attribute comes from training received, a teaching hospital, or an educational topic. This passage does not establish that the professional teaches.');
flag(64,'nonprofessional-content','Personal strength training and sports were incorrectly classified as professional training and teaching.');
flag(82,'teaching-not-clinical-practice','Supervising trainee surgeons and teaching awards do not establish a specific clinical practice activity.');
flag(99,'interest-not-clinical-practice','The short areas_of_interest entry does not establish performed clinical work.');
flag(100,'legal-not-clinical-practice','Medico-legal work is not direct patient treatment.');
flag(105,'metadata-not-interest','Registration and an empty Clinical Interests heading are not clinical interest evidence.');
flag(109,'promotional-content','Generic global renown and pioneering language is not usable expertise evidence.');
flag(122,'journal-not-patient-population','Reviewing a children\'s orthopaedics journal does not establish a paediatric patient population.');
flag(125,'training-not-clinical-practice','The passage describes techniques learned during fellowships, rather than performed clinical care; teaching is separately documented and should be retained.');
flag(144,'empty-reference','An instruction to see an absent list does not supply an expertise claim.');
flag(146,'metadata-not-interest','A dated specialist-register and qualification statement belongs in background metadata, not clinical interests.');
flag(148,'corrupted-source-text','The source contains visibly corrupted words. Retain the raw source for audit, but flag or withhold this excerpt from displayed evidence.');
flag(159,'location-not-clinical-activity','A practice address should not generate a clinical practice activity attribute. Its address was also split at an abbreviation.');
flag(168,'membership-not-patient-population','Professional society memberships do not establish an individual patient population.');
flag(175,'membership-not-modality','An endoscopy society membership does not establish personally performed endoscopy.');
flag(186,'institution-not-research-activity','The name Institute of Cancer Research in a qualification does not establish individual clinical research or a cancer practice.');
const fidelityNotes=new Map([[159,'The abbreviated location fragment is sourced, but it loses part of the address. Counted as a usability defect, not invented source text.'],[164,'Degree and description were joined with a display separator; both are present in the same source object.']]);
const reviewed={
 version:'expert-heldout-source-review-v1',reviewDate:'2026-10-06',corpusVersion:sample.corpusVersion,
 sampleFingerprint:createHash('sha256').update(JSON.stringify(sample)).digest('hex'),
 independence:{excludedAllInitialReviewSourceIds:true,excludedInitialClaimTexts:true,decisionsFrozenBeforeCorrections:true,searchResultsNotUsedToChooseClaims:true},
 method:'All 100 identity groups and all 200 full passage texts, types, attributes and source references were inspected. Literal or packed excerpts were checked against their original field values; composed locations and qualifications were inspected against the same source objects. This is a source-record audit, not fresh public or regulator verification.',
 identityReviews:sample.groups.map(g=>({candidateId:g.candidateId,stratum:g.stratum,inputHash:g.inputHash,sourceRecordIds:g.sources.map(s=>s.id),reviewDecision:'source-consistent-identity-handling',note:g.decision==='held-for-review'?'Correctly withheld pending stronger identity evidence.':'Recorded identity anchors and source names are consistent; no new registration or names-only merge was inferred.'})),
 claimReviews:sample.claims.map((p,i)=>({index:i,id:p.id,candidateId:p.candidateId,stratum:p.stratum,inputHash:p.inputHash,sourceReferences:p.sources.map(s=>({sourceRecordId:s.sourceRecordId,field:s.field,sourceUrl:s.sourceUrl})),sourceFidelity:'pass',fidelityNote:fidelityNotes.get(i)||(p.exactSourceSubstring?'Literal excerpt is present in the source field.':p.type==='location'?'Displayed components are present in the same recorded location; no current-practice or residence assertion is established.':'Each packed constituent is present in the original field, or is a deterministic formatting of the same source object.'),treatmentDecision:defects.has(i)?'correction-required':'acceptable-source-treatment',...(defects.get(i)||{note:'Recorded text and conservative evidence type are usable within the stated source and date limitations.'})})),
 firstPass:{identityHandling:{pass:100,total:100},sourceFidelity:{pass:200,total:200},claimTreatment:{pass:200-defects.size,total:200},externalFreshVerifications:0,gate:'FAIL: source fidelity alone is insufficient; material interpretation and projection defects need correction or safe withholding.'},
 limitations:['Stratified diagnostic sample; these percentages are not population prevalence estimates.','A claim may be faithfully copied yet incorrectly classified. Both measures are reported.','Attributes are reviewed as possible inference inputs, including metadata-derived false positives.','This audit is not clinical, regulatory, assessor, availability, or conflict-of-interest validation.','Any fixes informed by this sample make subsequent scores post-hoc regression results, not a second untouched holdout score.']
};
const target=path.join(__dirname,'heldout-review.cjs');
if(fs.existsSync(target))throw new Error('Immutable heldout review already exists; do not overwrite its first-pass findings.');
fs.writeFileSync(target,"'use strict';\n// Immutable first-pass disjoint holdout source-review decisions.\nmodule.exports="+JSON.stringify(reviewed,null,2)+';\n');
console.log(JSON.stringify({file:target,firstPass:reviewed.firstPass,defectIndices:[...defects.keys()]}));
