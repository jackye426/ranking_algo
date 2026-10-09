'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {verifyFrozenPack,sourceView,profileFingerprint,createPool,mergeReviews,rankingMetrics,bootstrap,loadSelectedCorpus,score,validatePreparedQueries,applyPreparedPractices}=require('./harness.cjs');
const contract=require('./contract.json');
test('blind source views retain exact activity ranges, zero counts, dates and derived-value qualifications',()=>{
 const passage={id:'owned-evidence',sourceRecordId:'owned-source',text:'Recorded procedure',type:'procedure',field:'procedure_volumes_phin',volumes:[{activity:'Knee surgery',reportedRange:'<=7',reportedAdmissions:null,reportingPeriod:'2024',countNumeric:3.5,countNumericDerived:true,hospital:'Recorded hospital',sourceDate:null},{activity:'Other surgery',reportedAdmissions:0,reportedRange:null,reportingPeriod:null,countNumericDerived:false}]};
 const view=sourceView(passage);assert.deepEqual(view.volumes,passage.volumes);view.volumes[0].reportedRange='changed';assert.equal(passage.volumes[0].reportedRange,'<=7');
 const changed=structuredClone(passage);changed.volumes[0].reportedRange='8–20';assert.notEqual(profileFingerprint([passage]),profileFingerprint([changed]));
 const without=structuredClone(passage);delete without.volumes;assert.notEqual(profileFingerprint([passage]),profileFingerprint([without]));
});
test('top-ten amendment preserves original contract and unchanged questions, grades and thresholds',()=>{
  const fs=require('node:fs'),{createHash}=require('node:crypto'),prior=require('./contract-v1.json'),manifest=require('./freeze-manifest-before-heldout-split-v2.json'),oldManifest=require('./freeze-manifest-v1.json');
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'contract-v1.json'))).digest('hex'),oldManifest.contractSha256);
  assert.deepEqual(contract.grades,prior.grades);assert.deepEqual(contract.thresholds,prior.thresholds);assert.deepEqual(manifest.development,oldManifest.development);assert.deepEqual(manifest.heldout,oldManifest.heldout);assert.equal(contract.poolDepth,10);
});

test('answerability amendment preserves raw prior contract and all briefs, grades and thresholds',()=>{
 const fs=require('node:fs'),{createHash}=require('node:crypto'),prior=require('./contract-v2.json'),oldManifest=require('./freeze-manifest-v2.json'),manifest=require('./freeze-manifest-before-heldout-split-v2.json');
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'contract-v2.json'))).digest('hex'),oldManifest.contractSha256);assert.deepEqual(contract.grades,prior.grades);assert.deepEqual(contract.thresholds,prior.thresholds);assert.deepEqual(manifest.development,oldManifest.development);assert.deepEqual(manifest.heldout,oldManifest.heldout);assert.match(contract.metrics.acceptanceDenominator,/complete pooled union/);
});

test('held-out topic-split repair preserves the prior freeze and records its one prospective question change',()=>{
 const fs=require('node:fs'),{createHash}=require('node:crypto'),prior=require('./freeze-manifest-before-heldout-split-v2.json'),current=require('./freeze-manifest.json'),amendment=require('./heldout-topic-split-amendment-v2.json');
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'freeze-manifest-before-heldout-split-v2.json'))).digest('hex'),amendment.previousFreezeSha256);
 assert.equal(amendment.originalHeldoutSha256,prior.heldout.sha256);assert.equal(amendment.heldoutSha256,current.heldout.sha256);assert.equal(amendment.changedQuestionCount,1);assert.equal(amendment.otherQuestionsAndExpectationsUnchanged,true);assert.equal(amendment.beforeHeldoutInterpretation,true);assert.equal(amendment.beforeHeldoutRetrieval,true);assert.equal(amendment.thresholdsAndGradesUnchanged,true);assert.equal(current.heldout.cases,64);assert.deepEqual(current.development,prior.development);assert.equal(current.contractSha256,prior.contractSha256);
});
test('prospective development pack is frozen, complete and old packs remain unchanged',()=>{
  const {pack}=verifyFrozenPack(path.join(__dirname,'development.json'));
  assert.equal(pack.scenarios.length,32);assert.equal(new Set(pack.scenarios.map(c=>c.id)).size,32);
  for(const family of contract.families)assert.equal(pack.scenarios.filter(c=>c.family===family).length,4);
});

test('bounded review loading retains only selected ownership but verifies unselected source segments',async()=>{
 const fs=require('node:fs'),os=require('node:os'),{createHash}=require('node:crypto'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'expert-review-subset-'));
 const sha=b=>createHash('sha256').update(b).digest('hex'),fields={};
 try{
  for(const [field,rows] of Object.entries({candidates:[{id:'selected'},{id:'other'}],passages:[{id:'a',candidateId:'selected',text:'CT'},{id:'b',candidateId:'other',text:'MR'}],identityLedger:[{id:'internal'}]})){
   const file=field+'.json',bytes=Buffer.from(JSON.stringify(rows));fs.writeFileSync(path.join(dir,file),bytes);fields[field]={count:rows.length,segments:[{file,bytes:bytes.length,sha256:sha(bytes),count:rows.length}]};
  }
  fs.writeFileSync(path.join(dir,'segments-manifest.json'),JSON.stringify({format:'expert-corpus-array-segments-v1',sourceCorpusSha256:'frozen',metadata:{version:'v1'},fields}));
  const selected=await loadSelectedCorpus(dir,new Set(['selected']));assert.deepEqual(selected.corpus.candidates,[{id:'selected'}]);assert.deepEqual(selected.corpus.passages,[{id:'a',candidateId:'selected',text:'CT'}]);assert.deepEqual(selected.corpus.identityLedger,[]);assert.equal(selected.checksum,'frozen');
  fs.writeFileSync(path.join(dir,'identityLedger.json'),'[]');await assert.rejects(()=>loadSelectedCorpus(dir,new Set(['selected'])),/checksum mismatch/);
 }finally{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);}
});
test('exact source wording, negative qualifiers, short terms and source dates survive blinding',()=>{
  const p={text:'No CT activity. MR training only; <=7 cases.',type:'professional-background',field:'training',sourceLabel:'Provider',dates:{sourceDate:null,observedAt:'2025-01-01',mergeDate:'2026-10-01'},qualifiers:['training-not-practice'],repairProvenance:{releaseId:'secret-label'}};
  const view=sourceView(p);assert.equal(view.text,p.text);assert.equal(view.dates.sourceDate,null);assert.equal(view.dates.mergeDate,undefined);assert.equal(view.repairProvenance,undefined);assert.deepEqual(view.qualifiers,p.qualifiers);
});
test('profile fingerprints are passage-order insensitive but retain differing provenance',()=>{
  const a={text:'CT',field:'training'},b={text:'MR',field:'training'};
  assert.equal(profileFingerprint([a,b]),profileFingerprint([b,a]));assert.notEqual(profileFingerprint([a]),profileFingerprint([{...a,sourceLabel:'Another source'}]));
  assert.notEqual(profileFingerprint([{...a,sourceRecordId:'one'}]),profileFingerprint([{...a,sourceRecordId:'two'}]));
  assert.notEqual(profileFingerprint([{...a,repairProvenance:{snapshotSha256:'one'}}]),profileFingerprint([{...a,repairProvenance:{snapshotSha256:'two'}}]));
  assert.equal(profileFingerprint([{...a,repairProvenance:{releaseId:'one',snapshotSha256:'same'}}]),profileFingerprint([{...a,repairProvenance:{releaseId:'two',snapshotSha256:'same'}}]));
});
function fixtures(){
  const scenario={id:'case-1',family:'broad-discovery',message:'Find CT experts.',followups:[],expectation:{centralRequest:'CT'}};
  const candidates=[{id:'real-a',name:'Dr Example A',sourceRecordIds:['source-a']},{id:'real-b',name:'Dr Example B',sourceRecordIds:['source-b']}];
  const p=(candidateId,text)=>({id:'evidence-'+candidateId+'-'+text,candidateId,text,field:'about',type:'clinical-practice',sourceRecordId:'source-'+candidateId});
  const corpora=[{checksum:'sha-a',corpus:{candidates,passages:[p('real-a','CT reporting'),p('real-b','MR training')]}},{checksum:'sha-b',corpus:{candidates,passages:[p('real-a','CT reporting'),p('real-b','MR training'),p('real-b','CT reporting')]}}];
  const makeRun=(label,checksum,ids)=>({label,corpusSha256:checksum,contractId:contract.contractId,packSha256:'pack-sha',code:{search:'same'},cases:[{id:'case-1',turns:[],byMode:{hybrid:{results:ids.map(id=>({id})),resultCount:ids.length}}}]});
  return {pack:{scenarios:[scenario]},corpora,runs:[makeRun('secret-baseline','sha-a',['real-a']),makeRun('secret-enriched','sha-b',['real-b','real-a'])],key:'private-key'};
}
test('pool is blind, contains union candidates in both source versions, and has complete ownership mapping',()=>{
  const {packet,mapping}=createPool(fixtures());
  assert.equal(packet.cases[0].profiles.length,3);
  assert.equal(Object.keys(mapping.runs[0].caseMappings['case-1'].candidateTokens).length,2);
  assert.equal(Object.keys(mapping.runs[1].caseMappings['case-1'].candidateTokens).length,2);
  const text=JSON.stringify(packet);for(const forbidden of ['secret-baseline','secret-enriched','real-a','real-b','Dr Example','sha-a','sha-b'])assert(!text.includes(forbidden),forbidden);
  assert(packet.cases[0].profiles.every(p=>p.evidence.every(e=>e.token&&e.text)));
});
test('different engine implementations cannot be presented as a corpus ablation',()=>{
  const f=fixtures();f.runs[1].code.search='changed';assert.throws(()=>createPool(f),/same implementation/);
});

test('different query vectors cannot be hidden inside a corpus ablation',()=>{
 const f=fixtures();f.runs[0].queryVectorsSha256='first';f.runs[1].queryVectorsSha256='different';assert.throws(()=>createPool(f),/identical query vectors/);
});

test('different prepared coordinates cannot be hidden inside a corpus ablation',()=>{
 const f=fixtures();f.runs[0].practicePreparation={resolutionSha256:'one'};f.runs[1].practicePreparation={resolutionSha256:'two'};assert.throws(()=>createPool(f),/identical prepared practice coordinates/);
 delete f.runs[1].practicePreparation;assert.throws(()=>createPool(f),/identical prepared practice coordinates/);
});

test('evaluation applies exact release-bound practice preparation and rejects changed ownership before mutation',async()=>{
 const fs=require('node:fs'),os=require('node:os'),{createPracticeSnapshot}=require('../../practice-cache.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'expert-eval-practice-')),file=path.join(dir,'practice.json');
 const original={version:'expert-corpus-test-practice',candidates:[{id:'one',sourceRecordIds:['source-one'],locations:[{field:'locations',sourceRecordId:'source-one',name:'Recorded practice',postcode:'SW50AA',country:'UK'}]}]};
 const geo={prepareLocations:async candidates=>{Object.assign(candidates[0].locations[0],{latitude:51.49,longitude:-.18,coordinateSource:'https://api.postcodes.io/postcodes/SW50AA',coordinatePrecision:'postcode centre',coordinateProvenance:{kind:'geocoded-postcode',sourceUrl:'https://api.postcodes.io/postcodes/SW50AA',postcode:'SW50AA',retrievedAt:null}});}};
 try{
  const snapshot=await createPracticeSnapshot(original,{geo,releaseId:'test-release',preparedAt:'2026-10-08T00:00:00Z'});fs.writeFileSync(file,JSON.stringify(snapshot));
  const copy=structuredClone(original),receipt=applyPreparedPractices(copy,file,'test-release');assert.equal(copy.candidates[0].locations[0].latitude,51.49);assert.equal(original.candidates[0].locations[0].latitude,undefined);assert.equal(receipt.coverage.geocoded,1);assert.match(receipt.resolutionSha256,/^[a-f0-9]{64}$/);
  const wrong=structuredClone(original);assert.throws(()=>applyPreparedPractices(wrong,file,'wrong-release'),/snapshot identity/);assert.equal(wrong.candidates[0].locations[0].latitude,undefined);
  wrong.candidates[0].sourceRecordIds=['wrong-person'];assert.throws(()=>applyPreparedPractices(wrong,file,'test-release'),/source ownership/);assert.equal(wrong.candidates[0].locations[0].latitude,undefined);
  assert.throws(()=>applyPreparedPractices(original,null,'test-release'),/requires a prepared practice snapshot/);assert.throws(()=>applyPreparedPractices(original,file),/expected release identifier/);
 }finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('amended pool includes every top-ten item plus anchor, retains remaining ranks without inventing grades',()=>{
  const f=fixtures();
  for(let i=2;i<20;i++){const id='person-'+i;f.corpora[0].corpus.candidates.push({id,sourceRecordIds:['source-'+i]});for(const c of f.corpora)c.corpus.passages.push({id:'evidence-'+i,candidateId:id,text:'CT source '+i,field:'about'});}
  const ids=f.corpora[0].corpus.candidates.map(c=>c.id);for(const run of f.runs)run.cases[0].byMode.hybrid.results=ids.map(id=>({id}));
  f.pack.scenarios[0].sourceReferenceKeys=['known'];f.anchorLedger={known:{candidateId:'person-15',reviewStatus:'accepted'}};
  const {packet,mapping}=createPool(f);const own=mapping.runs[0].caseMappings['case-1'];
  assert.equal(Object.keys(own.candidateTokens).length,11);assert(own.candidateTokens['person-15']);assert(!own.candidateTokens['person-14']);
  assert(own.byMode.hybrid.results[14].profileToken.startsWith('unpooled-'));assert.equal(own.byMode.hybrid.results[15].profileToken,own.candidateTokens['person-15']);
  assert.equal(packet.cases[0].profiles.length,12);
});
test('held identities are never accepted into returned-result review pool',()=>{
  const f=fixtures();f.corpora[0].corpus.candidates[0].needsIdentityReview=true;assert.throws(()=>createPool(f),/held identity/);
});
test('unjudged items block metrics; interests do not get automatic relevance grades',()=>{
  assert.throws(()=>rankingMetrics(['a'],new Map(),['a']),/Unjudged/);
});
test('one perfect result cannot hide four useful omitted results',()=>{
  const grades=new Map(['a','b','c','d','e'].map(x=>[x,3]));
  const m=rankingMetrics(['a'],grades,[...grades.keys()]);assert.equal(m.usefulPrecisionAt5,1);assert.equal(m.usefulCoverageAt5,.2);assert(m.ndcgAt10<.4);
});
test('adjacent evidence is not counted as useful and empty answerable results score zero',()=>{
  const grades=new Map([['a',3],['b',2],['c',1],['d',0]]);
  const m=rankingMetrics(['c','b','d','a'],grades,[...grades.keys()],['a']);assert.equal(m.usefulPrecisionAt5,.5);assert.equal(m.knownRecallAt20,1);
  const empty=rankingMetrics([],grades,[...grades.keys()]);assert.equal(empty.usefulPrecisionAt5,0);assert.equal(empty.ndcgAt10,0);
});
test('empty results without a useful pool still retain zero raw precision in all-discovery reporting',()=>{
 const grades=new Map([['adjacent',1],['irrelevant',0]]);
 const m=rankingMetrics([],grades,[...grades.keys()]);
 assert.equal(m.usefulPrecisionAt5,0);
 assert.equal(m.usefulCoverageAt5,null);
 assert.equal(m.poolUseful,0);
 assert.equal(m.ndcgAt10,0);
});
test('missing frozen reference stays in recall denominator',()=>{
  const m=rankingMetrics(['a'],new Map([['a',3]]),['a'],['a','missing-reference:b']);assert.equal(m.knownRecallAt20,.5);
});
test('unscored ranks eleven to twenty retain positions without being treated as irrelevant',()=>{
  const first=Array.from({length:10},(_,i)=>'p'+i),grades=new Map(first.map(t=>[t,3]));
  const ranking=[...first,'unpooled-11','unpooled-12'];const result=rankingMetrics(ranking,grades,first);
  assert.equal(result.ndcgAt10,1);assert.equal(result.usefulPrecisionAt5,1);assert.equal(result.knownRecallAt20,null);
});
function reviews(){
  const packet={cases:[{caseId:'c',profiles:[{profileToken:'p',evidence:[{token:'E001',text:'Recorded CT reporting'}]}]}]};
  const row={caseId:'c',profileToken:'p',grade:3,reason:'Direct reporting activity.',centralEvidence:['E001'],materialGaps:[],attributionConcern:false};
  return {packet,a:{reviewer:'A',independent:true,judgements:[row]},b:{reviewer:'B',independent:true,judgements:[{...row}]}};
}
test('two complete independent agreeing reviews are required',()=>{
  const {packet,a,b}=reviews();assert.equal(mergeReviews(packet,a,b).complete,true);b.reviewer='A';assert.throws(()=>mergeReviews(packet,a,b),/different independent/);
});
test('disagreements and attribution concerns remain unresolved without explicit adjudication',()=>{
  const {packet,a,b}=reviews();b.judgements[0].grade=1;assert.equal(mergeReviews(packet,a,b).complete,false);
  assert.equal(mergeReviews(packet,a,b,{p:{grade:2,reason:'Evidence supports topic but dates unknown.',attributionResolved:true}}).complete,true);
  b.judgements[0].grade=3;b.judgements[0].attributionConcern=true;assert.equal(mergeReviews(packet,a,b).complete,false);
});
test('wrong-candidate citation tokens and empty unsupported grades fail validation',()=>{
  const {packet,a,b}=reviews();b.judgements[0].centralEvidence=['E999'];assert.throws(()=>mergeReviews(packet,a,b),/unsupported review/);b.judgements[0].centralEvidence=[];assert.throws(()=>mergeReviews(packet,a,b),/unsupported review/);
});
test('unfilled reviews remain unknown rather than zero',()=>{
  const {packet,a,b}=reviews();b.judgements[0].grade=null;const result=mergeReviews(packet,a,b);assert.equal(result.complete,false);assert.deepEqual(result.missing,['p']);assert.equal(result.grades.has('p'),false);
});
test('duplicate candidates cannot inflate ranking metrics',()=>assert.throws(()=>rankingMetrics(['a','a'],new Map([['a',3]]),['a']),/Duplicate candidate/));
test('bootstrap intervals are reproducible and bounded',()=>{
  const a=bootstrap([0,.5,1]);assert.deepEqual(a,bootstrap([0,.5,1]));assert(a.low>=0&&a.high<=1);assert.equal(bootstrap([]),null);
});

function answerabilityFixture(){
 const scenarios=['answerable','insufficient'].map(id=>({id,family:'insufficient-conflicting',expectation:{outcome:'discover'},simpleInterpretationEligible:true,recallScope:'not-exhaustive'}));
 const packet={cases:scenarios.map(s=>({caseId:s.id,profiles:[{profileToken:s.id,evidence:[{token:'E001'}]}]}))};
 const judgements=scenarios.map((s,i)=>({caseId:s.id,profileToken:s.id,grade:i?1:3,reason:i?'Only adjacent evidence.':'Direct owned evidence.',centralEvidence:['E001'],materialGaps:[],attributionConcern:false}));
 const review=reviewer=>({reviewer,independent:true,judgements,interpretation:scenarios.map(s=>({caseId:s.id,pass:true,reason:'Faithful request.',criticalFailure:false})),insufficientEvidence:[{caseId:'insufficient',pass:true,reason:'All response variants explicitly describe indirect evidence.',unsupportedClaim:false}]});
 const run=empty=>({label:empty?'baseline':'enriched',corpusVersion:'version',caseMappings:Object.fromEntries(scenarios.map(s=>[s.id,{candidateTokens:{[s.id]:s.id},byMode:Object.fromEntries(['bm25','semantic','hybrid'].map(mode=>[mode,{results:empty&&s.id==='answerable'?[]:[{profileToken:s.id}]}]))}]))});
 return{pack:{scenarios},packet,mapping:{profiles:Object.fromEntries(scenarios.map(s=>[s.id,{candidateId:s.id}])),runs:[run(true),run(false)]},reviewA:review('A'),reviewB:review('B')};
}

test('answerability comes from shared reviewed pool, retaining raw zero precision and baseline empty results',()=>{
 const result=score(answerabilityFixture());assert.equal(result.state,'scored');assert.deepEqual(result.answerableCases,['answerable']);assert.equal(result.runs[0].byMode.hybrid.cases,1);assert.equal(result.runs[0].byMode.hybrid.usefulPrecisionAt5.mean,0);assert.equal(result.runs[1].byMode.hybrid.usefulPrecisionAt5.mean,1);assert.equal(result.runs[1].byMode.hybrid.allDiscoveryCases.cases,2);assert.equal(result.runs[1].byMode.hybrid.allDiscoveryCases.usefulPrecisionAt5.mean,.5);assert.equal(result.insufficientEvidence.length,1);
});

test('insufficient-evidence cases require independent honest-presentation review instead of disappearing',()=>{
 const f=answerabilityFixture();f.reviewB.insufficientEvidence=[];assert.equal(score(f).state,'incomplete-insufficient-evidence-review');f.reviewB.insufficientEvidence=[{caseId:'insufficient',pass:false,reason:'The response overstates the source.',unsupportedClaim:true}];assert.equal(score(f).gates.insufficientEvidenceHonesty,false);
});

test('prepared Linux query vectors fail closed for changed planners, models, values and provenance',()=>{
 const {createHash}=require('node:crypto'),hash=x=>createHash('sha256').update(x).digest('hex'),code=Object.fromEntries(['search.cjs','brief.cjs','brief-context.cjs','geo.cjs','device-context.cjs','device-context-set.cjs','classification-registry.cjs','mdr-taxonomy.cjs','emdn-taxonomy.cjs'].map(f=>[f,'pinned'])),entries=[['CT reporting',Array(384).fill(.01)]],q={passed:true,runtime:{platform:'linux'},networkDisabled:true,packSha256:'pack',model:'Xenova/all-MiniLM-L6-v2',dtype:'q8',dimensions:384,modelFiles:[{file:'weights',sha256:'model'}],code,entries,entriesSha256:hash(JSON.stringify(entries))},expected={packSha256:'pack',modelArtifacts:q.modelFiles,code};
 assert.equal(validatePreparedQueries(q,expected).size,1);assert.throws(()=>validatePreparedQueries({...q,code:{}},expected),/Query planning changed/);assert.throws(()=>validatePreparedQueries({...q,runtime:{platform:'win32'}},expected),/Invalid/);assert.throws(()=>validatePreparedQueries({...q,modelFiles:[]},expected),/Invalid/);const bad=structuredClone(q);bad.entries[0][1][0]=.02;assert.throws(()=>validatePreparedQueries(bad,expected),/Invalid/);
});
