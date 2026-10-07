'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('./public/projects.js');
const brief={version:1,summary:'Cardiac CT',requirements:[{id:'ct',label:'Cardiac CT',text:'Cardiac CT',kind:'modality',importance:'essential'}]};
const candidate={id:'expert-a',name:'Dr A',role:'Radiologist',reasons:['Documented cardiac CT reporting.'],requirementMatrix:[{requirementId:'ct',label:'Cardiac CT',status:'documented',importance:'essential',evidenceIds:['e1']}],evidence:[{id:'e1',candidateId:'expert-a',sourceRecordId:'r1',field:'about',type:'clinical-practice',text:'Reports cardiac CT.',sourceUrl:'https://example.org/a',dates:{sourceDate:null}}],questions:[{text:'Confirm current activity.'}]};
const saved=()=>p.saveCandidate(p.createProject('Cardiac pathway'),candidate,brief,'corpus-v1');
test('project namespace is separate from patient storage',()=>assert.equal(p.DATABASE,'docmap-expert-projects-v1'));
test('save snapshots evidence and exact brief without aliasing',()=>{const s=saved();s.candidates[0].candidate.evidence[0].text='Changed';assert.equal(candidate.evidence[0].text,'Reports cardiac CT.');assert.deepEqual(s.candidates[0].brief,brief);});
test('AI cannot record review decisions or recruitment events',()=>{assert.throws(()=>p.changeReview(saved(),'expert-a','qualification','reviewed-by-team',{actor:'ai'}));assert.throws(()=>p.recordEvent(saved(),'expert-a','contact-recorded','',{actor:'ai'}));});
test('explicit team review leaves independence separate',()=>{const s=p.changeReview(saved(),'expert-a','qualification','reviewed-by-team',{actor:'user'});assert.equal(s.candidates[0].qualification,'reviewed-by-team');assert.equal(s.candidates[0].independence,'not-reviewed');assert.equal(s.candidates[0].decisions[0].actor,'user');});
test('material scope changes mark saved decisions for review',()=>{const s=p.setBrief(saved(),{...brief,version:2,requirements:[...brief.requirements,{id:'primary',label:'Primary care',kind:'setting',importance:'essential'}]},'corpus-v1');assert.equal(s.candidates[0].needsReview,true);assert.equal(s.candidates[0].brief.version,1);});
test('evidence corrections mark snapshots for review',()=>assert.equal(p.setBrief(saved(),brief,'corpus-v2').candidates[0].needsReview,true));
test('identical scope new version preserves review status',()=>assert.equal(p.setBrief(saved(),{...brief,version:2},'corpus-v1').candidates[0].needsReview,false));
test('saving from older history never rewinds the active project brief',()=>{const newer={...brief,version:2,manufacturer:'Example'};let s=p.setBrief(saved(),newer,'corpus-v2');s=p.saveCandidate(s,candidate,brief,'corpus-v1');assert.deepEqual(s.activeBrief,newer);assert.equal(s.corpusVersion,'corpus-v2');assert.equal(s.candidates[0].needsReview,true);assert.equal(s.candidates[0].brief.version,1);});
test('contact filter only includes events in current project',()=>{const s=p.recordEvent(saved(),'expert-a','contact-recorded','Email recorded manually',{actor:'user'});assert.deepEqual(p.contactedIds(s),['expert-a']);assert.deepEqual(p.contactedIds(p.createProject()),[]);});
test('JSON export/import preserves project evidence and notes with new project ID',()=>{const s=saved();s.notes='Team note';s.candidates[0].notes='Discuss scope';const restored=p.importJSON(p.exportJSON(s));assert.notEqual(restored.id,s.id);assert.deepEqual(restored.candidates,s.candidates);assert.equal(restored.notes,'Team note');});
test('wrong-candidate imported evidence is rejected',()=>{const s=saved();s.candidates[0].candidate.evidence[0].candidateId='other';assert.throws(()=>p.exportJSON(s),/attribution/);});
test('prototype and invalid recruitment states cannot be imported',()=>{const s=saved();s.events.push({actor:'ai',candidateId:'expert-a',type:'contact-recorded'});assert.throws(()=>p.exportJSON(s));assert.throws(()=>p.importJSON('{"format":"docmap-expert-project","schema":1,"project":{"__proto__":{}}}'));});
test('HTML pack escapes notes and malicious source text',()=>{const s=saved();s.notes='<script>alert(1)</script>';s.candidates[0].candidate.evidence[0].sourceUrl='javascript:alert(1)';const html=p.exportHTML(s);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('javascript:'));assert.ok(html.includes('Source date: Not recorded'));assert.ok(html.includes('e1'));assert.ok(html.includes('Confirmation')||html.includes('Confirm current'));});
test('HTML pack retains all source-review limitations alongside each evidence passage',()=>{const s=saved(),e=s.candidates[0].candidate.evidence[0];e.review={limitations:['The profile is undated; current practice still requires confirmation.','Its combined CT/MRI activity must not be treated as a CT-only reporting count.','Do not treat <approval> & current activity as verified.']};const html=p.exportHTML(s);assert.ok(html.includes('Source-review limitations'));assert.ok(html.includes(e.review.limitations[0]));assert.ok(html.includes(e.review.limitations[1]));assert.ok(html.includes('Do not treat &lt;approval&gt; &amp; current activity as verified.'));assert.ok(!html.includes('<approval>'));assert.ok(html.indexOf('Source-review limitations')>html.indexOf('Reports cardiac CT.'));assert.deepEqual(p.importJSON(p.exportJSON(s)).candidates[0].candidate.evidence[0].review,e.review);});
test('import recomputes stale review decisions even when a backup clears its warning flag',()=>{let s=p.changeReview(saved(),'expert-a','qualification','reviewed-by-team',{actor:'user'});const newer={...brief,version:2,manufacturer:'Different engagement'};s=p.setBrief(s,newer,'corpus-v1');s=p.saveCandidate(s,candidate,newer,'corpus-v1');s.candidates[0].needsReview=false;const restored=p.importJSON(JSON.stringify({format:'docmap-expert-project',schema:1,project:s}));assert.equal(restored.candidates[0].needsReview,true);assert.equal(restored.candidates[0].qualification,'reviewed-by-team');assert.deepEqual(restored.candidates[0].decisions,s.candidates[0].decisions);assert.equal(s.candidates[0].needsReview,false,'Validation does not mutate its input');assert.match(p.exportHTML(restored),/NEEDS REVIEW after scope\/evidence change/);});
test('import recomputes stale source versions without erasing a current explicit warning',()=>{const s=saved();s.corpusVersion='corpus-v2';s.candidates[0].needsReview=false;const restored=p.importJSON(JSON.stringify({format:'docmap-expert-project',schema:1,project:s}));assert.equal(restored.candidates[0].needsReview,true);const current=saved();current.candidates[0].needsReview=true;assert.equal(p.validateProject(current).candidates[0].needsReview,true);});
test('current review provenance remains current after validation and import',()=>{let s=p.changeReview(saved(),'expert-a','qualification','reviewed-by-team',{actor:'user'});s=p.changeReview(s,'expert-a','independence','team-reviewed',{actor:'user'});const restored=p.importJSON(p.exportJSON(s));assert.equal(restored.candidates[0].needsReview,false);assert.deepEqual(restored.candidates[0].decisions,s.candidates[0].decisions);});

test('adding exclusion polarity or a restricted role set marks prior decisions stale without rewriting history',()=>{
  const role={id:'role',label:'Clinical psychologist',text:'Clinical psychologist',kind:'role',importance:'essential'},initial={...brief,requirements:[...brief.requirements,role],roles:['Clinical psychologist']};
  let project=p.saveCandidate(p.createProject('Role constraints'),candidate,initial,'corpus-v1');project=p.changeReview(project,candidate.id,'qualification','reviewed-by-team',{actor:'user'});const oldDecisions=structuredClone(project.candidates[0].decisions);
  for(const changed of [{...initial,requirements:[...brief.requirements,{...role,polarity:'exclude'}]}, {...initial,excludedRoles:['Psychiatrist']}, {...initial,roleMode:'only'}, {...initial,requirements:[...brief.requirements,{...role,strictRole:true}]}]){
    const updated=p.setBrief(project,changed,'corpus-v1');assert.equal(updated.candidates[0].needsReview,true);assert.equal(updated.candidates[0].qualification,'reviewed-by-team');assert.deepEqual(updated.candidates[0].decisions,oldDecisions);assert.equal(updated.briefVersions.length,2);
  }
  const explicitInclude={...initial,requirements:initial.requirements.map(r=>({...r,polarity:'include',strictRole:false})),excludedRoles:[]};assert.equal(p.scope(explicitInclude),p.scope(initial));assert.equal(p.setBrief(project,explicitInclude,'corpus-v1').candidates[0].needsReview,false);
});

test('legacy scope serialization stays stable for unchanged positive requirements',()=>{
  const expected=JSON.stringify({requirements:[{id:'ct',label:'Cardiac CT',text:'Cardiac CT',kind:'modality',importance:'essential'}],manufacturer:null,panelSize:null,roles:[],geography:null,timing:null});assert.equal(p.scope(brief),expected);
});

test('negative role constraints export as filters rather than credentials and optional Home drafts round trip',()=>{
  const role={id:'role',label:'Psychiatrist',text:'Psychiatrist',kind:'role',importance:'essential',polarity:'exclude'},allowed={id:'allowed',label:'Clinical psychologist',text:'Clinical psychologist',kind:'role',importance:'essential',strictRole:true};
  const assessment={...brief,requirements:[role,allowed],roleMode:'only',excludedRoles:['Psychiatrist'],roles:['Clinical psychologist']},person={...candidate,requirementMatrix:[{requirementId:'role',label:'Psychiatrist',status:'unknown',importance:'essential',evidenceIds:[],note:'Irrelevant credential note.'}]};
  const project=p.saveCandidate(p.createProject('Roles'),person,assessment,'corpus-v1');project.draft='Existing refinement';project.newAssessmentDraft='Separate unsent brief';const html=p.exportHTML(project);
  assert.match(html,/Exclude: Psychiatrist/);assert.match(html,/Allowed role: Clinical psychologist/);assert.match(html,/Permitted roles only: Clinical psychologist/);assert.match(html,/Role exclusion filter/);assert.match(html,/Incomplete role data does not prove absence/);assert.doesNotMatch(html,/Irrelevant credential note/);
  const restored=p.importJSON(p.exportJSON(project));assert.equal(restored.newAssessmentDraft,project.newAssessmentDraft);assert.equal(restored.draft,project.draft);assert.equal(p.scope(restored.activeBrief),p.scope(assessment));
});

test('review packs use source-owned requirement spans and label historical reviewed context',()=>{
  const person=structuredClone(candidate),row=person.requirementMatrix[0];row.supportingEvidence=[{evidenceId:'e1',kind:'reviewed-summary',text:'Reviewed study context in primary care.',sourceQuote:'Author name only',sourceDate:'2010-05-11',limits:['Coauthorship is not proof of study appraisal.']}];
  person.evidence[0].text='Reviewed study context in primary care.';person.evidence[0].reviewedParaphrase=true;person.evidence[0].sourceQuote='Author name only';
  const project=p.saveCandidate(p.createProject('Source spans'),person,brief,'corpus-v1'),html=p.exportHTML(project),matrix=html.slice(html.indexOf('<table>'),html.indexOf('</table>'));
  assert.match(matrix,/Reviewed source summary/);assert.match(matrix,/Reviewed study context in primary care/);assert.match(matrix,/2010-05-11/);assert.match(matrix,/Coauthorship is not proof/);assert.doesNotMatch(matrix,/Author name only|<blockquote>/);
  row.supportingEvidence.push({evidenceId:'another-person',kind:'source-quote',text:'Do not render this unmatched evidence.'});const unsafe=p.saveCandidate(p.createProject('Owned only'),person,brief,'corpus-v1');assert.doesNotMatch(p.exportHTML(unsafe),/Do not render this unmatched evidence/);
});

test('negative source statements do not invert an exclusion into a recorded positive role',()=>{
  const assessment={...brief,requirements:[{id:'excluded',label:'Dermatologist',kind:'role',importance:'essential',polarity:'exclude'}]};
  for(const [status,expected]of [['documented','The excluded role is recorded'],['mismatch','negative role statement needs scope and date review'],['needs-review','negative role statement needs scope and date review'],['unknown','Incomplete role data does not prove absence']]){
    const person={...candidate,evidence:[{...candidate.evidence[0],text:status==='documented'?'I am a dermatologist.':'I am not a dermatologist.',type:'professional-background'}],requirementMatrix:[{requirementId:'excluded',label:'Dermatologist',status,importance:'essential',evidenceIds:status==='unknown'?[]:['e1']}]},html=p.exportHTML(p.saveCandidate(p.createProject(),person,assessment,'corpus-v1'));assert.ok(html.includes(expected));assert.doesNotMatch(html,/recorded role conflicts with this exclusion/);
  }
});

test('source appendix labels attribution-only literal excerpts neutrally',()=>{
  const project=saved(),e=project.candidates[0].candidate.evidence[0];e.reviewedParaphrase=true;e.text='A reviewed account of the study setting.';e.sourceQuote='A. Example';e.review={limitations:['The author excerpt establishes attribution, not clinical activity.']};const html=p.exportHTML(project);assert.match(html,/Exact source excerpt/);assert.doesNotMatch(html,/Exact supporting passage/);assert.match(html,/<blockquote>A\. Example<\/blockquote>/);assert.match(html,/establishes attribution, not clinical activity/);
});

test('failed request recovery and separate drafts round trip without altering evidence or decisions',()=>{
  const project=saved();project.originalBrief='Original device assessment';project.discoveryFilters={documentedOnly:true,uncontactedOnly:false};project.draft='Newer draft';project.failedSearch={id:'failure-1',status:'failed',submittedAt:'2026-10-07T10:00:00Z',payload:{message:'Previous refinement'},baseBrief:brief,filters:{documentedOnly:true,uncontactedOnly:false},restoredDraft:false,error:'Offline'};const restored=p.importJSON(p.exportJSON(project));assert.deepEqual(restored.failedSearch,project.failedSearch);assert.deepEqual(restored.candidates,project.candidates);assert.equal(restored.draft,'Newer draft');assert.equal(restored.originalBrief,project.originalBrief);
});

test('malformed failed request operations cannot enter recovery through imported project data',()=>{
  const project=saved(),valid={id:'failure',status:'failed',submittedAt:'2026-10-07',payload:{message:'A valid request'},baseBrief:brief,filters:{documentedOnly:false,uncontactedOnly:false}};
  for(const change of [{payload:{sessionId:'secret'}},{payload:{message:'One',removeRequirementId:'two'}},{filters:{documentedOnly:'yes'}},{payload:{patch:{requirementId:'ct',importance:'invented'}}},{payload:null},{baseBrief:{requirements:'not an array'}}])assert.throws(()=>p.validateProject({...project,failedSearch:{...valid,...change}}),/saved failed/);
});

test('review pack citations target exact owned evidence on the supplied origin and include all safe sources',()=>{
  const project=saved();project.candidates[0].candidate.evidence[0].sources=[{sourceUrl:'https://second.example/record',sourceLabel:'Additional source'},{sourceUrl:'javascript:alert(1)',sourceLabel:'Unsafe'}];const html=p.exportHTML(project,{baseUrl:'https://preview.example'});assert.match(html,/https:\/\/preview\.example\/api\/expert\/sources\/expert-a\?evidence=e1#evidence-e1/);assert.match(html,/https:\/\/second\.example\/record/);assert.doesNotMatch(html,/javascript:/);assert.match(p.exportHTML(project),/https:\/\/docmap-expert-discovery-production\.up\.railway\.app\/api\/expert\/sources/);
});

test('review pack distinguishes listed interests, activities and complete essential/preferred gaps',()=>{
  const person=structuredClone(candidate);person.evidence[0].type='clinical-interest';person.evidence[0].text='An interest in cardiac CT.';const scope={...brief,requirements:[...brief.requirements,{id:'current',label:'Current practice',kind:'currentPractice',importance:'essential'},{id:'setting',label:'Primary care',kind:'setting',importance:'essential'},{id:'research',label:'Diagnostic studies',kind:'research',importance:'preferred'}]};const html=p.exportHTML(p.saveCandidate(p.createProject(),person,scope,'corpus-v1'));assert.match(html,/Listed interest/);assert.match(html,/does not establish performed clinical work/);assert.match(html,/Must-have evidence not established/);assert.match(html,/Current practice/);assert.match(html,/Primary care/);assert.match(html,/Nice-to-have evidence not established/);assert.match(html,/Diagnostic studies/);assert.doesNotMatch(html,/<td>Supported<\/td>/);
});

test('search intent survives backup and makes a material change stale without rewriting older decisions',()=>{
  const scope={...brief,requirements:[{...brief.requirements[0],importance:'focus',matchIntent:'interest'}]},project=p.changeReview(p.saveCandidate(p.createProject(),candidate,scope,'corpus-v1'),candidate.id,'qualification','reviewed-by-team',{actor:'user'}),decision=structuredClone(project.candidates[0].decisions);
  const changed={...scope,version:2,requirements:[{...scope.requirements[0],matchIntent:'activity'}]},next=p.setBrief(project,changed,'corpus-v1');
  assert.equal(next.candidates[0].needsReview,true);assert.deepEqual(next.candidates[0].decisions,decision);assert.equal(next.candidates[0].brief.requirements[0].matchIntent,'interest');assert.equal(p.importJSON(p.exportJSON(project)).activeBrief.requirements[0].matchIntent,'interest');
  assert.equal(p.scope({...brief,requirements:brief.requirements.map(r=>({...r,matchIntent:'topic'}))}),p.scope(brief),'Adding the default topic marker must not invalidate legacy decisions');
});

test('focus-only review pack shows relevance first and does not invent must-have gaps',()=>{
  const scope={...brief,requirements:[{...brief.requirements[0],importance:'focus',matchIntent:'interest'},{id:'setting',label:'Primary care',kind:'setting',text:'Primary care',importance:'focus'}]},person=structuredClone(candidate);person.evidence[0].type='clinical-interest';person.evidence[0].text='An interest in cardiac CT.';
  const html=p.exportHTML(p.saveCandidate(p.createProject(),person,scope,'corpus-v1'));
  assert.ok(html.indexOf('Relevance to your search')<html.indexOf('Saved rationale and search evidence'));assert.match(html,/Search focus/);assert.match(html,/Not found for this search focus/);assert.doesNotMatch(html,/Must-have evidence not established|Essential to confirm|Preferred evidence gaps/);assert.match(html,/These checks are separate from discovery and are not additional search requirements/);
});

test('related research export preserves exact source attribution and dates without creating a requirement',()=>{
  const person=structuredClone(candidate),scope={...brief,requirements:brief.requirements.map(r=>({...r,importance:'focus'}))},research={id:'research',candidateId:person.id,sourceRecordId:'study-record',field:'reviewed-study',type:'research',text:'Coauthored a 2010 cardiac imaging protocol.',reviewedParaphrase:true,sourceQuote:'A. Author',sourceUrl:'https://publisher.example/protocol',dates:{sourceDate:'2010-05-11'},review:{limitations:['Historical coauthorship only.']}};person.evidence.push(research);person.relatedEvidence=[{evidenceId:research.id,text:research.text,kind:'reviewed-summary',evidenceType:'research',sourceDate:'2010-05-11',limits:research.review.limitations,relatedToRequirementIds:['ct']}];
  const project=p.saveCandidate(p.createProject(),person,scope,'corpus-v1'),html=p.exportHTML(project,{baseUrl:'https://preview.example'}),intro=html.slice(html.indexOf('Relevance to your search'),html.indexOf('Saved rationale and search evidence'));
  assert.match(intro,/Related research/);assert.match(intro,/Reviewed source summary/);assert.match(intro,/2010-05-11/);assert.match(intro,/api\/expert\/sources\/expert-a\?evidence=research#evidence-research/);assert.match(intro,/publisher\.example\/protocol/);assert.equal(project.activeBrief.requirements.length,1);assert.deepEqual(p.importJSON(p.exportJSON(project)).candidates[0].candidate.relatedEvidence,person.relatedEvidence);
});

test('a failed focus-priority edit can be restored without altering saved evidence',()=>{
  const project=saved();project.failedSearch={id:'focus-edit',status:'failed',submittedAt:'2026-10-07',payload:{patch:{requirementId:'ct',importance:'focus'}},baseBrief:brief,filters:{documentedOnly:false,uncontactedOnly:false}};const restored=p.importJSON(p.exportJSON(project));assert.equal(restored.failedSearch.payload.patch.importance,'focus');assert.deepEqual(restored.candidates,project.candidates);
});

test('review pack disclosures are readable on first print without running scripts',()=>{
  const html=p.exportHTML(saved());assert.match(html,/<details open><summary>Saved rationale and search evidence/);assert.match(html,/<details open><summary>Optional engagement preparation/);assert.doesNotMatch(html,/<details>|<script/);
});

test('imported dangling matrix references export as unavailable evidence without rewriting saved review history',()=>{
  let project=p.changeReview(saved(),candidate.id,'qualification','reviewed-by-team',{actor:'user'});project.candidates[0].candidate.requirementMatrix[0].evidenceIds=['no-longer-in-this-backup'];const restored=p.importJSON(p.exportJSON(project)),before=structuredClone(restored),html=p.exportHTML(restored);
  assert.match(html,/Not found in sources/);assert.match(html,/Supporting text is unavailable/);assert.match(html,/Must-have evidence not established/);assert.doesNotMatch(html,/<td>Recorded activity<\/td>/);assert.deepEqual(restored,before);assert.equal(restored.candidates[0].qualification,'reviewed-by-team');assert.equal(restored.candidates[0].candidate.requirementMatrix[0].status,'documented');
});
