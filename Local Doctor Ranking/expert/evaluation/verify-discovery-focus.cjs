'use strict';
// Fictional discovery requests against the existing expert preview. No project
// writes or generated explanations. Reports retain concise proof snippets only.
const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const E=require('../public/evidence.js');
const clip=(value,max=190)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
const list=value=>Array.isArray(value)?value:[];
const criterion=(result,label)=>list(result.brief?.requirements).find(r=>r.label===label);
const hasRole=(candidate,label)=>list(candidate.requirementMatrix).some(r=>r.kind==='role'&&r.label===label&&r.status==='documented');
const onlyCardiologists=result=>list(result.results).length>0&&result.results.every(c=>hasRole(c,'Cardiologist'));
let report,file;
function save(){if(report&&file)fs.writeFileSync(file,JSON.stringify(report,null,2));}
function check(name,passed,detail){report.checks.push({name,passed:!!passed,...(detail===undefined?{}:{detail})});save();}
function summary(){
  const durations=report.requests.filter(r=>r.kind==='search').map(r=>r.elapsedMs).sort((a,b)=>a-b);
  return {checks:report.checks.length,passed:report.checks.filter(c=>c.passed).length,failed:report.checks.filter(c=>!c.passed),searchRequests:durations.length,sourceRequests:report.requests.filter(r=>r.kind==='source').length,interpretationModes:report.requests.filter(r=>r.kind==='search').reduce((counts,r)=>(counts[r.interpretationMode]=(counts[r.interpretationMode]||0)+1,counts),{}),latency:{sampleSize:durations.length,medianMs:durations[Math.floor(durations.length/2)]??null,maxMs:durations.at(-1)??null}};
}
async function main(){
  const base=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:3100';
  const round=process.argv.find(a=>a.startsWith('--round='))?.slice(8);
  if(!/^(http:\/\/(127\.0\.0\.1|localhost):3100|https:\/\/docmap-expert-discovery-production\.up\.railway\.app)$/.test(base)||!round||!/^[a-z0-9-]{1,70}$/.test(round))throw Error('Use the authorised expert preview and a unique lowercase round.');
  const healthResponse=await fetch(base+'/api/expert/health',{signal:AbortSignal.timeout(15000)});
  const health=await healthResponse.json();if(!healthResponse.ok||!health.ready)throw Error('Wait for the expert index to report ready before verification.');
  file=path.join(__dirname,`../.cache/discovery-focus-${round}.json`);
  report={startedAt:new Date().toISOString(),base,round,corpusVersion:health.corpusVersion,aiConfigured:health.aiConfigured,pending:true,checks:[],requests:[]};
  fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  async function search(name,body){
    const started=performance.now();
    const response=await fetch(base+'/api/expert/search',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(body),signal:AbortSignal.timeout(23000)});
    const data=await response.json();
    report.requests.push({kind:'search',name,status:response.status,elapsedMs:Math.round(performance.now()-started),interpretationMode:data.interpretationMode||(data.needsClarification?'clarification':'unreported'),total:data.total,needsClarification:!!data.needsClarification,briefVersion:data.brief?.version,criteria:list(data.brief?.requirements).map(r=>({id:r.id,kind:r.kind,label:r.label,importance:r.importance,matchIntent:r.matchIntent,polarity:r.polarity,strictRole:r.strictRole})),top:list(data.results).slice(0,6).map(candidate=>{
      const relevance=E.cardRelevance(candidate,data.brief),proofs=[relevance.lead,...relevance.secondary].filter(Boolean);
      return {id:candidate.id,name:clip(candidate.name,100),role:clip(candidate.role,100),specialty:clip(candidate.specialty,100),proofs:proofs.map(p=>({label:p.label,type:p.support.evidenceType||p.evidence.type,excerpt:clip(p.support.text),evidenceId:p.evidence.id,sourceRecordId:p.evidence.sourceRecordId,sourceDate:p.support.sourceDate||null,related:p.related===true})),essentialChecks:relevance.gaps.essential.map(r=>r.label)};
    })});
    check(name+' returns HTTP 200',response.status===200,data.error?clip(data.error):undefined);
    if(!response.ok)throw Error(name+' failed with HTTP '+response.status);
    return data;
  }

  const first=await search('simple radiology-interest discovery',{message:'Cardiologists with radiology interests'});
  check('simple query starts discovery without requiring an assessment',first.needsClarification===false&&first.total>0);
  check('simple query retains cardiologist and broad imaging intent',isDeepStrictEqual(first.brief.roles,['Cardiologist'])&&criterion(first,'Medical imaging')?.matchIntent==='interest');
  check('simple query creates no mandatory criteria or invented modalities',first.brief.requirements.length===2&&first.brief.requirements.every(r=>r.importance==='focus')&&!first.brief.requirements.some(r=>['Cardiac CT','MRI'].includes(r.label)));
  check('simple query returns recorded cardiologists, not radiologists admitted by imaging alone',onlyCardiologists(first));
  check('simple discovery cards have no essential gaps',first.results.every(c=>E.gaps(c,first.brief).essential.length===0));
  check('simple shortlist has sourced imaging relevance',first.results.some(c=>E.cardRelevance(c,first.brief).lead?.requirement?.label==='Medical imaging'));
  // Source-reviewed regression from this corpus: an explicit self-attributed
  // historical investigation sits in an imported research-interests field.
  // It adds optional context, never a new criterion or a current-practice claim.
  const historicalCandidate=first.results.find(c=>c.id==='expert-gmc-5207394');
  const historicalProof=historicalCandidate&&E.cardRelevance(historicalCandidate,first.brief).secondary.find(p=>p.related&&p.evidence.id==='evidence-fd5eb8183d3b75e9b664');
  check('attributable historical imaging research appears as additional context',!!historicalProof&&historicalProof.support.evidenceType==='research'&&/My field of research was investigation/.test(historicalProof.support.text)&&historicalProof.support.sourceDate===null&&historicalProof.evidence.candidateId===historicalCandidate.id);

  const research=await search('helpful research refinement',{sessionId:first.sessionId,message:'Research would be useful.'});
  check('research is a preference, not a qualification gate',research.brief.requirements.some(r=>r.kind==='research')&&research.brief.requirements.filter(r=>r.kind==='research').every(r=>r.importance==='preferred'));
  check('optional research preserves imaging intent and requested profession',criterion(research,'Medical imaging')?.id===criterion(first,'Medical imaging')?.id&&criterion(research,'Medical imaging')?.matchIntent==='interest'&&onlyCardiologists(research));

  const optional=await search('research instruction updates existing criterion',{sessionId:first.sessionId,message:'Research should be optional.'});
  check('optional instruction preserves research IDs without a literal instruction chip',research.brief.requirements.filter(r=>r.kind==='research').every(r=>optional.brief.requirements.some(next=>next.id===r.id&&next.importance==='preferred'))&&!optional.brief.requirements.some(r=>/should be optional/i.test(r.label+' '+r.text)));

  const roleOnly=await search('role-only cardiologist discovery',{message:'Cardiologists'});
  check('role-only discovery gives recorded professionals without asking for a project',roleOnly.needsClarification===false&&roleOnly.brief.requirements.length===1&&onlyCardiologists(roleOnly));
  check('role-only card has a real role source instead of invented clinical interests',roleOnly.results.every(c=>E.cardRelevance(c,roleOnly.brief).lead?.requirement?.kind==='role'));

  const cardiac=await search('cardiac imaging interest discovery',{message:'Cardiologists interested in cardiac imaging'});
  check('specific broad imaging remains one interest criterion',criterion(cardiac,'Cardiovascular imaging')?.matchIntent==='interest'&&!criterion(cardiac,'Medical imaging')&&cardiac.brief.requirements.length===2);
  check('cardiac imaging results preserve requested role',onlyCardiologists(cardiac));

  const strict=await search('explicit required reporting',{message:'Only cardiologists who must personally report cardiac CT. Research would be useful.'});
  check('explicit only role remains a real eligibility constraint',strict.brief.roleMode==='only'&&criterion(strict,'Cardiologist')?.strictRole===true&&criterion(strict,'Cardiologist')?.importance==='essential'&&onlyCardiologists(strict));
  check('explicit clinical reporting remains required activity',criterion(strict,'Image interpretation')?.importance==='essential'&&criterion(strict,'Cardiac CT')?.matchIntent==='activity');
  check('helpful research does not become essential beside must wording',strict.brief.requirements.filter(r=>r.kind==='research').length>0&&strict.brief.requirements.filter(r=>r.kind==='research').every(r=>r.importance==='preferred'));

  const documented=await search('documented-only explicit requirements',{sessionId:strict.sessionId,message:'Keep the same requirements.',documentedOnly:true});
  check('documented-only produces supported explicit essentials',documented.results.length>0&&documented.results.every(c=>c.requirementMatrix.filter(r=>r.importance==='essential'&&!['question','technology','workflow'].includes(r.kind)).every(r=>r.status==='documented')));

  const removed=await search('remove imaging and retain professional search',{sessionId:first.sessionId,message:'Remove radiology interests.'});
  check('removed imaging no longer exists in the active brief',!removed.brief.requirements.some(r=>r.kind==='modality'||/imaging|radiology/i.test(r.text+' '+r.label+' '+r.evidence)));
  check('removing topic preserves requested cardiologists and optional research',onlyCardiologists(removed)&&removed.brief.requirements.filter(r=>r.kind==='research').every(r=>r.importance==='preferred'));

  const vague=await search('generic expert asks a focused question',{message:'I need an expert.'});
  check('generic expert request does not invent criteria or candidates',vague.needsClarification===true&&vague.total===0&&vague.results.length===0&&vague.brief.requirements.length===0);

  const resumed=await search('resume exact discovery brief',{resumeBrief:first.brief});
  check('resumed brief retains focus intent and original version',isDeepStrictEqual(resumed.brief,first.brief)&&resumed.interpretationMode==='saved-brief');
  check('resumed discovery repeats first shortlist without reinterpretation',isDeepStrictEqual(resumed.results.map(c=>c.id),first.results.map(c=>c.id)));

  const imaging=criterion(resumed,'Medical imaging');
  if(!imaging)throw Error('Expected imaging criterion is unavailable for priority verification.');
  const required=await search('make the imaging criterion explicit',{sessionId:resumed.sessionId,patch:{requirementId:imaging.id,importance:'essential'}});
  check('explicit priority control changes only chosen criterion',criterion(required,'Medical imaging')?.importance==='essential'&&criterion(required,'Medical imaging')?.matchIntent==='interest'&&criterion(required,'Cardiologist')?.importance==='focus');
  const focused=await search('restore ordinary search focus',{sessionId:resumed.sessionId,patch:{requirementId:imaging.id,importance:'focus'}});
  check('focus priority control works without losing meaning',criterion(focused,'Medical imaging')?.importance==='focus'&&criterion(focused,'Medical imaging')?.matchIntent==='interest'&&onlyCardiologists(focused));

  const candidate=first.results.find(c=>E.cardRelevance(c,first.brief).lead),proof=candidate&&E.cardRelevance(candidate,first.brief).lead;
  check('a displayed proof is owned by its candidate',!!proof&&proof.evidence.candidateId===candidate.id);
  if(proof){
    const url=E.recordUrl(candidate.id,proof.evidence.id,base),started=performance.now();
    const response=await fetch(url,{signal:AbortSignal.timeout(15000)}),html=await response.text();
    report.requests.push({kind:'source',name:'exact displayed source',status:response.status,elapsedMs:Math.round(performance.now()-started),candidateId:candidate.id,evidenceId:proof.evidence.id,path:new URL(url).pathname+new URL(url).search});
    check('source citation opens the exact selected passage',response.status===200&&html.includes('class="cited-passage"')&&html.includes('id="'+E.evidenceAnchor(proof.evidence.id)+'"'));
  }
  report.pending=false;report.completedAt=new Date().toISOString();report.summary=summary();save();
  console.log(JSON.stringify(report.summary,null,2));if(report.summary.failed.length)process.exitCode=1;
}
main().catch(error=>{if(report){report.pending=false;report.completedAt=new Date().toISOString();report.error={name:error.name,message:clip(error.message,240)};report.summary=summary();save();}console.error(error.name+': '+error.message);process.exitCode=1;});
