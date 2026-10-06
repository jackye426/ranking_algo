'use strict';
// Synthetic attribution/ranking fixtures. No source record or candidate identity
// receives a special rule; embeddings are local deterministic test vectors.
const test=require('node:test'),assert=require('node:assert/strict');
const {ExpertSearchEngine,matrixFor}=require('./search.cjs');
const {classifyPassage}=require('./data.cjs');
const req=(kind,label,extra={})=>({id:kind+'-'+label,kind,label,text:label,importance:'essential',...extra});
const ct=req('modality','Cardiac CT'),adults=req('population','Adults'),interpret=req('activity','Image interpretation');
const candidate=id=>({id,name:'Fictional '+id,role:'Clinician',specialty:'',locations:[],organisations:[],sourceRecordIds:['source-'+id],profileUrls:[],evidenceIds:[]});
const passage=(id,candidateId,text,extra={})=>({id,candidateId,text,type:classifyPassage(text,'about'),field:'about',sourceRecordId:'source-'+candidateId,sourceUrl:'https://example.invalid/'+id,sourceLabel:'Synthetic profile',dates:{sourceDate:null},attributes:{},qualifiers:[],...extra});
const adultScope='Dr Example is a general adult cardiologist with extensive clinical experience in treating patients with cardiovascular problems.';
const ctReporting='Dr Example is fully trained and has extensive experience in reporting CT coronary angiograms.';
const brief=(requirements,extra={})=>({requirements,roles:[],...extra});
const matrix=ps=>matrixFor(candidate('a'),ps,brief([ct,adults,interpret]));
async function engine(candidates,passages){const e=new ExpertSearchEngine({cacheDir:null,embedQuery:async texts=>texts.map(()=>[1,0])});await e.init({version:'scope-fixture',candidates,passages});return e;}

test('same-source adult clinical role scopes the explicitly reported cardiac modality',()=>{
  for(const ps of [[passage('packed','a',adultScope+'\n'+ctReporting)],[passage('adult','a',adultScope),passage('ct','a',ctReporting)]]){
    const rows=matrix(ps);assert.deepEqual(rows.map(r=>r.status),['documented','documented','documented']);
    const span=rows[1].supportingEvidence[0];assert.equal(span.kind,'source-quote');assert.equal(span.text,adultScope);
    assert.ok(ps.find(p=>p.id===span.evidenceId).text.includes(span.text));
  }
});

for(const [label,scope,target,extra]of [
  ['unrelated clinical pathway',adultScope,'I perform dermoscopy for skin lesions.',{}],
  ['explicit child-only modality',adultScope,'I report cardiac CT for children only.',{}],
  ['training only',adultScope,'I completed training in cardiac CT.',{}],
  ['stated modality interest',adultScope,'My clinical interests include cardiac CT.',{}],
  ['negative modality activity',adultScope,'I do not report cardiac CT.',{}],
  ['contracted negative activity',adultScope,"I don’t report cardiac CT.",{}],
  ['different source attribution',adultScope,ctReporting,{sourceRecordId:'other-source'}],
  ['different candidate ownership',adultScope,ctReporting,{candidateId:'b'}],
  ['population only in received training','I received training in adult cardiology.',ctReporting,{}]
])test('adult scope is not transferred across '+label,()=>{
  const rows=matrix([passage('scope','a',scope),passage('activity','a',target,extra)]);
  assert.notEqual(rows.find(r=>r.label==='Adults').status,'documented');
});

test('an unrelated reporting modality does not satisfy personally reporting the requested modality',()=>{
  const rows=matrix([passage('ct','a','I perform cardiac CT.'),passage('mri','a','I report MRI.')]);
  assert.equal(rows.find(r=>r.label==='Cardiac CT').status,'documented');
  assert.notEqual(rows.find(r=>r.label==='Image interpretation').status,'documented');
});

test('adult disease management cannot override an explicit child-only requested modality',()=>{
  const ps=[passage('adults','a',adultScope+' I treat adults with coronary artery disease.'),passage('ct','a','I report cardiac CT for children only.')];
  const rows=matrixFor(candidate('a'),ps,brief([ct,req('condition','Coronary artery disease'),adults]));
  assert.notEqual(rows.find(r=>r.kind==='population').status,'documented');
});

test('explicit requested-modality reporting outranks an unrelated reporting practice with equal modality coverage',async()=>{
  const e=await engine([candidate('reports-ct'),candidate('reports-mri')],[
    passage('ct-report','reports-ct','I personally report cardiac CT.'),
    passage('ct-perform','reports-mri','I perform cardiac CT.'),
    passage('mri-report','reports-mri','I report MRI.')
  ]);
  const found=await e.search(brief([ct,interpret]),{retrievalMode:'bm25'});
  assert.equal(found.results[0].id,'reports-ct');
  assert.equal(found.results.find(c=>c.id==='reports-mri').requirementMatrix.find(r=>r.kind==='activity').status,'potential');
});

async function activityPriorityFixture(activity=interpret,reportingText='I personally report cardiac CT.'){
  const e=await engine([candidate('broad-clinical'),candidate('specific-reporter')],[
    passage('broad','broad-clinical','I perform cardiac CT and treat coronary artery disease.'),
    passage('reporting','specific-reporter',reportingText),
    passage('ct-work','specific-reporter','I perform cardiac CT.'),
    passage('condition-interest','specific-reporter','Coronary artery disease',{type:'clinical-interest',field:'clinical_interests'})
  ]);
  return e.search(brief([ct,req('condition','Coronary artery disease'),...(activity?[activity]:[])]),{retrievalMode:'bm25'});
}

test('essential documented reporting affects the primary clinical ranking rather than losing to broader condition practice',async()=>{
  const found=await activityPriorityFixture(),specific=found.results.find(c=>c.id==='specific-reporter'),broad=found.results.find(c=>c.id==='broad-clinical');
  assert.equal(found.results[0].id,'specific-reporter');assert.equal(specific.clinicalRelevance,19.9);assert.equal(broad.clinicalRelevance,15);
  assert.equal(specific.requirementMatrix.find(r=>r.kind==='activity').status,'documented');assert.equal(broad.requirementMatrix.find(r=>r.kind==='activity').status,'unknown');
});

test('removing or making reporting preferred restores the broader clinical comparison without an identity boost',async()=>{
  for(const activity of [null,{...interpret,importance:'preferred'}]){
    const found=await activityPriorityFixture(activity);assert.equal(found.results[0].id,'broad-clinical');assert.equal(found.results.find(c=>c.id==='specific-reporter').clinicalRelevance,11.9);
  }
});

for(const reportingText of ['I report MRI.','I do not report cardiac CT.','My clinical interests include reporting cardiac CT.'])test('unsupported or non-practised reporting does not receive primary activity priority: '+reportingText,async()=>{
  const found=await activityPriorityFixture(interpret,reportingText);assert.equal(found.results[0].id,'broad-clinical');assert.equal(found.results.find(c=>c.id==='specific-reporter').clinicalRelevance,11.9);
  if(reportingText.includes('interests')){const activity=found.results.find(c=>c.id==='specific-reporter').requirementMatrix.find(r=>r.kind==='activity');assert.equal(activity.status,'potential');assert.equal(activity.supportingEvidence[0].evidenceType,'clinical-interest');}
});

test('comparison support selects the exact matching clinical sentence rather than a generic introduction',()=>{
  const p=passage('bio','a',adultScope+'\n'+ctReporting),row=matrix([p])[0];
  assert.equal(row.supportingEvidence[0].text,ctReporting);assert.equal(row.supportingEvidence[0].kind,'source-quote');
  assert.ok(p.text.includes(row.supportingEvidence[0].text));
});

test('requirement proof preserves the scoped interest label of a mixed practice biography',()=>{
  const p=passage('mixed','a','My clinical interests include cardiac CT. I perform knee surgery.',{type:'clinical-practice'}),row=matrix([p])[0];
  assert.equal(row.supportingEvidence[0].text,'My clinical interests include cardiac CT.');
  assert.equal(row.supportingEvidence[0].evidenceType,'clinical-interest');
});

test('an incidental modality mention is not selected ahead of its actual reporting sentence',()=>{
  const p=passage('mixed','a','Cardiac CT is available at the teaching centre. I report cardiac CT.',{type:'clinical-practice'});
  assert.equal(matrix([p])[0].supportingEvidence[0].text,'I report cardiac CT.');
});

for(const [joined,expected]of [
  ['He can treat and follow up patients with a wide variety of cardiological problems, including:Chest pain / Coronary artery diseasePalpitationsHigh blood pressureValvular diseaseHeart failureHigh cholesterol levelsHe also offers transthoracic echocardiogram, transoesophageal, stress echo and CT coronary angiogram.His main interests in cardiology include imaging and heart failure.','He also offers transthoracic echocardiogram, transoesophageal, stress echo and CT coronary angiogram.'],
  ['Treatments and symptomsShe personally reports cardiac CT.Her clinical interests include prevention.','She personally reports cardiac CT.'],
  ['A long list of interestsI routinely interpret cardiac CT.My work also includes prevention.','I routinely interpret cardiac CT.']
])test('joined imported prose yields an exact bounded clinical excerpt: '+expected,()=>{
  const p=passage('joined','a',joined,{type:'clinical-practice'}),before=structuredClone(p),row=matrix([p])[0],span=row.supportingEvidence[0];
  assert.equal(span.text,expected);assert.ok(p.text.includes(span.text));assert.ok(span.text.length<280);assert.match(span.text,/\bCT\b/);assert.deepEqual(p,before);assert.equal(row.status,'documented');
});

test('joined negative clinical sentence retains its negation in the displayed excerpt',()=>{
  const text='Recorded clinical backgroundHe does not report cardiac CT.His work concerns other modalities.',p=passage('joined-negative','a',text,{type:'clinical-practice'}),row=matrix([p])[0];
  assert.equal(row.status,'mismatch');assert.equal(row.supportingEvidence[0].text,'He does not report cardiac CT.');assert.ok(text.includes(row.supportingEvidence[0].text));
});

test('a reviewed study summary retains its historical scope when its literal excerpt is only author attribution',()=>{
  const r=req('setting','Primary care'),p=passage('study','a','Fictional Author is a named coauthor of a 2012 diagnostic trial protocol. The study evaluates a skin-lesion imaging aid in primary care.',{type:'research',reviewedParaphrase:true,sourceQuote:'Fictional Author',dates:{sourceDate:'2012'},review:{limitations:['Historical coauthorship does not establish individual appraisal competence.']}});
  const row=matrixFor(candidate('a'),[p],brief([req('modality','Skin-lesion imaging'),r]))[1],span=row.supportingEvidence[0];
  assert.equal(row.status,'potential');assert.equal(span.kind,'reviewed-summary');assert.equal(span.text,p.text);
  assert.equal(span.sourceQuote,'Fictional Author');assert.equal(span.sourceQuoteSupportsRequirement,false);
  assert.equal(span.sourceDate,'2012');assert.deepEqual(span.limits,p.review.limitations);
});

test('a relevant literal excerpt remains a source quote and is not replaced by its reviewed paraphrase',()=>{
  const p=passage('source','a','The profile describes a cardiac CT service.',{type:'clinical-practice',reviewedParaphrase:true,sourceQuote:'I report cardiac CT.'});
  const span=matrix([p])[0].supportingEvidence[0];assert.equal(span.text,p.sourceQuote);assert.equal(span.kind,'source-quote');assert.equal(span.sourceQuoteSupportsRequirement,true);
});

test('positive evidence is selected over a separate negative clause from the same passage',()=>{
  const p=passage('mixed','a','I do not report cardiac CT for children. I report cardiac CT for adults.',{type:'clinical-practice'});
  const span=matrix([p])[0].supportingEvidence[0];assert.equal(span.text,'I report cardiac CT for adults.');
});

for(const text of ['I report MRI and am developing an interest in cardiac CT.','I report MRI and cardiac CT is of particular interest.','My cardiac CT interests are growing; I report MRI.'])test('an adjacent CT interest cannot borrow a separate reporting predicate: '+text,()=>{
  const rows=matrix([passage('mixed','a',text,{type:'clinical-practice'})]);assert.notEqual(rows.find(r=>r.label==='Image interpretation').status,'documented');
});

test('coordinated reporting objects remain attributable and the reporting sentence is selected for activity proof',()=>{
  const text='My interests include cardiac CT. I report MRI. I report MRI and cardiac CT.';
  const row=matrix([passage('mixed','a',text,{type:'clinical-practice'})]).find(r=>r.kind==='activity');
  assert.equal(row.status,'documented');assert.equal(row.supportingEvidence[0].text,'I report MRI and cardiac CT.');
});

const skin=req('modality','Skin-lesion imaging');
async function roleEngine(){return engine(['gp','derm','unknown','researcher'].map(candidate),[
  ...['gp','derm','unknown','researcher'].map(id=>passage('skin-'+id,id,'I perform dermoscopy for skin lesions.')),
  passage('role-gp','gp','General practice',{field:'specialty',type:'professional-background'}),
  passage('role-derm','derm','Dermatology',{field:'specialty',type:'professional-background'}),
  passage('role-research','researcher','Clinical researcher',{field:'professional_role',type:'professional-background'}),
  passage('teaches-gp','unknown','I teach GPs how to assess skin lesions.',{type:'professional-background'})
]);}

test('explicit role exclusion removes documented dermatologists without turning the exclusion into support or a gap',async()=>{
  const e=await roleEngine(),b=brief([skin,req('role','Dermatologist',{polarity:'exclude'})]);
  const found=await e.search(b,{retrievalMode:'bm25'});
  assert(!found.results.some(c=>c.id==='derm'));assert(found.results.some(c=>c.id==='gp'));
  for(const c of found.results){assert(!c.gaps.some(r=>r.label==='Dermatologist'));assert(!c.reasons.some(r=>r.requirementId==='role-Dermatologist'));assert.equal(c.coverage.essentialTotal,1);}
});

test('negative role wording cannot become a retrieval query or a positive context signal',async()=>{
  const e=await roleEngine(),found=await e.search(brief([skin,req('role','Dermatologist',{polarity:'exclude'}),req('question','Assessment question',{text:'Assess skin images without a dermatologist'})]),{retrievalMode:'bm25'});
  assert(found.diagnostics.queryChannels.every(q=>! /dermatolog/i.test(q.query)));
});

test('only-GP filters unknown and non-GP roles; a preferred research role cannot widen the permitted set',async()=>{
  const e=await roleEngine(),b=brief([skin,req('role','General practitioner',{strictRole:true}),req('role','Clinical researcher',{importance:'preferred'})],{roleMode:'only',roles:['General practitioner','Clinical researcher']});
  const found=await e.search(b,{retrievalMode:'bm25'});assert.deepEqual(found.results.map(c=>c.id),['gp']);
});

test('strict role filters return zero rather than padding from matching clinical interests',async()=>{
  const e=await engine([candidate('a')],[passage('skin','a','I perform dermoscopy for skin lesions.')]);
  const found=await e.search(brief([skin,req('role','General practitioner',{strictRole:true})],{roleMode:'only'}),{retrievalMode:'bm25'});assert.deepEqual(found.results,[]);
});

test('ordinary complementary role preferences do not apply a strict single-role filter',async()=>{
  const e=await roleEngine(),found=await e.search(brief([skin,req('role','General practitioner'),req('role','Clinical researcher')],{roles:['General practitioner','Clinical researcher']}),{retrievalMode:'bm25'});
  assert(found.results.some(c=>c.id==='gp'));assert(found.results.some(c=>c.id==='researcher'));assert(found.results.some(c=>c.id==='derm'));
});

test('GP teaching or referral mentions cannot establish the professional role',()=>{
  for(const text of ['I teach GPs how to assess skin lesions.','I am a consultant working with a general practitioner.','He refers patients to a GP.','I am a consultant radiologist and teach GPs.','I no longer work as a GP.']){
    const row=matrixFor(candidate('a'),[passage('r','a',text,{type:'professional-background'})],brief([req('role','General practitioner')]))[0];assert.notEqual(row.status,'documented');
  }
  const row=matrixFor(candidate('a'),[passage('r','a','I am a general practitioner and teach nurses.',{type:'professional-background'})],brief([req('role','General practitioner')]))[0];assert.equal(row.status,'documented');
});

for(const [label,text]of [['General practitioner','General practitioners'],['Dermatologist','Dermatologists'],['Radiologist','Radiologists'],['Cardiologist','Cardiologists'],['Clinical scientist','Clinical scientists']])test('plural role metadata retains explicit '+label+' support',()=>{
  const row=matrixFor(candidate('a'),[passage('role','a',text,{type:'professional-background',field:'professional_role'})],brief([req('role',label)]))[0];assert.equal(row.status,'documented');
});

for(const [label,positive,negative]of [
  ['Clinical scientist','I am a registered clinical scientist.','She works with a clinical scientist on dermoscopy research.'],
  ['Medical physicist','He works as a medical physicist.','He refers questions to a medical physicist.'],
  ['Diagnostic radiographer','My professional role is diagnostic radiographer.','I teach diagnostic radiographers how to analyse images.']
])test('generic professional role '+label+' requires self attribution',()=>{
  const r=req('role',label),testRole=text=>matrixFor(candidate('a'),[passage('role','a',text,{type:'professional-background'})],brief([r]))[0];
  assert.equal(testRole(positive).status,'documented');assert.notEqual(testRole(negative).status,'documented');
});

test('a generic excluded role is removed from context retrieval without falsely excluding its collaborators',async()=>{
  const e=await engine([candidate('a')],[passage('skin','a','I perform dermoscopy for skin lesions.'),passage('collaborator','a','She works with a clinical scientist on dermoscopy research.',{type:'professional-background'})]);
  const r=req('role','Clinical scientist',{polarity:'exclude'}),b=brief([skin,r,req('question','Assessment question',{text:'Assess skin images without clinical scientists'})]);
  const found=await e.search(b,{retrievalMode:'bm25'});assert.deepEqual(found.results.map(c=>c.id),['a']);assert(found.diagnostics.queryChannels.every(q=>! /clinical scientists?/i.test(q.query)));
});
