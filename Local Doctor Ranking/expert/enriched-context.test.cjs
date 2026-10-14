'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBriefInterpreter,blankBrief}=require('./brief.cjs');
const {matrixFor,directMatch}=require('./search.cjs');
const interpret=createBriefInterpreter({client:null});
const passage=(field,text,type='professional-background')=>({id:'e-test',candidateId:'c-test',sourceRecordId:'test-row',field,text,type,attributes:{},qualifiers:[],dates:{sourceDate:null,observedAt:null,mergeDate:null}});
const matrix=(requirement,p)=>matrixFor({id:'c-test'},[p],{...blankBrief(),requirements:[{id:'r-test',importance:'focus',...requirement}]})[0];
test('simple specialty expertise does not create a duplicate condition',async()=>{
  for(const specialty of ['cardiology','dermatology']){const r=await interpret({message:`Find a ${specialty} expert.`});assert.equal(r.needsClarification,false);assert.equal(r.brief.requirements.length,1);assert.equal(r.brief.requirements[0].kind,'role');}
});
test('literal unfamiliar interests survive offline interpretation without claiming activity',async()=>{
  const r=await interpret({message:'Find experts with interests in exercise guidance & prescription.'});assert.equal(r.needsClarification,false);const q=r.brief.requirements[0];assert.equal(q.text,'exercise guidance & prescription');assert.equal(q.matchIntent,'interest');assert.equal(matrix(q,passage('clinical_interests','Exercise guidance & prescription','clinical-interest')).status,'documented');assert.equal(matrix({...q,kind:'activity',matchIntent:'activity'},passage('clinical_interests','Exercise guidance & prescription','clinical-interest')).status,'potential');
});
test('research interests and dependent compound wording remain intact',async()=>{
  const r=await interpret({message:'Find experts with research interests in liver cirrhosis and its complications.'});assert.equal(r.brief.requirements.length,1);const q=r.brief.requirements[0];assert.equal(q.text,'liver cirrhosis and its complications');assert.equal(q.kind,'research');assert.equal(q.matchIntent,'interest');assert.equal(matrix(q,passage('professional_context.research-interest','Liver cirrhosis and its complications','clinical-interest')).status,'documented');assert.equal(matrix({...q,matchIntent:'research'},passage('professional_context.research-interest','Liver cirrhosis and its complications','clinical-interest')).status,'potential');
});
test('language matches require owned language fields and literal proficiency',async()=>{
  const r=await interpret({message:'Find clinicians who speak Portuguese fluently.'});assert.equal(r.needsClarification,false);const q=r.brief.requirements[0];assert.equal(q.kind,'language');assert.equal(matrix(q,passage('professional_context.language','Portuguese - Fluent')).status,'documented');assert.equal(matrix(q,passage('about','Portuguese - Fluent')).status,'unknown');assert.equal(matrix(q,passage('professional_context.language','Portuguese - Basic')).status,'unknown');
});
test('an explicit language conjunction preserves each requested language',async()=>{
  const r=await interpret({message:'Find cardiologists who speak French and German.'});assert.equal(r.needsClarification,false);assert.deepEqual(r.brief.requirements.filter(q=>q.kind==='language').map(q=>q.text),['French','German']);
  const fluent=await interpret({message:'Find doctors fluent in French and German.'});assert.deepEqual(fluent.brief.requirements.filter(q=>q.kind==='language').map(q=>q.text),['French fluent','German fluent']);
  const scoped=await interpret({message:'Find cardiologists who speak French and research is helpful.'});assert.deepEqual(scoped.brief.requirements.filter(q=>q.kind==='language').map(q=>q.text),['French']);
});
test('unsupported either-language control keeps the accepted search and asks explicitly',async()=>{
  const previous=(await interpret({message:'Find cardiologists.'})).brief;
  const r=await interpret({previous,message:'They must speak French or German.'});assert.equal(r.interpretationIncomplete,true);assert.deepEqual(r.brief,previous);assert.match(r.unresolvedInstructions.join(' '),/either language/i);
});
test('service metadata is not evidence of expertise in home-use technology',()=>{
  const p=passage('professional_context.service','Home chemotherapy');assert.equal(matrix({kind:'service',label:'home chemotherapy service',text:'home chemotherapy service'},p).status,'documented');assert.equal(matrix({kind:'activity',label:'Home chemotherapy',text:'Home chemotherapy',matchIntent:'activity'},p).status,'potential');assert.equal(directMatch({kind:'service',label:'Home chemotherapy'},passage('about','Research into home chemotherapy')),false);
});
test('metadata preferences remain optional and can be removed without historical leakage',async()=>{
  let r=await interpret({message:'Find cardiologists who speak French. French is preferred.'});assert.equal(r.brief.requirements.find(q=>q.kind==='language').importance,'preferred');r=await interpret({previous:r.brief,message:'Remove French from the requirements.'});assert.equal(r.needsClarification,false);assert.ok(!r.brief.requirements.some(q=>q.kind==='language'));assert.ok(!/French/i.test(r.brief.summary));assert.ok(r.brief.requirements.some(q=>q.kind==='role'));
});
test('documented-only is a persistent result control and explicit clearing works',async()=>{
  let r=await interpret({message:'Find cardiac CT reporting experts. Clinical reporting is essential.'});r=await interpret({previous:r.brief,message:'Only options where every essential requirement is documented.'});assert.equal(r.needsClarification,false);assert.equal(r.brief.documentedOnly,true);assert.ok(!r.brief.requirements.some(q=>/options|every essential/.test(q.text)));r=await interpret({previous:r.brief,message:'Remove the documented-only filter.'});assert.equal(r.needsClarification,false);assert.equal(r.brief.documentedOnly,false);assert.ok(r.brief.requirements.some(q=>q.label==='Image interpretation'&&q.importance==='essential'));
});
test('home-use removal preserves expertise and research priority remains editable',async()=>{
  let r=await interpret({message:'Find skin-lesion imaging experts for home use. Research is essential.'});r=await interpret({previous:r.brief,message:'Remove home use from the requirements.'});assert.equal(r.needsClarification,false);assert.ok(!r.brief.requirements.some(q=>q.kind==='setting'));r=await interpret({previous:r.brief,message:'Research should stay optional.'});assert.equal(r.needsClarification,false);assert.equal(r.brief.requirements.find(q=>q.kind==='research').importance,'preferred');
});
test('safety instructions are acknowledged without inventing credentials or changing statuses',async()=>{
  const r=await interpret({message:'Find cardiac CT experts. Manufacturer: Example Device Company. Do not infer independence from a missing company mention.'});assert.equal(r.needsClarification,false);assert.equal(r.brief.manufacturer,'Example Device Company');assert.ok(!r.brief.requirements.some(q=>/independen/i.test(q.label)));assert.match(r.notices.join(' '),/Not reviewed/);
});
test('unknown mandatory instruction retains last accepted scope under model timeout',async()=>{
  const previous=(await interpret({message:'Find cardiac CT experts.'})).brief;const failing=createBriefInterpreter({client:{chat:{completions:{create:async()=>{throw Error('provider timeout');}}}}});const r=await failing({previous,message:'They must hold the XYZZY accreditation.'});assert.equal(r.interpretationIncomplete,true);assert.deepEqual(r.brief,previous);assert.ok(r.unresolvedInstructions.length);
});

test('category removal clears every research requirement including older generic duplicates',async()=>{
 let r=await interpret({message:'Find skin-lesion imaging experts with research experience.'});assert.equal(r.brief.requirements.filter(q=>q.kind==='research').length,1);
 const previous=structuredClone(r.brief);previous.requirements.push({id:'legacy-research',kind:'research',label:'research',text:'research',importance:'essential',matchIntent:'research',evidence:'research'});
 r=await interpret({previous,message:'Remove research from the requirements.'});assert.equal(r.interpretationIncomplete,undefined);assert.ok(!r.brief.requirements.some(q=>q.kind==='research'));assert.ok(r.brief.requirements.some(q=>q.label==='Skin-lesion imaging'));assert.ok(!/research/i.test(r.brief.summary));
});
test('a category priority applies to every research requirement, a named priority stays specific',async()=>{
 let r=await interpret({message:'Find cardiac CT experts. Validation research and diagnostic study evaluation are essential.'});
 r=await interpret({previous:r.brief,message:'Research should be optional.'});assert.ok(r.brief.requirements.filter(q=>q.kind==='research').every(q=>q.importance==='preferred'));
 r=await interpret({previous:r.brief,message:'Validation research is essential.'});assert.equal(r.brief.requirements.find(q=>q.label==='Validation research').importance,'essential');assert.equal(r.brief.requirements.find(q=>q.label==='Diagnostic study evaluation').importance,'preferred');
});
test('a recorded service does not create a second procedure requirement',async()=>{
 const r=await interpret({message:'Find oncology clinicians with a recorded home chemotherapy service.'});assert.equal(r.needsClarification,false);assert.equal(r.brief.requirements.filter(q=>q.kind==='service').length,1);assert.ok(!r.brief.requirements.some(q=>q.kind==='procedure'));assert.ok(r.brief.requirements.some(q=>q.label==='Oncologist'));
});
