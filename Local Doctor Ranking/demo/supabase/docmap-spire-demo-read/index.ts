// Dedicated read-only projection for the local DocMap demo.
// Only a SHA-256 digest of the randomly generated server token is deployed.
const TOKEN_HASH = 'b11eaa9bf1561e976e25aab9cd6906a89fc3860ae2b960146a96de2a95605b23';
const COLUMNS = 'id,name,gmc_number,hcpc_number,specialty,specialty_source,about,about_source,clinical_interests,areas_of_interest,procedures,procedures_completed,profile_urls,locations,languages,sources,merge_date,requires_review,do_not_recommend';
const headers = {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply = (status:number, data:unknown) => new Response(JSON.stringify(data),{status,headers});
async function authorized(req:Request) {
  const token = req.headers.get('x-docmap-token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  let difference = 0;
  for(let i=0;i<TOKEN_HASH.length;i++) difference |= hash.charCodeAt(i)^TOKEN_HASH.charCodeAt(i);
  return difference===0;
}
Deno.serve(async(req:Request)=>{
  if(!await authorized(req)) return reply(401,{error:'Unauthorized'});
  if(req.method!=='GET') return reply(405,{error:'Read only'});
  const after = new URL(req.url).searchParams.get('after');
  if(after && !/^[a-zA-Z0-9_-]{1,100}$/.test(after)) return reply(400,{error:'Invalid cursor'});
  const base=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!base || !key) return reply(503,{error:'Reader unavailable'});
  const query=new URLSearchParams({select:COLUMNS,'profile_urls->>spire':'not.is.null',order:'id.asc',limit:'500'});
  if(after) query.set('id','gt.'+after);
  try {
    const upstream=await fetch(base+'/rest/v1/integrated_practitioners?'+query,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
    if(!upstream.ok) return reply(502,{error:'Consultant read failed'});
    const rows=await upstream.json();
    if(!Array.isArray(rows)) return reply(502,{error:'Invalid consultant response'});
    // Location JSON also contains contact details in the source table. Export only practice facts.
    const projected=rows.map(row=>({...row,
      procedures:Array.isArray(row.procedures)?row.procedures.filter(p=>typeof p==='string'):[],
      // Source counts are bands and numeric midpoints, not actual procedure volumes.
      procedures_completed:Array.isArray(row.procedures_completed)?row.procedures_completed.filter(p=>p&&typeof p.description==='string').map(p=>({description:p.description,hospital:p.hospital,code:p.code})):[],
      locations:Array.isArray(row.locations)?row.locations.filter(l=>l && typeof l==='object').map(l=>({
      hospital:l.hospital,source:l.source,address:l.address,street:l.street,city:l.city,region:l.region,
      postcode:l.postcode,latitude:l.latitude,longitude:l.longitude,website:l.website
    })):[]}));
    return reply(200,{rows:projected,next:rows.length===500?rows.at(-1).id:null,source:'integrated_practitioners',fetchedAt:new Date().toISOString()});
  } catch {return reply(502,{error:'Consultant reader unavailable'});}
});
