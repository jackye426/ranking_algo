'use strict';

// Independently authored before the next interpretation/ranking corrections.
// No first-holdout case results or current ranked outputs were inspected.
// These fictional briefs test source-supported discovery, never approval,
// independence, availability, engagement acceptance or clinical superiority.
const CARDIAC='cardiac.{0,35}(?:CT|computed tomography)|coronary.{0,25}(?:CT|angiogra)|CCTA';
const SKIN='dermoscop|skin.{0,25}(?:lesion|cancer)|melanoma';
const CT_IDS=['bupa_11411','bupa_14429'];
const SKIN_IDS=['bupa_12291','spire_668'];
function scenario(id,family,message,options={}) {
  const cardiac=options.domain==='cardiac'||family==='cardiac-ct';
  const {domain,...rest}=options;
  return {id,split:'holdout',family,fictional:true,message,
    knownRelevantSourceIds:cardiac?[...CT_IDS]:[...SKIN_IDS],clinicalPattern:cardiac?CARDIAC:SKIN,
    expectations:{requirementLabels:cardiac?['Cardiac CT']:['Skin lesions'],unknownKinds:['currentPractice','regulatory']},...rest};
}
const scenarios=[
  scenario('r2-cardiac-ct-01','cardiac-ct',
    'Identify clinicians to review the risks of software that flags coronary narrowing on adult cardiac CT. We need experience of interpreting these scans and discussing false alarms.'),
  scenario('r2-cardiac-ct-02','cardiac-ct',
    'Our product assists cardiac CT reporting. Please identify clinical experts who understand coronary CT findings.',
    {followups:['Adults are the intended population.','Add clinical research as a useful second perspective. Current clinical practice still needs to be confirmed.']}),
  scenario('r2-cardiac-ct-03','cardiac-ct',
    'We need to assess software used with cardiac computed tomography for coronary artery disease. Who has relevant recorded clinical expertise?',
    {followups:['Keep the cardiac CT requirement. Experience with diagnostic studies is preferred, not essential.']}),
  scenario('r2-cardiac-ct-04','cardiac-ct',
    'Find UK experts for a cardiac CT decision-support tool for adults. We want to examine what a missed finding could mean for the patient.',
    {followups:['Remove the UK restriction; preserve the clinical and adult-population requirements.'],removedLabels:['UK-based clinical practice']}),

  scenario('r2-skin-lesion-images-01','skin-lesion-images',
    'We are reviewing software that assesses skin lesions. Find clinical expertise relevant to interpreting its recommendations.',
    {expectedTechnologyPresent:true,expectedTechnologyPattern:'software'}),
  scenario('r2-skin-lesion-images-02','skin-lesion-images',
    'Identify experts for a tool that assesses skin-lesion images taken during a primary-care visit. We need to understand when a recommendation to refer could be misleading.',
    {followups:['Experience of evaluating diagnostic studies would be useful. Do not assume the person is a regulatory assessor.']}),
  scenario('r2-skin-lesion-images-03','skin-lesion-images',
    'We are assessing dermoscopy software for skin-lesion assessment in adults. Clinical expertise is essential; experience of research is preferred.',
    {followups:['Drop the research requirement, but keep the skin-lesion imaging context.'],removedLabels:['Clinical research']}),
  scenario('r2-skin-lesion-images-04','skin-lesion-images',
    'We need clinical input on skin-lesion imaging software, especially the implications of sending too many or too few people for specialist review.',
    {followups:['The users are general practitioners in primary care. Keep the original imaging purpose.']}),

  scenario('r2-outside-specialist-setting-01','outside-specialist-setting',
    'Find experts for skin-lesion image software intended for home use. The person looking at the result may have no clinical training.',
    {mustRemainUnconfirmed:['Community / home use']}),
  scenario('r2-outside-specialist-setting-02','outside-specialist-setting',
    'Our skin-lesion imaging tool will be used outside a specialist clinic. We need expertise to examine what non-specialist users might misunderstand.',
    {followups:['Make home use an essential part of the brief, while retaining the skin-lesion requirement.'],mustRemainUnconfirmed:['Community / home use']}),
  scenario('r2-outside-specialist-setting-03','outside-specialist-setting',
    'Find skin-lesion imaging experts for home-use software.',
    {followups:['Remove home use from the requirements. This version is for general practitioners in primary care.'],removedLabels:['Community / home use']}),
  scenario('r2-outside-specialist-setting-04','outside-specialist-setting',
    'We are assessing software that explains cardiac CT results to adults at home after their hospital scan. We need experts to examine the risks of a patient misinterpreting the output.',
    {domain:'cardiac',mustRemainUnconfirmed:['Community / home use']}),

  scenario('r2-complementary-panel-01','complementary-panel',
    'For a skin-lesion image device used in primary care, we need two complementary experts: one practising clinician and one research specialist. Please identify people to consider for those perspectives.'),
  scenario('r2-complementary-panel-02','complementary-panel',
    'We need clinical input on dermoscopy software for skin-lesion assessment.',
    {followups:['Build a two-person panel: one practising clinician and one research specialist.','The research perspective should help examine diagnostic performance, not imply regulatory approval.']}),
  scenario('r2-complementary-panel-03','complementary-panel',
    'For adult cardiac CT software, identify one practising clinician and one research specialist. Their expertise should help examine the clinical meaning of the results.',
    {domain:'cardiac'}),
  scenario('r2-complementary-panel-04','complementary-panel',
    'Find cardiac CT experts for a coronary artery disease reporting tool.',
    {domain:'cardiac',followups:['We need one practising clinician and one research specialist, rather than treating a single biography as proof of both roles.','Retain both perspectives. Current practice and participation will need confirmation.']}),

  scenario('r2-relationship-review-01','relationship-review',
    'Find clinical expertise for a skin-lesion imaging device. Manufacturer: Check 4 Cancer. Surface recorded relationships for our team to review.',
    {knownRelevantSourceIds:['spire_668'],relationshipOrganisation:'Check 4 Cancer'}),
  scenario('r2-relationship-review-02','relationship-review',
    'Identify experts in skin-lesion assessment for software used by non-specialists.',
    {knownRelevantSourceIds:['spire_668'],followups:['Manufacturer: Check 4 Cancer. A recorded relationship is something to investigate, not an automatic exclusion.'],relationshipOrganisation:'Check 4 Cancer'}),
  scenario('r2-relationship-review-03','relationship-review',
    'Find clinical experts for skin-lesion imaging software. Manufacturer: Example Skin Systems.',
    {relationshipOrganisation:'Example Skin Systems',expectNoEstablishedRelationship:true}),
  scenario('r2-relationship-review-04','relationship-review',
    'Find skin-lesion imaging experts. Manufacturer: Check 4 Cancer.',
    {followups:['Change the manufacturer. Manufacturer: Example Skin Systems. Keep the skin-lesion purpose.'],relationshipOrganisation:'Example Skin Systems',expectNoEstablishedRelationship:true}),

  scenario('r2-clinical-not-regulatory-01','clinical-not-regulatory',
    'For an adult cardiac CT software review, clinical scan-interpretation expertise is essential. Regulatory-assessment experience is optional; please retain clinically relevant options even if that experience is unknown.',
    {domain:'cardiac'}),
  scenario('r2-clinical-not-regulatory-02','clinical-not-regulatory',
    'Identify skin-lesion imaging experts for a clinical review of diagnostic software. Research expertise would be useful; medical-device assessment experience is optional.'),
  scenario('r2-clinical-not-regulatory-03','clinical-not-regulatory',
    'Find experts for cardiac CT software. Regulatory-assessment experience is essential.',
    {domain:'cardiac',followups:['Change regulatory experience to optional. Cardiac CT remains essential.']}),
  scenario('r2-clinical-not-regulatory-04','clinical-not-regulatory',
    'Find experts for skin-lesion imaging software. Regulatory-assessment experience is essential.',
    {followups:['Remove the regulatory-assessment requirement. Keep skin-lesion imaging as essential.'],removedLabels:['Medical-device assessment experience']}),

  scenario('r2-insufficient-evidence-01','insufficient-evidence',
    'We need clinicians for a product review. Can you find some?',
    {knownRelevantSourceIds:[],clinicalPattern:null,expectations:{requirementLabels:[],unknownKinds:['currentPractice','regulatory']},expectClarification:true}),
  scenario('r2-insufficient-evidence-02','insufficient-evidence',
    'Please help us find an expert in imaging.',
    {knownRelevantSourceIds:[],clinicalPattern:null,expectations:{requirementLabels:[],unknownKinds:['currentPractice','regulatory']},expectClarification:true}),
  scenario('r2-insufficient-evidence-03','insufficient-evidence',
    'Find experts for skin-lesion software. Current clinical practice is essential, and we only want options where every essential requirement is documented.',
    {knownRelevantSourceIds:[],documentedOnly:true,expectEmpty:true}),
  scenario('r2-insufficient-evidence-04','insufficient-evidence',
    'We need cardiac CT experts for software used in adults.',
    {domain:'cardiac',knownRelevantSourceIds:[],followups:['Current clinical practice is essential. Return only options with documented support for every essential requirement.'],documentedOnly:true,expectEmpty:true}),
];
module.exports=Object.freeze({
  version:'expert-retrieval-holdout-round-two-v1',freezeDate:'2026-10-06',
  authorship:'Independent evaluation agent; first-holdout ranked outputs and per-case outcomes were not inspected.',
  sourceBasis:'The four professional anchors are limited to reviewed cardiac-CT, skin-lesion/dermoscopy, research and relationship evidence. No current-practice, availability, independence or regulatory-assessment approval is established.',
  limitations:[
    'This is a fresh wording and refinement holdout over known source anchors, not an independent sample of clinicians or clinical domains.',
    'Known references support consideration for the central clinical requirement; they do not establish every essential criterion or suitability for an engagement.',
    'Clinical and research panel perspectives are project requirements. A retrieved person is not assumed qualified to fill either role without review.',
    'Example Skin Systems is a fictional manufacturer used only to test handling of absent relationship evidence.',
  ],
  scenarios:Object.freeze(scenarios.map(s=>Object.freeze(s))),
});
