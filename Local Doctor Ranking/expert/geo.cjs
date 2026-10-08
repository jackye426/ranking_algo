'use strict';
// Expert-only geography. Preparation enriches recorded practices, never people,
// and runs before serving searches. Filtering itself never performs network I/O.
const fs=require('node:fs/promises');
const path=require('node:path');
const API='https://api.postcodes.io';
const CACHE_VERSION=1;
const RADII=[10,25,50];
const postcodeKey=value=>typeof value==='string'?value.toUpperCase().replace(/\s/g,''):'';
const FULL_POSTCODE=/^(?:GIR0AA|[A-PR-UWYZ][A-HK-Y]?\d[\dA-HJKPSTUW]?\d[ABD-HJLNP-UW-Z]{2})$/;
const OUTCODE=/^[A-PR-UWYZ][A-HK-Y]?\d[\dA-HJKPSTUW]?$/;
const countryIsUK=value=>/^(?:UK|GB|GBR|United Kingdom|Great Britain|England|Scotland|Wales|Northern Ireland)$/i.test(String(value||'').trim());
const cities={london:[51.5074,-.1278],manchester:[53.4808,-2.2426],birmingham:[52.4862,-1.8904],leeds:[53.8008,-1.5491],bristol:[51.4545,-2.5879]};
const UK_PLACES='london|manchester|birmingham|leeds|glasgow|liverpool|edinburgh|bristol|sheffield|cardiff|nottingham|newcastle|leicester|coventry|belfast|reading|brighton|cambridge|oxford|southampton|york|exeter|bath|norwich|derby|aberdeen|dundee|portsmouth|plymouth|wolverhampton|sunderland|guildford|cheltenham|colchester|windsor|chester|canterbury|salisbury|winchester|st albans|swansea|newport|middlesbrough|bolton|stockport|luton|slough|watford|woking|crawley|maidstone|ipswich|peterborough|milton keynes|northampton|swindon|gloucester|worcester|hereford|lincoln|carlisle|durham|wakefield|huddersfield|halifax|blackpool|preston|burnley|warrington|wigan|rochdale|oldham|doncaster|rotherham|barnsley|hull|harrogate|scarborough|chelmsford|basildon|southend-on-sea|romford|ilford|enfield|barnet|croydon|bromley|kingston upon thames|richmond|wimbledon|putney|elstree|bushey|stanmore|edgware';
function validCoordinates(v){return !!v&&typeof v.latitude==='number'&&Number.isFinite(v.latitude)&&Math.abs(v.latitude)<=90&&typeof v.longitude==='number'&&Number.isFinite(v.longitude)&&Math.abs(v.longitude)<=180;}
function ukCoordinates(v){return validCoordinates(v)&&v.latitude>=49.8&&v.latitude<=61.1&&v.longitude>=-8.3&&v.longitude<=2.2;}
function distanceMiles(a,b){const rad=Math.PI/180,dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad,x=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2;return 3958.7613*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
function recordedUK(location){if(location.country&&!countryIsUK(location.country))return false;return countryIsUK(location.country)||FULL_POSTCODE.test(postcodeKey(location.postcode))||OUTCODE.test(postcodeKey(location.postcode));}
function validateLocation(location){
  if(location===null)return true;
  if(!location||typeof location!=='object'||Array.isArray(location)||location.country!=='GB'||typeof location.query!=='string'||!location.query.trim()||location.query.length>120||typeof location.label!=='string'||location.label.length>160)return false;
  if(location.kind==='country')return true;
  return location.kind==='radius'&&ukCoordinates(location)&&RADII.includes(location.radiusMiles)&&typeof location.precision==='string'&&location.precision.length<=80&&typeof location.sourceUrl==='string'&&/^https:\/\//.test(location.sourceUrl);
}
function filterCandidates(results,filter){
  if(!validateLocation(filter))throw new TypeError('Choose a valid UK location or Anywhere.');
  const stats={total:results.length,included:0,excludedOutside:0,excludedUnknown:0};
  if(filter===null)return {results,stats:{...stats,included:results.length}};
  const selected=[];
  for(const result of results){
    const candidate=result.candidate||result,locations=Array.isArray(candidate.locations)?candidate.locations:[];
    const known=locations.filter(recordedUK);
    if(filter.kind==='country'){
      if(known.length)selected.push({...result,locationMatch:{location:known[0],miles:null,approximate:false}});
      else if(locations.some(l=>l.country&&!countryIsUK(l.country)))stats.excludedOutside++;else stats.excludedUnknown++;
      continue;
    }
    const usable=known.filter(ukCoordinates);
    if(!usable.length){stats.excludedUnknown++;continue;}
    const nearest=usable.map(location=>({location,miles:distanceMiles(filter,location)})).sort((a,b)=>a.miles-b.miles)[0];
    if(nearest.miles<=filter.radiusMiles)selected.push({...result,locationMatch:{...nearest,approximate:true}});else stats.excludedOutside++;
  }
  stats.included=selected.length;return {results:selected,stats};
}
function locationFromMessage(message){
  const text=String(message||'').trim();if(!text)return undefined;
  // A negative instruction to keep an existing filter is not a clearing action.
  if(/\b(?:do not|don['’]t|never|not)\s+(?:remove|clear|drop|delete)\s+(?:the\s+)?(?:(?:UK|United Kingdom)\s+)?(?:location|geograph\w*|UK|United Kingdom)\b/i.test(text))return undefined;
  if(/\b(?:remove|clear|drop)\s+(?:the\s+)?(?:UK|United Kingdom)(?:\s+(?:filter|requirement|restriction))?(?=[.!?;,]|$|\s+(?:and|but|while)\b)/i.test(text))return null;
  if(/^(?:search\s+)?anywhere[.!]?$/i.test(text)||/\banywhere\s+is\s+(?:fine|okay|ok)\b/i.test(text)||/\b(?:no\s+(?:location|geograph\w*)\s+(?:filter|restriction|requirement)|(?:remove|clear|drop)\s+(?:the\s+)?(?:(?:UK|United Kingdom)\s+)?(?:location|geograph\w*)\s*(?:filter|restriction|requirement)?|(?:remove|drop)\s+(?:the\s+)?(?:UK|United Kingdom)\s+(?:filter|requirement|restriction))\b/i.test(text)||new RegExp('\\b(?:remove|clear|drop)\\s+(?:the\\s+)?(?:'+UK_PLACES+')\\s+(?:location\\s+)?(?:filter|requirement|restriction)\\b','i').test(text))return null;
  if(/\b(?:outside|excluding|except|not\s+in)\s+(?:the\s+)?(?:UK|United Kingdom)\b/i.test(text))return {query:'outside UK'};
  const negatedPlace=text.match(new RegExp('\\b(?:outside|excluding|except|not\\s+in)\\s+('+UK_PLACES+')(?![\\p{L}-])','iu'));
  if(negatedPlace)return {query:`outside ${negatedPlace[1]}`};
  const overseas=text.match(/\b(?:in|from|across|throughout|near|around)\s+(?:the\s+)?(US|USA|United States(?: of America)?|France|Germany|Spain|Australia|Canada|Ireland|Paris)\b/i);
  if(overseas)return {query:overseas[1]};
  const radius=text.match(/\bwithin\s+(\d+)\s+miles?\s+(?:of|from)\s+([^.;!?]+)/i);
  if(radius)return {query:radius[2].split(/\s+(?:who|with|and|for|specialis\w*|clinicians?|consultants?)\b/i)[0].trim().replace(/[,. ]+$/,''),radiusMiles:Number(radius[1])};
  // Near/around also describe anatomy and research subjects. Infer geography
  // only for recognised places/postcodes below, or an explicit geographic
  // noun here. An unfamiliar town can always use the dedicated location field.
  const explicit=text.match(/\b(?:location\s*[:=]|(?:based|located)\s+in|(?:near|around|closer\s+to)\s+(?:the\s+)?(?:town|city|village)\s+of)\s+([^.;!?]+)/i);
  if(explicit){const query=explicit[1].split(/\s+(?:who|with|and|for|specialis\w*|clinicians?|consultants?)\b/i)[0].trim().replace(/[,. ]+$/,'');if(query)return {query};}
  const postcode=text.match(/\b(?:in|at|near|around|closer\s+to)\s+([A-PR-UWYZ][A-HK-Y]?\d[\dA-HJKPSTUW]?(?:\s*\d[ABD-HJLNP-UW-Z]{2})?)\b/i);
  if(postcode)return {query:postcode[1]};
  const place=text.match(new RegExp('\\b(?:in|from|across|throughout|near|around|closer\\s+to)\\s+(?:the\\s+)?('+UK_PLACES+')(?![\\p{L}-])','iu'));
  if(place)return {query:place[1]};
  if(/\b(?:in|from|across|throughout|near|around|closer\s+to)\s+(?:the\s+)?(?:UK|United Kingdom|Great Britain)\b|\bUK[- ](?:wide|based)\b/i.test(text)||/^(?:UK|United Kingdom|Great Britain)$/i.test(text))return {query:'UK'};
  // Capitalisation is not geographic evidence: Endometriosis, Brachytherapy
  // and Multiple Sclerosis must remain expertise. Unrecognised places use
  // explicit location wording or the independently resolved location control.
  return undefined;
}
function splitLocationInstruction(message){
  const original=String(message||'').trim(),location=locationFromMessage(original);
  if(location===undefined)return {location,clinicalMessage:original};
  let clinical=original;
  if(location===null){
    // Remove only the recognised control, not the clinical clause beside it.
    const clears=[/\b(?:search\s+)?anywhere(?:\s+is\s+(?:fine|okay|ok))?\b/gi,/\bno\s+(?:location|geograph\w*)\s+(?:filter|restriction|requirement)\b/gi,/\b(?:remove|clear|drop|delete)\s+(?:the\s+)?(?:(?:UK|United Kingdom)\s+)?(?:location|geograph\w*)\s*(?:filter|restriction|requirement)?\b/gi,/\b(?:remove|clear|drop)\s+(?:the\s+)?(?:UK|United Kingdom)(?:\s+(?:filter|requirement|restriction))?(?=[.!?;,]|$|\s+(?:and|but|while)\b)/gi,new RegExp('\\b(?:remove|clear|drop)\\s+(?:the\\s+)?(?:'+UK_PLACES+')\\s+(?:location\\s+)?(?:filter|requirement|restriction)\\b','gi')];
    for(const pattern of clears)clinical=clinical.replace(pattern,' ');
  }else{
    const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
    const query=location.query==='UK'?'(?:UK|United Kingdom|Great Britain)':escape(location.query.replace(/^outside\s+/i,''));
    const lead=/^outside\s+/i.test(location.query)?'(?:outside|excluding|except|not\\s+in)':'(?:(?:within\\s+\\d+\\s+miles?\\s+(?:of|from))|(?:location\\s*[:=])|(?:(?:based|located)\\s+in)|(?:(?:near|around|closer\\s+to)\\s+(?:the\\s+)?(?:town|city|village)\\s+of)|(?:in|from|across|throughout|near|around|closer\\s+to))';
    const pattern=new RegExp('\\b'+lead+'\\s+(?:the\\s+)?'+query+'(?:\\s+only)?(?![\\p{L}\\d-])','giu');
    clinical=clinical.replace(pattern,' ');
    if(location.query==='UK')clinical=clinical.replace(/\bUK[- ](?:wide|based)\b/gi,' ');
    if(new RegExp('^(?:'+query+')(?:\\s+only)?[.!?\\s]*$','i').test(clinical))clinical='';
  }
  clinical=clinical.replace(/^[\s,;.!?]*(?:(?:and|also|please)\b[\s,;.!?]*)+/i,'').replace(/^[\s,;.!?]+|[\s,;.!?]+$/g,'').replace(/\s+/g,' ').trim();
  return {location,clinicalMessage:clinical};
}
function createExpertGeoService({fetchImpl=(...args)=>fetch(...args),cacheFile=process.env.EXPERT_GEO_CACHE_FILE||path.join(process.env.EXPERT_CACHE_DIR||path.join(__dirname,'.cache'),'geocodes-v1.json'),clock=Date.now,concurrency=4,transientTtlMs=30000,notFoundTtlMs=86400000,successTtlMs=31536000000}={}){
  let cache=new Map(),loaded=false,initializing=null,writeQueue=Promise.resolve(),active=0;
  const inflight=new Map(),waiting=[],max=Math.min(8,Math.max(1,concurrency|0));
  const unavailable=query=>({status:'unavailable',query,message:'Location lookup is temporarily unavailable. Retry, edit the location, or explicitly search anywhere.'});
  const missing=query=>({status:'not-found',query,message:'We could not resolve that UK location. Enter a UK city, town, postcode or postcode district, or choose Anywhere. International locations are not supported yet.'});
  async function initGeo(){if(loaded)return;if(initializing)return initializing;initializing=(async()=>{try{if(cacheFile){const data=JSON.parse(await fs.readFile(cacheFile,'utf8'));if(data.version===CACHE_VERSION)for(const [key,entry]of Object.entries(data.entries||{})){if(entry.expiresAt>clock()&&entry.result?.status==='resolved'&&validateLocation(entry.result.location))cache.set(key,entry);}}}catch{}finally{loaded=true;}})();await initializing;}
  function persist(){if(!cacheFile)return Promise.resolve();writeQueue=writeQueue.catch(()=>{}).then(async()=>{const entries=Object.fromEntries([...cache].filter(([,v])=>v.result.status==='resolved'&&v.expiresAt>clock()));await fs.mkdir(path.dirname(cacheFile),{recursive:true});const temp=`${cacheFile}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify({version:CACHE_VERSION,entries}));await fs.rename(temp,cacheFile);}).catch(()=>{});return writeQueue;}
  function get(key){const v=cache.get(key);if(v&&v.expiresAt>clock())return structuredClone(v.result);cache.delete(key);return null;}
  function put(key,result){cache.set(key,{result:structuredClone(result),expiresAt:clock()+(result.status==='resolved'?successTtlMs:result.status==='unavailable'?transientTtlMs:notFoundTtlMs)});}
  async function acquire(){if(active<max){active++;return;}await new Promise(resolve=>waiting.push(resolve));}
  function release(){if(waiting.length)waiting.shift()();else active--;}
  async function request(url,options){await acquire();try{return await fetchImpl(url,{...options,signal:AbortSignal.timeout(8000)});}finally{release();}}
  function point(query,v,sourceUrl,precision,label=query){return {status:'resolved',location:{kind:'radius',country:'GB',query,label,latitude:v.latitude,longitude:v.longitude,radiusMiles:25,precision,sourceUrl}};}
  async function lookup(query){
    const code=postcodeKey(query),isPostcode=FULL_POSTCODE.test(code),isOutcode=OUTCODE.test(code);
    const key=isPostcode||isOutcode?`postcode:${code}`:`place:${query.toLowerCase()}`;
    const existing=get(key);if(existing)return existing;
    if(inflight.has(key))return inflight.get(key);
    const task=(async()=>{let result;try{
      if(isPostcode||isOutcode){const url=`${API}/${isPostcode?'postcodes':'outcodes'}/${encodeURIComponent(code)}`,response=await request(url);if(!response.ok)result=response.status===404?missing(query):unavailable(query);else{const value=(await response.json()).result;result=ukCoordinates(value)?point(query,value,url,isPostcode?'postcode centre':'postcode district centre',isPostcode?`${code.slice(0,-3)} ${code.slice(-3)}`:code):value===null?missing(query):unavailable(query);}}
      else if(cities[query.toLowerCase()]){const [latitude,longitude]=cities[query.toLowerCase()];result=point(query,{latitude,longitude},'https://www.openstreetmap.org/','city centre',query.replace(/\b\w/g,s=>s.toUpperCase()));}
      else{
        const parts=query.split(',').map(x=>x.trim()).filter(Boolean),name=parts[0].toLowerCase(),region=parts.slice(1).join(', ').toLowerCase();
        const url=`${API}/places?q=${encodeURIComponent(name)}&limit=100`,response=await request(url);
        if(!response.ok)result=response.status===404?missing(query):unavailable(query);else{
          const values=(await response.json()).result;
          if(values!==null&&!Array.isArray(values))throw new Error('Invalid location response');
          const exact=(Array.isArray(values)?values:[]).filter(p=>ukCoordinates(p)&&[p.name_1,p.name_2].some(n=>typeof n==='string'&&n.toLowerCase()===name)&&(!region||[p.county_unitary,p.district_borough,p.region,p.country].some(x=>String(x||'').toLowerCase()===region)));
          const unique=[];for(const p of exact)if(!unique.some(q=>distanceMiles(p,q)<.2))unique.push(p);
          if(unique.length===1){const place=unique[0],area=place.county_unitary||place.district_borough||place.country;result=point(query,place,url,'mapped place centre',[place.name_1,area].filter(Boolean).join(', '));}
          else if(unique.length>1)result={status:'ambiguous',query,message:'More than one UK place has that name. Add a county or use a postcode.',suggestions:[...new Set(unique.map(p=>[p.name_1,p.county_unitary||p.district_borough||p.country].filter(Boolean).join(', ')))].slice(0,8)};
          else result=missing(query);
        }
      }
    }catch{result=unavailable(query);}put(key,result);if(result.status==='resolved')await persist();return result;})();
    inflight.set(key,task);try{return await task;}finally{inflight.delete(key);}
  }
  async function resolveLocation(input){
    if(input===null)return {status:'resolved',location:null};
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['query','radiusMiles'].includes(k))||typeof input.query!=='string'||input.query.length>120||input.radiusMiles!==undefined&&!RADII.includes(input.radiusMiles))return {...missing(''),message:'Enter a UK location and choose a radius of 10, 25 or 50 miles.'};
    const query=input.query.trim().replace(/\s+/g,' ').replace(/(?:,\s*|\s+)(?:UK|United Kingdom)$/i,'');
    if(!query||/^(?:anywhere|all locations)$/i.test(query))return {status:'resolved',location:null};
    if(/^(?:UK[- ]?wide|UK|United Kingdom|Great Britain)$/i.test(query))return {status:'resolved',location:{kind:'country',country:'GB',query:'UK',label:'UK-wide'}};
    if(!/^[\p{L}\d .,'’-]{2,120}$/u.test(query)||/\b(?:outside|excluding|except|USA|United States|France|Germany|Spain|Australia|Canada|Ireland)\b/i.test(query))return missing(query);
    await initGeo();const result=await lookup(query);return result.status==='resolved'?{...result,location:{...result.location,radiusMiles:input.radiusMiles||25}}:result;
  }
  async function prepareLocations(candidates){
    await initGeo();const groups=new Map(),stats={candidates:candidates.length,locations:0,sourceCoordinates:0,geocoded:0,candidatesWithUKLocation:0,candidatesWithCoordinates:0,missingCoordinates:0,failedPostcodes:0,cachePersistence:!!cacheFile};
    for(const candidate of candidates)for(const location of candidate.locations||[]){stats.locations++;if(validCoordinates(location)){stats.sourceCoordinates++;continue;}if(location.country&&!countryIsUK(location.country))continue;const code=postcodeKey(location.postcode);if(!FULL_POSTCODE.test(code)&&!OUTCODE.test(code))continue;if(!groups.has(code))groups.set(code,[]);groups.get(code).push(location);}
    // Bulk full-postcode preparation avoids one HTTP request per candidate and
    // never runs on the interactive search path. Outcodes use their own endpoint.
    const full=[...groups.keys()].filter(code=>FULL_POSTCODE.test(code)&&!get(`postcode:${code}`));
    const batches=[];for(let i=0;i<full.length;i+=100)batches.push(full.slice(i,i+100));
    await Promise.all(batches.map(async codes=>{try{const response=await request(`${API}/postcodes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postcodes:codes})});if(!response.ok){for(const code of codes)put(`postcode:${code}`,unavailable(code));return;}const body=await response.json();if(!Array.isArray(body.result))throw new Error('Invalid location response');const rows=body.result;for(const code of codes){const value=rows.find(r=>postcodeKey(r.query)===code)?.result;put(`postcode:${code}`,ukCoordinates(value)?point(code,value,`${API}/postcodes/${code}`,'postcode centre',`${code.slice(0,-3)} ${code.slice(-3)}`):value===null?missing(code):unavailable(code));}}catch{for(const code of codes)put(`postcode:${code}`,unavailable(code));}}));
    await Promise.all([...groups].map(async([code,locations])=>{const value=await lookup(code);if(value.status!=='resolved'){stats.failedPostcodes++;return;}for(const location of locations){const v=value.location;Object.assign(location,{latitude:v.latitude,longitude:v.longitude,coordinateSource:v.sourceUrl,coordinatePrecision:v.precision,coordinateProvenance:{kind:'geocoded-postcode',sourceUrl:v.sourceUrl,postcode:code,retrievedAt:new Date(clock()).toISOString()}});stats.geocoded++;}}));
    await persist();for(const c of candidates){if(c.locations?.some(recordedUK))stats.candidatesWithUKLocation++;if(c.locations?.some(l=>recordedUK(l)&&ukCoordinates(l)))stats.candidatesWithCoordinates++;}stats.missingCoordinates=candidates.reduce((n,c)=>n+(c.locations||[]).filter(l=>recordedUK(l)&&!ukCoordinates(l)).length,0);return stats;
  }
  return {initGeo,resolveLocation,prepareLocations,filterCandidates};
}
module.exports={createExpertGeoService,filterCandidates,locationFromMessage,splitLocationInstruction,validateLocation,validCoordinates,recordedUK,distanceMiles,RADII};
