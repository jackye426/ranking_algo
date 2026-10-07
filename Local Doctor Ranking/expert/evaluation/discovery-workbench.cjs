'use strict';
// One local full-corpus index, reused for frozen evaluation and browser QA.
// This workbench is excluded from the deployment allowlist.
const fs=require('node:fs'),path=require('node:path');
async function main(){
  const round=process.argv.find(a=>a.startsWith('--round='))?.slice(8);
  if(!round||!/^[a-z0-9-]+$/.test(round))throw Error('Select a unique evaluation round.');
  process.env.EXPERT_OFFLINE='1';process.env.HOST='127.0.0.1';process.env.PORT='3100';
  // This audit uses the existing local corpus only. Cache age must never turn
  // an interface verification into an unrequested production database refresh.
  const reader=require('../reader.cjs');
  reader.loadRows=async()=>{const raw=JSON.parse(fs.readFileSync(path.join(reader.cacheDir(),'raw.json'),'utf8'));if(!Array.isArray(raw.rows)||raw.readerVersion!==1)throw Error('A valid local professional-record cache is required.');return raw;};
  const {start}=require('../server.cjs'),{evaluate}=require('./evaluate.cjs');
  const paths=['development','holdout'].map(split=>path.join(__dirname,`../.cache/discovery-evaluation-${round}-${split}.json`));
  if(paths.some(p=>fs.existsSync(p)))throw Error('Preserve existing round observations.');
  const {engine}=await start();if(!engine.ready)throw Error('Index preparation failed.');
  if(process.argv.includes('--discovery-focus')){
    const report=await require('./discovery-focus.cjs').evaluateFocus({engine});
    const file=path.join(__dirname,`../.cache/discovery-focus-${round}.json`);
    fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
    console.log('[discovery focus]',JSON.stringify({passed:report.passed,summary:report.summary}));
  }
  for(const [i,split]of (process.argv.includes('--skip-evaluation')?[]:['development','holdout']).entries()){
    const report=await evaluate({corpus:engine.corpus,engine,split,...(split==='holdout'?{scenarioPack:require('./holdout-final.cjs')}:{}),evaluationRound:round,onCase:result=>console.log('[case]',result.id,Object.values(result.byMode).every(mode=>mode.checks.every(check=>check.pass))?'checks pass':'CHECK FAILED')});
    fs.writeFileSync(paths[i],JSON.stringify(report,null,2),{flag:'wx'});
    console.log('[discovery regression]',JSON.stringify({split,summary:report.summary,gates:report.gates,passed:report.passed}));
  }
  console.log('[discovery workbench] '+(process.argv.includes('--skip-evaluation')?'Preview ready (evaluation skipped)':'Frozen evaluation complete')+'; local browser QA server remains on port 3100.');
}
main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
