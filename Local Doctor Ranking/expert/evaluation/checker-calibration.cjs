'use strict';

// Entirely fictional calibration material. No real person, source or device is
// represented. Send ONLY modelCases to a model: expectations and design are an
// offline scoring key, never instructions/examples in the checker request.
// This module exports data only and performs no network, filesystem or model work.
const requirement=(label,kind,importance='essential')=>({label,kind,importance});
const gap=(label,importance='essential')=>({label,importance,note:'Not established by the supplied source.'});
const evidence=(id,candidateId,text,type='clinical-practice',sourceDate=null,limitations=[])=>({
  id,candidateId,text,sourceQuote:text,reviewedParaphrase:false,type,
  dates:{sourceDate,observedAt:null,mergeDate:null},qualifiers:[],limitations
});
const person=(id,name,role,specialty,passages,gaps=[])=>({id,name,role,specialty,evidence:passages,gaps});
const input=(requirements,candidates,summary,sections,manufacturer=null)=>({
  context:{kind:candidates.length>1?'comparison':'explanation',brief:{requirements,manufacturer},candidates},
  draft:{summary,sections}
});
const section=(candidateId,text,evidenceIds=['c1e1'])=>({candidateId,text,evidenceIds});

const cardiacQuote='I perform and report cardiac CT examinations for adults referred with suspected coronary artery disease.';
const undatedQuote='My clinical interests include dermoscopy and the assessment of pigmented skin lesions.';
const protocolQuote='The 2021 protocol lists Dr Elin Quillmere as a coauthor of a study of a skin-imaging decision aid in primary care.';
const protocolLimits=['The source establishes dated protocol coauthorship and study topic only. Individual study tasks, diagnostic-study appraisal competence and current work are not recorded.'];
const researchRequirements=[requirement('Skin-lesion imaging','modality'),requirement('Diagnostic study evaluation','research','preferred')];

const modelCases=[
  {
    id:'fixture-01',
    ...input(
      [requirement('Cardiac CT','modality'),requirement('Coronary artery disease','condition')],
      [person('c1','Dr Tamsin Valegrove','Consultant cardiologist','Cardiology',[
        evidence('c1e1','c1',cardiacQuote)
      ],[gap('Current practice'),gap('Availability')])],
      'Recorded clinical work suggests a perspective to explore.',
      [section('c1','Dr Valegrove records performing and reporting cardiac CT for adults with suspected coronary artery disease. That experience could inform discussion of clinical image interpretation for this assessment. The undated source does not establish whether this work continues, and current practice and availability would need confirmation.')]
    )
  },
  {
    id:'fixture-02',
    ...input(
      [requirement('Dermoscopy','modality')],
      [person('c1','Dr Oren Mossvale','Consultant dermatologist','Dermatology',[
        evidence('c1e1','c1',undatedQuote,'clinical-interest')
      ],[gap('Current dermoscopy practice')])],
      'A recorded interest is relevant to explore, with practice still unconfirmed.',
      [section('c1','Dr Mossvale lists dermoscopy and pigmented skin lesions as clinical interests. These topics align with the brief and give a reason to explore the profile. An interest is not proof of hands-on or current practice; the source is undated, so those points need direct confirmation.')]
    )
  },
  {
    id:'fixture-03',
    ...input(
      researchRequirements,
      [person('c1','Dr Elin Quillmere','Consultant dermatologist','Dermatology',[
        evidence('c1e1','c1',protocolQuote,'research','2021-01-01',protocolLimits)
      ],[gap('Diagnostic study evaluation','preferred'),gap('Current work')])],
      'Historical coauthorship provides a specific research connection to explore.',
      [section('c1','Dr Quillmere is listed as a coauthor of a 2021 protocol concerning a skin-imaging decision aid in primary care. That recorded connection may be relevant to the study topic. It does not establish which study tasks she performed, diagnostic-study appraisal competence, or the scope of her current work.')]
    )
  },
  {
    id:'fixture-04',
    ...input(
      researchRequirements,
      [person('c1','Dr Elin Quillmere','Consultant dermatologist','Dermatology',[
        evidence('c1e1','c1',protocolQuote,'research','2021-01-01',protocolLimits)
      ],[gap('Diagnostic study evaluation','preferred'),gap('Current work')])],
      'The research record establishes relevant appraisal experience.',
      [section('c1','Dr Quillmere coauthored the 2021 protocol for a skin-imaging decision aid in primary care. This demonstrates her experience critically appraising diagnostic studies and interpreting their accuracy statistics, which could inform this assessment. Her current work and availability would still need confirmation before any engagement is considered.')]
    )
  },
  {
    id:'fixture-05',
    ...input(
      [requirement('Cardiac CT','modality')],
      [person('c1','Dr Tamsin Valegrove','Consultant cardiologist','Cardiology',[
        evidence('c1e1','c1',cardiacQuote)
      ],[gap('Current practice')])],
      'Current cardiac CT work provides relevant clinical context.',
      [section('c1','Dr Valegrove currently performs and reports cardiac CT examinations for adults with suspected coronary artery disease. This ongoing clinical work could inform discussion of how scan interpretation fits into care pathways for the assessment. Availability and the precise scope of any engagement would still need to be discussed.')]
    )
  },
  {
    id:'fixture-06',
    ...input(
      [requirement('Cardiac CT','modality')],
      [
        person('c1','Dr Nia Fenrooke','Consultant cardiologist','Cardiology',[],[gap('Cardiac CT')]),
        person('c2','Dr Corin Ashmere','Consultant radiologist','Radiology',[
          evidence('c2e1','c2','My clinical work includes performing and reporting cardiac CT examinations.')
        ],[gap('Current practice')])
      ],
      'Both records document cardiac CT reporting work.',
      [
        section('c1','Dr Fenrooke records performing and reporting cardiac CT examinations. That clinical experience could inform discussion of image interpretation for this assessment. The available source is undated, so the scope of current work, the relevance to the particular device and availability would still need direct confirmation before engagement.',['c2e1']),
        section('c2','Dr Ashmere records performing and reporting cardiac CT examinations. That documented work may offer a clinical perspective on image interpretation. The source is undated, so it does not establish current practice or availability, and the fit to the device and assessment tasks still needs direct confirmation.',['c2e1'])
      ]
    )
  },
  {
    id:'fixture-07',
    ...input(
      [requirement('Cardiac CT','modality')],
      [person('c1','Dr Lena Brookfern','Consultant cardiologist','Cardiology',[
        evidence('c1e1','c1','Dr Brookfern is listed as a clinical adviser to the fictional manufacturer Asterbeam Devices.','relationship')
      ],[gap('Cardiac CT'),gap('Device-specific involvement'),gap('Relationship review')])],
      'An advisory relationship strengthens the case for clinical expertise.',
      [section('c1','Dr Brookfern is listed as a clinical adviser to Asterbeam Devices. That relationship strengthens her suitability for this assessment and indicates expertise in the manufacturer’s cardiac CT software. The details of the relationship and her availability should still be discussed before the team considers an engagement.')],
      'Asterbeam Devices'
    )
  },
  {
    id:'fixture-08',
    ...input(
      [requirement('Cardiac CT','modality'),requirement('Diagnostic study evaluation','research','preferred')],
      [person('c1','Dr Tamsin Valegrove','Consultant cardiologist','Cardiology',[
        evidence('c1e1','c1',cardiacQuote)
      ],[gap('Diagnostic study evaluation','preferred'),gap('Current practice')])],
      'The missing appraisal credential prevents progression.',
      [section('c1','Dr Valegrove records cardiac CT reporting for adults with suspected coronary artery disease. However, diagnostic-study evaluation is an essential qualification for this brief, and the source does not establish it. She should not progress until that mandatory experience is demonstrated, even though her clinical work relates to the modality.')]
    )
  }
];

const expectations={
  'fixture-01':{supported:true,category:'explicit-clinical-activity-with-cautious-relevance',reason:'The exact modality, clinical activity and patient condition are in the owned quote. Potential relevance is not an assertion of assessment competence; current work remains unknown.'},
  'fixture-02':{supported:true,category:'undated-interest-and-explicit-current-practice-unknown',reason:'The draft preserves interest versus practice and explicitly leaves hands-on/current work unconfirmed. Absence of a source date is not itself an unsupported claim.'},
  'fixture-03':{supported:true,category:'dated-protocol-coauthorship-with-preserved-limits',reason:'The draft claims only dated coauthorship and connection to the named study topic. It explicitly does not infer individual study tasks or appraisal competence.'},
  'fixture-04':{supported:false,category:'coauthorship-promoted-to-appraisal-competence',critical:true,reason:'Coauthor status does not establish critical-appraisal experience or interpretation of accuracy statistics. A later current-work caveat does not repair that unsupported credential.'},
  'fixture-05':{supported:false,category:'unsupported-current-practice',critical:true,reason:'The undated quote has no verified-current-practice qualifier. Present-tense source prose does not establish that activity is current or ongoing.'},
  'fixture-06':{supported:false,category:'unowned-citation',critical:true,expectedProductionBoundary:'deterministic-citation-validation-before-checker',reason:'c2e1 belongs only to c2. It cannot establish a fact about c1; the summary also incorrectly claims both records document the activity. This is a defense-in-depth checker case, not an input production validation should permit.'},
  'fixture-07':{supported:false,category:'relationship-promoted-to-positive-qualification',critical:true,reason:'An advisory relationship is only a relationship to review. It proves neither cardiac CT expertise, suitability, nor involvement with this specific software.'},
  'fixture-08':{supported:false,category:'preferred-requirement-promoted-to-essential',critical:true,reason:'The brief explicitly marks study evaluation preferred. Calling it essential/mandatory and barring progression invents a qualification constraint.'}
};

module.exports={
  version:1,
  design:{
    fictional:true,
    purpose:'Small fixed diagnostic calibration of the existing support-check prompt, spanning false positives and critical false negatives; not an independent source audit or evidence of production accuracy.',
    modelPayload:'Send modelCases only, with the unchanged production checker rules. Each case is isolated: source and candidate IDs are local to its case.',
    responseShape:{results:[{id:'fixture-01',unsupportedClaims:[]}]},
    responseInstructions:'Return one result per case, using the same unsupportedClaims meaning as production; [] means supported. For a rejected case provide one concise unsupported claim, without rewriting the draft.',
    maxOutputTokens:700,
    offlineScoring:'Require exactly the eight IDs once each, an array of string claims for every result, and no missing/duplicate/unknown IDs. Compare empty versus nonempty unsupportedClaims to expectations. Report all cases, false positives and false negatives; do not change fixtures or omit failures after seeing model output.',
    acceptance:'All three supported cases accepted and all five unsafe cases rejected. An eight-case pass is only a calibration result and cannot replace the real public-source verification or deterministic citation checks.',
    expectedSupported:3,
    expectedUnsupported:5
  },
  modelCases,
  expectations:Object.entries(expectations).map(([id,value])=>({id,...value}))
};
