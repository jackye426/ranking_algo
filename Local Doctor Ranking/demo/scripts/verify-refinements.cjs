const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {SearchEngine}=require('../search.cjs');
const {createApp}=require('../server.cjs');

(async()=>{
  const engine=new SearchEngine();await engine.init();
  let lastInternal;
  const search=engine.search.bind(engine);
  engine.search=async criteria=>(lastInternal=await search(criteria));
  const server=createApp(engine).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let sessionId;const turns=[];
  async function turn(message,verify,{removeCriterion}={}) {
    const before=performance.now();
    const response=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,sessionId,removeCriterion})});
    assert.equal(response.status,200,message);
    const data=await response.json();sessionId=data.sessionId;
    assert.equal(data.diagnostics,undefined);
    if(process.env.SUPABASE_READER_TOKEN) assert.ok(!JSON.stringify(data).includes(process.env.SUPABASE_READER_TOKEN));
    for(const record of data.results) {
      assert.ok(record.personalizedMatch.summary);
      assert.ok(record.personalizedMatch.citations.length>0);
      assert.ok(record.personalizedMatch.citations.every(c=>c.sourceUrl));
      if(data.criteria.insurance) assert.ok(record.insuranceEvidence.some(e=>e.insurer===data.criteria.insurance));
      if(data.criteria.radiusMiles) assert.ok(record.distanceMiles<=data.criteria.radiusMiles+0.05);
    }
    if(data.criteria.sortByDistance) assert.ok(data.results.every((r,i,a)=>!i||r.distanceMiles>=a[i-1].distanceMiles));
    await verify(data,lastInternal);
    turns.push({message:message||`Remove ${removeCriterion}`,criteria:data.criteria,total:data.total,
      resultIds:lastInternal.diagnostics.ranking.map(r=>r.id),latencyMs:Math.round(performance.now()-before),
      examples:data.results.slice(0,2).map(r=>({id:r.id,name:r.name,fit:r.personalizedMatch})),
      retrieval:{bm25:lastInternal.diagnostics.bm25Candidates.length,semantic:lastInternal.diagnostics.semanticCandidates.length},generationModes:lastInternal.diagnostics.generationModes});
    console.log(JSON.stringify({turn:turns.length,message:message||removeCriterion,total:data.total}));
    return data;
  }
  const nonempty=d=>assert.ok(d.total>0);
  const clinical=d=>{assert.equal(d.criteria.topic,'knee');assert.equal(d.criteria.specialty,'Orthopaedics');};
  const subset=(current,previous)=>assert.ok(current.diagnostics.ranking.every(r=>previous.includes(r.id)),'adding a hard criterion must not admit outside candidates');
  try {
    await turn('Find a knee specialist in London',(d,r)=>{nonempty(d);assert.equal(d.criteria.topic,'knee');assert.equal(d.criteria.location,'London');assert.ok(r.diagnostics.bm25Candidates.length&&r.diagnostics.semanticCandidates.length);});
    let prior=turns.at(-1).resultIds;
    await turn('Only orthopaedic surgeons',(d,r)=>{nonempty(d);clinical(d);subset(r,prior);assert.ok(d.results.every(p=>/orthop(?:a)?edic/i.test(p.specialty)));});
    prior=turns.at(-1).resultIds;
    await turn('Those who perform knee replacement',(d,r)=>{nonempty(d);clinical(d);assert.deepEqual(d.criteria.procedures,['Knee replacement']);subset(r,prior);assert.ok(d.results.every(p=>p.personalizedMatch.citations.some(c=>c.criterion==='Knee replacement'&&/knee|unicompartmental/i.test(c.text))));});
    prior=turns.at(-1).resultIds;
    await turn('Also arthroscopy',(d,r)=>{nonempty(d);clinical(d);assert.deepEqual(d.criteria.procedures,['Knee replacement','Knee arthroscopy']);subset(r,prior);assert.ok(d.results.every(p=>p.personalizedMatch.citations.some(c=>c.criterion==='Knee arthroscopy'&&/arthroscop/i.test(c.text))));});
    prior=turns.at(-1).resultIds;
    await turn('Only those accepting Bupa',(d,r)=>{nonempty(d);clinical(d);assert.equal(d.criteria.procedures.length,2);subset(r,prior);assert.equal(d.criteria.insurance,'Bupa');assert.ok(d.results.every(p=>p.personalizedMatch.summary.includes('Bupa')));});
    await turn('Closer to SW5',d=>{nonempty(d);clinical(d);assert.equal(d.criteria.location,'SW5');assert.equal(d.criteria.insurance,'Bupa');assert.equal(d.criteria.procedures.length,2);assert.ok(d.results.every(p=>p.personalizedMatch.summary.includes('SW5')));});
    await turn('Within 5 miles',d=>{assert.equal(d.total,0);clinical(d);assert.equal(d.criteria.radiusMiles,5);assert.equal(d.criteria.insurance,'Bupa');});
    await turn('Closer to Bushey',d=>{nonempty(d);clinical(d);assert.equal(d.criteria.radiusMiles,5);assert.equal(d.criteria.location,'Bushey');assert.ok(d.results.every(p=>p.personalizedMatch.summary.includes('Bushey')&&!p.personalizedMatch.summary.includes('SW5')));});
    await turn('Any distance',d=>{nonempty(d);assert.equal(d.criteria.radiusMiles,null);assert.equal(d.criteria.location,'Bushey');assert.equal(d.criteria.insurance,'Bupa');assert.equal(d.criteria.procedures.length,2);});
    await turn('AXA instead of Bupa',d=>{assert.equal(d.total,0);clinical(d);assert.equal(d.criteria.insurance,'AXA');assert.equal(d.criteria.procedures.length,2);});
    await turn('Any insurer',d=>{nonempty(d);clinical(d);assert.equal(d.criteria.insurance,null);assert.ok(d.results.every(p=>!p.personalizedMatch.summary.includes('Bupa')&&!p.personalizedMatch.summary.includes('AXA')));});
    await turn('',d=>{nonempty(d);clinical(d);assert.deepEqual(d.criteria.procedures,[]);assert.equal(d.criteria.location,'Bushey');},{removeCriterion:'procedures'});
    await turn('',d=>{nonempty(d);assert.equal(d.criteria.specialty,null);assert.equal(d.criteria.topic,'knee');},{removeCriterion:'specialty'});
    await turn('Reset clinical search to dermatology',d=>{nonempty(d);assert.equal(d.criteria.specialty,'Dermatology');assert.equal(d.criteria.topic,'');assert.deepEqual(d.criteria.procedures,[]);assert.equal(d.criteria.location,'Bushey');assert.ok(d.results.every(p=>/dermatolog/i.test(p.specialty)));});
    await turn('Only those who perform mole removal',d=>{nonempty(d);assert.equal(d.criteria.specialty,'Dermatology');assert.deepEqual(d.criteria.procedures,['Skin lesion removal']);assert.ok(d.results.every(p=>p.personalizedMatch.citations.some(c=>c.criterion==='Skin lesion removal'&&/mole|skin|lesion/i.test(c.text))));});
    await turn('Closer to Unfindableville within 5 miles',d=>{assert.equal(d.total,0);assert.ok(d.notices.some(n=>/cannot apply your distance/.test(n)));assert.equal(d.criteria.procedures[0],'Skin lesion removal');});
    sessionId=undefined;
    await turn('Find an orthopaedic knee specialist in London accepting Bupa',d=>{nonempty(d);clinical(d);assert.equal(d.criteria.insurance,'Bupa');assert.equal(d.criteria.location,'London');});
    await turn('Those who perform knee replacement closer to SW5',d=>{nonempty(d);clinical(d);assert.deepEqual(d.criteria.procedures,['Knee replacement']);assert.equal(d.criteria.insurance,'Bupa');assert.equal(d.criteria.location,'SW5');assert.equal(d.criteria.sortByDistance,true);assert.ok(!d.notices.some(n=>/do not recognise/.test(n)));});
    assert.ok(turns.some(t=>t.generationModes.some(m=>m==='local-constrained-rag'||m==='openai-constrained-rag')),'real AI evidence selection must execute');
    const report={passed:true,verifiedAt:new Date().toISOString(),source:engine.source,quality:engine.quality,turns};
    const out=path.join(__dirname,'../.cache/refinement-verification.json');await fs.writeFile(out,JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:true,turns:turns.length,source:engine.source,report:out}));
  }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
