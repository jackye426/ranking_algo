'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCorpus}=require('./data.cjs'),{buildProfile,profilePreview}=require('./profile.cjs'),{matrixFor}=require('./search.cjs');
const E=require('./public/evidence.js'),P=require('./public/projects.js');
const row=extra=>({id:'source-1',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Radiology',...extra});
const prepare=extra=>{const corpus=buildCorpus([row(extra)]),candidate=corpus.candidates[0];return {corpus,candidate,profile:buildProfile(candidate,corpus.passages,{corpusVersion:corpus.version})};};
const provenance={releaseId:'repair-fixture',baselineSha256:'a'.repeat(64),beforeHash:'b'.repeat(64),snapshotSha256:'c'.repeat(64),parserVersion:'parser-fixture',reviewId:'review-fixture'};
const requirement={id:'ct',kind:'modality',label:'CT',text:'CT',importance:'essential'};

test('procedure records with absent optional URLs avoid invalid-URL exceptions while retaining source-record attribution',()=>{
  const NativeURL=global.URL;let missingUrlAttempts=0;
  global.URL=class extends NativeURL {constructor(value,...args){if(value==='undefined'||value==='null')missingUrlAttempts++;super(value,...args);}};
  try {
    const {corpus}=prepare({procedure_volumes_phin:Array.from({length:40},(_,i)=>({procedure_name:'Cardiac CT '+i,admissions:'<=7',reporting_period:'2025',source_url:i%2?null:undefined}))});
    const facts=corpus.passages.filter(p=>p.field==='procedure_volumes_phin');
    assert.ok(facts.length);assert.ok(facts.every(p=>p.sourceUrl===null&&p.attribution==='source-record'));
    assert.equal(facts.flatMap(p=>p.volumes||[p.volume]).length,40);
    assert.equal(missingUrlAttempts,0);
  } finally {global.URL=NativeURL;}
});

test('two-character clinical entries survive corpus, profile blocks and schema-one backup',()=>{
  for(const term of ['CT','MR']){
    const {corpus,candidate,profile}=prepare({areas_of_interest:[term]});
    assert.equal(profile.clinicalInterests[0].text,term);assert.equal(profile.clinicalInterests[0].blocks[0].text,term);
    const saved=P.saveCandidate(P.createProject(),{...candidate,requirementMatrix:[],evidence:[],reasons:[],profileBackground:profile},{version:1,requirements:[]},corpus.version);
    assert.equal(P.importJSON(P.exportJSON(saved)).candidates[0].candidate.profileBackground.clinicalInterests[0].text,term);
  }
});

for(const value of ['No\nCT\nMR','CT\nMR\nNo',['No','CT','MR'],'I do not perform:\nCT\nMR'])test('a negative list remains scoped through retrieval and preview: '+JSON.stringify(value),()=>{
  const {corpus,candidate,profile}=prepare({areas_of_interest:value}),facts=corpus.passages.filter(p=>p.field==='areas_of_interest');
  assert.equal(facts.length,1);assert.ok(facts[0].qualifiers.includes('contains-negation'));assert.match(facts[0].text,/CT/);assert.match(facts[0].text,/No|do not/);
  const matrix=matrixFor(candidate,corpus.passages,{requirements:[requirement],roles:[]});assert.notEqual(matrix[0].status,'documented');assert.notEqual(matrix[0].status,'potential');
  for(const preview of profilePreview(profile,{query:'CT MR'}))assert.match(preview.excerpt,/No|do not/);
  assert.ok(E.displayBlocks(profile.clinicalInterests[0].text).some(b=>/No|do not/.test(b.text)));
});

test('oversized ambiguous negative lists are withheld, never emitted as positive fragments',()=>{
  const {corpus}=prepare({areas_of_interest:'No\n'+('CT cardiac scans\n'.repeat(400))});assert.ok(!corpus.passages.some(p=>p.field==='areas_of_interest'));
});

test('a long negative source list remains complete and can be backed up within the presentation-block bound',()=>{
  const text='CT\n'.repeat(300)+'No',{corpus,candidate,profile}=prepare({areas_of_interest:text});
  const fact=profile.clinicalInterests[0];assert.equal(fact.text,text);assert.deepEqual(fact.blocks,[{kind:'paragraph',text}]);
  const saved=P.saveCandidate(P.createProject(),{...candidate,requirementMatrix:[],evidence:[],reasons:[],profileBackground:profile},{version:1,requirements:[]},corpus.version);
  const restored=P.importJSON(P.exportJSON(saved));assert.equal(restored.candidates[0].candidate.profileBackground.clinicalInterests[0].text,text);
  assert.notEqual(matrixFor(candidate,corpus.passages,{requirements:[requirement],roles:[]})[0].status,'documented');
});

test('PHIN censored admissions preserve period, hospital, code and date without an inferred count',()=>{
  const {profile}=prepare({procedure_volumes_phin:[{procedure_name:'Cardiac CT',admissions:'<=7',hospital:'Example Hospital',procedure_id:150,reporting_period:'2025',sourceDate:'2025-08-10',source_url:'https://www.phin.org.uk/profiles/consultants/example'}]});
  const p=profile.procedures[0],v=p.volume;assert.equal(v.reportedRange,'<=7');assert.equal(v.reportedAdmissions,null);assert.equal(v.countNumeric,null);assert.equal(v.reportingPeriod,'2025');assert.equal(v.hospital,'Example Hospital');assert.equal(v.procedureCode,'150');assert.equal(v.sourceDate,'2025-08-10');assert.equal(v.comparable,false);
  assert.match(E.volumeSummary(p)[0],/Reported range: <=7.*Reporting period: 2025.*Example Hospital.*150/);assert.doesNotMatch(E.volumeSummary(p)[0],/Derived estimate/);
});

test('identical wording with different evidence types or dates does not collapse',()=>{
  const text='Cardiac CT';const {corpus}=prepare({clinical_interests:[{text,sourceDate:'2024'},{text,sourceDate:'2025'}],procedures:[{text,sourceDate:'2025'}]});
  const facts=corpus.passages.filter(p=>p.text===text);assert.equal(facts.length,3);assert.equal(new Set(facts.map(p=>p.id)).size,3);assert.deepEqual(new Set(facts.map(p=>p.type)),new Set(['clinical-interest','procedure']));
});

test('repair provenance is additive, bounded and cannot affect identity grouping',()=>{
  const before=prepare({clinical_interests:'CT'}),after=prepare({clinical_interests:{text:'CT',sourceUrl:'https://provider.example/profile',repairProvenance:{...provenance,localPath:'PRIVATE',patient:'PRIVATE'}}});
  assert.equal(before.candidate.id,after.candidate.id);assert.equal(before.candidate.role,after.candidate.role);
  const fact=after.profile.clinicalInterests[0];assert.deepEqual(fact.repairProvenance,provenance);assert.deepEqual(fact.sources[0].repairProvenance,provenance);assert.ok(!JSON.stringify(after.corpus).includes('PRIVATE'));
});

test('trusted professional context is typed without changing canonical role or creating performed activity',()=>{
  const context=(kind,text)=>({kind,text,sourceUrl:'https://provider.example/profile',repairProvenance:provenance});
  const {corpus,candidate,profile}=prepare({professional_context:[context('profession','Physiotherapist'),context('condition','Skin cancer'),context('population','Children'),context('language','French'),context('service','Industry consulting'),context('contact','PRIVATE'),{kind:'condition',text:'UNREVIEWED'}]});
  assert.equal(candidate.role,'Radiology');const facts=corpus.passages.filter(p=>p.field.startsWith('professional_context.'));assert.equal(facts.length,5);assert.ok(facts.every(p=>!p.attributes.activity.length));assert.ok(facts.filter(p=>p.field!=='professional_context.condition').every(p=>p.type==='professional-background'&&!Object.values(p.attributes).flat().length));assert.ok(profile.clinicalInterests.some(p=>p.text==='Skin cancer'));assert.ok(!JSON.stringify(corpus).includes('PRIVATE'));assert.ok(!JSON.stringify(corpus).includes('UNREVIEWED'));
});

test('preview searches the complete owned pool while the returned profile stays bounded',()=>{
  const about=Array.from({length:15},(_,i)=>({text:`I report cardiac CT in the marker${i} service.`,sourceLabel:'Profile '+i,sourceUrl:`https://provider.example/profile/${i}`}));
  const {corpus,profile}=prepare({about});assert.equal(profile.about.length,8);assert.equal(profile.counts.about,15);
  const omitted=corpus.passages.find(p=>p.field==='about'&&!profile.about.some(shown=>shown.id===p.id)),token=omitted.text.match(/marker\d+/)[0];
  assert.ok(profilePreview(profile,{query:token}).some(p=>p.id===omitted.id));assert.equal(profile.about.length,8);assert.equal(JSON.stringify(profile).includes(omitted.text),false);
});

test('saved source URLs are pinned to their evidence versions and legacy URL calls remain valid',()=>{
  const url=new URL(E.recordUrl('person','fact','https://example.invalid',{corpusVersion:'corpus-v2',profileVersion:'expert-profile-v2'}));assert.equal(url.searchParams.get('corpusVersion'),'corpus-v2');assert.equal(url.searchParams.get('profileVersion'),'expert-profile-v2');assert.equal(url.hash,'#evidence-fact');
  assert.equal(E.recordUrl('person','fact','https://example.invalid'),'https://example.invalid/api/expert/sources/person?evidence=fact#evidence-fact');
});

test('release metadata survives saved snapshots and exports without rewriting legacy evidence',()=>{
  const {corpus,candidate,profile}=prepare({areas_of_interest:'Cardiac CT'}),brief={version:1,requirements:[]},release='r0-safe-20261008-v2';
  profile.dataReleaseId=release;
  let project=P.setBrief(P.createProject(),brief,corpus.version,{dataReleaseId:release});
  project=P.saveCandidate(project,{...candidate,requirementMatrix:[],evidence:[],reasons:[],profileBackground:profile},brief,corpus.version,{dataReleaseId:release});
  project=P.changeReview(project,candidate.id,'qualification','reviewed-by-team',{actor:'user'});
  const originalEvidence=JSON.stringify(project.candidates[0].candidate);
  const later=P.setBrief(project,brief,'new-corpus',{dataReleaseId:'bupa-r1-20261008-v2'});
  assert.equal(later.dataReleaseId,'bupa-r1-20261008-v2');assert.equal(later.candidates[0].dataReleaseId,release);assert.equal(later.candidates[0].needsReview,true);
  assert.equal(JSON.stringify(later.candidates[0].candidate),originalEvidence);assert.equal(later.candidates[0].decisions[0].dataReleaseId,release);
  const imported=P.importJSON(P.exportJSON(later));assert.equal(imported.candidates[0].candidate.profileBackground.dataReleaseId,release);assert.equal(imported.briefVersions[0].dataReleaseId,release);
  assert.match(P.exportHTML(later),/data release r0-safe-20261008-v2/);assert.match(P.exportHTML(later),/Data release: bupa-r1-20261008-v2/);
  const legacy=P.setBrief(P.createProject(),brief,corpus.version),restored=P.importJSON(P.exportJSON(legacy));assert.equal(Object.hasOwn(restored,'dataReleaseId'),false);assert.equal(Object.hasOwn(restored.briefVersions[0],'dataReleaseId'),false);
  assert.throws(()=>P.validateProject({...legacy,dataReleaseId:'x'.repeat(161)}),/release metadata/);
});
