'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {QUESTIONS,createClarification,withClarification}=require('./clarifications.cjs');
const {parseBrief,createBriefInterpreter}=require('./brief.cjs');
const {createDeviceInterpreter}=require('./device-context.cjs');
const messages=clarification=>clarification.quickReplies.map(reply=>reply.message);
const interpreter=client=>createDeviceInterpreter({interpret:createBriefInterpreter({client:client??null})});
const ctReplies=['Cardiac CT','Brain CT','Lung CT','General CT'];
const purposeReplies=['The software supports diagnosis.','The software monitors a clinical condition.','The software supports treatment planning.'];

test('fixed quick replies have stable IDs, are returned independently, and do not depend on question prose',()=>{
  const first=createClarification('ct-application',{deviceCode:'Z11030692',question:'Different prompt'});
  assert.deepEqual(messages(first),ctReplies);assert.equal(new Set(first.quickReplies.map(r=>r.id)).size,4);
  first.quickReplies[0].message='changed';assert.deepEqual(messages(createClarification('ct-application',{deviceCode:'Z11030692'})),ctReplies);
  assert.deepEqual(messages(createClarification('context',{question:QUESTIONS['ct-application']})),[]);
  assert.deepEqual(messages(createClarification('device-purpose',{deviceCode:'J0302'})),[]);
  assert.deepEqual(messages(createClarification('ct-application',{deviceCode:'J0302'})),[]);
});
test('generic expertise clarification survives both deterministic parser and model wrapper',async()=>{
  for(const result of [parseBrief({message:'I need a specialist'}),await createBriefInterpreter({client:null})({message:'I need a specialist'}),await interpreter()({message:'I need a specialist'})]){
    assert.equal(result.needsClarification,true);assert.equal(result.clarification.kind,'expertise');
    assert.equal(result.question,result.clarification.question);assert.deepEqual(messages(result.clarification),['Cardiologists','Dermatologists','Cardiac imaging research']);
  }
});
test('partial generic proposals retain explicit context without inventing expertise or requirements from replies',async()=>{
  const result=await interpreter()({message:'Adults in primary care'});
  assert.equal(result.needsClarification,true);assert.equal(result.clarification.kind,'expertise');
  assert.deepEqual(result.brief.requirements.map(r=>r.label),['Adults','Primary care']);
  const answer=await interpreter()({previous:result.brief,message:result.clarification.quickReplies[0].message});
  assert.equal(answer.needsClarification,false);assert.equal(answer.clarification,undefined);assert.ok(answer.brief.requirements.some(r=>r.label==='Adults'));assert.ok(answer.brief.requirements.some(r=>r.label==='Primary care'));
});
test('CT lookup has a concise application prompt and exactly four usable choices without model calls',async()=>{
  let calls=0;const client={chat:{completions:{create:async()=>{calls++;throw Error('Must not generate suggestions');}}}},f=interpreter(client),first=await f({message:'Z11030692'});
  assert.equal(calls,0);assert.equal(first.deviceError.code,'device-clarification');assert.equal(first.clarification.kind,'ct-application');assert.equal(first.question,QUESTIONS['ct-application']);assert.deepEqual(first.clarification,first.deviceError.clarification);assert.equal(first.deviceError.deviceDraft.question,first.question);assert.deepEqual(messages(first.clarification),ctReplies);
  for(const message of ctReplies){const answer=await interpreter()({deviceCode:'Z11030692',message});assert.equal(answer.needsClarification,false,message);assert.equal(answer.clarification,undefined,message);assert.ok(answer.brief.requirements.some(r=>r.kind==='modality'),message);}
});
test('V92 purpose choices lead to a separate clinical-subject question with no invented choices',async()=>{
  const f=interpreter(),first=await f({message:'V92'});assert.equal(first.clarification.kind,'device-purpose');assert.deepEqual(messages(first.clarification),purposeReplies);
  for(const message of purposeReplies){const second=await f({deviceCode:'V92',message});assert.equal(second.deviceError.code,'device-clarification',message);assert.equal(second.clarification.kind,'device-clinical-subject',message);assert.deepEqual(messages(second.clarification),[]);assert.deepEqual(second.brief.requirements,[]);assert.equal(second.deviceError.deviceDraft.question,second.clarification.question);}
  const answered=await f({deviceCode:'V92',message:purposeReplies[0]+' Coronary artery disease.'});assert.equal(answered.needsClarification,false);assert.equal(answered.clarification,undefined);
});
test('unreviewed codes can ask for purpose but do not receive the V92 software choices or CT choices',async()=>{
  for(const message of ['J0302','A0101010101']){const first=await interpreter()({message});assert.equal(first.deviceError.code,'device-clarification');assert.equal(first.clarification.kind,'device-purpose');assert.deepEqual(messages(first.clarification),[]);}
});
test('generic purpose replies still need a clinical subject if the model labels their generic words as expertise',async()=>{
  for(const [index,text]of ['diagnosis','clinical condition','treatment planning'].entries()){
    const client={chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({requirements:[{kind:'condition',text,evidence:text,importance:'focus',operation:'add'}]})}}]})}}};
    const result=await interpreter(client)({deviceCode:'V92',message:purposeReplies[index]});assert.equal(result.needsClarification,true,text);assert.equal(result.deviceError.code,'device-clarification',text);assert.equal(result.clarification.kind,'device-clinical-subject');assert.deepEqual(result.clarification.quickReplies,[]);assert.deepEqual(result.brief.requirements,[]);
  }
});
test('genuine interpretation failures and device conflicts remain recovery, not clarification suggestions',async()=>{
  const f=interpreter(),prior=(await f({message:'Cardiologists'})).brief;
  for(const message of ['Remove photonics experience','Research must be mandatory','EMDN X999999','Z11030692 for dermoscopy']){
    const result=await f({previous:prior,message});assert.ok(result.interpretationIncomplete||result.deviceError,message);assert.equal(result.clarification,undefined,message);assert.equal(result.deviceError?.clarification,undefined,message);assert.deepEqual(result.brief,prior,message);
  }
  const result=withClarification({needsClarification:true,interpretationIncomplete:true,clarification:createClarification('expertise')});assert.equal(result.clarification,undefined);
});
test('successful model enrichment removes stale generic clarification metadata',async()=>{
  const client={chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({requirements:[{kind:'procedure',text:'brachytherapy',evidence:'brachytherapy',importance:'focus',operation:'add'}]})}}]})}}};
  const result=await createBriefInterpreter({client})({message:'brachytherapy'});assert.equal(result.needsClarification,false);assert.equal(result.question,null);assert.equal(result.clarification,undefined);
});
