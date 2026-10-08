'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createExpertGeoService,filterCandidates,locationFromMessage,splitLocationInstruction,validateLocation}=require('./geo.cjs');
const {buildCorpus}=require('./data.cjs');
const point={latitude:51.5,longitude:-.12};
const reply=result=>({ok:true,status:200,json:async()=>({result})});
const create=options=>createExpertGeoService({cacheFile:null,...options});
const country={kind:'country',country:'GB',query:'UK',label:'UK-wide'};
const radius={kind:'radius',country:'GB',query:'SW1A 1AA',label:'SW1A 1AA',...point,radiusMiles:25,precision:'postcode centre',sourceUrl:'https://api.postcodes.io/postcodes/SW1A1AA'};
test('Anywhere and UK-wide resolve without external lookups',async()=>{
  const geo=create({fetchImpl:async()=>assert.fail('No fetch expected')});
  for(const v of [null,{query:''},{query:'Anywhere'}])assert.deepEqual(await geo.resolveLocation(v),{status:'resolved',location:null});
  for(const query of ['UK','UK-wide','United Kingdom','Great Britain'])assert.deepEqual((await geo.resolveLocation({query})).location,country);
});
test('full postcode and district resolve with distinct precision and explicit radius',async()=>{
  const urls=[],geo=create({fetchImpl:async url=>{urls.push(url);return reply(point);}});
  const full=await geo.resolveLocation({query:'sw1a 1aa'}),district=await geo.resolveLocation({query:'SW5',radiusMiles:10});
  assert.equal(full.location.label,'SW1A 1AA');assert.equal(full.location.radiusMiles,25);assert.equal(full.location.precision,'postcode centre');assert.equal(district.location.radiusMiles,10);assert.equal(district.location.precision,'postcode district centre');assert.match(urls[1],/\/outcodes\/SW5$/);
});
test('city centre and exact named town can resolve without prefix guessing',async()=>{
  const geo=create({fetchImpl:async()=>reply([{name_1:'Bushey',latitude:51.64,longitude:-.36,county_unitary:'Hertfordshire'},{name_1:'Bushey Heath',latitude:51.63,longitude:-.33}])});
  assert.equal((await geo.resolveLocation({query:'London'})).location.precision,'city centre');
  assert.equal((await geo.resolveLocation({query:'Bushey',radiusMiles:50})).location.label,'Bushey, Hertfordshire');
  assert.equal((await geo.resolveLocation({query:'Bush'})).status,'not-found');
});
test('ambiguous names require a county or postcode, and county selection resolves',async()=>{
  const geo=create({fetchImpl:async()=>reply([{name_1:'Newport',latitude:51.58,longitude:-3,county_unitary:'Newport'},{name_1:'Newport',latitude:52.77,longitude:-2.37,county_unitary:'Telford and Wrekin'}])});
  const unresolved=await geo.resolveLocation({query:'Newport'});assert.equal(unresolved.status,'ambiguous');assert.equal(unresolved.suggestions.length,2);
  const selected=await geo.resolveLocation({query:'Newport, Telford and Wrekin'});assert.equal(selected.status,'resolved');assert.equal(selected.location.latitude,52.77);
});
test('invalid radius, supplied coordinates and explicitly unsupported geography cannot broaden',async()=>{
  const geo=create({fetchImpl:async()=>assert.fail('Do not send invalid location')});
  for(const input of [{query:'London',radiusMiles:0},{query:'London',latitude:51},{query:'outside UK'},{query:'Paris, France'}])assert.equal((await geo.resolveLocation(input)).status,'not-found');
  assert.equal(validateLocation({...radius,latitude:999}),false);assert.equal(validateLocation({...radius,radiusMiles:100}),false);
});
test('network failure is distinct from invalid postcode and can recover after a short TTL',async()=>{
  let now=1000,calls=0;const geo=create({clock:()=>now,transientTtlMs:30,fetchImpl:async()=>{calls++;if(calls===1)throw Error('temporary');return reply(point);}});
  assert.equal((await geo.resolveLocation({query:'SW5'})).status,'unavailable');
  assert.equal((await geo.resolveLocation({query:'SW5'})).status,'unavailable');assert.equal(calls,1);
  now+=31;assert.equal((await geo.resolveLocation({query:'SW5'})).status,'resolved');assert.equal(calls,2);
  const missing=create({fetchImpl:async()=>({ok:false,status:404})});assert.equal((await missing.resolveLocation({query:'SW99'})).status,'not-found');
});
test('success cache persists place and postcode entries across restarts',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'expert-geo-')),cacheFile=path.join(dir,'geocodes.json');
  try{
    const a=createExpertGeoService({cacheFile,fetchImpl:async url=>url.includes('/places?')?reply([{name_1:'Bushey',latitude:51.64,longitude:-.36}]):reply(point)});
    await a.resolveLocation({query:'SW5'});await a.resolveLocation({query:'Bushey'});
    const b=createExpertGeoService({cacheFile,fetchImpl:async()=>assert.fail('Expected durable cache')});
    assert.equal((await b.resolveLocation({query:'SW5',radiusMiles:50})).location.radiusMiles,50);assert.equal((await b.resolveLocation({query:'Bushey'})).status,'resolved');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('concurrent lookups share requests without making the selected radius sticky',async()=>{
  let calls=0;const geo=create({fetchImpl:async()=>{calls++;await new Promise(r=>setImmediate(r));return reply(point);}});
  const values=await Promise.all([10,25,50].map(radiusMiles=>geo.resolveLocation({query:'SW5',radiusMiles})));assert.equal(calls,1);assert.deepEqual(values.map(v=>v.location.radiusMiles),[10,25,50]);
});
test('preparation bulk resolves unique practices outside filtering and records provenance',async()=>{
  const calls=[];const geo=create({fetchImpl:async(url,options)=>{calls.push([url,options.method]);if(options.method==='POST')return reply(JSON.parse(options.body).postcodes.map(query=>({query,result:point})));return reply(point);}});
  const candidates=[{locations:[{name:'A',postcode:'SW1A 1AA'},{name:'District',postcode:'SW5'}]},{locations:[{name:'Duplicate',postcode:'SW1A1AA'},{name:'Original',postcode:'SW1A1AA',...point,coordinateSource:'https://hospital.example'}]},{locations:[]}];
  const stats=await geo.prepareLocations(candidates);assert.equal(calls.length,2);assert.equal(stats.geocoded,3);assert.equal(stats.sourceCoordinates,1);assert.equal(stats.candidatesWithCoordinates,2);assert.equal(stats.missingCoordinates,0);
  assert.equal(candidates[0].locations[0].coordinateProvenance.kind,'geocoded-postcode');assert.equal(candidates[1].locations[1].coordinateSource,'https://hospital.example');
  filterCandidates(candidates,radius);assert.equal(calls.length,2,'Filtering adds no I/O');
});
test('failed bulk preparation remains retryable and is not treated as an invalid postcode',async()=>{
  let now=0,calls=0;const geo=create({clock:()=>now,transientTtlMs:10,fetchImpl:async()=>{calls++;if(calls===1)return {ok:false,status:503};return reply(point);}});
  const candidates=[{locations:[{postcode:'SW1A1AA'}]}];assert.equal((await geo.prepareLocations(candidates)).failedPostcodes,1);
  assert.equal((await geo.resolveLocation({query:'SW1A1AA'})).status,'unavailable');now+=11;assert.equal((await geo.resolveLocation({query:'SW1A1AA'})).status,'resolved');
});
test('country filtering uses recorded locations, never professional registration',()=>{
  const candidates=[{id:'registered-only',registrations:[{body:'GMC'}],locations:[]},{id:'postcode',locations:[{postcode:'SW1A1AA'}]},{id:'country',locations:[{country:'Scotland'}]},{id:'overseas',locations:[{postcode:'SW1A1AA',country:'France'}]}];
  const result=filterCandidates(candidates,country);assert.deepEqual(result.results.map(c=>c.id),['postcode','country']);assert.equal(result.stats.excludedUnknown,1);assert.equal(result.stats.excludedOutside,1);assert.equal(filterCandidates(candidates,null).results.length,4);
});
test('radius filters before pagination, preserves relevance order and chooses nearest practice',()=>{
  const candidates=[{id:'far',locations:[{postcode:'M11AA',latitude:53.48,longitude:-2.24}]},{id:'first',locations:[{name:'Far',postcode:'M11AA',latitude:53.48,longitude:-2.24},{name:'Near',postcode:'SW1A1AA',...point}]},{id:'second',locations:[{postcode:'SW1A1AA',latitude:51.501,longitude:-.12}]},{id:'unknown',locations:[{postcode:'SW5'}]}];
  const result=filterCandidates(candidates,radius);assert.deepEqual(result.results.map(c=>c.id),['first','second']);assert.equal(result.results[0].locationMatch.location.name,'Near');assert.equal(result.stats.excludedUnknown,1);assert.equal(result.stats.excludedOutside,1);assert.equal(result.results[0].locationMatch.miles,0);assert.equal(candidates[1].locationMatch,undefined);
});
test('country and radius update parser preserves clinical prose and recognises clearing',()=>{
  assert.equal(locationFromMessage('Cardiologists with radiology interests'),undefined);
  assert.equal(locationFromMessage('Experience in cardiac imaging'),undefined);
  assert.deepEqual(locationFromMessage('Radioactive brain implants in the UK'),{query:'UK'});
  assert.deepEqual(locationFromMessage('Find cardiologists in London'),{query:'London'});
  assert.deepEqual(locationFromMessage('Closer to SW5'),{query:'SW5'});
  assert.deepEqual(locationFromMessage('Within 10 miles of Bristol'),{query:'Bristol',radiusMiles:10});
  assert.deepEqual(locationFromMessage('I need specialists in Paris'),{query:'Paris'});
  assert.deepEqual(locationFromMessage('Find clinicians outside UK'),{query:'outside UK'});
  assert.deepEqual(locationFromMessage('Find clinicians not in London'),{query:'outside London'});
  assert.deepEqual(locationFromMessage('Within 100 miles of Bristol'),{query:'Bristol',radiusMiles:100});
  assert.deepEqual(locationFromMessage('Cardiologists anywhere in the UK'),{query:'UK'});
  assert.equal(locationFromMessage('Remove the London location restriction'),null);
  for(const message of ['Anywhere is fine','Remove the UK location requirement','Remove UK requirement','No location restriction'])assert.equal(locationFromMessage(message),null,message);
});
for(const message of [
  'I need specialists who treat tumours near the brainstem',
  'Cardiologists with research around cardiac imaging',
  'Experience with lesions around the heart',
  'Specialists treating tumours closer to the optic nerve',
  'Researchers working around MRI interpretation',
  'I need a specialist in Endometriosis',
  'Experience in Brachytherapy',
  'A specialist in Multiple Sclerosis',
])test('proximity wording within clinical prose remains expertise: '+message,()=>{
  assert.equal(locationFromMessage(message),undefined);
  assert.deepEqual(splitLocationInstruction(message),{location:undefined,clinicalMessage:message});
});
for(const [message,query]of [
  ['Cardiologists near London','London'],
  ['Cardiologists around Bushey','Bushey'],
  ['Closer to SW5','SW5'],
  ['Cardiologists around SW1A 1AA','SW1A 1AA'],
  ['Cardiologists near the town of Ludlow','Ludlow'],
  ['Cardiologists. Location: Ludlow','Ludlow'],
])test('geographic proximity still recognises places, postcodes and explicit location wording: '+message,()=>{
  assert.deepEqual(locationFromMessage(message),{query});
  assert.ok(!splitLocationInstruction(message).clinicalMessage.includes(query));
});
test('a clinical proximity clause survives alongside an explicit real location',()=>{
  const message='Specialists with research around cardiac imaging in London';
  assert.deepEqual(splitLocationInstruction(message),{location:{query:'London'},clinicalMessage:'Specialists with research around cardiac imaging'});
});
test('unfamiliar towns remain available through the dedicated resolver',async()=>{
  assert.equal(locationFromMessage('Cardiologists near Ludlow'),undefined,'Do not guess an unfamiliar word is a place');
  const geo=create({fetchImpl:async()=>reply([{name_1:'Ludlow',latitude:52.367,longitude:-2.713,county_unitary:'Shropshire'}])});
  const result=await geo.resolveLocation({query:'Ludlow'});assert.equal(result.status,'resolved');assert.equal(result.location.label,'Ludlow, Shropshire');
});
test('source coordinate projection retains valid values, provenance and postcode-only practices',()=>{
  const row={id:'a',name:'Dr Alex Example',gmc_number:'1234567',about:'I report cardiac CT.',locations:[{name:'Recorded',latitude:'51.5',longitude:'-.12',postcode:'SW1A1AA'},{name:'Valid',latitude:51.5,longitude:-.12},{name:'Invalid',latitude:999,longitude:0},{postcode:'SW5'}]};
  const corpus=buildCorpus([row]);const locations=corpus.candidates[0].locations;
  assert.equal(locations.length,4);assert.equal(locations.find(l=>l.name==='Recorded').longitude,-.12);assert.equal(locations.find(l=>l.name==='Valid').coordinateProvenance.sourceRecordId,'a');assert.equal(locations.find(l=>l.name==='Invalid').latitude,undefined);assert.equal(locations.find(l=>l.postcode==='SW5').name,'');
});
test('a coordinate-poor duplicate does not erase an identical recorded practice location',()=>{
  const base={name:'Dr Alex Example',gmc_number:'1234567',about:'I report cardiac CT.'};
  const corpus=buildCorpus([{...base,id:'a',locations:[{name:'Hospital',postcode:'SW1A1AA',...point}]},{...base,id:'b',locations:[{name:'Hospital',postcode:'SW1A1AA'}]}]);assert.equal(corpus.candidates[0].locations[0].latitude,51.5);
});
