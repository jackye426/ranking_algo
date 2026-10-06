'use strict';
// General category regressions motivated by every disclosed source-review round.
// Synthetic statements, not person-specific rules or unseen held-out examples.
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCorpus,classifyPassage,extractAttributes}=require('./data.cjs');
const fixture=about=>({id:'scope-fixture',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Cardiology',about});
const cases=[
  ['research degree','I completed a Master’s in Clinical Research with a studentship from a national research institute.','training'],
  ['research degree with output mention','She completed her Research MD with several publications.','training'],
  ['received fellowship','He conducted sub-specialty fellowship training after his undergraduate studies.','training'],
  ['explicit research work','She conducted a clinical study of diagnostic accuracy.','research'],
  ['explicit publication','He published his research findings in a peer-reviewed paper.','research'],
  ['explicit historical research role','She was appointed a Research Fellow at the university.','research'],
  ['explicit study contribution','He is a coauthor of a diagnostic study protocol.','research'],
  ['explicit research leadership','I am the Director of Research and Innovation.','research'],
  ['explicit research focus','His research focussed on inherited retinal disease.','research'],
  ['degree with separately asserted work','He holds a PhD for his research focussed on inherited retinal disease.','research'],
  ['research institution without research activity','I work at the National Institute for Clinical Research.','professional-background'],
  ['bare research topic','Medical technologies and clinical studies.','clinical-interest','research_interests'],
  ['aspirational investigator','She hopes to become a principal investigator in a clinical study.','clinical-interest'],
  ['commercial award title','I received Consultant of the Year in the Global Health and Pharma awards.','professional-background'],
  ['commercial recognition with role-shaped title','She won a pharmaceutical company Consultant Excellence Award.','professional-background'],
  ['recognition and actual commercial work','She won an award and serves as a consultant to pharmaceutical companies.','relationship'],
  ['professional society award','The Royal College awarded him a medal and a research grant.','professional-background'],
  ['livery body award','He received a medal from a Worshipful Company and funding from a public research council.','professional-background'],
  ['generic sector biography','The consultant has a long career in the hospital and healthcare industry.','professional-background'],
  ['insurance payment biography','The consultant accepts major insurance companies and self-funded patients.','professional-background'],
  ['medical job title','Consultant in Medical Oncology','professional-background'],
  ['commercial advisory role','I advise pharmaceutical companies on drug development.','relationship'],
  ['commercial funding','My clinical research was funded by an implant manufacturer.','relationship'],
  ['commercial advisory panel','I sit on an international industry advisory panel.','relationship'],
  ['commercial founder','He is co-founder and Chief Clinical Officer at a medical-device start-up.','relationship'],
  ['training leadership US spelling','I am the training program director for the cardiology scheme.','professional-background'],
  ['training leadership UK spelling','I am the training programme director for the cardiology scheme.','professional-background'],
  ['training leadership specialty','I am the national lead for arrhythmia training.','professional-background'],
  ['teaching delivery supervision','He provides educational and clinical supervision for surgical trainees and medical students.','professional-background'],
  ['teaching delivery education','He contributes to teaching and training of future medical professionals.','professional-background'],
  ['teaching events','She was the co-organiser of innovative training events.','professional-background'],
  ['education employment','I work in health education and support work in higher education.','professional-background'],
  ['learning rather than teaching','He completed training at a teaching hospital.','training'],
  ['interest in performing surgery','My main clinical interest is to perform minimal access surgery.','clinical-interest'],
  ['interest in interpretation','I have an interest in interpreting cardiac CT images.','clinical-interest'],
  ['performed clinical action','I perform endoscopy and treat patients with bowel disease.','clinical-practice'],
  ['performed diagnostic examination','I perform dermoscopy for skin lesions.','clinical-practice'],
  ['explicit interpretation','I supervise and report adult cardiac CT.','clinical-practice'],
  ['clinical management','I manage patients with diabetes.','clinical-practice'],
  ['management of administration','I manage the hospital budget and report financial information.','professional-background'],
  ['audit supervision','I supervise a national audit of complications following knee surgery.','professional-background'],
  ['practice word without clinical activity','I help others improve their business practices.','professional-background'],
  ['personal athlete metaphor','Alex is a marathon runner and triathlete who helps others get their practices into great shape.','professional-background'],
  ['registration background','I am on the GMC specialist register.','professional-background'],
  ['professional membership','She is a member of the European Society of Retinal Specialists.','professional-background'],
  ['medicolegal scope','I provide medical reports and act as an expert witness for legal firms.','professional-background'],
  ['bibliography about a training model','Example A.Training model for ultrasound aspiration.','professional-background'],
];
for(const [category,text,type,field='about']of cases)test('scope category: '+category,()=>{
  assert.equal(classifyPassage(text,field),type,text);
  const a=extractAttributes(text,{field,type});
  if(['training','professional-background','clinical-interest'].includes(type))assert.ok(!a.activity.includes('clinical practice'));
  if(type!=='research')assert.ok(!a.activity.includes('clinical research'));
});

test('teaching responsibilities carry delivery evidence and learning does not',()=>{
  for(const [category,text,type]of cases.filter(([category])=>/^training leadership|^teaching delivery|^teaching events/.test(category)))assert.ok(extractAttributes(text,{field:'about',type}).activity.includes('teaching'),category);
  const text='She completed fellowship training at a teaching hospital.';assert.ok(!extractAttributes(text,{field:'about',type:'training'}).activity.includes('teaching'));
});

test('joined degree, award and research sentences cannot borrow each other’s activity',()=>{
  const text='Mr Example holds a PhD for his research focussed on retinal disease.Mr Example won a medal from a Worshipful Company and received a public research grant.Mr Example is an active contributor to clinical research and training.';
  const c=buildCorpus([fixture(text)]),ps=c.passages.filter(p=>p.field==='about');
  assert.ok(ps.some(p=>p.type==='research'&&p.text.includes('research focussed')));
  assert.ok(ps.some(p=>p.type==='research'&&p.text.includes('active contributor')));
  assert.ok(ps.some(p=>p.type==='professional-background'&&p.text.includes('won a medal')));
  assert.ok(!ps.some(p=>p.type==='relationship'));
  for(const p of ps)for(const statement of p.text.split('\n'))assert.ok(text.includes(statement));
});

test('mixed training and actual practice retain separate exact supporting clauses',()=>{
  const text='I trained in cardiac CT; I now report cardiac MRI.';
  const ps=buildCorpus([fixture(text)]).passages.filter(p=>p.field==='about');
  assert.ok(ps.some(p=>p.type==='training'&&p.text==='I trained in cardiac CT;'));
  assert.ok(ps.some(p=>p.type==='clinical-practice'&&p.text==='I now report cardiac MRI.'));
});

test('mixed interest and actual practice retain the two different scopes',()=>{
  const text='I have an interest in cardiac CT but I perform echocardiography.';
  const ps=buildCorpus([fixture(text)]).passages.filter(p=>p.field==='about');
  assert.ok(ps.some(p=>p.type==='clinical-interest'&&p.text==='I have an interest in cardiac CT'));
  assert.ok(ps.some(p=>p.type==='clinical-practice'&&p.text==='but I perform echocardiography.'));
});

test('uncertain professional text stays searchable without a performed-activity claim',()=>{
  for(const text of ['I manage the hospital budget and report financial information.','I help others improve their business practices.','I work at the National Institute for Clinical Research.']){
    const ps=buildCorpus([fixture(text)]).passages.filter(p=>p.field==='about');assert.ok(ps.some(p=>p.text===text&&p.type==='professional-background'));assert.ok(ps.every(p=>p.attributes.activity.length===0));
  }
});

test('a personal sporting identity is not an athlete patient population',()=>{
  const text='Alex is a marathon runner and triathlete who helps others get their practices into great shape.';
  assert.deepEqual(extractAttributes(text,{field:'about',type:classifyPassage(text,'about')}).population,[]);
  const clinical='I treat athletes with knee pain.';assert.ok(extractAttributes(clinical,{field:'about',type:classifyPassage(clinical,'about')}).population.includes('athletes'));
});

test('metadata and therapeutic modalities keep their scope across fields',()=>{
  for(const field of ['qualifications','professional_memberships','publications','locations'])assert.deepEqual(extractAttributes('Paediatric Cancer Research Institute, MRI and Ultrasound Society',{field,type:'professional-background'}),{modality:[],condition:[],population:[],setting:[],activity:[]});
  assert.deepEqual(extractAttributes('Ultrasound phacoemulsification of cataract',{field:'procedures',type:'procedure'}).modality,['therapeutic ultrasound']);
});
