'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCorpus,extractAttributes,classifyPassage}=require('./data.cjs');
const {matrixFor}=require('./search.cjs');
const {blankBrief}=require('./brief.cjs');
const row=about=>({id:'owned-training-fixture',name:'Dr Example Trainer',gmc_number:'1234567',specialty:'General surgery',about,profile_urls:{}});
const fellowship='I have done a fellowship in bariatric (weight loss) surgery at Churchill Hospital Oxford where I have also gained experience in treating complex upper GI cases.';
test('clinical experience recorded during fellowship survives with its training context',()=>{
 const corpus=buildCorpus([row(fellowship)]),p=corpus.passages.find(p=>p.field==='about');
 assert.equal(p.text,fellowship);assert.equal(p.type,'clinical-practice');
 assert.ok(p.qualifiers.includes('clinical-experience-during-training'));
 assert.ok(p.attributes.activity.includes('clinical practice'));
});
test('fellowship subject is not performed activity borrowed from a different clinical object',()=>{
 const corpus=buildCorpus([row(fellowship)]),candidate=corpus.candidates[0];
 const requirement=(id,text)=>({id,kind:'procedure',label:text,text,importance:'focus',matchIntent:'activity'});
 const matrix=matrixFor(candidate,corpus.passages,{...blankBrief(),requirements:[requirement('bariatric','bariatric surgery'),requirement('gi','complex upper GI cases')]});
 assert.notEqual(matrix[0].status,'documented');
 assert.equal(matrix[1].status,'documented');
 assert.ok(matrix[1].evidenceIds.length);
});
test('being highly trained is not a claim of teaching surgeons',()=>{
 const text='Mr Khan continues to treat professional and semi-professional athletes from all disciplines as well as sports & fitness enthusiasts.As a highly trained surgeon and sports arthroscopist (keyhole surgeon) working within a multidisciplinary team, he is particularly apt in avoiding surgery where appropriate.';
 const type=classifyPassage(text,'about'),attributes=extractAttributes(text,{field:'about',type});
 assert.equal(type,'clinical-practice');assert.ok(attributes.population.includes('athletes'));
 assert.ok(!attributes.activity.includes('teaching'));
});
test('explicit teaching and training delivered to surgeons remains teaching',()=>{
 for(const text of ['I train general surgical trainees.','I trained other surgeons in laparoscopic techniques.','He trains junior surgeons.','I teach medical students.']){
  assert.ok(extractAttributes(text,{field:'about',type:classifyPassage(text,'about')}).activity.includes('teaching'),text);
 }
 assert.ok(!extractAttributes('I am a highly trained surgeon.',{field:'about',type:'training'}).activity.includes('teaching'));
});
