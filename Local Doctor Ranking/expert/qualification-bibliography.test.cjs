'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCorpus}=require('./data.cjs'),{buildProfile}=require('./profile.cjs'),P=require('./public/projects.js');
const fields=['qualifications','detailed_qualifications','professional_context.qualification'];
const flag='bibliographic-reference-not-training-or-authorship';
function prepare(text,field){const row={id:'credential-source',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Medicine'};if(field.startsWith('professional_context.'))row.professional_context=[{kind:field.split('.')[1],text,sourceUrl:'https://provider.example/professional',repairProvenance:{releaseId:'fixture-release',reviewId:'source-reviewed'}}];else row[field]=[text];const corpus=buildCorpus([row]),candidate=corpus.candidates[0],passage=corpus.passages.find(p=>p.field===field),profile=buildProfile(candidate,corpus.passages,{corpusVersion:corpus.version});return {corpus,candidate,passage,profile};}
for(const field of fields)test('credential initials remain visible through profile and saved export: '+field,()=>{
 for(const text of ['MB BAO.BCh. LRCP&SI (Ire), MRCPCH (Ire), MSc','MB BS, MRCP','FRCS\nF.R.C.S. (Ed.) Royal College of Surgeons 1994','Final F.R.C.S. / Example College / 2001','Post M.Sc.Diploma Example University 2004','Dip SEM.UK&I','Cert LRS.','MBBSM Example University 1999']){
  const {corpus,candidate,passage,profile}=prepare(text,field);assert(passage,text);assert.equal(passage.text,text);assert(!passage.qualifiers.includes(flag),text);assert.deepEqual(passage.attributes.activity,[]);assert(profile.qualifications.some(p=>p.text===text));
  const saved=P.saveCandidate(P.createProject(),{...candidate,requirementMatrix:[],evidence:[],profileBackground:profile},{version:1,requirements:[]},corpus.version),restored=P.importJSON(P.exportJSON(saved));assert.deepEqual(restored.candidates[0].candidate.profileBackground.qualifications,profile.qualifications);assert(P.exportHTML(restored).includes(text.replace(/&/g,'&amp;')));
 }
});
test('qualification fields do not exempt genuine references or DOI-bearing degree-like text',()=>{
 for(const field of fields)for(const text of ['Example-Smith A.Training model for ultrasound-guided aspiration.','SMITH CT. Training model for radiology.','Chen MR, Example AB. Cardiac CT teaching research.','MB BS, research article doi:10.1234/fixture.2020','Final F.R.C.S. study doi: 10.12345/fixture']){
  const {passage,profile}=prepare(text,field);assert(passage,text);assert(passage.qualifiers.includes(flag),field+': '+text);assert(!profile.qualifications.some(p=>p.text===text));assert.deepEqual(passage.attributes.activity,[]);
 }
});
test('credential exception is source-field scoped and does not reclassify research or biography references',()=>{
 for(const field of ['about','research_interests','publications','professional_context.research-background','professional_context.academic-background']){const {passage}=prepare('MB BS, MRCP and research in coronary imaging.',field);assert(passage,field);assert(passage.qualifiers.includes(flag),field);}
 for(const text of ['Final A.Training model for imaging.','Post M.Research on imaging.','Dip AB. A study of teaching.','Cert AB. Imaging research.'])assert(prepare(text,'qualifications').passage.qualifiers.includes(flag),text);
});
test('short modalities and standalone degree abbreviations retain their recorded meaning',()=>{
 for(const text of ['CT','MR']){const {passage,profile}=prepare(text,'clinical_interests');assert.equal(passage.text,text);assert.equal(passage.type,'clinical-interest');assert(!passage.qualifiers.includes(flag));assert(profile.clinicalInterests.some(p=>p.text===text));}
 for(const text of ['MD','BSc','PhD']){const {passage,profile}=prepare(text,'qualifications');assert.equal(passage.text,text);assert.deepEqual(passage.attributes.activity,[]);assert(profile.qualifications.some(p=>p.text===text));}
});
test('separate FCPS and FHEA source entries both survive packing, profile and saved export',()=>{
 const entries=['MBBS','MRCOG RCOG, London 2009','FRCOG RCOG London 2022','MBBS University of Punjab Pakistan 1998','FCPS','MRCOG','FHEA','FCPS CPSP, Pakistan 2006','FHEA HEA,UK 2021','PG-cert Clinical education University of Leicester, Leicester 2026'],row={id:'credential-source',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Medicine',qualifications:[...entries]},before=structuredClone(row);
 const corpus=buildCorpus([row]),candidate=corpus.candidates[0],passages=corpus.passages.filter(p=>p.field==='qualifications'),profile=buildProfile(candidate,corpus.passages,{corpusVersion:corpus.version});
 assert.deepEqual(row,before);assert.equal(passages.map(p=>p.text).join('\n'),entries.join('\n'));assert(passages.every(p=>!p.qualifiers.includes(flag)&&p.attributes.activity.length===0));assert.equal(profile.qualifications.map(p=>p.text).join('\n'),entries.join('\n'));
 const saved=P.saveCandidate(P.createProject(),{...candidate,requirementMatrix:[],evidence:[],profileBackground:profile},{version:1,requirements:[]},corpus.version),restored=P.importJSON(P.exportJSON(saved)),html=P.exportHTML(restored);assert.deepEqual(restored.candidates[0].candidate.profileBackground.qualifications,profile.qualifications);for(const entry of entries)assert(html.includes(entry));
 // The same letters are not an unconditional exemption outside the typed field.
 assert(prepare('FHEA HEA,UK 2021','publications').passage.qualifiers.includes(flag));assert(prepare('FHEA HEA,UK 2021 doi:10.1234/fixture','qualifications').passage.qualifiers.includes(flag));
});
