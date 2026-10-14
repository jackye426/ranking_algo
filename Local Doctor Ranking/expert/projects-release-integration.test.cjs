'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('./public/projects.js'),E=require('./public/evidence.js');
const release='enriched-r3',corpus='source-owned-fixture',id='expert-test';
const brief={version:1,summary:'Clinical interests',requirements:[{id:'clinical',label:'Cardiac imaging',text:'Cardiac imaging',kind:'modality',importance:'focus'}]};
function fixture(){
  const profile={candidateId:id,corpusVersion:corpus,profileVersion:'expert-profile-v3',dataReleaseId:release,practiceLocations:[],profileUrls:[],registrations:[],counts:{},truncated:false};
  const candidate={id,name:'Dr Test Example',sourceRecordIds:['source-test'],evidenceIds:[],evidence:[],requirementMatrix:[],reasons:[],dataReleaseId:release,profileBackground:profile};
  const text={about:'A stored professional biography.',professions:'Dietitian',clinicalInterests:'Cardiac imaging',procedures:'Recorded modalities:\nCT\nMR\nNo',research:'Research interest: dietary assessment',populations:'Adults',languages:'Welsh: fluent',services:'Industry consultancy',affiliations:'Member of a recorded professional organisation',qualifications:'MSc Clinical Research'};
  for(const {key} of E.profileSections){
    const passage={id:'e-'+key,candidateId:id,sourceRecordId:'source-test',sourceLabel:'Stored provider profile',field:'professional_context.'+key,text:text[key],type:key==='clinicalInterests'?'clinical-interest':'professional-background',corpusVersion:corpus,profileVersion:profile.profileVersion,dates:{sourceDate:null,observedAt:null},qualifiers:[],attribution:'source-record',blocks:text[key].split('\n').map(text=>({kind:'paragraph',text}))};
    profile[key]=[passage];profile.counts[key]=1;candidate.evidenceIds.push(passage.id);
  }
  return P.saveCandidate(P.createProject('Enriched professional evidence'),candidate,brief,corpus,{dataReleaseId:release});
}
test('version-three background sections retain all source evidence through backup and printable pack',()=>{
  const project=fixture(),before=structuredClone(project),restored=P.importJSON(P.exportJSON(project)),html=P.exportHTML(project,{baseUrl:'https://preview.example'});
  assert.deepEqual(project,before);assert.deepEqual(restored.candidates,project.candidates);
  for(const {key,label} of E.profileSections){assert.ok(html.includes('<summary>'+label+'</summary>'));assert.ok(html.includes(project.candidates[0].candidate.profileBackground[key][0].text));}
  assert.match(html,/corpusVersion=source-owned-fixture&amp;profileVersion=expert-profile-v3/);assert.match(html,/independently of the evidence for the search requirements/);assert.equal(project.candidates[0].candidate.requirementMatrix.length,0);
});
test('v3 imports reject missing sections, detached source ownership and source-version substitutions',()=>{
  for(const edit of [bg=>delete bg.languages,bg=>bg.languages[0].candidateId='another-person',bg=>bg.languages[0].sourceRecordId='another-record',bg=>bg.languages[0].corpusVersion='newer-corpus',bg=>bg.dataReleaseId='another-release',bg=>bg.profileVersion='unrecognised-format']){
    const project=fixture();edit(project.candidates[0].candidate.profileBackground);assert.throws(()=>P.importJSON(JSON.stringify({format:'docmap-expert-project',schema:1,project})),/attribution|version/);
  }
});
test('v3 formatting validation retains short modalities and negative lead-ins exactly',()=>{
  const project=fixture();assert.doesNotThrow(()=>P.validateProject(project));
  for(const edit of [blocks=>blocks.slice(0,-1),blocks=>blocks.filter(b=>b.text!=='CT'),blocks=>[...blocks].reverse()]){
    const altered=structuredClone(project),e=altered.candidates[0].candidate.profileBackground.procedures[0];e.blocks=edit(e.blocks);assert.throws(()=>P.validateProject(altered),/background attribution/);
  }
});
test('legacy v1/v2 snapshots remain byte-equivalent when richer sections were never saved',()=>{
  for(const profileVersion of ['expert-profile-v1','expert-profile-v2']){
    const project=fixture(),candidate=project.candidates[0].candidate,profile=candidate.profileBackground;profile.profileVersion=profileVersion;
    for(const key of ['professions','populations','languages','services','affiliations']){delete profile[key];delete profile.counts[key];}
    for(const key of ['about','clinicalInterests','procedures','research','qualifications'])for(const e of profile[key]){e.profileVersion=profileVersion;delete e.blocks;}
    const before=structuredClone(project.candidates),restored=P.importJSON(P.exportJSON(project));assert.deepEqual(restored.candidates,before);assert.equal(restored.candidates[0].candidate.profileBackground.languages,undefined);
  }
});
test('a data-release change marks decisions stale without rewriting saved wording, notes or review history',()=>{
  let project=fixture();project.notes='Private project note';project=P.changeReview(project,id,'qualification','reviewed-by-team',{actor:'user'});const original=structuredClone(project.candidates[0]);
  const changed=P.setBrief(project,brief,corpus,{dataReleaseId:'enriched-r4'});assert.equal(changed.candidates[0].needsReview,true);assert.equal(changed.candidates[0].dataReleaseId,release);assert.deepEqual(changed.candidates[0].candidate,original.candidate);assert.deepEqual(changed.candidates[0].decisions,original.decisions);assert.equal(changed.notes,project.notes);
  changed.candidates[0].needsReview=false;const restored=P.importJSON(P.exportJSON(changed));assert.equal(restored.candidates[0].needsReview,true);assert.deepEqual(restored.candidates[0].candidate,original.candidate);
});
test('refreshing a saved candidate does not approve the new release without a new explicit team decision',()=>{
  let project=P.changeReview(fixture(),id,'qualification','reviewed-by-team',{actor:'user'});project=P.setBrief(project,brief,corpus,{dataReleaseId:'enriched-r4'});
  const newer=structuredClone(project.candidates[0].candidate);newer.dataReleaseId='enriched-r4';newer.profileBackground.dataReleaseId='enriched-r4';project=P.saveCandidate(project,newer,brief,corpus,{dataReleaseId:'enriched-r4'});
  assert.equal(project.candidates[0].needsReview,true);assert.equal(project.candidates[0].decisions[0].dataReleaseId,release);
  project=P.changeReview(project,id,'qualification','reviewed-by-team',{actor:'user'});assert.equal(project.candidates[0].needsReview,false);assert.equal(project.candidates[0].decisions.length,2);assert.equal(project.candidates[0].decisions[1].dataReleaseId,'enriched-r4');
});
test('release validation rejects background metadata from a different saved snapshot',()=>{
  for(const change of [s=>s.dataReleaseId='other-release',s=>s.candidate.dataReleaseId='other-release']){const project=fixture();change(project.candidates[0]);assert.throws(()=>P.validateProject(project),/release attribution|background attribution/);}
});

test('generated citations bind saved releases even when corpus and projection are unchanged',()=>{
  const project=fixture(),before=structuredClone(project),first=E.recordUrl(id,'e-about','https://preview.example',{corpusVersion:corpus,profileVersion:'expert-profile-v3',dataReleaseId:release}),other=E.recordUrl(id,'e-about','https://preview.example',{corpusVersion:corpus,profileVersion:'expert-profile-v3',dataReleaseId:'enriched-r4'});
  assert.notEqual(first,other);assert.equal(new URL(first).searchParams.get('dataReleaseId'),release);
  for(const dataReleaseId of [undefined,null,''])assert.equal(new URL(E.recordUrl(id,'e-about','https://preview.example',{dataReleaseId})).searchParams.has('dataReleaseId'),false);
  const html=P.exportHTML(project,{baseUrl:'https://preview.example'});const links=[...html.matchAll(/href="([^"]*\/api\/expert\/sources\/[^\"]*)"/g)].map(m=>new URL(m[1].replace(/&amp;/g,'&')));assert.ok(links.length>0);assert.ok(links.every(url=>url.searchParams.get('dataReleaseId')===release));assert.deepEqual(project,before);
  const wrapperOnly=fixture();delete wrapperOnly.candidates[0].candidate.dataReleaseId;delete wrapperOnly.candidates[0].candidate.profileBackground.dataReleaseId;assert.match(P.exportHTML(wrapperOnly),/dataReleaseId=enriched-r3/);
});
test('reviewed background summaries are not exported as literal quotations',()=>{
  const project=fixture(),e=project.candidates[0].candidate.profileBackground.research[0];e.reviewedParaphrase=true;e.sourceQuote='The exact stored research statement.';const html=P.exportHTML(project);
  assert.ok(html.includes('<p>'+e.text+'</p>'));assert.ok(!html.includes('<blockquote>'+e.text+'</blockquote>'));assert.ok(html.includes('<blockquote>'+e.sourceQuote+'</blockquote>'));
});

test('source-reported research and professional bodies stay neutral in labels and export',()=>{
  const project=fixture(),background=project.candidates[0].candidate.profileBackground;
  background.research[0].field='professional_context.research-background';background.research[0].qualifiers=['profile-reported-research-not-verified-authorship'];
  background.about[0].field='professional_context.professional-body';
  assert.equal(E.typeLabel(background.research[0]),'Reported research background');assert.equal(E.typeLabel(background.about[0]),'Recorded professional context');
  assert.equal(E.typeLabel('research'),'Recorded research');
  const html=P.exportHTML(project);assert.match(html,/Reported research background/);assert.match(html,/Recorded professional context/);
  assert.deepEqual(P.importJSON(P.exportJSON(project)).candidates,project.candidates);
});
test('explicit language, service and documented-only scope persists while legacy omission stays unchanged',()=>{
  const project=fixture(),legacyScope=P.scope(project.activeBrief);assert.equal(P.scope({...project.activeBrief,documentedOnly:false}),legacyScope);
  const next=P.setBrief(project,{...brief,documentedOnly:true,requirements:[...brief.requirements,{id:'welsh',kind:'language',text:'Welsh',label:'Welsh',importance:'preferred'},{id:'consulting',kind:'service',text:'Industry consultancy',label:'Industry consultancy',importance:'focus'}]},corpus,{dataReleaseId:release});
  assert.equal(next.candidates[0].needsReview,true);assert.equal(next.candidates[0].brief.documentedOnly,undefined);const restored=P.importJSON(P.exportJSON(next));assert.deepEqual(restored.activeBrief,next.activeBrief);assert.equal(restored.candidates[0].brief.documentedOnly,undefined);assert.match(P.exportHTML(restored),/Evidence filter: documented essentials only/);assert.doesNotMatch(P.exportHTML(restored),/Saved evidence filter: documented essentials only/);
  for(const documentedOnly of ['true',1,null])assert.throws(()=>P.validateProject({...next,activeBrief:{...next.activeBrief,documentedOnly}}),/evidence-only filter/);
});
test('enriched evidence labels preserve qualifications, affiliations and historical activity distinctions',()=>{
  assert.equal(E.typeLabel('qualification'),'Recorded qualification');assert.equal(E.typeLabel('affiliation'),'Recorded affiliation');assert.equal(E.typeLabel('activity-volume'),'Reported activity');
  const project=fixture(),profile=project.candidates[0].candidate.profileBackground;profile.qualifications[0].type='qualification';profile.affiliations[0].type='affiliation';profile.procedures[0].type='activity-volume';profile.procedures[0].volume={reportedRange:'<=7',countNumeric:3.5,reportingPeriod:'2020'};const html=P.exportHTML(project);
  assert.match(html,/Recorded qualification/);assert.match(html,/Recorded affiliation/);assert.match(html,/Reported activity/);assert.match(html,/Reported range: &lt;=7/);assert.match(html,/Derived estimate: 3.5 \(not an observed count\)/);
});
