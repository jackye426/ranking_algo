const test = require('node:test');
const assert = require('node:assert/strict');
const {createGeoService} = require('./geo.cjs');

test('shared hospital postcodes are fetched once with at most four requests in flight', async () => {
  const calls = new Map();
  let active = 0, maximum = 0;
  const service = createGeoService({cacheFile:null, concurrency:4, fetchImpl:async url => {
    const code = url.split('/').at(-1);
    calls.set(code, (calls.get(code) || 0) + 1);
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return {ok:true, json:async () => ({result:{latitude:51.5,longitude:-0.1}})};
  }});
  const records = Array.from({length:4000}, (_,i) => ({locations:[{postcode:`SW${i%12+1} 1AA`}]}));
  await service.enrichLocations(records);
  assert.equal(calls.size, 12);
  assert.ok([...calls.values()].every(count => count === 1));
  assert.ok(maximum > 1 && maximum <= 4, `observed concurrency ${maximum}`);
  assert.ok(records.every(record => record.locations[0].latitude === 51.5));
  await Promise.all([service.geocodePostcode('sw1 1aa'), service.geocodePostcode('SW11AA')]);
  assert.equal(calls.get('SW11AA'), 1);
});

test('failures and network timeouts are attempted once per startup and can retry next startup', async () => {
  const calls = new Map();
  const service = createGeoService({cacheFile:null, fetchImpl:async url => {
    const code = url.split('/').at(-1);
    calls.set(code, (calls.get(code) || 0) + 1);
    if (code === 'SW2') throw new Error('Timed out');
    return {ok:false};
  }});
  await service.enrichLocations(Array.from({length:100}, () => ({locations:[{postcode:'SW1'},{postcode:'SW2'}]})));
  await Promise.all([service.geocodePostcode('SW1'),service.geocodePostcode('SW2'),service.geocodePostcode('SW2')]);
  assert.deepEqual([...calls], [['SW1',1],['SW2',1]]);
  await service.initGeo();
  await service.geocodePostcode('SW2');
  assert.equal(calls.get('SW2'),2);
});

test('concurrent direct lookups share the pending request and invalid coordinates are rejected', async () => {
  let calls = 0;
  const service = createGeoService({cacheFile:null, fetchImpl:async () => {
    calls++;
    await new Promise(resolve => setImmediate(resolve));
    return {ok:true,json:async () => ({result:{latitude:999,longitude:0}})};
  }});
  const values = await Promise.all(Array.from({length:50}, () => service.geocodePostcode('SW5')));
  assert.equal(calls,1); assert.ok(values.every(value => value === null));
  assert.equal(await service.geocodePostcode(null),null);
  assert.equal(await service.geocodePostcode('not a postcode'),null);
  assert.equal(calls,1);
});

test('named town radii use an exact mapped place and never choose a prefix or ambiguous match',async()=>{
  let calls=0;
  const service=createGeoService({cacheFile:null,fetchImpl:async url=>{
    calls++;const q=new URL(url).searchParams.get('q');
    const result=q==='bushey'?[{name_1:'Bushey',latitude:51.64,longitude:-0.36},{name_1:'Bushey Heath',latitude:51.63,longitude:-0.33}]
      :q==='newport'?[{name_1:'Newport',latitude:51.58,longitude:-3},{name_1:'Newport',latitude:52.77,longitude:-2.37}]
      :[{name_1:'Bushey Heath',latitude:51.63,longitude:-0.33}];
    return {ok:true,json:async()=>({result})};
  }});
  const found=await service.resolveLocation('Bushey');assert.equal(found.latitude,51.64);assert.equal(found.precision,'mapped place centre');
  await service.resolveLocation('Bushey');assert.equal(calls,1);
  assert.equal(await service.resolveLocation('Newport'),null);
  assert.equal(await service.resolveLocation('Bushe'),null);
});
