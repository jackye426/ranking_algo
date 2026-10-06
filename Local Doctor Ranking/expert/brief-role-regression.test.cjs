'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseBrief,createBriefInterpreter}=require('./brief.cjs');
const anchor='We are assessing dermoscopy software for skin lesions. ';
const mockInterpreter=requirements=>createBriefInterpreter({client:{chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({requirements})}}]})}}}});
const role=text=>({kind:'role',text,evidence:text,importance:'preferred',operation:'add'});

for(const phrase of ['Diagnostic study evaluation','Diagnostic studies evaluation','Diagnostic study appraisal','Diagnostic studies appraisal','Diagnostic study review','Diagnostic studies review','Reviewing diagnostic studies','Appraising a diagnostic study'])test(`research activity wording: ${phrase}`,()=>{
  const parsed=parseBrief({message:anchor+phrase+' experience is preferred.'});
  const requirements=parsed.brief.requirements.filter(r=>r.label==='Diagnostic study evaluation');
  assert.equal(requirements.length,1);assert.equal(requirements[0].kind,'research');assert.equal(requirements[0].importance,'preferred');assert.ok(!parsed.brief.roles.includes(phrase));
});

test('the skin walkthrough keeps diagnostic-study expertise preferred through a mislabelled model patch',async()=>{
  const text='Diagnostic study evaluation experience',interpret=mockInterpreter([role(text)]);
  const result=await interpret({message:anchor+text+' is preferred. Regulatory experience is optional.'});
  const research=result.brief.requirements.filter(r=>r.label==='Diagnostic study evaluation');
  assert.equal(research.length,1);assert.equal(research[0].kind,'research');assert.equal(research[0].importance,'preferred');assert.equal(result.brief.roles.length,0);
  assert.equal(result.brief.requirements.find(r=>r.kind==='regulatory').importance,'preferred');
});

for(const text of ['Diagnostic study appraisal expertise','Experience in diagnostic study review','Clinical research experience','Expert in diagnostic study evaluation'])test(`model cannot turn an activity into a role: ${text}`,async()=>{
  const result=await mockInterpreter([role(text)])({message:anchor+text+' is preferred.'});
  assert.equal(result.brief.roles.length,0);assert.ok(result.brief.requirements.some(r=>r.kind==='research'));
});

for(const text of ['Clinical scientist','Diagnostic radiographer','Medical physicist','Research nurse','Clinical research nurse','Biomedical scientist','Clinical researcher','Clinical scientist with diagnostic study evaluation experience'])test(`quoted professional role remains supported: ${text}`,async()=>{
  const result=await mockInterpreter([role(text)])({message:anchor+text+' is preferred.'});
  assert.ok(result.brief.requirements.some(r=>r.kind==='role'&&r.label.toLowerCase()===text.toLowerCase()));
});

test('a follow-up updates research importance and removes it without creating a role',async()=>{
  const initial=parseBrief({message:anchor+'Diagnostic study evaluation experience is preferred.'}).brief;
  const changed=parseBrief({previous:initial,message:'Diagnostic study appraisal experience is essential.'}).brief;
  const old=initial.requirements.find(r=>r.kind==='research'),current=changed.requirements.find(r=>r.kind==='research');assert.equal(current.id,old.id);assert.equal(current.importance,'essential');
  const removed=await mockInterpreter([{...role('Diagnostic study review experience'),operation:'remove'}])({previous:changed,message:'Remove Diagnostic study review experience but keep dermoscopy.'});
  assert.ok(!removed.brief.requirements.some(r=>r.kind==='research'));assert.ok(removed.brief.requirements.some(r=>r.label==='Skin-lesion imaging'));assert.equal(removed.brief.roles.length,0);
});

test('hosted-style model patches cannot promote assessment questions or preferred research into extra essential credentials',async()=>{
  const message='We are assessing skin-lesion imaging software using dermoscopy in primary care. Find UK clinical expertise to help us examine the evidence behind diagnostic accuracy and how results could affect referrals. Experience evaluating diagnostic studies is preferred. Regulatory experience is optional.';
  const patches=[
    {...role('clinical expertise'),evidence:'Find UK clinical expertise',importance:'essential'},
    {kind:'research',text:'examine the evidence behind diagnostic accuracy',evidence:'help us examine the evidence behind diagnostic accuracy',importance:'essential',operation:'add'},
    {kind:'research',text:'how results could affect referrals',evidence:'how results could affect referrals',importance:'essential',operation:'add'},
  ];
  const result=await mockInterpreter(patches)({message});
  assert.equal(result.brief.roles.length,0);
  const research=result.brief.requirements.filter(r=>r.kind==='research');assert.equal(research.length,1);assert.equal(research[0].label,'Diagnostic study evaluation');assert.equal(research[0].importance,'preferred');
  assert.ok(result.brief.requirements.some(r=>r.kind==='question'&&r.text.includes('how results could affect referrals')));
});

test('a research activity paraphrase cannot override a directly preferred canonical criterion',async()=>{
  const message=anchor+'We need to help examine diagnostic accuracy. Diagnostic study appraisal experience is preferred.';
  const result=await mockInterpreter([{kind:'research',text:'examine diagnostic accuracy',evidence:'help examine diagnostic accuracy',importance:'essential',operation:'add'}])({message});
  const research=result.brief.requirements.filter(r=>r.kind==='research');assert.equal(research.length,1);assert.equal(research[0].importance,'preferred');
});

for(const generic of ['clinical expertise','medical experts','healthcare professionals','specialist expertise'])test(`generic model role is not a professional requirement: ${generic}`,async()=>{
  const result=await mockInterpreter([{...role(generic),importance:'essential'}])({message:anchor+'Find '+generic+'.'});assert.equal(result.brief.roles.length,0);
});

test('generic clinicians do not add a credential while geography and current-practice requirements remain explicit',async()=>{
  const result=await mockInterpreter([role('UK clinicians')])({message:anchor+'Find UK clinicians. Current clinical practice is essential.'});
  assert.equal(result.brief.roles.length,0);assert.equal(result.brief.requirements.filter(r=>r.kind==='geography').length,1);assert.ok(result.brief.requirements.some(r=>r.kind==='currentPractice'&&r.importance==='essential'));
});

test('explicit unfamiliar research experience and non-doctor roles still pass the quote boundary',async()=>{
  const text='mixed-methods implementation research',profession='Clinical research nurse';
  const result=await mockInterpreter([{kind:'research',text,evidence:'Experience in '+text,importance:'preferred',operation:'add'},role(profession)])({message:anchor+'Experience in '+text+' is preferred. '+profession+' is preferred.'});
  assert.ok(result.brief.requirements.some(r=>r.kind==='research'&&r.text===text&&r.importance==='preferred'));assert.ok(result.brief.roles.includes(profession));
});
