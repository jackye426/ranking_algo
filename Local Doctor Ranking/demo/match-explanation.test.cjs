const test=require('node:test');
const assert=require('node:assert/strict');
const {explanationSnapshot,createMatchExplainer,validateDraft,evidenceFallback}=require('./match-explanation.cjs');
const criteria={topic:'knee pain',specialty:'Orthopaedics',procedures:['Knee replacement'],location:'SW5',insurance:'Bupa',radiusMiles:20,sortByDistance:true,language:'French',gender:null};
const result={id:'private-record-id',name:'Mr Timothy Waters',specialty:'Consultant Orthopaedic Surgeon',evidenceUrl:'/sources/record',description:'PRIVATE RAW DESCRIPTION',insuranceEvidence:[{insurer:'Bupa',text:'Bupa recognition; not fee assured.'}],personalizedMatch:{summary:'Recorded knee replacement expertise, documented Bupa recognition and a practice near SW5.',citations:[
  {id:'old1',text:'Total knee replacement is listed.',sourceUrl:'/sources/record',criterion:'Knee replacement'},
  {id:'old2',text:'Bupa recognition; not fee assured.',sourceUrl:'https://www.finder.bupa.co.uk/record',criterion:'Bupa'},
  {id:'old3',text:'Spire practice is approximately 11.5 miles from SW5 by straight line.',sourceUrl:'/sources/record',criterion:'Location'},
],caveats:[]}};
const draft={summary:'Recorded knee replacement work fits your request, with a Spire practice approximately 11.5 miles from SW5 in a straight line. Bupa recognition is documented, but the consultant is not fee assured.',reasons:[{title:'Relevant recorded practice',text:'The profile lists total knee replacement, matching your requested procedure.',evidenceIds:['e1']},{title:'Your insurer',text:'Bupa recognition is documented, but the consultant is not fee assured.',evidenceIds:['e2']},{title:'Practice location',text:'The recorded Spire practice is approximately 11.5 miles from SW5 by straight line.',evidenceIds:['e3']}]};
function clientFor(responses,calls=[]) {return {responses:{create:async(body,options)=>{calls.push({body,options});const next=responses.shift();if(next instanceof Error) throw next;return {status:'completed',output_text:JSON.stringify(next)};}}};}

test('saved evidence is immutable and retains insurance and procedure caveats',()=>{
  const saved=explanationSnapshot(criteria,result);
  assert.ok(Object.isFrozen(saved));assert.ok(Object.isFrozen(saved.criteria));assert.ok(Object.isFrozen(saved.criteria.procedures));
  assert.equal(saved.citations[0].id,'e1');assert.ok(saved.caveats.some(c=>/not fee assured/.test(c)));assert.ok(saved.caveats.some(c=>/current availability/.test(c)));assert.ok(saved.caveats.some(c=>/does not guarantee coverage/.test(c)));
  assert.equal(saved.description,undefined);assert.equal(saved.name,undefined);
  assert.deepEqual(saved.consultant,{name:'Mr Timothy Waters',specialty:'Consultant Orthopaedic Surgeon'});
  assert.ok(saved.citations.some(c=>c.criterion==='Consultant identity'&&c.sourceUrl==='/sources/record'));
});

test('AI writes prose from full criteria and sources, then support check validates it',async()=>{
  const calls=[];const explain=createMatchExplainer({client:clientFor([draft,{unsupportedClaims:[]}],calls),provider:'openai',model:'test-model'});
  const saved=explanationSnapshot(criteria,result);const answer=await explain(saved);
  assert.equal(answer.provider,'openai');assert.equal(answer.summary,draft.summary);assert.deepEqual(answer.caveats,saved.caveats);assert.equal(answer.retryable,false);assert.equal(calls.length,2);
  assert.ok(answer.summary.length<=800);assert.ok(answer.reasons.length<=4);assert.ok(answer.reasons.every(reason=>reason.text.length<=320));assert.match(answer.summary,/not fee assured/);
  const request=JSON.parse(calls[0].body.input);assert.deepEqual(request.searchPreferences,criteria);assert.equal(request.evidence[0].text,result.personalizedMatch.citations[0].text);
  assert.equal(request.consultant.name,'Mr Timothy Waters');assert.equal(request.clinicalContextIsUserProvided,true);
  for(const call of calls) {assert.equal(call.body.store,false);assert.equal(call.body.text.format.strict,true);assert.ok(call.options.signal);assert.doesNotMatch(call.body.input,/PRIVATE RAW DESCRIPTION|private-record-id/);}
});

test('OpenRouter receives strict structured output and no-data-collection routing',async()=>{
  const calls=[];const responses=[draft,{unsupportedClaims:[]}];
  const client={chat:{completions:{create:async(body)=>{calls.push(body);return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(responses.shift())}}]};}}}};
  const explain=createMatchExplainer({client,provider:'openrouter',model:'deepseek/deepseek-v3.2'});
  const answer=await explain(explanationSnapshot(criteria,result));
  assert.equal(answer.provider,'openrouter');assert.equal(calls.length,2);
  assert.equal(calls[0].response_format.json_schema.strict,true);assert.deepEqual(calls[0].provider,{require_parameters:true,data_collection:'deny',sort:'throughput',preferred_max_latency:3,max_price:{prompt:0.6,completion:1.7}});assert.equal(calls[1].provider.sort,'latency');assert.deepEqual(calls[1].provider.max_price,calls[0].provider.max_price);assert.equal(calls[0].model,'deepseek/deepseek-v3.2');assert.deepEqual(calls[0].reasoning,{enabled:false});assert.equal(explain.model,'deepseek/deepseek-v3.2');
});

test('timing reports only phase metadata and cannot change generation or validation',async()=>{
  const timings=[];const explain=createMatchExplainer({client:clientFor([draft,{unsupportedClaims:[]}]),provider:'openai'});
  const answer=await explain(explanationSnapshot(criteria,result),{onTiming:event=>{timings.push(event);throw new Error('Observer failed');}});
  assert.equal(answer.provider,'openai');assert.deepEqual(timings.map(t=>t.phase),['draft','check']);
  for(const timing of timings) {
    assert.deepEqual(Object.keys(timing).sort(),['attempt','durationMs','outcome','phase']);
    assert.equal(timing.attempt,1);assert.equal(timing.outcome,'ok');assert.ok(Number.isFinite(timing.durationMs)&&timing.durationMs>=0);
  }
});

test('missing key is explicitly sourced evidence, with no pretend AI or provider call',async()=>{
  const answer=await createMatchExplainer({client:null})(explanationSnapshot(criteria,result));
  assert.equal(answer.provider,'evidence');assert.equal(answer.retryable,false);assert.match(answer.notice,/not configured/);assert.ok(answer.citations.length);assert.ok(answer.caveats.length);
});

test('invented citation IDs and unsupported guarantees or numbers never reach the client',async()=>{
  const invalid=[{...draft,reasons:[{...draft.reasons[0],evidenceIds:['invented']}]},{...draft,summary:'This is the best surgeon with guaranteed results.'},{...draft,summary:'The practice is 2.7 miles away.'}];
  for(const proposed of invalid) {
    const calls=[];const answer=await createMatchExplainer({client:clientFor([proposed],calls),provider:'openai'})(explanationSnapshot(criteria,result));
    assert.equal(answer.provider,'evidence');assert.match(answer.notice,/could not be fully checked/);assert.equal(answer.retryable,true);assert.equal(calls.length,2);assert.doesNotMatch(JSON.stringify(answer),/invented|best surgeon|2\.7/);
  }
});

test('valid IDs do not bypass semantic support checking',async()=>{
  const answer=await createMatchExplainer({client:clientFor([draft,{unsupportedClaims:['The proposed clinical claim does not follow from its cited evidence.']}]),provider:'openai'})(explanationSnapshot(criteria,result));
  assert.equal(answer.provider,'evidence');assert.match(answer.notice,/could not be fully checked/);assert.equal(answer.retryable,true);
});

test('one source-check repair gets the original evidence and concrete feedback, then must pass the same check',async()=>{
  const saved=explanationSnapshot(criteria,result);const calls=[];
  const claims=['The sentence calling this the nearest practice is not supported by the cited distance fact.'];
  const answer=await createMatchExplainer({client:clientFor([draft,{unsupportedClaims:claims},draft,{unsupportedClaims:[]}],calls),provider:'openai'})(saved);
  assert.equal(answer.provider,'openai');assert.equal(calls.length,4);
  const initial=JSON.parse(calls[0].body.input);const repaired=JSON.parse(calls[2].body.input);
  assert.deepEqual(repaired.evidence,initial.evidence);assert.deepEqual(repaired.searchPreferences,initial.searchPreferences);
  assert.deepEqual(repaired.repair.feedback,claims);assert.deepEqual(repaired.repair.previousDraft,draft);
  assert.doesNotMatch(initial.groundedStartingPoint,/nearest|11\.5/);
  assert.equal(calls[1].body.instructions,calls[3].body.instructions);
  assert.ok(calls.every(call=>call.options.signal===calls[0].options.signal));
  assert.match(calls[1].body.instructions,/compare supplied searchPreferences with a cited profile fact/);
});

test('an invalid local draft can be repaired once, but its rejected words are never returned',async()=>{
  const bad={...draft,reasons:[{...draft.reasons[0],text:'Robotic surgery provides a high level of precision.'}]};
  const calls=[];const saved=explanationSnapshot(criteria,result);
  const answer=await createMatchExplainer({client:clientFor([bad,draft,{unsupportedClaims:[]}],calls),provider:'openai'})(saved);
  assert.equal(answer.provider,'openai');assert.equal(calls.length,3);assert.doesNotMatch(JSON.stringify(answer),/precision/);
  assert.match(JSON.parse(calls[1].body.input).repair.feedback[0],/Remove technique-benefit/);
});

test('a second failed check stops at four calls and never relaxes to the rejected AI paragraph',async()=>{
  const calls=[];const checked={unsupportedClaims:['The supplied facts do not establish this claim.']};
  const saved=explanationSnapshot(criteria,result);
  const answer=await createMatchExplainer({client:clientFor([draft,checked,draft,checked,draft,{unsupportedClaims:[]}],calls),provider:'openai'})(saved);
  assert.equal(calls.length,4);assert.equal(answer.provider,'evidence');assert.equal(answer.summary,saved.summary);
  assert.equal(answer.retryable,true);assert.doesNotMatch(JSON.stringify(answer),/do not establish this claim/);
});

test('support check accepts only an exact empty unsupported-claims array',async()=>{
  for(const checked of [{supported:false},{supported:true},{unsupportedClaims:[],supported:false},{unsupportedClaims:null},{unsupportedClaims:['Unsupported nearest practice claim.']},{}]) {
    const answer=await createMatchExplainer({client:clientFor([draft,checked]),provider:'openai'})(explanationSnapshot(criteria,result));
    assert.equal(answer.provider,'evidence');assert.equal(answer.retryable,true);
  }
});

test('distance cannot lose its approximation or straight-line qualifier or acquire nearest',()=>{
  const saved=explanationSnapshot(criteria,result);
  for(const text of ['The practice is 11.5 miles from SW5.','The practice is approximately 11.5 miles from SW5.','The practice is 11.5 miles from SW5 in a straight line.','The nearest practice is approximately 11.5 miles from SW5 in a straight line.']) {
    assert.equal(validateDraft({...draft,summary:text},saved),false);
    assert.equal(validateDraft({...draft,reasons:[{...draft.reasons[2],text}]},saved),false);
  }
  assert.equal(validateDraft(draft,saved),true);
});

test('procedure listings cannot acquire benefits or inferred experience even if the model checker approves',async()=>{
  const saved=explanationSnapshot(criteria,result);
  for(const text of ['Robotic surgery can offer a high level of precision during the operation.','This leads to faster recovery and less pain.','This consultant has experience with knee replacement.']) {
    const proposed={...draft,reasons:[{...draft.reasons[0],text}]};
    assert.equal(validateDraft(proposed,saved),false);
    const calls=[];
    const answer=await createMatchExplainer({client:clientFor([proposed,{unsupportedClaims:[]}],calls),provider:'openai'})(saved);
    assert.equal(answer.provider,'evidence');assert.equal(calls.length,2);
  }
  assert.equal(validateDraft({...draft,reasons:[{...draft.reasons[0],title:'Experience with knee replacement'}]},saved),false);
});

test('provider timeout or failure returns retryable evidence and never exposes errors or credentials',async()=>{
  const answer=await createMatchExplainer({client:clientFor([new Error('SECRET api key provider detail')]),provider:'openai'})(explanationSnapshot(criteria,result));
  assert.equal(answer.provider,'evidence');assert.equal(answer.retryable,true);assert.match(answer.notice,/temporarily unavailable/);assert.doesNotMatch(JSON.stringify(answer),/SECRET/);
});

test('overlong generated prose is rejected intact rather than silently truncated',async()=>{
  const saved=explanationSnapshot(criteria,result);
  const overlong=[
    {...draft,summary:(draft.summary+' ').repeat(6)},
    {...draft,reasons:[{...draft.reasons[0],text:(draft.reasons[0].text+' ').repeat(6)}]},
    {...draft,reasons:[{...draft.reasons[0],title:'Recorded clinical practice relevant to your requested knee replacement procedure'}]},
    {...draft,reasons:[...draft.reasons,{...draft.reasons[0]},{...draft.reasons[0]}]},
  ];
  for(const proposed of overlong) {
    assert.equal(validateDraft(proposed,saved),false);
    const calls=[];const answer=await createMatchExplainer({client:clientFor([proposed],calls),provider:'openai'})(saved);
    assert.equal(answer.provider,'evidence');assert.equal(answer.summary,saved.summary);assert.equal(calls.length,2);assert.deepEqual(answer.caveats,saved.caveats);
  }
});

test('concise output preserves source-supported fit and the material exception without changing text',async()=>{
  const saved=explanationSnapshot(criteria,result);
  assert.equal(validateDraft(draft,saved),true);
  const answer=await createMatchExplainer({client:clientFor([draft,{unsupportedClaims:[]}]),provider:'openai'})(saved);
  assert.equal(answer.summary,draft.summary);assert.deepEqual(answer.reasons,draft.reasons);
  assert.match(answer.summary,/knee replacement/);assert.match(answer.summary,/11\.5 miles from SW5/);assert.match(answer.summary,/Bupa.*not fee assured/);
  assert.deepEqual(answer.caveats,saved.caveats);assert.ok(answer.citations.every(c=>saved.citations.some(original=>original.id===c.id&&original.text===c.text)));
});

const endoCriteria={topic:'endometriosis',location:'London',clinicalContext:'Stage 3 endometriosis'};
const endoResult={name:'Dr Example',specialty:'Consultant Gynaecologist',evidenceUrl:'/sources/endo',insuranceEvidence:[],
  clinicalInterests:['Laparoscopic excision of endometriosis +/- ureterolysis'],personalizedMatch:{summary:'Old technical text',citations:[
    {text:'Profile lists: Laparoscopic excision of endometriosis +/- ureterolysis',sourceUrl:'/sources/endo',criterion:'endometriosis'},
    {text:'Laparoscopic excision of endometriosis +/- ureterolysis',sourceUrl:'/sources/endo',criterion:'Profile expertise'},
    {text:'Spire Example Hospital is approximately 19.3 miles from London by straight line.',sourceUrl:'/sources/endo',criterion:'Location'},
  ],caveats:[]}};

test('duplicate procedure facts collapse across labels and NHS definitions remain separate from profile facts',()=>{
  const saved=explanationSnapshot(endoCriteria,endoResult);
  assert.equal(saved.citations.filter(c=>c.kind==='profile'&&/excision/.test(c.text)).length,1);
  const terms=saved.citations.filter(c=>c.kind==='terminology');assert.equal(terms.length,2);
  assert.ok(terms.every(c=>new URL(c.sourceUrl).hostname.endsWith('nhs.uk')));
  assert.ok(terms.every(c=>c.appliesTo.includes(saved.citations[0].id)));
  assert.equal(saved.criteria.clinicalContext,'Stage 3 endometriosis');assert.match(saved.contextCaveat,/does not confirm/);
});

test('the deterministic fallback explains the procedure in plain English and preserves unverified stage context',()=>{
  const saved=explanationSnapshot(endoCriteria,endoResult);
  const answer=evidenceFallback(saved,'Test fallback');
  assert.match(answer.summary,/Dr Example.*gynaecologist/);
  assert.match(answer.summary,/keyhole surgery to remove endometriosis tissue/);
  assert.match(answer.summary,/19\.3 miles from London/);
  assert.match(answer.summary,/stage 3.*does not confirm experience/i);
  assert.doesNotMatch(answer.summary,/\+\/-|ureterolysis|Profile lists:|Old technical text/);
  assert.ok(answer.summary.length<=800);assert.ok(answer.summary.split(/\s+/).length>=60);
  assert.equal(answer.provider,'evidence');assert.ok(answer.reasons[0].evidenceIds.some(id=>id.startsWith('term-')));
  assert.ok(answer.citations.some(c=>/ureterolysis/.test(c.text)),'full original wording is retained for source inspection');
});

test('a longer patient paragraph with paired terminology citations is accepted unchanged',async()=>{
  const saved=explanationSnapshot(endoCriteria,endoResult);
  const clinical=saved.citations.find(c=>c.criterion==='endometriosis');
  const identity=saved.citations.find(c=>c.criterion==='Consultant identity');
  const location=saved.citations.find(c=>c.criterion==='Location');
  const terms=saved.citations.filter(c=>c.kind==='terminology');
  const paragraph={summary:'Dr Example is a consultant gynaecologist whose profile lists keyhole surgery to remove endometriosis tissue. This gives you a specific area of practice to discuss when looking for endometriosis care, without assuming that surgery is the right treatment for you. The listed Spire practice is about 19.3 miles from London in a straight line. You mentioned stage 3, but the profile does not confirm experience with that stage.',reasons:[
    {title:'Clinical role and relevant practice',text:'The profile names a consultant gynaecologist and lists keyhole surgery to remove endometriosis tissue.',evidenceIds:[identity.id,clinical.id,...terms.map(c=>c.id)]},
    {title:'Practice location',text:'The listed Spire practice is approximately 19.3 miles from London in a straight line.',evidenceIds:[location.id]},
  ]};
  assert.ok(paragraph.summary.length>320);assert.ok(paragraph.summary.length<=800);assert.equal(validateDraft(paragraph,saved),true);
  const answer=await createMatchExplainer({client:clientFor([paragraph,{unsupportedClaims:[]}]),provider:'openai'})(saved);
  assert.equal(answer.provider,'openai');assert.equal(answer.summary,paragraph.summary);
});

test('stage-specific expertise cannot be borrowed from the patient context or severe-condition labels',()=>{
  const saved=explanationSnapshot(endoCriteria,{...endoResult,clinicalInterests:['Severe Endometriosis']});
  const clinical=saved.citations[0];
  const goodReason={title:'Listed condition',text:'Endometriosis appears in the profile.',evidenceIds:[clinical.id]};
  for(const summary of ['Dr Example has experience treating stage 3 endometriosis. The profile is not a guarantee of availability.','Dr Example has stage 3 expertise, matching your needs.','The profile lists endometriosis and the practice is 19.3 miles from London.']) {
    assert.equal(validateDraft({summary,reasons:[goodReason]},saved),false);
  }
});

test('a general NHS definition alone cannot support a claim about a named consultant',()=>{
  const saved=explanationSnapshot({topic:'endometriosis'},endoResult);
  const term=saved.citations.find(c=>c.kind==='terminology');
  const unrelated=saved.citations.find(c=>c.criterion==='Consultant identity');
  const proposed={summary:'Dr Example performs keyhole surgery.',reasons:[{title:'Keyhole surgery',text:'This consultant performs keyhole surgery.',evidenceIds:[term.id]}]};
  assert.equal(validateDraft(proposed,saved),false);
  proposed.reasons[0].evidenceIds.push(unrelated.id);assert.equal(validateDraft(proposed,saved),false);
});

test('billing notation and unexplained source-label dumps are rejected before the support check',()=>{
  const saved=explanationSnapshot({topic:'endometriosis'},endoResult);
  for(const summary of ['Profile lists: Laparoscopic excision +/- ureterolysis.','The consultant lists procedure Q1234.']) {
    assert.equal(validateDraft({summary,reasons:[{title:'Practice',text:'Endometriosis is listed.',evidenceIds:[saved.citations[0].id]}]},saved),false);
  }
});

test('identity can be supported directly without duplicating it in clinical reasons',async()=>{
  const saved=explanationSnapshot({topic:'endometriosis'},endoResult);
  const clinical=saved.citations.find(c=>c.criterion==='endometriosis');
  const terms=saved.citations.filter(c=>c.kind==='terminology');
  const proposed={summary:'Dr Example is a consultant gynaecologist whose profile includes keyhole surgery to remove endometriosis tissue. That is a relevant area of practice to discuss when looking for endometriosis care.',reasons:[
    {title:'Relevant practice',text:'The profile includes keyhole surgery to remove endometriosis tissue.',evidenceIds:[clinical.id,...terms.map(c=>c.id)]},
  ]};
  const calls=[];
  const answer=await createMatchExplainer({client:clientFor([proposed,{unsupportedClaims:[]}],calls),provider:'openai'})(saved);
  assert.equal(answer.provider,'openai');assert.equal(answer.summary,proposed.summary);
  assert.ok(!proposed.reasons.some(r=>r.evidenceIds.includes(saved.citations.find(c=>c.criterion==='Consultant identity').id)));
  for(const {body} of calls) {
    assert.match(body.instructions,/exact consultant name and specialty may be supported directly by the supplied consultant identity/);
    assert.match(body.instructions,/exception covers identity only; a specialty must never establish procedure experience or suitability/);
  }
  assert.match(calls[1].body.instructions,/every clinical and practical summary claim follows from those reasons/);
});
