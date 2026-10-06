'use strict';

// Buffer the provider stream privately. Callers receive a complete JSON response,
// never partial prose; ownership and support validation still run in ai.cjs.
// This adapter is independent of the patient application's model transport.
function createBufferedClient(client,{provider='',onCall}={}){
  if(!['','friendli'].includes(provider))throw new Error('Unsupported expert provider route');
  return {chat:{completions:{create:async(request,options)=>{
    const started=performance.now();
    const metric={name:request.response_format?.json_schema?.name,route:provider||'automatic'};
    let stream,content='',finish=null,model=null,actualProvider=null,usage=null;
    try{
      options.signal?.throwIfAborted();
      stream=await client.chat.completions.create({...request,
        provider:provider?{...request.provider,only:[provider],allow_fallbacks:false}:request.provider,
        stream:true,stream_options:{include_usage:true}},options);
      metric.headersMs=Math.round(performance.now()-started);
      for await(const chunk of stream){
        options.signal?.throwIfAborted();
        if(chunk.error)throw new Error('Provider stream error');
        model=chunk.model||model;actualProvider=chunk.provider||actualProvider;usage=chunk.usage||usage;
        if((chunk.choices||[]).length>1)throw new Error('Multiple provider responses');
        for(const choice of chunk.choices||[]){
          if(choice.index!==undefined&&choice.index!==0)throw new Error('Unexpected response index');
          if(choice.delta?.refusal)throw new Error('Provider refused the request');
          if(finish){
            // OpenRouter's final usage event repeats the same terminal choice.
            // Accept that metadata-only repetition, never a changed finish or
            // new content (including length/content_filter being changed to stop).
            const metadataOnly=chunk.usage&&choice.finish_reason===finish&&!choice.delta?.content&&Object.keys(choice.delta||{}).every(key=>['content','role'].includes(key));
            if(metadataOnly)continue;
            throw new Error('Choice after completed response');
          }
          if(choice.delta?.content){
            metric.firstContentMs??=Math.round(performance.now()-started);
            content+=choice.delta.content;
            if(content.length>32768)throw new Error('Provider response too large');
          }
          if(choice.finish_reason)finish=choice.finish_reason;
        }
      }
      options.signal?.throwIfAborted();
      if(finish!=='stop')throw Object.assign(new Error('Incomplete provider response'),{expertReason:'incomplete-response'});
      metric.structuredOutput=JSON.parse(content);
      return {model,provider:actualProvider,usage,choices:[{finish_reason:finish,message:{content}}]};
    }catch(error){
      // Do not retain an upstream error message: it can echo source material.
      metric.error={name:error.name,status:error.status||null,code:error.code||null};
      if(onCall&&content)metric.unvalidatedPartialText=content.slice(0,16384);
      stream?.controller?.abort();
      throw error;
    }finally{
      Object.assign(metric,{durationMs:Math.round(performance.now()-started),provider:actualProvider,usage,finishReason:finish});
      // Opt-in diagnostic observer only. Production has none and logs no content.
      if(onCall)try{onCall(metric);}catch{}
    }
  }}}};
}
module.exports={createBufferedClient};
