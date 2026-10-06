'use strict';
// Explicit hosted smoke/latency run. Fictional briefs only; no project data or
// automatic explanation requests. Results stay in the ignored local cache.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
async function main(){
  const base=process.argv.find(a=>a.startsWith('--url='))?.slice(6),round=process.argv.find(a=>a.startsWith('--round='))?.slice(8)||'initial';
  if(!base||!/^https:\/\/docmap-expert-discovery-production\.up\.railway\.app\/?$/.test(base)||!/^[a-z0-9-]+$/.test(round))throw Error('Select the authorised expert preview URL and a named verification round.');
  const file=path.join(root,`.cache/hosted-verification-${round}.json`);
  if(fs.existsSync(file))throw Error('This round already exists. Preserve its observations.');
  const report={at:new Date().toISOString(),base,round,assets:[],searches:[],pending:true};
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  const health=await fetch(new URL('/api/expert/health',base),{signal:AbortSignal.timeout(15000)});
  if(!health.ok)throw Error('Expert index is not ready. No search requests made.');
  report.health=await health.json();fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
  for(const route of ['/expert-discovery','/expert-discovery/directory','/expert-discovery/project','/expert-assets/app.js','/expert-assets/projects.js','/expert-assets/styles.css','/fonts/inter-variable.ttf','/brand/docmap-logo.jpg','/expert-assets/.env.local','/expert-assets/.cache/raw.json','/api/chat']){
    const response=await fetch(new URL(route,base),{signal:AbortSignal.timeout(15000)}),bytes=Buffer.from(await response.arrayBuffer());
    const local=route.startsWith('/expert-discovery')?'public/index.html':route.startsWith('/expert-assets/')&&!route.includes('/.')?'public/'+route.slice('/expert-assets/'.length):route.startsWith('/fonts/')||route.startsWith('/brand/')?'../public'+route:null;
    const asset={route,status:response.status,type:response.headers.get('content-type'),csp:!!response.headers.get('content-security-policy')};
    if(local){asset.sha256=createHash('sha256').update(bytes).digest('hex');asset.matchesRelease=asset.sha256===createHash('sha256').update(fs.readFileSync(path.join(root,local))).digest('hex');}
    report.assets.push(asset);save();
  }
  const cases=[...require('./scenarios.cjs').scenarios.filter(c=>c.split==='development'),...require('./holdout-final.cjs').scenarios].filter(c=>!c.family.includes('insufficient')).slice(0,20);
  for(const item of cases){
    const started=performance.now(),observation={id:item.id};report.searches.push(observation);save();
    try{
      const response=await fetch(new URL('/api/expert/search',base),{method:'POST',headers:{'content-type':'application/json',origin:base.replace(/\/$/,'')},body:JSON.stringify({message:item.message}),signal:AbortSignal.timeout(23000)}),data=await response.json();
      Object.assign(observation,{status:response.status,durationMs:Math.round(performance.now()-started),serverTiming:response.headers.get('server-timing'),corpusVersion:data.corpusVersion,total:data.total,shown:data.results?.length,interpretationMode:data.interpretationMode,clarification:data.needsClarification,noticeCount:data.notices?.length||0});
    }catch(error){Object.assign(observation,{durationMs:Math.round(performance.now()-started),error:error.name});}
    save();console.log(JSON.stringify(observation));
  }
  const times=report.searches.map(s=>s.durationMs).sort((a,b)=>a-b);
  report.summary={count:times.length,p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1],successful:report.searches.filter(s=>s.status===200&&s.shown>0).length,p95TargetMet:times.length===20&&times[Math.ceil(times.length*.95)-1]<=8000};
  report.pending=false;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify(report.summary));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
