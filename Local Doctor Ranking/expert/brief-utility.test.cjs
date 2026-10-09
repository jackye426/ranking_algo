'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBriefInterpreter}=require('./brief.cjs');
const cases=[
 {message:'Haematologists offering video consultations',labels:['Haematologist','video consultations'],absent:[]},
 {message:'Orthopaedic surgeons who speak Portuguese fluently',labels:['Orthopaedic surgeon','Portuguese fluent'],absent:['Surgeon']},
 {message:'Radiologists interested in musculoskeletal imaging',labels:['Radiologist','Musculoskeletal imaging'],absent:['Medical imaging']},
 {message:'Paediatric allergy specialists',labels:['Children','Allergy'],absent:[]},
 {message:'Vascular surgeons with experience in endovascular aneurysm repair',labels:['Vascular surgeon','endovascular aneurysm repair'],absent:['Surgeon']},
];
for(const scenario of cases)for(const failure of ['unconfigured','timeout','malformed'])test(`${failure} preserves explicit granular discovery: ${scenario.message}`,async()=>{
 const client=failure==='unconfigured'?null:{chat:{completions:{create:async()=>{if(failure==='timeout')throw new Error('timeout');return {choices:[{message:{content:'{not valid JSON'}}]};}}}};
 const result=await createBriefInterpreter({client})({message:scenario.message});
 assert.equal(result.needsClarification,false);
 assert.equal(result.interpretationIncomplete,undefined);
 for(const label of scenario.labels)assert(result.brief.requirements.some(r=>r.label===label),`Missing ${label}`);
 for(const label of scenario.absent)assert(!result.brief.requirements.some(r=>r.label===label),`Unexpected broad ${label}`);
 assert(result.brief.requirements.every(r=>r.importance==='focus'),'Ordinary discovery does not invent must-haves');
});
test('specific role constraint, language preference and subsequent removal stay separate',async()=>{
 const interpret=createBriefInterpreter({client:null});
 const first=await interpret({message:'Only orthopaedic surgeons. Speaking Portuguese is preferred.'});
 const role=first.brief.requirements.find(r=>r.label==='Orthopaedic surgeon');
 assert.equal(role.importance,'essential');assert.equal(role.strictRole,true);
 // Use an explicitly supported language phrase, then remove only that language.
 const next=await interpret({previous:first.brief,message:'Speaking Portuguese would be helpful'});
 const language=next.brief.requirements.find(r=>r.kind==='language');assert.equal(language.importance,'preferred');
 const removed=await interpret({previous:next.brief,message:'Remove Portuguese'});
 assert.equal(removed.needsClarification,false);assert(!removed.brief.requirements.some(r=>r.kind==='language'));
 assert.equal(removed.brief.requirements.find(r=>r.label==='Orthopaedic surgeon').strictRole,true);
});
test('specific imaging interest retains its scope through priority and removal instructions',async()=>{
 const interpret=createBriefInterpreter({client:null});
 let result=await interpret({message:'Radiologists interested in musculoskeletal imaging'});
 assert.equal(result.brief.requirements.find(r=>r.label==='Musculoskeletal imaging').matchIntent,'interest');
 result=await interpret({previous:result.brief,message:'Musculoskeletal imaging is optional'});
 assert.equal(result.brief.requirements.find(r=>r.label==='Musculoskeletal imaging').importance,'preferred');
 result=await interpret({previous:result.brief,message:'Remove musculoskeletal imaging'});
 assert(!result.brief.requirements.some(r=>r.kind==='modality'));
 assert(result.brief.requirements.some(r=>r.label==='Radiologist'));
});
test('paediatric allergy is a population plus supplied topic, not a diagnosis or essential credential',async()=>{
 const interpret=createBriefInterpreter({client:null});
 const initial=await interpret({message:'Paediatric allergy specialists'});
 assert.deepEqual(initial.brief.requirements.map(r=>[r.kind,r.label,r.importance]),[['condition','Allergy','focus'],['population','Children','focus']]);
 const revised=await interpret({previous:initial.brief,message:'Remove children'});
 assert.equal(revised.needsClarification,false);assert.deepEqual(revised.brief.requirements.map(r=>r.label),['Allergy']);
});
test('negated clinical expertise still requires clarification and retains the accepted brief',async()=>{
 const interpret=createBriefInterpreter({client:null});
 const initial=await interpret({message:'Radiologists interested in musculoskeletal imaging'});
 const revised=await interpret({previous:initial.brief,message:'They must not have experience in allergy'});
 assert.equal(revised.interpretationIncomplete,true);assert.deepEqual(revised.brief,initial.brief);
});
test('model omission cannot broaden the deterministic specific criteria',async()=>{
 const client={chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({requirements:[]})}}]})}}};
 for(const scenario of cases){const result=await createBriefInterpreter({client})({message:scenario.message});for(const label of scenario.labels)assert(result.brief.requirements.some(r=>r.label===label));}
});
test('reported procedure activity and any available period are different from clinical must-haves',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'Find cataract surgeons with recorded procedure activity. Show any period attached to the figures.'});
 assert.equal(result.needsClarification,false);
 const reported=result.brief.requirements.filter(r=>r.label==='Reported procedure activity');assert.equal(reported.length,1);assert.equal(reported[0].importance,'focus');
 assert(result.brief.requirements.some(r=>r.label==='Cataract surgery'));
 const display=result.brief.requirements.find(r=>r.label==='Reporting periods');assert.equal(display.kind,'workflow');assert.equal(display.importance,'focus');assert.equal(display.text,'Show any period attached to the figures');
 assert(!result.brief.requirements.some(r=>r.kind==='procedure'&&/recorded|activity|period/i.test(r.text)));
 assert(result.brief.requirements.every(r=>r.importance!=='essential'));
});
test('an explicitly requested seven-or-fewer source bucket is represented without inventing a lower bound',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'Find knee surgeons with reported low-volume procedure ranges, including records of seven or fewer.'});
 assert.equal(result.needsClarification,false);
 const range=result.brief.requirements.find(r=>r.label==='Reported range of seven or fewer');assert(range);assert.equal(range.importance,'focus');assert.equal(range.evidence,'records of seven or fewer');
 assert(result.brief.requirements.some(r=>r.label==='Knee surgery'));
 assert(!result.brief.requirements.some(r=>r.kind==='currentPractice'||/positive|at least one|at least seven/i.test(r.text)));
});
test('reported-range priority and removal target the metadata requirement only',async()=>{
 const interpret=createBriefInterpreter({client:null});let result=await interpret({message:'Knee surgeons with records of seven or fewer. This is a search focus.'});
 result=await interpret({previous:result.brief,message:'Reported range of seven or fewer is essential'});
 assert.equal(result.brief.requirements.find(r=>r.label==='Reported range of seven or fewer').importance,'essential');
 result=await interpret({previous:result.brief,message:'Remove reported range of seven or fewer'});
 assert(!result.brief.requirements.some(r=>r.label==='Reported range of seven or fewer'));assert(result.brief.requirements.some(r=>r.label==='Knee surgery'));
});
test('an unspecified low-volume phrase does not invent the seven-or-fewer bucket',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'Find knee surgeons with low-volume procedures'});
 assert(!result.brief.requirements.some(r=>r.label==='Reported range of seven or fewer'));
});

for(const message of ['Product development','Professionals offering product development','Dietitians offering product development'])test(`literal professional service survives interpretation: ${message}`,async()=>{
 const result=await createBriefInterpreter({client:null})({message});
 assert.equal(result.needsClarification,false);
 const service=result.brief.requirements.find(r=>r.kind==='service');assert(service);assert.equal(service.text.toLowerCase(),'product development');assert.equal(service.importance,'focus');
 assert(!result.brief.requirements.some(r=>r.kind==='regulatory'||r.kind==='currentPractice'));
 if(!/dietitians/i.test(message))assert(!result.brief.requirements.some(r=>r.kind==='role'));
});
test('literal service examples do not disappear behind a broad industry request',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'Dietitians offering food-industry services such as product development'});
 assert(result.brief.requirements.some(r=>r.kind==='service'&&r.text==='product development'));
 assert(result.brief.requirements.some(r=>r.kind==='service'&&r.text==='food-industry services'));
});
test('literal service priority and removal preserve the other requested role',async()=>{
 const interpret=createBriefInterpreter({client:null});let result=await interpret({message:'Dietitians offering product development. Recipe development would be helpful.'});
 assert.equal(result.brief.requirements.find(r=>/recipe development/i.test(r.text)).importance,'preferred');
 result=await interpret({previous:result.brief,message:'Remove product development'});
 assert(!result.brief.requirements.some(r=>/product development/i.test(r.text)));assert(result.brief.requirements.some(r=>r.label==='Dietitian'));
});
test('device-version intended users do not become an expert role',async()=>{
 const interpret=createBriefInterpreter({client:null});let result=await interpret({message:'Cardiologists with cardiac CT interests'});
 result=await interpret({previous:result.brief,message:'This version is for general practitioners in primary care'});
 assert.equal(result.needsClarification,false);assert(!result.brief.requirements.some(r=>r.label==='General practitioner'));
 assert(result.brief.requirements.some(r=>r.kind==='workflow'&&r.text==='This version is for general practitioners in primary care'));
 assert(result.brief.requirements.some(r=>r.label==='Cardiologist'));
});
test('explicit general-practitioner discovery remains a role and setting request',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'Find general practitioners in primary care'});
 assert(result.brief.requirements.some(r=>r.label==='General practitioner'));assert(result.brief.requirements.some(r=>r.label==='Primary care'));
});
test('a negated offering never becomes a silently positive service constraint',async()=>{
 const interpret=createBriefInterpreter({client:null}),first=await interpret({message:'Cardiologists'});
 const result=await interpret({previous:first.brief,message:'They must not offer product development'});
 assert.equal(result.interpretationIncomplete,true);assert.deepEqual(result.brief,first.brief);
});
test('required offered services stay essential while device intended users stay context',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'The device is intended for use by GPs. Product development must be essential.'});
 assert.equal(result.needsClarification,false);assert(!result.brief.requirements.some(r=>r.kind==='role'));
 assert.equal(result.brief.requirements.find(r=>r.kind==='service').importance,'essential');
 assert.equal(result.brief.requirements.find(r=>r.kind==='workflow').importance,'focus');
});

test('UK clinical experts describes geography and a generic person, not a clinical subject',async()=>{
 const interpret=createBriefInterpreter({client:null});
 const result=await interpret({message:'Find UK clinical experts for adult cardiac CT software supporting assessment of coronary artery disease.'});
 assert.equal(result.needsClarification,false);assert.equal(result.brief.geography,'UK');
 assert.ok(!result.brief.requirements.some(r=>r.label==='UK clinical'));
 assert.ok(result.brief.requirements.some(r=>r.label==='Cardiac CT'));
 const vague=await interpret({message:'Find UK clinical experts.'});assert.equal(vague.needsClarification,true);
 const based=await interpret({message:'Find UK-based clinical experts.'});assert.equal(based.needsClarification,true);
 assert.ok(!based.brief.requirements.some(r=>/UK-based clinical/i.test(r.text)));
});

test('UK only refines geography without requesting clarification or losing expertise',async()=>{
 const interpret=createBriefInterpreter({client:null}),first=await interpret({message:'Find cardiac CT experts.'});
 const next=await interpret({previous:first.brief,message:'UK only.'});
 assert.equal(next.needsClarification,false);assert.equal(next.brief.geography,'UK');
 assert.equal(next.brief.requirements.find(r=>r.kind==='geography').importance,'essential');
 assert.ok(next.brief.requirements.some(r=>r.label==='Cardiac CT'));
 const removed=await interpret({previous:next.brief,message:'Remove UK.'});
 assert.equal(removed.needsClarification,false);assert.equal(removed.brief.geography,null);
 assert.ok(!removed.brief.requirements.some(r=>r.kind==='geography'||/UK/.test(r.text)));
});

test('model patches cannot turn generic geographic people wording into expertise',async()=>{
 const client={chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({requirements:[{kind:'condition',text:'UK clinical',evidence:'UK clinical',importance:'focus',operation:'add'}]})}}]})}}};
 const result=await createBriefInterpreter({client})({message:'Find UK clinical experts for cardiac CT.'});
 assert.equal(result.needsClarification,false);assert.ok(!result.brief.requirements.some(r=>r.text==='UK clinical'));
});

test('next-week availability remains timing context while the missing expertise is clarified',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'Find someone in the UK who is available next week.'});
 assert.equal(result.needsClarification,true);assert.equal(result.brief.geography,'UK');assert.equal(result.brief.timing,'next week');
 assert.ok(!result.brief.requirements.some(r=>/availability|available next week/i.test(r.label)));
});

test('manufacturer names are not invented device-purpose requirements',async()=>{
 const patch={requirements:[{kind:'technology',text:'Device Company',evidence:'Device Company',importance:'focus',operation:'add'}]};
 for(const client of [null,{chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify(patch)}}]})}}}]){
   const result=await createBriefInterpreter({client})({message:'Find cardiac CT experts. Manufacturer: Example Device Company. Do not infer independence from a missing company mention.'});
   assert.equal(result.needsClarification,false);assert.equal(result.brief.manufacturer,'Example Device Company');
   assert.ok(!result.brief.requirements.some(r=>r.kind==='technology'));
 }
});

test('real software purpose survives beside an explicit device-company manufacturer',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'Manufacturer: Example Device Company. Software analysing cardiac CT.'});
 assert.equal(result.brief.manufacturer,'Example Device Company');
 assert.equal(result.brief.requirements.find(r=>r.kind==='technology').text,'Software analysing cardiac CT');
});

test('clinical words in a manufacturer name do not supply missing requested expertise',async()=>{
 const result=await createBriefInterpreter({client:null})({message:'Find experts. Manufacturer: Cardiac CT Devices.'});
 assert.equal(result.needsClarification,true);assert.equal(result.brief.manufacturer,'Cardiac CT Devices');
 assert.ok(!result.brief.requirements.some(r=>r.label==='Cardiac CT'));
});
