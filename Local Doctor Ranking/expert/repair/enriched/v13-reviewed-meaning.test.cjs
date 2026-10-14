'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCorpus,classifyPassage,extractAttributes}=require('../../data.cjs');
const passages=about=>buildCorpus([{id:'synthetic-v13',name:'Alex Example',gmc_number:'1234567',about}]).passages;

test('literal online eating-disorder support is activity without inferred treatment or credentials',()=>{
 const support='I provide online 1:1 support for individuals with looking for guidance around improving their relationship with food and for those with diagnosed eating disorders.';
 const source=`My name is Alex Example. ${support} My approach to eating disorder support is rooted in compassion.`;
 assert.equal(classifyPassage(support,'about'),'clinical-practice');
 const match=passages(source).find(p=>p.text===support);
 assert.ok(match,JSON.stringify(passages(source)));
 assert.equal(match.type,'clinical-practice');
 assert.ok(!match.qualifiers.includes('stated-interest'));
 assert.equal(classifyPassage('I am interested in providing online 1:1 support for diagnosed eating disorders.','about'),'clinical-interest');
});

test('corrupted stress-echo claim does not become performed clinical diagnosis',()=>{
 const claim='He has also shown the added value of assessing carotid atherosclerosis during stress echo for daignosis and prognosis of caoronary artery disease.Recently he led UK hospitals to demonstarte tha initial medical therapy in pts with newly diagnosed coronary artery disease is as eefective as coronary intervention-published in NEJM-world\'s leading medical journal.';
 assert.equal(classifyPassage(claim,'about'),'professional-background');
 assert.ok(!extractAttributes(claim,{field:'about',type:'professional-background'}).activity.includes('clinical practice'));
});

test('literal Core-Lab study work and major clinical trial leadership stay separate as research',()=>{
 const study='He provided Core – Lab function for MRC sponsored study in Hibernating Myocardium.';
 const trial='He now leads a major clinical trial in coronary artery disease.';
 assert.equal(classifyPassage(study,'about'),'research');
 assert.equal(classifyPassage(trial,'about'),'research');
 const found=passages(`He has also shown the added value of assessing carotid atherosclerosis during stress echo for daignosis and prognosis of caoronary artery disease. ${study} ${trial}`);
 assert.ok(found.some(p=>p.type==='research'&&p.text.includes(study)&&p.text.includes(trial)),JSON.stringify(found));
 assert.ok(!found.some(p=>p.type==='clinical-practice'));
});

test('HIFU and cryotherapy passage does not introduce MRI or diagnostic ultrasound',()=>{
 const source='Mr Arya is currently one of the largest volume prostate HIFU and cryotherapy surgeons in Europe.';
 const attributes=extractAttributes(source,{field:'professional_context.clinical-interest',type:'clinical-interest'});
 assert.ok(!attributes.modality.includes('MRI'));
 assert.ok(!attributes.modality.includes('ultrasound'));
 assert.ok(attributes.modality.includes('therapeutic ultrasound'));
});

test('sports hobbies do not become clinical interests',()=>{
 const text='Her current sports interests include tennis and swimming';
 assert.ok(!passages(text).some(p=>p.text.includes(text)));
});

test('a programme for senior trainees is not the owner\'s training credential',()=>{
 const text='His training programme in oculoplastics is approved by the Royal College of Ophthalmologists for senior trainees (ST7) choosing to sub specialise in ophthalmic plastic surgery.';
 assert.equal(classifyPassage(text,'about'),'professional-background');
 const found=passages(text).find(p=>p.text===text);
 assert.ok(found);
 assert.equal(found.type,'professional-background');
 assert.ok(!found.qualifiers.includes('training-not-practice'));
});
