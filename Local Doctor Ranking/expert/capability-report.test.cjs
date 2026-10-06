'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {freshReport,observe,content,usable,markdown}=require('./evaluation/capability-report.cjs');

test('presence and format checks do not turn placeholders or registration syntax into verification',()=>{
  assert.equal(content(false),true);
  for(const value of [null,'N/A','not provided','[]',[],{}])assert.equal(content(value),false);
  assert.equal(usable('about','Short topic'),false);
  assert.equal(usable('gmc_number','1234567'),true);
  assert.equal(usable('gmc_number','123456'),false);
  assert.equal(usable('profile_urls',['https://person:secret@example.test/profile']),false);
  assert.equal(usable('publications',['https://pubmed.ncbi.nlm.nih.gov/?term=example']),true);
});

test('all rows receive one profession proxy and one source prefix without using honorifics as roles',()=>{
  const r=freshReport();
  for(const [id,title,specialty]of [['one_1','Dr','Dietetics'],['one_2','Professor','Optometry'],['two_1','Dr','Cognitive behavioural therapy (CBT)'],['two_2','Professor',null]])observe(r,{id,title,specialty});
  assert.equal(r.rows,4);
  assert.equal(Object.values(r.sourcePrefixes).reduce((a,b)=>a+b),4);
  assert.equal(Object.values(r.specialtyRoleProxies).reduce((a,b)=>a+b),4);
  assert.equal(r.specialtyRoleProxies['Dietetics / nutrition label'],1);
  assert.equal(r.specialtyRoleProxies['Optometry / orthoptics label'],1);
  assert.equal(r.specialtyRoleProxies['Other / unclassified specialty label'],1);
  assert.equal(r.specialtyRoleProxies['No primary specialty text'],1);
  assert.equal(r.metrics.explicitRoleText,undefined);
});

test('alternate biographies, source labels and source URLs remain different coverage indicators',()=>{
  const r=freshReport();observe(r,{id:'demo_1',name:'Fixture Person',about:null,about_alternatives:{profile:'This professional text has enough characters to count as a biography.'},profile_urls:{profile:'https://example.test/profile'},sources:['bupa','spire']});
  assert.equal(r.metrics.anyBiography,1);assert.equal(r.metrics.alternateBiography,1);
  assert.equal(r.metrics.primaryBiographySourceLabel,undefined);
  assert.equal(r.metrics.nameAndAnyProfileURL,1);
  assert.equal(r.recordedSources.bupa,1);assert.equal(r.recordedSources.spire,1);
  assert.equal(r.sourceCoverage.demo.biography,1);
});

test('search links, unperiodized count ranges and merge dates do not become attributed current activity',()=>{
  const r=freshReport();observe(r,{id:'demo_1',publications:['https://pubmed.ncbi.nlm.nih.gov/?term=example'],procedures_completed:[{description:'Recorded procedure',count:'10-20',count_numeric:15}],merge_date:'2026-10-06',requires_review:false});
  assert.equal(r.metrics.publicationSearchURL,1);assert.equal(r.publicationEntries.withAuthors,0);
  assert.equal(r.metrics.labelledRecordedVolume,1);assert.equal(r.metrics.labelCountPeriodURLVolume,undefined);
  assert.equal(r.volumeEntries.withNumericDerivative,1);assert.equal(r.volumeEntries.withPeriod,0);
  assert.equal(r.metrics.parseableMergeDate,1);assert.equal(r.metrics.sourceOrPublicationDate,undefined);
  assert.equal(r.flags.requires_review,undefined);assert.equal(r.fields.requires_review.present,1);
});

test('generated report contains aggregates and explicit limits, not professional narrative or identity values',()=>{
  const r=freshReport();observe(r,{id:'demo_1',name:'Do Not Publish This Name',about:'Do not publish this private example narrative in aggregate reporting.',specialty:'Dietetics',gmc_number:'7654321'});
  Object.assign(r,{generatedAt:'2026-10-06',elapsedMs:1,inputBytes:100,rawSHA256:'fixture',corpusAudit:null});
  const output=markdown(r);
  for(const forbidden of ['Do Not Publish This Name','Do not publish this private example narrative','7654321'])assert.equal(output.includes(forbidden),false);
  assert.match(output,/source rows, not distinct qualified experts/);
  assert.match(output,/lexical profession proxies/);
  assert.match(output,/not registration-verified roles/);
});
