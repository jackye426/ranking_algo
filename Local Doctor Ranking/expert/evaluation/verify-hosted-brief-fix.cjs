'use strict';
// Recheck the two observed interpretation failures after correction. Fictional
// briefs only. No professional excerpts are sent for explanation generation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const P=require('../public/projects.js'),{cases}=require('./verify-model.cjs');
async function main(){
  if(!process.argv.includes('--live'))throw Error('Explicit --live required');
  const root=path.resolve(__dirname,'..'),file=path.join(root,'.cache/hosted-brief-fix.json'),base='https://docmap-expert-discovery-production.up.railway.app';
  if(fs.existsSync(file))throw Error('Preserve the existing verification.');
  const report={at:new Date().toISOString(),cases:[],pending:true};
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  async function search(body){const started=performance.now(),r=await fetch(base+'/api/expert/search',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(body),signal:AbortSignal.timeout(23000)}),data=await r.json();assert.equal(r.status,200);return{data,durationMs:Math.round(performance.now()-started)};}
  const briefs=["We are assessing software that evaluates skin-lesion images in primary care. Find UK experts with dermoscopy or skin-lesion imaging experience who can help examine how non-specialist users would interpret its results. Diagnostic study evaluation experience is preferred.",cases[1].message];
  for(let i=0;i<briefs.length;i++){
    const {data,durationMs}=await search({message:briefs[i]}),requirements=data.brief.requirements;
    const observation={id:i?'longer-study-brief':'homepage-skin-example',durationMs,mode:data.interpretationMode,brief:data.brief};report.cases.push(observation);save();
    const research=requirements.filter(r=>r.kind==='research');assert.equal(research.length,1);assert.equal(research[0].label,'Diagnostic study evaluation');assert.equal(research[0].importance,'preferred');assert.ok(!requirements.some(r=>r.kind==='role'&&/expertise|evaluation/i.test(r.text)));
    const candidate=data.results.find(c=>/Paul Norris/i.test(c.name));assert.ok(candidate);
    let project=P.setBrief(P.createProject('Fictional skin-imaging assessment'),data.brief,data.corpusVersion);project=P.saveCandidate(project,candidate,data.brief,data.corpusVersion);
    fs.writeFileSync(path.join(root,'.cache/final-example-pack.html'),P.exportHTML(project));fs.writeFileSync(path.join(root,'.cache/final-example-project.json'),P.exportJSON(project));
    if(i===0){const next=(await search({sessionId:data.sessionId,removeRequirementId:research[0].id})).data;assert.ok(!next.brief.requirements.some(r=>r.kind==='research'));assert.ok(next.brief.requirements.some(r=>r.kind==='modality'));assert.ok(next.brief.requirements.some(r=>r.kind==='setting'));observation.removalPreservesClinicalScope=true;}
    observation.passed=true;save();console.log(JSON.stringify({id:observation.id,mode:observation.mode,durationMs,passed:true}));
  }
  report.pending=false;report.completedAt=new Date().toISOString();save();
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
