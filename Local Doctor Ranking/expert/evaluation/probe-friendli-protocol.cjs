'use strict';
// One tiny synthetic request; retain stream envelope shapes, never credentials.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 if(!process.argv.includes('--live'))throw Error('Explicit --live required');
 const root=path.resolve(__dirname,'..'),file=path.join(root,'.cache/friendli-protocol.json');
 if(fs.existsSync(file))throw Error('Preserve the existing diagnostic');
 require('dotenv').config({path:path.join(root,'../.env.local'),quiet:true});require('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
 const OpenAI=require('openai'),client=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:'https://openrouter.ai/api/v1',timeout:15000,maxRetries:0,logLevel:'off'});
 const report={at:new Date().toISOString(),syntheticOnly:true,maxCalls:1,chunks:[],pending:true};const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
 try{
  const model='deepseek/deepseek-v3.2';const stream=await client.chat.completions.create({model,reasoning:{enabled:false},temperature:0,max_tokens:16,provider:{...require('../../demo/models.cjs').openRouterProvider(model),only:['friendli'],allow_fallbacks:false},stream:true,stream_options:{include_usage:true},messages:[{role:'user',content:'Return exactly {"ok":true}.'}],response_format:{type:'json_schema',json_schema:{name:'protocol',strict:true,schema:{type:'object',additionalProperties:false,required:['ok'],properties:{ok:{type:'boolean'}}}}}},{signal:AbortSignal.timeout(15000)});
  for await(const chunk of stream){report.chunks.push({provider:chunk.provider||null,usage:chunk.usage||null,choices:(chunk.choices||[]).map(c=>({index:c.index,finish:c.finish_reason,deltaKeys:Object.keys(c.delta||{}),contentCharacters:(c.delta?.content||'').length,refusal:!!c.delta?.refusal}))});save();}
 }finally{report.pending=false;save();}
 console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.name);process.exitCode=1;});
