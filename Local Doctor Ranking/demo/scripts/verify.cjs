const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {SearchEngine}=require('../search.cjs');
const {updateCriteria}=require('../criteria.cjs');
const {createApp}=require('../server.cjs');
(async()=>{
  const engine=new SearchEngine(); await engine.init();
  let criteria={}; const turns=[];
  for(const message of ['Find a knee specialist in London','Only those accepting Bupa','Closer to SW5']) {
    criteria=updateCriteria(criteria,message).criteria;
    const response=await engine.search(criteria);
    assert.ok(response.results.length>0,`no results for ${message}`);
    assert.equal(criteria.topic,'knee');
    assert.ok(response.diagnostics.bm25Candidates.length>0);
    assert.ok(response.diagnostics.semanticCandidates.length>0);
    assert.ok(response.results.every(r=>r.affiliationEvidence.sourceUrl.includes('spirehealthcare.com')));
    assert.ok(response.results.every(r=>r.reasons.every(reason=>reason.sourceUrl)));
    if(criteria.insurance) assert.ok(response.results.every(r=>r.insurers.includes('Bupa')));
    if(criteria.sortByDistance) {
      assert.ok(response.results.every(r=>Number.isFinite(r.distanceMiles)));
      assert.ok(response.results.every((r,i,a)=>i===0||r.distanceMiles>=a[i-1].distanceMiles));
    }
    turns.push({message,criteria:{...criteria},total:response.total,results:response.results.map(r=>({id:r.id,name:r.name,distanceMiles:r.distanceMiles,reasons:r.reasons})),diagnostics:response.diagnostics});
  }
  assert.ok(turns[1].total<turns[0].total,'insurance must actually narrow results');
  assert.notDeepEqual(turns[2].results.map(r=>r.id),turns[1].results.map(r=>r.id),'distance must actually rerank');
  assert.ok(turns.some(t=>t.diagnostics.generationModes.some(m=>/^(local|openai)-constrained-rag$/.test(m))),'configured generation should execute successfully');
  const semanticOnly=await engine.search({topic:'arthroplasty',location:'London'});
  assert.ok(semanticOnly.diagnostics.semanticCandidates.length>0);
  const noLex=new Set(semanticOnly.diagnostics.bm25Candidates.map(c=>c.id));
  assert.ok(semanticOnly.diagnostics.ranking.some(r=>!noLex.has(r.id)),'embedding retrieval should admit candidates absent from BM25');
  const impossibleInsurer='No such insurer in verified records';
  const empty=await engine.search({...criteria,insurance:impossibleInsurer}); assert.equal(empty.total,0);
  assert.ok(!empty.notices.some(n=>n.includes(`${impossibleInsurer} recognition is documented`)));
  if(engine.source==='supabase') {
    assert.ok(engine.records.length>1000,'live Supabase corpus must replace the 12-record snapshot');
    assert.ok(engine.quality.rejected.gmcProfileMismatch>0,'known source identity conflicts must be excluded');
    assert.ok(!engine.records.some(r=>r.sourceRecordIds.includes('bupa_28685')),'incorrect Sunil Kumar merge must not enter the index');
    assert.ok(engine.records.every(r=>r.sourceRecordIds.length>0),'each consultant must retain source lineage');
  }
  const unresolvedRadius=await engine.search({topic:'knee',location:'Unfindableville',radiusMiles:1,sortByDistance:true});
  assert.equal(unresolvedRadius.total,0); assert.ok(unresolvedRadius.notices.some(n=>n.includes('cannot apply your distance')));
  const server=createApp(engine).listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    let sessionId;
    for(const message of ['Find a knee specialist in London','Only those accepting Bupa','Closer to SW5']) {
      const r=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,sessionId})});
      assert.equal(r.status,200); const data=await r.json(); sessionId=data.sessionId;
      assert.equal(data.criteria.topic,'knee'); assert.equal(data.diagnostics,undefined);
      if(process.env.SUPABASE_READER_TOKEN) assert.ok(!JSON.stringify(data).includes(process.env.SUPABASE_READER_TOKEN));
    }
    const invalid=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'knee',sessionId:'forged'})}); assert.equal(invalid.status,410);
    const origin=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.test'},body:JSON.stringify({message:'knee'})}); assert.equal(origin.status,403);
    const privateFile=await fetch(`${base}/.env.local`); assert.equal(privateFile.status,404);
    const sourcePage=await fetch(`${base}${engine.records[0].evidenceUrl}`); assert.equal(sourcePage.status,200);
    assert.ok((await sourcePage.text()).includes('Profile sources'));
  } finally {server.close();}
  const report={verifiedAt:new Date().toISOString(),source:engine.source,quality:engine.quality,turns,
    semanticOnly:{query:'arthroplasty',diagnostics:semanticOnly.diagnostics},checks:{multiTurn:true,actualBm25:true,actualEmbeddings:true,constrainedRag:true,insuranceNarrows:true,distanceReranks:true,emptyState:true,httpSession:true,privateFilesBlocked:true}};
  const out=path.join(__dirname,'../.cache/verification.json'); await fs.mkdir(path.dirname(out),{recursive:true}); await fs.writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,source:report.source,quality:report.quality,turns:turns.map(t=>({message:t.message,total:t.total,results:t.results.map(r=>({name:r.name,distance:r.distanceMiles})),generationModes:t.diagnostics.generationModes})),report:out},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
