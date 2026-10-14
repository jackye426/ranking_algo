'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCorpus}=require('../../data.cjs');
const {matrixFor}=require('../../search.cjs');

test('a long team sentence keeps its subject on later display chunks',()=>{
 const team='Our team provides '+Array(95).fill('coordinated specialist appointments').join(', ')+' and treats children with diabetes.';
 const corpus=buildCorpus([{id:'long-team-owner',name:'Alex Example',specialty:'Dietetics',profile_urls:{example:'https://example.org/alex-example'},about:team+' I treat adults with diabetes.'}]);
 const children=corpus.passages.find(p=>p.text.includes('treats children with diabetes'));
 assert.ok(children,'The complete clinical source text remains accessible');
 assert.ok(children.qualifiers.includes('team-context-not-individual-activity'));
 const matrix=matrixFor(corpus.candidates[0],corpus.passages,{requirements:[{id:'children',kind:'population',label:'Children',text:'Children',importance:'essential'}]});
 assert.notEqual(matrix[0].status,'documented');
 const own=corpus.passages.find(p=>p.text==='I treat adults with diabetes.');
 assert.ok(own&&!own.qualifiers.includes('team-context-not-individual-activity'),'Separate owner sentence does not inherit the collective subject');
});

// Fictional regression: a group service is useful background but does not
// establish each named person's clinical activity. No private source text.

test('team-level clinical care does not document the individual owner activity or population',()=>{
 const corpus=buildCorpus([{id:'fictional-team-owner',name:'Alex Example',specialty:'Dietetics',profile_urls:{example:'https://example.org/alex-example'},about:'We are a team of registered dietitians. We treat children with diabetes. Our team offers online consultations. Alex Example founded the service.'}]);
 const brief={requirements:[{id:'diabetes',kind:'condition',label:'Diabetes',text:'Diabetes',importance:'essential',matchIntent:'activity'},{id:'children',kind:'population',label:'Children',text:'Children',importance:'essential'}]};
 const matrix=matrixFor(corpus.candidates[0],corpus.passages,brief);
 for(const item of matrix)assert.notEqual(item.status,'documented',item.label+' must retain team/individual attribution limits');
 assert.ok(corpus.passages.some(p=>p.text.includes('We treat children with diabetes')),'Retain useful team evidence as qualified background');
});

test('a separately attributable individual clinical statement remains usable beside team background',()=>{
 const corpus=buildCorpus([{id:'fictional-team-owner',name:'Alex Example',specialty:'Dietetics',profile_urls:{example:'https://example.org/alex-example'},about:'We are a team of registered dietitians. I treat children with diabetes.'}]);
 const matrix=matrixFor(corpus.candidates[0],corpus.passages,{requirements:[{id:'diabetes',kind:'condition',label:'Diabetes',text:'Diabetes',importance:'essential',matchIntent:'activity'}]});
 assert.equal(matrix[0].status,'documented');
});

test('an explicitly individual clinical practice is not a team merely because it says practice',()=>{
 const text='My clinical practice incorporates ear conditions including hearing loss, tinnitus and cochlear implants.';
 const corpus=buildCorpus([{id:'fictional-ear-owner',name:'Alex Example',gmc_number:'1234567',about:text}]);
 const source=corpus.passages.find(p=>p.text===text);assert.ok(source);
 assert.ok(!source.qualifiers.includes('team-context-not-individual-activity'));
});

test('individual leadership does not make a we-treatment clause individually performed activity',()=>{
 const text="I am the Clinical Director of the hospital's Gamma Knife Unit where we treat benign and malignant tumours with focused radiation.";
 const corpus=buildCorpus([{id:'fictional-team-director',name:'Alex Example',gmc_number:'1234567',about:text}]);
 const source=corpus.passages.find(p=>p.text===text);assert.ok(source);
 assert.ok(source.qualifiers.includes('team-context-not-individual-activity'));assert.equal(source.type,'professional-background');
 const m=matrixFor(corpus.candidates[0],corpus.passages,{requirements:[{id:'treatment',kind:'condition',label:'Cancer',text:'Cancer',importance:'essential',matchIntent:'activity'}]});
 assert.notEqual(m[0].status,'documented');
});

const roleMatrix=about=>{
 const corpus=buildCorpus([{id:'fictional-founder',name:'Alex Example',profile_urls:{example:'https://example.org/alex-example'},about}]);
 return matrixFor(corpus.candidates[0],corpus.passages,{requirements:[{id:'profession',kind:'role',label:'Dietitian',text:'Dietitian',importance:'focus'},{id:'diabetes',kind:'condition',label:'Diabetes',text:'Diabetes',importance:'essential',matchIntent:'activity'}]});
};
test('an exact owner apposition documents the stated founder role, not team clinical activity',()=>{
 for(const clause of ['Example Service was founded in 2017, by Registered Dietitian, Alex Example.','Example Service was established by registered Dietitian Alex Example.']){
  const matrix=roleMatrix(clause+' We are a team of specialists. We treat children with diabetes.');
  assert.equal(matrix[0].status,'documented',clause);assert.notEqual(matrix[1].status,'documented');
  assert.ok(matrix[0].supportingEvidence.some(p=>p.text.includes('Alex Example')));
 }
});
test('wrong owner, collaborator, bare team and negated founder statements cannot establish the owner role',()=>{
 for(const clause of [
  'Example Service was founded by Registered Dietitian, Jamie Other.',
  'Example Service was founded by Registered Dietitian, Jamie Other, with Alex Example.',
  'Alex Example works alongside a service founded by Registered Dietitian, Jamie Other.',
  'Our service is a team of registered Dietitians.',
  'Example Service was not founded by Registered Dietitian, Alex Example.',
  'Alex Example founded a dietitian service.',
  'Example Service was founded by Registered Dietitian, Alex Exampleton.',
 ])assert.notEqual(roleMatrix(clause)[0].status,'documented',clause);
});

function colleagueCase(about,extra={}){
 const corpus=buildCorpus([{id:'fictional-colleague',name:'Dr Alex Jones',gmc_number:'1234567',specialty:'Clinical oncology',about,...extra}]);
 return {corpus,matrix:matrixFor(corpus.candidates[0],corpus.passages,{requirements:[{id:'role',kind:'role',label:'Physiotherapist',text:'Physiotherapist',importance:'essential'},{id:'ct',kind:'modality',label:'Cardiac CT',text:'Cardiac CT',matchIntent:'activity',importance:'focus'}]})};
}
test('named joint-clinic collaborator is qualified background, not potential owner profession',()=>{
 const text='Patients see Dr Jones jointly with Jamie Brown, Consultant Physiotherapist and Performance Specialist who has worked in elite football for over 20 years.';
 const {corpus,matrix}=colleagueCase(text);
 assert.equal(matrix[0].status,'unknown');assert.deepEqual(matrix[0].evidenceIds,[]);
 const cited=corpus.passages.find(p=>p.text.includes('Jamie Brown'));
 assert.equal(cited.text,text);assert.equal(cited.type,'professional-background');assert.ok(cited.qualifiers.includes('colleague-context-not-owner-evidence'));
});
test('same-sentence explicit owner activity survives literal colleague boundary',()=>{
 const text='I routinely report adult cardiac CT scans alongside Jamie Brown, consultant physiotherapist.';
 const {corpus,matrix}=colleagueCase(text);
 assert.equal(matrix[0].status,'unknown');assert.equal(matrix[1].status,'documented');
 assert.equal(matrix[1].supportingEvidence[0].text,'I routinely report adult cardiac CT scans');
 for(const p of corpus.passages.filter(p=>p.field==='about'))assert.ok(text.includes(p.text),'Every displayed piece must be an exact source substring');
});
test('a separate explicit owner sentence remains usable after collaborator context',()=>{
 const {matrix}=colleagueCase('I work alongside Jamie Brown, consultant physiotherapist. I routinely report adult cardiac CT scans.');
 assert.equal(matrix[0].status,'unknown');assert.equal(matrix[1].status,'documented');
});
test('a colleague negative statement cannot become the owner restriction',()=>{
 const {matrix}=colleagueCase('Patients see Dr Jones with Jamie Brown, consultant physiotherapist, who does not report cardiac CT scans.');
 assert.equal(matrix[1].status,'unknown');assert.deepEqual(matrix[1].evidenceIds,[]);
});
test('source text naming the owner after with is not labelled as someone else',()=>{
 const {corpus}=colleagueCase('Patients see the clinic team with Dr Alex Jones, consultant physician.');
 assert.ok(corpus.passages.filter(p=>p.field==='about').every(p=>!p.qualifiers.includes('colleague-context-not-owner-evidence')));
});
test('repaired biography retains colleague attribution and separate owner activity',()=>{
 const text='Patients see the clinic jointly with Jamie Brown, consultant physiotherapist. I routinely report adult cardiac CT scans.';
 const {matrix,corpus}=colleagueCase(null,{professional_context:[{kind:'biography',text,sourceUrl:'https://example.org/profile/alex-jones',repairProvenance:{releaseId:'fictional-release',reviewId:'fictional-review',originalSourceField:'about'}}]});
 assert.equal(matrix[0].status,'unknown');assert.equal(matrix[1].status,'documented');
 assert.ok(corpus.passages.some(p=>p.field==='professional_context.biography'&&p.qualifiers.includes('colleague-context-not-owner-evidence')));
});
