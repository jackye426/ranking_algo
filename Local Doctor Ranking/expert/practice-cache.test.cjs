'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPracticeSnapshot,validatePracticeSnapshot,applyPracticeSnapshot,practiceFingerprint}=require('./practice-cache.cjs');
const releaseId='test-release',version='expert-corpus-practice-fixture';
const source=(extra={})=>({name:'Recorded practice',postcode:'SW5',country:'GB',sourceRecordId:'row-1',field:'locations',sourceUrl:'https://example.org/consultant',...extra});
function fixture(){return {version,candidates:[{id:'c1',sourceRecordIds:['row-1'],needsIdentityReview:false,locations:[source({postcode:'SW5 0TU',latitude:51.49,longitude:-.18,coordinateSource:'source-record',coordinatePrecision:'recorded coordinates',coordinateProvenance:{kind:'source-record',sourceRecordId:'row-1',field:'locations',sourceUrl:null}}),source(),source({postcode:'',name:'Location without postcode'})]},{id:'held',sourceRecordIds:['held-row'],needsIdentityReview:true,locations:[{sourceRecordId:'held-row',field:'locations',postcode:'SW5'}]}]};}
async function prepared(corpus=fixture()){
 let seen;
 const geo={prepareLocations:async candidates=>{seen=structuredClone(candidates);const location=candidates[0].locations[1];Object.assign(location,{latitude:51.494,longitude:-.187,coordinateSource:'https://api.postcodes.io/outcodes/SW5',coordinatePrecision:'postcode district centre',coordinateProvenance:{kind:'geocoded-postcode',sourceUrl:'https://api.postcodes.io/outcodes/SW5',postcode:'SW5',retrievedAt:'2026-01-02T03:04:05.000Z'}});}};
 const snapshot=await createPracticeSnapshot(corpus,{geo,releaseId,preparedAt:'2026-02-01T00:00:00.000Z'});return {corpus,snapshot,seen};
}
test('offline preparation leaves original corpus unchanged and excludes held identities',async()=>{const corpus=fixture(),before=JSON.stringify(corpus);const {snapshot,seen}=await prepared(corpus);assert.equal(JSON.stringify(corpus),before);assert.equal(seen.length,1);assert.equal(snapshot.entries.length,3);assert.deepEqual(snapshot.entries.map(e=>e.outcome),['recorded','geocoded','unresolved']);assert.equal(snapshot.coverage.geocoded,1);assert.equal(snapshot.coverage.missingCoordinates,1);});
test('runtime applies frozen coordinates without network or inventing observation dates',async()=>{const {corpus,snapshot}=await prepared(),recorded=structuredClone(corpus.candidates[0].locations[0]);const old=global.fetch;let calls=0;global.fetch=()=>{calls++;throw Error('No network');};try{const stats=applyPracticeSnapshot(corpus,snapshot,{releaseId});assert.deepEqual(corpus.candidates[0].locations[0],recorded);assert.equal(corpus.candidates[0].locations[1].coordinateProvenance.retrievedAt,null);assert.equal(snapshot.preparedAt,'2026-02-01T00:00:00.000Z');assert.equal(corpus.candidates[0].locations[2].latitude,undefined);assert.equal(stats.immutablePracticePreparation,true);assert.equal(calls,0);}finally{global.fetch=old;}});
test('serialized snapshots retain exact ownership and frozen coverage',async()=>{const {corpus,snapshot}=await prepared(),copy=JSON.parse(JSON.stringify(snapshot));assert.equal(validatePracticeSnapshot(copy,{releaseId,corpusVersion:version}),copy);assert.deepEqual(applyPracticeSnapshot(corpus,copy,{releaseId}),snapshot.coverage);});
for(const [name,change]of [
 ['wrong release',s=>s.releaseId='another-release'],
 ['wrong corpus',s=>s.corpusVersion='expert-corpus-other'],
 ['wrong fingerprint',s=>s.practiceFingerprint='0'.repeat(64)],
 ['missing practice',s=>s.entries.pop()],
 ['wrong candidate',s=>s.entries[1].candidateId='held'],
 ['wrong practice index',s=>s.entries[1].locationIndex=12],
 ['duplicate practice',s=>s.entries[2]=structuredClone(s.entries[1])],
 ['source coordinate replacement',s=>s.entries[0].coordinates.latitude=51.5],
 ['another postcode',s=>s.entries[1].coordinates.coordinateProvenance.postcode='SW1'],
 ['invalid coordinate',s=>s.entries[1].coordinates.latitude=200],
 ['unsupported precision',s=>s.entries[1].coordinates.coordinatePrecision='hospital rooftop'],
 ['invalid date',s=>s.entries[1].coordinates.coordinateProvenance.retrievedAt='not-a-date'],
 ['unsafe source URL',s=>s.entries[1].coordinates.coordinateSource='https://secret:token@example.org/'],
 ['false coverage',s=>s.coverage.geocoded=99],
 ['coordinates on unresolved practice',s=>s.entries[2].coordinates={latitude:51,longitude:0}],
])test(name+' rejects before any corpus mutation',async()=>{const {corpus,snapshot}=await prepared(),before=JSON.stringify(corpus);change(snapshot);assert.throws(()=>applyPracticeSnapshot(corpus,snapshot,{releaseId}),/Invalid prepared practice locations/);assert.equal(JSON.stringify(corpus),before);});
test('changed original practice, source ownership or hold status invalidates binding',async()=>{for(const change of [c=>c.candidates[0].locations[1].postcode='SW1',c=>c.candidates[0].locations[1].sourceRecordId='another-row',c=>c.candidates[0].needsIdentityReview=true]){const {corpus,snapshot}=await prepared();change(corpus);assert.throws(()=>applyPracticeSnapshot(corpus,snapshot,{releaseId}),/Invalid prepared practice locations/);}});
test('eligible candidates without practices are included in corpus binding',async()=>{const {corpus,snapshot}=await prepared();corpus.candidates.push({id:'new-empty',sourceRecordIds:['new-source'],needsIdentityReview:false,locations:[]});assert.notEqual(practiceFingerprint(corpus),snapshot.practiceFingerprint);assert.throws(()=>applyPracticeSnapshot(corpus,snapshot,{releaseId}),/fingerprint/);});
