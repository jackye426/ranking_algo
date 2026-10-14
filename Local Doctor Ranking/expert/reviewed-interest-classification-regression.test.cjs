'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{buildCorpus}=require('./data.cjs'),enrichments=require('./enrichments.cjs'),{matrixFor}=require('./search.cjs'),{parseBrief}=require('./brief.cjs');
test('Norris reviewed dermoscopy list remains interest while separate study involvement is retained',()=>{
 const item=enrichments.find(e=>e.sourceRecordId==='bupa_12291'&&e.field==='targeted_public_profile');
 assert.equal(item.type,'clinical-interest');
 assert.equal(item.excerpt,'use of dermoscopy in skin cancer diagnosis');
 const corpus=buildCorpus([{id:'bupa_12291',name:'Dr Paul Norris',gmc_number:'2720966',specialty:'Dermatology'}],{enrichments});
 const owner=corpus.candidates.find(c=>c.sourceRecordIds.includes('bupa_12291')),p=corpus.passages.find(p=>p.field==='targeted_public_profile');
 assert.equal(p.type,'clinical-interest');
 assert(corpus.passages.some(p=>p.field==='targeted_publication'&&p.type==='research'&&p.dates.sourceDate==='2010-05-11'));
 const b=parseBrief({message:'Dermoscopy performed clinical practice is essential.'}).brief;
 const m=matrixFor(owner,[p],b);assert(!m.some(r=>r.status==='documented'&&r.evidenceTypes?.includes('clinical-practice')));
});
test('Per Hall source research interests are not promoted to performed research or verified authorship',()=>{
 const item=enrichments.find(e=>e.sourceRecordId==='spire_668'&&e.field==='targeted_public_research');
 assert.equal(item.type,'clinical-interest');
 assert.equal(item.excerpt,'dermoscopy, computer imaging, telemedicine and artificial intelligence');
 assert.equal(item.observedAt,'2026-10-06');assert.equal(item.sourceDate,null);
 const independent=enrichments.filter(e=>e.sourceRecordId==='spire_668'&&e.field!==item.field);
 assert(independent.some(e=>e.field==='targeted_public_profile'&&e.type==='clinical-practice'));
 assert(independent.some(e=>e.field==='targeted_public_relationship'));
});
