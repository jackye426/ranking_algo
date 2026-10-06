'use strict';
// Exact quoted audit refinements and controlled initial equivalents: the audit
// did not supply its complete initial prompts. No existing project is touched.
const fs=require('node:fs'),path=require('node:path'),E=require('../public/evidence.js'),P=require('../public/projects.js');
async function main(){
  const base=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:3100',round=process.argv.find(a=>a.startsWith('--round='))?.slice(8);
  if(!/^(http:\/\/(127\.0\.0\.1|localhost):3100|https:\/\/docmap-expert-discovery-production\.up\.railway\.app)$/.test(base)||!round||!/^[a-z0-9-]+$/.test(round))throw Error('Select the authorised expert preview and a unique round.');
  const health=await fetch(base+'/api/expert/health',{signal:AbortSignal.timeout(15000)});if(!health.ok)throw Error('Wait for index readiness.');
  const file=path.join(__dirname,`../.cache/audit-fixes-${round}.json`),report={startedAt:new Date().toISOString(),base,round,health:await health.json(),pending:true,checks:[],requests:[]};fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});save();};
  async function search(name,body){const start=performance.now(),r=await fetch(base+'/api/expert/search',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(body),signal:AbortSignal.timeout(23000)}),data=await r.json();report.requests.push({name,status:r.status,durationMs:Math.round(performance.now()-start),data});check(name+' responds',r.ok,data.error);if(!r.ok)throw Error(name+' failed');return data;}
  const initial='Find UK clinicians who report cardiac CT for coronary artery disease in adults. Clinical reporting is essential. Experience evaluating diagnostic accuracy studies would be helpful.';
  const cardiac=await search('helpful cardiac research',{message:initial});
  const research=cardiac.brief.requirements.filter(r=>r.kind==='research');
  check('helpful research is preferred',research.length>0&&research.every(r=>r.importance==='preferred'));
  check('reporting remains essential',cardiac.brief.requirements.some(r=>r.kind==='activity'&&r.importance==='essential'));
  const optional=await search('Research should be optional',{sessionId:cardiac.sessionId,message:'Research should be optional.'});
  check('optional updates existing research ID',research.every(r=>optional.brief.requirements.some(n=>n.id===r.id&&n.importance==='preferred')));
  check('directive never becomes a literal requirement',!optional.brief.requirements.some(r=>/should be optional/i.test(r.text+' '+r.label)));
  const removed=await search('Remove the UK location requirement',{sessionId:cardiac.sessionId,message:'Remove the UK location requirement.'});
  check('UK removed from structured location',removed.brief.geography===null&&!removed.brief.requirements.some(r=>r.kind==='geography'));
  check('clinical scope survives location removal',['Cardiac CT','Coronary artery disease','Adults'].every(label=>removed.brief.requirements.some(r=>r.label===label)));
  const context=await search('UK in software context',{message:'We are assessing cardiac CT software for UK clinicians with coronary disease experience. Clinical reporting is essential; validation research is helpful.'});
  const cleared=await search('remove location from retrieval context',{sessionId:context.sessionId,message:'Remove the UK location requirement.'});
  check('UK does not survive inside active retrieval text',!cleared.brief.requirements.some(r=>/\bUK\b|United Kingdom/i.test(r.text+' '+r.label+' '+r.evidence)));
  check('validation research never becomes professional role',!context.brief.requirements.some(r=>r.kind==='role'&&/validation research/i.test(r.text)));
  const skin=await search('dermoscopy helpful research',{message:'We are assessing skin-lesion imaging software using dermoscopy in primary care for adults. Clinical experience is essential; validation research is helpful.'});
  check('skin research is preferred',skin.brief.requirements.some(r=>r.kind==='research')&&skin.brief.requirements.filter(r=>r.kind==='research').every(r=>r.importance==='preferred'));
  const aliases=await search('primary-care equivalent wording',{sessionId:skin.sessionId,message:'Primary-care experience is essential. Find primary-care clinicians.'});
  check('primary care aliases are one setting',aliases.brief.requirements.filter(r=>r.kind==='setting'&&/primary/i.test(r.label)).length===1);
  check('primary-care clinicians does not invent a profession',!aliases.brief.requirements.some(r=>r.kind==='role'&&/^primary[- ]care(?: clinicians?)?$/i.test(r.text)));
  const resumed=await search('resume exact saved brief',{resumeBrief:removed.brief});
  check('resume preserves exact active brief and version',JSON.stringify(resumed.brief)===JSON.stringify(removed.brief));
  check('resume bypasses interpretation',resumed.interpretationMode==='saved-brief');
  check('resume repeats candidate ranking',resumed.results.map(c=>c.id).join('|')===removed.results.map(c=>c.id).join('|'));
  const activity=removed.brief.requirements.find(r=>r.kind==='activity');
  const retried=await search('retry a saved failed edit',{resumeBrief:removed.brief,patch:{requirementId:activity.id,importance:'preferred'}});
  check('saved failed edit applies once to base',retried.brief.version===removed.brief.version+1&&retried.brief.requirements.find(r=>r.id===activity.id)?.importance==='preferred');
  const ahmed=cardiac.results.find(c=>c.id==='expert-gmc-5197884');
  check('Ahmed real record recovered',!!ahmed);
  if(ahmed){
    const disease=ahmed.requirementMatrix.find(r=>r.label==='Coronary artery disease');
    check('listed disease interest stays distinct from activity',E.outcome(disease,ahmed,disease).label==='Listed interest');
    const reporting=E.cardProofs(ahmed,cardiac.brief).find(p=>/report/i.test(p.support.text));
    check('card foregrounds explicit reporting',!!reporting);
    if(reporting){const url=E.recordUrl(ahmed.id,reporting.evidence.id,base),r=await fetch(url),html=await r.text();check('exact citation opens first selected passage',r.ok&&html.includes('class="cited-passage"')&&html.includes('id="'+E.evidenceAnchor(reporting.evidence.id)+'"'));check('citation current practice dates are not inferred',html.includes('Source date: Not recorded')&&html.includes('Database processing date:'));check('wrong candidate citation rejects', (await fetch(base+'/api/expert/sources/'+ahmed.id+'?evidence=foreign-record')).status===404);}
    let p=P.setBrief(P.createProject('Fictional audit verification'),cardiac.brief,cardiac.corpusVersion);p=P.saveCandidate(p,ahmed,cardiac.brief,cardiac.corpusVersion);const html=P.exportHTML(p,{baseUrl:base}),imported=P.importJSON(P.exportJSON(p));
    check('review pack retains stored-record citation',html.includes('/api/expert/sources/'+ahmed.id+'?evidence='));
    check('review pack retains listed-interest meaning',html.includes('Listed interest'));
    check('backup roundtrip preserves saved evidence and decisions',JSON.stringify(imported.candidates)===JSON.stringify(p.candidates)&&imported.events.length===0);
  }
  const kandiyil=cardiac.results.find(c=>/Kandiyil/i.test(c.name));check('Kandiyil available for proof selection check',!!kandiyil);
  if(kandiyil)check('stronger task-specific reporting passage selected',E.cardProofs(kandiyil,cardiac.brief).some(p=>/supervise and report adult cardiac\/coronary CT/i.test(p.support.text)));
  check('every displayed essential gap appears in shared presentation',cardiac.results.every(c=>{const gaps=E.gaps(c,cardiac.brief);return c.requirementMatrix.filter(r=>r.importance==='essential'&&r.status!=='documented'&&r.status!=='context'&&!['question','technology','workflow'].includes(r.kind)).every(r=>gaps.essential.some(g=>g.requirementId===r.requirementId));}));
  report.pending=false;report.completedAt=new Date().toISOString();report.summary={checks:report.checks.length,passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass),requests:report.requests.length};save();console.log(JSON.stringify(report.summary,null,2));if(report.summary.failed.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
