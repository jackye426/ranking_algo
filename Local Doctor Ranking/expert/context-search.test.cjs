'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ExpertSearchEngine,requirementQuery}=require('./search.cjs');
const {parseBrief}=require('./brief.cjs');
const r=(id,kind,text,importance='essential')=>({id,kind,label:text,text,importance});
const ct=r('ct','modality','Cardiac CT'),research=r('research','research','Clinical research','preferred');
const person=id=>({id,name:'Dr '+id,role:'Consultant',specialty:'Clinical practice',locations:[],sourceRecordIds:[id],evidenceIds:[]});
const fact=(id,candidateId,text,type='clinical-practice',extras={})=>({id,candidateId,text,type,field:'about',sourceRecordId:'source-'+candidateId,attributes:{},qualifiers:[],dates:{},attribution:'source-record',...extras});
const form=(requirements)=>({version:1,requirements,roles:[],summary:requirements.map(r=>r.text).join(' · ')});
async function engine(passages,{vectors={},fallback=[0,0,0,1]}={}){
  const calls=[];
  const embedQuery=async texts=>{calls.push([...texts]);return texts.map(text=>vectors[text]||fallback);};
  const candidates=[...new Set(passages.map(p=>p.candidateId))].map(person),result=new ExpertSearchEngine({embedQuery,cacheDir:null});
  await result.init({version:'synthetic-context-v1',candidates,passages});calls.length=0;return {engine:result,calls};
}
const clinicalPair=()=>[fact('a-ct','Alpha','I report cardiac CT.'),fact('z-ct','Zulu','I report cardiac CT.'),fact('z-context','Zulu','I study false positive referrals and downstream referral decisions.','research')];

test('an active assessment question changes queries and ranks equally supported clinicians through actual BM25',async()=>{
  const {engine:e}=await engine(clinicalPair());
  const before=await e.search(form([ct]),{retrievalMode:'bm25'});
  const question=r('q','question','false positive referrals');
  const after=await e.search(form([ct,question]),{retrievalMode:'bm25'});
  assert.equal(before.results[0].id,'Alpha');assert.equal(after.results[0].id,'Zulu');
  assert.deepEqual(after.results.map(c=>c.clinicalRelevance),[10,10]);
  assert.ok(after.diagnostics.queryChannels.some(p=>p.channel==='context'&&p.query===question.text&&p.weight<1));
  assert.ok(after.results[0].contextRelevance>0);assert.equal(after.results[1].contextRelevance,0);
});

test('context uses only active fields; removing it restores the base order and does not search history or summary',async()=>{
  const {engine:e}=await engine(clinicalPair());
  const b=form([ct]);b.summary='false positive referrals';b.history=['false positive referrals'];
  const result=await e.search(b,{retrievalMode:'bm25'});
  assert.equal(result.results[0].id,'Alpha');assert.ok(result.diagnostics.queryChannels.every(p=>p.channel!=='context'));
});

for(const kind of ['question','technology','workflow'])test(kind+' text receives its own contextual channel without becoming qualification',async()=>{
  const {engine:e}=await engine(clinicalPair());const context=r('context',kind,'false positive referrals');
  const result=await e.search(form([ct,context]),{retrievalMode:'bm25'}),candidate=result.results.find(c=>c.id==='Zulu'),row=candidate.requirementMatrix.find(m=>m.requirementId===context.id);
  assert.equal(row.status,'context');assert.deepEqual(row.evidenceIds,['z-context']);
  assert.ok(candidate.evidence.some(p=>p.id==='z-context'&&p.candidateId===candidate.id));
  assert.ok(!candidate.reasons.some(reason=>reason.status==='documented'&&reason.requirementId===context.id));
});

test('generic research semantic similarity cannot admit an unrelated clinical candidate',async()=>{
  const passages=[fact('ct','Cardiac','I report cardiac CT.'),fact('knee','Knee','I run clinical research trials on knee replacement.','research')];
  const vectors={ [passages[0].text]:[1,0,0,0],[passages[1].text]:[0,1,0,0],[requirementQuery(ct)]:[1,0,0,0],[requirementQuery(research)]:[0,1,0,0] };
  const {engine:e}=await engine(passages,{vectors});
  for(const mode of ['hybrid','semantic','bm25']){const result=await e.search(form([ct,research]),{retrievalMode:mode});assert.ok(result.results.some(c=>c.id==='Cardiac'));assert.ok(!result.results.some(c=>c.id==='Knee'),mode);}
});

test('a strong context semantic match also cannot replace clinical-anchor evidence',async()=>{
  const question=r('q','question','false positive referral decisions');
  const passages=[fact('ct','Cardiac','I report cardiac CT.'),fact('knee','Knee','I study false positive referral decisions in knee surgery.','research')];
  const vectors={ [passages[0].text]:[1,0,0,0],[passages[1].text]:[0,1,0,0],[requirementQuery(ct)]:[1,0,0,0],[question.text]:[0,1,0,0] };
  const {engine:e}=await engine(passages,{vectors});const result=await e.search(form([ct,question]));assert.ok(!result.results.some(c=>c.id==='Knee'));
});

test('a genuine anchor-query semantic lead can enter without inventing documented clinical support',async()=>{
  const passages=[fact('lead','Lead','I interpret cross-sectional pictures of the arteries supplying the heart.')];
  const {engine:e}=await engine(passages,{vectors:{[passages[0].text]:[1,0,0,0],[requirementQuery(ct)]:[1,0,0,0]}});
  const result=await e.search(form([ct]),{retrievalMode:'semantic'});assert.equal(result.results.length,1);assert.equal(result.results[0].requirementMatrix[0].status,'unknown');assert.equal(result.results[0].clinicalRelevance,0);
  assert.equal((await e.search(form([ct]),{retrievalMode:'semantic',documentedOnly:true})).results.length,0);
});

test('semantic context can distinguish clinical ties using owned evidence with no keyword overlap',async()=>{
  const question=r('q','question','unnecessary onward appointments'),passages=clinicalPair();
  const vectors={ [passages[0].text]:[1,0,0,0],[passages[2].text]:[0,1,0,0],[requirementQuery(ct)]:[1,0,0,0],[question.text]:[0,1,0,0] };
  const {engine:e}=await engine(passages,{vectors});const result=await e.search(form([ct,question]),{retrievalMode:'semantic'});
  assert.equal(result.results[0].id,'Zulu');assert.equal(result.results[0].requirementMatrix.find(m=>m.requirementId==='q').status,'context');assert.ok(result.results[0].evidence.some(p=>p.id==='z-context'));
});

test('context contribution is bounded and cannot outrank stronger clinical evidence',async()=>{
  const passages=[fact('a','Alpha','I report cardiac CT.'),fact('z','Zulu','Cardiac CT.','clinical-interest'),fact('z-research','Zulu','False positives, referrals, screening decisions and workflow outcomes.','research')];
  const {engine:e}=await engine(passages);const contexts=Array.from({length:9},(_,i)=>r('q'+i,['question','technology','workflow'][i%3],'false positives referrals screening '+i));
  const result=await e.search(form([ct,...contexts]),{retrievalMode:'bm25'});assert.equal(result.results[0].id,'Alpha');assert.ok(result.results.every(c=>c.contextRelevance<=.75));assert.ok(result.results.find(c=>c.id==='Zulu').contextRelevance>0);
});

test('contextual support preserves unknown essentials and strict documented-only exclusion',async()=>{
  const {engine:e}=await engine(clinicalPair());const b=form([ct,r('practice','currentPractice','Current practice'),r('q','question','false positive referrals')]);
  const result=await e.search(b,{retrievalMode:'bm25'});assert.ok(result.results.every(c=>c.requirementMatrix.find(m=>m.kind==='currentPractice').status==='unknown'));assert.equal((await e.search(b,{documentedOnly:true,retrievalMode:'bm25'})).results.length,0);
});

test('query embeddings remain cached across repeated search and only new context is embedded',async()=>{
  const {engine:e,calls}=await engine(clinicalPair());await e.search(form([ct]));calls.length=0;
  const b=form([ct,r('q','question','false positive referrals')]);await e.search(b);assert.deepEqual(calls,[['false positive referrals']]);calls.length=0;await e.search(b);assert.deepEqual(calls,[]);
});

test('an author-name-only quote uses a labelled reviewed summary for research relevance',async()=>{
  const passages=[fact('ct','Norris','I report cardiac CT.'),fact('study','Norris','Paul Norris is a named coauthor of the 2010 study protocol evaluating diagnostic performance.','research',{reviewedParaphrase:true,sourceQuote:'Paul Norris',review:{limitations:['Historical coauthorship is not a specific appraisal role.']}})];
  const {engine:e}=await engine(passages);const result=await e.search(form([ct,research]),{retrievalMode:'bm25'});
  const reason=result.results[0].reasons.find(r=>r.requirementId==='research');assert.match(reason.text,/^Reviewed source summary: Paul Norris is a named coauthor/);assert.ok(!reason.text.includes('“'));assert.equal(result.results[0].evidence.find(p=>p.id==='study').sourceQuote,'Paul Norris');
});

test('a relevant clause after a missing sentence space survives reason truncation',async()=>{
  const p=fact('ct','Clinician','I completed general professional work and a long unrelated introduction.'.repeat(5)+'I report cardiac CT and examine coronary arteries.');
  const {engine:e}=await engine([p]);const result=await e.search(form([ct]),{retrievalMode:'bm25'});assert.match(result.results[0].reasons[0].text,/I report cardiac CT/);assert.ok(!result.results[0].reasons[0].text.includes('unrelated introduction'));
});

test('strongest proof per clinical anchor and contextual proof survive the 18-passage AI snapshot',async()=>{
  const {snapshot}=require('./ai.cjs');
  const anchors=[ct,...Array.from({length:6},(_,i)=>r('clinical-'+i,'procedure','procedure'+i))];
  const passages=anchors.flatMap((a,i)=>Array.from({length:3},(_,n)=>fact('anchor-'+i+'-'+n,'Clinician',n===0?'I perform '+a.text+'.':'My practice includes '+a.text+'.')));
  passages.push(fact('context-proof','Clinician','False positive referrals can lead to unnecessary downstream appointments.','research',{sourceQuote:'False positive referrals can lead to unnecessary downstream appointments.',reviewedParaphrase:true,review:{limitations:['This recorded discussion is not proof of assessment competence.']}}));
  const b=form([...anchors,r('q','question','false positive referrals')]),{engine:e}=await engine(passages);
  const result=await e.search(b,{retrievalMode:'bm25'}),candidate=result.results[0];
  assert.ok(candidate.evidence.length>18);
  const selected=snapshot({brief:b,candidates:[candidate]}).candidates[0].evidence;
  assert.equal(selected.length,18);assert.ok(selected.some(e=>e.id==='context-proof'));
  for(const a of anchors){const m=candidate.requirementMatrix.find(m=>m.requirementId===a.id);assert.ok(selected.some(e=>e.id===m.evidenceIds[0]),a.id);}
  assert.deepEqual(selected.find(e=>e.id==='context-proof').limitations,['This recorded discussion is not proof of assessment competence.']);
});

test('duplicate context text and repeated owned passages cannot multiply the contextual contribution',async()=>{
  const passages=clinicalPair(),q=r('q','question','false positive referrals');
  const first=await engine(passages),base=await first.engine.search(form([ct,q]),{retrievalMode:'bm25'});
  const repeated=await engine([...passages,...Array.from({length:12},(_,i)=>({...passages[2],id:'duplicate-'+i}))]);
  const result=await repeated.engine.search(form([ct,q,{...q,id:'same-text',kind:'workflow'}]),{retrievalMode:'bm25'});
  assert.equal(result.diagnostics.queryChannels.filter(p=>p.channel==='context').length,1);
  assert.equal(result.results.find(c=>c.id==='Zulu').contextRelevance,base.results.find(c=>c.id==='Zulu').contextRelevance);
});
