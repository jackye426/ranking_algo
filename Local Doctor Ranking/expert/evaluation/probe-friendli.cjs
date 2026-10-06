'use strict';
// One bounded verification round after the synthetic routing diagnosis.
// Public, independently reviewed professional excerpts and fictional briefs
// only. Existing ownership validation, support check and 15s budget remain.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {prepareCases}=require('./verify-model.cjs');
const {createExpertAI,validateDraft}=require('../ai.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  if(!process.argv.includes('--live'))throw Error('Explicit --live required');
  const file=path.join(root,'.cache/model-friendli-verification.json');
  if(fs.existsSync(file))throw Error('This bounded round already started; preserve its result.');
  require('dotenv').config({path:path.join(root,'../.env.local'),quiet:true});
  require('dotenv').config({path:path.join(root,'.env.local'),quiet:true,override:true});
  if(!process.env.OPENROUTER_API_KEY)throw Error('Key unavailable');
  const {prepared,corpusVersion}=await prepareCases(),OpenAI=require('openai');
  const real=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:'https://openrouter.ai/api/v1',maxRetries:0,timeout:15000});
  const report={version:1,at:new Date().toISOString(),model:'deepseek/deepseek-v3.2',corpusVersion,codeHash:createHash('sha256').update(fs.readFileSync(path.join(root,'ai.cjs'))).digest('hex'),providerConstraint:'friendli',transport:'SDK internal stream; no unvalidated content displayed',maxBriefs:3,maxCalls:6,attempts:[],pending:true};
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  for(const item of prepared){
    const attempt={id:item.scenario.id,calls:[],pending:true};report.attempts.push(attempt);save();
    const client={chat:{completions:{create:async(request,options)=>{
      if(report.attempts.reduce((n,a)=>n+a.calls.length,0)>=6)throw Error('Call bound');
      const call={name:request.response_format.json_schema.name,requestCharacters:JSON.stringify(request.messages).length};attempt.calls.push(call);save();
      const started=performance.now();let content='',finish=null,model=null,provider=null,usage=null;
      try{
        const stream=await real.chat.completions.create({...request,provider:{...request.provider,only:['friendli'],allow_fallbacks:false},stream:true,stream_options:{include_usage:true}},options);
        call.headersMs=Math.round(performance.now()-started);
        for await(const chunk of stream){
          model=chunk.model||model;provider=chunk.provider||provider;usage=chunk.usage||usage;
          for(const choice of chunk.choices||[]){if(choice.delta?.content){call.firstContentMs??=Math.round(performance.now()-started);content+=choice.delta.content;}if(choice.finish_reason)finish=choice.finish_reason;}
        }
        call.provider=provider;call.usage=usage;call.finishReason=finish;call.structuredOutput=JSON.parse(content);
        return {model,provider,usage,choices:[{finish_reason:finish,message:{content}}]};
      }catch(error){call.error={name:error.name,status:error.status||null,code:error.code||null};throw error;}
      finally{call.durationMs=Math.round(performance.now()-started);save();}
    }}}};
    const started=performance.now(),answer=await createExpertAI({client,model:report.model})(item.input);
    const checks={deepseek:answer.provider==='deepseek',schema:answer.provider==='deepseek'&&validateDraft({summary:answer.summary,sections:answer.sections},item.context),independentSupport:attempt.calls.some(c=>c.name==='expert_support_check'&&Array.isArray(c.structuredOutput?.unsupportedClaims)&&c.structuredOutput.unsupportedClaims.length===0),withinBudget:performance.now()-started<=15500};
    Object.assign(attempt,{pending:false,durationMs:Math.round(performance.now()-started),checks,passed:Object.values(checks).every(Boolean),answer,brief:item.scenario.message});save();
    console.log(JSON.stringify({id:attempt.id,durationMs:attempt.durationMs,passed:attempt.passed,calls:attempt.calls.map(({structuredOutput,...c})=>({...c,unsupportedClaims:structuredOutput?.unsupportedClaims}))}));
  }
  report.pending=false;report.completedAt=new Date().toISOString();save();
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
