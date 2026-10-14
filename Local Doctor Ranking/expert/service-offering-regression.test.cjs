'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBriefInterpreter,blankBrief}=require('./brief.cjs'),{matrixFor}=require('./search.cjs');
const interpret=createBriefInterpreter({client:null});
const requirement={id:'service',kind:'service',text:'ongoing coaching',label:'ongoing coaching',importance:'focus'};
const passage=text=>({id:'source-offer',candidateId:'c',sourceRecordId:'owned',field:'about',text,type:'professional-background',attributes:{},qualifiers:[],sourceUrl:null,dates:{sourceDate:null,observedAt:null}});
const check=p=>matrixFor({id:'c',name:'Laura Hill'},[p],{...blankBrief(),requirements:[requirement]})[0];
for(const message of ['Professionals offering ongoing coaching','Find professionals offering nutrition coaching'])test('explicit service is preserved: '+message,async()=>{
 const result=await interpret({message});assert.equal(result.needsClarification,false);
 assert.ok(result.brief.requirements.some(r=>r.kind==='service'&&/coaching/i.test(r.text)));
 assert.ok(result.brief.requirements.every(r=>r.importance==='focus'));
 assert.ok(!result.brief.requirements.some(r=>r.kind==='procedure'||r.kind==='regulatory'||r.kind==='currentPractice'));
});
test('an owned literal biography offering can support a service without claiming performed care',()=>{
 const p=passage('I also offer one-off sessions, or ongoing coaching if required, to help you achieve your nutrition goals.');
 const result=check(p);assert.equal(result.status,'documented');assert.deepEqual(result.evidenceIds,[p.id]);assert.match(result.note,/offering.*availability/i);
 assert.equal(matrixFor({id:'c'},[p],{...blankBrief(),requirements:[{...requirement,kind:'activity',matchIntent:'activity'}]})[0].status,'potential');
});
test('service offering cannot be inferred from research, a colleague, training or a plan',()=>{
 for(const text of ['Research into ongoing coaching.','My colleague offers ongoing coaching.','We offer ongoing coaching.','I plan to offer ongoing coaching.','I trained to offer ongoing coaching.','I do not offer ongoing coaching.','I received ongoing coaching during training.'])assert.equal(check(passage(text)).status,'unknown',text);
});
test('negated required service instructions retain prior accepted expertise',async()=>{
 const previous=(await interpret({message:'Cardiologists'})).brief;
 const result=await interpret({previous,message:'They must not offer ongoing coaching'});assert.equal(result.interpretationIncomplete,true);assert.deepEqual(result.brief,previous);
});
test('removing an offered service preserves the separate requested profession',async()=>{
 const first=await interpret({message:'Dietitians offering ongoing coaching'});
 const result=await interpret({previous:first.brief,message:'Remove ongoing coaching'});
 assert.equal(result.needsClarification,false);assert.ok(!result.brief.requirements.some(r=>r.kind==='service'));
 assert.ok(result.brief.requirements.some(r=>r.label==='Dietitian'));
});
