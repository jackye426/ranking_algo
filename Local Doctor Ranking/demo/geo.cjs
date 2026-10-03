const fs = require('node:fs/promises');
const path = require('node:path');
const { haversineDistance } = require('../location-filter');
const file = path.join(__dirname, '.cache', 'geocodes.json');
// City-centre anchors are only used for an explicitly disclosed 35-mile catchment.
const cities = {london:{latitude:51.5074,longitude:-0.1278},manchester:{latitude:53.4808,longitude:-2.2426},birmingham:{latitude:52.4862,longitude:-1.8904},leeds:{latitude:53.8008,longitude:-1.5491},bristol:{latitude:51.4545,longitude:-2.5879}};
const postcodeKey = value => typeof value === 'string' ? value.toUpperCase().replace(/\s+/g,'') : '';
const validCoordinates = value => value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;

// Shared hospital postcodes use one lookup, including concurrent user requests.
function createGeoService({fetchImpl = (...args) => fetch(...args), cacheFile = file, concurrency = 4} = {}) {
  let cache = Object.create(null);
  const failures = new Set(), inFlight = new Map(), waiting = [];
  const limit = Math.max(1, Math.min(8, Math.trunc(concurrency) || 4));
  let active = 0, writes = Promise.resolve();
  async function initGeo() {
    failures.clear();
    cache = Object.create(null);
    if (!cacheFile) return;
    try {
      const saved = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
      for (const [code, value] of Object.entries(saved || {})) {
        if (/^[A-Z]{1,2}\d[A-Z\d]?(\d[A-Z]{2})?$/.test(code) && validCoordinates(value)) cache[code] = value;
      }
    } catch {}
  }
  async function acquire() {
    if (active < limit) { active++; return; }
    await new Promise(resolve => waiting.push(resolve));
  }
  function release() {
    if (waiting.length) waiting.shift()();
    else active--;
  }
  function persist() {
    if (!cacheFile) return Promise.resolve();
    // Serialize atomic file replacements so parallel lookups cannot corrupt
    // the persistent cache. Disk errors do not undo successful geocoding.
    writes = writes.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(cacheFile), {recursive:true});
      const temporary = `${cacheFile}.${process.pid}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(cache, null, 2));
      await fs.rename(temporary, cacheFile);
    });
    return writes.catch(() => {});
  }
  async function geocodePostcode(postcode) {
    const code = postcodeKey(postcode);
    if (!/^[A-Z]{1,2}\d[A-Z\d]?(\d[A-Z]{2})?$/.test(code)) return null;
    if (cache[code]) return cache[code];
    if (failures.has(code)) return null;
    if (inFlight.has(code)) return inFlight.get(code);
    const task = (async () => {
      await acquire();
      try {
        const endpoint = /\d[A-Z]{2}$/.test(code) && code.length > 4 ? 'postcodes' : 'outcodes';
        const response = await fetchImpl(`https://api.postcodes.io/${endpoint}/${encodeURIComponent(code)}`, {signal:AbortSignal.timeout(8000)});
        if (!response.ok) { failures.add(code); return null; }
        const {result} = await response.json();
        if (!validCoordinates(result)) { failures.add(code); return null; }
        const value = {latitude:result.latitude,longitude:result.longitude,sourceUrl:`https://api.postcodes.io/${endpoint}/${code}`,precision:endpoint === 'outcodes' ? 'postcode district centre' : 'postcode centre'};
        cache[code] = value;
        await persist();
        return value;
      } catch {
        // A shared failure is retried after startup, not for every consultant.
        failures.add(code);
        return null;
      } finally { release(); }
    })();
    inFlight.set(code, task);
    try { return await task; } finally { inFlight.delete(code); }
  }
  async function resolveLocation(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const city = cities[value.trim().toLowerCase()];
    if (city) return {...city,precision:'city centre',city:true};
    if (/^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i.test(value.trim())) return geocodePostcode(value);
    const name=value.trim().toLowerCase().replace(/\s+/g,' ');
    if(!/^[\p{L} .'-]{2,80}$/u.test(name)) return null;
    const key=`place:${name}`;
    if(cache[key]) return cache[key];
    if(failures.has(key)) return null;
    if(inFlight.has(key)) return inFlight.get(key);
    const task=(async()=>{
      await acquire();
      try {
        const url=`https://api.postcodes.io/places?q=${encodeURIComponent(name)}&limit=100`;
        const response=await fetchImpl(url,{signal:AbortSignal.timeout(8000)});
        if(!response.ok) {failures.add(key);return null;}
        const {result}=await response.json();
        const exact=(Array.isArray(result)?result:[]).filter(p=>validCoordinates(p)&&[p.name_1,p.name_2].some(n=>typeof n==='string'&&n.toLowerCase()===name));
        const unique=[...new Map(exact.map(p=>[`${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`,p])).values()];
        // Never choose the first prefix match or guess among same-named towns.
        if(unique.length!==1) {failures.add(key);return null;}
        const place=unique[0];
        cache[key]={latitude:place.latitude,longitude:place.longitude,sourceUrl:url,precision:'mapped place centre',city:true};
        return cache[key];
      } catch {failures.add(key);return null;} finally {release();}
    })();
    inFlight.set(key,task);
    try{return await task;}finally{inFlight.delete(key);}
  }
  async function enrichLocations(records) {
    const groups = new Map();
    for (const record of records) for (const location of record.locations || []) {
      if (validCoordinates(location)) continue;
      const code = postcodeKey(location.postcode);
      if (!code) continue;
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code).push(location);
    }
    await Promise.all([...groups].map(async ([code, locations]) => {
      const result = await geocodePostcode(code);
      if (result) for (const location of locations) Object.assign(location, {latitude:result.latitude,longitude:result.longitude,coordinateSource:result.sourceUrl});
    }));
  }
  return {initGeo, resolveLocation, enrichLocations, geocodePostcode};
}
function distanceTo(record, origin) {
  if (!origin) return null;
  const distances = record.locations.filter(validCoordinates).map(l=>({location:l,miles:haversineDistance(origin.latitude,origin.longitude,l.latitude,l.longitude)}));
  return distances.sort((a,b)=>a.miles-b.miles)[0] || null;
}
module.exports = {...createGeoService(), distanceTo, createGeoService};
