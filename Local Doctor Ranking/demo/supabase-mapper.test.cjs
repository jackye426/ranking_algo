'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mapSupabaseRows,parseSpireProfile,namesCompatible}=require('./supabase-mapper.cjs');
const profile='https://www.spirehealthcare.com/consultant-profiles/mr-ravi-popat-c7043233/';
const fixture=overrides=>({
  id:'db-1',name:'Mr Ravi Popat',gmc_number:'7043233',specialty:'Trauma and orthopaedic surgery',specialty_source:'Spire',
  about:'My practice includes knee ligament surgery.',about_source:'BUPA',
  clinical_interests:'Knee replacement; ACL reconstruction',areas_of_interest:['Hip surgery'],
  profile_urls:{spire:profile,bupa:null},urls:[profile],sources:['BUPA','Spire'],
  locations:[{hospital:'Spire Bushey Hospital',source:'BUPA',postcode:'WD23 1RD',city:'Bushey',street:'Heathbourne Road'}],
  languages:['English'],requires_review:false,do_not_recommend:false,...overrides,
});
const map=rows=>mapSupabaseRows(rows,{supplements:[]});

test('maps the actual snake_case schema without treating BUPA source as coverage',()=>{
  const {records,quality}=map([fixture()]); const r=records[0];
  assert.equal(records.length,1); assert.equal(r.name,'Mr Ravi Popat');
  assert.deepEqual(r.clinicalInterests,['Knee replacement','ACL reconstruction','Hip surgery']);
  assert.deepEqual(r.insurers,[]); assert.deepEqual(r.insuranceEvidence,[]);
  assert.equal(r.locations[0].address,'Heathbourne Road');
  assert.equal(r.fieldProvenance.description[0].source,'BUPA');
  assert.equal(r.fieldProvenance.description[0].sourceUrl,null);
  assert.equal(r.locations[0].provenance[0].sourceLinkIsIdentityOnly,true);
  assert.equal(quality.withInsuranceEvidence,0);
});

test('only official HTTPS consultant profile URLs qualify',()=>{
  for(const url of ['http://www.spirehealthcare.com/consultant-profiles/mr-ravi-popat-c7043233/','https://spirehealthcare.com.evil.test/consultant-profiles/mr-ravi-popat-c7043233/','https://www.spirehealthcare.com/spire-bushey-hospital/','https://www.spirehealthcare.com/consultants/consultant-search/','https://user:password@www.spirehealthcare.com/consultant-profiles/mr-ravi-popat-c7043233/']) {
    assert.equal(parseSpireProfile(url),null);
    assert.equal(map([fixture({profile_urls:{spire:url}})]).records.length,0);
  }
  assert.equal(parseSpireProfile('https://spirehealthcare.com/spire-bushey-hospital/consultants/mr-ravi-popat-c7043233/?x=1').registrationId,'7043233');
});

test('rejects missing identities, mismatched GMCs and incompatible profile names',()=>{
  const {records,quality}=map([
    fixture({id:null}),fixture({name:''}),fixture({gmc_number:'1234567'}),fixture({gmc_number:'not a number'}),fixture({name:'Mr David Smith'}),
  ]);
  assert.equal(records.length,0);
  assert.deepEqual(quality.rejected,{missingIdentity:2,gmcProfileMismatch:1,invalidGmc:1,nameProfileMismatch:1});
  assert.equal(map([fixture({gmc_number:'07043233'})]).records[0].gmc,'7043233');
});

test('do-not-recommend and review flags exclude all duplicate copies',()=>{
  for(const field of ['do_not_recommend','requires_review']) {
    const {records,quality}=map([fixture({id:'flagged',[field]:true}),fixture({id:'unflagged'})]);
    assert.equal(records.length,0); assert.equal(quality.rejected.flagged,1); assert.equal(quality.rejected.flaggedDuplicate,1);
  }
});

test('retains only Spire locations and corrects only observed literal nHospital artefact',()=>{
  const {records}=map([fixture({locations:[
    {hospital:'Nuffield Hospital',source:'BUPA'},
    {hospital:'Spire BusheynHospital',source:'Spire',latitude:'51.6',longitude:'-0.3'},
  ]})]);
  assert.equal(records[0].locations.length,1); assert.equal(records[0].locations[0].name,'Spire Bushey Hospital');
  assert.equal(records[0].locations[0].latitude,51.6);
  assert.equal(map([fixture({locations:[{hospital:'NHS Hospital'}]})]).records.length,0);
});

test('merges duplicates by verified identity without replacing proven locations',()=>{
  const {records,quality}=map([
    fixture({id:'a',clinical_interests:'Knee replacement'}),
    fixture({id:'b',name:'Ravi Popat',clinical_interests:'Knee arthroscopy',locations:[{hospital:'Spire Harpenden Hospital',source:'Spire',postcode:'AL5 4BP'}]}),
    fixture({id:'c',locations:[{hospital:'Spire Bushey Hospital',source:'PHIN',postcode:'WD23 1RD',address:'Heathbourne Road'}]}),
  ]);
  assert.equal(records.length,1); assert.equal(records[0].locations.length,2);
  assert.deepEqual(records[0].sourceRecordIds,['a','b','c']);
  assert.equal(records[0].locations[0].provenance.length,2);
  assert.ok(records[0].clinicalInterests.includes('Knee arthroscopy'));
  assert.equal(quality.duplicateRowsMerged,2); assert.equal(quality.excludedRows,0);
});

test('conflicting same-ID profiles are excluded instead of last-wins',()=>{
  const {records,quality}=map([
    fixture({id:'one'}),
    fixture({id:'two',name:'Mr David Smith',profile_urls:{spire:'https://www.spirehealthcare.com/consultant-profiles/mr-david-smith-c7043233/'}}),
  ]);
  assert.equal(records.length,0); assert.equal(quality.rejected.duplicateIdentityConflict,2);
});

test('same profile URL deduplicates a missing GMC with its verified GMC record',()=>{
  const url='https://www.spirehealthcare.com/consultant-profiles/mr-ravi-popat/';
  const {records,quality}=map([fixture({id:'a',gmc_number:null,profile_urls:{spire:url}}),fixture({id:'b',profile_urls:{spire:url}})]);
  assert.equal(records.length,1); assert.equal(records[0].gmc,'7043233'); assert.equal(quality.duplicateRowsMerged,1);
  const conflict=map([fixture({id:'a',gmc_number:'1234567',profile_urls:{spire:url}}),fixture({id:'b',profile_urls:{spire:url}})]);
  assert.equal(conflict.records.length,0);
});

test('conflicting coordinates do not silently determine a consultant distance',()=>{
  const {records}=map([
    fixture({id:'a',locations:[{hospital:'Spire Bushey Hospital',postcode:'WD23 1RD',latitude:51.6,longitude:-0.3}]}),
    fixture({id:'b',locations:[{hospital:'Spire Bushey Hospital',postcode:'WD23 1RD',latitude:52.6,longitude:-1.3}]}),
    fixture({id:'c',locations:[{hospital:'Spire Bushey Hospital',postcode:'WD23 1RD',latitude:51.6,longitude:-0.3}]}),
  ]);
  assert.equal(records[0].locations[0].coordinateConflict,true);
  assert.equal(records[0].locations[0].latitude,null);
});

test('adds insurer and portrait evidence only through exact identity supplements',()=>{
  const {records}=mapSupabaseRows([fixture()]); const r=records[0];
  assert.deepEqual(r.insurers,['Bupa']); assert.ok(r.imageUrl);
  assert.equal(r.insuranceEvidence[0].provenance.match,'exact-gmc');
  assert.ok(r.supplementalEvidence.fields.includes('insuranceEvidence'));
  assert.equal(r.description,'My practice includes knee ligament surgery.');
  assert.deepEqual(r.clinicalInterests,['Knee replacement','ACL reconstruction','Hip surgery']);
  assert.equal(r.locations.length,1,'do not supplement public hospital locations');
  const wrong=fixture({gmc_number:'1234567',profile_urls:{spire:'https://www.spirehealthcare.com/consultant-profiles/mr-ravi-popat-c1234567/'}});
  assert.deepEqual(mapSupabaseRows([wrong]).records[0].insurers,[],'a matching name is insufficient');
  assert.equal(mapSupabaseRows([]).records.length,0,'never append public fallback records');
});

test('exact URL can supplement missing GMC without manufacturing a GMC field',()=>{
  const r=mapSupabaseRows([fixture({gmc_number:null})]).records[0];
  assert.equal(r.gmc,null); assert.deepEqual(r.insurers,['Bupa']);
  assert.equal(r.insuranceEvidence[0].provenance.match,'exact-profile-url');
});

test('missing clinical interests may use exact sentences from the record, never invented skills',()=>{
  const sentence='I specialise in knee ligament surgery.';
  const r=map([fixture({clinical_interests:null,areas_of_interest:[],about:`I qualified in 1990. ${sentence} I enjoy sailing.`})]).records[0];
  assert.deepEqual(r.clinicalInterests,[sentence]);
  assert.equal(r.fieldProvenance.clinicalInterests[0].derivedBy,'exact-sentence-extraction');
  assert.deepEqual(map([fixture({clinical_interests:null,areas_of_interest:[],about:null})]).records[0].clinicalInterests,[]);
});

test('conservative name comparison handles titles, initials and explicit common aliases',()=>{
  assert.equal(namesCompatible('Mr Tim Waters','mr timothy waters'),true);
  assert.equal(namesCompatible('Professor R Popat','ravi popat'),true);
  assert.equal(namesCompatible('Mr Raj Popat','Ravi Popat'),false);
  assert.equal(namesCompatible('Ms Priya Singh','Ms Priya Shah'),false);
  assert.equal(namesCompatible("Dr Michael O'Sullivan",'dr michael osullivan'),true);
  assert.equal(namesCompatible('Mr Mahesh Pimple FRCS','mr mahesh pimplé'),true);
  assert.ok(parseSpireProfile('https://www.spirehealthcare.com/spire-clare-park-hospital/consultants/miss-valerie-nuñez-c3616451'));
});

test('procedure fields retain exact evidence and exclude bucket midpoints and counts',()=>{
  const rows=[fixture({id:'a',procedures:['Orthopaedics - hip and knee','Knee replacement'],procedures_completed:[{description:'Unicompartmental knee replacement - unilateral',hospital:'Spire BusheynHospital',code:'W5210',count:'1-5',count_numeric:3}]}),
    fixture({id:'b',procedures:['Knee replacement','Arthroscopic meniscal repair'],procedures_completed:[{description:'Unicompartmental knee replacement - unilateral',hospital:'Spire Harpenden Hospital',code:'W5210',count:'5-50',count_numeric:27.5}]})];
  const {records,quality}=map(rows); const r=records[0];
  assert.deepEqual(r.procedures,['Orthopaedics - hip and knee','Knee replacement','Unicompartmental knee replacement - unilateral','Arthroscopic meniscal repair']);
  assert.equal(r.procedureEvidence.length,6);
  assert.equal(r.procedureEvidence[2].sourceRecordId,'a');
  assert.equal(r.procedureEvidence[2].hospital,'Spire Bushey Hospital');
  assert.equal(r.procedureEvidence[2].sourceUrl,null);
  assert.equal(r.procedureEvidence[5].hospital,'Spire Harpenden Hospital');
  assert.equal(r.fieldProvenance.procedures[2].sourceField,'procedures_completed');
  assert.equal(quality.withProcedures,1);
  assert.equal(JSON.stringify(r).includes('count_numeric'),false);
  assert.equal(JSON.stringify(r.procedureEvidence).includes('"count"'),false);
});

test('malformed procedure inputs cannot leak arbitrary fields into mapped evidence',()=>{
  const {records}=map([fixture({procedures:[null,12,{text:'Hip replacement'},''],procedures_completed:[null,'Hip replacement',{},
    {description:'<p>Hip replacement</p>',hospital:'Spire Hospital',privateNote:'private',count_numeric:12}]})]);
  assert.deepEqual(records[0].procedures,['Hip replacement']);
  assert.deepEqual(records[0].procedureEvidence,[{text:'Hip replacement',sourceUrl:null,sourceRecordId:'db-1',sourceField:'procedures_completed',hospital:'Spire Hospital'}]);
});
