'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseBrief,normalizeBrief,createBriefInterpreter}=require('./brief.cjs');
const {restoreBrief}=require('./resume.cjs');
const req=(brief,label)=>brief.requirements.find(r=>r.label===label);
const model=requirements=>createBriefInterpreter({client:{chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({requirements})}}]})}}}});
const patch=(kind,text,importance='essential')=>({kind,text,evidence:text,importance,operation:'add'});

for(const [message,label,intent] of [
  ['Cardiologists with radiology interests','Medical imaging','interest'],
  ['Cardiologists interested in cardiac imaging','Cardiovascular imaging','interest'],
  ['Cardiologists with research interests in imaging','Medical imaging','research'],
  ['Cardiologists with cardiac CT experience','Cardiac CT','activity'],
  ['Cardiologists and cardiac imaging','Cardiovascular imaging','topic'],
])test('simple role and expertise discovery: '+message,()=>{
  const result=parseBrief({message}),brief=result.brief;
  assert.equal(result.needsClarification,false);assert.equal(result.question,null);
  assert.deepEqual(brief.roles,['Cardiologist']);assert.equal(req(brief,'Cardiologist').importance,'focus');
  assert.equal(req(brief,label).importance,'focus');assert.equal(req(brief,label).matchIntent,intent);
  assert.equal(brief.requirements.length,2);assert.ok(!brief.requirements.some(r=>r.importance==='essential'));
});

for(const message of ['Cardiologists','Dermatologists','Find a cardiology expert','Find a dermatology specialist','Cardiac imaging','Heart failure','Clinical research'])test('a meaningful broad query is enough to start: '+message,()=>assert.equal(parseBrief({message}).needsClarification,false));
for(const message of ['I need a specialist','Find some experts','UK','Adults',''])test('no fabricated topic for an underspecified request: '+message,()=>{const result=parseBrief({message});assert.equal(result.needsClarification,true);assert.match(result.question,/specialty|clinical interest|research area/i);});

test('general imaging alias does not accumulate under a specific modality',()=>{
  for(const message of ['Cardiac imaging','Skin-lesion imaging','Skin imaging'])assert.equal(req(parseBrief({message}).brief,'Medical imaging'),undefined);
  const brief=parseBrief({message:'Cardiac CT and radiology interests'}).brief;
  assert.ok(req(brief,'Cardiac CT'));assert.ok(req(brief,'Medical imaging'));
});

test('interest and activity are independent from essential and preferred',()=>{
  const brief=parseBrief({message:'Only cardiologists. They must report cardiac CT. Validation research is helpful.'}).brief;
  assert.equal(req(brief,'Cardiologist').importance,'essential');assert.equal(req(brief,'Cardiologist').strictRole,true);
  for(const label of ['Cardiac CT','Image interpretation'])assert.equal(req(brief,label).importance,'essential');
  assert.equal(req(brief,'Cardiac CT').matchIntent,'activity');assert.equal(req(brief,'Validation research').importance,'preferred');
  const interests=parseBrief({message:'Cardiac imaging interests are essential.'}).brief;
  assert.equal(req(interests,'Cardiovascular imaging').importance,'essential');assert.equal(req(interests,'Cardiovascular imaging').matchIntent,'interest');
});

test('optional research in a later clause does not change earlier intent or create a mandatory gap',()=>{
  const brief=parseBrief({message:'Cardiologists with radiology interests. Research is helpful.'}).brief;
  assert.equal(req(brief,'Medical imaging').matchIntent,'interest');assert.equal(req(brief,'Medical imaging').importance,'focus');
  assert.equal(req(brief,'Clinical research').importance,'preferred');
});

test('optional research after and cannot silently turn the requested population into a preference',()=>{
  const brief=parseBrief({message:'Cardiologists with radiology interests and research experience would be helpful.'}).brief;
  assert.equal(req(brief,'Cardiologist').importance,'focus');assert.equal(req(brief,'Medical imaging').importance,'focus');
  assert.equal(req(brief,'Clinical research').importance,'preferred');
});

for(const phrase of ['Research would be useful','Research could be helpful','Research is a bonus','Research would be nice to have'])test('ordinary optional research phrasing is retained without a model: '+phrase,()=>{
  const brief=parseBrief({message:'Cardiologists with radiology interests; '+phrase}).brief;
  assert.equal(req(brief,'Clinical research').importance,'preferred');assert.equal(req(brief,'Cardiologist').importance,'focus');assert.equal(req(brief,'Medical imaging').matchIntent,'interest');
});

test('focus on is a search instruction, while no longer interested in removes the topic',()=>{
  const brief=parseBrief({message:'Cardiologists. Focus on cardiac imaging.'}).brief;
  assert.equal(req(brief,'Cardiovascular imaging').matchIntent,'topic');
  const next=parseBrief({previous:brief,message:'We are not interested in cardiac imaging.'}).brief;
  assert.equal(req(next,'Cardiovascular imaging'),undefined);assert.deepEqual(next.roles,['Cardiologist']);
});

test('combined requested roles remain alternatives and research cannot become another professional role',()=>{
  const brief=parseBrief({message:'Cardiologists and radiologists with research interests in cardiac imaging.'}).brief;
  assert.deepEqual(new Set(brief.roles),new Set(['Cardiologist','Radiologist']));
  assert.equal(brief.requirements.filter(r=>r.kind==='role').length,2);
  assert.equal(req(brief,'Cardiovascular imaging').matchIntent,'research');
  assert.ok(brief.requirements.filter(r=>r.kind==='role').every(r=>r.importance==='focus'));
});

test('not only cannot silently promote an ordinary topic or role to mandatory',()=>{
  const brief=parseBrief({message:'Not only cardiologists but also radiologists. Not only cardiac imaging.'}).brief;
  assert.deepEqual(new Set(brief.roles),new Set(['Cardiologist','Radiologist']));
  assert.ok(brief.requirements.every(r=>r.importance==='focus'));assert.equal(brief.roleMode,null);
});

test('not only a single role opens discovery to other professions instead of leaving a hidden role gate',()=>{
  const previous=parseBrief({message:'Only cardiologists with cardiac imaging interests.'}).brief;
  const brief=parseBrief({previous,message:'Not only cardiologists.'}).brief;
  assert.equal(req(brief,'Cardiologist').importance,'preferred');assert.equal(brief.roleMode,null);assert.equal(req(brief,'Cardiologist').strictRole,false);
  assert.equal(req(brief,'Cardiovascular imaging').matchIntent,'interest');
});

test('broadening a topic does not also broaden the requested profession',()=>{
  const brief=parseBrief({message:'Cardiologists with not only cardiac imaging interests.'}).brief;
  assert.equal(req(brief,'Cardiologist').importance,'focus');
});

test('not only with an additional quoted profession forms an OR cohort after model interpretation',async()=>{
  const result=await model([patch('role','nurses')])({message:'Not only cardiologists but also nurses with cardiac imaging interests.'});
  assert.deepEqual(new Set(result.brief.roles),new Set(['Cardiologist','nurses']));
  assert.ok(result.brief.requirements.filter(r=>r.kind==='role').every(r=>r.importance==='focus'));
});

test('new intent survives normal refinement, changes when stated, and removes by natural alias',()=>{
  let brief=parseBrief({message:'Cardiologists with radiology interests'}).brief;
  brief=parseBrief({previous:brief,message:'Research is helpful.'}).brief;
  assert.equal(req(brief,'Medical imaging').matchIntent,'interest');
  brief=parseBrief({previous:brief,message:'Research interests in imaging'}).brief;
  assert.equal(req(brief,'Medical imaging').matchIntent,'research');
  brief=parseBrief({previous:brief,message:'Remove radiology interests.'}).brief;
  assert.equal(req(brief,'Medical imaging'),undefined);assert.deepEqual(brief.roles,['Cardiologist']);
});

test('manual focus priority is valid and releases an explicit strict role without losing the role',()=>{
  const previous=parseBrief({message:'Only cardiologists with cardiac imaging interests'}).brief;
  const brief=parseBrief({previous,patch:{requirementId:req(previous,'Cardiologist').id,importance:'focus'}}).brief;
  assert.equal(req(brief,'Cardiologist').importance,'focus');assert.equal(req(brief,'Cardiologist').strictRole,false);assert.equal(brief.roleMode,null);
});

test('legacy saved essentials and their missing intent are not rewritten as new discovery defaults',()=>{
  const previous={version:2,requirements:[{id:'old-role',kind:'role',label:'Cardiologist',text:'Cardiologist',importance:'essential'},{id:'old-ct',kind:'modality',label:'Cardiac CT',text:'Cardiac CT',importance:'essential'}]};
  const brief=parseBrief({previous,message:'Keep cardiac CT. Research is helpful.'}).brief;
  assert.equal(req(brief,'Cardiologist').importance,'essential');assert.equal(req(brief,'Cardiac CT').importance,'essential');
  assert.equal(normalizeBrief(previous).requirements.find(r=>r.id==='old-ct').matchIntent,undefined);
});

test('model cannot promote unqualified discovery criteria or add a radiologist role',async()=>{
  const interpret=model([patch('modality','radiology'),patch('role','radiology interests'),patch('role','Cardiologists')]);
  const result=await interpret({message:'Cardiologists with radiology interests'});
  assert.equal(result.mode,'deepseek');assert.deepEqual(result.brief.roles,['Cardiologist']);
  assert.equal(result.brief.requirements.length,2);assert.ok(result.brief.requirements.every(r=>r.importance==='focus'));
});

test('unfamiliar quoted expertise defaults to focus irrespective of model priority',async()=>{
  const text='mixed-methods implementation research',result=await model([patch('research',text)])({message:'Find '+text});
  assert.equal(req(result.brief,text).importance,'focus');assert.equal(req(result.brief,text).matchIntent,'research');
  const explicit=await model([patch('research',text,'preferred')])({message:text+' is essential.'});
  assert.equal(req(explicit.brief,text).importance,'essential');
});

test('imaging research intent does not accumulate a duplicate generic research requirement',async()=>{
  const result=await model([patch('research','research interests')])({message:'Cardiologists with research interests in imaging'});
  assert.equal(result.brief.requirements.length,2);assert.equal(req(result.brief,'Medical imaging').matchIntent,'research');
});

test('offline interpretation preserves the same useful short-query search',async()=>{
  const interpret=createBriefInterpreter({client:{chat:{completions:{create:async()=>{throw Error('offline');}}}}});
  const result=await interpret({message:'Cardiologists with radiology interests'});
  assert.equal(result.needsClarification,false);assert.deepEqual(result.brief,parseBrief({message:'Cardiologists with radiology interests'}).brief);
});

test('saved discovery intent resumes exactly and rejects unsupported metadata',()=>{
  const brief=parseBrief({message:'Cardiologists with radiology interests. Research is helpful.'}).brief;
  assert.deepEqual(restoreBrief(brief).brief,brief);
  for(const value of ['approved','available',{},true]){const invalid=structuredClone(brief);invalid.requirements.find(r=>r.kind==='modality').matchIntent=value;assert.throws(()=>restoreBrief(invalid));}
  const invalid=structuredClone(brief);invalid.requirements.find(r=>r.kind==='role').matchIntent='research';assert.throws(()=>restoreBrief(invalid));
});
