'use strict';

// A one-shot diagnostic, never imported by the app. Exactly two tiny synthetic
// requests at most; no professional corpus, private brief or booking data is read.
// An existing report prevents accidental reruns, including after interruption.
const fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {openRouterProvider}=require('../../demo/models.cjs');
const MODEL='deepseek/deepseek-v3.2';
const ENDPOINT='https://openrouter.ai/api/v1/chat/completions';
const METADATA='https://openrouter.ai/api/v1/models/deepseek/deepseek-v3.2/endpoints';
const reportPath=path.resolve(__dirname,'../.cache/model-latency-synthetic.json');
const messages=[{role:'system',content:'Return exactly the JSON object requested, with no explanation.'},{role:'user',content:'Return {"ok":true}.'}];
const schema={type:'json_schema',json_schema:{name:'synthetic_latency_check',strict:true,schema:{type:'object',additionalProperties:false,required:['ok'],properties:{ok:{type:'boolean'}}}}};
const safeError=error=>({name:error?.name||'Error',code:error?.cause?.code||error?.code||null});
const elapsed=start=>Math.round(performance.now()-start);
const write=report=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
function selectMetadata(data){return (data?.data?.endpoints||[]).map(e=>({provider:e.provider_name,tag:e.tag,status:e.status,promptPerMillion:Number(e.pricing.prompt)*1e6,completionPerMillion:Number(e.pricing.completion)*1e6,parameters:e.supported_parameters,uptime30m:e.uptime_last_30m,latency30m:e.latency_last_30m,throughput30m:e.throughput_last_30m}));}
async function probe({name,provider},apiKey,report){
  if(report.calls.length>=2)throw Error('Two-request diagnostic limit reached');
  const call={name,startedAt:new Date().toISOString(),request:{model:MODEL,max_tokens:16,temperature:0,reasoning:{enabled:false},provider,stream:true,responseFormat:'json_schema',syntheticInputOnly:true},headersMs:null,firstByteMs:null,firstEventMs:null,firstContentMs:null,firstReasoningMs:null,provider:null,responseModel:null,finishReason:null,usage:null,sseComments:0,events:0,outputCharacters:0};
  report.calls.push(call);write(report);
  const start=performance.now();
  try{
    const response=await fetch(ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify({model:MODEL,max_tokens:16,temperature:0,reasoning:{enabled:false},provider,messages,response_format:schema,stream:true,stream_options:{include_usage:true}}),signal:AbortSignal.timeout(15000)});
    call.headersMs=elapsed(start);call.httpStatus=response.status;call.contentType=response.headers.get('content-type');
    if(!response.ok){const body=await response.json().catch(()=>null);call.gatewayError={code:body?.error?.code||null};return;}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',finished=false;
    while(!finished){
      const part=await reader.read();if(part.done)break;
      call.firstByteMs??=elapsed(start);buffer+=decoder.decode(part.value,{stream:true});
      const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop();
      for(const frame of frames){
        if(frame.split(/\r?\n/).some(line=>line.startsWith(':')))call.sseComments++;
        const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
        if(!data)continue;if(data==='[DONE]'){finished=true;continue;}
        const item=JSON.parse(data);call.events++;call.firstEventMs??=elapsed(start);
        call.provider=item.provider||call.provider;call.responseModel=item.model||call.responseModel;
        if(item.usage)call.usage=item.usage;
        if(item.error)call.streamError={code:item.error.code||null};
        for(const choice of item.choices||[]){
          if(choice.finish_reason)call.finishReason=choice.finish_reason;
          const delta=choice.delta||{};
          if(delta.content){call.firstContentMs??=elapsed(start);call.outputCharacters+=delta.content.length;}
          if(delta.reasoning||delta.reasoning_content||delta.reasoning_details?.length)call.firstReasoningMs??=elapsed(start);
        }
      }
    }
    call.completed=finished;
  }catch(error){call.error=safeError(error);}
  finally{call.durationMs=elapsed(start);write(report);}
}
async function main(){
  if(!process.argv.includes('--live'))throw Error('Explicit --live required; this makes at most two synthetic paid requests.');
  if(fs.existsSync(reportPath))throw Error('Diagnostic report already exists; do not rerun or overwrite it.');
  require('dotenv').config({path:path.resolve(__dirname,'../../.env.local'),quiet:true});
  require('dotenv').config({path:path.resolve(__dirname,'../.env.local'),override:true,quiet:true});
  const apiKey=process.env.OPENROUTER_API_KEY;if(!apiKey)throw Error('API key is not configured privately');
  const report={version:'synthetic-latency-v1',at:new Date().toISOString(),deadlineMs:15000,maxRequests:2,maxOutputTokensPerRequest:16,model:MODEL,syntheticMessages:messages,metadataUrl:METADATA,networkProbe:null,calls:[],pending:true};
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});
  const started=performance.now();
  try{
    const response=await fetch(METADATA,{signal:AbortSignal.timeout(10000)}),json=await response.json();
    report.networkProbe={status:response.status,durationMs:elapsed(started),endpoints:selectMetadata(json)};
    const direct=report.networkProbe.endpoints.find(e=>e.tag==='friendli');
    if(!response.ok||!direct||direct.status!==0||direct.promptPerMillion>0.6||direct.completionPerMillion>1.7||!['reasoning','response_format','structured_outputs','max_tokens','temperature'].every(p=>direct.parameters.includes(p)))throw Error('Selected provider no longer meets inspected endpoint constraints; no model request made');
    report.providerSelection={tag:'friendli',reason:'Currently status 0 with required structured-output parameters, within existing price caps and high observed uptime; this is a bounded comparison, not a claim that it is universally faster.'};write(report);
    const provider={...openRouterProvider(MODEL),sort:'latency'};
    await probe({name:'automatic-latency',provider},apiKey,report);
    await probe({name:'friendli-only',provider:{...provider,only:['friendli'],allow_fallbacks:false}},apiKey,report);
  }catch(error){report.error=safeError(error);}
  finally{report.pending=false;report.completedAt=new Date().toISOString();write(report);}
  console.log(JSON.stringify({reportPath,networkProbe:report.networkProbe&&{status:report.networkProbe.status,durationMs:report.networkProbe.durationMs},calls:report.calls,error:report.error}));
}
if(require.main===module)main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
module.exports={selectMetadata};
