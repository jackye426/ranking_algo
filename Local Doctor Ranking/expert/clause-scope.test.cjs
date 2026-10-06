'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCorpus,splitPassages,activityClauses}=require('./data.cjs');
const {matrixFor,ExpertSearchEngine}=require('./search.cjs');
const row=extra=>({id:'scope-source',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Obstetrics',...extra});
const endoscopy={id:'endoscopy',kind:'modality',label:'Endoscopy',text:'Endoscopy',importance:'essential'};
const clinic={id:'screening',kind:'procedure',label:'Pre-term birth screening',text:'Pre-term birth screening',importance:'essential'};
const training='Besides holding a diploma in operative endoscopy, she has a certificate in ultrasonography from St. Mary’s Hospital';
const practice='Currently, she runs a specialist clinic for pre-term birth screening.';
const brief={version:1,requirements:[endoscopy,clinic],roles:[]};

for(const [label,join]of [['normal sentence','. '],['joined sentence','.'],['newline','\n'],['semicolon','; ']]){
  test(`qualification and unrelated clinical activity retain separate exact scopes: ${label}`,()=>{
    const text=training+join+practice,corpus=buildCorpus([row({about:text})]),ps=corpus.passages.filter(p=>p.field==='about');
    const qualification=ps.find(p=>p.text.includes('diploma')),clinical=ps.find(p=>p.text.includes('specialist clinic'));
    assert.equal(qualification.type,'training');assert.equal(clinical.type,'clinical-practice');assert.notEqual(qualification.id,clinical.id);
    for(const p of ps)for(const statement of p.text.split('\n'))assert.ok(text.includes(statement),'every original source clause is literal');
    const matrix=matrixFor(corpus.candidates[0],ps,brief);
    assert.equal(matrix[0].status,'potential');assert.equal(matrix[1].status,'documented');
    assert.deepEqual(matrix[0].evidenceIds,[qualification.id]);assert.deepEqual(matrix[1].evidenceIds,[clinical.id]);
  });
  test(`matrix defends an over-broad imported practice label: ${label}`,()=>{
    const passage={id:'mixed',candidateId:'person',sourceRecordId:'scope-source',field:'about',text:training+join+practice,type:'clinical-practice',attributes:{modality:['endoscopy']},qualifiers:['reported-current-practice']};
    const matrix=matrixFor({id:'person'},[passage],brief);
    assert.equal(matrix[0].status,'potential');assert.equal(matrix[1].status,'documented');
  });
}

test('temporal sentence starts share boundaries without splitting Dr. or St. abbreviations',()=>{
  for(const start of ['Currently,','At present,','Presently,','Now,']){
    const text=`Dr. Alex Example holds a diploma in endoscopy from St. Mary’s Hospital.${start} she runs a clinic.`;
    const split=splitPassages(text),clauses=activityClauses(text);
    assert.equal(split.length,2);assert.equal(clauses.length,2);assert.ok(split[0].startsWith('Dr. Alex'));assert.ok(split[0].includes('St. Mary’s Hospital.'));assert.equal(split[1],`${start} she runs a clinic.`);
    assert.ok(split.every(s=>text.includes(s)));
  }
});

test('holding a certificate is training while the same modality performed later remains clinical',()=>{
  const corpus=buildCorpus([row({about:'She holds a certificate in endoscopy. Currently, she performs endoscopy in adults.'})]);
  const matrix=matrixFor(corpus.candidates[0],corpus.passages,{requirements:[endoscopy]});
  assert.equal(matrix[0].status,'documented');
  assert.ok(matrix[0].evidenceIds.every(id=>corpus.passages.find(p=>p.id===id).text.includes('performs endoscopy')));
});

test('a mixed parent practice type cannot inflate the training component’s clinical rank',async()=>{
  const person=id=>({id,name:id,role:'Clinician',specialty:'Medicine',locations:[],organisations:[],sourceRecordIds:[id],profileUrls:[]});
  const common={field:'about',qualifiers:[],attributes:{},attribution:'source-record'};
  const e=new ExpertSearchEngine({cacheDir:null,embedQuery:async texts=>texts.map(()=>[1,0])});
  await e.init({version:'synthetic-scope',candidates:[person('mixed'),person('qualified')],passages:[{...common,id:'mixed-proof',candidateId:'mixed',text:training+'.'+practice,type:'clinical-practice'},{...common,id:'training-proof',candidateId:'qualified',text:training+'.',type:'training'}]});
  const result=await e.search({version:1,requirements:[endoscopy],roles:[]},{retrievalMode:'bm25'});
  assert.equal(result.results.length,2);
  assert.ok(result.results.every(r=>r.requirementMatrix[0].status==='potential'));
  assert.equal(result.results[0].clinicalRelevance,result.results[1].clinicalRelevance);
});

test('separate birthplace and family sentences are excluded while professional clinical text remains',()=>{
  const clinical='She runs a clinic for children with skin disease.';
  const corpus=buildCorpus([row({about:'She was born in Leeds. She has two children. '+clinical})]);
  const ps=corpus.passages.filter(p=>p.field==='about');assert.equal(ps.length,1);assert.equal(ps[0].text,clinical);assert.equal(ps[0].type,'clinical-practice');
});

test('location sentinels are not presented as practice addresses or source evidence',()=>{
  const corpus=buildCorpus([row({locations:[{hospital:'None',address:'Unknown',postcode:'n/a'},{hospital:'Example Hospital',address:'None',city:'London',postcode:'SW5 0AA',country:'null'}]})]);
  assert.equal(corpus.candidates[0].locations.length,1);assert.equal(corpus.candidates[0].locations[0].address,'');assert.equal(corpus.candidates[0].locations[0].country,null);
  const location=corpus.passages.filter(p=>p.type==='location');assert.equal(location.length,1);assert.equal(location[0].text,'Example Hospital, London, SW5 0AA');
});
