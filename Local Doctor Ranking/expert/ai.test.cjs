'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
const {createExpertAI,snapshot,validateDraft,createWireContext,normalizeInlineCitations,composeWireDraft,confirmationPrompt,checkerSystemPrompt,checkerSchema}=require('./ai.cjs');
const brief={version:2,summary:'Cardiac CT clinical scope.',requirements:[{id:'requirement-cardiac-full-id',label:'Cardiac CT',text:'Cardiac CT',kind:'modality',importance:'essential'},{id:'requirement-practice-full-id',label:'Current practice',text:'Current practice',kind:'currentPractice',importance:'essential'}]};
const person=(n=1)=>{const id='expert-profile-canonical-person-'+n;return {id,name:'Dr Example '+n,role:'Radiologist',specialty:'Clinical radiology',evidence:[{id:'evidence-canonical-person-'+n+'-first',candidateId:id,sourceRecordId:'public-source-'+n,text:'The dated record describes cardiac CT and MRI work.',sourceQuote:'cardiac CT and MRI',reviewedParaphrase:true,type:'clinical-practice',field:'public-profile',sourceUrl:'https://example.org/doctor-'+n,dates:{sourceDate:'2010-05-11',observedAt:'2026-10-06'},qualifiers:['historical','reported-current-practice'],review:{limitations:['The combined CT/MRI activity is not a CT-only volume.', 'An undated profile does not confirm current practice.']}}],requirementMatrix:[{requirementId:brief.requirements[0].id,label:'Cardiac CT',status:'documented',evidenceIds:['evidence-canonical-person-'+n+'-first']}],gaps:[{label:'Current practice',importance:'essential',note:'Confirm relevant current activity.'}],questions:[]};};
const prose='The recorded cardiac imaging work provides a reason to explore relevance to this clinical scope. The passage describes CT and MRI together, so it does not establish CT-only activity or a reporting volume. Current work in the pathway and suitability for the particular engagement still require direct confirmation.';
const draftFor=ctx=>({summary:'Recorded imaging work supports further discussion, with current activity still to confirm.',sections:ctx.candidates.map(c=>({candidateId:c.id,text:prose,evidenceIds:[c.evidence[0].id]}))});
const laneDraftFor=ctx=>({sections:ctx.candidates.map(c=>({candidateId:c.id,fact: c.name+' has recorded cardiac CT and MRI work.',relevance:'That imaging experience may inform discussion of the clinical question in this brief.',evidenceIds:[c.evidence[0].id]}))});
const completion=body=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(body)}}]});
function fakeClient(transform=x=>x,check={unsupportedClaims:[]}){const calls=[];return {calls,client:{chat:{completions:{create:async(request,options)=>{calls.push({request,options});return completion(calls.length===1?transform(laneDraftFor(JSON.parse(request.messages[1].content))):check);}}}}};}
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
  ['an alias copied into prose',d=>{d.sections[0].fact='The source c1e1 records related imaging work.';}]
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

function citationInput(count=1){const value=input(count);for(const c of value.candidates)c.evidence.push(...[2,3].map(n=>({...c.evidence[0],id:c.evidence[0].id+'-'+n})));return value;}
test('only owned declared citation brackets are removed and the checker sees the unchanged prose facts',async()=>{
  const fake=fakeClient(d=>{d.sections[0].evidenceIds=['c1e1','c1e2'];d.sections[0].fact='The profile records cardiac imaging [c1e1, c1e2].';d.sections[0].relevance='That may inform the imaging question [c1e1].';return d;});
  const answer=await createExpertAI({client:fake.client})(citationInput());
  assert.equal(answer.provider,'deepseek');assert.equal(fake.calls.length,2);
  assert.equal(answer.sections[0].text,'The profile records cardiac imaging. That may inform the imaging question. Confirm current practice for this engagement.');
  assert.equal(JSON.parse(fake.calls[1].request.messages[1].content).draft.sections[0].text,answer.sections[0].text);
  assert.deepEqual(answer.sections[0].evidenceIds,citationInput().candidates[0].evidence.slice(0,2).map(e=>e.id));
});
for(const [name,text,evidenceIds]of[
  ['foreign','Related imaging [c2e1].',['c1e1']],
  ['undeclared owned','Related imaging [c1e2].',['c1e1']],
  ['unknown','Related imaging [c99e99].',['c1e1']],
  ['prose-bearing','Related imaging [source c1e1].',['c1e1']],
  ['mixed prose','Related imaging [c1e1, reviewed evidence].',['c1e1']],
  ['nested','Related imaging [[c1e1]].',['c1e1']],
  ['semicolon-separated','Related imaging [c1e1; c1e2].',['c1e1','c1e2']],
  ['duplicate','Related imaging [c1e1, c1e1].',['c1e1']],
  ['word-adjacent','Related imaging[c1e1]remains uncertain.',['c1e1']],
  ['bare known','The source c1e1 records imaging.',['c1e1']],
  ['bare unknown','The source c99e99 records imaging.',['c1e1']],
])test('ambiguous or unauthorised '+name+' inline citation fails closed without a support request',async()=>{
  const fake=fakeClient(d=>{d.sections[0].fact=text;d.sections[0].evidenceIds=evidenceIds;return d;});
  const answer=await createExpertAI({client:fake.client})(citationInput(2));assert.equal(answer.provider,'evidence');assert.equal(fake.calls.length,1);assert.equal(answer.failure.stage,'draft-validation');assert.notEqual(answer.failure.reason,'deadline');
});
test('summary aliases cannot be removed using another section’s ownership',async()=>{
  const fake=fakeClient(d=>{d.summary='Imaging is documented [c1e1].';return d;});const answer=await createExpertAI({client:fake.client})(citationInput());assert.equal(answer.provider,'evidence');assert.equal(fake.calls.length,1);assert.equal(answer.failure.reason,'invalid-draft');
});
test('citation normalization is immutable and idempotent; it does not delete bracketed words',()=>{
  const wire=createWireContext(snapshot(citationInput())),raw=draftFor(wire.context);raw.sections[0].text='A quoted phrase [clinical focus] remains intact [c1e1].';const before=structuredClone(raw),normal=normalizeInlineCitations(raw,wire.context);
  assert.deepEqual(raw,before);assert.equal(normal.sections[0].text,'A quoted phrase [clinical focus] remains intact.');assert.deepEqual(normalizeInlineCitations(normal,wire.context),normal);
});

// Recorded Friendli draft shapes are mechanical regression fixtures only.
// A fake checker response here does not endorse their clinical claims.
const diagnosticShapes=[
  {id:'cardiac',summary:'Both clinicians have documented cardiac CT practice, but essential unknowns include current UK activity, coronary artery disease focus, and medical-device assessment experience.',sections:[
    {candidateId:'c1',text:'Dr Neghal Kandiyil’s professional profile records cardiac coronary CT experience and research involvement in vascular radiology and trials [c1e1, c1e2]. This suggests potential relevance to evaluating cardiac CT software, but the evidence does not establish current UK clinical practice, a specific focus on coronary artery disease in adults, or direct medical-device assessment experience; these must be confirmed.',evidenceIds:['c1e1','c1e2']},
    {candidateId:'c2',text:'Dr Sanjay Banypersad’s hospital profile documents cardiac CT and MRI practice and service development [c2e1]. This indicates potential relevance to the device’s clinical context, but the evidence does not verify current UK activity, a dedicated coronary artery disease focus in adults, or medical-device assessment expertise; these are essential unknowns requiring verification.',evidenceIds:['c2e1']}]},
  {id:'dermoscopy',summary:'One candidate has documented skin-lesion imaging and dermatology expertise, but direct primary-care and UK practice, diagnostic-study evaluation, and device-assessment experience require confirmation.',sections:[
    {candidateId:'c1',text:'Dr Paul Norris has documented clinical expertise in dermoscopy for skin cancer diagnosis [c1e1] and was a coauthor on a 2010 primary-care trial protocol evaluating a skin-lesion diagnostic aid, which provides historical context relevant to referral decisions and diagnostic performance [c1e2, c1e3]. The most material unknown is whether his current practice involves primary-care settings or UK geography, and the available evidence does not establish his active competence in diagnostic study evaluation or medical-device assessment.',evidenceIds:['c1e1','c1e2','c1e3']}]},
  {id:'relationship',summary:'One candidate has documented skin-lesion research and a clinical advisory role, but current practice and direct imaging expertise require confirmation.',sections:[
    {candidateId:'c1',text:'Mr Per Hall has documented research interests in dermoscopy, computer imaging, telemedicine and artificial intelligence for skin-cancer detection, including helping non-specialists assess lesions [c1e1]. His professional profile also notes skin lesion assessment and management in clinical practice and a Clinical Advisor for Skin role with the manufacturer Check 4 Cancer [c1e2, c1e3]. The potential relevance is cautious; his research aligns with the device\'s modality and his advisory role with its context, but the evidence does not directly establish hands-on expertise with skin-lesion imaging software or verify his current clinical practice volume. The most material unknown is whether his research and advisory experience translate to a formal, current evaluation of diagnostic software for community use by non-specialists.',evidenceIds:['c1e1','c1e2','c1e3']}]}
];
for(const {id,...draft}of diagnosticShapes)test('recorded '+id+' legacy display shape retains format bounds but is not accepted as a new generation',async()=>{
  const context=snapshot(citationInput(draft.sections.length)),wire=createWireContext(context);
  if(id==='relationship')assert.throws(()=>wire.decodeDraft(draft),/Invalid wire draft/);
  else{const decoded=wire.decodeDraft(draft);assert.ok(decoded.sections.every(s=>!s.text.match(/\bc\d+e\d+\b/)));}
  const fake=fakeClient(()=>structuredClone(draft));const answer=await createExpertAI({client:fake.client})(citationInput(draft.sections.length));assert.equal(answer.provider,'evidence');assert.equal(fake.calls.length,1);assert.equal(answer.failure.reason,'invalid-draft');
});
test('normalizing valid citations never bypasses an independent grounding rejection',async()=>{
  const fake=fakeClient(d=>{d.sections[0].fact+=' [c1e1]';return d;},{unsupportedClaims:['Optional regulatory experience was described as essential.']});
  const answer=await createExpertAI({client:fake.client})(citationInput(2));assert.equal(fake.calls.length,2);assert.equal(answer.provider,'evidence');assert.deepEqual(answer.failure,{stage:'support-validation',reason:'unsupported-claims'});assert.match(answer.notice,/source-evidence check/);assert.doesNotMatch(answer.notice,/time limit|in time/);
});
test('relationship-as-positive-expertise and optional-as-essential are explicit support-check concerns',async()=>{
  const fake=fakeClient();await createExpertAI({client:fake.client})(input());const generation=fake.calls[0].request.messages[0].content,checker=fake.calls[1].request.messages[0].content;
  assert.match(generation,/at most 35 words/);assert.match(generation,/at most 20 words/);assert.match(generation,/Format example only/);assert.match(generation,/solely a relationship to review/);assert.match(checker,/optional requirement must not be described as essential/);assert.match(checker,/not positive evidence of expertise or suitability/);assert.match(checker,/not proof of involvement with this particular device/);
});
test('an overlong explanation is rejected rather than truncated to fit',async()=>{
  const fake=fakeClient(d=>{d.sections[0].fact=Array(36).fill('word').join(' ')+' [c1e1].';return d;});const answer=await createExpertAI({client:fake.client})(input());assert.equal(answer.provider,'evidence');assert.equal(fake.calls.length,1);assert.deepEqual(answer.failure,{stage:'draft-validation',reason:'invalid-draft'});
});
test('failure metadata distinguishes generator JSON failure from a deadline',async()=>{
  const client={chat:{completions:{create:async()=>({choices:[{finish_reason:'stop',message:{content:'not json'}}]})}}};const answer=await createExpertAI({client})(input());assert.deepEqual(answer.failure,{stage:'generation',reason:'invalid-json'});assert.doesNotMatch(answer.notice,/time limit|in time/);
});
test('incomplete output is reported distinctly and never reaches support checking',async()=>{
  let calls=0;const client={chat:{completions:{create:async()=>{calls++;return{choices:[{finish_reason:'length',message:{content:'{}'}}]};}}}};const answer=await createExpertAI({client})(input());assert.equal(calls,1);assert.deepEqual(answer.failure,{stage:'generation',reason:'incomplete-response'});
});
for(const support of [false,true])test((support?'support-check':'generation')+' timeout is identified without exposing the provider error',async()=>{
  let calls=0;const client={chat:{completions:{create:async request=>{calls++;if(support&&calls===1)return completion(laneDraftFor(JSON.parse(request.messages[1].content)));throw Object.assign(new Error('private upstream body must remain private'),{name:'AbortError'});}}}};
  const answer=await createExpertAI({client})(input());assert.deepEqual(answer.failure,{stage:support?'support-check':'generation',reason:'deadline'});assert.match(answer.notice,/time limit/);assert.doesNotMatch(JSON.stringify(answer),/private upstream/);
});
test('malformed support output is not described as an unsupported source claim',async()=>{
  const fake=fakeClient(x=>x,{unsupportedClaims:'none'});const answer=await createExpertAI({client:fake.client})(input());assert.equal(fake.calls.length,2);assert.deepEqual(answer.failure,{stage:'support-validation',reason:'invalid-support-result'});assert.match(answer.notice,/could not be completed/);
});
test('unexpected provider errors expose only bounded stage and reason metadata',async()=>{
  const client={chat:{completions:{create:async()=>{throw Object.assign(new Error('private provider details'),{expertReason:'private provider value'});}}}};const answer=await createExpertAI({client})(input());assert.deepEqual(answer.failure,{stage:'generation',reason:'request-error'});assert.doesNotMatch(JSON.stringify(answer),/private provider/);
});

test('structured generation cannot author a global summary or its own qualification reminder',async()=>{
  for(const change of [d=>{d.summary='An uncited advisory role.';},d=>{d.sections[0].qualification='Regulatory experience is essential.';}]){
    const fake=fakeClient(d=>{change(d);return d;});const answer=await createExpertAI({client:fake.client})(input());assert.equal(answer.provider,'evidence');assert.equal(fake.calls.length,1);assert.equal(answer.failure.reason,'invalid-draft');
  }
});
test('the exact composed display paragraph, including server confirmation, is independently checked',async()=>{
  const fake=fakeClient();const answer=await createExpertAI({client:fake.client})(input(2));const checked=JSON.parse(fake.calls[1].request.messages[1].content);
  assert.equal(answer.summary,'Compare the recorded evidence against the brief.');assert.equal(checked.draft.summary,answer.summary);
  assert.deepEqual(checked.draft.sections.map(s=>s.text),answer.sections.map(s=>s.text));
  assert.ok(answer.sections.every(s=>s.text.endsWith('Confirm current practice for this engagement.')));
  assert.ok(checked.context.candidates.every(c=>c.confirmation==='Confirm current practice for this engagement.'));
  assert.equal(fake.calls[1].request.messages[0].content,checkerSystemPrompt);assert.deepEqual(fake.calls[1].request.response_format.json_schema.schema,checkerSchema);
});
test('server confirmation selects an essential gap, not an earlier optional preference',()=>{
  assert.equal(confirmationPrompt({gaps:[{label:'Regulatory experience',importance:'preferred'},{label:'Home-use validation',importance:'essential'}]}),'Confirm home-use validation for this engagement.');
  assert.equal(confirmationPrompt({gaps:[{label:'Regulatory experience',importance:'preferred'}]}),'Confirm current suitability and availability for this engagement.');
  assert.equal(confirmationPrompt({gaps:[{label:'Long requirement '.repeat(20),importance:'essential'}]}),'Confirm the remaining essential requirements for this engagement.');
});
for(const [lane,limit]of [['fact',35],['relevance',20]])test(lane+' remains bounded independently and is never truncated',async()=>{
  const fake=fakeClient(d=>{d.sections[0][lane]=Array(limit+1).fill('word').join(' ');return d;});const answer=await createExpertAI({client:fake.client})(input());assert.equal(answer.provider,'evidence');assert.equal(fake.calls.length,1);assert.equal(answer.failure.reason,'invalid-draft');
});
test('composed output retains the overall 650-character bound even when individual lanes fit',()=>{
  const context=createWireContext(snapshot(input())).context,raw=laneDraftFor(context);raw.sections[0].fact='a'.repeat(400);raw.sections[0].relevance='b'.repeat(240);assert.throws(()=>composeWireDraft(raw,context),/Invalid composed explanation/);
});
test('the offline verifier decodes the new internal contract to the same canonical display',()=>{
  const context=snapshot(input(2)),wire=createWireContext(context),raw=laneDraftFor(wire.context),composed=wire.composeDraft(raw);
  assert.deepEqual(wire.decodeDraft(raw),wire.decodeDraft(composed));assert.deepEqual(raw.sections.map(s=>Object.keys(s).sort()),raw.sections.map(()=>['candidateId','evidenceIds','fact','relevance']));
});
test('historical year, protocol wording and individual citation survive composition and support checking',async()=>{
  const initial=citationInput(),c=initial.candidates[0];c.evidence[1].text='Dr Example 1 was a named coauthor of the 2010 diagnostic-aid trial protocol.';c.evidence[1].type='research';c.evidence[1].dates.sourceDate='2010-05-11';c.evidence[1].review.limitations=['Historical coauthorship does not establish a performed trial task or current study-appraisal competence.'];
  const fake=fakeClient(d=>{d.sections[0].fact='Dr Example 1 was a named coauthor of the 2010 diagnostic-aid trial protocol.';d.sections[0].relevance='That historical contribution is a starting point for asking about the study context.';d.sections[0].evidenceIds=['c1e2'];return d;});
  const answer=await createExpertAI({client:fake.client})(initial);assert.equal(answer.provider,'deepseek');assert.match(answer.sections[0].text,/2010 diagnostic-aid trial protocol/);assert.deepEqual(answer.sections[0].evidenceIds,[c.evidence[1].id]);
  const checked=JSON.parse(fake.calls[1].request.messages[1].content);assert.equal(checked.context.candidates[0].evidence[0].dates.sourceDate,'2010-05-11');assert.equal(checked.context.candidates[0].evidence[0].limitations[0],c.evidence[1].review.limitations[0]);
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
  const fake=fakeClient(d=>({...d,sections:d.sections.map(s=>({...s,fact:'The supplied passage records a professional activity.',relevance:'That source is a starting point for reviewing relevance to this brief.'}))}));
  const answer=await createExpertAI({client:fake.client})({kind:scenario.kind,brief:parsed.brief,candidates});
  assert.equal(fake.calls.length,2);assert.equal(answer.provider,'deepseek');
  assert.ok(answer.citations.every(e=>e.sourceRecordId.startsWith('public-')));
  const payload=JSON.parse(fake.calls[0].request.messages[1].content),checker=JSON.parse(fake.calls[1].request.messages[1].content);
  for(const c of payload.candidates)for(const e of c.evidence){assert.ok(e.sourceQuote);assert.ok(e.limitations.length);}
  for(const c of checker.context.candidates)for(const e of c.evidence){assert.ok(e.sourceQuote);assert.ok(e.limitations.length);}
  if(scenario.id==='dermoscopy-study-evidence'){assert.ok(payload.candidates[0].evidence.some(e=>e.dates.sourceDate==='2010-05-11'));assert.ok(payload.candidates[0].evidence.some(e=>e.limitations.some(text=>/coauthorship/i.test(text))));}
  if(scenario.id==='outside-specialist-setting-relationship'){assert.equal(payload.brief.manufacturer,'Check 4 Cancer');assert.ok(payload.candidates[0].evidence.some(e=>e.type==='relationship'));}
});
