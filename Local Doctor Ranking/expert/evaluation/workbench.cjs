'use strict';
// Local preparation workbench only; not shipped in the deployment allowlist.
const path=require('node:path'),fs=require('node:fs');
const {start}=require('../server.cjs');
const {evaluate,saveReport}=require('./evaluate.cjs');
async function main(){
  const {engine}=await start();if(!engine.ready)return;
  const split=process.argv.find(v=>v.startsWith('--split='))?.split('=')[1];
  const audit={...engine.corpus.audit,version:engine.corpus.version,generatedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(__dirname,'../.cache/corpus-audit.json'),JSON.stringify(audit,null,2));
  if(!split)return;
  if(!['development','holdout'].includes(split))throw Error('Select development or holdout.');
  const round=process.argv.find(v=>v.startsWith('--pack='))?.split('=')[1]||null;
  if(round&&!['round-two','final'].includes(round))throw Error('Unknown evaluation pack.');
  const splits=split==='development'&&process.argv.includes('--holdout-if-pass')?['development','holdout']:[split];
  for(const current of splits){
    const selected=current==='holdout'&&round?{scenarioPack:require(round==='final'?'./holdout-final.cjs':'./holdout-round-two.cjs'),evaluationRound:round}:{};
    const report=await evaluate({corpus:engine.corpus,engine,split:current,...selected,onCase:r=>console.log('[evaluation]',r.id,JSON.stringify(Object.fromEntries(Object.entries(r.byMode).map(([mode,c])=>[mode,{recall:c.knownRecallAt20,precision:c.sourceSupportedPrecisionAt5,failed:c.checks.filter(x=>!x.pass).map(x=>x.name)}]))))});
    saveReport(report);console.log('[evaluation complete]',JSON.stringify({split:current,summary:report.summary,gates:report.gates,passed:report.passed}));
    if(!report.passed)break;
  }
}
main().catch(e=>{console.error('[workbench]',e.stack);process.exitCode=1;});
