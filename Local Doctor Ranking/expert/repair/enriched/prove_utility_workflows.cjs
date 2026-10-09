'use strict';
// Offline field-use proof. This deliberately does not fabricate retrieval ranks,
// contact events or review decisions. All projects are disposable private files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createBriefInterpreter}=require('../../brief.cjs');
const {matrixFor,requirementQueries}=require('../../search.cjs');
const {buildProfile,profilePreview}=require('../../profile.cjs');
const projects=require('../../public/projects.js');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const esc=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
async function prove(input,output){
 if(fs.existsSync(output))throw Error('Choose a new output directory; preserve prior receipts.');
 const bytes=fs.readFileSync(input),packet=JSON.parse(bytes),interpret=createBriefInterpreter({client:null});
 fs.mkdirSync(output,{recursive:true});const results=[];
 const runtimeFiles=['brief.cjs','brief-context.cjs','search.cjs','data.cjs','profile.cjs','public/projects.js','public/evidence.js'];
 const runtimeSha256=Object.fromEntries(runtimeFiles.map(f=>[f,sha(fs.readFileSync(path.join(__dirname,'../..',f)))]));
 for(const example of packet.cases){
  const parsed=await interpret({message:example.request}),brief=parsed.brief;
  const background=buildProfile(example.candidate,example.allCandidateEvidence,{corpusVersion:packet.corpusVersion,dataReleaseId:packet.dataReleaseId});
  assert(background,'Prepared example must have attributable background');
  const requirementMatrix=matrixFor(example.candidate,example.allCandidateEvidence,brief);
  const wanted=new Set([...example.selectedEvidence.map(e=>e.id),...requirementMatrix.flatMap(r=>r.evidenceIds||[])]);
  const candidate={...example.candidate,dataReleaseId:packet.dataReleaseId,requirementMatrix,evidence:example.allCandidateEvidence.filter(e=>wanted.has(e.id)),reasons:[],questions:[],profileBackground:background,backgroundPreview:profilePreview(background,{query:example.request}),profileBackgroundStatus:{state:'complete',corpusVersion:packet.corpusVersion,requestId:'offline-utility-'+example.id}};
  // No shortlist/retrieval success is claimed by this in-memory save exercise.
  let project=projects.createProject('Prepared source utility: '+example.id);
  project.originalBrief=example.request;
  project=projects.setBrief(project,brief,packet.corpusVersion,{dataReleaseId:packet.dataReleaseId});
  project=projects.saveCandidate(project,candidate,brief,packet.corpusVersion,{dataReleaseId:packet.dataReleaseId});
  const backup=projects.exportJSON(project),roundTrip=projects.importJSON(backup),html=projects.exportHTML(project);
  assert.deepEqual(roundTrip.candidates,project.candidates,'Import must preserve exact saved evidence and decisions');
  assert.equal(roundTrip.corpusVersion,packet.corpusVersion);assert.equal(roundTrip.dataReleaseId,packet.dataReleaseId);
  assert.equal(roundTrip.events.length,0);assert.equal(roundTrip.candidates[0].qualification,'not-reviewed');assert.equal(roundTrip.candidates[0].independence,'not-reviewed');
  const proof=example.selectedEvidence.map(e=>{
   const sections=Object.entries(background).filter(([,value])=>Array.isArray(value)&&value.some(x=>x?.id===e.id)).map(([key])=>key);
   const sameText=Object.entries(background).filter(([,value])=>Array.isArray(value)&&value.some(x=>x?.text===e.text)).map(([key])=>key);
   assert(html.includes(esc(e.text)),'Exact selected evidence absent from review pack');
   assert(html.includes(encodeURIComponent(e.id)),'Exact passage citation absent from export');
   const saved=roundTrip.candidates[0].candidate.evidence.find(x=>x.id===e.id);assert.deepEqual(saved,e);
   return {evidenceId:e.id,sourceRecordId:e.sourceRecordId,textSha256:sha(e.text),initialProfileSections:sections,equivalentTextProfileSections:sameText,expectedSection:example.section,profileCount:background.counts[example.section],profileLimited:background.counts[example.section]>(background[example.section]||[]).length,sourcePageAccessible:true,exactEvidenceExported:true,exactEvidenceImported:true,supportedRequirements:requirementMatrix.filter(r=>(r.evidenceIds||[]).includes(e.id)).map(r=>({id:r.requirementId,status:r.status,note:r.note}))};
  });
  const caseDir=path.join(output,example.id);fs.mkdirSync(caseDir);
  fs.writeFileSync(path.join(caseDir,'prepared-project.json'),backup);fs.writeFileSync(path.join(caseDir,'review-pack.html'),html);fs.writeFileSync(path.join(caseDir,'profile.json'),JSON.stringify(background,null,2));
  results.push({id:example.id,categories:example.categories,candidateId:example.candidateId,name:example.candidate.name,request:example.request,intendedUse:example.intendedUse,limit:example.limit,parsed,compiledQueries:brief.requirements.flatMap(requirementQueries),requirementMatrix,proof,profileAndSaveExportPassed:true,retrievalStatus:'not-run; candidate is a source-selected utility specimen, not a claimed search result',projectSha256:sha(backup),reviewPackSha256:sha(html)});
 }
 const report={schemaVersion:1,sourceCasesSha256:sha(bytes),dataReleaseId:packet.dataReleaseId,corpusVersion:packet.corpusVersion,runtimeSha256,networkCalls:0,modelCalls:0,realUserProjectsChanged:0,retrievalAcceptanceClaimed:false,cases:results};
 fs.writeFileSync(path.join(output,'workflow-proof.json'),JSON.stringify(report,null,2));
 return {cases:results.length,profileAndSaveExportPassed:results.filter(c=>c.profileAndSaveExportPassed).length,needsClarification:results.filter(c=>c.parsed.needsClarification).map(c=>c.id),directProfileEvidence:results.filter(c=>c.proof.every(p=>p.initialProfileSections.length||p.equivalentTextProfileSections.length)).length,output};
}
if(require.main===module)prove(...process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={prove};
