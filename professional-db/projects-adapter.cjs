'use strict';
// Additional metadata around the existing project format; patient/app files stay
// unchanged. Saved decisions and evidence are never refreshed from current data.
const S=require('./saved-evidence.cjs'),U=require('./util.cjs');
async function createProjectAdapter({runtimeRoot,runtimeManifestSha256}){
  await require('./runtime.cjs').verifyRuntime(runtimeRoot,runtimeManifestSha256);const P=require(require('node:path').join(runtimeRoot,'expert/public/projects.js'));
function validate(project){const copy=P.validateProject(project);for(const saved of copy.candidates){if(!saved.databaseEvidence)continue;const snapshot=S.restore(saved.databaseEvidence);if(snapshot.candidate.id!==saved.candidate.id||snapshot.versions.corpusVersion!==saved.corpusVersion||snapshot.versions.dataReleaseId!==saved.dataReleaseId||U.hash(saved.databaseVersions)!==U.hash(snapshot.versions))throw Error('Saved project database version mismatch');}return copy;}
async function attach(db,pin,project,{candidateId,evidenceIds},options={}){
  const copy=P.validateProject(project),saved=copy.candidates.find(s=>s.candidate.id===candidateId);if(!saved||saved.dataReleaseId!==pin.releaseId||saved.corpusVersion!==pin.corpusVersion)throw Error('Save the candidate under its exact search release before attaching database evidence');
  const envelope=await S.capture(db,pin,{candidateId,evidenceIds},options);
  for(const e of saved.candidate.evidence){const original=envelope.snapshot.evidence.find(p=>p.id===e.id);if(!original)throw Error('Saved search evidence omitted from exact capture');for(const key of ['text','type','dates','qualifiers','sourceQuote','volume','volumes'])if(U.hash(original[key])!==U.hash(e[key]))throw Error('Saved evidence differs from pinned database');}
  saved.databaseEvidence=envelope;saved.databaseVersions=envelope.snapshot.versions;
  if(copy.dataReleaseId===pin.releaseId&&copy.corpusVersion===pin.corpusVersion)copy.databaseVersions=envelope.snapshot.versions;
  for(const decision of saved.decisions)if(decision.corpusVersion===pin.corpusVersion&&decision.dataReleaseId===pin.releaseId)decision.databaseVersions=envelope.snapshot.versions;
  return validate(copy);
}
function changeReview(project,candidateId,field,value,options){const copy=P.changeReview(validate(project),candidateId,field,value,options),saved=copy.candidates.find(s=>s.candidate.id===candidateId);if(saved.databaseVersions)saved.decisions.at(-1).databaseVersions=structuredClone(saved.databaseVersions);return validate(copy);}
function exportJSON(project){return P.exportJSON(validate(project));}
function importJSON(text){return validate(P.importJSON(text));}
function exportHTML(project,options){const copy=validate(project),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),metadata=copy.candidates.filter(s=>s.databaseVersions).map(s=>'<p>'+esc(s.candidate.name)+'</p><pre>'+esc(JSON.stringify(s.databaseVersions,null,2))+'</pre>').join('');return P.exportHTML(copy,options).replace('</body>','<section><h2>Saved database evidence versions</h2>'+metadata+'</section></body>');}
function selectionStatus(project,versions){const copy=validate(project);return copy.candidates.map(s=>({candidateId:s.candidate.id,savedVersions:s.databaseVersions||null,requiresReview:!s.databaseVersions||U.hash(s.databaseVersions)!==U.hash(versions)}));}
return {attach,validate,changeReview,exportJSON,importJSON,exportHTML,selectionStatus};}
module.exports={createProjectAdapter};
