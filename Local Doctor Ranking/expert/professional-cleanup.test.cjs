'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCorpus,normalizeText}=require('./data.cjs'),{buildProfile}=require('./profile.cjs'),P=require('./public/projects.js');
const row=extra=>({id:'cleanup-source',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Medicine',...extra});
function check(text,field,section){const corpus=buildCorpus([row({[field]:text})]),candidate=corpus.candidates[0],profile=buildProfile(candidate,corpus.passages,{corpusVersion:corpus.version});assert.ok(profile[section].some(p=>p.text===text),text);const saved=P.saveCandidate(P.createProject(),{...candidate,requirementMatrix:[],evidence:[],profileBackground:profile},{version:1,requirements:[]},corpus.version);assert.ok(P.exportHTML(P.importJSON(P.exportJSON(saved))).includes(text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')));}
for(const term of ['MD','TB','AF','CT','MR'])test('short professional field survives corpus/profile/export: '+term,()=>check(term,term==='MD'?'qualifications':'clinical_interests',term==='MD'?'qualifications':'clinicalInterests'));
for(const term of ['Contact Dermatitis','Callus','Clicking shoulder / elbow','Contact Dermatitis and Patch Testing\n\nI do not undertake any cosmetic work'])test('medical entries are not navigation commands: '+term,()=>check(term,'clinical_interests','clinicalInterests'));
test('book-related professional research is not a booking instruction',()=>check('Book chapters on clinical rehabilitation.','research_interests','research'));
test('explicit administrative commands still stay outside expertise and profile evidence',()=>{
 for(const text of ['Book an appointment','Call us today','Contact us for appointments','Click here to book','Book','Contact','Consultation fee £200','Call or book online today','Contact Albyn Hospital to book an appointment','Book and appointment today','Bookings and referrals can be made online','Clickhereto read more','Clickhere to view the profile','Outside medicine I run marathons and climb mountains.']){
  const corpus=buildCorpus([row({about:text,clinical_interests:text})]);assert.ok(!corpus.passages.some(p=>['about','clinical_interests'].includes(p.field)),text);
 }
});
test('plain medical inequalities survive mixed HTML cleanup without invented rates',()=>{
 const text='Implant loss rate <1% (national average 13%) Breast conservation rate >90%.';
 assert.equal(normalizeText(text),text);assert.equal(normalizeText('<p>'+text+'</p>'),text);
 assert.equal(normalizeText('Age range 16+\rRecorded note'), 'Age range 16+\nRecorded note');
 check(text,'clinical_interests','clinicalInterests');
});
test('repeated qualification initials and years retain their original degree associations',()=>{
 for(const text of ['MD.MS. CES. FRCS. (Ed.) FRCS. (Glas), CCT','Ph.D. University One, UK 2013\nM.Sc. University Two. UK 2013\nPGCE University Three. UK 2009\nDMM University Four. UK 2009'])check(text,'qualifications','qualifications');
});
test('approved source context retains intact clinical lists while legacy corruption is still withheld',()=>{
 const text='Angina; chest pain; palpitations; shortness of breath; dizziness; murmurs; collapses; heart failure; hypertension';
 const context={kind:'clinical-interest',text,sourceUrl:'https://provider.example/profile',repairProvenance:{releaseId:'fixture',reviewId:'reviewed-intact-list'}};
 const corpus=buildCorpus([row({professional_context:[context]})]),candidate=corpus.candidates[0];
 assert.ok(buildProfile(candidate,corpus.passages).clinicalInterests.some(p=>p.text===text));
 const bad=buildCorpus([row({clinical_interests:'Neu; odevelopment diso; de; s; moto; incoo; dination; lowe; limb t; emor'})]);
 assert.ok(!bad.passages.some(p=>p.field==='clinical_interests'));
});

test('clinical contact/mobile words do not turn role dates and citations into phone data',()=>{
 for(const value of ['Medical Contact Lens association, committee role 2015–2018.','Mobile knee arthroplasty.\nJournal of Surgery 2015; 123: 456–789.'])check(value,'research_interests','research');
 for(const value of ['Knee surgery. Contact us on 020 7946 0958','Knee surgery. Contact: 020 7946 0123','Research in surgery. Mobile: 07700 900123','Cardiology. Contact us at https://example.org/contact','Cardiology. doctor@example.org']){const c=buildCorpus([row({professional_context:[{kind:'research-background',text:value,repairProvenance:{releaseId:'fixture',reviewId:'privacy'}}]})]);assert.ok(!c.passages.some(p=>p.field==='professional_context.research-background'),value);}
});

test('inline source markup preserves word boundaries exactly',()=>{assert.equal(normalizeText('endome<b>triosis</b> and radio<span>logy</span>'),'endometriosis and radiology');assert.equal(normalizeText('<p>Knee</p><p>pain</p>'),'Knee\npain');});

test('reviewed biography fragments retain source context without activity promotion or privacy exceptions',()=>{
 const {createHash}=require('node:crypto'),S=require('./search.cjs');
 const make=(text,mode)=>({kind:'biography',text,sourceUrl:null,repairProvenance:{releaseId:'fixture',reviewId:'bound'},segmentationPolicy:{schemaVersion:1,reviewId:'bound',textSha256:createHash('sha256').update(text).digest('hex'),spans:[{start:0,end:text.length,text,mode}]}});
 const text='During training I reported cardiac CT.\n1994.';let c=buildCorpus([row({professional_context:[make(text,'source-context')]})]),candidate=c.candidates[0],p=c.passages.find(p=>p.field==='professional_context.biography');
 assert.equal(p.text,text);assert.equal(p.type,'professional-background');assert.ok(p.qualifiers.includes('reviewed-source-context-not-independent-activity'));
 const brief={requirements:[{id:'ct',kind:'modality',label:'Cardiac CT',text:'Cardiac CT',importance:'essential',matchIntent:'activity'}]};assert.notEqual(S.matrixFor(candidate,c.passages,brief)[0].status,'documented');
 assert.ok(buildProfile(candidate,c.passages).about.some(p=>p.text===text));
 for(const text of ['TB Updated','Hello!','Name Only']){c=buildCorpus([row({professional_context:[{kind:'biography',text,sourceUrl:null,repairProvenance:{releaseId:'fixture',reviewId:'no-policy'}}]})]);assert.ok(!c.passages.some(p=>p.field==='professional_context.biography'));}
 c=buildCorpus([row({professional_context:[make('Mobile: 07700 900123','professional-entry')]})]);assert.ok(!c.passages.some(p=>p.field==='professional_context.biography'));
});
