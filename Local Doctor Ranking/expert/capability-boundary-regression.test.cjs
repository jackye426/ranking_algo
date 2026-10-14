'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCorpus,classifyPassage,extractAttributes,splitPassages}=require('./data.cjs');
const row=about=>({id:'owned-capability-fixture',name:'Dr Example',gmc_number:'1234567',specialty:'Surgery',about,profile_urls:{}});
const attributes=text=>extractAttributes(text,{field:'about',type:classifyPassage(text,'about')});
test('asserted capability is useful context rather than proof of performed care',()=>{
 for(const text of ['With his extensive training and experience, he is capable of treating a wide range of foot and ankle conditions.','Her expertise covers a wide range of gynaecological issues, and she is skilled in performing various procedures, including smear tests, colposcopy, biopsies, myomectomy, fibroid resection, hysteroscopy, keyhole surgery, ultrasound scanning, early pregnancy problems, endometrial ablation, and more.']){
  assert.notEqual(classifyPassage(text,'about'),'clinical-practice',text);
  assert.ok(!attributes(text).activity.includes('clinical practice'));
  assert.equal(splitPassages(text).join(' ').replace(/\s+/g,' '),text);
  assert.ok(buildCorpus([row(text)]).passages.some(p=>p.text.includes('capable of treating')||p.text.includes('skilled in performing')));
 }
});
test('a degree enabling approach development does not establish performed treatment',()=>{
 const text='He has a strong background in vascular surgery and has completed a PhD in the field, which has enabled him to develop innovative approaches to treating vascular conditions.';
 assert.equal(classifyPassage(text,'about'),'training');
 assert.ok(!attributes(text).activity.includes('clinical practice'));
});
test('competence after training does not erase separately documented performed work',()=>{
 const capability='She is experienced in all aspects of dermatology and is highly competent in performing surgery after completing a year of advanced dermatological surgery.';
 const activity='I have performed thousands of skin procedures.';
 assert.notEqual(classifyPassage(capability,'about'),'clinical-practice');
 assert.ok(!attributes(capability).activity.includes('clinical practice'));
 const corpus=buildCorpus([row(capability+' '+activity)]);
 assert.ok(corpus.passages.some(p=>p.text===capability&&p.qualifiers.includes('capability-not-performed-activity')));
 assert.ok(corpus.passages.some(p=>p.text===activity&&p.type==='clinical-practice'));
 assert.equal(splitPassages(capability+' '+activity).join(' ').replace(/\s+/g,' '),capability+' '+activity);
});
test('separately documented performed totals survive capability context',()=>{
 const capability='She is skilled in performing ultrasound scanning.';
 const performed='She is an active member of the Gynaecology MDT and has performed over 100 hysterectomies, 1000 hysteroscopies, and 500 laparoscopic procedures.';
 const corpus=buildCorpus([row(capability+' '+performed)]);
 assert.ok(corpus.passages.some(p=>p.text===performed&&p.type==='clinical-practice'&&p.attributes.activity.includes('clinical practice')));
 assert.ok(corpus.passages.some(p=>p.text===capability&&p.type!=='clinical-practice'));
 assert.equal(classifyPassage('She is skilled in performing surgery and has performed 500 laparoscopic procedures.','about'),'clinical-practice');
});
test('literal flattened education heading cannot supply a clinical hospital setting',()=>{
 const clinical='As an experienced shoulder and elbow specialist, I treat the majority of my patients without surgery and if that is not enough then procedures offered by myself include:shoulder replacement surgery, including the use of CT-based planning and intra-operative mixed realityshoulder and elbow fracture surgerykeyhole (arthroscopic) and open stabilisation surgery for dislocationsrotator cuff repairulnar nerve decompressionnon-surgical treatments for specific upper limb soft tissue conditions';
 const education='EDUCATION AND TRAININGBESS Travelling Fellowship 2017, Florida, USACambridge Shoulder Institute Senior Fellowship 2012, Cambridge, UKBOA Traveling Fellowship 2011, Hospital for Special Surgery, New York, USABOA Traveling Fellowship 2011, Mount Sinai Hospital, New York, USABOTA Traveling Fellowship 2010, Mumbai & Delhi, IndiaTrauma & Orthopaedics, Higher Surgical Training, London 2005-12FRCS (Tr & Orth), Royal College of Surgeons of England 2010MB BS (GKT), University of London 2000';
 const ps=buildCorpus([row(clinical+education)]).passages;
 assert.ok(ps.some(p=>p.text===clinical&&p.type==='clinical-practice'));
 assert.ok(ps.some(p=>p.text===education&&p.type==='training'));
 assert.ok(!ps.filter(p=>p.type==='clinical-practice').some(p=>p.text.includes('Mount Sinai')||p.attributes.setting.includes('hospital')));
});
test('explicit membership and research headings remain distinct source blocks',()=>{
 const membership='Professional Membership\n\n• British Medical Association\n\n• British Association of Urological Surgeons\n\n• European Association of Urology\n\n• Royal College of Surgeons of England\n\n• Medical Defence Union\n\n• General Medical Council';
 const research='Research Interests\n\nMr Andrews was the lead consultant for urology research at Dorset County Hospital.';
 const ps=buildCorpus([row(membership+'\n\n'+research)]).passages;
 assert.ok(ps.some(p=>p.text===membership&&p.type==='professional-background'));
 assert.ok(ps.some(p=>p.text.includes('lead consultant for urology research')&&p.type==='research'));
});
test('glued complete sentences preserve clinical work and separate received training',()=>{
 const clinical='His current practice involves regular adult and paediatric ENT clinics and operating sessions.';
 const promotion="Recognised for his adept communication skills, Mr. Whittaker is known for crafting management strategies centred on patients' best interests and needs.";
 const leadership='He also spearheaded the North East London Teleotology programme.';
 const training='Having completed specialist training at several eminent centres in London and South East England, he pursued a Fellowship in Otology & Skull Base Surgery at Guys & St Thomas Hospitals.';
 const ps=buildCorpus([row(clinical+promotion+' '+leadership+training)]).passages;
 assert.ok(ps.some(p=>p.text===clinical&&p.type==='clinical-practice'&&!p.qualifiers.includes('team-context-not-individual-activity')));
 assert.ok(ps.some(p=>p.text===leadership&&p.type!=='training'));
 assert.ok(ps.some(p=>p.text===training&&p.type==='training'));
 assert.ok(!ps.some(p=>p.text.includes('programme.Having')));
});
