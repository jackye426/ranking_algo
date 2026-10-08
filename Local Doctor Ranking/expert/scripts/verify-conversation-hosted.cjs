'use strict';
// Run after deployment. Public endpoints and fictional briefs only. The report
// contains no response bodies, professional records, notes, credentials or AI
// explanations. Pending project roundtrips happen in memory, not user storage.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const P=require('../public/projects.js');
const target=new URL(process.argv[2]||'https://docmap-expert-discovery-production.up.railway.app');
if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||target.pathname!=='/')throw new Error('Supply a public HTTPS origin without credentials, a path or query parameters.');
const base=target.origin,report={base,at:new Date().toISOString(),checks:[],timings:[],scope:'Public release and conversational continuation checks; no optional AI explanation requests.'};
const CT=['Cardiac CT','Brain CT','Lung CT','General CT'];
const PURPOSE=['The software supports diagnosis.','The software monitors a clinical condition.','The software supports treatment planning.'];
const EXPERTISE=['Cardiologists','Dermatologists','Cardiac imaging research'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function check(name,condition){assert.ok(condition,name);report.checks.push(name);}
function equal(name,actual,expected){check(name,isDeepStrictEqual(actual,expected));}
async function call(route,body){
  const start=performance.now(),response=await fetch(base+route,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)}),bytes=Buffer.from(await response.arrayBuffer()),text=bytes.toString('utf8');
  let data;try{data=JSON.parse(text);}catch{}
  report.timings.push({route:route.split('?')[0],ms:Math.round(performance.now()-start),status:response.status});
  return {status:response.status,data,text,bytes,headers:response.headers};
}
const search=body=>call('/api/expert/search',body);
const labels=brief=>brief.requirements.map(r=>r.label);
function question(name,response,{status,kind,replies}){
  check(name+' status',response.status===status&&((status===200&&response.data.needsClarification===true)||(status===422&&response.data.code==='device-clarification')));
  const value=response.data.clarification;check(name+' reason and question',value?.kind===kind&&typeof value.question==='string'&&value.question===response.data.question);
  equal(name+' replies',value.quickReplies.map(r=>r.message),replies);
  check(name+' stable unique reply IDs',value.quickReplies.every(r=>typeof r.id==='string'&&r.id.length>0)&&new Set(value.quickReplies.map(r=>r.id)).size===value.quickReplies.length);
  check(name+' no completed search',!response.data.searchId&&(!response.data.results||response.data.results.length===0));
  return value;
}
function sourced(name,response){
  check(name+' returns candidates',response.status===200&&response.data.needsClarification===false&&response.data.results?.length>0&&!!response.data.searchId);
  check(name+' no stale clarification',response.data.clarification===undefined);
  check(name+' candidate-owned evidence',response.data.results.every(c=>Array.isArray(c.evidence)&&c.evidence.length&&c.evidence.every(e=>e.candidateId===c.id&&typeof e.sourceRecordId==='string'&&typeof e.text==='string'&&!e.id.startsWith('emdn'))));
  return response.data;
}
async function profile(snapshot,candidate=snapshot.results[0]){return call('/api/expert/profile',{sessionId:snapshot.sessionId,searchId:snapshot.searchId,candidateId:candidate.id,corpusVersion:snapshot.corpusVersion});}
async function main(){
  for(const file of ['app.js','styles.css','projects.js','evidence.js','source-reader.js','index.html']){
    const route=file==='index.html'?'/expert-discovery':'/expert-assets/'+file,r=await call(route);
    check('Hosted release hash '+file,r.status===200&&hash(r.bytes)===hash(fs.readFileSync(path.join(__dirname,'../public',file))));
    check('CSP '+file,!!r.headers.get('content-security-policy'));
  }
  const health=await call('/api/expert/health');check('Ready with expected evidence corpus and DeepSeek',health.status===200&&health.data.ready===true&&health.data.corpusVersion==='expert-corpus-v1-003234ea2e49a2446f3f'&&health.data.model==='deepseek/deepseek-v3.2');
  report.corpusVersion=health.data.corpusVersion;

  const ctQuestion=await search({message:'Z11030692',locationFilter:{query:'UK'}}),ctDefinition=question('CT application',ctQuestion,{status:422,kind:'ct-application',replies:CT});
  equal('Concise CT question',ctDefinition.question,'That’s CT medical-device software. What will it be used for?');
  check('Official CT metadata retained',ctQuestion.data.deviceDraft?.code==='Z11030692'&&ctQuestion.data.deviceDraft.question===ctDefinition.question);
  const ctQuick=sourced('CT quick reply',await search({deviceCode:'Z11030692',message:'Z11030692\n'+ctDefinition.quickReplies[0].message,locationFilter:{query:'UK'}}));
  check('CT quick reply retains reviewed modality and location',labels(ctQuick.brief).includes('Cardiac CT')&&ctQuick.brief.locationFilter?.country==='GB');
  const ctTyped=sourced('CT typed answer',await search({deviceCode:'Z11030692',message:'Z11030692\nLung cancer imaging.'}));
  check('Typed CT answer does not infer cardiac expertise',labels(ctTyped.brief).includes('CT imaging')&&labels(ctTyped.brief).some(label=>/^lung cancer$/i.test(label))&&!labels(ctTyped.brief).includes('Cardiac CT'));
  const evidence=ctQuick.results[0].evidence[0],source=await call('/api/expert/sources/'+encodeURIComponent(ctQuick.results[0].id)+'?evidence='+encodeURIComponent(evidence.id));
  check('Sourced result opens its exact passage',source.status===200&&source.text.includes('id="evidence-'+evidence.id+'"'));

  const purposeQuestion=await search({message:'V92'}),purposeDefinition=question('Broad software purpose',purposeQuestion,{status:422,kind:'device-purpose',replies:PURPOSE});
  const purposeMessage='V92\n'+purposeDefinition.quickReplies[0].message;
  const subjectQuestion=await search({deviceCode:'V92',message:purposeMessage});question('Software clinical subject',subjectQuestion,{status:422,kind:'device-clinical-subject',replies:[]});
  check('Second question keeps official code rather than inventing criteria',subjectQuestion.data.deviceDraft?.code==='V92'&&!subjectQuestion.data.brief);
  const broad=sourced('Software purpose plus subject',await search({deviceCode:'V92',message:purposeMessage+'\nCardiac CT for coronary artery disease.'}));
  check('V92 search uses supplied subject without a made-up mapping',broad.brief.deviceContext?.code==='V92'&&broad.brief.deviceContext.concepts.length===0&&labels(broad.brief).includes('Cardiac CT')&&labels(broad.brief).includes('Coronary artery disease'));

  const genericQuestion=await search({message:'I need a specialist.'}),genericDefinition=question('Generic expertise',genericQuestion,{status:200,kind:'expertise',replies:EXPERTISE});
  const genericResults=[];
  for(const reply of genericDefinition.quickReplies)genericResults.push(sourced('Generic reply '+reply.message,await search({resumeBrief:genericQuestion.data.brief,message:reply.message})));
  const accepted=genericResults[0],role=accepted.brief.requirements.find(r=>r.label==='Cardiologist');check('Cardiologist reply is a single clinical focus',!!role&&accepted.brief.requirements.length===1);
  const removed=await search({sessionId:accepted.sessionId,removeRequirementId:role.id});question('Removal leaves a partial proposal',removed,{status:200,kind:'expertise',replies:EXPERTISE});
  check('Proposed brief excludes the removed cardiology criterion',!removed.data.brief.requirements.some(r=>r.id===role.id));
  const oldProfile=await profile(accepted);check('Old snapshot profile works while a question is pending',oldProfile.status===200&&oldProfile.data.candidateId===accepted.results[0].id);

  const pending={id:crypto.randomUUID(),kind:removed.data.clarification.kind,question:removed.data.clarification.question,quickReplies:removed.data.clarification.quickReplies,submittedAt:new Date().toISOString(),payload:{removeRequirementId:role.id},baseBrief:accepted.brief,proposedBrief:removed.data.brief,filters:{documentedOnly:false,uncontactedOnly:false},visibleRequest:'Remove the cardiologist criterion'};
  let project=P.saveCandidate(P.createProject('Fictional conversation verification'),{...accepted.results[0],profileBackground:oldProfile.data},accepted.brief,accepted.corpusVersion);
  project=P.setPendingClarification(project,pending);const imported=P.importJSON(P.exportJSON(project));
  equal('Backup/import preserves the accepted brief separately',imported.activeBrief,accepted.brief);
  equal('Backup/import preserves the partial proposal and choices',imported.pendingClarification,pending);
  equal('Backup/import retains frozen saved evidence',imported.candidates[0],project.candidates[0]);
  const partialRestore=await search({resumeBrief:imported.pendingClarification.proposedBrief});question('Restored partial proposal still asks',partialRestore,{status:200,kind:'expertise',replies:EXPERTISE});
  const different=sourced('Different answer after restore',await search({resumeBrief:partialRestore.data.brief,message:'Dermatologists'}));
  check('Different answer cannot resurrect removed terms',labels(different.brief).includes('Dermatologist')&&!different.brief.requirements.some(r=>r.id===role.id)&&!/cardiolog/i.test(different.brief.summary));

  const cancelled=P.clearPendingClarification(imported);check('Cancelling pending work leaves accepted evidence intact',!cancelled.pendingClarification&&P.scope(cancelled.activeBrief)===P.scope(accepted.brief)&&JSON.stringify(cancelled.candidates)===JSON.stringify(imported.candidates));
  const resumed=sourced('Cancellation resumes accepted search',await search({resumeBrief:cancelled.activeBrief,message:'Clinical research helpful'}));
  check('Cancellation resumes accepted criteria in a new session',resumed.sessionId!==accepted.sessionId&&labels(resumed.brief).includes('Cardiologist')&&resumed.brief.requirements.some(r=>r.kind==='research'&&r.importance==='preferred'));
  const oldSnapshot=await call('/api/expert/shortlist-view',{sessionId:accepted.sessionId,searchId:accepted.searchId,candidateIds:[accepted.results[0].id]});
  equal('Original snapshot remains immutable after continuation and cancellation',oldSnapshot.data.brief,accepted.brief);
  check('Old profile still opens after the new searches',(await profile(accepted)).status===200);

  for(const [message,code]of [['EMDN X999999','device-invalid'],['Z11030692 for dermoscopy','device-conflict'],['Remove photonics experience','interpretation-incomplete']]){
    const failed=await search({message});check('Genuine failure remains recovery: '+code,failed.status===422&&failed.data.code===code&&failed.data.clarification===undefined);
  }
  for(const route of ['/expert-discovery/directory','/expert-discovery/project'])check('Direct route '+route,(await call(route)).status===200);
  report.status='passed';report.finishedAt=new Date().toISOString();
}
function save(){const directory=path.join(__dirname,'../.cache');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'conversation-hosted-verification.json'),JSON.stringify(report,null,2));}
if(require.main===module)main().then(()=>{save();console.log(JSON.stringify(report,null,2));}).catch(error=>{report.status='failed';report.error=String(error.message).slice(0,1000);report.finishedAt=new Date().toISOString();save();console.error(JSON.stringify(report,null,2));process.exitCode=1;});
module.exports={main};
