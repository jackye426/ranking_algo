'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('./server.cjs');
const {createBriefInterpreter}=require('./brief.cjs');
const UK={kind:'country',country:'GB',query:'UK',label:'UK-wide'};
const london={latitude:51.5074,longitude:-.1278},bristol={latitude:51.4545,longitude:-2.5879};
const practice=(name,point,country='UK')=>({name,country,...point});
async function harness(t){
  const people=[
    ['near',[practice('London practice',london)]],
    ['far',[practice('Bristol practice',bristol)]],
    ['unknown',[practice('Unmapped UK practice',{})]],
    ['foreign',[practice('Paris practice',{latitude:48.85,longitude:2.35},'France')]],
    ['missing',[]],
    ['multiple',[practice('Bristol practice',bristol),practice('Second London practice',{latitude:51.53,longitude:-.12})]],
    ['edge',[practice('Nearby practice',{latitude:51.6,longitude:-.15})]],
  ].map(([id,locations])=>({id,name:'Dr '+id,role:'Cardiologist',specialty:'Cardiology',locations,sourceRecordIds:['record-'+id],evidenceIds:['evidence-'+id],evidence:[],requirementMatrix:[],reasons:[],gaps:[],questions:[]}));
  const passages=people.map(c=>({id:c.evidenceIds[0],candidateId:c.id,sourceRecordId:c.sourceRecordIds[0],text:'Recorded training in cardiac CT and coronary disease.',field:'about',type:'training',qualifiers:[],dates:{}}));
  const hidden={id:'hidden',name:'Hidden clinician',sourceRecordIds:['hidden-record'],evidenceIds:['hidden-evidence']};
  // A foreign passage claiming another person's ID must not enter their profile.
  passages.push({id:'wrong-owner',candidateId:'near',sourceRecordId:'record-foreign',text:'Foreign biography must not be displayed.',field:'about',type:'training',qualifiers:[],dates:{}});
  let interpretations=0;const searches=[],resolutions=[];
  const engine={ready:true,corpus:{version:'geo-v1',candidates:[...people,hidden],passages},search:async brief=>{searches.push(structuredClone(brief));return{results:people,corpusVersion:engine.corpus.version};}};
  const offline=createBriefInterpreter({client:null});
  const geo={resolveLocation:async input=>{
    resolutions.push(structuredClone(input));
    if(input===null||/^anywhere$/i.test(input?.query||''))return{status:'resolved',location:null};
    const query=input.query.trim();if(/^(?:UK|United Kingdom)$/i.test(query))return{status:'resolved',location:{...UK}};
    if(/^(?:London|SW5|SW5 0TU)$/i.test(query))return{status:'resolved',location:{...london,kind:'radius',country:'GB',query,label:query,radiusMiles:input.radiusMiles||25,precision:'test point',sourceUrl:'https://api.postcodes.io/outcodes/SW5'}};
    const status=query==='Newport'?'ambiguous':query==='Offline'?'unavailable':'not-found';return{status,query,message:status==='ambiguous'?'More than one UK place has that name.':status==='unavailable'?'Location lookup is temporarily unavailable.':'Unknown UK location.'};
  }};
  const app=createApp(engine,{interpret:async input=>{interpretations++;return offline(input);},geo,generate:async()=>{throw Error('No model generation in location/profile tests');}}),server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const post=async(endpoint,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/expert/'+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
  return{post,engine,searches,resolutions,counts:()=>({interpretations,searches:searches.length}),start:()=>post('search',{message:'Cardiologists with cardiac CT experience'})};
}
const ids=response=>response.body.results.map(c=>c.id);

test('expertise-only search defaults to Anywhere without a geography credential',async t=>{
  const h=await harness(t),result=await h.start();assert.equal(result.status,200);assert.equal(result.body.total,7);assert.equal(result.body.brief.locationFilter,null);assert.ok(!result.body.brief.requirements.some(r=>r.kind==='geography'));assert.equal(h.searches.length,1);
});
test('UK-wide is a hard recorded-practice filter and does not create an essential evidence gap',async t=>{
  const h=await harness(t),result=await h.post('search',{message:'Cardiologists with cardiac CT experience in the UK'});
  assert.equal(result.status,200);assert.deepEqual(ids(result),['near','far','unknown','multiple','edge']);assert.deepEqual(result.body.brief.locationFilter,UK);assert.ok(!result.body.brief.requirements.some(r=>r.kind==='geography'));assert.equal(result.body.locationStats.excludedOutside,1);assert.equal(result.body.locationStats.excludedUnknown,1);assert.equal(result.body.brief.geography,null);
});
test('25-mile filter uses nearest recorded practice, preserves relevance ordering and excludes unmappable records',async t=>{
  const h=await harness(t),result=await h.post('search',{message:'Cardiologists',locationFilter:{query:'London',radiusMiles:25}});
  assert.equal(result.status,200);assert.deepEqual(ids(result),['near','multiple','edge']);assert.ok(result.body.results.every(c=>c.locationMatch.miles<=25));assert.equal(result.body.results[1].locationMatch.location.name,'Second London practice');assert.equal(result.body.locationStats.excludedUnknown,3);assert.equal(result.body.locationStats.excludedOutside,1);assert.equal(result.body.brief.locationFilter.precision,'test point');
});
test('location-only updates and simultaneous expertise/location changes retain the same conversation',async t=>{
  const h=await harness(t),first=(await h.start()).body;
  const changed=await h.post('search',{sessionId:first.sessionId,locationFilter:{query:'SW5',radiusMiles:10}});
  assert.equal(changed.status,200);assert.equal(changed.body.brief.version,first.brief.version+1);assert.deepEqual(changed.body.brief.requirements,first.brief.requirements);assert.deepEqual(h.counts(),{interpretations:1,searches:2});
  const refined=await h.post('search',{sessionId:first.sessionId,message:'Research is helpful.',locationFilter:{query:'UK'}});
  assert.equal(refined.status,200);assert.ok(refined.body.brief.requirements.some(r=>r.kind==='research'&&r.importance==='preferred'));assert.equal(refined.body.brief.locationFilter.kind,'country');assert.ok(refined.body.brief.requirements.some(r=>r.label==='Cardiac CT'));
});
test('explicit location field wins over sentence geography, with a visible notice',async t=>{
  const h=await harness(t),result=await h.post('search',{message:'Cardiologists in the UK',locationFilter:{query:'London',radiusMiles:25}});
  assert.equal(result.status,200);assert.equal(result.body.brief.locationFilter.query,'London');assert.ok(result.body.notices.some(n=>/location field/i.test(n)));assert.deepEqual(ids(result),['near','multiple','edge']);
  const cleared=await h.post('search',{sessionId:result.body.sessionId,message:'Cardiologists in the UK',locationFilter:null});assert.equal(cleared.body.brief.locationFilter,null);assert.equal(cleared.body.total,7);
});
test('Anywhere clears active geography without losing expertise',async t=>{
  const h=await harness(t),first=(await h.post('search',{message:'Cardiologists in the UK'})).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'Anywhere is fine.'});assert.equal(result.status,200);assert.equal(result.body.brief.locationFilter,null);assert.equal(result.body.total,7);assert.deepEqual(result.body.brief.roles,['Cardiologist']);
});
test('natural removal of the separate location filter applies before clinical interpretation',async t=>{
  const h=await harness(t),first=(await h.post('search',{message:'Cardiologists in the UK'})).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'Remove the location filter.'});assert.equal(result.status,200);assert.equal(result.body.brief.locationFilter,null);assert.equal(result.body.total,7);assert.deepEqual(result.body.brief.roles,['Cardiologist']);
});
test('mixed location removal and clinical refinement applies both instructions',async t=>{
  const h=await harness(t),first=(await h.post('search',{message:'Cardiologists in the UK'})).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'Remove the location filter. Research is helpful.'});
  assert.equal(result.status,200);assert.equal(result.body.brief.locationFilter,null);assert.ok(result.body.brief.requirements.some(r=>r.kind==='research'&&r.importance==='preferred'));assert.deepEqual(result.body.brief.roles,['Cardiologist']);
});
test('a location-led sentence is not mistaken for a location-only instruction',async t=>{
  const h=await harness(t),first=(await h.start()).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'In London, research is essential.'});
  assert.equal(result.status,200);assert.equal(result.body.brief.locationFilter.query.toLowerCase(),'london');assert.ok(result.body.brief.requirements.some(r=>r.kind==='research'&&r.importance==='essential'));
});
test('a location-led unknown mandatory instruction cannot bypass interpretation recovery',async t=>{
  const h=await harness(t),first=(await h.start()).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'In London, they must be able to assess that particular technique.'});
  assert.equal(result.status,422);assert.equal(result.body.code,'interpretation-incomplete');assert.equal(h.searches.length,1);
});
test('timing is not interpreted as geographic range',async t=>{
  const h=await harness(t),first=(await h.start()).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'Within 2 weeks. Research is helpful.'});
  assert.equal(result.status,200);assert.equal(result.body.brief.locationFilter,null);assert.equal(result.body.brief.timing,'Within 2 weeks');assert.ok(result.body.brief.requirements.some(r=>r.kind==='research'&&r.importance==='preferred'));
});
test('a location update cannot make an underspecified existing brief sufficient',async t=>{
  const h=await harness(t),first=(await h.post('search',{message:'I need a specialist'})).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'In London'});assert.equal(result.status,200);assert.equal(result.body.needsClarification,true);assert.equal(h.searches.length,0);
});
test('a negated clearing instruction keeps the country filter',async t=>{
  const h=await harness(t),first=(await h.post('search',{message:'Cardiologists in the UK'})).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'Do not remove the UK location requirement.'});assert.equal(result.status,200);assert.deepEqual(result.body.brief.locationFilter,UK);assert.equal(result.body.total,5);
});
test('short UK removal keeps other clinical refinement in the same message',async t=>{
  const h=await harness(t),first=(await h.post('search',{message:'Cardiologists in the UK'})).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'Drop UK and research is helpful.'});assert.equal(result.status,200);assert.equal(result.body.brief.locationFilter,null);assert.ok(result.body.brief.requirements.some(r=>r.kind==='research'&&r.importance==='preferred'));
});
for(const message of ['Cardiologists in Paris','Cardiologists in France','Cardiologists in the US'])test('unsupported sentence geography is not silently ignored: '+message,async t=>{
  const h=await harness(t),result=await h.post('search',{message});assert.equal(result.status,422);assert.match(result.body.code,/^location-/);assert.equal(h.searches.length,0);
});
for(const [query,code]of [['Newport','ambiguous'],['Unknownville','not-found'],['Offline','unavailable']])test(`location ${code} preserves accepted brief and old snapshot`,async t=>{
  const h=await harness(t),first=(await h.start()).body;
  const failed=await h.post('search',{sessionId:first.sessionId,message:'Research is helpful.',locationFilter:{query}});assert.equal(failed.status,422);assert.equal(failed.body.code,'location-'+code);assert.equal(h.searches.length,1);
  const retained=await h.post('shortlist-view',{sessionId:first.sessionId,searchId:first.searchId,candidateIds:['near']});assert.equal(retained.status,200);assert.deepEqual(retained.body.brief,first.brief);
  const retry=await h.post('search',{sessionId:first.sessionId,locationFilter:null});assert.equal(retry.status,200);assert.deepEqual(retry.body.brief.requirements,first.brief.requirements);
});
test('unresolved new must-have returns 422 rather than executing the previous search',async t=>{
  const h=await harness(t),first=(await h.start()).body;
  const result=await h.post('search',{sessionId:first.sessionId,message:'They must be able to assess that particular technique.'});assert.equal(result.status,422);assert.equal(result.body.code,'interpretation-incomplete');assert.equal(h.searches.length,1);
  const retained=await h.post('shortlist-view',{sessionId:first.sessionId,searchId:first.searchId,candidateIds:['near']});assert.deepEqual(retained.body.brief,first.brief);assert.equal(retained.body.results[0].id,'near');
});
test('location contracts reject client coordinates and unsupported radii',async t=>{
  const h=await harness(t);
  for(const extra of [{latitude:51.5,longitude:0},{radiusMiles:100},{sourceUrl:'https://example.org'}])assert.equal((await h.post('search',{message:'Cardiologists',locationFilter:{query:'London',...extra}})).status,400);
  assert.equal((await h.post('location',{query:'London',latitude:51.5})).status,400);assert.equal(h.searches.length,0);
  const resolved=await h.post('location',{query:'London',radiusMiles:25});assert.equal(resolved.status,200);assert.equal(resolved.body.status,'resolved');assert.equal(resolved.body.location.radiusMiles,25);
});
test('profile endpoint returns full owned background independently of retrieved evidence',async t=>{
  const h=await harness(t),first=(await h.start()).body;
  const result=await h.post('profile',{sessionId:first.sessionId,searchId:first.searchId,candidateId:'near',corpusVersion:first.corpusVersion});assert.equal(result.status,200);assert.equal(result.body.candidateId,'near');assert.equal(result.body.about.length,1);assert.equal(result.body.about[0].id,'evidence-near');assert.ok(!JSON.stringify(result.body).includes('Foreign biography'));
  assert.equal(h.searches.length,1);assert.ok(first.results.find(c=>c.id==='near').backgroundPreview.length);
});
test('profile endpoint enforces snapshot membership and corpus ownership',async t=>{
  const h=await harness(t),first=(await h.start()).body,request={sessionId:first.sessionId,searchId:first.searchId,candidateId:'near',corpusVersion:first.corpusVersion};
  assert.equal((await h.post('profile',{...request,candidateId:'hidden'})).status,404);assert.equal((await h.post('profile',{...request,corpusVersion:'wrong-version'})).status,409);
  assert.equal((await h.post('profile',{...request,evidence:[{text:'Approved'}]})).status,400);assert.equal((await h.post('profile',{...request,searchId:'unknown'})).status,410);
  h.engine.corpus.version='geo-v2';assert.equal((await h.post('profile',request)).status,410);
});
