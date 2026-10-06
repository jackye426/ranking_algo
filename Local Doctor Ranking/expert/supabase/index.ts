// Restricted professional-data reader. Never returns contact enrichment,
// appointment history, booking data, private notes, or the unrestricted raw JSON.
const TOKEN_SHA256 = 'c1beac57be9a5a7c438eade0519ee2ec2c12064245e0689dc7de4380729c5963';
const columns = ['id','name','title','first_name','last_name','name_alternatives','gmc_number','hcpc_number','specialty','specialty_source','specialty_alternatives','about','about_source','about_alternatives','clinical_interests','areas_of_interest','research_interests','nhs_base','nhs_posts','qualifications','detailed_qualifications','professional_memberships','publications','procedures','procedures_completed','procedure_volumes_phin','profile_urls','urls','locations','languages','sources','merge_date','requires_review','do_not_recommend'];
const response = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const pick = (value: unknown,keys: string[]) => value && typeof value==='object' && !Array.isArray(value) ? Object.fromEntries(keys.filter(k=>k in (value as any)).map(k=>[k,(value as any)[k]])) : {};
Deno.serve(async(req:Request)=>{
  if(req.method!=='GET') return response({error:'Method not allowed'},405);
  if(req.headers.has('origin')) return response({error:'Server access only'},403);
  const token=req.headers.get('x-docmap-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token)) return response({error:'Unauthorized'},401);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
  let difference=hash.length^TOKEN_SHA256.length; for(let i=0;i<hash.length;i++) difference|=hash.charCodeAt(i)^TOKEN_SHA256.charCodeAt(i);
  if(difference!==0) return response({error:'Unauthorized'},401);
  const input=new URL(req.url),after=input.searchParams.get('after');
  if([...input.searchParams.keys()].some(k=>k!=='after') || (after&&!/^[A-Za-z0-9_-]{1,160}$/.test(after))) return response({error:'Invalid cursor'},400);
  try {
    const base=Deno.env.get('SUPABASE_URL')!;
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
    if(!key) return response({error:'Reader not configured'},503);
    const url=new URL(base+'/rest/v1/integrated_practitioners');
    url.searchParams.set('select',columns.join(','));url.searchParams.set('order','id.asc');url.searchParams.set('limit','500');
    if(after) url.searchParams.set('id','gt.'+after);
    const headers:Record<string,string>={apikey:key,Accept:'application/json'};
    if(!key.startsWith('sb_secret_')) headers.Authorization='Bearer '+key;
    const result=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
    if(!result.ok) return response({error:'Professional data unavailable'},502);
    const rows=await result.json();
    if(!Array.isArray(rows)) return response({error:'Invalid source response'},502);
    for(const row of rows){
      row.locations=(Array.isArray(row.locations)?row.locations:[]).map((v:unknown)=>pick(v,['hospital','name','source','address','street','postcode','city','region','country','website','latitude','longitude']));
      row.procedures_completed=(Array.isArray(row.procedures_completed)?row.procedures_completed:[]).map((v:unknown)=>pick(v,['description','hospital','code','count','count_numeric','period','reporting_period','source_url']));
      row.procedure_volumes_phin=(Array.isArray(row.procedure_volumes_phin)?row.procedure_volumes_phin:[]).map((v:unknown)=>pick(v,['procedure_name','procedure_id','admissions','extracted_from','period','reporting_period','source_url']));
    }
    return response({rows,next:rows.length===500?rows.at(-1).id:null,fetchedAt:new Date().toISOString(),readerVersion:1});
  }catch{return response({error:'Professional data unavailable'},502);}
});
