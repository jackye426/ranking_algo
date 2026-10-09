'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{diagnostics}=require('./diagnose_context_projection.cjs'),{applyRepairs}=require('../../releases.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function inspect(baselineFile,packetFile,outputFile){
 if(fs.existsSync(outputFile))throw Error('Choose a new report');
 const baselineBytes=fs.readFileSync(baselineFile),packetBytes=fs.readFileSync(packetFile),baseline=JSON.parse(baselineBytes),packet=JSON.parse(packetBytes),prepared=applyRepairs(baseline.rows,packet,{releaseId:packet.releaseId,baselineSha256:sha(baselineBytes)}),d=diagnostics();
 const fields=['about','about_alternatives','specialty','specialty_alternatives','specialties','professional_role','clinical_interests','areas_of_interest','procedures','procedures_completed','procedure_volumes_phin','research_interests','publications','qualifications','detailed_qualifications','professional_memberships','nhs_posts','nhs_base','professional_experience','isrctn_trials','trials','teaching_interests'];
 const matches=[];
 for(const row of prepared.rows){
  for(const [field,entries]of [...fields.map(field=>[field,d.valueEntries(row[field])]),...(row.professional_context||[]).map(item=>['professional_context.'+item.kind,[item]])]){
   for(const item of entries)for(const text of d.splitPassages(item.text)){
    const weak=(text.match(/[a-z]{1,4};\s+[a-z]{1,5}\b/g)||[]).length,strong=(text.match(/;\s+[a-z]{1,6}(?=[A-Z])/g)||[]).length;
    if(weak>=4||strong>=3)matches.push({sourceRecordId:row.id,field,source:d.sourceFor(row,field,item),text,textSha256:sha(text),weakTailMatches:weak,internalFragmentMatches:strong,rejectionReason:d.rejectionReason(text,field),explicitHold:!!row.requires_review,explicitExclusion:!!(row.do_not_recommend||row.blacklisted)});
   }
  }
 }
 const report={schemaVersion:1,baselineSha256:sha(baselineBytes),packetSha256:sha(packetBytes),runtimeDataSha256:d.codeSha256,rows:prepared.rows.length,matches,readOnly:true};fs.writeFileSync(outputFile,JSON.stringify(report,null,2));
 return {matches:matches.length,weakOnly:matches.filter(m=>m.weakTailMatches>=4&&m.internalFragmentMatches<3).length,strong:matches.filter(m=>m.internalFragmentMatches>=3).length,outputFile};
}
if(require.main===module){try{console.log(JSON.stringify(inspect(...process.argv.slice(2))));}catch(error){console.error(error.stack);process.exitCode=1;}}
