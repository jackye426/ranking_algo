'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBriefInterpreter}=require('./brief.cjs'),{createDeviceInterpreter,validateDeviceContext}=require('./device-context.cjs'),taxonomy=require('./emdn-taxonomy.cjs');
const {restoreBrief}=require('./resume.cjs'),{snapshot}=require('./ai.cjs'),{matrixFor}=require('./search.cjs');
const interpreter=()=>createDeviceInterpreter({interpret:createBriefInterpreter({client:null}),taxonomy});
const active=r=>r.brief.requirements.filter(x=>x.kind!=='geography');
test('code-only dermatoscopy uses official metadata and one ordinary removable focus, without AI',async()=>{
  const r=await interpreter()({message:'Z12040118'}),d=r.brief.deviceContext;assert.equal(r.needsClarification,false);assert.equal(d.officialTerm,'VIDEO DERMATOSCOPES');assert.equal(d.release,'2026');assert.equal(d.taxonomyDigest.length,64);assert.deepEqual(active(r).map(x=>[x.kind,x.label,x.importance]),[['modality','Skin-lesion imaging','focus']]);assert.ok(validateDeviceContext(d,r.brief.requirements));assert.equal(d.concepts[0].sharedWithUser,false);assert.equal(d.derivedRequirementIds[0],active(r)[0].id);
});
test('ordinary embedded codes are removed before quoted model interpretation',async()=>{
  let seen;const interpret=async input=>{seen=input.message;return createBriefInterpreter({client:null})(input);};const f=createDeviceInterpreter({interpret,taxonomy});const r=await f({message:'Find dermatologists for Z12040118'});assert.ok(!seen.includes('Z12040118'));assert.ok(active(r).some(x=>x.label==='Dermatologist'));assert.ok(active(r).some(x=>x.label==='Skin-lesion imaging'));assert.ok(!active(r).some(x=>x.kind==='technology'));
});
test('CT code alone clarifies clinical application and does not invent cardiac CT',async()=>{
  const r=await interpreter()({message:'EMDN Z11030692'});assert.equal(r.deviceError.code,'device-clarification');assert.equal(r.deviceError.deviceDraft.code,'Z11030692');assert.deepEqual(r.brief.requirements,[]);assert.ok(!JSON.stringify(r.brief).includes('Cardiac CT'));
});
test('CT clarification answer combines explicit cardiac application with known CT modality',async()=>{
  const r=await interpreter()({deviceCode:'Z11030692',message:'It supports coronary artery disease diagnosis.'});assert.equal(r.needsClarification,false);assert.ok(active(r).some(x=>x.label==='Cardiac CT'));assert.ok(active(r).some(x=>x.label==='Coronary artery disease'));assert.ok(active(r).every(x=>x.importance==='focus'));assert.ok(!active(r).some(x=>['role','research','regulatory'].includes(x.kind)));
});
test('noncardiac CT application remains general CT, not coronary expertise',async()=>{
  const r=await interpreter()({deviceCode:'Z11030692',message:'Lung cancer imaging.'});assert.ok(active(r).some(x=>x.label==='CT imaging'));assert.ok(!active(r).some(x=>x.label==='Cardiac CT'||x.label==='Coronary artery disease'));
});
test('broad V92 needs purpose then explicit clinical expertise, without a made-up mapping',async()=>{
  const f=interpreter(),first=await f({message:'V92'});assert.equal(first.deviceError.code,'device-clarification');const role=await f({deviceCode:'V92',message:'Cardiologists'});assert.equal(role.deviceError.code,'device-clarification');const r=await f({deviceCode:'V92',message:'Software to analyse cardiac CT for coronary artery disease.'});assert.equal(r.needsClarification,false);assert.equal(r.brief.deviceContext.concepts.length,0);assert.match(r.brief.deviceContext.interpretation,/supplied purpose/);assert.doesNotMatch(r.brief.deviceContext.interpretation,/removed/);
});
test('cardiac implant monitoring is a focus activity, not implantation or validation experience',async()=>{
  const r=await interpreter()({message:'J010792'});assert.deepEqual(active(r).map(x=>[x.kind,x.label,x.importance]),[['activity','Implanted cardiac device monitoring','focus']]);assert.ok(!active(r).some(x=>/implantation|validation|regulatory/i.test(x.label)));const p={id:'p',candidateId:'c',text:'I provide remote monitoring of pacemakers.',type:'clinical-practice',sourceRecordId:'s',field:'about'};assert.equal(matrixFor({id:'c'},[p],r.brief)[0].status,'documented');const surgery={...p,text:'I implant pacemakers.'};assert.notEqual(matrixFor({id:'c'},[surgery],r.brief)[0].status,'documented');
});
for(const message of ['EMDN X999999','EMDN Z11030692 and J010792','Z12040118 for coronary CT software','Z11030692 for dermoscopy','not Z12040118'])test('unresolved device intent preserves an existing search: '+message,async()=>{
  const f=interpreter(),prior=(await f({message:'Only cardiologists for cardiac CT'})).brief,copy=structuredClone(prior),r=await f({previous:prior,message});assert.ok(r.deviceError,message);assert.deepEqual(r.brief,prior);assert.deepEqual(prior,copy);
});
test('selected code and message conflict rather than silently choose a code',async()=>{const r=await interpreter()({deviceCode:'Z12040118',message:'J010792'});assert.equal(r.deviceError.code,'device-conflict');});
test('removing a derived criterion persists across refinement and same-code selection',async()=>{
  const f=interpreter(),first=await f({message:'Z12040118'}),id=active(first)[0].id,removed=await f({previous:first.brief,removeRequirementId:id});assert.equal(removed.brief.deviceContext.concepts[0].state,'removed');assert.deepEqual(removed.brief.deviceContext.derivedRequirementIds,[]);const next=await f({previous:removed.brief,message:'Clinical research helpful'});assert.ok(!active(next).some(x=>x.id===id));const again=await f({previous:next.brief,message:'Z12040118'});assert.ok(!active(again).some(x=>x.id===id));assert.ok(!again.brief.summary.includes('Skin-lesion'));
});
test('clearing code removes only derived requirements and preserves manual role/location',async()=>{
  const f=interpreter(),first=await f({message:'Dermatologists for Z12040118 in the UK'}),cleared=await f({previous:first.brief,deviceCode:null});assert.equal(cleared.brief.deviceContext,undefined);assert.ok(cleared.brief.requirements.some(x=>x.label==='Dermatologist'));assert.ok(cleared.brief.requirements.some(x=>x.label==='UK'));assert.ok(!active(cleared).some(x=>x.label==='Skin-lesion imaging'));
});
test('an independently supplied clinical criterion survives code removal',async()=>{
  const f=interpreter(),first=await f({message:'Dermoscopy with EMDN Z12040118'}),cleared=await f({previous:first.brief,message:'Remove EMDN Z12040118'});assert.equal(first.brief.deviceContext.concepts[0].sharedWithUser,true);assert.ok(active(cleared).some(x=>x.label==='Skin-lesion imaging'));assert.equal(cleared.brief.deviceContext,undefined);
});
test('device replacement clears old derived focus but preserves earlier user constraints',async()=>{
  const f=interpreter(),first=await f({message:'Only radiologists for EMDN Z12040118'}),next=await f({previous:first.brief,message:'J010792'});assert.ok(!active(next).some(x=>x.label==='Skin-lesion imaging'));assert.ok(active(next).some(x=>x.label==='Implanted cardiac device monitoring'));assert.equal(next.brief.roleMode,'only');assert.ok(active(next).some(x=>x.label==='Radiologist'&&x.strictRole));
});
test('resume preserves valid metadata and removal lineage without reinterpreting it',async()=>{
  const f=interpreter(),first=await f({message:'Z12040118'}),removed=await f({previous:first.brief,removeRequirementId:active(first)[0].id}),restored=restoreBrief(removed.brief);assert.deepEqual(restored.brief.deviceContext,removed.brief.deviceContext);assert.deepEqual(restored.brief.requirements,removed.brief.requirements);const bad=structuredClone(first.brief);bad.deviceContext.derivedRequirementIds=['invented'];assert.throws(()=>restoreBrief(bad));
});
test('version changes require explicit reselection and then replace metadata without changing the old saved copy',async()=>{
  const f=interpreter(),first=await f({message:'Z12040118'}),old=structuredClone(first.brief);old.deviceContext.mappingVersion='old-mapping';const stale=await f({previous:old,message:'Clinical research helpful'});assert.equal(stale.deviceError.code,'device-version-changed');assert.deepEqual(stale.brief,old);const current=await f({previous:old,deviceCode:'Z12040118'});assert.equal(current.deviceError,undefined);assert.equal(current.brief.deviceContext.mappingVersion,taxonomy.getMapping('Z12040118').version);assert.equal(old.deviceContext.mappingVersion,'old-mapping');
});
test('model failure leaves lookup-owned clinical concepts usable and does not add code credentials',async()=>{
  const f=createDeviceInterpreter({interpret:createBriefInterpreter({client:{chat:{completions:{create:async()=>{throw Error('offline');}}}}}),taxonomy});const r=await f({message:'Find experts for Z12040118'});assert.equal(r.needsClarification,false);assert.equal(active(r).length,1);assert.equal(active(r)[0].label,'Skin-lesion imaging');
});
test('AI receives device context as context and retains candidate-owned evidence separately',async()=>{
  const r=await interpreter()({message:'Z12040118'}),wire=snapshot({brief:r.brief,candidates:[{id:'c',name:'Candidate',evidence:[],requirementMatrix:[]}]});assert.equal(wire.brief.deviceContext.code,'Z12040118');assert.match(wire.brief.deviceContext.meaning,/not evidence/);assert.deepEqual(wire.candidates[0].evidence,[]);
});
test('retrieval concepts use clinical synonyms as alternatives, not all synonym tokens together',async()=>{
  const f=interpreter(),skin=(await f({message:'Z12040118'})).brief,ct=(await f({deviceCode:'Z11030692',message:'General CT for diagnostic support'})).brief;
  for(const [brief,phrases]of [[skin,['I perform dermoscopy.','I perform dermatoscopy.']],[ct,['I report CT.','I report computed tomography.']]])for(const text of phrases){const p={id:'p',candidateId:'c',text,type:'clinical-practice',sourceRecordId:'s',field:'about'};assert.ok(matrixFor({id:'c'},[p],brief).some(r=>r.status==='documented'),text);}
});
test('remote device monitoring cannot borrow implantation or ordinary follow-up from another clinical activity',async()=>{
  const brief=(await interpreter()({message:'J010792'})).brief;
  for(const text of ['I provide remote monitoring of blood pressure and I implant pacemakers.','I manage blood pressure remotely. I implant cardiac devices.','I perform cardiac device follow-up.','I monitor patients with heart failure.','I do not provide remote monitoring of pacemakers.']){const p={id:'p',candidateId:'c',text,type:'clinical-practice',sourceRecordId:'s',field:'about'};assert.notEqual(matrixFor({id:'c'},[p],brief)[0].status,'documented',text);}
});
test('unmapped codes with clinical-application clarification never inherit a CT expansion',async()=>{
  for(const message of ['A0101010101 for treating diabetes in general medicine','J0302 for monitoring coronary artery disease']){const r=await interpreter()({message});assert.ok(!active(r).some(x=>x.label==='Cardiac CT'||x.label==='CT imaging'),message);assert.equal(r.brief.deviceContext?.concepts.length,0);}
});
test('removing an inactive code preserves the actual active device and criteria',async()=>{
  const f=interpreter(),first=await f({message:'Z12040118'}),r=await f({previous:first.brief,message:'Remove J010792'});assert.equal(r.deviceError.code,'device-conflict');assert.deepEqual(r.brief,first.brief);
});
test('synonym reaffirmation makes the criterion independent and explicit re-add restores consistent lineage',async()=>{
  for(const removeFirst of [false,true]){const f=interpreter(),first=await f({message:'Z12040118'}),base=removeFirst?(await f({previous:first.brief,removeRequirementId:active(first)[0].id})).brief:first.brief;
    for(const message of ['I need dermoscopy','Z12040118 for dermoscopy']){const added=await f({previous:base,message});assert.equal(added.brief.deviceContext.concepts[0].state,'active');assert.equal(added.brief.deviceContext.concepts[0].sharedWithUser,true);assert.ok(validateDeviceContext(added.brief.deviceContext,added.brief.requirements));const cleared=await f({previous:added.brief,deviceCode:null});assert.ok(active(cleared).some(x=>x.label==='Skin-lesion imaging'));}}
});
test('changing an accepted CT application cannot silently retain and blend the old clinical context',async()=>{
  const f=interpreter(),first=await f({message:'Z11030692 for coronary artery disease'});
  for(const message of ['Z11030692 for lung cancer','Z11030692 for lung cancer, not coronary artery disease']){const r=await f({previous:first.brief,message});assert.equal(r.deviceError.code,'device-conflict');assert.deepEqual(r.brief,first.brief);}
  const firstLung=await f({message:'Z11030692 for lung cancer'});assert.ok(active(firstLung).some(x=>x.text==='lung cancer'));assert.ok(!active(firstLung).some(x=>x.label==='Cardiac CT'));
});
test('implicit application changes without repeating the code cannot rerun unchanged coronary criteria',async()=>{
  const f=interpreter(),first=await f({message:'Z11030692 for coronary artery disease'});for(const message of ['Use it for lung cancer instead of coronary artery disease','Use the software for lung cancer','Change the application to brain tumours']){const r=await f({previous:first.brief,message});assert.equal(r.deviceError.code,'device-conflict');assert.deepEqual(r.brief,first.brief);}
});
test('negated code removal remains a no-op and does not recursively reinterpret its code',async()=>{
  const f=interpreter(),first=await f({message:'Z12040118'});for(const message of ['Do not remove EMDN Z12040118','Do not remove EMDN']){const r=await f({previous:first.brief,message});assert.equal(r.deviceError,undefined);assert.equal(r.brief.deviceContext.code,'Z12040118');assert.deepEqual(r.brief.requirements,first.brief.requirements);}
});
