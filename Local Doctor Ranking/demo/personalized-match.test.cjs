const test=require('node:test');
const assert=require('node:assert/strict');
const {createPersonalizedMatch,plainClinicalPhrase,clinicalContextCaveat}=require('./personalized-match.cjs');
const record={name:'Mr Example',specialty:'Orthopaedics',evidenceUrl:'/sources/example',profileUrl:'https://www.spirehealthcare.com/consultant-profiles/example/',languages:['French'],gender:null,
  insuranceEvidence:[{insurer:'Bupa',text:'Bupa lists this consultant, but he is not fee assured. Some fees can exceed cover.',sourceUrl:'https://www.finder.bupa.co.uk/example'}]};
const facts=[{text:'Profile lists: knee replacement',value:'knee replacement',sourceUrl:'/sources/example'}];
const criteria={topic:'knee',specialty:'Orthopaedics',procedures:['Knee replacement'],location:'SW5',insurance:'Bupa',radiusMiles:20,sortByDistance:true};
const match={matches:true,evidence:[{kind:'specialty',criterion:'Orthopaedics',text:'Orthopaedics'},{kind:'procedure',criterion:'Knee replacement',text:'Total knee replacement'}]};
test('AI receives all accumulated preferences and personalised explanation links each supported dimension',async()=>{
  let request;
  const r=await createPersonalizedMatch(record,criteria,{facts,clinicalMatch:match,distance:{miles:11.52,location:{name:'Spire Bushey'}},selectEvidence:async(q,f)=>{request=JSON.parse(q);return {selected:[f[0]],mode:'local-constrained-rag'};}});
  assert.equal(request.clinicalNeed,'knee');assert.equal(request.specialty,'Orthopaedics');assert.deepEqual(request.procedures,['Knee replacement']);assert.equal(request.location,'SW5');assert.equal(request.insurer,'Bupa');assert.equal(request.radiusMiles,20);
  assert.equal(r.personalizedMatch.provider,'local-ai');
  assert.match(r.personalizedMatch.summary,/knee replacement/);assert.match(r.personalizedMatch.summary,/11.5 miles from SW5/);assert.match(r.personalizedMatch.summary,/Bupa lists/);assert.match(r.personalizedMatch.summary,/not fee assured/);
  assert.deepEqual(r.personalizedMatch.citations.slice(0,3).map(c=>c.criterion),['Knee replacement','Bupa','Location']);
  assert.ok(r.personalizedMatch.caveats.some(c=>c.includes('not fee assured')));
});
test('removing an insurance or location filter cannot retain stale personalised claims',async()=>{
  const r=await createPersonalizedMatch(record,{topic:'hip',procedures:[]},{facts:[{text:'Hip surgery',sourceUrl:'/sources/example'}],selectEvidence:async(_q,f)=>({selected:f,mode:'local-constrained-rag'})});
  assert.match(r.personalizedMatch.summary,/hip/);assert.doesNotMatch(r.personalizedMatch.summary,/Bupa|SW5/);assert.ok(!r.personalizedMatch.citations.some(c=>c.criterion==='Bupa'));
});
test('model failure and invented facts use truthful extractive fallback without unsupported claims',async()=>{
  for(const selectEvidence of [async()=>{throw new Error('offline')},async()=>({selected:[{text:'Best surgeon with 99% success',sourceUrl:'https://attacker.test'}],mode:'local-constrained-rag'})]) {
    const r=await createPersonalizedMatch(record,{topic:'knee'},{facts,selectEvidence});
    assert.equal(r.personalizedMatch.provider,'extractive');assert.doesNotMatch(JSON.stringify(r),/99%|Best surgeon|attacker/);assert.ok(r.personalizedMatch.citations.every(c=>c.sourceUrl));
  }
});

test('duplicate selected and primary facts become one citation, with plain-English fallback and explicit user context',async()=>{
  const evidence={text:'Profile lists: Laparoscopic excision of endometriosis +/- ureterolysis',sourceUrl:'/sources/endo'};
  let request;
  const answer=await createPersonalizedMatch({...record,name:'Dr Example',specialty:'Consultant Gynaecologist'},{topic:'endometriosis',clinicalContext:'Stage 3 endometriosis'},{facts:[evidence],selectEvidence:async(q)=>{request=JSON.parse(q);return{selected:[evidence,evidence],mode:'local-constrained-rag'}}});
  assert.equal(request.clinicalContext,'Stage 3 endometriosis');assert.equal(request.contextIsUserProvided,true);
  assert.equal(answer.personalizedMatch.citations.filter(c=>c.text===evidence.text).length,1);
  assert.match(answer.personalizedMatch.summary,/keyhole surgery to remove endometriosis tissue/);
  assert.doesNotMatch(answer.personalizedMatch.summary,/\+\/-|ureterolysis/);
  assert.match(answer.personalizedMatch.summary,/stage 3.*does not confirm/i);
});

test('a technique attached to a different condition does not become endometriosis expertise',()=>{
  assert.equal(plainClinicalPhrase('I specialise in laparoscopic hysterectomy, endometriosis and ovarian cysts.',{topic:'endometriosis'}),'endometriosis');
  assert.equal(plainClinicalPhrase('Laparoscopic excision of endometriosis +/- ureterolysis',{topic:'endometriosis'}),'keyhole surgery to remove endometriosis tissue');
});

test('an unrelated stage match and a severe-condition label do not verify stage-specific experience',()=>{
  const c={topic:'endometriosis',clinicalContext:'Stage III endometriosis'};
  assert.ok(clinicalContextCaveat(c,[{text:'Experience with stage 3 kidney disease.'},{text:'Severe endometriosis.'}]));
  assert.equal(clinicalContextCaveat(c,[{text:'The profile lists experience treating stage 3 endometriosis.'}]),null);
});

const clinicalFact=value=>({text:'Profile lists: '+value,value,sourceUrl:'/sources/example'});
test('period pains is direct symptom evidence even when FLAN selects painful sex from its shortlist',async()=>{
  const unrelated=clinicalFact('painful sex'),period=clinicalFact('period pains');
  const r=await createPersonalizedMatch(record,{topic:'painful periods',clinicalContext:'My periods are very painful and I haven’t been diagnosed'},
    {facts:[unrelated],clinicalFacts:[unrelated,clinicalFact('heavy periods'),period],selectEvidence:async()=>({selected:[unrelated],mode:'local-constrained-rag'})});
  assert.equal(r.personalizedMatch.citations[0].text,period.text);
  assert.match(r.personalizedMatch.summary,/profile includes painful periods/);
  assert.doesNotMatch(JSON.stringify(r.personalizedMatch),/painful sex|endometriosis/);
  assert.equal(r.personalizedMatch.provider,'extractive');
});

test('exact painful-period evidence displaces unrelated diagnostic laparoscopy selected by FLAN',async()=>{
  const painful=clinicalFact('Painful periods'),laparoscopy=clinicalFact('Diagnostic and Operative Laparoscopy');
  const r=await createPersonalizedMatch(record,{topic:'painful periods'},
    {facts:[painful,laparoscopy],selectEvidence:async()=>({selected:[laparoscopy],mode:'local-constrained-rag'})});
  assert.equal(r.personalizedMatch.citations[0].text,painful.text);
  assert.doesNotMatch(r.personalizedMatch.summary,/laparoscop|keyhole/i);
});

test('partial overlap cannot bridge painful sex and heavy periods into painful-period evidence',async()=>{
  for(const value of ['painful sex; heavy periods','painful sex and heavy periods','Endometriosis: heavy periods: fertility issues']) {
    const f=clinicalFact(value);
    const r=await createPersonalizedMatch(record,{topic:'painful periods'},
      {facts:[f],selectEvidence:async()=>({selected:[f],mode:'local-constrained-rag'})});
    assert.equal(r.personalizedMatch.citations.length,1,value);
    assert.equal(r.personalizedMatch.citations[0].criterion,'Specialty');
    assert.doesNotMatch(r.personalizedMatch.summary,/profile includes|connects with|endometriosis|painful sex/i,value);
  }
});

test('an unconfirmed diagnosis cannot become symptom evidence or the fallback summary',async()=>{
  const symptomCriteria={topic:'painful periods',procedures:[],clinicalContext:'I have not been diagnosed with endometriosis, but I have painful periods.'};
  const endometriosis=clinicalFact('Endometriosis'),menstrual=clinicalFact('Menstrual problems');
  let receivedContext;
  for(const direct of [[],[clinicalFact('Period pains')]]) {
    const pool=[menstrual,endometriosis,...direct];
    const answer=await createPersonalizedMatch({...record,specialty:'Gynaecology'},symptomCriteria,{
      facts:pool,clinicalFacts:pool,selectEvidence:async(query)=>{
        receivedContext=JSON.parse(query).clinicalContext;
        return {selected:[endometriosis],mode:'local-constrained-rag'};
      },
    });
    assert.equal(receivedContext,symptomCriteria.clinicalContext,'retain complete patient wording for interpretation, never rewrite it');
    assert.doesNotMatch(JSON.stringify(answer.personalizedMatch),/endometriosis/i);
    assert.deepEqual(answer.personalizedMatch.citations.filter(c=>c.criterion!=='Specialty').map(c=>c.text),direct.map(f=>f.text));
    if(direct.length) assert.match(answer.personalizedMatch.summary,/profile includes painful periods/);
    else assert.doesNotMatch(answer.personalizedMatch.summary,/profile includes|connects with/);
  }
});

test('negative context does not suppress an explicit clinical topic or a confirmed context fact',async()=>{
  const endometriosis=clinicalFact('Endometriosis'),period=clinicalFact('Period pains');
  for(const request of [
    {topic:'endometriosis',clinicalContext:'I have not been diagnosed with endometriosis.'},
    {topic:'painful periods',clinicalContext:'I have been diagnosed with endometriosis.'},
  ]) {
    const answer=await createPersonalizedMatch(record,request,{facts:[period,endometriosis],selectEvidence:async()=>({selected:[],mode:'extractive-fallback'})});
    assert.ok(answer.personalizedMatch.citations.some(c=>c.text===endometriosis.text));
  }
});

test('runner context adds sourced clinical interests even when FLAN selects generic knee pain',async()=>{
  const knee=clinicalFact('Knee pain'),running=clinicalFact('Running injuries'),runnerKnee=clinicalFact("Runner's knee");
  const r=await createPersonalizedMatch(record,{topic:'knee pain',clinicalContext:'I’m a runner with knee pain and want to get back to running'},
    {facts:[knee],clinicalFacts:[knee,clinicalFact('Running injures'),running,runnerKnee],selectEvidence:async()=>({selected:[knee],mode:'local-constrained-rag'})});
  assert.equal(r.personalizedMatch.citations[0].text,knee.text);
  const context=r.personalizedMatch.citations.filter(c=>c.criterion==='Relevant patient context');
  assert.equal(context.length,2);
  assert.ok(context.some(c=>c.text===running.text));
  assert.ok(context.some(c=>c.text===runnerKnee.text));
  assert.ok(context.every(c=>c.sourceUrl==='/sources/example'));
  assert.doesNotMatch(r.personalizedMatch.summary,/will.*run|return to running|faster recovery/);
});

test('hobby and administrative running mentions never supplement clinical context',async()=>{
  const knee=clinicalFact('Knee pain');
  const extra=['He is a keen runner, a sport he has enjoyed since childhood','I am running our East Midlands Specialist Orthopaedic Network meeting','I enjoy running in my spare time'].map(clinicalFact);
  const r=await createPersonalizedMatch(record,{topic:'knee pain',clinicalContext:'I am a runner'},
    {facts:[knee],clinicalFacts:[knee,...extra],selectEvidence:async()=>({selected:[knee],mode:'local-constrained-rag'})});
  assert.equal(r.personalizedMatch.citations.length,1);
});

test('required procedure evidence stays first while topic and context evidence supplement it',async()=>{
  const knee=clinicalFact('Knee pain'),running=clinicalFact('Running injuries');
  const r=await createPersonalizedMatch(record,{topic:'knee pain',procedures:['Knee replacement'],clinicalContext:'I am a runner'},
    {facts:[knee],clinicalFacts:[knee,running],clinicalMatch:{evidence:[{kind:'procedure',criterion:'Knee replacement',text:'Total knee replacement',sourceUrl:'/sources/procedure'}]},selectEvidence:async()=>({selected:[knee],mode:'local-constrained-rag'})});
  assert.equal(r.personalizedMatch.citations[0].criterion,'Knee replacement');
  assert.equal(r.personalizedMatch.citations[0].sourceUrl,'/sources/procedure');
  assert.ok(r.personalizedMatch.citations.some(c=>c.text===running.text));
  assert.match(r.personalizedMatch.summary,/knee replacement/);
});

test('a matching symptom in a multi-condition list wins over an unrelated endometriosis translation',()=>{
  const mixed='Menstrual disorders, including heavy or/and painful periods; endometriosis; laparoscopic surgery';
  assert.equal(plainClinicalPhrase(mixed,{topic:'painful periods'}),'painful periods');
  assert.equal(plainClinicalPhrase('Period pains',{topic:'painful periods'}),'painful periods');
  assert.notEqual(plainClinicalPhrase('Endometrial ablation: Endometriosis: Heavy periods: Fertility issues',{topic:'painful periods'}),'endometriosis');
});

test('painful knee and knee pain are bounded linguistic equivalents without crossing list items',async()=>{
  const knee=clinicalFact('Investigation of painful knee');
  const r=await createPersonalizedMatch(record,{topic:'knee pain'},{facts:[knee],selectEvidence:async()=>({selected:[knee],mode:'local-constrained-rag'})});
  assert.equal(r.personalizedMatch.citations[0].text,knee.text);
  assert.match(r.personalizedMatch.summary,/profile includes knee pain/);
  for(const value of ['Painful hip; knee replacement','Painful hip and knee replacement','Painful knee replacements']) {
    const f=clinicalFact(value);
    const other=await createPersonalizedMatch(record,{topic:'knee pain'},{facts:[f],selectEvidence:async()=>({selected:[f],mode:'local-constrained-rag'})});
    assert.ok(other.personalizedMatch.citations.every(c=>c.criterion==='Specialty'));
    assert.doesNotMatch(other.personalizedMatch.summary,/profile includes knee pain|connects with/);
  }
});

test('semantic-only candidates cite recorded specialty without claiming exact symptom fit',async()=>{
  const generic=clinicalFact('Heavy menstrual bleeding');
  const r=await createPersonalizedMatch({...record,specialty:'Obstetrics and gynaecology',fieldProvenance:{specialty:[{sourceUrl:'https://www.spirehealthcare.com/consultants/example/'}]}},
    {topic:'painful periods'},{facts:[generic],selectEvidence:async()=>({selected:[generic],mode:'local-constrained-rag'})});
  assert.deepEqual(r.personalizedMatch.citations.map(c=>c.criterion),['Specialty']);
  assert.equal(r.personalizedMatch.citations[0].sourceUrl,'https://www.spirehealthcare.com/consultants/example/');
  assert.match(r.personalizedMatch.summary,/specialist in obstetrics and gynaecology/);
  assert.doesNotMatch(r.personalizedMatch.summary,/profile includes|connects with|painful periods/);
  assert.match(r.personalizedMatch.summary,/ask whether their practice covers your needs/);
});
