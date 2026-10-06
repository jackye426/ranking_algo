'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseBrief,createBriefInterpreter}=require('./brief.cjs');
const prior=()=>parseBrief({message:'Skin-lesion imaging software using dermoscopy in primary care. Diagnostic study evaluation is preferred. Current practice is essential. Dermatologists are preferred.'}).brief;
const followup='Only general practitioners for the clinical perspective; hospital dermatologists should not be included. Keep dermoscopy and primary care essential, and diagnostic research preferred.';
const req=(brief,label)=>brief.requirements.find(r=>r.label===label);
const mocked=requirements=>createBriefInterpreter({client:{chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({requirements})}}]})}}}});
const patch=(kind,text,importance='essential',operation='add',evidence=text)=>({kind,text,evidence,importance,operation});
function expectSkin(brief){
  assert.deepEqual(brief.roles,['General practitioner']);assert.deepEqual(brief.excludedRoles,['Dermatologist']);assert.equal(brief.roleMode,'only');
  assert.equal(req(brief,'General practitioner').strictRole,true);assert.equal(req(brief,'Dermatologist').polarity,'exclude');
  for(const label of ['Skin-lesion imaging','Primary care'])assert.equal(req(brief,label).importance,'essential');
  assert.equal(req(brief,'Diagnostic research').importance,'preferred');assert.equal(req(brief,'Diagnostic study evaluation').importance,'preferred');assert.equal(req(brief,'Clinical research'),undefined);
}
test('patient-independent assessment refinement preserves explicit role exclusions and preferred research',()=>{
  const previous=prior(),unchanged=structuredClone(previous),next=parseBrief({previous,message:followup});expectSkin(next.brief);assert.deepEqual(previous,unchanged);assert.equal(next.brief.version,previous.version+1);
});
test('unavailable model preserves the exact same constraints',async()=>{
  const interpret=createBriefInterpreter({client:{chat:{completions:{create:async()=>{throw Error('offline');}}}}});const result=await interpret({previous:prior(),message:followup});expectSkin(result.brief);assert.equal(result.notices.length,1);
});
test('incorrect model additions, removals and importance cannot undo explicit canonical constraints',async()=>{
  const result=await mocked([patch('role','general practitioners','preferred','remove'),patch('role','hospital dermatologists'),patch('research','diagnostic research'),patch('role','clinical perspective')])({previous:prior(),message:followup});expectSkin(result.brief);assert.equal(result.brief.requirements.filter(r=>r.kind==='role').length,2);assert.equal(result.mode,'deepseek');
});
for(const name of ['general practitioners','GPs','family doctors','family physicians'])test('explicit only role synonym: '+name,()=>{
  const brief=parseBrief({previous:prior(),message:`Only ${name}. Keep dermoscopy essential.`}).brief;assert.deepEqual(brief.roles,['General practitioner']);assert.equal(brief.roleMode,'only');assert.equal(req(brief,'General practitioner').strictRole,true);assert.equal(req(brief,'Dermatologist'),undefined);
});
for(const phrase of ['Exclude dermatologists','Do not include hospital dermatologists','Do not consider dermatologists','No dermatologists','Not dermatologists','Dermatologists should not be included','Dermatologists must not be selected','Remove dermatologists from the shortlist'])test('explicit exclusion is not a positive role: '+phrase,()=>{
  const brief=parseBrief({previous:prior(),message:phrase+'. Keep dermoscopy.'}).brief;assert.equal(req(brief,'Dermatologist').polarity,'exclude');assert.ok(!brief.roles.includes('Dermatologist'));assert.deepEqual(brief.excludedRoles,['Dermatologist']);
});
for(const phrase of ['Remove the dermatologist requirement','We do not need dermatologists','Dermatologists are not required'])test('removing a role criterion is distinct from excluding people: '+phrase,()=>{
  const brief=parseBrief({previous:prior(),message:phrase+'. Keep dermoscopy.'}).brief;assert.equal(req(brief,'Dermatologist'),undefined);assert.deepEqual(brief.excludedRoles,[]);
});
for(const phrase of ['Include dermatologists again','Do not exclude dermatologists'])test('explicit inclusion reverses the old exclusion: '+phrase,()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief,brief=parseBrief({previous,message:phrase}).brief;assert.equal(req(brief,'Dermatologist').polarity,'include');assert.equal(req(brief,'Dermatologist').strictRole,true);assert.ok(!brief.excludedRoles.includes('Dermatologist'));
});
for(const marker of ['instead of','rather than'])test('replacement restricts the new role and excludes the old role: '+marker,()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief,brief=parseBrief({previous,message:`Include dermatologists ${marker} general practitioners. Keep dermoscopy and primary care essential, diagnostic research preferred.`}).brief;
  assert.deepEqual(brief.roles,['Dermatologist']);assert.deepEqual(brief.excludedRoles,['General practitioner']);assert.equal(req(brief,'Dermatologist').strictRole,true);assert.equal(req(brief,'Diagnostic research').importance,'preferred');
});
test('a later independent inclusion is not captured by an earlier instead-of clause',()=>{
  const brief=parseBrief({previous:prior(),message:'Include dermatologists instead of general practitioners, and include radiologists.'}).brief;assert.ok(brief.roles.includes('Radiologist'));assert.ok(!brief.excludedRoles.includes('Radiologist'));assert.deepEqual(brief.excludedRoles,['General practitioner']);
});
test('coordinated only roles form a restricted set rather than dropping the first role',()=>{
  const brief=parseBrief({previous:prior(),message:'Only GPs and radiologists; exclude dermatologists.'}).brief;assert.deepEqual(new Set(brief.roles),new Set(['General practitioner','Radiologist']));assert.ok(brief.requirements.filter(r=>r.kind==='role'&&r.polarity==='include').every(r=>r.strictRole));
});
test('ordinary and preferred roles do not become strict eligibility constraints',()=>{
  const brief=parseBrief({previous:prior(),message:'General practitioners are preferred.'}).brief;assert.equal(brief.roleMode,null);assert.equal(req(brief,'General practitioner').importance,'preferred');assert.equal(req(brief,'General practitioner').strictRole,false);
});
test('changing an old only-role requirement to preferred releases the restriction',()=>{
  const previous=parseBrief({previous:prior(),message:'Only GPs.'}).brief;
  const natural=parseBrief({previous,message:'General practitioners are preferred.'}).brief;assert.equal(natural.roleMode,null);assert.equal(req(natural,'General practitioner').strictRole,false);
  const manual=parseBrief({previous,patch:{requirementId:req(previous,'General practitioner').id,importance:'preferred'}}).brief;assert.equal(manual.roleMode,null);assert.equal(req(manual,'General practitioner').strictRole,false);
});
for(const directive of ['Remove the role restriction.','Clear the role filters.','Drop the only-role restriction.'])test('clearing role eligibility removes both the allowed set and exclusions: '+directive,()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief,brief=parseBrief({previous,message:directive+' Keep dermoscopy essential.'}).brief;assert.equal(brief.roleMode,null);assert.ok(!brief.requirements.some(r=>r.kind==='role'));assert.deepEqual(brief.roles,[]);assert.deepEqual(brief.excludedRoles,[]);assert.ok(req(brief,'Skin-lesion imaging'));
});
test('a negated clearing instruction preserves the current allowed and excluded roles',()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief,brief=parseBrief({previous,message:'Do not clear the role filters. Keep dermoscopy essential.'}).brief;expectSkin(brief);
});
test('removing an exclusion chip removes only that constraint',()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief,brief=parseBrief({previous,removeRequirementId:req(previous,'Dermatologist').id}).brief;assert.deepEqual(brief.excludedRoles,[]);assert.deepEqual(brief.roles,['General practitioner']);assert.equal(brief.roleMode,'only');
});
for(const permission of ['Any role is fine.','All professional roles are fine.','We can consider any role.'])test('broad role permission removes old inclusion and exclusion eligibility: '+permission,()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief,unchanged=structuredClone(previous);
  const brief=parseBrief({previous,message:permission+' Keep dermoscopy and primary care essential.'}).brief;
  assert.equal(brief.roleMode,null);assert.deepEqual(brief.roles,[]);assert.deepEqual(brief.excludedRoles,[]);assert.ok(!brief.requirements.some(r=>r.kind==='role'));
  for(const label of ['Skin-lesion imaging','Primary care'])assert.equal(req(brief,label).importance,'essential');
  assert.equal(req(brief,'Diagnostic research').importance,'preferred');assert.deepEqual(previous,unchanged);
});
test('broad permission can introduce a fresh explicit exception and a nonmandatory preference',()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief;
  const brief=parseBrief({previous,message:'Any role is fine except radiologists. Dermatologists are preferred. Keep dermoscopy.'}).brief;
  assert.equal(brief.roleMode,null);assert.deepEqual(brief.excludedRoles,['Radiologist']);assert.deepEqual(brief.roles,['Dermatologist']);assert.equal(req(brief,'Dermatologist').importance,'preferred');assert.equal(req(brief,'Dermatologist').strictRole,false);assert.equal(req(brief,'General practitioner'),undefined);
});
test('negated broad permission does not silently release the restricted role set',()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief;
  const brief=parseBrief({previous,message:'We cannot accept any role. Keep dermoscopy and primary care essential.'}).brief;
  expectSkin(brief);
});
for(const permission of ['Any role','Any role is fine','All professional roles','Clear the role filters'])test('model cannot turn broad permission into a mandatory occupation: '+permission,async()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief;
  const result=await mocked([patch('role',permission),patch('role','Dermatologist')])({previous,message:permission+'. Keep dermoscopy and primary care essential.'});
  assert.equal(result.mode,'deepseek');assert.equal(result.brief.roleMode,null);assert.deepEqual(result.brief.roles,[]);assert.deepEqual(result.brief.excludedRoles,[]);assert.ok(!result.brief.requirements.some(r=>r.kind==='role'));
});
test('broad permission clears old role words from retained retrieval context',()=>{
  const previous=parseBrief({previous:prior(),message:followup}).brief;
  previous.requirements.push({id:'context-role',kind:'technology',label:'Workflow context',text:'Dermoscopy reviewed by General practitioner or Dermatologist',evidence:'Dermoscopy reviewed by General practitioner or Dermatologist',importance:'essential'});
  const brief=parseBrief({previous,message:'Any role is fine. Keep dermoscopy.'}).brief;
  assert.doesNotMatch(brief.requirements.find(r=>r.id==='context-role').text,/general practitioner|dermatologist/i);assert.match(brief.requirements.find(r=>r.id==='context-role').text,/dermoscopy/i);
});
for(const message of ['Research preferred.','Clinical research optional.','Research essential.','Clinical research required.'])test('importance consumed inside a matched concept is retained: '+message,()=>{
  const brief=parseBrief({previous:prior(),message}).brief;assert.equal(req(brief,'Clinical research').importance,/preferred|optional/.test(message)?'preferred':'essential');
});
test('coordinated clinical priorities stay essential alongside a separate research preference',()=>{
  const brief=parseBrief({previous:prior(),message:'Keep dermoscopy and primary care essential, and diagnostic research preferred.'}).brief;assert.equal(req(brief,'Skin-lesion imaging').importance,'essential');assert.equal(req(brief,'Primary care').importance,'essential');assert.equal(req(brief,'Diagnostic research').importance,'preferred');
});
test('model-only quoted roles use local exclusion, only and importance instructions',async()=>{
  let brief=(await mocked([patch('role','Clinical scientist','preferred')])({previous:prior(),message:'Only Clinical scientist. Keep dermoscopy.'})).brief;assert.deepEqual(brief.roles,['Clinical scientist']);assert.equal(brief.roleMode,'only');assert.equal(req(brief,'Clinical scientist').strictRole,true);
  brief=(await mocked([patch('role','Clinical scientist')])({previous:brief,message:'Clinical scientist should not be included.'})).brief;assert.deepEqual(brief.roles,[]);assert.deepEqual(brief.excludedRoles,['Clinical scientist']);
  brief=(await mocked([patch('role','Clinical scientist')])({previous:brief,message:'Clinical scientist is preferred.'})).brief;assert.equal(req(brief,'Clinical scientist').importance,'preferred');assert.equal(req(brief,'Clinical scientist').polarity,'include');
});
test('model-only quoted research importance comes from the local wording',async()=>{
  const result=await mocked([patch('research','mixed-methods implementation research','essential','add','Experience in mixed-methods implementation research')])({previous:prior(),message:'Experience in mixed-methods implementation research is preferred.'});assert.equal(req(result.brief,'mixed-methods implementation research').importance,'preferred');
});
test('an unrelated removal cannot authorise a model to remove another quoted role',async()=>{
  let previous=(await mocked([patch('role','Clinical scientist')])({previous:prior(),message:'Clinical scientist is required.'})).brief;
  const result=await mocked([patch('role','Clinical scientist','essential','remove')])({previous,message:'Clinical scientist remains relevant. Remove primary care.'});assert.ok(req(result.brief,'Clinical scientist'));assert.equal(req(result.brief,'Primary care'),undefined);
});
const assessmentMessage='We are assessing software that analyses cardiac CT scans for coronary artery disease in adults. We need UK clinicians who personally report cardiac CT and can explain how false positives and false negatives could affect patient management. Experience evaluating diagnostic accuracy studies is preferred.';
const discussionText='explain how false positives and false negatives could affect patient management';
for(const kind of ['activity','research','role'])test('an engagement question cannot become a credential through model kind '+kind,async()=>{
  const result=await mocked([patch(kind,discussionText)])({message:assessmentMessage}),brief=result.brief;
  assert.equal(result.mode,'deepseek');assert.equal(req(brief,'Image interpretation').importance,'essential');assert.equal(req(brief,'Diagnostic study evaluation').importance,'preferred');
  assert.equal(brief.requirements.find(r=>r.kind==='question').text,discussionText);assert.ok(!brief.requirements.some(r=>!['question','technology'].includes(r.kind)&&r.text.includes('false positives')));
  const {matrixFor}=require('./search.cjs'),candidate={id:'fixture'},passage={id:'p',candidateId:'fixture',text:'He reports cardiac CT scans for coronary artery disease in adult patients.',field:'about',type:'clinical-practice',attributes:{},qualifiers:[]};
  const matrix=matrixFor(candidate,[passage],brief);assert.equal(matrix.find(m=>m.label==='Assessment question').status,'context');assert.equal(matrix.find(m=>m.label==='Image interpretation').status,'documented');
});
for(const phrase of ['explain why missed findings could change patient management','discuss how incorrect results could affect referral decisions','discuss the clinical implications of false negative results','explain the impact on treatment decisions of incorrect results'])test('nearby discussion phrasing remains context: '+phrase,async()=>{
  const result=await mocked([patch('activity',phrase)])({message:'Find clinicians who personally report cardiac CT and can '+phrase+'.'});
  assert.equal(result.brief.requirements.find(r=>r.kind==='question').text,phrase);assert.equal(req(result.brief,'Image interpretation').importance,'essential');assert.ok(!result.brief.requirements.some(r=>r.kind==='activity'&&r.text===phrase));
});
test('a clinical requirement after the question is not swallowed by discussion context',async()=>{
  const message='Find clinicians who can explain how false results affect treatment and personally report cardiac CT. Diagnostic study evaluation experience is preferred.';
  const brief=(await mocked([patch('activity','personally report cardiac CT')])({message})).brief;
  assert.equal(req(brief,'Image interpretation').importance,'essential');assert.doesNotMatch(brief.requirements.find(r=>r.kind==='question').text,/personally report/);assert.equal(req(brief,'Diagnostic study evaluation').importance,'preferred');
});
test('a research term inside a discussion question does not silently become essential expertise',()=>{
  const brief=parseBrief({message:'Find clinicians who report cardiac CT and can discuss how diagnostic accuracy affects patient management. Diagnostic study evaluation experience is preferred.'}).brief;
  assert.equal(req(brief,'Diagnostic study evaluation').importance,'preferred');assert.equal(brief.requirements.filter(r=>r.kind==='research').length,1);
});
test('explicit prior communication experience is preserved instead of becoming engagement context',async()=>{
  const phrase='experience explaining false negative results to patients',message='Find clinicians who report cardiac CT. Prior '+phrase+' is preferred.';
  const brief=(await mocked([patch('activity',phrase,'preferred')])({message})).brief;
  assert.equal(req(brief,phrase).importance,'preferred');assert.ok(!brief.requirements.some(r=>r.kind==='question'));
});
for(const role of ['clinician','clinicians','UK clinicians','clinical experts','healthcare clinicians'])test('generic search subject does not become an essential occupation: '+role,async()=>{
  const message='Find '+role+' who report cardiac CT for coronary artery disease in adults. Diagnostic study evaluation experience is preferred.';
  const result=await mocked([patch('role',role)])({message});assert.equal(result.mode,'deepseek');assert.ok(!result.brief.requirements.some(r=>r.kind==='role'));assert.equal(req(result.brief,'Image interpretation').importance,'essential');assert.equal(req(result.brief,'Diagnostic study evaluation').importance,'preferred');
});
test('generic clinician guard retains explicit clinical/research panel and specific non-doctor professions',async()=>{
  const panel=parseBrief({message:'Cardiac CT assessment: one practising clinician and one clinical researcher.'}).brief;
  assert.equal(panel.panelSize,2);assert.ok(panel.roles.includes('Practising clinician'));assert.ok(panel.roles.includes('Clinical researcher'));
  const specific=(await mocked([patch('role','Clinical scientist')])({message:'Find a Clinical scientist for cardiac CT assessment.'})).brief;assert.ok(specific.roles.includes('Clinical scientist'));
});
test('a generic search subject followed by a real clinical activity does not create a composite role',async()=>{
  const text='clinicians who personally report cardiac CT',message='Find UK '+text+' for coronary artery disease in adults.';
  const brief=(await mocked([patch('role',text)])({message})).brief;
  assert.equal(brief.roles.length,0);assert.equal(req(brief,'Image interpretation').importance,'essential');assert.equal(brief.geography,'UK');
});
for(const modelText of [discussionText,discussionText.toUpperCase(),discussionText.replace(/ /g,'  ')])test('a normalized duplicate model question keeps the deterministic ID and removes once: '+modelText,async()=>{
  const canonical=parseBrief({message:assessmentMessage}).brief.requirements.find(r=>r.kind==='question');
  const brief=(await mocked([patch('question',modelText,'essential','add',discussionText)])({message:assessmentMessage})).brief;
  const questions=brief.requirements.filter(r=>r.kind==='question');assert.equal(questions.length,1);assert.equal(questions[0].id,canonical.id);assert.equal(questions[0].label,'Assessment question');assert.equal(questions[0].text,canonical.text);
  const removed=parseBrief({previous:brief,removeRequirementId:canonical.id}).brief;assert.ok(!removed.requirements.some(r=>r.kind==='question'));assert.ok(!removed.requirements.some(r=>/false positives/i.test(r.text)));assert.equal(req(removed,'Image interpretation').importance,'essential');
});
test('deduplication retains distinct quoted questions and independent removal',async()=>{
  const second='discuss how missed findings could alter referral decisions',message=assessmentMessage+' We also need to '+second+'.';
  const brief=(await mocked([patch('question',discussionText),patch('question',second)])({message})).brief;
  const questions=brief.requirements.filter(r=>r.kind==='question');assert.equal(questions.length,2);assert.equal(new Set(questions.map(r=>r.id)).size,2);
  const first=questions.find(r=>r.text===discussionText),removed=parseBrief({previous:brief,removeRequirementId:first.id}).brief;
  assert.deepEqual(removed.requirements.filter(r=>r.kind==='question').map(r=>r.text),[second]);
});
test('a same-text custom criterion updates importance without duplicating its ID',async()=>{
  const text='mixed-methods implementation research',interpret=mocked([patch('research',text,'essential','add','Experience in '+text)]);
  const first=(await interpret({message:'Cardiac CT assessment. Experience in '+text+' is essential.'})).brief;
  const second=(await mocked([patch('research',text,'preferred','add','Experience in '+text)])({previous:first,message:'Experience in '+text+' is preferred.'})).brief;
  const matches=second.requirements.filter(r=>r.text===text);assert.equal(matches.length,1);assert.equal(matches[0].id,req(first,text).id);assert.equal(matches[0].importance,'preferred');
});
