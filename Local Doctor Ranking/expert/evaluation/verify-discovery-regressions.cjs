'use strict';
// Fictional assessment briefs only. Exercises real retrieval without requesting
// optional generated explanations. Reports are immutable, local and unshipped.
const fs=require('node:fs'),path=require('node:path');
const P=require('../public/projects.js');
const cardiac='We are assessing software that analyses cardiac CT scans for coronary artery disease in adults. We need UK clinicians who personally report cardiac CT and can explain how false positives and false negatives could affect patient management. Experience evaluating diagnostic accuracy studies is preferred.';
const skin='We are assessing skin-lesion imaging software using dermoscopy in primary care. Find UK clinicians with hands-on dermoscopy experience who understand referral decisions in general practice. Experience evaluating diagnostic accuracy studies is preferred, not essential.';
const restricted='Only general practitioners for the clinical perspective; hospital dermatologists should not be included. Keep dermoscopy and primary care essential, and diagnostic research preferred.';
async function main(){
  const base=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:3100';
  const round=process.argv.find(a=>a.startsWith('--round='))?.slice(8);
  if(!/^(http:\/\/(127\.0\.0\.1|localhost):3100|https:\/\/docmap-expert-discovery-production\.up\.railway\.app)$/.test(base)||!round||!/^[a-z0-9-]+$/.test(round))throw Error('Use the authorised local/expert preview and a unique named round.');
  const health=await fetch(base+'/api/expert/health',{signal:AbortSignal.timeout(15000)});
  if(!health.ok)throw Error('Wait for the expert index to become ready before running acceptance checks.');
  const file=path.join(__dirname,`../.cache/discovery-regressions-${round}.json`);
  const report={at:new Date().toISOString(),base,round,pending:true,checks:[],requests:[]};
  fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});save();};
  async function search(name,body){
    const started=performance.now();
    const res=await fetch(base+'/api/expert/search',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(body),signal:AbortSignal.timeout(23000)});
    const data=await res.json();
    report.requests.push({name,status:res.status,durationMs:Math.round(performance.now()-started),mode:data.interpretationMode,total:data.total,brief:data.brief,clarification:data.needsClarification,notices:data.notices,shown:(data.results||[]).map(c=>({id:c.id,name:c.name,role:c.role,specialty:c.specialty,requirementMatrix:c.requirementMatrix,reasons:c.reasons,gaps:c.gaps}))});
    check(name+' responds',res.status===200,data.error);if(res.status!==200)throw Error(name+' failed');return data;
  }
  const c=await search('cardiac assessment',{message:cardiac});
  const canonicalKeys=c.brief.requirements.map(r=>r.kind+':'+r.text.trim().toLowerCase().replace(/\s+/g,' '));
  check('identical interpreted requirements are not duplicated',new Set(canonicalKeys).size===canonicalKeys.length);
  check('cardiac research remains preferred',c.brief.requirements.some(r=>r.kind==='research')&&c.brief.requirements.filter(r=>r.kind==='research').every(r=>r.importance==='preferred'));
  const n=c.results.find(c=>c.id==='expert-gmc-5197884');
  check('explicit CT reporting candidate appears on first page',!!n);
  const reporting=c.brief.requirements.find(r=>r.kind==='activity'&&r.importance==='essential'&&/report/i.test(r.evidence));
  check('documented required reporting leads the shortlist',reporting&&c.results[0]?.requirementMatrix.some(m=>m.requirementId===reporting.id&&m.status==='documented'));
  check('adult cardiology supports Adults',n?.requirementMatrix.some(m=>m.label==='Adults'&&m.status==='documented'),n?.requirementMatrix.find(m=>m.label==='Adults'));
  const strict=await search('cardiac documented essentials',{sessionId:c.sessionId,message:'Keep the same requirements.',documentedOnly:true});
  check('adult CT reporter survives documented-only',strict.results.some(c=>c.id==='expert-gmc-5197884'));
  const adult=strict.brief.requirements.find(r=>r.label==='Adults');
  if(adult){
    const removed=await search('remove adult criterion',{sessionId:c.sessionId,removeRequirementId:adult.id,documentedOnly:true});
    check('removed adult criterion absent',!removed.brief.requirements.some(r=>r.label==='Adults'));
    check('clinical criteria survive removal',removed.brief.requirements.some(r=>r.label==='Cardiac CT')&&removed.brief.requirements.some(r=>r.label==='Coronary artery disease'));
    const restored=await search('restore adult criterion',{sessionId:c.sessionId,message:'Adult patient experience is essential. Keep the other requirements.',documentedOnly:true});
    check('adult criterion restored as essential',restored.brief.requirements.some(r=>r.label==='Adults'&&r.importance==='essential'));
    check('adult re-addition still retains CT reporter',restored.results.some(c=>c.id==='expert-gmc-5197884'));
  }
  const s=await search('fresh skin assessment',{message:skin});
  check('fresh assessment has no cardiac criteria',!s.brief.requirements.some(r=>/cardiac ct|coronary artery|adults/i.test(r.label)));
  check('skin research remains preferred',s.brief.requirements.some(r=>r.kind==='research')&&s.brief.requirements.filter(r=>r.kind==='research').every(r=>r.importance==='preferred'));
  const p=s.results.find(c=>/Paul Norris/i.test(c.name));
  check('source-reviewed dermoscopy candidate recovered',!!p);
  if(p){
    const setting=p.requirementMatrix.find(m=>m.label==='Primary care');
    check('trial context does not become documented primary-care practice',setting&&setting.status!=='documented');
    let project=P.setBrief(P.createProject('Fictional discovery regression assessment'),s.brief,s.corpusVersion);
    project=P.saveCandidate(project,p,s.brief,s.corpusVersion);
    const imported=P.importJSON(P.exportJSON(project));
    check('export/import preserves brief and candidate matrix',JSON.stringify(imported.activeBrief)===JSON.stringify(project.activeBrief)&&JSON.stringify(imported.candidates[0].candidate.requirementMatrix)===JSON.stringify(p.requirementMatrix));
    check('export/import creates no decisions or outreach',imported.events.length===0&&imported.candidates[0].decisions.length===0&&imported.candidates[0].qualification==='not-reviewed');
    check('HTML pack retains evidence and qualification gaps',P.exportHTML(project).includes(p.name)&&P.exportHTML(project).includes('Primary care'));
  }
  const r=await search('only GPs and exclude dermatologists',{sessionId:s.sessionId,message:restricted});
  check('GP-only role scope explicit',r.brief.roleMode==='only'&&r.brief.roles.some(v=>/general practitioner/i.test(v)));
  check('dermatologist is excluded, never positive',r.brief.requirements.some(v=>v.kind==='role'&&/dermatologist/i.test(v.text)&&v.polarity==='exclude')&&!r.brief.roles.some(v=>/dermatologist/i.test(v)));
  check('preferred diagnostic research not promoted',r.brief.requirements.filter(v=>v.kind==='research').length>0&&r.brief.requirements.filter(v=>v.kind==='research').every(v=>v.importance==='preferred'));
  check('essential clinical scope retained',r.brief.requirements.some(v=>v.label==='Skin-lesion imaging'&&v.importance==='essential')&&r.brief.requirements.some(v=>v.label==='Primary care'&&v.importance==='essential'));
  check('no dermatologist shown after explicit exclusion',r.results.every(v=>!/dermatolog/i.test(v.role+' '+v.specialty)));
  check('only recorded GPs shown',r.results.every(v=>v.requirementMatrix.some(m=>m.label==='General practitioner'&&m.status==='documented')));
  const broaden=await search('explicit role change',{sessionId:s.sessionId,message:'Include dermatologists instead of general practitioners. Keep dermoscopy and primary care essential, diagnostic research preferred.'});
  check('later inclusion reverses negative role constraint',!broaden.brief.requirements.some(v=>v.kind==='role'&&/dermatologist/i.test(v.text)&&v.polarity==='exclude'));
  check('replacement allows dermatologist and excludes GP',broaden.brief.roles.includes('Dermatologist')&&broaden.brief.excludedRoles.includes('General practitioner')&&!broaden.brief.roles.includes('General practitioner'));
  check('clinical scope persists across role change',broaden.brief.requirements.some(v=>v.label==='Skin-lesion imaging')&&broaden.brief.requirements.some(v=>v.label==='Primary care'));
  const any=await search('remove all role restrictions',{sessionId:s.sessionId,message:'Any role is fine. Keep dermoscopy and primary care essential.'});
  check('broad permission removes latent role filters',any.brief.roleMode===null&&any.brief.excludedRoles.length===0&&!any.brief.requirements.some(v=>v.kind==='role'));
  check('broad role permission retains clinical requirements',any.brief.requirements.some(v=>v.label==='Skin-lesion imaging')&&any.brief.requirements.some(v=>v.label==='Primary care'));
  const vague=await search('underspecified fresh assessment',{message:'I need an expert.'});
  check('insufficient brief asks instead of ranking',vague.needsClarification===true&&vague.total===0&&vague.results.length===0);
  report.pending=false;report.completedAt=new Date().toISOString();report.summary={checks:report.checks.length,passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass),requests:report.requests.length};save();
  console.log(JSON.stringify(report.summary,null,2));if(report.summary.failed.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
