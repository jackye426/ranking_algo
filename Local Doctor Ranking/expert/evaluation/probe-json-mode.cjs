'use strict';
// One bounded public-evidence diagnostic. Changes transport only, retaining the
// production ownership validator, independent checker and shared 15s deadline.
const fs=require('node:fs'),path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../../.env.local'),quiet:true});
require('dotenv').config({path:path.resolve(__dirname,'../.env.local'),override:true,quiet:true});
const {prepareCases}=require('./verify-model.cjs');
const {createExpertAI}=require('../ai.cjs');
async function main(){
  const file=path.resolve(__dirname,'../.cache/model-json-mode-probe.json');
  if(fs.existsSync(file))throw Error('This diagnostic already ran; preserve its result.');
  const {prepared}=await prepareCases(),item=prepared.find(p=>p.scenario.id==='dermoscopy-study-evidence');
  const model='deepseek/deepseek-v3.2',OpenAI=require('openai');
  const real=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:'https://openrouter.ai/api/v1',maxRetries:0,timeout:15000});
  const report={purpose:'Test whether request-specific constrained schema transport contributes to generation latency.',at:new Date().toISOString(),model,calls:[],pending:true};
  fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  const client={chat:{completions:{create:async(request,options)=>{
    if(report.calls.length>=2)throw Error('Diagnostic call limit');
    const schema=request.response_format.json_schema,call={name:schema.name};report.calls.push(call);
    const wire={...request,response_format:{type:'json_object'},messages:[{role:'system',content:'Return JSON matching this exact structure: '+JSON.stringify(schema.schema)},...request.messages]};
    const started=performance.now();
    try{const response=await real.chat.completions.create(wire,options);call.ms=Math.round(performance.now()-started);call.finishReason=response.choices?.[0]?.finish_reason;call.provider=response.provider||null;call.usage=response.usage;return response;}
    catch(error){call.ms=Math.round(performance.now()-started);call.error={name:error.name,status:error.status||null};throw error;}
  }}}};
  const started=performance.now(),answer=await createExpertAI({client,model})(item.input);
  Object.assign(report,{pending:false,durationMs:Math.round(performance.now()-started),provider:answer.provider,passed:answer.provider==='deepseek',answer});
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  console.log(JSON.stringify({durationMs:report.durationMs,provider:report.provider,passed:report.passed,calls:report.calls}));
}
main().catch(error=>{console.error(error.name);process.exitCode=1;});
