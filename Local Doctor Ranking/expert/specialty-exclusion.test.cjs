'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./releases.cjs'),{buildCorpus}=require('./data.cjs'),{buildProfile}=require('./profile.cjs'),{renderSourcePage}=require('./sources.cjs'),P=require('./public/projects.js');
const baselineSha256='a'.repeat(64),releaseId='source-specialty-exclusion';
function fixture(){
  const source={id:'native-source',name:'Dr Metadata Example',gmc_number:'7444401',specialty:'UNSAFE_SPECIALTY',nhs_base:'UNSAFE_NHS_FIELD',
    about:'I report cardiac CT.',locations:[{address:'1 Example Road',source:'Example provider'},{region:'UNSAFE_SHIFTED_REGION',source:'Example provider'}]};
  const raw=[source,...R.MANDATORY_HOLDS.map((id,i)=>({id,name:'Held Example '+i,gmc_number:String(7500000+i)}))];
  const packet={schemaVersion:2,releaseId,baselineSha256,patches:[],holds:R.MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Known source ownership hold'})),
    suppressions:['specialty','nhs_base'].map(field=>({sourceRecordId:source.id,field,beforeHash:R.hashValue(source[field]),approved:true,reason:'Source field is not attributable or has corrupt meaning.',reviewId:'source-review-'+field,
      sourceEvidence:[{sourceRecordId:source.id,snapshotSha256:'b'.repeat(64),sourceField:field}]}))};
  return {source,raw,packet};
}
test('specialty projection exclusion preserves raw identity inputs but removes unsafe headings and evidence from every new surface',()=>{
  const {source,raw,packet}=fixture(),before=structuredClone(raw),original=buildCorpus(R.applyRepairs(raw,{...packet,suppressions:[]},{baselineSha256,releaseId}).rows),prepared=R.applyRepairs(raw,packet,{baselineSha256,releaseId}),corpus=buildCorpus(prepared.rows);
  assert.deepEqual(raw,before);assert.equal(prepared.rows[0].specialty,source.specialty);assert.equal(prepared.rows[0].nhs_base,source.nhs_base);
  assert.deepEqual(corpus.identityLedger,original.identityLedger);
  assert.deepEqual(Object.keys(prepared.rows[0]._expertEvidenceExclusions).sort(),['nhs_base','specialty']);
  const c=corpus.candidates.find(x=>x.sourceRecordIds.includes(source.id)),passages=corpus.passages.filter(p=>p.candidateId===c.id);
  assert.equal(c.specialty,'');assert.equal(c.role,'');assert.equal(c.locations.length,1);
  const background=buildProfile(c,passages,{corpusVersion:corpus.version,dataReleaseId:releaseId});
  const brief={version:1,summary:'Cardiac CT',requirements:[]};
  let project=P.setBrief(P.createProject('Disposable metadata check'),brief,corpus.version,{dataReleaseId:releaseId});
  project=P.saveCandidate(project,{...c,evidence:passages,requirementMatrix:[],profileBackground:background,dataReleaseId:releaseId},brief,corpus.version,{dataReleaseId:releaseId});
  for(const text of [JSON.stringify(c),JSON.stringify(passages),JSON.stringify(background),renderSourcePage(c,passages,passages[0],{corpusVersion:corpus.version,dataRelease:{releaseId}}),P.exportJSON(project),P.exportHTML(project)]){
    assert.doesNotMatch(text,/UNSAFE_/);assert.match(text,/cardiac CT|1 Example Road/);
  }
  assert.deepEqual(P.importJSON(P.exportJSON(project)).candidates,project.candidates);
});
test('a changed excluded specialty cannot be accepted under a stale source hash',()=>{
  const {raw,packet}=fixture();const prepared=R.applyRepairs(raw,packet,{baselineSha256,releaseId});
  prepared.rows[0].specialty='Different source meaning';
  assert.throws(()=>buildCorpus(prepared.rows),/source-bound evidence projection exclusion/);
});
test('projection suppression does not permit canonical location or identity edits',()=>{
  const {raw,packet}=fixture();
  for(const field of ['name','gmc_number','profile_urls','locations','locations.1.region']){
    const changed=structuredClone(packet);changed.suppressions=[{...packet.suppressions[0],field,beforeHash:R.hashValue(raw[0][field])}];
    assert.throws(()=>R.applyRepairs(raw,changed,{baselineSha256,releaseId}),/protected field/);
  }
});
