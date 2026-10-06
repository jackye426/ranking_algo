'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseBrief}=require('./brief.cjs');
const {createExpertAI,snapshot,validateDraft}=require('./ai.cjs');
const brief=()=>parseBrief({message:'Cardiac CT for coronary artery disease. Current practice is essential; regulatory experience is optional.'}).brief;
const candidate=id=>({id,name:'Dr '+id,role:'Consultant Radiologist',specialty:'Radiology',evidence:[{id:'proof-'+id,candidateId:id,text:'The source records cardiac CT experience.',sourceRecordId:'public-'+id,field:'public-profile',type:'clinical-practice',dates:{sourceDate:null},qualifiers:[]}],gaps:[{label:'Current practice',importance:'essential',note:'Needs confirmation'}],requirementMatrix:[],questions:[]});
const response=body=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(body)}}]});
const valid=candidates=>({summary:'The recorded imaging experience is relevant; current activity needs confirmation.',sections:candidates.map(c=>({candidateId:c.id,text:'The public profile records cardiac CT experience relevant to the modality in this brief. That is a reason to explore this professional’s clinical perspective. Current work in the specified pathway and experience with the intended patient population still need to be confirmed directly.',evidenceIds:[c.evidence[0].id]}))});

test('a later explicit research preference qualifies an earlier diagnostic-accuracy mention',()=>{
 const b=parseBrief({message:'Skin-lesion imaging software in primary care. Help us examine evidence behind diagnostic accuracy. Experience evaluating diagnostic studies is preferred.'}).brief;
 assert.equal(b.requirements.filter(r=>r.label==='Diagnostic study evaluation').length,1);assert.equal(b.requirements.find(r=>r.label==='Diagnostic study evaluation').importance,'preferred');
});
test('incidental later and follow-up mentions do not promote an explicit preference',()=>{
 let b=parseBrief({message:'Cardiac CT is preferred. We need software expertise about cardiac CT.'}).brief;
 assert.equal(b.requirements.find(r=>r.label==='Cardiac CT').importance,'preferred');b=parseBrief({previous:b,message:'The cardiac CT software supports diagnosis.'}).brief;assert.equal(b.requirements.find(r=>r.label==='Cardiac CT').importance,'preferred');
});
test('research experience and current practice are recognised without adding approval requirements',()=>{
 const b=parseBrief({message:'Skin-lesion imaging outside a specialist clinical setting. Research experience is preferred. Current practice must be confirmed.'}).brief;
 assert.equal(b.requirements.find(r=>r.label==='Clinical research').importance,'preferred');assert.ok(b.requirements.some(r=>r.kind==='currentPractice'));assert.ok(!b.requirements.some(r=>r.kind==='regulatory'));
});
test('manufacturer identity is exact and survives a following sentence and refinement',()=>{
 let b=parseBrief({message:'Skin-lesion imaging software. Manufacturer: Check 4 Cancer. Home-use validation must be confirmed.'}).brief;assert.equal(b.manufacturer,'Check 4 Cancer');b=parseBrief({previous:b,message:'Research experience is preferred.'}).brief;assert.equal(b.manufacturer,'Check 4 Cancer');
});
test('explicit removal is not undone by an incidental mention later in the same message',()=>{
 const old=brief();const b=parseBrief({previous:old,message:'We do not need regulatory experience. Our question is about regulatory experience in the profiles, not a requirement.'}).brief;assert.equal(b.requirements.some(r=>r.kind==='regulatory'),false);
});
test('live pipeline requests exact candidate cardinality and shares its deadline with independent validation',async()=>{
 const candidates=[candidate('one'),candidate('two')],calls=[];const client={chat:{completions:{create:async (request,options)=>{calls.push({request,options});return response(calls.length===1?valid(JSON.parse(request.messages[1].content).candidates):{unsupportedClaims:[]});}}}};
 const result=await createExpertAI({client})({kind:'comparison',brief:brief(),candidates});assert.equal(result.provider,'deepseek');assert.equal(calls.length,2);const schema=calls[0].request.response_format.json_schema.schema;assert.equal(schema.properties.sections.minItems,2);assert.equal(schema.properties.sections.maxItems,2);assert.equal(calls[0].options.signal,calls[1].options.signal);assert.equal(calls[0].request.provider.sort,'latency');assert.equal(calls[1].request.provider.sort,'latency');assert.equal(calls[0].request.provider.data_collection,'deny');assert.ok(calls[0].request.max_tokens<=800);assert.ok(calls[1].request.max_tokens<=200);
});
test('duplicate sections are rejected before a paid support check and sources remain available',async()=>{
 const c=candidate('one');let calls=0;const client={chat:{completions:{create:async request=>{calls++;const draft=valid(JSON.parse(request.messages[1].content).candidates);draft.sections.push({...draft.sections[0]});return response(draft);}}}};const result=await createExpertAI({client})({brief:brief(),candidates:[c]});assert.equal(result.provider,'evidence');assert.equal(result.retryable,true);assert.equal(calls,1);assert.equal(result.citations[0].id,'proof-one');
});
test('independent rejection of overstated coauthorship preserves the honest fallback',async()=>{
 const c=candidate('one'),calls=[];const client={chat:{completions:{create:async request=>{calls.push(request);return response(calls.length===1?valid(JSON.parse(request.messages[1].content).candidates):{unsupportedClaims:['Historical coauthorship does not establish diagnostic-study appraisal competence.']});}}}};const result=await createExpertAI({client})({brief:brief(),candidates:[c]});assert.equal(calls.length,2);assert.equal(result.provider,'evidence');assert.equal(result.retryable,true);assert.match(calls[1].messages[0].content,/Historical coauthorship/);
});
test('an unreasonably long model paragraph is not displayed as a verified answer',()=>{
 const c=candidate('one'),draft=valid([c]);draft.sections[0].text=Array.from({length:91},()=> 'word').join(' ');assert.equal(validateDraft(draft,snapshot({brief:brief(),candidates:[c]})),false);
});


test('compact support check retains the cited scope, date, source quote and requested requirements',async()=>{
 const c=candidate('dated');c.evidence[0].dates.sourceDate='2010-05-11';c.evidence[0].qualifiers=['historical','coauthorship-not-appraisal'];c.evidence[0].sourceQuote='Named coauthor';c.evidence[0].review={limitations:['Historical coauthorship does not establish current study appraisal competence.']};c.evidence[0].reviewedParaphrase=true;c.evidence.push({...c.evidence[0],id:'unrelated-proof',text:'Unrelated professional detail.'});const calls=[];const client={chat:{completions:{create:async request=>{calls.push(request);return response(calls.length===1?valid(JSON.parse(request.messages[1].content).candidates):{unsupportedClaims:[]});}}}};
 const result=await createExpertAI({client})({brief:brief(),candidates:[c]});assert.equal(result.provider,'deepseek');const checked=JSON.parse(calls[1].messages[1].content).context;assert.equal(checked.candidates[0].evidence.length,1);assert.equal(checked.candidates[0].evidence[0].dates.sourceDate,'2010-05-11');assert.deepEqual(checked.candidates[0].evidence[0].qualifiers,['historical','coauthorship-not-appraisal']);assert.equal(checked.candidates[0].evidence[0].sourceQuote,'Named coauthor');assert.deepEqual(checked.candidates[0].evidence[0].limitations,['Historical coauthorship does not establish current study appraisal competence.']);assert.ok(checked.brief.requirements.some(r=>r.label==='Cardiac CT'));assert.ok(checked.candidates[0].gaps.some(g=>g.label==='Current practice'));
});


for(const message of ['Remove regulatory experience but keep cardiac CT.','Remove regulatory experience and keep cardiac CT.','We do not need regulatory experience, retain cardiac CT.','We do not need regulatory experience while still requiring cardiac CT.'])test('removal respects the following keep clause: '+message,()=>{
 const b=parseBrief({previous:brief(),message}).brief;assert.equal(b.requirements.some(r=>r.kind==='regulatory'),false);assert.ok(b.requirements.some(r=>r.label==='Cardiac CT'));
});
test('a coordinated removal still removes both named requirements',()=>{
 const old=parseBrief({message:'Cardiac CT and MRI for coronary artery disease. Regulatory experience is essential.'}).brief;const b=parseBrief({previous:old,message:'Remove regulatory experience and MRI, but keep cardiac CT.'}).brief;assert.equal(b.requirements.some(r=>r.kind==='regulatory'),false);assert.equal(b.requirements.some(r=>r.label==='MRI'),false);assert.ok(b.requirements.some(r=>r.label==='Cardiac CT'));
});
test('preference wording does not cross into a following keep clause',()=>{
 const b=parseBrief({previous:brief(),message:'Prefer research experience but keep cardiac CT.'}).brief;assert.equal(b.requirements.find(r=>r.label==='Cardiac CT').importance,'essential');assert.equal(b.requirements.find(r=>r.label==='Clinical research').importance,'preferred');
});
