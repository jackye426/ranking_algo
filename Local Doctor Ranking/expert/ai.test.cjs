'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
const {createExpertAI,snapshot,validateDraft,createWireContext}=require('./ai.cjs');
const brief={version:2,summary:'Cardiac CT clinical scope.',requirements:[{id:'requirement-cardiac-full-id',label:'Cardiac CT',text:'Cardiac CT',kind:'modality',importance:'essential'},{id:'requirement-practice-full-id',label:'Current practice',text:'Current practice',kind:'currentPractice',importance:'essential'}]};
const person=(n=1)=>{const id='expert-profile-canonical-person-'+n;return {id,name:'Dr Example '+n,role:'Radiologist',specialty:'Clinical radiology',evidence:[{id:'evidence-canonical-person-'+n+'-first',candidateId:id,sourceRecordId:'public-source-'+n,text:'The dated record describes cardiac CT and MRI work.',sourceQuote:'cardiac CT and MRI',reviewedParaphrase:true,type:'clinical-practice',field:'public-profile',sourceUrl:'https://example.org/doctor-'+n,dates:{sourceDate:'2010-05-11',observedAt:'2026-10-06'},qualifiers:['historical','reported-current-practice'],review:{limitations:['The combined CT/MRI activity is not a CT-only volume.', 'An undated profile does not confirm current practice.']}}],requirementMatrix:[{requirementId:brief.requirements[0].id,label:'Cardiac CT',status:'documented',evidenceIds:['evidence-canonical-person-'+n+'-first']}],gaps:[{label:'Current practice',importance:'essential',note:'Confirm relevant current activity.'}],questions:[]};};
const prose='The recorded cardiac imaging work provides a reason to explore relevance to this clinical scope. The passage describes CT and MRI together, so it does not establish CT-only activity or a reporting volume. Current work in the pathway and suitability for the particular engagement still require direct confirmation.';
const draftFor=ctx=>({summary:'Recorded imaging work supports further discussion, with current activity still to confirm.',sections:ctx.candidates.map(c=>({candidateId:c.id,text:prose,evidenceIds:[c.evidence[0].id]}))});
const completion=body=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(body)}}]});
function fakeClient(transform=x=>x,check={unsupportedClaims:[]}){const calls=[];return {calls,client:{chat:{completions:{create:async(request,options)=>{calls.push({request,options});return completion(calls.length===1?transform(draftFor(JSON.parse(request.messages[1].content))):check);}}}}};}
const input=(n=1)=>({kind:n>1?'comparison':'explanation',brief,candidates:Array.from({length:n},(_,i)=>person(i+1))});

for(const count of [1,2,3])test('short aliases restore canonical identities for '+count+' candidate(s), with an independent check',async()=>{
  const initial=input(count),before=structuredClone(initial),fake=fakeClient();
  const answer=await createExpertAI({client:fake.client})(initial);
  assert.equal(answer.provider,'deepseek');assert.equal(fake.calls.length,2);assert.deepEqual(initial,before);
  const generation=JSON.parse(fake.calls[0].request.messages[1].content),check=JSON.parse(fake.calls[1].request.messages[1].content);
  assert.deepEqual(generation.candidates.map(c=>c.id),Array.from({length:count},(_,i)=>'c'+(i+1)));
  assert.equal(generation.brief.requirements[0].id,'r1');
  for(let i=0;i<count;i++){
    const canonical=initial.candidates[i],wire=generation.candidates[i],section=answer.sections[i];
    assert.equal(wire.evidence[0].id,'c'+(i+1)+'e1');assert.equal(wire.evidence[0].candidateId,wire.id);
    assert.deepEqual(wire.documentedRequirements[0].evidenceIds,[wire.evidence[0].id]);
    assert.equal(section.candidateId,canonical.id);assert.deepEqual(section.evidenceIds,[canonical.evidence[0].id]);
    assert.equal(answer.citations[i].candidateId,canonical.id);assert.equal(answer.citations[i].id,canonical.evidence[0].id);
    assert.equal(check.draft.sections[i].candidateId,wire.id);assert.equal(check.context.candidates[i].evidence[0].id,wire.evidence[0].id);
  }
  assert.ok(validateDraft({summary:answer.summary,sections:answer.sections},snapshot(initial)));
  assert.equal(fake.calls[0].options.signal,fake.calls[1].options.signal);assert.equal(fake.calls[0].options.timeout,15000);assert.equal(fake.calls[1].options.timeout,15000);
  assert.ok(!JSON.stringify(fake.calls.map(c=>c.request)).includes('evidence-canonical-person-'));
  assert.ok(!JSON.stringify(fake.calls.map(c=>c.request)).includes('expert-profile-canonical-person-'));
});

const rejections=[
  ['unknown candidate alias',d=>{d.sections[0].candidateId='c99';}],
  ['unknown evidence alias',d=>{d.sections[0].evidenceIds=['c1e99'];}],
  ['foreign-candidate evidence alias',d=>{d.sections[0].evidenceIds=['c2e1'];}],
  ['full candidate ID instead of its alias',d=>{d.sections[0].candidateId=person().id;}],
  ['full evidence ID instead of its alias',d=>{d.sections[0].evidenceIds=[person().evidence[0].id];}],
  ['duplicate candidate sections',d=>{d.sections[1]={...d.sections[0]};}],
  ['duplicate evidence aliases',d=>{d.sections[0].evidenceIds=['c1e1','c1e1'];}],
  ['an alias copied into prose',d=>{d.sections[0].text='The source c1e1 records related imaging work.';}]
];
for(const [label,change]of rejections)test(label+' fails closed before the independent request',async()=>{
  const fake=fakeClient(d=>{change(d);return d;}),answer=await createExpertAI({client:fake.client})(input(2));
  assert.equal(answer.provider,'evidence');assert.equal(answer.retryable,true);assert.equal(fake.calls.length,1);
  assert.equal(answer.citations[0].id,person().evidence[0].id);assert.equal(answer.sections[0].candidateId,person().id);
});

test('aliases preserve complete source scope and date limitations in both generation and support checks',async()=>{
  const fake=fakeClient();await createExpertAI({client:fake.client})(input());
  const first=JSON.parse(fake.calls[0].request.messages[1].content),second=JSON.parse(fake.calls[1].request.messages[1].content).context;
  for(const context of [first,second]){const e=context.candidates[0].evidence[0];assert.equal(e.text,person().evidence[0].text);assert.equal(e.sourceQuote,'cardiac CT and MRI');assert.equal(e.reviewedParaphrase,true);assert.deepEqual(e.dates,person().evidence[0].dates);assert.deepEqual(e.qualifiers,person().evidence[0].qualifiers);assert.deepEqual(e.limitations,person().evidence[0].review.limitations);assert.equal(context.candidates[0].gaps[0].label,'Current practice');assert.equal(context.brief.requirements[0].importance,'essential');}
});

test('an independent support rejection still falls back after a valid alias response',async()=>{
  const fake=fakeClient(x=>x,{unsupportedClaims:['The proposed individual study-appraisal role is not supported.']});
  const answer=await createExpertAI({client:fake.client})(input());assert.equal(fake.calls.length,2);assert.equal(answer.provider,'evidence');assert.equal(answer.retryable,true);
});

test('alias maps are request-local and cannot return another request’s canonical identity',async()=>{
  const fakeA=fakeClient(),fakeB=fakeClient(),a=input(),b={...input(),candidates:[person(77)]};
  const [first,second]=await Promise.all([createExpertAI({client:fakeA.client})(a),createExpertAI({client:fakeB.client})(b)]);
  assert.equal(first.sections[0].candidateId,person().id);assert.equal(second.sections[0].candidateId,person(77).id);
  assert.equal(JSON.parse(fakeA.calls[0].request.messages[1].content).candidates[0].id,'c1');assert.equal(JSON.parse(fakeB.calls[0].request.messages[1].content).candidates[0].id,'c1');
});

test('malformed canonical identity duplication is rejected before any paid request',async()=>{
  const fake=fakeClient(),duplicate={...input(2),candidates:[person(),person()]};
  const answer=await createExpertAI({client:fake.client})(duplicate);assert.equal(answer.provider,'evidence');assert.equal(fake.calls.length,0);
});

test('the verifier can decode exactly the same alias response without accepting canonical-ID spoofing',()=>{
  const canonical=snapshot(input(3)),wire=createWireContext(canonical),draft=draftFor(wire.context),decoded=wire.decodeDraft(draft);
  assert.equal(validateDraft(decoded,canonical),true);assert.throws(()=>wire.decodeDraft(decoded),/wire draft/);
});

// These are transport/ownership preparations for the next live probe, not
// successful model grounding checks. All model responses below are fake.
const livePlan=require('./evaluation/verify-model.cjs');
for(const scenario of livePlan.cases)test('offline live-probe preparation preserves the public source boundary: '+scenario.id,async()=>{
  const {buildCorpus}=require('./data.cjs'),{parseBrief}=require('./brief.cjs'),{matrixFor}=require('./search.cjs');
  const seed=livePlan.readAnchors(),corpus=buildCorpus(seed.rows,{enrichments:seed.enrichments});
  const parsed=parseBrief({message:scenario.message});assert.equal(parsed.needsClarification,false);
  const candidates=scenario.sourceIds.map(id=>{
    const candidate=corpus.candidates.find(c=>c.sourceRecordIds.includes(id));assert.ok(candidate,id+' must resolve to reviewed public identity');
    const evidence=corpus.passages.filter(e=>e.candidateId===candidate.id&&e.attribution==='verified-source'&&e.sourceQuote&&e.reviewedParaphrase);
    assert.ok(evidence.length);assert.ok(evidence.every(e=>e.sourceRecordId.startsWith('public-')));
    const requirementMatrix=matrixFor(candidate,evidence,parsed.brief);
    return {...candidate,evidence,requirementMatrix,gaps:requirementMatrix.filter(r=>!['context','documented'].includes(r.status)),questions:[]};
  });
  const fake=fakeClient(d=>({...d,summary:'Transport-only fixture; source scope is retained for verification.',sections:d.sections.map(s=>({...s,text:'This is a transport-only test response. The recorded material provides a starting point for discussion, while the professional’s exact role, the relevance of that work to the proposed device, and any current clinical activity still need direct confirmation. The cited passage does not by itself establish engagement suitability.'}))}));
  const answer=await createExpertAI({client:fake.client})({kind:scenario.kind,brief:parsed.brief,candidates});
  assert.equal(fake.calls.length,2);assert.equal(answer.provider,'deepseek');
  assert.ok(answer.citations.every(e=>e.sourceRecordId.startsWith('public-')));
  const payload=JSON.parse(fake.calls[0].request.messages[1].content),checker=JSON.parse(fake.calls[1].request.messages[1].content);
  for(const c of payload.candidates)for(const e of c.evidence){assert.ok(e.sourceQuote);assert.ok(e.limitations.length);}
  for(const c of checker.context.candidates)for(const e of c.evidence){assert.ok(e.sourceQuote);assert.ok(e.limitations.length);}
  if(scenario.id==='dermoscopy-study-evidence'){assert.ok(payload.candidates[0].evidence.some(e=>e.dates.sourceDate==='2010-05-11'));assert.ok(payload.candidates[0].evidence.some(e=>e.limitations.some(text=>/coauthorship/i.test(text))));}
  if(scenario.id==='outside-specialist-setting-relationship'){assert.equal(payload.brief.manufacturer,'Check 4 Cancer');assert.ok(payload.candidates[0].evidence.some(e=>e.type==='relationship'));}
});
