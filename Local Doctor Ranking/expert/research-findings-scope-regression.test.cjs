'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{buildCorpus,classifyPassage}=require('./data.cjs');
test('a reported finding about newly diagnosed patients does not establish diagnosing activity',()=>{
 const text="He has also shown the added value of assessing carotid atherosclerosis during stress echo for daignosis and prognosis of caoronary artery disease.Recently he led UK hospitals to demonstarte tha initial medical therapy in pts with newly diagnosed coronary artery disease is as eefective as coronary intervention-published in NEJM-world's leading medical journal.";
 assert.notEqual(classifyPassage(text,'about'),'clinical-practice');
 const c=buildCorpus([{id:'source',name:'Dr Alex Example',gmc_number:'1234567',about:text+'\nI personally report coronary CT.'}]);
 assert(c.passages.some(p=>p.text==='I personally report coronary CT.'&&p.type==='clinical-practice'));
 assert(c.passages.some(p=>p.text.includes('newly diagnosed')&&p.type!=='clinical-practice'));
 assert(c.passages.some(p=>p.text.includes('demonstarte'))); // Never reconstruct clinical wording.
});
test('an owner diagnosis assertion alongside the patient population remains practice',()=>{
 assert.equal(classifyPassage('I diagnose coronary disease and treat patients with newly diagnosed diabetes.','about'),'clinical-practice');
});
