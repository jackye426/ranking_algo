'use strict';
// One explicit hosted acceptance run. Fictional briefs, server-owned evidence,
// at most three deliberate explanation requests, no retries or status events.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {cases}=require('./verify-model.cjs'),P=require('../public/projects.js');
const root=path.resolve(__dirname,'..');
async function main(){
  if(!process.argv.includes('--live'))throw Error('Explicit --live required');
  const base='https://docmap-expert-discovery-production.up.railway.app',file=path.join(root,'.cache/hosted-workflow.json');
  if(fs.existsSync(file))throw Error('Preserve the existing acceptance run.');
  const report={at:new Date().toISOString(),base,attempts:[],pending:true};
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  async function post(route,body){const start=performance.now(),r=await fetch(base+'/api/expert/'+route,{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(body),signal:AbortSignal.timeout(23000)}),data=await r.json();if(!r.ok)throw Error(route+': '+r.status+' '+data.error);return{data,durationMs:Math.round(performance.now()-start)};}
  const targetNames=[['kandiyil','banypersad'],['norris'],['hall']];
  for(let index=0;index<cases.length;index++){
    const item=cases[index],attempt={id:item.id,pending:true};report.attempts.push(attempt);save();
    const found=await post('search',{message:item.message}),snap=found.data;
    attempt.searchMs=found.durationMs;attempt.interpretation=snap.interpretationMode;attempt.brief=snap.brief;attempt.corpusVersion=snap.corpusVersion;
    let candidates=[...snap.results],cursor=snap.nextCursor;
    for(let page=0;page<4&&cursor&&!targetNames[index].every(name=>candidates.some(c=>c.name.toLowerCase().includes(name)));page++){
      const next=(await post('page',{sessionId:snap.sessionId,searchId:snap.searchId,cursor})).data;
      assert.equal(next.total,snap.total);candidates.push(...next.results);cursor=next.nextCursor;
    }
    const chosen=targetNames[index].map(name=>candidates.find(c=>c.name.toLowerCase().includes(name))).filter(Boolean);
    if(chosen.length!==targetNames[index].length)throw Error('Reviewed demonstration candidate absent in first thirty: '+item.id);
    attempt.candidates=chosen;
    const explanation=await post('explain',{sessionId:snap.sessionId,searchId:snap.searchId,candidateIds:chosen.map(c=>c.id),kind:item.kind});
    attempt.explanation=explanation.data;attempt.explanationMs=explanation.durationMs;
    attempt.ownedCitations=explanation.data.sections.every(s=>{const c=chosen.find(c=>c.id===s.candidateId);return c&&s.evidenceIds.every(id=>c.evidence.some(e=>e.id===id));});
    assert.equal(attempt.ownedCitations,true);
    let project=P.setBrief(P.createProject('Fictional demonstration — '+item.id),snap.brief,snap.corpusVersion);
    for(const c of chosen)project=P.saveCandidate(project,c,snap.brief,snap.corpusVersion);
    const json=P.exportJSON(project),restored=P.importJSON(json),html=P.exportHTML(project);
    assert.deepEqual(restored.candidates,project.candidates);assert.equal(restored.events.length,0);
    assert.ok(project.candidates.every(c=>c.qualification==='not-reviewed'&&c.independence==='not-reviewed'));
    fs.writeFileSync(path.join(root,'.cache/'+item.id+'-pack.html'),html);
    fs.writeFileSync(path.join(root,'.cache/'+item.id+'-project.json'),json);
    attempt.backupRoundTrip=true;attempt.htmlPack=true;
    if(index===0){
      const refined=(await post('search',{sessionId:snap.sessionId,message:'Remove regulatory experience but keep cardiac CT.'})).data;
      assert.ok(refined.brief.requirements.some(r=>/cardiac ct/i.test(r.label+' '+r.text)));
      assert.ok(!refined.brief.requirements.some(r=>r.kind==='regulatory'));
      project=P.setBrief(project,refined.brief,refined.corpusVersion);
      assert.ok(project.candidates.every(c=>c.needsReview));attempt.refinementRemovalAndStaleReview=true;
      const draft=(await post('explain',{sessionId:snap.sessionId,searchId:snap.searchId,candidateIds:[chosen[0].id],kind:'outreach'})).data;
      assert.equal(draft.provider,'evidence');assert.ok(draft.draft?.body);assert.equal(project.events.length,0);attempt.outreachWithoutEvent=true;
    }
    attempt.pending=false;save();console.log(JSON.stringify({id:attempt.id,explanationMs:attempt.explanationMs,provider:attempt.explanation.provider,ownedCitations:attempt.ownedCitations,backupRoundTrip:true}));
  }
  report.summary={distinctDeepSeekBriefs:report.attempts.filter(a=>a.explanation?.provider==='deepseek').length,completed:report.attempts.length};report.pending=false;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify(report.summary));
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
