const test=require('node:test');
const assert=require('node:assert/strict');
const {createQueryInterpreter}=require('./query-interpreter.cjs');
const {updateCriteria}=require('./criteria.cjs');
const request='i have stage 3 endometriosis and i want a specialists who know how to perform excision surgery';
const keep=()=>({operation:'keep',value:null,evidence:null});
const patch=changes=>({topic:keep(),specialty:keep(),procedures:{operation:'keep',values:[],evidence:[]},clinicalContext:keep(),clarification:null,...changes});
const endometriosisPatch=()=>patch({topic:{operation:'set',value:'endometriosis',evidence:'endometriosis'},procedures:{operation:'add',values:['Endometriosis excision'],evidence:['excision surgery']},clinicalContext:{operation:'set',value:'Stage 3 endometriosis',evidence:'stage 3 endometriosis'}});
function fakeClient(responses,calls=[]) {return {chat:{completions:{create:async(body,options)=>{calls.push({body,options});const next=responses.shift();if(next instanceof Error)throw next;return {choices:[{finish_reason:'stop',message:{content:typeof next==='string'?next:JSON.stringify(next)}}]};}}}};}

test('model context paraphrases cannot reverse negation or reduce it to a misleading quoted fragment',async()=>{
  for(const [message,value,evidence,topicEvidence] of [
    ['I have knee pain and physiotherapy has not helped','physiotherapy has helped','physiotherapy has not helped','knee pain'],
    ['I have knee pain and physiotherapy has not helped','helped','helped','knee pain'],
    ['I have knee pain and I have not been diagnosed','I have been diagnosed','I have not been diagnosed','knee pain'],
  ]) {
    const response=patch({topic:{operation:'set',value:'knee pain',evidence:topicEvidence},clinicalContext:{operation:'set',value,evidence}});
    const result=await createQueryInterpreter({client:fakeClient([response])})({message});
    assert.equal(result.mode,'openrouter');assert.equal(result.criteria.topic,'knee pain');
    assert.equal(result.criteria.clinicalContext,message,'the exact original patient wording, including its negation, remains authoritative');
    assert.deepEqual(result.criteria.procedures,[]);
  }
});

test('an unconfirmed diagnosis remains context and cannot be promoted to a clinical topic by fallback or a model',async()=>{
  const message='I have not been diagnosed with endometriosis and my periods are painful';
  const invented=patch({topic:{operation:'set',value:'endometriosis',evidence:'endometriosis'}});
  for(const client of [null,fakeClient([new Error('Unavailable')]),fakeClient([invented])]) {
    const result=await createQueryInterpreter({client})({message});
    assert.equal(result.criteria.topic,'painful periods');assert.equal(result.criteria.clinicalContext,message);
    assert.equal(result.criteria.specialty,null);assert.deepEqual(result.criteria.procedures,[]);
  }
  const unknown=await createQueryInterpreter({client:null})({message:'I have not been diagnosed with endometriosis'});
  assert.equal(unknown.mode,'clarification');assert.equal(unknown.criteria.topic,'');
  const alternative=await createQueryInterpreter({client:null})({message:"I haven't been diagnosed with endometriosis or adenomyosis, but my periods are painful"});
  assert.equal(alternative.criteria.topic,'painful periods');assert.match(alternative.criteria.clinicalContext,/haven't been diagnosed/);
});

test('adding explicit stage preserves earlier goals and requested filters with and without AI',async()=>{
  const context='I have endometriosis and want to return to running';
  const p={...updateCriteria({},'Endometriosis in London accepting Bupa').criteria,procedures:['Endometriosis excision'],clinicalContext:context};
  const response=patch({clinicalContext:{operation:'set',value:'Stage 3 endometriosis',evidence:'stage 3 endometriosis'}});
  for(const client of [null,fakeClient([response])]) {
    const interpret=createQueryInterpreter({client});
    const result=await interpret({previous:p,message:'I have stage 3 endometriosis'});
    assert.notEqual(result.mode,'clarification');assert.equal(result.criteria.topic,'endometriosis');
    assert.equal(result.criteria.clinicalContext,`Stage 3 endometriosis; ${context}`);
    assert.deepEqual(result.criteria.procedures,p.procedures);assert.equal(result.criteria.insurance,'Bupa');assert.equal(result.criteria.location,'London');
    const next=await interpret({previous:result.criteria,message:'Closer to SW5'});
    assert.equal(next.criteria.clinicalContext,result.criteria.clinicalContext);assert.equal(next.criteria.location,'SW5');
  }
  const combined=await createQueryInterpreter({client:null})({message:'I have stage 3 endometriosis and want to return to running'});
  assert.match(combined.criteria.clinicalContext,/^Stage 3 endometriosis;/);assert.match(combined.criteria.clinicalContext,/return to running/);
});

test('common failed-care wording accumulates original history without becoming exclusion or replacing a clinical topic',async()=>{
  const calls=[];const interpret=createQueryInterpreter({client:fakeClient([],calls)});
  const p={...updateCriteria({},'Knee pain in London accepting Bupa').criteria,specialty:'Orthopaedics',procedures:['Knee replacement'],clinicalContext:'I want to return to running'};
  for(const message of ['Physio did not work','Physiotherapy has not helped','Treatment does not help','I tried physiotherapy but it did not help',"I tried physiotherapy but it didn't work"] ) {
    const result=await interpret({previous:p,message});
    assert.equal(result.mode,'deterministic',message);assert.equal(result.criteria.topic,p.topic,message);
    assert.equal(result.criteria.clinicalContext,`${p.clinicalContext}; ${message}`);
    assert.deepEqual(result.criteria.procedures,p.procedures);assert.equal(result.criteria.specialty,p.specialty);
    assert.equal(result.criteria.location,'London');assert.equal(result.criteria.insurance,'Bupa');
  }
  assert.equal(calls.length,0);
  const negativeFilter=await interpret({previous:p,message:'Physio did not work and not Bupa'});
  assert.equal(negativeFilter.mode,'clarification');assert.deepEqual(negativeFilter.criteria,p,'a real unsupported exclusion is still rejected');
});

test('explicit new clinical focus clears old context and oversized narrative asks instead of dropping meaning',async()=>{
  const interpret=createQueryInterpreter({client:null});
  const p={...updateCriteria({},'Knee pain in London accepting Bupa').criteria,clinicalContext:'I want to return to running'};
  const changed=await interpret({previous:p,message:'Switch my clinical search to hip pain instead; I want to return to cycling'});
  assert.equal(changed.criteria.topic,'hip pain');assert.match(changed.criteria.clinicalContext,/cycling/);assert.doesNotMatch(changed.criteria.clinicalContext,/running/);
  assert.equal(changed.criteria.location,'London');assert.equal(changed.criteria.insurance,'Bupa');
  const long=await interpret({previous:p,message:'I have knee pain and want to return to running. '+ 'My symptoms persist. '.repeat(20)+'Physiotherapy did not help.'});
  assert.equal(long.mode,'clarification');assert.deepEqual(long.criteria,p);
});

test('everyday patient context survives fallback, follow-ups and refinement without becoming a treatment',async()=>{
  const interpret=createQueryInterpreter({client:null});
  const first=await interpret({message:'I’m a runner with knee pain and want to get back to running'});
  assert.equal(first.criteria.topic,'knee pain');assert.match(first.criteria.clinicalContext,/runner.*running/);assert.deepEqual(first.criteria.procedures,[]);
  const next=await interpret({previous:first.criteria,message:'Physiotherapy has not helped'});
  assert.notEqual(next.mode,'clarification');assert.equal(next.criteria.topic,'knee pain');assert.deepEqual(next.criteria.procedures,[]);
  assert.match(next.criteria.clinicalContext,/runner/);assert.match(next.criteria.clinicalContext,/Physiotherapy has not helped/);
  const london=await interpret({previous:next.criteria,message:'Closer to London'});
  assert.equal(london.criteria.topic,'knee pain');assert.equal(london.criteria.clinicalContext,next.criteria.clinicalContext);
  const clear=await interpret({previous:london.criteria,removeCriterion:'clinicalContext'});
  assert.equal(clear.criteria.clinicalContext,null);assert.equal(clear.criteria.topic,'knee pain');assert.equal(clear.criteria.location,'London');
});

test('a lack of diagnosis stays patient context, while an explicit negative procedure remains an exclusion',async()=>{
  const interpret=createQueryInterpreter({client:null});
  const result=await interpret({message:'My periods are very painful and I have not been diagnosed'});
  assert.equal(result.criteria.topic,'painful periods');assert.match(result.criteria.clinicalContext,/not been diagnosed/);
  assert.equal(result.criteria.specialty,null);assert.deepEqual(result.criteria.procedures,[]);assert.doesNotMatch(JSON.stringify(result.criteria),/endometriosis|excision/i);
  const exclusion=await interpret({message:'I do not want knee replacement'});
  assert.equal(exclusion.mode,'clarification');assert.deepEqual(exclusion.criteria.procedures,[]);
});

test('AI can normalise a patient concern and retain supplied goals without inventing diagnoses',async()=>{
  const message='I’m a runner with knee pain and want to get back to running';const calls=[];
  const interpreted=patch({topic:{operation:'set',value:'knee pain',evidence:'knee pain'},clinicalContext:{operation:'set',value:'runner with knee pain and want to get back to running',evidence:'runner with knee pain and want to get back to running'}});
  const result=await createQueryInterpreter({client:fakeClient([interpreted],calls)})({message});
  assert.equal(result.mode,'openrouter');assert.equal(result.criteria.topic,'knee pain');assert.deepEqual(result.criteria.procedures,[]);
  assert.match(result.criteria.clinicalContext,/runner.*running/);
  const system=calls[0].body.messages.filter(m=>m.role==='system').map(m=>m.content).join(' ');
  assert.match(system,/Goals and history influence retrieval relevance/);assert.match(system,/never inferred endometriosis/);
});

test('a change of clinical concern clears unrelated goals while an explicit stage remains separately qualified',async()=>{
  const interpret=createQueryInterpreter({client:null});
  const first=await interpret({message:'I’m a runner with knee pain and want to get back to running'});
  const next=await interpret({previous:first.criteria,message:'Reset clinical search to endometriosis'});
  assert.equal(next.criteria.topic,'endometriosis');assert.equal(next.criteria.clinicalContext,null);
  const stage=await interpret({previous:next.criteria,message:'I have stage 3 endometriosis and want to discuss excision surgery'});
  assert.equal(stage.criteria.clinicalContext,'Stage 3 endometriosis');assert.deepEqual(stage.criteria.procedures,['Endometriosis excision']);
  assert.ok(stage.notices.some(n=>/not a verified filter/.test(n)));
});
const previous=()=>({...updateCriteria({},'Endometriosis in London accepting Bupa').criteria,clinicalContext:'Stage 3 endometriosis'});

test('patient narrative becomes explicit endometriosis/excision criteria with stage kept separately',async()=>{
  const calls=[];const interpreter=createQueryInterpreter({client:fakeClient([endometriosisPatch()],calls)});
  assert.equal(interpreter.configured,true);assert.equal(interpreter.provider,'openrouter');assert.equal(interpreter.model,'deepseek/deepseek-v3.2');assert.equal(interpreter.requiresAI({message:request}),true);
  const result=await interpreter({message:request});
  assert.equal(result.mode,'openrouter');assert.equal(result.criteria.topic,'endometriosis');assert.equal(result.criteria.specialty,null);assert.deepEqual(result.criteria.procedures,['Endometriosis excision']);assert.equal(result.criteria.clinicalContext,'Stage 3 endometriosis');
  assert.ok(result.notices.some(notice=>/patient context.*not a verified filter/.test(notice)));
  assert.equal(calls.length,1);const body=calls[0].body;assert.equal(body.response_format.json_schema.strict,true);assert.deepEqual(body.reasoning,{enabled:false});assert.deepEqual(body.provider,{require_parameters:true,data_collection:'deny',sort:'throughput',preferred_max_latency:3,max_price:{prompt:0.6,completion:1.7}});assert.ok(calls[0].options.signal);
  assert.ok(body.response_format.json_schema.schema.properties.procedures.properties.values.items.enum.includes('Endometriosis excision'));
});

test('London, Bupa and distance follow-ups preserve every clinical criterion and avoid paid calls',async()=>{
  const calls=[];const interpreter=createQueryInterpreter({client:fakeClient([endometriosisPatch()],calls)});
  let result=await interpreter({message:request});
  for(const message of ['In London','Only those accepting Bupa','Closer to SW5']) {
    assert.equal(interpreter.requiresAI({previous:result.criteria,message}),false,message);
    result=await interpreter({previous:result.criteria,message});assert.equal(result.mode,'deterministic');assert.equal(result.criteria.topic,'endometriosis');assert.deepEqual(result.criteria.procedures,['Endometriosis excision']);assert.equal(result.criteria.clinicalContext,'Stage 3 endometriosis');
  }
  assert.equal(result.criteria.location,'SW5');assert.equal(result.criteria.insurance,'Bupa');assert.equal(result.criteria.sortByDistance,true);assert.equal(calls.length,1);
});

test('generic excision resolves only from explicit prior endometriosis context',async()=>{
  const interpreter=createQueryInterpreter({client:fakeClient([patch({procedures:{operation:'add',values:['Endometriosis excision'],evidence:['excision surgery']}})])});
  const result=await interpreter({previous:previous(),message:'Those who perform excision surgery'});
  assert.equal(result.mode,'openrouter');assert.deepEqual(result.criteria.procedures,['Endometriosis excision']);assert.equal(result.criteria.clinicalContext,'Stage 3 endometriosis');assert.equal(result.criteria.location,'London');assert.equal(result.criteria.insurance,'Bupa');
  for(const message of ['Find a specialist who performs excision surgery','I need skin excision surgery']) {
    const original=message.includes('skin')?previous():{};
    const rejected=await interpreter({previous:original,message});assert.equal(rejected.mode,'clarification');assert.match(rejected.notices[0],/Which condition/);assert.deepEqual(rejected.criteria.procedures,[]);
  }
});

test('unsupported procedures and disjunctions ask for clarification before any provider call',async()=>{
  const calls=[];const interpreter=createQueryInterpreter({client:fakeClient([],calls)});
  for(const message of ['Those who perform cyberknife treatment','A doctor for cyberknife treatment','Also hip resurfacing','Knee replacement or arthroscopy','Not endometriosis']) {
    const p=previous();const result=await interpreter({previous:p,message});assert.equal(result.mode,'clarification',message);assert.deepEqual(result.criteria,p,message);assert.equal(interpreter.requiresAI({previous:p,message}),false);
  }
  assert.equal(calls.length,0);
});

test('explicit multiple procedures remain AND criteria even if a model omits one',async()=>{
  const p={...updateCriteria({},'knee specialist in London accepting Bupa').criteria,clinicalContext:null};
  const both=patch({procedures:{operation:'add',values:['Knee replacement','Knee arthroscopy'],evidence:['knee replacement','arthroscopy']}});
  // Generic arthroscopy is canonicalised by the deterministic clinical context.
  const calls=[];const interpreter=createQueryInterpreter({client:fakeClient([both,patch({procedures:{operation:'add',values:['Knee replacement'],evidence:['knee replacement']}})],calls)});
  for(let i=0;i<2;i++) {
    const result=await interpreter({previous:p,message:'Also knee replacement and arthroscopy'});
    assert.deepEqual(result.criteria.procedures,['Knee replacement','Knee arthroscopy']);assert.equal(result.criteria.topic,'knee');assert.equal(result.criteria.insurance,'Bupa');
    assert.equal(result.mode,i===0?'openrouter':'deterministic');
  }
});

test('missing key and provider failure preserve explicit stage and requested excision without pretending AI',async()=>{
  for(const interpreter of [createQueryInterpreter({client:null}),createQueryInterpreter({client:fakeClient([new Error('secret provider error')])})]) {
    const result=await interpreter({message:request});assert.equal(result.mode,'deterministic');assert.equal(result.criteria.topic,'endometriosis');assert.deepEqual(result.criteria.procedures,['Endometriosis excision']);assert.equal(result.criteria.clinicalContext,'Stage 3 endometriosis');assert.ok(result.notices.length);assert.doesNotMatch(JSON.stringify(result),/secret provider error/);
  }
});

test('malformed and injected patches cannot rewrite insurance, invent labels or change patient stage',async()=>{
  const malformed=['not json',{...endometriosisPatch(),insurance:null},endometriosisPatch(),endometriosisPatch()];
  malformed[2].procedures.values=['Invented cure'];malformed[3].clinicalContext.value='Stage 4 endometriosis';
  const p=previous();const interpreter=createQueryInterpreter({client:fakeClient(malformed)});
  for(let i=0;i<malformed.length;i++) {
    const result=await interpreter({previous:p,message:request});assert.equal(result.mode,'deterministic');assert.equal(result.criteria.insurance,'Bupa');assert.equal(result.criteria.location,'London');assert.equal(result.criteria.clinicalContext,'Stage 3 endometriosis');assert.deepEqual(result.criteria.procedures,['Endometriosis excision']);
  }
});

test('symptoms cannot become an inferred diagnosis or unasked procedure/specialty',async()=>{
  const diagnosed=patch({topic:{operation:'set',value:'rheumatoid arthritis',evidence:'aching joint'}});
  let interpreter=createQueryInterpreter({client:fakeClient([diagnosed])});let result=await interpreter({message:'I have an aching joint'});
  assert.equal(result.criteria.topic,'aching joint');assert.equal(result.criteria.specialty,null);assert.deepEqual(result.criteria.procedures,[]);assert.equal(result.mode,'deterministic');
  const inferred=patch({topic:{operation:'set',value:'endometriosis',evidence:'endometriosis'},procedures:{operation:'add',values:['Endometriosis excision'],evidence:['endometriosis']}});
  interpreter=createQueryInterpreter({client:fakeClient([inferred])});result=await interpreter({message:'I have endometriosis'});assert.deepEqual(result.criteria.procedures,[]);assert.equal(result.criteria.specialty,null);
});

test('context and topic chip removals bypass AI, while procedure removal retains condition context',async()=>{
  const interpreter=createQueryInterpreter({client:fakeClient([])});const p={...previous(),procedures:['Endometriosis excision']};
  for(const key of ['clinicalContext','topic','procedures']) {
    assert.equal(interpreter.requiresAI({previous:p,removeCriterion:key}),false);
    const result=await interpreter({previous:p,removeCriterion:key});assert.equal(result.mode,'deterministic');assert.equal(result.criteria.clinicalContext,key==='procedures'?p.clinicalContext:null);assert.equal(result.criteria.insurance,'Bupa');
    if(key==='clinicalContext') assert.equal(result.criteria.topic,'endometriosis');
  }
});

test('explicit topic changes clear obsolete context and clinical conflicts preserve last good criteria',async()=>{
  const interpreter=createQueryInterpreter({client:fakeClient([patch({topic:{operation:'set',value:'knee pain',evidence:'knee pain'}})])});
  const result=await interpreter({previous:previous(),message:'Knee pain instead of endometriosis'});assert.equal(result.criteria.topic,'knee pain');assert.equal(result.criteria.clinicalContext,null);assert.equal(result.criteria.location,'London');assert.equal(result.mode,'openrouter');
  const p={...previous(),procedures:['Endometriosis excision']};const conflict=await interpreter({previous:p,message:'Knee pain instead of endometriosis'});assert.equal(conflict.mode,'clarification');assert.deepEqual(conflict.criteria,p);
});

test('a normalized unchanged clinical topic keeps stage context',async()=>{
  const interpreter=createQueryInterpreter({client:fakeClient([patch()])});const p=previous();
  const result=await interpreter({previous:p,message:'I still need help with endometriosis please'});assert.equal(result.criteria.topic,'endometriosis');assert.equal(result.criteria.clinicalContext,'Stage 3 endometriosis');
});

test('stage-only updates stay separate from topic and context removal never clears filters',async()=>{
  const interpreter=createQueryInterpreter({client:null});const p=previous();
  const staged=await interpreter({previous:p,message:'Stage III'});assert.equal(staged.criteria.topic,'endometriosis');assert.equal(staged.criteria.clinicalContext,'Stage 3 endometriosis');
  const removed=await interpreter({previous:p,message:'Remove stage'});assert.equal(removed.criteria.clinicalContext,null);assert.equal(removed.criteria.topic,p.topic);assert.equal(removed.criteria.insurance,p.insurance);
});

test('clinical expertise phrasing does not become a location and patient gender is not a doctor preference',async()=>{
  const interpreter=createQueryInterpreter({client:null});const p={...previous(),location:'SW5'};
  const expertise=await interpreter({previous:p,message:'Find a gynaecologist with experience in endometriosis'});
  assert.equal(expertise.criteria.location,'SW5');assert.equal(expertise.criteria.topic,'endometriosis');assert.equal(expertise.criteria.specialty,'Gynaecology');assert.equal(expertise.criteria.clinicalContext,'Stage 3 endometriosis');
  const patient=await interpreter({message:'I am a woman with stage 3 endometriosis and want a specialist who performs excision surgery in London'});
  assert.equal(patient.criteria.gender,null);assert.equal(patient.criteria.location,'London');assert.equal(patient.criteria.topic,'endometriosis');assert.equal(patient.criteria.clinicalContext,'Stage 3 endometriosis');assert.deepEqual(patient.criteria.procedures,['Endometriosis excision']);
});

test('unsupported specific operations cannot become a loose keyword topic',async()=>{
  const interpreter=createQueryInterpreter({client:null});const p={...previous(),procedures:['Endometriosis excision']};
  for(const message of ['I want bowel resection for endometriosis','I need a specialist for hysterectomy in London','I need a hysterectomy instead','A consultant for polypectomy','I would prefer excision or medical treatment']) {
    const result=await interpreter({previous:p,message});assert.equal(result.mode,'clarification',message);assert.deepEqual(result.criteria,p,message);
  }
  const broad=await interpreter({message:'Find a specialist for endometriosis surgery'});assert.notEqual(broad.mode,'clarification');assert.deepEqual(broad.criteria.procedures,[]);
});

test('explicit removals bypass the model and cannot be undone by an all-keep patch',async()=>{
  const calls=[];const interpreter=createQueryInterpreter({client:fakeClient([patch()],calls)});const p={...previous(),procedures:['Endometriosis excision']};
  for(const message of ['Remove the procedure filter','Any procedure']) {
    assert.equal(interpreter.requiresAI({previous:p,message}),false);const result=await interpreter({previous:p,message});assert.deepEqual(result.criteria.procedures,[]);assert.equal(result.criteria.topic,'endometriosis');
  }
  const cleared=await interpreter({previous:p,message:'Clear the stage context'});assert.equal(cleared.criteria.clinicalContext,null);assert.equal(cleared.criteria.topic,'endometriosis');assert.equal(calls.length,0);
});

test('language alternatives clarify and either-gender language removes that preference',async()=>{
  const interpreter=createQueryInterpreter({client:null});const p={...previous(),gender:'Female',language:'English'};
  const languages=await interpreter({previous:p,message:'English or French speaking please'});assert.equal(languages.mode,'clarification');assert.deepEqual(languages.criteria,p);
  const genders=await interpreter({previous:p,message:'Male or female is fine'});assert.equal(genders.criteria.gender,null);assert.equal(genders.criteria.topic,'endometriosis');assert.equal(genders.criteria.clinicalContext,p.clinicalContext);
});

test('equivalent stage numerals are accepted but the model cannot omit the stage number',async()=>{
  const interpreter=createQueryInterpreter({client:null});const p=previous();
  const equivalent=await interpreter({previous:p,message:'Stage III (stage 3)'});assert.notEqual(equivalent.mode,'clarification');assert.equal(equivalent.criteria.clinicalContext,'Stage 3 endometriosis');
  const bad=endometriosisPatch();bad.clinicalContext.value='Stage endometriosis';
  const rejected=await createQueryInterpreter({client:fakeClient([bad])})({message:request});assert.equal(rejected.mode,'deterministic');assert.equal(rejected.criteria.clinicalContext,'Stage 3 endometriosis');
});

test('common conditions after specialist in remain clinical topics while London stays a place',async()=>{
  const interpreter=createQueryInterpreter({client:null});
  for(const condition of ['migraine','eczema','diabetes','endometriosis']) {
    const result=await interpreter({message:`Find a specialist in ${condition}`});assert.equal(result.criteria.topic,condition);assert.equal(result.criteria.location,null);assert.notEqual(result.mode,'clarification');
  }
  const london=await interpreter({previous:previous(),message:'Find a specialist in London'});assert.equal(london.criteria.location,'London');assert.equal(london.criteria.topic,'endometriosis');
});

test('unfamiliar condition-or-town phrases require interpretation and fail to clarification, not a guessed location',async()=>{
  const input={message:'Find a specialist in amyloidosis'};
  const missing=await createQueryInterpreter({client:null})(input);assert.equal(missing.mode,'clarification');assert.equal(missing.criteria.location,null);
  const interpreter=createQueryInterpreter({client:fakeClient([patch({topic:{operation:'set',value:'amyloidosis',evidence:'amyloidosis'}})])});
  assert.equal(interpreter.requiresAI(input),true);const resolved=await interpreter(input);assert.equal(resolved.mode,'openrouter');assert.equal(resolved.criteria.topic,'amyloidosis');assert.equal(resolved.criteria.location,null);
});

test('historical treatment mentions never implicitly add a procedure requirement',async()=>{
  const interpreter=createQueryInterpreter({client:null});
  const result=await interpreter({message:'I had knee replacement and now have an aching joint'});assert.equal(result.mode,'clarification');assert.deepEqual(result.criteria.procedures,[]);assert.match(result.notices[0],/previous procedure/);
  const condition=await interpreter({message:'Find a specialist for paralysis'});assert.notEqual(condition.mode,'clarification');assert.equal(condition.criteria.topic,'paralysis');
});

test('surgical excision and explicit surgical removal of endometriosis are bounded query aliases',async()=>{
  const interpreter=createQueryInterpreter({client:null});const p={...previous(),location:'SW5'};
  for(const message of ['Find an endometriosis specialist who performs surgical excision','A gynaecologist who can surgically remove endometriosis','A gynaecologist for surgical removal of endometriosis','A gynaecologist who removes endometriosis surgically']) {
    const result=await interpreter({previous:p,message});assert.equal(result.mode,'deterministic',message);assert.equal(result.criteria.topic,'endometriosis',message);assert.deepEqual(result.criteria.procedures,['Endometriosis excision'],message);assert.equal(result.criteria.location,'SW5');assert.equal(result.criteria.insurance,'Bupa');
    if(message.includes('gynaecologist')) assert.equal(result.criteria.specialty,'Gynaecology',message);
  }
});

test('model patches can cite the same explicit surgical-removal wording',async()=>{
  const response=patch({topic:{operation:'set',value:'endometriosis',evidence:'endometriosis'},specialty:{operation:'set',value:'Gynaecology',evidence:'gynaecologist'},procedures:{operation:'add',values:['Endometriosis excision'],evidence:['surgically remove endometriosis']}});
  const result=await createQueryInterpreter({client:fakeClient([response])})({previous:previous(),message:'A gynaecologist who can surgically remove endometriosis'});
  assert.equal(result.mode,'openrouter');assert.equal(result.criteria.specialty,'Gynaecology');assert.deepEqual(result.criteria.procedures,['Endometriosis excision']);assert.equal(result.criteria.insurance,'Bupa');assert.equal(result.criteria.location,'London');
});

test('extra technique requirements clarify instead of silently broadening to generic excision',async()=>{
  const interpreter=createQueryInterpreter({client:null});const p=previous();
  for(const message of ['A gynaecologist who can remove endometriosis through keyhole surgery','Find endometriosis specialists who perform laparoscopic excision']) {
    const result=await interpreter({previous:p,message});assert.equal(result.mode,'clarification');assert.deepEqual(result.criteria,p);assert.match(result.notices[0],/surgical technique/);
  }
});

test('generic removal, ablation and unrelated excision do not imply endometriosis excision',async()=>{
  const interpreter=createQueryInterpreter({client:null});
  for(const message of ['Find a specialist for surgical removal of a mole','Find a doctor for endometriosis ablation','Find a specialist who performs surgical excision']) {
    const result=await interpreter({message});assert.ok(!result.criteria.procedures.includes('Endometriosis excision'),message);
  }
});
