'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBufferedClient}=require('./transport.cjs');
const request={model:'deepseek/deepseek-v3.2',provider:{data_collection:'deny',require_parameters:true,max_price:{prompt:.6,completion:1.7}},response_format:{type:'json_schema',json_schema:{name:'example'}}};
const chunk=(text,finish)=>({provider:'Friendli',model:request.model,choices:[{index:0,delta:{content:text},finish_reason:finish}]});
function fake(chunks){const calls=[];let aborted=false;return {calls,get aborted(){return aborted;},chat:{completions:{create:async(...args)=>{calls.push(args);const iterator=(async function*(){for(const c of chunks)yield c;})();iterator.controller={abort(){aborted=true;}};return iterator;}}}};}
test('buffered transport returns only complete output and preserves the request deadline and privacy controls',async()=>{
  const raw=fake([chunk('{"ok":',null),chunk('true}','stop'),{choices:[],usage:{total_tokens:5}}]),metrics=[];
  const options={signal:AbortSignal.timeout(1000),timeout:15000};
  const result=await createBufferedClient(raw,{provider:'friendli',onCall:m=>metrics.push(m)}).chat.completions.create(request,options);
  assert.equal(result.choices[0].message.content,'{"ok":true}');assert.equal(result.provider,'Friendli');
  assert.equal(raw.calls[0][1],options);assert.deepEqual(raw.calls[0][0].provider,{...request.provider,only:['friendli'],allow_fallbacks:false});
  assert.equal(raw.calls[0][0].stream,true);assert.equal(metrics.length,1);assert.equal(metrics[0].finishReason,'stop');assert.deepEqual(metrics[0].structuredOutput,{ok:true});
  assert.deepEqual(request.provider,{data_collection:'deny',require_parameters:true,max_price:{prompt:.6,completion:1.7}});
});
test('automatic route remains automatic unless configured explicitly',async()=>{
 const raw=fake([chunk('{}','stop')]);await createBufferedClient(raw).chat.completions.create(request,{});assert.deepEqual(raw.calls[0][0].provider,request.provider);
});
test('observed Friendli usage footer may repeat the identical empty terminal choice',async()=>{
 const raw=fake([chunk('{"ok":true}',null),chunk('', 'stop'),{...chunk('', 'stop'),usage:{total_tokens:17}}]);
 const result=await createBufferedClient(raw).chat.completions.create(request,{});assert.equal(result.choices[0].message.content,'{"ok":true}');assert.equal(result.usage.total_tokens,17);
});
for(const [label,chunks]of [
 ['empty stream',[]],['missing finish',[chunk('{}',null)]],['truncation',[chunk('{}','length')]],
 ['content filter',[chunk('{}','content_filter')]],['invalid JSON',[chunk('{','stop')]],
 ['provider error',[{error:{message:'untrusted content'}}]],['refusal',[{choices:[{delta:{refusal:'refused'},finish_reason:'stop'}]}]],
 ['oversize response',[chunk('x'.repeat(32769),'stop')]],['extra content',[chunk('{}','stop'),chunk('extra',null)]],
 ['length changed to stop',[chunk('{}','length'),chunk(null,'stop')]],
 ['filter changed to stop',[chunk('{}','content_filter'),chunk(null,'stop')]],
 ['usage cannot repair truncation',[chunk('{}','length'),{...chunk('','stop'),usage:{total_tokens:1}}]],
 ['usage cannot append content',[chunk('{}','stop'),{...chunk(' extra','stop'),usage:{total_tokens:1}}]],
 ['extra choice',[{choices:[{index:0,delta:{}},{index:1,delta:{}}]}]]
])test(label+' never returns unvalidated partial content',async()=>{
 const raw=fake(chunks),metrics=[];await assert.rejects(createBufferedClient(raw,{onCall:m=>metrics.push(m)}).chat.completions.create(request,{}));
 assert.equal(raw.aborted,true);assert.equal(metrics.length,1);assert.ok(metrics[0].error);assert.equal(metrics[0].error.message,undefined);
});
test('already expired deadline sends no provider request',async()=>{
 const raw=fake([]),controller=new AbortController();controller.abort();await assert.rejects(createBufferedClient(raw).chat.completions.create(request,{signal:controller.signal}));assert.equal(raw.calls.length,0);
});
test('diagnostic observer errors cannot change an otherwise complete response',async()=>{
 const result=await createBufferedClient(fake([chunk('{}','stop')]),{onCall(){throw Error('observer');}}).chat.completions.create(request,{});assert.equal(result.choices[0].message.content,'{}');
});
test('unknown provider is rejected before any request',()=>assert.throws(()=>createBufferedClient(fake([]),{provider:'unapproved'}),/Unsupported/));
