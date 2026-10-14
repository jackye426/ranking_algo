'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {applyRepairs,hashValue,MANDATORY_HOLDS}=require('./releases.cjs');
const {prepareScopeRelease}=require('./repair/enriched/prepare-scope-release.cjs');
const sha=s=>createHash('sha256').update(s).digest('hex'),baselineSha256='a'.repeat(64),bad='https://example.org/firsthttps://example.org/second';
function fixture(){
 const baselineRows=[...MANDATORY_HOLDS.map(id=>({id,about:'Held source'})),{id:'fictional-publications',name:'Fictional Author',gmc_number:'1234567',publications:[bad,'Original unreviewed publication title',bad+'2']}];
 const holds=MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Existing safety hold'}));
 const priorPacket={schemaVersion:2,releaseId:'prior',baselineSha256,patches:[],holds,suppressions:[]};
 const referenceRows=structuredClone(baselineRows),row=referenceRows.at(-1);
 const targets=[0,2].map(index=>({targetId:'publication-'+index,sourceRecordId:row.id,field:'publications',path:['publications',index],sourceText:row.publications[index],sourceTextSha256:sha(row.publications[index]),expectedCurrentFieldHash:hashValue(row.publications),baselineFieldHash:hashValue(row.publications),origins:[{sourceRecordId:row.id,field:'publications',sourceUrl:null,sourceLabel:'Stored record',dates:{sourceDate:null,observedAt:null}}]}));
 const reviews=targets.map(t=>({reviewer:'primary',decision:{targetId:t.targetId,approved:true,sourceTextSha256:t.sourceTextSha256,omissions:[{start:0,end:t.sourceText.length,text:t.sourceText}],retainedSpans:[],reason:'Malformed concatenated publication links; withhold only this exact entry.'}}));
 const secondaryReviews=reviews.map(r=>({targetId:r.decision.targetId,approved:true,reviewer:'secondary',reviewId:'secondary-'+r.decision.targetId,primaryDecisionSha256:hashValue(r.decision)}));
 return{baselineRows,baselineSha256,priorPacket,referenceRows,ledger:{baselineSha256,sourceTargets:targets},reviews,secondaryReviews,releaseId:'next',holds};
}
test('two source-reviewed publication exclusions preserve unreviewed siblings and original indices',()=>{
 const f=fixture(),before=JSON.stringify(f),out=prepareScopeRelease(f);
 assert.equal(JSON.stringify(f),before);assert.deepEqual(out.rows.at(-1).publications,[null,'Original unreviewed publication title',null]);
 assert.deepEqual(out.packet.suppressions.map(s=>s.field),['publications.0','publications.2']);
 assert.deepEqual(out.packet.suppressions.map(s=>s.beforeHash),[hashValue(bad),hashValue(bad+'2')]);
 assert.equal(out.sourceHistory.length,2);assert.equal(out.packet.holds.length,MANDATORY_HOLDS.length);
 const corpus=require('./data.cjs').buildCorpus(out.rows);assert.ok(corpus.passages.some(p=>p.text.includes('Original unreviewed publication title')));assert.ok(!corpus.passages.some(p=>p.text.includes(bad)));
});
test('one reviewed publication leaf never authorises exclusion of another entry',()=>{
 const f=fixture();f.ledger.sourceTargets.pop();f.reviews.pop();f.secondaryReviews.pop();
 const out=prepareScopeRelease(f);assert.deepEqual(out.rows.at(-1).publications,[null,'Original unreviewed publication title',bad+'2']);
});
function suppressionsFixture(){const f=fixture(),p={...f.priorPacket,releaseId:'next',suppressions:[{sourceRecordId:f.baselineRows.at(-1).id,field:'publications.0',beforeHash:hashValue(bad),reason:'Exact reviewed malformed entry',reviewId:'reviewed-leaf',sourceEvidence:[{sourceRecordId:f.baselineRows.at(-1).id,sourceField:'publications.0',snapshotSha256:baselineSha256}],approved:true}]};return{f,p};}
test('entry ownership and canonical bounded indices fail closed',()=>{
 for(const field of ['publications.-1','publications.01','publications.3','publications.100000','publications.constructor','publications.0.text','qualifications.0','specialty.0']){const {f,p}=suppressionsFixture();p.suppressions[0].field=field;assert.throws(()=>applyRepairs(f.baselineRows,p,{baselineSha256,releaseId:'next'}));}
 const {f,p}=suppressionsFixture();p.suppressions[0].beforeHash=hashValue(f.baselineRows.at(-1).publications);assert.throws(()=>applyRepairs(f.baselineRows,p,{baselineSha256,releaseId:'next'}),/before-value hash/);
});
test('overlapping whole-array and entry exclusions remain rejected',()=>{
 const {f,p}=suppressionsFixture();p.suppressions.push({...p.suppressions[0],field:'publications',beforeHash:hashValue(f.baselineRows.at(-1).publications)});assert.throws(()=>applyRepairs(f.baselineRows,p,{baselineSha256,releaseId:'next'}),/conflicting/);
});
test('compiler rejects unknown nested publication paths rather than suppressing their parent',()=>{
 const f=fixture();f.ledger.sourceTargets[0].path=['publications',0,'text'];assert.throws(()=>prepareScopeRelease(f));
});
