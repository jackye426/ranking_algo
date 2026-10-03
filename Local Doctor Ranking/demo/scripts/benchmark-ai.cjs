'use strict';
// An explicit, small benchmark using a generic directory request and public
// consultant evidence. Never prints queries, profile text, credentials or IDs.
require('dotenv').config({path:require('node:path').join(__dirname,'../../.env.local'),quiet:true});
const {explanationClient}=require('../models.cjs');
const {explanationSnapshot,createMatchExplainer}=require('../match-explanation.cjs');
const base=process.env.DOCMAP_BENCHMARK_ORIGIN || 'https://docmap-search-production.up.railway.app';
const remote=process.argv.includes('--remote');
const request=async(path,body)=>{
  const start=performance.now();
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok) throw new Error('Benchmark HTTP '+response.status);
  return {data:await response.json(),ms:Math.round(performance.now()-start),timing:response.headers.get('server-timing')};
};
(async()=>{
  const search=await request('/api/chat',{message:'Knee replacement near SW5 accepting Bupa'});
  console.log(JSON.stringify({phase:'search',ms:search.ms,total:search.data.total,timing:search.timing}));
  const client=remote?null:explanationClient();
  if(!remote&&!client) throw new Error('Configure the existing server-side OpenRouter key before this explicit benchmark.');
  for(const record of search.data.results.slice(0,2)) {
    const body={sessionId:search.data.sessionId,searchId:search.data.searchId,consultantId:record.id};
    if(remote) {
      const result=await request('/api/match-explanation',body);
      console.log(JSON.stringify({phase:'explanation',ms:result.ms,provider:result.data.provider,retryable:result.data.retryable,timing:result.timing}));
      const cached=await request('/api/match-explanation',body);
      console.log(JSON.stringify({phase:'cached-explanation',ms:cached.ms,timing:cached.timing}));
    } else {
      const calls=[];
      const timed={chat:{completions:{create:async(body,options)=>{
        const start=performance.now();
        try {
          const result=await client.chat.completions.create(body,options);
          calls.push({phase:body.response_format.json_schema.name,ms:Math.round(performance.now()-start),provider:result.provider,promptTokens:result.usage?.prompt_tokens,outputTokens:result.usage?.completion_tokens});
          return result;
        } catch(error) {calls.push({ms:Math.round(performance.now()-start),error:error.name});throw error;}
      }}}};
      const start=performance.now();
      const answer=await createMatchExplainer({client:timed,provider:'openrouter'})(explanationSnapshot(search.data.criteria,record));
      console.log(JSON.stringify({phase:'explanation',ms:Math.round(performance.now()-start),provider:answer.provider,retryable:answer.retryable,calls}));
    }
  }
})().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
