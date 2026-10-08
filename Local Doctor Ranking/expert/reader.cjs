const fs=require('node:fs/promises');
const path=require('node:path');
const CACHE=()=>process.env.EXPERT_CACHE_DIR||path.join(__dirname,'.cache');
async function fetchRows({onProgress=()=>{}}={}){
  if(Object.hasOwn(process.env,'EXPERT_DATA_RELEASE'))throw Error('Pinned expert releases cannot fetch live source rows.');
  const base=process.env.SUPABASE_URL,token=process.env.EXPERT_READER_TOKEN;
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(base||'')||!/^[a-f0-9]{64}$/.test(token||''))throw Error('Expert reader credentials are not configured.');
  const rows=[],seen=new Set();let after=null,fetchedAt=null;
  for(let page=0;page<250;page++){
    const url=new URL(base.replace(/\/$/,'')+'/functions/v1/docmap-expert-demo-read');if(after)url.searchParams.set('after',after);
    let body;
    for(let attempt=0;attempt<3;attempt++){
      try{const r=await fetch(url,{headers:{'x-docmap-token':token,Accept:'application/json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Expert reader HTTP '+r.status);body=await r.json();break;}catch(e){if(attempt===2)throw e;}
    }
    if(!Array.isArray(body.rows)||body.rows.length>500)throw Error('Invalid expert reader response');
    rows.push(...body.rows);fetchedAt=body.fetchedAt;onProgress({rows:rows.length});
    if(!body.next){const data={rows,fetchedAt,readerVersion:body.readerVersion};await fs.mkdir(CACHE(),{recursive:true});const target=path.join(CACHE(),'raw.json');await fs.writeFile(target+'.tmp',JSON.stringify(data));await fs.rename(target+'.tmp',target);return data;}
    if(typeof body.next!=='string'||seen.has(body.next))throw Error('Invalid expert reader cursor');seen.add(body.next);after=body.next;
  }throw Error('Expert reader safety limit exceeded');
}
async function loadRows(options={}){
  // Release failures must never fall through to a mutable cache or network read.
  if(Object.hasOwn(process.env,'EXPERT_DATA_RELEASE'))return require('./releases.cjs').loadDataRelease(process.env.EXPERT_DATA_RELEASE,{cacheDir:CACHE()});
  const maxAge=Number(process.env.EXPERT_SOURCE_MAX_AGE_HOURS||24)*3600000;
  if(process.env.EXPERT_REFRESH_DATA!=='1')try{const data=JSON.parse(await fs.readFile(path.join(CACHE(),'raw.json'),'utf8'));if(Array.isArray(data.rows)&&data.readerVersion===1&&Number.isFinite(Date.parse(data.fetchedAt))&&Date.now()-Date.parse(data.fetchedAt)<maxAge)return data;}catch{}
  return fetchRows(options);
}
module.exports={fetchRows,loadRows,cacheDir:CACHE};
if(require.main===module){require('dotenv').config({path:path.join(__dirname,'../.env.local'),quiet:true});require('dotenv').config({path:path.join(__dirname,'.env.local'),override:true,quiet:true});fetchRows({onProgress:({rows})=>{if(rows%5000===0)console.log('Professional rows fetched:',rows);}}).then(d=>console.log('Completed professional read:',d.rows.length)).catch(e=>{console.error(e.message);process.exitCode=1;});}
