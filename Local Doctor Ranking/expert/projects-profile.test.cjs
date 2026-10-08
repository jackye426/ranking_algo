'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('./public/projects.js'),{buildCorpus}=require('./data.cjs'),{buildProfile,profilePreview}=require('./profile.cjs');
const brief={version:1,summary:'Brain tumour expertise',requirements:[{id:'brain',label:'Brain tumours',kind:'condition',importance:'focus',text:'Brain tumours'}]};
const radius={kind:'radius',country:'GB',query:'Bristol',label:'Bristol',latitude:51.4545,longitude:-2.5879,radiusMiles:25,precision:'city centre',sourceUrl:'https://www.openstreetmap.org/'};
function fixture(){
  const corpus=buildCorpus([{id:'source-1',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Clinical oncology',about:'I trained in radiotherapy for adult brain tumours.',clinical_interests:'Brain tumours',procedures:'Stereotactic radiotherapy',locations:[{hospital:'Example Hospital',postcode:'BS1 1AA',country:'UK'}]}]);
  const candidate={...corpus.candidates[0],requirementMatrix:[],evidence:[],reasons:[]};
  candidate.profileBackground=buildProfile(candidate,corpus.passages,{corpusVersion:corpus.version});candidate.backgroundPreview=profilePreview(candidate.profileBackground,{query:'brain tumours'});
  return P.saveCandidate(P.createProject('Saved background'),candidate,brief,corpus.version);
}
test('saved full background and preview round trip without requiring search matrix evidence',()=>{
  const project=fixture(),restored=P.importJSON(P.exportJSON(project));assert.deepEqual(restored.candidates,project.candidates);assert.equal(restored.candidates[0].candidate.evidence.length,0);assert.equal(restored.candidates[0].candidate.profileBackground.about[0].type,'training');assert.ok(restored.candidates[0].candidate.profileBackground.about[0].qualifiers.includes('training-not-practice'));
});
test('background ownership and corpus versions are validated independently of relevance',()=>{
  const edits=[c=>c.profileBackground.candidateId='other',c=>c.profileBackground.corpusVersion='newer',c=>c.profileBackground.about[0].candidateId='other',c=>c.profileBackground.about[0].sourceRecordId='other-record',c=>c.profileBackground.about[0].id='missing',c=>c.profileBackground.about[0].sources[0].sourceRecordId='other-record',c=>c.profileBackground.practiceLocations[0].provenance.sourceRecordId='other-record'];
  for(const edit of edits){const project=fixture();edit(project.candidates[0].candidate);assert.throws(()=>P.exportJSON(project),/attribution|evidence version/);}
});
test('background preview cannot introduce a different person, version or detached excerpt',()=>{
  for(const edit of [e=>e.candidateId='other',e=>e.corpusVersion='other',e=>e.sourceRecordId='other',e=>e.excerpt='This invented expertise is not in the source.']){const project=fixture();edit(project.candidates[0].candidate.backgroundPreview[0]);assert.throws(()=>P.exportJSON(project),/preview attribution/);}
});
test('import cannot replace a source-owned profile block with an invented qualification',()=>{
  const project=fixture(),e=project.candidates[0].candidate.profileBackground.about[0];e.blocks=[{kind:'list-item',text:'Performs radioactive brain implants.'}];
  assert.throws(()=>P.validateProject(project),/background attribution/);assert.throws(()=>P.importJSON(JSON.stringify({format:'docmap-expert-project',schema:1,project})),/background attribution/);
});
test('import cannot omit or reorder the negative lead-in of a clinical list',()=>{
  const corpus=buildCorpus([{id:'r1',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Clinical oncology',about:'I do not perform:* Radioactive brain implants* Brain stimulation'}]),candidate={...corpus.candidates[0],requirementMatrix:[],evidence:[],reasons:[]};candidate.profileBackground=buildProfile(candidate,corpus.passages,{corpusVersion:corpus.version});
  const project=P.saveCandidate(P.createProject(),candidate,brief,corpus.version);assert.doesNotThrow(()=>P.validateProject(project));
  for(const change of [blocks=>blocks.slice(1),blocks=>[...blocks].reverse(),blocks=>blocks.map(b=>({...b,kind:'list-item'}))]){const edited=structuredClone(project),e=edited.candidates[0].candidate.profileBackground.about[0];e.blocks=change(e.blocks);assert.throws(()=>P.validateProject(edited),/background attribution/);}
});
test('preview excerpt may use a literal truncated span but cannot append unsupported words',()=>{
  const project=fixture(),e=project.candidates[0].candidate.backgroundPreview[0];e.excerpt=e.text.slice(0,20)+'…';assert.doesNotThrow(()=>P.validateProject(project));
  for(const excerpt of [e.text+' and performs implants','…','',e.text.slice(0,10)+'… performs implants']){const edited=structuredClone(project);edited.candidates[0].candidate.backgroundPreview[0].excerpt=excerpt;assert.throws(()=>P.validateProject(edited),/preview attribution/);}
});
test('new scope marks old decisions for review while retaining the saved background version',()=>{
  const project=fixture(),saved=structuredClone(project.candidates[0].candidate.profileBackground),changed=P.setBrief(project,{...brief,version:2,locationFilter:radius},'later-corpus');
  assert.equal(changed.candidates[0].needsReview,true);assert.deepEqual(changed.candidates[0].candidate.profileBackground,saved);assert.deepEqual(P.importJSON(P.exportJSON(changed)).candidates[0].candidate.profileBackground,saved);
});
test('location identity affects review scope while provenance or spelling alone does not',()=>{
  const project=fixture(),version=project.corpusVersion,restricted=P.setBrief(project,{...brief,locationFilter:radius},version);
  assert.equal(restricted.candidates[0].needsReview,true);assert.notEqual(P.scope(brief),P.scope(restricted.activeBrief));
  assert.equal(P.scope({...brief,locationFilter:radius}),P.scope({...brief,locationFilter:{...radius,query:'bristol',label:'BRISTOL',sourceUrl:'https://another.example'}}));
  assert.notEqual(P.scope({...brief,locationFilter:radius}),P.scope({...brief,locationFilter:{...radius,radiusMiles:50}}));assert.equal(P.scope({...brief,locationFilter:null}),P.scope(brief));
});
test('location drafts and recovery submissions preserve newer text and explicit Anywhere clearing',()=>{
  for(const locationFilter of [null,{query:'Bristol',radiusMiles:25}]){
    const project=fixture();project.activeBrief.locationFilter=radius;project.locationDrafts={home:{query:'London',radiusMiles:10,dirty:true},followup:{query:'Bristol',radiusMiles:25,dirty:false}};project.draft='A newer clinical request';project.failedSearch={id:'failed',status:'failed',submittedAt:'2026-10-08',baseBrief:project.activeBrief,payload:{message:'Brain implants',locationFilter},filters:{documentedOnly:false,uncontactedOnly:false},code:'interpretation_failed',error:'Please edit your request.'};
    const restored=P.importJSON(P.exportJSON(project));assert.deepEqual(restored.locationDrafts,project.locationDrafts);assert.deepEqual(restored.failedSearch,project.failedSearch);assert.equal(restored.draft,project.draft);
  }
});
test('location-only failed requests are valid, conflicting operations and invalid geography are rejected',()=>{
  const project=fixture();project.failedSearch={id:'f',status:'failed',submittedAt:'2026-10-08',baseBrief:brief,payload:{locationFilter:{query:'Bristol',radiusMiles:25}},filters:{documentedOnly:false}};assert.doesNotThrow(()=>P.exportJSON(project));
  for(const payload of [{message:'one',patch:{requirementId:'brain',importance:'focus'}},{locationFilter:{query:'Bristol',radiusMiles:100}},{locationFilter:{query:'Bristol',latitude:0}},{locationFilter:'UK'}])assert.throws(()=>P.validateProject({...project,failedSearch:{...project.failedSearch,payload}}),/saved failed/);
  for(const location of [{...radius,country:'US'},{...radius,latitude:NaN},{...radius,latitude:'51.4'},{...radius,radiusMiles:20},{...radius,sourceUrl:'javascript:alert(1)'}])assert.throws(()=>P.validateProject({...project,activeBrief:{...brief,locationFilter:location}}),/geographic filter/);
  assert.throws(()=>P.validateProject({...project,locationDrafts:{followup:{query:'UK',radiusMiles:25,dirty:'yes'}}}),/location drafts/);
});
test('review pack separates background from matches and includes exact owned citations with unknown dates',()=>{
  const project=fixture();project.activeBrief.locationFilter=radius;const html=P.exportHTML(project,{baseUrl:'https://preview.example'}),e=project.candidates[0].candidate.profileBackground.about[0];
  assert.match(html,/Within 25 miles of Bristol/);assert.match(html,/Approximate straight-line distance/);assert.match(html,/Professional background · saved snapshot/);assert.match(html,/independently of the evidence for the search requirements/);assert.match(html,/Recorded training/);assert.match(html,/Source date: Not recorded/);assert.ok(html.includes('https://preview.example/api/expert/sources/'+e.candidateId+'?evidence='+e.id+'&amp;corpusVersion='+encodeURIComponent(project.corpusVersion)+'&amp;profileVersion=expert-profile-v2#evidence-'+e.id));assert.match(html,/Recorded procedures/);assert.match(html,/Stereotactic radiotherapy/);assert.match(html,/training not practice/);assert.match(html,/not establish experience with an unrecorded procedure/);
});
test('legacy schema-one backups keep missing background explicit and never fetch current evidence',()=>{
  const project=fixture();delete project.candidates[0].candidate.profileBackground;delete project.candidates[0].candidate.backgroundPreview;
  const restored=P.importJSON(P.exportJSON(project));assert.equal(restored.schema,1);assert.equal(restored.candidates[0].candidate.profileBackground,undefined);assert.match(P.exportHTML(restored),/full professional background was not saved/);assert.match(P.exportHTML(restored),/no newer records have been substituted/);
});
test('unsafe profile links and HTML strings are escaped in background export',()=>{
  const project=fixture(),bg=project.candidates[0].candidate.profileBackground;bg.profileUrls=['javascript:alert(1)','https://provider.example/doctor'];bg.about[0].text='<script>Example</script>';bg.about[0].blocks=[{kind:'paragraph',text:bg.about[0].text}];const html=P.exportHTML(project);assert.doesNotMatch(html,/<script>|javascript:/);assert.match(html,/&lt;script&gt;Example/);assert.match(html,/provider.example\/doctor/);
});
