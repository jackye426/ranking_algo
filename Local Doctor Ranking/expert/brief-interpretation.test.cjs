'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseBrief,createBriefInterpreter}=require('./brief.cjs');
const req=(brief,label)=>brief.requirements.find(r=>r.label===label);
const cardiac=()=>parseBrief({message:'Cardiac CT software for UK clinicians who report cardiac CT. Diagnostic study evaluation is essential. Current clinical practice is essential.'}).brief;
const skin=()=>parseBrief({message:'Dermoscopy software in primary care. Validation research is essential.'}).brief;
const patch=(kind,text,importance='essential',evidence=text,operation='add')=>({kind,text,importance,evidence,operation});
const mock=requirements=>createBriefInterpreter({client:{chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({requirements})}}]})}}}});

for(const phrase of ['would be helpful','is useful','should be optional','is not mandatory','is nice to have'])test('a supplied research preference does not weaken clinical reporting: '+phrase,()=>{
  const brief=parseBrief({message:'Find UK clinicians who personally report cardiac CT for coronary artery disease in adults. Experience evaluating diagnostic accuracy studies '+phrase+'.'}).brief;
  assert.equal(req(brief,'Image interpretation').importance,'focus');assert.equal(req(brief,'Diagnostic study evaluation').importance,'preferred');assert.equal(brief.requirements.filter(r=>r.kind==='research').length,1);
});

for(const message of ['Research should be optional.','Make research optional.','Research experience would be helpful.','The research requirement is only helpful.','Change the research criterion to preferred.','Research is not mandatory.'])test('a generic research follow-up updates the active canonical criterion: '+message,async()=>{
  const previous=cardiac(),old=req(previous,'Diagnostic study evaluation'),copy=structuredClone(previous);
  const result=await mock([patch('research',message.replace(/\.$/,''))])({previous,message});
  assert.equal(result.needsClarification,false);assert.deepEqual(result.brief.requirements.filter(r=>r.kind==='research').map(r=>[r.id,r.label,r.importance]),[[old.id,old.label,'preferred']]);
  assert.equal(req(result.brief,'Image interpretation').importance,'focus');assert.deepEqual(previous,copy);
});

test('a category-wide research priority preserves distinct specific activities and their IDs',()=>{
  const previous=parseBrief({previous:cardiac(),message:'Validation research is essential.'}).brief,ids=previous.requirements.filter(r=>r.kind==='research').map(r=>r.id);
  const next=parseBrief({previous,message:'Research should be optional.'}).brief;
  assert.deepEqual(next.requirements.filter(r=>r.kind==='research').map(r=>r.id),ids);assert.ok(next.requirements.filter(r=>r.kind==='research').every(r=>r.importance==='preferred'));assert.equal(req(next,'Clinical research'),undefined);
  const specific=parseBrief({previous:next,message:'Validation research is essential.'}).brief;assert.equal(req(specific,'Validation research').importance,'essential');assert.equal(req(specific,'Diagnostic study evaluation').importance,'preferred');
});

test('clinical reporting and helpful validation research remain separate canonical priorities',async()=>{
  const previous=parseBrief({previous:cardiac(),message:'Validation research is essential.'}).brief;
  const message='Clinical reporting is essential; validation research is helpful.';
  const next=(await mock([patch('activity','Clinical reporting'),patch('research','validation research'),patch('research','validation research is helpful')])({previous,message})).brief;
  assert.equal(req(next,'Image interpretation').importance,'essential');assert.equal(req(next,'Validation research').importance,'preferred');assert.equal(next.requirements.filter(r=>r.kind==='activity').length,1);assert.equal(next.requirements.filter(r=>r.label==='Validation research').length,1);
  assert.equal(req(next,'Diagnostic study evaluation').importance,'essential','validation research is not an alias for appraisal experience');
});

test('clinical reporting alone does not invent an imaging modality or image interpretation',()=>{
  const result=parseBrief({message:'Clinical reporting is essential.'});assert.equal(req(result.brief,'Image interpretation'),undefined);assert.equal(result.needsClarification,true);
});

test('a generic priority reference with no active research target is explicitly unresolved',()=>{
  const previous=parseBrief({message:'Cardiac CT.'}).brief,result=parseBrief({previous,message:'Research should be optional.'});assert.equal(result.needsClarification,true);assert.match(result.question,/research/i);assert.deepEqual(result.brief.requirements,previous.requirements);
});

for(const message of ['Remove the UK location requirement.','Drop UK.','Clear the location filter.','We no longer need United Kingdom location.','UK is not required.','The UK requirement is no longer needed.','Anywhere is fine.'])test('geography edits clear both the filter and retained retrieval context: '+message,async()=>{
  const previous=cardiac(),next=(await mock([patch('technology',message.replace(/\.$/,''))])({previous,message})).brief;
  assert.equal(next.geography,null);assert.ok(!next.requirements.some(r=>r.kind==='geography'));assert.ok(next.requirements.some(r=>r.kind==='technology'));assert.ok(!next.requirements.some(r=>/\b(?:UK|United Kingdom|British)\b/i.test(r.text+' '+r.evidence)));assert.ok(req(next,'Cardiac CT'));assert.ok(req(next,'Image interpretation'));
});

test('removing the UK chip also scrubs short aliases but never part of another word',()=>{
  const previous=cardiac();previous.requirements.push({id:'workflow',kind:'workflow',label:'Workflow',text:'British and United Kingdom clinics use UKB research software',evidence:'British and United Kingdom clinics use UKB research software',importance:'essential'});
  const next=parseBrief({previous,removeRequirementId:req(previous,'UK').id}).brief;
  assert.doesNotMatch(next.requirements.find(r=>r.id==='workflow').text,/\b(?:UK|United Kingdom|British)\b/i);assert.match(next.requirements.find(r=>r.id==='workflow').text,/UKB/);
});

for(const message of ['Do not remove the UK location requirement.','Please do not drop UK.','Never clear the location filter.','Do not make research optional.'])test('negated commands do not edit the active criteria: '+message,async()=>{
  const previous=cardiac(),result=await mock([patch('geography','UK','essential','UK','remove'),patch('research','research','preferred','research')])({previous,message});
  assert.deepEqual(result.brief.requirements,previous.requirements);assert.equal(result.brief.geography,'UK');assert.equal(result.needsClarification,false);
});

test('a later incidental UK mention cannot undo a removal, but an explicit restoration can',()=>{
  const previous=cardiac();assert.equal(parseBrief({previous,message:'Remove UK. UK was part of the old brief.'}).brief.geography,null);
  assert.equal(parseBrief({previous,message:'Remove UK. Keep UK essential after all.'}).brief.geography,'UK');
});

for(const phrase of ['Primary-care experience','primary care expertise','primary–care experience'])test('equivalent setting edits preserve the existing ID without a duplicate: '+phrase,async()=>{
  const previous=skin(),id=req(previous,'Primary care').id,message=phrase+' is preferred.';
  const next=(await mock([patch('setting',phrase),patch('activity',phrase),patch('role',phrase)])({previous,message})).brief;
  assert.deepEqual(next.requirements.filter(r=>r.kind==='setting').map(r=>[r.id,r.label,r.importance]),[[id,'Primary care','preferred']]);assert.equal(next.roles.length,0);assert.ok(!next.requirements.some(r=>r.kind==='activity'));assert.equal(req(next,'Validation research').importance,'essential');
});

for(const phrase of ['primary-care clinicians','primary care specialists','primary–care healthcare professionals'])test('a setting plus generic search subject does not become a second professional role: '+phrase,async()=>{
  const previous=skin(),message='Find '+phrase+'.',next=(await mock([patch('role',phrase)])({previous,message})).brief;
  assert.equal(next.requirements.filter(r=>r.kind==='setting').length,1);assert.equal(req(next,'Primary care').importance,'focus');assert.deepEqual(next.roles,[]);assert.equal(next.roleMode,null);
});

test('specific primary-care professions and strict GP eligibility remain distinct from the setting',async()=>{
  const message='Only general practitioners in primary care. Clinical research nurses are preferred.';
  const next=(await mock([patch('role','Clinical research nurses','preferred')])({previous:skin(),message})).brief;
  assert.equal(req(next,'General practitioner').strictRole,true);assert.ok(next.roles.includes('Clinical research nurses'));assert.equal(req(next,'Clinical research nurses').importance,'preferred');assert.equal(req(next,'Primary care').kind,'setting');
});

test('GP setting identifies where the technology is used without restricting it to the GP profession',async()=>{
  const message='Dermoscopy software for a GP setting.',next=(await mock([patch('role','GP setting')])({message})).brief;
  assert.equal(req(next,'Primary care').kind,'setting');assert.deepEqual(next.roles,[]);
});

test('removing a setting scrubs both spaced and hyphenated aliases from retrieval context',()=>{
  const previous=parseBrief({message:'Dermoscopy software for primary-care use.'}).brief;
  const next=parseBrief({previous,message:'Remove the primary care requirement.'}).brief;assert.ok(!next.requirements.some(r=>/primary[- ]care/i.test(r.text+' '+r.evidence)));assert.ok(req(next,'Skin-lesion imaging'));
});

test('an existing legacy setting alias collapses to the canonical ID before a refinement',()=>{
  const previous=skin(),id=req(previous,'Primary care').id;previous.requirements.push({id:'legacy-duplicate',kind:'setting',label:'Primary-care experience',text:'Primary-care experience',evidence:'Primary-care experience',importance:'essential'});
  const next=parseBrief({previous,message:'Primary care should be optional.'}).brief;assert.deepEqual(next.requirements.filter(r=>r.kind==='setting').map(r=>r.id),[id]);assert.equal(req(next,'Primary care').importance,'preferred');
});

test('an action on a legacy duplicate alias ID updates or removes the surviving equivalent criterion',()=>{
  const previous=skin(),id=req(previous,'Primary care').id;previous.requirements.push({id:'legacy-alias',kind:'setting',label:'Primary-care experience',text:'Primary-care experience',evidence:'Primary-care experience',importance:'essential'});
  const changed=parseBrief({previous,patch:{requirementId:'legacy-alias',importance:'preferred'}}).brief;assert.equal(req(changed,'Primary care').id,id);assert.equal(req(changed,'Primary care').importance,'preferred');assert.equal(changed.requirements.filter(r=>r.kind==='setting').length,1);
  const removed=parseBrief({previous,removeRequirementId:'legacy-alias'}).brief;assert.ok(!removed.requirements.some(r=>r.kind==='setting'));assert.ok(req(removed,'Skin-lesion imaging'));
  assert.throws(()=>parseBrief({previous,removeRequirementId:'not-in-previous'}),/current brief/);
});

for(const message of ['Make that optional.','Remove that requirement.','Remove the experience requirement.','Remove lunar imaging.'])test('an unresolved edit asks about the instruction instead of inventing a criterion: '+message,async()=>{
  let calls=0;const interpret=createBriefInterpreter({client:{chat:{completions:{create:async()=>{calls++;throw Error('must not guess');}}}}}),previous=cardiac();
  const result=await interpret({previous,message});assert.equal(result.needsClarification,true);assert.match(result.question,/Which active requirement/);assert.match(result.question,/Cardiac CT/);assert.equal(result.notices.length,1);assert.equal(calls,0);assert.deepEqual(result.brief.requirements,previous.requirements);
});

test('a new unfamiliar quoted research activity keeps its noun phrase rather than the priority sentence',async()=>{
  const text='mixed-methods implementation research would be helpful';const result=await mock([patch('research',text)])({previous:cardiac(),message:text+'.'});
  const r=req(result.brief,'mixed-methods implementation research');assert.ok(r);assert.equal(r.importance,'preferred');assert.ok(!result.brief.requirements.some(r=>/would be helpful/i.test(r.label)));assert.equal(req(result.brief,'Diagnostic study evaluation').importance,'essential');
});

test('removing a category removes its aliases from context and does not recreate a literal command',async()=>{
  const previous=parseBrief({message:'Cardiac CT software for diagnostic study evaluation. Diagnostic study evaluation is essential.'}).brief;
  const message='Remove the research requirement; keep cardiac CT.';
  const next=(await mock([patch('research','Remove the research requirement'),patch('research','research requirement')])({previous,message})).brief;
  assert.ok(!next.requirements.some(r=>r.kind==='research'||/diagnostic study evaluation/i.test(r.text)));assert.ok(req(next,'Cardiac CT'));
});
