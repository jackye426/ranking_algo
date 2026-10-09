'use strict';

// An additive interpretation of the old results. Original scenario files and
// reports remain untouched and must still be executed/reported verbatim.
module.exports = Object.freeze({
  version: 'legacy-contract-dispositions-v1',
  expectationConflicts: [
    {id:'dev-insufficient-evidence-1', reason:'A cardiology role is sufficient for broad discovery; no automatic requirements may be added.'},
    {id:'hold-insufficient-evidence-2', reason:'A dermatology role is sufficient for broad discovery; no automatic requirements may be added.'},
    {id:'r2-insufficient-evidence-02', reason:'Medical imaging expertise is sufficient for broad discovery with appropriate evidence qualifications.'}
  ],
  functionalCases: [
    {id:'r2-skin-lesion-images-03', required:'Resolve clinical expertise essential against the existing clinical focus; later removal of research preserves skin-lesion expertise.'},
    {id:'r2-outside-specialist-setting-03', required:'Remove home use from active setting requirements; do not retrieve from removed historical wording.'},
    {id:'r2-insufficient-evidence-03', required:'Apply documented-essentials-only as a filter, not a literal expertise requirement.'},
    {id:'final-outside-01', required:'Retain lay/non-specialist intended-user context without treating it as a clinician qualification.'},
    {id:'final-outside-04', required:'No particular modality is assumed; preserve the clinical question and other supplied technology context.'},
    {id:'final-relationship-03', required:'Preserve the manufacturer and clinical focus; absence of company evidence does not establish independence.'},
    {id:'final-clinical-01', required:'A consultant title cannot establish the requested clinical activity or regulatory experience.'},
    {id:'final-insufficient-03', required:'Apply documented-essentials-only without discarding cardiac-CT expertise.'}
  ],
  failClosed:'If an instruction cannot be applied faithfully, retain the last accepted brief, identify the unresolved instruction and do not silently retrieve a broadened or unchanged accepted query.'
});
