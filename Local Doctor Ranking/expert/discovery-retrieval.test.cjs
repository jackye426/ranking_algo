'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ExpertSearchEngine,matrixFor,directMatch,requirementQuery,requirementQueries}=require('./search.cjs');
const {parseBrief}=require('./brief.cjs');
const requirement=(id,kind,label,extra={})=>({id,kind,label,text:label,importance:'focus',...extra});
const role=requirement('role','role','Cardiologist');
const imaging=requirement('imaging','modality','Medical imaging',{matchIntent:'interest'});
const cardiac=requirement('cardiac','modality','Cardiovascular imaging',{matchIntent:'interest'});
const form=requirements=>({version:1,requirements,roles:requirements.filter(r=>r.kind==='role').map(r=>r.label),summary:'Discovery'});
const person=(id,specialty='Cardiology')=>({id,name:'Dr '+id,role:'Consultant',specialty,locations:[],sourceRecordIds:[id],evidenceIds:[]});
const fact=(id,candidateId,text,type='clinical-practice',extra={})=>({id,candidateId,text,type,field:'about',sourceRecordId:'source-'+candidateId,sourceUrl:'https://example.org/'+candidateId,attributes:{},qualifiers:[],dates:{},attribution:'source-record',...extra});
const profession=(id,text='Consultant Cardiologist')=>fact(id+'-role',id,text,'professional-background',{field:'specialty'});
async function engine(passages,{vectors={},fallback=[0,0,0]}={}){
  const e=new ExpertSearchEngine({cacheDir:null,embedQuery:async texts=>texts.map(t=>vectors[t]||fallback)});
  await e.init({version:'discovery-fixture-v1',candidates:[...new Set(passages.map(p=>p.candidateId))].map(id=>person(id)),passages});return e;
}

test('role-only discovery retrieves supported cardiologists using the BM25 population query',async()=>{
  const e=await engine([profession('Cardio'),profession('Radio','Consultant Radiologist'),fact('noise','Teacher','I teach cardiologists.','clinical-practice')]);
  const result=await e.search(form([role]),{retrievalMode:'bm25'});
  assert.deepEqual(result.results.map(c=>c.id),['Cardio']);assert.ok(result.diagnostics.queryChannels.some(q=>q.channel==='role'));
  assert.equal(result.results[0].requirementMatrix[0].status,'documented');assert.equal(result.needsClarification,undefined);
});

test('short radiology-interest discovery keeps cardiologists and admits alternative imaging modalities',async()=>{
  const passages=[profession('CT'),fact('ct','CT','My clinical interests include cardiac CT.','clinical-interest'),profession('Echo'),fact('echo','Echo','My clinical interests include echocardiography.','clinical-interest'),profession('Radio','Consultant Radiologist'),fact('radio-ct','Radio','I report cardiac CT.'),profession('General'),fact('general','General','I treat hypertension.')];
  const e=await engine(passages),brief=form([role,imaging]),before=structuredClone(brief);
  const result=await e.search(brief,{retrievalMode:'bm25'});
  assert.deepEqual(new Set(result.results.map(c=>c.id)),new Set(['CT','Echo']));assert.deepEqual(brief,before);
  assert.ok(result.diagnostics.retrievalExpansions[0].terms.includes('MRI magnetic resonance imaging'));
  assert.ok(result.results.every(c=>c.requirementMatrix.length===2&&c.gaps.length===0));
  assert.ok(result.results.every(c=>c.requirementMatrix.find(m=>m.kind==='modality').matchIntent==='interest'));
});

test('strengthening the requested profession never admits a different profession',async()=>{
  const e=await engine([profession('Cardio'),fact('cardio-ct','Cardio','Cardiac CT.','clinical-interest'),profession('Radio','Consultant Radiologist'),fact('radio-ct','Radio','Cardiac CT.','clinical-interest')]);
  for(const message of ['Cardiologists with radiology interests','Must be cardiologists with radiology interests','Cardiologists are essential; radiology interests']){
    const result=await e.search(parseBrief({message}).brief,{retrievalMode:'bm25'});assert.deepEqual(result.results.map(c=>c.id),['Cardio'],message);
  }
});

test('original query and controlled expansions use the same active criterion without adding mandatory modalities',()=>{
  const plans=requirementQueries(imaging);assert.equal(plans[0].query,'Medical imaging');assert.equal(plans[0].expanded,false);assert.equal(plans[1].expanded,true);
  assert.ok(plans[1].query.includes('echocardiography'));assert.equal(imaging.importance,'focus');assert.equal(requirementQuery(role),'cardiologist cardiology');
});

test('cardiovascular imaging accepts related cardiac modalities but excludes an unrelated body-part scan',()=>{
  for(const text of ['cardiac CT','CT coronary angiogram','cardiac MRI','CMR','echocardiography','echocardiogram','stress echo','coronary imaging','myocardial perfusion'])assert.equal(directMatch(cardiac,{text}),true,text);
  for(const text of ['MRI of the knee','chest X-ray','skin dermoscopy'])assert.equal(directMatch(cardiac,{text}),false,text);
});

test('therapeutic ultrasound is not broad diagnostic imaging evidence',()=>{
  for(const text of ['high-intensity focused ultrasound','therapeutic ultrasound','ultrasound phacoemulsification'])assert.equal(directMatch(imaging,{text}),false,text);
});

test('interest intent treats listed interest as direct relevance without relabelling it activity',async()=>{
  const e=await engine([profession('Interest'),fact('interest','Interest','Cardiac CT.','clinical-interest'),profession('Practice'),fact('practice','Practice','I report cardiac CT.')]);
  const result=await e.search(form([role,imaging]),{retrievalMode:'bm25'}),candidate=result.results[0],row=candidate.requirementMatrix.find(m=>m.kind==='modality');
  assert.equal(candidate.id,'Interest');assert.equal(row.status,'documented');assert.equal(row.supportingEvidence[0].evidenceType,'clinical-interest');
  assert.match(candidate.reasons[0].text,/Listed interest/);assert.ok(!candidate.reasons[0].text.includes('Recorded practice'));
});

test('asking for actual activity keeps an interest weaker and selects the practising clinician first',async()=>{
  const e=await engine([profession('Interest'),fact('interest','Interest','Cardiac CT.','clinical-interest'),profession('Practice'),fact('practice','Practice','I report cardiac CT.')]);
  const requested={...imaging,importance:'essential',matchIntent:'activity'};
  const result=await e.search(form([role,requested]),{retrievalMode:'bm25'});
  assert.equal(result.results[0].id,'Practice');assert.equal(result.results.find(c=>c.id==='Interest').requirementMatrix[1].status,'potential');
  assert.deepEqual((await e.search(form([role,requested]),{retrievalMode:'bm25',documentedOnly:true})).results.map(c=>c.id),['Practice']);
});

test('research intent ranks attributed imaging research above a generic imaging interest',async()=>{
  const e=await engine([profession('Interest'),fact('interest','Interest','Cardiac CT.','clinical-interest'),profession('Research'),fact('research','Research','I led research on cardiac CT.','research')]);
  const result=await e.search(form([role,{...imaging,matchIntent:'research'}]),{retrievalMode:'bm25'});
  assert.equal(result.results[0].id,'Research');assert.equal(result.results[0].requirementMatrix[1].status,'documented');assert.equal(result.results[0].requirementMatrix[1].supportingEvidence[0].evidenceType,'research');
  assert.equal(result.results[1].requirementMatrix[1].status,'potential');
});

test('an explicitly listed research interest is supported as an interest, not verified study involvement',()=>{
  const candidate=person('A'),p=fact('research-interest','A','My research interests include cardiac MRI.','clinical-interest');
  const row=matrixFor(candidate,[p],form([{...imaging,matchIntent:'research'}]))[0];
  assert.equal(row.status,'documented');assert.equal(row.supportingEvidence[0].evidenceType,'clinical-interest');
});

test('self-described historical research imported as an interest receives its exact research label without changing ranking',async()=>{
  const text='My field of research was investigation of new onset chest pain with stress echocardiography and added value of carotid imaging in such patients.';
  const p=fact('historical-research','A',text,'clinical-interest',{field:'research_interests'}),e=await engine([profession('A'),p]),result=await e.search(form([role,imaging]),{retrievalMode:'bm25'}),candidate=result.results[0],support=candidate.requirementMatrix.find(r=>r.kind==='modality').supportingEvidence[0];
  assert.equal(support.evidenceType,'research');assert.equal(support.evidenceScope,undefined);assert.equal(support.text,text);assert.equal(support.sourceDate,null);assert.equal(p.type,'clinical-interest');assert.equal(candidate.clinicalRelevance,10);assert.match(candidate.reasons[0].text,/^Recorded research:/);assert.match(support.text,/research was/);
  const interest=matrixFor(person('B'),[fact('interest','B','My research interests include cardiac CT.','clinical-interest')],form([imaging]))[0];assert.equal(interest.supportingEvidence[0].evidenceType,'clinical-interest');
});

test('related research enriches the response without creating requirements, gaps, or qualification claims',async()=>{
  const passages=[profession('A'),fact('interest','A','Cardiac CT.','clinical-interest'),fact('research','A','I coauthored a cardiac CT study.','research',{dates:{sourceDate:'2014-02-03'}})];
  const e=await engine(passages),brief=form([role,imaging]),result=await e.search(brief,{retrievalMode:'bm25'}),candidate=result.results[0];
  assert.equal(candidate.relatedEvidence.length,1);assert.equal(candidate.relatedEvidence[0].evidenceId,'research');assert.equal(candidate.relatedEvidence[0].sourceDate,'2014-02-03');
  assert.deepEqual(candidate.relatedEvidence[0].relatedToRequirementIds,['imaging']);assert.equal(candidate.requirementMatrix.length,2);assert.equal(candidate.gaps.length,0);
  assert.ok(candidate.evidence.some(p=>p.id==='research'&&p.candidateId===candidate.id));assert.equal(candidate.qualificationStatus,'not-reviewed');
});

test('explicit historical research stored under interests enriches a separate imaging lead without new requirements or ranking weight',async()=>{
  const text='My field of research was investigation of new onset chest pain with stress echocardiography and added value of carotid imaging.';
  const history=fact('history','A',text,'clinical-interest',{field:'research_interests',dates:{sourceDate:null}}),lead=fact('lead','A','Stress echocardiography.','clinical-interest');
  const before=await engine([profession('A'),lead]),after=await engine([profession('A'),lead,history]),brief=form([role,imaging]);
  const base=(await before.search(brief,{retrievalMode:'bm25'})).results[0],candidate=(await after.search(brief,{retrievalMode:'bm25'})).results[0];
  assert.equal(candidate.requirementMatrix.find(m=>m.kind==='modality').evidenceIds[0],'lead');
  assert.equal(candidate.relatedEvidence.length,1);assert.equal(candidate.relatedEvidence[0].evidenceId,'history');assert.equal(candidate.relatedEvidence[0].evidenceType,'research');assert.equal(candidate.relatedEvidence[0].text,text);assert.equal(candidate.relatedEvidence[0].sourceDate,null);
  assert.deepEqual(candidate.relatedEvidence[0].relatedToRequirementIds,['imaging']);assert.equal(candidate.clinicalRelevance,base.clinicalRelevance);assert.equal(candidate.rank,base.rank);assert.equal(candidate.requirementMatrix.length,2);assert.deepEqual(candidate.gaps,[]);assert.equal(history.type,'clinical-interest');
});

test('historical research exception cannot attach unrelated, negated, ordinary-interest or uncertain-owner research',async()=>{
  const lead=fact('lead','A','Stress echocardiography.','clinical-interest');
  const rejected=[
    fact('unrelated','A','My field of research was investigation of knee replacement outcomes.','clinical-interest'),
    fact('cross-clause','A','My field of research was investigation of knee replacement outcomes. I list cardiac CT as a clinical interest.','clinical-interest'),
    fact('negative','A','My field of research was investigation of cardiac CT, but I did not participate in the study and have no experience with this imaging.','clinical-interest'),
    fact('interest','A','My research interests include cardiac CT.','clinical-interest'),
    fact('uncertain','A','My field of research was investigation of cardiac CT.','clinical-interest',{qualifiers:['uncertain-identity']}),
    fact('foreign','Other','My field of research was investigation of cardiac CT.','clinical-interest')
  ];
  const e=await engine([profession('A'),lead,...rejected]),result=await e.search(form([role,imaging]),{retrievalMode:'bm25'}),candidate=result.results.find(c=>c.id==='A');
  assert.deepEqual(candidate.relatedEvidence,[]);
});

test('unrelated research and unverified publication-profile links do not become clinical extras',async()=>{
  const e=await engine([profession('A'),fact('interest','A','Cardiac CT.','clinical-interest'),fact('unrelated','A','I led trials on knee replacement.','research'),fact('listing','A','Cardiac CT publications','publication',{qualifiers:['publication-listing-link-not-authorship']})]);
  const result=await e.search(form([role,imaging]),{retrievalMode:'bm25'});assert.deepEqual(result.results[0].relatedEvidence,[]);
});

test('a generic study mentioned on a profile does not establish the candidate participated in it',async()=>{
  const e=await engine([profession('A'),fact('interest','A','Cardiac CT.','clinical-interest'),fact('study','A','A multicentre study evaluated cardiac CT diagnostic accuracy.','research'),fact('knowledge','A','Research has shown cardiac MRI to be useful.','research')]);
  const result=await e.search(form([role,imaging]),{retrievalMode:'bm25'});assert.deepEqual(result.results[0].relatedEvidence,[]);
  for(const p of [fact('study','A','A multicentre study evaluated cardiac CT diagnostic accuracy.','research'),fact('listing','A','Cardiac CT publication profile','publication',{qualifiers:['publication-listing-link-not-authorship']})]){
    const row=matrixFor(person('A'),[p],form([{...imaging,matchIntent:'research'}]))[0];assert.equal(row.status,'potential');
  }
});

test('joined imported prose cannot connect CT training to research about heart attacks',async()=>{
  const text="I hold a Master's degree in Clinical Education and am accredited in Cardiac CT.Whether you are experiencing symptoms you will receive personalised care.Research & Academic Work:I am actively involved in cardiovascular research, particularly in heart attacks.";
  const passage=fact('mixed','A',text,'research'),r={...imaging,matchIntent:'research'},row=matrixFor(person('A'),[passage],form([r]))[0];
  assert.equal(row.status,'potential');assert.equal(row.supportingEvidence[0].evidenceType,'training');assert.ok(!row.supportingEvidence[0].text.includes('heart attacks'));
  const e=await engine([profession('A'),fact('interest','A','Cardiac CT.','clinical-interest'),passage]);
  const result=await e.search(form([role,imaging]),{retrievalMode:'bm25'});assert.deepEqual(result.results[0].relatedEvidence,[]);
});

test('a bullet list keeps the research topic and contribution in the same exact excerpt',()=>{
  const text='Career highlights include:• National leadership awards• I am involved in trials about heart failure• I coauthored a cardiac MRI study• I report cardiac CT.';
  const row=matrixFor(person('A'),[fact('bullets','A',text,'research')],form([{...imaging,matchIntent:'research'}]))[0];
  assert.equal(row.status,'documented');assert.equal(row.supportingEvidence[0].text,'I coauthored a cardiac MRI study');assert.equal(row.supportingEvidence[0].evidenceType,'research');
});

test('generic research context receives a neutral scope marker rather than candidate-involvement meaning',()=>{
  const row=matrixFor(person('A'),[fact('context','A','A multicentre study evaluated cardiac CT diagnostic accuracy.','research')],form([{...imaging,matchIntent:'research'}]))[0];
  assert.equal(row.status,'potential');assert.equal(row.supportingEvidence[0].evidenceScope,'research-context');
});

test('reviewed research contribution stays a summary when a matching study title alone omits authorship',async()=>{
  const p=fact('study','A','Dr A coauthored a cardiac CT study in 2010.','research',{reviewedParaphrase:true,sourceQuote:'Cardiac CT diagnostic accuracy',dates:{sourceDate:'2010-01-01'}});
  const e=await engine([profession('A'),fact('interest','A','Cardiac CT.','clinical-interest'),p]);
  const result=await e.search(form([role,imaging]),{retrievalMode:'bm25'}),extra=result.results[0].relatedEvidence[0];
  assert.equal(extra.kind,'reviewed-summary');assert.equal(extra.text,p.text);assert.equal(extra.sourceDate,'2010-01-01');
});

test('long clinical-interest lists select the imaging entry before card truncation',()=>{
  const text='General cardiology; '+Array.from({length:15},(_,i)=>'Management of symptom '+i).join('; ')+'; Cardiac imaging including; Cardiac CT and CT Calcium scoring and cardiovascular risk prediction; Echocardiography';
  const row=matrixFor(person('A'),[fact('list','A',text,'clinical-interest',{field:'areas_of_interest'})],form([imaging]))[0];
  assert.match(row.supportingEvidence[0].text,/^Cardiac CT/);assert.ok(row.supportingEvidence[0].text.length<150);assert.ok(text.includes(row.supportingEvidence[0].text));
});

test('joined imported interest text exposes the exact imaging fragment',()=>{
  const text='Cardiac imaging: '+'General cardiology and symptoms'.repeat(10)+'Echocardiography for valve disease';
  const row=matrixFor(person('A'),[fact('joined','A',text,'clinical-interest',{field:'areas_of_interest'})],form([imaging]))[0];
  assert.equal(row.supportingEvidence[0].text,'Echocardiography for valve disease');assert.equal(row.supportingEvidence[0].evidenceType,'clinical-interest');
});

test('related research is bounded and duplicate passages cannot multiply its presentation',async()=>{
  const passages=[profession('A'),fact('interest','A','Cardiac CT.','clinical-interest'),...Array.from({length:10},(_,i)=>fact('study-'+i,'A','I coauthored a cardiac CT study.','research')),fact('study-b','A','I coauthored a cardiac MRI study.','research'),fact('study-c','A','I coauthored a study on echocardiography methods.','research')];
  const e=await engine(passages),result=await e.search(form([role,imaging]),{retrievalMode:'bm25'});
  assert.equal(result.results[0].relatedEvidence.length,2);assert.equal(new Set(result.results[0].relatedEvidence.map(p=>p.text)).size,2);
});

test('optional research does not rescue an unrelated clinical profile or outrank stronger required activity',async()=>{
  const passages=[profession('Practice'),fact('practice','Practice','I report cardiac CT.'),profession('Interest'),fact('interest','Interest','Cardiac CT.','clinical-interest'),fact('interest-research','Interest','I coauthored a cardiac CT study.','research'),profession('Knee'),fact('knee-research','Knee','I led trials on knee replacement.','research')];
  const e=await engine(passages),result=await e.search(form([role,{...imaging,matchIntent:'activity',importance:'essential'}]),{retrievalMode:'bm25'});
  assert.equal(result.results[0].id,'Practice');assert.ok(!result.results.some(c=>c.id==='Knee'));
});

test('removing imaging removes its retrieval expansion and associated research extras despite historical wording',async()=>{
  const e=await engine([profession('A'),fact('interest','A','Cardiac CT.','clinical-interest'),fact('research','A','I coauthored a cardiac CT study.','research')]);
  const brief=form([role]);brief.summary='Cardiologists with radiology interests';brief.history=['MRI research'];
  const result=await e.search(brief,{retrievalMode:'bm25'});assert.deepEqual(result.diagnostics.retrievalExpansions,[]);assert.deepEqual(result.results[0].relatedEvidence,[]);assert.ok(result.diagnostics.queryChannels.every(p=>p.channel==='role'));
});

test('hybrid broad discovery runs actual BM25 and semantic paths with their independent diagnostics',async()=>{
  const p=fact('ct','A','My clinical interests include cardiac CT.','clinical-interest');
  const vectors={[p.text]:[1,0,0],...Object.fromEntries(requirementQueries(imaging).map(q=>[q.query,[1,0,0]]))};
  const e=await engine([profession('A'),p],{vectors}),brief=form([role,imaging]);
  const hybrid=await e.search(brief);assert.ok(hybrid.diagnostics.bm25Candidates>0);assert.ok(hybrid.diagnostics.semanticCandidates>0);assert.equal(hybrid.results[0].id,'A');
  assert.equal((await e.search(brief,{retrievalMode:'bm25'})).diagnostics.semanticCandidates,0);assert.equal((await e.search(brief,{retrievalMode:'semantic'})).diagnostics.bm25Candidates,0);
});

test('broad imaging expansion cannot admit a generic cardiology biography by semantic similarity alone',async()=>{
  const passages=[profession('Imaging'),fact('imaging-proof','Imaging','Cardiac CT.','clinical-interest'),profession('General'),fact('generic-proof','General','I care for patients with heart disease.')];
  const e=await engine(passages,{fallback:[1,0,0]}),result=await e.search(form([role,imaging]));
  assert.deepEqual(result.results.map(c=>c.id),['Imaging']);assert.equal(result.diagnostics.semanticCandidates,2);
  const essential=await e.search(form([role,{...imaging,importance:'essential'}]));assert.deepEqual(essential.results.map(c=>c.id),['Imaging']);
});

test('parser-to-retrieval simple requests do not require a project purpose or fabricate hard gaps',async()=>{
  const e=await engine([profession('A'),fact('ct','A','My clinical interests include cardiac CT.','clinical-interest')]);
  const parsed=parseBrief({message:'Cardiologists with radiology interests'});assert.equal(parsed.needsClarification,false);
  const result=await e.search(parsed.brief,{retrievalMode:'bm25'});assert.equal(result.results[0].id,'A');assert.ok(result.results[0].requirementMatrix.every(r=>r.importance==='focus'));assert.equal(result.results[0].gaps.length,0);
});
