'use strict';
// Derive an identity eligibility gate from an independently replayed baseline.
const fsp=require('node:fs/promises'),path=require('node:path');
const {MANDATORY_HOLDS}=require('../releases.cjs');
const {readCandidates}=require('./corpus-candidates.cjs');
async function main(reportPath,output){
 if(!path.isAbsolute(reportPath||'')||!path.isAbsolute(output||''))throw Error('Absolute report and new output paths required');
 const report=JSON.parse(await fsp.readFile(reportPath,'utf8')),artifact=report.corpusExports?.baseline;if(!artifact||path.basename(artifact.file)!==artifact.file)throw Error('Missing bounded baseline corpus reference');
 const corpusPath=path.join(path.dirname(reportPath),artifact.file),{candidates,sha256:actual}=await readCandidates(corpusPath,{...artifact,version:report.baseline.corpusVersion});
 const held=new Set(MANDATORY_HOLDS),eligible=candidates.filter(c=>!c.needsIdentityReview&&!c.sourceRecordIds.some(id=>held.has(id))),sourceRecordIds=[...new Set(eligible.flatMap(c=>c.sourceRecordIds))].sort();
 const result={schemaVersion:1,basis:'Frozen replayed baseline identity groups minus all mandatory current conflict groups; evidence availability is not an identity gate.',baselineSha256:report.baseline.rawSha256,baselineCorpusSha256:actual,baselineCorpusVersion:report.baseline.corpusVersion,mandatoryHolds:[...MANDATORY_HOLDS],eligibleGroups:eligible.length,eligibleSourceRows:sourceRecordIds.length,sourceRecordIds};
 await fsp.writeFile(output,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({output,eligibleGroups:eligible.length,eligibleSourceRows:sourceRecordIds.length,baselineCorpusSha256:actual}));
}
if(require.main===module)main(...process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={main};
