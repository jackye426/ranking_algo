'use strict';
// One bounded rerun justified by the observed inline-citation and length failures.
// Same fictional briefs and reviewed public evidence; never opens the raw cache.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {prepareCases}=require('./verify-model.cjs');
const {createExpertAI,validateDraft}=require('../ai.cjs');
const {createBufferedClient}=require('../transport.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  if(!process.argv.includes('--live'))throw Error('Explicit --live required');
  const protocolFix=process.argv.includes('--protocol-fix');
  const structured=process.argv.includes('--structured');
  const overlap=process.argv.includes('--overlap');
  if([protocolFix,structured,overlap].filter(Boolean).length>1)throw Error('Select one named verification round.');
  const file=path.join(root,'.cache/model-friendli-'+(overlap?'overlap':structured?'structured':protocolFix?'protocol-fix':'format')+'-verification.json');
  if(fs.existsSync(file))throw Error('Preserve the existing one-shot verification report.');
  require('dotenv').config({path:path.join(root,'../.env.local'),quiet:true});
  require('dotenv').config({path:path.join(root,'.env.local'),quiet:true,override:true});
  if(!process.env.OPENROUTER_API_KEY)throw Error('Private key unavailable');
  const {prepared,corpusVersion}=await prepareCases(),OpenAI=require('openai');
  const real=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:'https://openrouter.ai/api/v1',maxRetries:0,timeout:15000,logLevel:'off'});
  const report={version:1,at:new Date().toISOString(),model:'deepseek/deepseek-v3.2',corpusVersion,
    codeHashes:Object.fromEntries(['ai.cjs','transport.cjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),
    hypothesis:overlap?'Describe literal recorded-topic/brief overlap rather than predicted ability to contribute; increase checker output cap from 180 to 360 after two observed truncated verdicts. The frozen calibrated checker, source evidence and shared 15-second deadline are unchanged.':structured?'Separate cited fact from cautious relevance, use server-owned neutral summary and essential confirmation. The frozen checker passed all eight fixed positive/negative synthetic cases. Same three briefs and source evidence; independent check and 15-second deadline remain.':protocolFix?'Accept the observed identical empty terminal choice in the usage footer; still reject contradictory finishes or post-terminal content. Original three input cases and all validation remain unchanged.':'Owned inline citation formatting can be normalized safely; shorter explicit output instructions reserve checker time. The same evidence, validation and shared 15-second deadline apply.',
    providerConstraint:'friendli',maxBriefs:3,maxCalls:6,attempts:[],pending:true};
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  let calls=0;
  for(const item of prepared){
    const attempt={id:item.scenario.id,brief:item.scenario.message,calls:[],pending:true};report.attempts.push(attempt);save();
    const bounded={chat:{completions:{create:(...args)=>{if(++calls>6)throw Error('Call bound');return real.chat.completions.create(...args);}}}};
    const client=createBufferedClient(bounded,{provider:'friendli',onCall:metric=>{attempt.calls.push(metric);save();}});
    const started=performance.now(),answer=await createExpertAI({client,model:report.model})(item.input);
    const durationMs=Math.round(performance.now()-started);
    const checks={deepseek:answer.provider==='deepseek',schema:answer.provider==='deepseek'&&validateDraft({summary:answer.summary,sections:answer.sections},item.context),
      independentSupport:attempt.calls.some(c=>c.name==='expert_support_check'&&Array.isArray(c.structuredOutput?.unsupportedClaims)&&c.structuredOutput.unsupportedClaims.length===0),
      withinBudget:durationMs<=15500};
    Object.assign(attempt,{pending:false,durationMs,checks,passed:Object.values(checks).every(Boolean),answer});save();
    console.log(JSON.stringify({id:attempt.id,durationMs,passed:attempt.passed,failure:answer.failure||null,calls:attempt.calls.map(({structuredOutput,unvalidatedPartialText,...c})=>({...c,unsupportedClaims:structuredOutput?.unsupportedClaims}))}));
  }
  report.pending=false;report.completedAt=new Date().toISOString();report.passed=report.attempts.every(a=>a.passed);save();
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
