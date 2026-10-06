'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
const OpenAI=require('openai');
const {createBufferedClient}=require('./transport.cjs');
const {createExpertAI}=require('./ai.cjs');
const encoder=new TextEncoder();
const request={model:'deepseek/deepseek-v3.2',messages:[{role:'user',content:'Entirely synthetic SDK test.'}],provider:{data_collection:'deny',require_parameters:true,max_price:{prompt:.6,completion:1.7}},response_format:{type:'json_object'}};
const chunk=(content,finish)=>({provider:'Friendli',model:request.model,choices:[{index:0,delta:{content},finish_reason:finish}]});
const frame=value=>'data: '+JSON.stringify(value)+'\n\n';
const response=text=>new Response(text,{headers:{'content-type':'text/event-stream'}});
// Every SDK instance receives an explicit local fetch substitute. These tests
// never delegate to global fetch and cannot make a provider/network request.
const client=fetch=>new OpenAI({apiKey:'synthetic-not-a-live-key',baseURL:'https://sdk-test.invalid',maxRetries:0,logLevel:'off',fetch});

test('installed SDK preserves complete JSON through the observed repeated terminal usage footer',async()=>{
  let calls=0,sent;
  const raw=client(async(url,options)=>{
    calls++;sent=JSON.parse(options.body);
    return response(': synthetic keepalive\n\n'+frame(chunk('{"ok":',null))+frame(chunk('true}','stop'))+frame({...chunk('','stop'),usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}})+'data: [DONE]\n\n');
  });
  const answer=await createBufferedClient(raw,{provider:'friendli'}).chat.completions.create(request,{signal:AbortSignal.timeout(1000),timeout:15000});
  assert.equal(calls,1);assert.equal(answer.choices[0].message.content,'{"ok":true}');
  assert.equal(answer.choices[0].finish_reason,'stop');assert.equal(answer.usage.total_tokens,14);
  assert.deepEqual(sent.provider,{...request.provider,only:['friendli'],allow_fallbacks:false});
  assert.equal(sent.stream,true);assert.equal(sent.stream_options.include_usage,true);
});

test('production expert SDK integration does not log malformed SSE even when SDK debug logging is requested by the environment',async()=>{
  const moduleId=require.resolve('openai'),originalExports=require.cache[moduleId].exports;
  const envKeys=['OPENROUTER_API_KEY','EXPERT_OPENROUTER_PROVIDER','OPENAI_LOG'];
  const savedEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  const originalError=console.error,originalWarn=console.warn,originalInfo=console.info,originalDebug=console.debug;
  const logged=[];let calls=0;
  const fakeFetch=async()=>{calls++;return response('data: malformed-synthetic-payload\n\n');};
  try{
    process.env.OPENROUTER_API_KEY='synthetic-not-a-live-key';process.env.EXPERT_OPENROUTER_PROVIDER='friendli';process.env.OPENAI_LOG='debug';
    console.error=console.warn=console.info=console.debug=(...args)=>logged.push(args);
    // Retain the actual production constructor options while replacing only
    // transport. Removing both production logging protections regresses this.
    require.cache[moduleId].exports=function LocalOnlySDK(options){return new OpenAI({...options,fetch:fakeFetch});};
    const candidateId='synthetic-professional';
    const answer=await createExpertAI({model:request.model})({kind:'explanation',brief:{version:1,summary:'Synthetic cardiac CT assessment.',requirements:[{id:'synthetic-requirement',label:'Cardiac CT',kind:'modality',importance:'essential'}]},candidates:[{
      id:candidateId,name:'Fictional Test Professional',role:'Radiologist',specialty:'Clinical radiology',
      evidence:[{id:'synthetic-evidence',candidateId,sourceRecordId:'synthetic-source',text:'The fictional profile lists cardiac CT reporting.',type:'clinical-practice',field:'about',dates:{},qualifiers:[]}],requirementMatrix:[],gaps:[],questions:[]
    }]});
    assert.equal(answer.provider,'evidence');assert.equal(answer.retryable,true);assert.equal(calls,1);
    assert.equal(logged.length,0,'Malformed provider payload or request details must not reach the SDK logger.');
    assert.ok(!JSON.stringify(answer).includes('malformed-synthetic-payload'));
  }finally{
    require.cache[moduleId].exports=originalExports;
    for(const key of envKeys){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key];}
    console.error=originalError;console.warn=originalWarn;console.info=originalInfo;console.debug=originalDebug;
  }
});

test('installed SDK aborts a stalled response mid-content or after stop without releasing buffered text',async()=>{
  for(const terminalAlreadySeen of [false,true]){
    let underlyingAborted=false,watchdog,metrics=[];
    const raw=client(async(url,options)=>new Response(new ReadableStream({start(controller){
      controller.enqueue(encoder.encode(frame(chunk(terminalAlreadySeen?'{}':'{',terminalAlreadySeen?'stop':null))));
      options.signal.addEventListener('abort',()=>{underlyingAborted=true;controller.error(new DOMException('Synthetic cancelled body','AbortError'));},{once:true});
      // Keep the test alive for the unref'ed AbortSignal timer and fail boundedly
      // if the installed SDK ever stops propagating cancellation to the body.
      watchdog=setTimeout(()=>controller.error(new Error('Synthetic stream watchdog')),1000);
    }}),{headers:{'content-type':'text/event-stream'}}));
    const started=performance.now();
    try{
      await assert.rejects(createBufferedClient(raw,{onCall:metric=>metrics.push(metric)}).chat.completions.create(request,{signal:AbortSignal.timeout(40),timeout:15000}),error=>error.name==='TimeoutError');
      assert.equal(underlyingAborted,true);assert.ok(performance.now()-started<900);
      assert.equal(metrics.length,1);assert.equal(metrics[0].structuredOutput,undefined);assert.ok(metrics[0].error);
    }finally{clearTimeout(watchdog);}
  }
});
