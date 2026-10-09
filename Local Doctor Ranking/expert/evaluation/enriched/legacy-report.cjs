'use strict';
// Additive reporting only: never edits original scenario labels or run results.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const dispositions=require('./legacy-contract.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
function classifyFailure(item){
 const conflict=dispositions.expectationConflicts.find(c=>c.id===item.id);
 if(conflict&&item.name==='clarification')return {...item,classification:'documented-contract-conflict',basis:conflict.reason};
 const functional=dispositions.functionalCases.find(c=>c.id===item.id);
 return {...item,classification:functional?'known-functional-control':'other-failure',basis:functional?.required||'Requires investigation; no acceptance waiver applies.'};
}
function report(runs){
 const sources=runs.map(({name,sha256,value})=>({name,sha256,corpusVersion:value.corpusVersion,scenarioFingerprint:value.scenarioFingerprint,passed:value.passed,gates:value.gates}));
 const byMode={};
 for(const mode of ['bm25','semantic','hybrid']){
  const failures=runs.flatMap(({name,value})=>(value.summary?.[mode]?.failedChecks||[]).map(f=>classifyFailure({pack:name,...f})));
  const checks=runs.reduce((sum,{value})=>sum+(value.summary?.[mode]?.checks||0),0);
  const cases=runs.reduce((sum,{value})=>sum+(value.summary?.[mode]?.cases||0),0);
  const functional=dispositions.functionalCases.map(definition=>{
   const found=runs.flatMap(({value})=>value.cases||[]).find(c=>c.id===definition.id),result=found?.byMode?.[mode];
   return {id:definition.id,required:definition.required,present:!!result,failedChecks:result?.checks?.filter(c=>!c.pass)||[],legacyChecksPass:!!result&&result.checks.every(c=>c.pass),interpretationMode:found?.interpretationMode||null};
  });
  byMode[mode]={cases,checks,rawFailedChecks:failures.length,failures,documentedContractConflicts:failures.filter(f=>f.classification==='documented-contract-conflict').length,remainingFailedChecks:failures.filter(f=>f.classification!=='documented-contract-conflict').length,functionalControls:functional};
 }
 return {schemaVersion:1,dispositionVersion:dispositions.version,sourceReports:sources,byMode,rawLegacyAcceptance:sources.every(s=>s.passed===true),limitations:['The original reports and expectations remain unchanged. A documented broad-discovery contract conflict is still a raw legacy failure.','Only the clarification check in the three specifically documented cases is classified as a contract conflict. Other failures in those cases remain failures.','Passing these legacy checks does not establish full-brief relevance, prospective held-out success or source quality.','No aggregate recall or precision threshold is changed by this report.'],prospectiveAcceptance:'Not decided by this report.'};
}
function markdown(value){
 const lines=['# Original 98-case compatibility report','','Original labels and raw reports are preserved. Contract differences are reported separately; they are not silently converted to passes.','','| Method | Cases | Raw failed checks | Documented contract conflicts | Other failed checks |','|---|---:|---:|---:|---:|'];
 for(const [mode,m] of Object.entries(value.byMode))lines.push(`| ${mode} | ${m.cases} | ${m.rawFailedChecks} | ${m.documentedContractConflicts} | ${m.remainingFailedChecks} |`);
 lines.push('','## Eight functional-control cases','','| Case | BM25 | Semantic | Hybrid |','|---|---|---|---|');
 for(const definition of dispositions.functionalCases){const cells=['bm25','semantic','hybrid'].map(mode=>{const c=value.byMode[mode].functionalControls.find(c=>c.id===definition.id);return !c.present?'Missing':c.legacyChecksPass?'Checks pass':`${c.failedChecks.length} failed checks`;});lines.push(`| ${definition.id} | ${cells.join(' | ')} |`);}
 lines.push('','## Failed checks','');for(const [mode,m] of Object.entries(value.byMode))for(const failure of m.failures)lines.push(`- ${mode} / ${failure.id} / ${failure.name}: ${failure.classification}. ${failure.basis}`);
 lines.push('','## Limits','',...value.limitations.map(x=>'- '+x),'','Prospective enriched-data acceptance remains a separate gate.','');return lines.join('\n');
}
if(require.main===module){const [directory,outStem]=process.argv.slice(2);if(!directory||!outStem)throw Error('Usage: legacy-report.cjs <reports-directory> <NEW-output-stem>');const runs=['main','round-two','final'].map(name=>{const bytes=fs.readFileSync(path.join(directory,name+'.json'));return {name,sha256:sha(bytes),value:JSON.parse(bytes)};});const value=report(runs);fs.writeFileSync(outStem+'.json',JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.writeFileSync(outStem+'.md',markdown(value),{flag:'wx'});console.log(JSON.stringify({outStem,byMode:Object.fromEntries(Object.entries(value.byMode).map(([mode,m])=>[mode,{rawFailedChecks:m.rawFailedChecks,contractConflicts:m.documentedContractConflicts,remainingFailedChecks:m.remainingFailedChecks}]))}));}
module.exports={classifyFailure,report,markdown};
