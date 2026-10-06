'use strict';
// Offline only: no environment loading, index construction or model calls.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {parseBrief}=require('../brief.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function compareBriefs(before,after){
  const oldMap=new Map((before?.requirements||[]).map(r=>[r.id,r]));
  const newMap=new Map(after.requirements.map(r=>[r.id,r]));
  return {
    added:after.requirements.filter(r=>!oldMap.has(r.id)),
    removed:(before?.requirements||[]).filter(r=>!newMap.has(r.id)),
    modified:after.requirements.filter(r=>oldMap.has(r.id)&&!same(oldMap.get(r.id),r)).map(r=>({before:oldMap.get(r.id),after:r})),
    fields:[...new Set([...Object.keys(before||{}),...Object.keys(after)])].filter(k=>k!=='requirements'&&!same(before?.[k],after[k])).map(k=>({field:k,before:before?.[k],after:after[k]}))
  };
}
function verify({round='discovery-fix-v2'}={}){
  if(!/^[a-z0-9-]+$/.test(round))throw Error('Use a named local evaluation round.');
  const splits=[];
  for(const [split,packFile]of [['development','scenarios.cjs'],['holdout','holdout-final.cjs']]){
    const inputFile=path.join(__dirname,`../.cache/discovery-evaluation-${round}-${split}.json`),input=fs.readFileSync(inputFile);
    const stored=JSON.parse(input),pack=require('./'+packFile),scenarios=pack.scenarios.filter(s=>s.split===split),prior=new Map(stored.cases.map(c=>[c.id,c.brief]));
    if(prior.size!==scenarios.length||scenarios.some(s=>!prior.has(s.id)))throw Error('Stored case IDs do not match the '+split+' scenario pack.');
    if(stored.modelBackedInterpretation!==false)throw Error('Comparison requires a deterministic baseline.');
    const changes=[];let turns=0;
    for(const scenario of scenarios){
      let parsed=parseBrief({message:scenario.message});turns++;
      for(const message of scenario.followups||[]){parsed=parseBrief({message,previous:parsed.brief});turns++;}
      const before=prior.get(scenario.id);
      if(!same(before,parsed.brief))changes.push({id:scenario.id,...compareBriefs(before,parsed.brief)});
    }
    splits.push({split,cases:scenarios.length,turns,input:path.basename(inputFile),inputSha256:hash(input),scenarioPack:packFile,scenarioSha256:hash(fs.readFileSync(path.join(__dirname,packFile))),corpusVersion:stored.corpusVersion,changedCases:changes.length,changes});
  }
  return {version:'expert-brief-equivalence-v1',checkedAt:new Date().toISOString(),round,parserSha256:hash(fs.readFileSync(path.join(__dirname,'../brief.cjs'))),comparison:'Exact JSON.stringify equality of final briefs after all follow-up messages',modelCalls:0,indexBuilds:0,splits,passed:splits.every(s=>s.changedCases===0),limitations:['Compares deterministic brief outputs only; does not replay retrieval or verify model-backed interpretation.','Unchanged criteria do not revalidate unrelated search, evidence or interface changes.']};
}
if(require.main===module){
  try{
    const round=process.argv.find(a=>a.startsWith('--round='))?.slice(8)||'discovery-fix-v2';
    const reportName=process.argv.find(a=>a.startsWith('--report='))?.slice(9)||'brief-equivalence-discovery-final';
    if(!/^[a-z0-9-]+$/.test(reportName))throw Error('Use a named local report.');
    const output=path.join(__dirname,'../.cache',reportName+'.json');
    if(fs.existsSync(output))throw Error('The immutable report already exists. Use a new --report name.');
    const report=verify({round});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({report:path.basename(output),passed:report.passed,parserSha256:report.parserSha256,splits:report.splits.map(({split,cases,turns,changedCases})=>({split,cases,turns,changedCases}))},null,2));
    if(!report.passed)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={verify,compareBriefs};
