const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeRecord}=require('./data-source.cjs');
const {rankPractitionersBM25}=require('../bm25Service.cjs');
const {SearchEngine,mapToRanking,reciprocalRankFusion,matchesFilters,explicitClinicalMatch,rerankCandidates,explanationFacts,shortlistEvidence,clinicalRetrievalQuery}=require('./search.cjs');
const {updateCriteria}=require('./criteria.cjs');
const rows=require('./data/public-spire-records.cjs');

test('clinical indexes exclude sporting hobbies and narrative filler cannot create BM25 matches',()=>{
  const {clinicalText,lexicalClinicalQuery}=require('./search.cjs');
  const base={id:'clinical',name:'Example',specialty:'Orthopaedics',clinicalInterests:['Knee pain'],procedures:[],insurers:[]};
  const hobby={...base,description:'I am a keen runner and have been running our network meetings.'};
  assert.equal(clinicalText(base),clinicalText(hobby));
  assert.equal(mapToRanking(hobby).description,'');
  assert.match(lexicalClinicalQuery('I have back pain'),/\bback\b/);
  assert.doesNotMatch(lexicalClinicalQuery('I want to get back to running'),/\bback\b/);
  const query=lexicalClinicalQuery('My periods are very painful and I have not been diagnosed');
  assert.doesNotMatch(query,/\b(?:have|been|diagnosed|very|and)\b/);
  const results=rankPractitionersBM25([{id:'irrelevant',description:'I have been working with patients for many years.'},{id:'relevant',description:'Period pains.'}],query);
  assert.equal(results.find(r=>r.document.id==='irrelevant').bm25Score,0);
  assert.ok(results.find(r=>r.document.id==='relevant').bm25Score>0);
});

test('painful-period symptoms require relevant clinical evidence without becoming an endometriosis diagnosis',()=>{
  const base={specialty:'Gynaecology',clinicalInterests:[],procedures:[],description:'',insurers:[]};
  for(const interest of ['Painful periods','Period pains','Menstrual problems','Dysmenorrhoea']) assert.equal(matchesFilters({...base,clinicalInterests:[interest]},{topic:'painful periods',procedures:[]}),true);
  for(const interest of ['Painful sex','Knee pain','Endometriosis excision']) assert.equal(matchesFilters({...base,clinicalInterests:[interest]},{topic:'painful periods',procedures:[]}),false);
  assert.equal(matchesFilters({...base,specialty:'Respiratory medicine',description:'For a period I worked in gynaecology.'},{topic:'painful periods',clinicalContext:'I have not been diagnosed'}),false);
});
test('only official Spire consultant affiliation is accepted, never lookalike domains',()=>{
  const row=rows[0]; assert.ok(normalizeRecord(row));
  assert.equal(normalizeRecord({...row,affiliationEvidence:{sourceUrl:'https://spirehealthcare.com.attacker.test/consultants/x'},profileUrl:null}),null);
  assert.equal(normalizeRecord({...row,blacklisted:true}),null);
});
test('insurance filtering requires consultant-specific source evidence',()=>{
  const row=normalizeRecord({...rows[0],insuranceEvidence:[]});
  assert.deepEqual(row.insurers,[]); assert.equal(matchesFilters(row,{insurance:'Bupa'}),false);
});
test('true BM25 has nonzero relevant scores and raw zero for an absent term',()=>{
  const docs=rows.map(normalizeRecord).map(mapToRanking);
  assert.ok(rankPractitionersBM25(docs,'knee').some(r=>r.bm25Score>0));
  assert.ok(rankPractitionersBM25(docs,'zxqvnonexistent').every(r=>r.bm25Score===0));
});
test('RRF rewards consensus and retains semantic-only candidates',()=>{
  const scores=reciprocalRankFusion([['a','b'],['c','a']]);
  assert.ok(scores.get('a')>scores.get('b')); assert.ok(scores.has('c'));
});
test('clinical reranking does not present a cardiologist as a knee specialist',()=>{
  const cardiologist=rows.find(r=>r.specialty==='Cardiology');
  assert.equal(explicitClinicalMatch(cardiologist,'knee'),false);
});
test('explicit joint requirements require evidence for all body areas unless phrased as alternatives',()=>{
  const surgeon=rows[0];
  assert.equal(explicitClinicalMatch(surgeon,'both hip shoulder surgery'),false);
  assert.equal(explicitClinicalMatch(surgeon,'hip or shoulder surgery'),true);
  assert.equal(explicitClinicalMatch(rows.find(r=>r.specialty==='Dermatology'),'arthroplasty'),false);
});
test('source records have unique IDs and insurer caveats survive normalization',()=>{
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  const waters=rows.map(normalizeRecord).find(r=>r.name.includes('Waters'));
  assert.match(waters.insuranceEvidence[0].text,/not fee assured/i);
});

test('nearest ranking considers every retrieved match beyond the former 60-candidate cutoff',()=>{
  const origin={latitude:51.5,longitude:0};
  const records=Array.from({length:150},(_,i)=>({id:String(i),name:`Consultant ${i}`,locations:[{name:'Spire test hospital',latitude:51.5,longitude:(150-i)/1000}]}));
  const lexical=records.slice(0,149).map((document,i)=>({document,bm25Score:150-i}));
  const semantic=records.map((record,i)=>({id:record.id,score:0.9-i/1000}));
  const result=rerankCandidates(records,lexical,semantic,{topic:'arthroplasty',sortByDistance:true},origin);
  assert.equal(result.ranked.length,150,'count includes the full retrieval union');
  assert.equal(result.ranked[0].record.id,'149','a semantic-only match below both old cutoffs can be nearest');
  assert.equal(result.lexicalCandidates.length,149); assert.equal(result.semanticCandidates.length,150);
  assert.ok(result.ranked.every((row,index,list)=>!index||row.distance.miles>=list[index-1].distance.miles));
});

test('reranking respects eligible IDs, relevance thresholds, and topic removal',()=>{
  const records=[{id:'eligible',name:'A',locations:[]},{id:'low',name:'B',locations:[]}];
  const lexical=[{document:{id:'excluded'},bm25Score:10},{document:records[1],bm25Score:0}];
  const semantic=[{id:'excluded',score:1},{id:'eligible',score:0.5},{id:'low',score:0.1}];
  assert.deepEqual(rerankCandidates(records,lexical,semantic,{topic:'knee'},null).ranked.map(row=>row.record.id),['eligible']);
  assert.equal(rerankCandidates(records,lexical,semantic,{topic:''},null).ranked.length,2,'removing topic returns all consultants satisfying remaining filters');
});

test('OR semantics survive parsing into the clinical filter',()=>{
  const query=updateCriteria({},'Find a hip or shoulder specialist').criteria.topic;
  assert.equal(explicitClinicalMatch(rows[0],query),true);
  assert.equal(explicitClinicalMatch(rows[0],updateCriteria({},'Find a hip and shoulder specialist').criteria.topic),false);
});

test('a procedure cannot satisfy a separate clinical-topic OR requirement',()=>{
  const kneeOnly={...normalizeRecord(rows[0]),specialty:'Orthopaedics',clinicalInterests:['Knee replacement'],procedures:['Knee replacement'],description:''};
  assert.equal(matchesFilters(kneeOnly,{topic:'hip or shoulder',specialty:'Orthopaedics',procedures:['Knee replacement']}),false);
  assert.equal(matchesFilters({...kneeOnly,clinicalInterests:['Hip pain','Knee replacement']},{topic:'hip or shoulder',specialty:'Orthopaedics',procedures:['Knee replacement']}),true);
});

test('aggregated match explanations link the exact field source or the stored evidence page',()=>{
  const record={...normalizeRecord(rows[0]),evidenceUrl:'/sources/test',fieldProvenance:{
    clinicalInterests:[{values:['Knee replacement'],sourceUrl:'https://www.finder.bupa.co.uk/Consultant/view/1'},{values:['Hip replacement'],sourceUrl:null}],
    specialty:[{sourceUrl:'https://www.phin.org.uk/profiles/test'}],
  }};
  const facts=explanationFacts(record);
  assert.equal(facts.find(fact=>fact.text==='Profile lists: Knee replacement').sourceUrl,'https://www.finder.bupa.co.uk/Consultant/view/1');
  assert.equal(facts.find(fact=>fact.text==='Profile lists: Hip replacement').sourceUrl,'/sources/test');
  assert.equal(facts.find(fact=>fact.text.startsWith('Specialty:')).sourceUrl,'https://www.phin.org.uk/profiles/test');
  assert.equal(facts.find(fact=>fact.text.startsWith('Practises at')).sourceUrl,'/sources/test');
});

test('evidence retrieval promotes relevant facts beyond the long-profile context and excludes unrelated facts',()=>{
  const facts=Array.from({length:35},(_,index)=>({text:`Profile lists: Hip pain treatment option ${index}`,sourceUrl:`/sources/hip-${index}`}));
  const knee={text:'Profile lists: I have a special interest in surgical and non-surgical treatment of knee conditions.',sourceUrl:'/sources/record'};
  facts.push(knee,{text:'Profile lists: Knee ligament reconstruction',sourceUrl:'https://www.finder.bupa.co.uk/Consultant/view/1'});
  const selected=shortlistEvidence('knee',facts);
  assert.equal(selected.length,2); assert.ok(selected.includes(knee));
  assert.ok(selected.every(fact=>fact.text.includes('knee')||fact.text.includes('Knee')));
  assert.equal(selected.find(fact=>fact===knee).sourceUrl,'/sources/record');
  assert.equal(facts.length,37,'source facts are not mutated');
});

test('evidence shortlisting caps positive matches and retains exact source facts when there is no BM25 match',()=>{
  const facts=Array.from({length:20},(_,index)=>({text:`Profile lists: Knee treatment ${index}`,sourceUrl:`/sources/${index}`}));
  assert.equal(shortlistEvidence('knee',facts).length,8);
  assert.deepEqual(shortlistEvidence('zxqvnomatch',facts),facts.slice(0,8));
  const sentence='I have a special interest in knee conditions.';
  const record={...normalizeRecord(rows[0]),clinicalInterests:[sentence],evidenceUrl:'/sources/exact'};
  assert.equal(explanationFacts(record)[0].text,`Profile lists: ${sentence}`);
  assert.equal(explanationFacts(record)[0].sourceUrl,'/sources/exact');
});

test('health discloses partial insurance evidence without treating unknown status as non-acceptance',()=>{
  const engine=new SearchEngine(); engine.source='supabase'; engine.quality={withInsuranceEvidence:4};
  assert.equal(engine.health().insuranceEvidenceCount,4);
  assert.match(engine.health().notice,/verified for 4 consultants; other insurance status is unknown/);
  engine.quality.withInsuranceEvidence=1; assert.match(engine.health().notice,/for 1 consultant;/);
});

test('AI evidence prefers a specific relevant phrase over isolated clinical tags',()=>{
  const tag={text:'Profile lists: Knee',value:'Knee',sourceUrl:'/sources/a'};
  const detail={text:'Record lists: Knee arthroscopy',value:'Knee arthroscopy',sourceUrl:'/sources/a'};
  const unrelated={text:'Record lists: Orthopaedics',value:'Orthopaedics',sourceUrl:'/sources/a'};
  assert.deepEqual(shortlistEvidence('knee',[tag,unrelated,detail]),[detail]);
  assert.deepEqual(shortlistEvidence('knee',[tag,unrelated]),[tag],'limited source evidence remains visible without invented detail');
});

test('clinical retrieval preserves explicit anchors before bounded patient context and excludes nonclinical filters',()=>{
  const criteria={topic:'knee pain',specialty:'Orthopaedics',procedures:['Knee arthroscopy'],clinicalContext:'  Knee gives way\nwhen walking.  ',location:'SW5',insurance:'Bupa',gender:'Female',language:'French'};
  assert.equal(clinicalRetrievalQuery(criteria),'knee pain. Orthopaedics. Knee arthroscopy. Knee gives way when walking.');
  assert.equal(clinicalRetrievalQuery(criteria,{forEvidence:true}),'knee pain. Knee arthroscopy. Knee gives way when walking.');
  assert.doesNotMatch(clinicalRetrievalQuery(criteria),/SW5|Bupa|Female|French/);
  const long={...criteria,clinicalContext:'instability '.repeat(100)+'LATE_CONTEXT_MARKER'};
  const prefix='knee pain. Orthopaedics. Knee arthroscopy. ';
  const query=clinicalRetrievalQuery(long);
  assert.ok(query.startsWith(prefix));assert.ok(query.length<=prefix.length+320);assert.doesNotMatch(query,/LATE_CONTEXT_MARKER/);
  assert.equal(long.clinicalContext,'instability '.repeat(100)+'LATE_CONTEXT_MARKER','the original context is retained for explanations');
  assert.equal(clinicalRetrievalQuery({...criteria,clinicalContext:' \n '}),'knee pain. Orthopaedics. Knee arthroscopy');
  assert.equal(clinicalRetrievalQuery({}),'consultant specialist');
});

test('unconfirmed diagnosis context cannot add positive retrieval terms while explicit anchors remain intact',()=>{
  const clinicalContext='I have not been diagnosed with endometriosis, but I have painful periods.';
  const criteria=Object.freeze({topic:'painful periods',specialty:'Gynaecology',procedures:[],clinicalContext});
  for(const forEvidence of [false,true]) {
    const query=clinicalRetrievalQuery(criteria,{forEvidence});
    assert.doesNotMatch(query,/endometriosis/i);
    assert.match(query,/painful periods/);
  }
  assert.equal(criteria.clinicalContext,clinicalContext);
  const explicit=clinicalRetrievalQuery({...criteria,topic:'endometriosis',procedures:['Endometriosis excision']});
  assert.match(explicit,/^endometriosis\. Gynaecology\. Endometriosis excision\./,'context masking must not remove explicit clinical requirements');
  assert.match(clinicalRetrievalQuery({...criteria,clinicalContext:'I have been diagnosed with endometriosis.'}),/diagnosed with endometriosis/,'positive diagnosis context is retained');
});

test('the search path masks an unconfirmed condition for BM25, semantic input and evidence retrieval only',async()=>{
  const base=normalizeRecord(rows[0]);
  const records=[
    {...base,id:'symptom',name:'A Consultant',specialty:'Gynaecology',clinicalInterests:['Painful periods','Endometriosis'],procedures:[],locations:[]},
    {...base,id:'unconfirmed-only',name:'B Consultant',specialty:'Gynaecology',clinicalInterests:['Menstrual problems','Endometriosis'],procedures:[],locations:[]},
  ];
  const criteria={topic:'painful periods',procedures:[],clinicalContext:'I have not been diagnosed with endometriosis, but I have painful periods.'};
  let semanticQuery,explanationInput;
  const engine=new SearchEngine({
    embedQuery:async texts=>{semanticQuery=texts[0];return [[1,0]];},
    personalize:async(_record,received,{facts})=>{
      explanationInput={criteria:received,facts};
      return {generationMode:'extractive-fallback',selected:facts,personalizedMatch:{citations:facts,caveats:[]}};
    },
  });
  Object.assign(engine,{ready:true,records,documents:records.map(mapToRanking),vectors:[[1,0],[0,1]]});
  const result=await engine.search(criteria);
  assert.doesNotMatch(semanticQuery,/endometriosis/i);
  assert.deepEqual(result.diagnostics.bm25Candidates.map(item=>item.id),['symptom']);
  assert.deepEqual(result.results.map(item=>item.id),['symptom']);
  assert.deepEqual(explanationInput.facts.map(fact=>fact.value),['Painful periods']);
  assert.equal(explanationInput.criteria.clinicalContext,criteria.clinicalContext,'the full unconfirmed-diagnosis context still reaches the explanation');
});

test('patient context changes actual BM25 relevance and reaches semantic and evidence retrieval in the search path',async()=>{
  const base=normalizeRecord(rows[0]);
  const records=[
    {...base,id:'arthritis',name:'A Consultant',specialty:'Orthopaedics',description:'',clinicalInterests:['Knee osteoarthritis'],procedures:[],locations:[],evidenceUrl:'/sources/arthritis'},
    {...base,id:'instability',name:'B Consultant',specialty:'Orthopaedics',description:'',clinicalInterests:['Knee osteoarthritis','Knee ligament instability'],procedures:[],locations:[],evidenceUrl:'/sources/instability'},
  ];
  const clinical={topic:'knee',specialty:'Orthopaedics',procedures:[]};
  const contextual={...clinical,clinicalContext:'My knee gives way with ligament instability when walking.'};
  const docs=records.map(mapToRanking);
  const lexical=criteria=>rankPractitionersBM25(docs,clinicalRetrievalQuery(criteria)).sort((a,b)=>b.bm25Score-a.bm25Score);
  assert.equal(lexical(clinical)[0].document.id,'arthritis');
  assert.equal(lexical(contextual)[0].document.id,'instability','real BM25 promotes the profile containing the contextual detail');
  const embeddingInputs=[],selectedFacts=[];
  const engine=new SearchEngine({
    embedQuery:async texts=>{embeddingInputs.push([...texts]);return [texts[0].includes('ligament instability')?[0,1]:[1,0]];},
    personalize:async(record,criteria,{facts})=>{
      selectedFacts.push({id:record.id,context:criteria.clinicalContext,facts});
      return {generationMode:'extractive-fallback',selected:facts.slice(0,1),personalizedMatch:{citations:facts.slice(0,1),caveats:[]}};
    },
  });
  Object.assign(engine,{ready:true,records,documents:docs,vectors:[[1,0],[0,1]]});
  const first=await engine.search(clinical);const refined=await engine.search(contextual);
  assert.equal(first.results[0].id,'arthritis');assert.equal(refined.results[0].id,'instability');
  assert.deepEqual(embeddingInputs,[[clinicalRetrievalQuery(clinical)],[clinicalRetrievalQuery(contextual)]]);
  assert.equal(refined.diagnostics.bm25Candidates[0].id,'instability');assert.equal(refined.diagnostics.semanticCandidates[0].id,'instability');
  assert.equal(first.total,2);assert.equal(refined.total,2,'context refines relevance without excluding other clinically eligible profiles');
  const evidence=selectedFacts.find(call=>call.id==='instability'&&call.context);
  assert.equal(evidence.facts[0].value,'Knee ligament instability');
  assert.equal(evidence.facts[0].sourceUrl,'/sources/instability');
  assert.ok(evidence.facts.every(fact=>!fact.text.includes('My knee')),'patient statements are not promoted into profile evidence');
});

test('patient history, negation and stage do not create or satisfy hard clinical filters',()=>{
  const kneeOnly={...normalizeRecord(rows[0]),specialty:'Orthopaedics',description:'',clinicalInterests:['Knee pain'],procedures:[]};
  const kneeReplacement={...kneeOnly,clinicalInterests:['Knee pain','Knee replacement']};
  const criteria={topic:'knee',specialty:'Orthopaedics',procedures:[]};
  for(const clinicalContext of ['I had hip replacement previously.','I have not had knee replacement.','Stage 3; knee pain when walking.']) {
    assert.equal(matchesFilters(kneeOnly,{...criteria,clinicalContext}),true,'context does not introduce a hip/procedure/stage requirement');
    assert.equal(matchesFilters(kneeOnly,{...criteria,procedures:['Knee replacement'],clinicalContext}),false,'context cannot substitute for required source procedure evidence');
    assert.equal(matchesFilters(kneeReplacement,{...criteria,procedures:['Knee replacement'],clinicalContext}),true);
  }
  const hipOnly={...kneeOnly,clinicalInterests:['Hip replacement']};
  assert.equal(matchesFilters(hipOnly,{...criteria,clinicalContext:'Prior hip replacement with walking difficulty.'}),false,'context cannot bypass the explicit knee anchor');
  assert.equal(matchesFilters(kneeReplacement,{...criteria,specialty:'Cardiology',clinicalContext:'Knee replacement'}),false,'the explicit specialty gate is unchanged');
});
