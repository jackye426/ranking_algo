'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBriefInterpreter,parseBrief}=require('./brief.cjs');
const {requirementQueries}=require('./search.cjs');
const phrase='radioactive brain implants';
const query='I need a specialist who has experience with '+phrase;
const client=content=>({chat:{completions:{create:async()=>({choices:[{message:{content}}]})}}});
const unavailable={chat:{completions:{create:async()=>{throw Error('simulated provider timeout');}}}};
const configs={offline:null,unavailable,malformed:client('not valid JSON'),emptyPatch:client('{"requirements":[]}')};
function subject(result){return result.brief.requirements.find(r=>r.text===phrase);}

for(const [mode,model]of Object.entries(configs))for(const suffix of ['', ' in the UK'])test(`${mode}: unfamiliar requested experience survives${suffix?' UK geography':''}`,async()=>{
  const result=await createBriefInterpreter({client:model})({message:query+suffix});
  const requirement=subject(result);assert.ok(requirement);assert.equal(requirement.kind,'activity');assert.equal(requirement.importance,'focus');assert.equal(requirement.matchIntent,'activity');assert.equal(requirement.evidence,phrase);
  assert.equal(result.needsClarification,false);assert.ok(!result.interpretationIncomplete);assert.ok(!result.brief.requirements.some(r=>r.kind==='technology'));
  assert.ok(requirementQueries(requirement).some(q=>q.query.includes(phrase)),'retained positive expertise reaches hybrid query compilation');
});

for(const kind of ['technology','question','procedure','role'])test(`successful model cannot downgrade quoted experience to ${kind} or duplicate its subject`,async()=>{
  const result=await createBriefInterpreter({client:client(JSON.stringify({requirements:[{kind,text:phrase,evidence:phrase,importance:'essential',operation:'add'}]}))})({message:query});
  assert.equal(result.mode,'deepseek');assert.equal(result.brief.requirements.length,1);assert.equal(subject(result).kind,'activity');assert.equal(subject(result).importance,'focus');
});

test('positive fallback remains removable and cannot return through conversation history',async()=>{
  const interpret=createBriefInterpreter({client:null});const initial=await interpret({message:query+' in the UK'}),id=subject(initial).id;
  const removed=await interpret({previous:initial.brief,removeRequirementId:id});assert.equal(subject(removed),undefined);
  const refined=await interpret({previous:removed.brief,message:'Cardiologists'});assert.equal(subject(refined),undefined);assert.ok(!refined.brief.requirements.some(r=>r.text.includes(phrase)));
  const natural=await interpret({previous:initial.brief,message:'Remove radioactive brain implants.'});assert.equal(subject(natural),undefined);assert.ok(!natural.interpretationIncomplete);
});

test('unfamiliar explicit mandatory experience is represented instead of silently keeping the old search',async()=>{
  const previous=parseBrief({message:'Cardiologists with radiology interests'}).brief,copy=structuredClone(previous);
  const result=await createBriefInterpreter({client:unavailable})({previous,message:'They must have experience with radioactive brain implants.'});
  assert.equal(subject(result).importance,'essential');assert.ok(!result.interpretationIncomplete);assert.equal(result.brief.version,previous.version+1);assert.deepEqual(previous,copy);
});

for(const message of [
  'Remove that requirement.',
  'Remove the lunar implant criterion.',
  'Make the implant criterion preferred.',
  'They must be able to assess that particular technique.',
  'They must have experience with that particular technique.',
  'They should have experience with this procedure.',
  'Exclude anyone without that kind of experience.',
  'They must not have experience with radioactive brain implants.',
  'Cardiologists must not have experience with radioactive brain implants.',
  'Cardiac CT is essential and tungsten implant qualifications are mandatory.',
  'Keep cardiac CT essential. They must be qualified for that specific procedure.',
])test('incomplete instruction preserves the exact accepted brief: '+message,async()=>{
  const previous=parseBrief({message:'Cardiologists with cardiac CT interests'}).brief,copy=structuredClone(previous);
  for(const model of [null,unavailable,client('{"requirements":[]}')]){
    const result=await createBriefInterpreter({client:model})({previous,message});
    assert.equal(result.interpretationIncomplete,true);assert.equal(result.retryable,true);assert.equal(result.needsClarification,true);assert.ok(result.unresolvedInstructions.length);assert.ok(result.unresolvedInstructions.some(x=>/implant|requirement|technique|procedure|experience/i.test(x)));assert.deepEqual(result.brief,previous);assert.deepEqual(previous,copy);
  }
});

test('failed first interpretation has no committed partial UK-only brief',async()=>{
  const result=await createBriefInterpreter({client:null})({message:'In the UK they must be able to assess that particular technique.'});
  assert.equal(result.interpretationIncomplete,true);assert.equal(result.brief.version,0);assert.deepEqual(result.brief.requirements,[]);
});

test('unfamiliar optional research retains the quoted phrase and its optional priority',async()=>{
  const result=await createBriefInterpreter({client:null})({message:'Cardiac CT. Experience in mixed-methods implementation research would be helpful.'});
  const requirement=result.brief.requirements.find(r=>r.text==='mixed-methods implementation research');assert.ok(requirement);assert.equal(requirement.kind,'research');assert.equal(requirement.importance,'preferred');
});

for(const message of ['I need a specialist','Find some experts','Find clinical expertise','UK'])test('recovery does not invent expertise for a vague request: '+message,async()=>{
  const result=await createBriefInterpreter({client:null})({message});assert.equal(result.needsClarification,true);assert.ok(!result.interpretationIncomplete);assert.ok(!result.brief.requirements.some(r=>r.kind==='activity'));
});
