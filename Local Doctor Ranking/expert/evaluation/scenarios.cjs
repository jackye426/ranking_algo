'use strict';

// Frozen before any retrieval evaluation. These labels describe source support,
// never clinical suitability or formal approval. No model generated the labels.
// Development cases may guide tuning; holdout cases must only be scored.
const freezeDate = '2026-10-06';
const anchors = Object.freeze({
  cardiac: ['bupa_11411', 'bupa_14429'],
  skin: ['bupa_12291', 'spire_668'],
  relationship: ['spire_668']
});
const sourceFacts = Object.freeze([
  {sourceRecordId:'bupa_11411', field:'about', includes:'I supervise and report adult cardiac/coronary CT.', supports:['cardiac CT','adult population'], doesNotEstablish:['current clinical practice','regulatory approval']},
  {sourceRecordId:'bupa_14429', field:'about', includes:'CT coronary angiograms', supports:['cardiac CT'], doesNotEstablish:['CT-only volume','regulatory approval']},
  {sourceRecordId:'bupa_12291', field:'about', includes:'use of dermoscopy in skin cancer diagnosis', supports:['skin-lesion imaging','skin cancer'], doesNotEstablish:['current clinical practice','regulatory approval']},
  {sourceRecordId:'spire_668', field:'about', includes:'helping non experts diagnose skin lesions accurately and safely', supports:['skin lesions','non-specialist users'], doesNotEstablish:['formal assessor approval']},
  {sourceRecordId:'spire_668', field:'about', includes:'Clinical Advisor for Skin for a Telemedicine screening company Check 4 Cancer', supports:['recorded relationship requiring review'], doesNotEstablish:['conflict determination','current engagement terms']}
]);
const families = [
  {
    family:'cardiac-ct', anchors:anchors.cardiac, clinicalPattern:'cardiac.{0,35}(?:CT|computed tomography)|coronary.{0,25}(?:CT|angiogra)|CCTA',
    expectations:{unknownKinds:['currentPractice','regulatory'], requirementLabels:['Cardiac CT'], distinction:'CT interpretation evidence is different from general cardiology or coronary surgery.'},
    development:[
      {message:'Find UK clinical experts for adult cardiac CT software supporting assessment of coronary artery disease. Help us examine the clinical relevance of its outputs. Current clinical practice is essential; regulatory-assessment experience is optional.'},
      {message:'We are reviewing cardiac CT software for adults. Find clinicians with cardiac CT experience.', followups:['Include radiologists.','UK only.'],knownRelevantSourceIds:['bupa_11411']}
    ],
    holdout:[
      {message:'For software analysing coronary CT in adults, help us understand how incorrect results could affect the next clinical decision. Current clinical practice is essential; regulatory experience is optional.'},
      {message:'We need a UK clinician who reads CCTA for coronary artery disease to examine the clinical relevance of a scan-analysis device.', followups:['Current clinical practice is essential.']},
      {message:'Find cardiac CT experts for assessment of adult coronary artery disease imaging software.', followups:['Previous regulatory-assessment experience is useful but optional.','UK only.']},
      {message:'Our device supports clinicians interpreting coronary CT. Help us assess the consequences of incorrect results in adults.', followups:['Include radiologists specialising in cardiac imaging.'],knownRelevantSourceIds:['bupa_11411']}
    ]
  },
  {
    family:'skin-lesion-images', anchors:anchors.skin, clinicalPattern:'dermoscop|skin.{0,25}(?:lesion|cancer)|melanoma',
    expectations:{unknownKinds:['currentPractice','regulatory'],requirementLabels:['Skin lesions'],distinction:'Dermoscopy, skin-lesion work and a historical primary-care study are distinct evidence categories.'},
    development:[
      {message:'Find clinical experts for software evaluating skin-lesion images in primary care. Help us assess the clinical relevance of referral recommendations.'},
      {message:'We are assessing dermoscopy software for skin cancer diagnosis in adults. Research expertise is preferred.'}
    ],
    holdout:[
      {message:'For a device analysing images of skin lesions, help us examine which cases should be referred from primary care.'},
      {message:'Find UK experts in skin-lesion imaging for software supporting primary care referral decisions.',followups:['Current clinical practice is essential; regulatory experience is optional.']},
      {message:'We need skin cancer clinicians to assess dermoscopy software for adults.',followups:['Prioritise documented experience evaluating diagnostic studies.']},
      {message:'Find experts for skin-lesion images used by general practice staff. Help us understand the clinical consequences of a missed suspicious lesion.'}
    ]
  },
  {
    family:'outside-specialist-setting', anchors:anchors.skin, clinicalPattern:'dermoscop|skin.{0,25}(?:lesion|cancer)|melanoma',
    expectations:{unknownKinds:['currentPractice'],requirementLabels:['Skin lesions'],distinction:'Specialist experience does not establish the proposed home/community workflow.'},
    development:[
      {message:'Find skin-lesion imaging experts for software intended for home use. Help us examine the effect of non-specialist users interpreting the output.',mustRemainUnconfirmed:['Community / home use']},
      {message:'Our skin-lesion software will be used outside a specialist clinical setting. Research expertise is preferred.'}
    ],
    holdout:[
      {message:'We are assessing a skin-lesion imaging device for community setting use. Help us understand errors made by non-specialist users.',mustRemainUnconfirmed:['Community / home use']},
      {message:'Find clinicians with skin cancer expertise to review dermoscopy software for use at home.',mustRemainUnconfirmed:['Community / home use']},
      {message:'Our device analyses skin-lesion images outside a specialist clinical setting. Help us assess the referral workflow.',followups:['Current clinical practice is essential.']},
      {message:'Find experts in skin-lesion imaging for primary care staff.',followups:['Change the intended setting to home use.'],mustRemainUnconfirmed:['Community / home use']}
    ]
  },
  {
    family:'complementary-panel', anchors:anchors.skin, clinicalPattern:'dermoscop|skin.{0,25}(?:lesion|cancer)|melanoma',
    expectations:{unknownKinds:['currentPractice','regulatory'],requirementLabels:['Skin lesions'],distinction:'Clinical and research perspectives are complementary; a panel goal is not permission to pad results.'},
    development:[
      {message:'We are assessing skin-lesion images for primary care. We need one practising clinician and one research specialist.'},
      {message:'Find experts for a dermoscopy device in adults.',followups:['We need one practising clinician and one research specialist.'],requirementLabels:['Skin-lesion imaging']}
    ],
    holdout:[
      {message:'For skin-lesion imaging software used in general practice, we need one practising clinician and one research specialist.'},
      {message:'Find UK experts for skin-lesion software.',followups:['We need one practising clinician and one research specialist.','Regulatory experience is optional.']},
      {message:'Help us assess the clinical relevance of dermoscopy software for adults.',followups:['We need one practising clinician and one research specialist.','Prioritise documented experience evaluating diagnostic studies.'],requirementLabels:['Skin-lesion imaging']},
      {message:'Find two experts for a skin-lesion imaging device used in primary care.',followups:['We need one practising clinician and one research specialist.']}
    ]
  },
  {
    family:'relationship-review', anchors:anchors.relationship, clinicalPattern:'skin.{0,25}(?:lesion|cancer)|dermoscop',
    expectations:{unknownKinds:['currentPractice','regulatory'],requirementLabels:['Skin lesions'],distinction:'The recorded Check 4 Cancer role requires review; it is not itself a conflict determination.'},
    development:[
      {message:'Find experts for skin-lesion imaging software. Manufacturer: Check 4 Cancer.',relationshipOrganisation:'Check 4 Cancer'},
      {message:'Find experts in skin cancer for dermoscopy software.',followups:['Manufacturer: Check 4 Cancer.'],relationshipOrganisation:'Check 4 Cancer'}
    ],
    holdout:[
      {message:'Find UK experts in skin-lesion imaging for a telemedicine device. Manufacturer: Check 4 Cancer.',relationshipOrganisation:'Check 4 Cancer'},
      {message:'Our software assesses skin lesions for primary care.',followups:['Manufacturer: Check 4 Cancer.','Research expertise is preferred.'],relationshipOrganisation:'Check 4 Cancer'},
      {message:'Find experts for a skin-lesion imaging assessment. Manufacturer: Fictional Example Devices.',relationshipOrganisation:'Fictional Example Devices',expectNoEstablishedRelationship:true},
      {message:'Find skin cancer experts for dermoscopy software.',followups:['Manufacturer: Fictional Example Devices.'],relationshipOrganisation:'Fictional Example Devices',expectNoEstablishedRelationship:true}
    ]
  },
  {
    family:'clinical-not-regulatory', anchors:anchors.cardiac, clinicalPattern:'cardiac.{0,35}(?:CT|computed tomography)|coronary.{0,25}(?:CT|angiogra)|CCTA',
    expectations:{unknownKinds:['currentPractice','regulatory'],requirementLabels:['Cardiac CT'],distinction:'Clinical CT practice can support consideration without documented regulatory-assessment experience.'},
    development:[
      {message:'Find cardiac CT clinicians for adult coronary artery disease software. Regulatory experience is optional.'},
      {message:'Find experts for cardiac CT software. Regulatory-assessment experience is essential.',followups:['Regulatory experience is optional.']}
    ],
    holdout:[
      {message:'For adult cardiac CT software, find clinicians with coronary CT experience. Previous regulatory-assessment experience is useful but optional.'},
      {message:'Find experts for coronary CT software.',followups:['Current clinical practice is essential; regulatory experience is optional.']},
      {message:'Find cardiac CT clinicians for assessment of coronary artery disease software.',followups:['Regulatory-assessment experience is essential.'],documentedOnly:true,expectEmpty:true},
      {message:'Find experts for cardiac CT software.',followups:['Regulatory experience is optional.','Remove regulatory experience.'],removedLabels:['Medical-device assessment experience']}
    ]
  },
  {
    family:'insufficient-evidence', anchors:[], clinicalPattern:null,
    expectations:{unknownKinds:['currentPractice','regulatory'],requirementLabels:[],distinction:'A vague or unsupported request does not justify an approved expert recommendation.'},
    development:[
      {message:'Find a cardiology expert.',expectClarification:true},
      {message:'Find cardiac CT experts for a device assessment. Current clinical practice is essential.',documentedOnly:true,expectEmpty:true}
    ],
    holdout:[
      {message:'We need an expert.',expectClarification:true},
      {message:'Find a dermatology expert.',expectClarification:true},
      {message:'Find experts for cardiac CT software. Current clinical practice is essential.',documentedOnly:true,expectEmpty:true},
      {message:'Find experts for software analysing skin-lesion images. Regulatory-assessment experience is essential.',documentedOnly:true,expectEmpty:true}
    ]
  }
];
const scenarios = families.flatMap(family => ['development','holdout'].flatMap(split => family[split].map((item,index) => Object.freeze({
  id:`${split==='development'?'dev':'hold'}-${family.family}-${index+1}`,split,family:family.family,
  fictional:true,knownRelevantSourceIds:family.anchors,clinicalPattern:family.clinicalPattern,
  expectations:family.expectations,...item
}))));
module.exports = Object.freeze({version:'expert-evaluation-v1',freezeDate,sourceFacts,scenarios});
