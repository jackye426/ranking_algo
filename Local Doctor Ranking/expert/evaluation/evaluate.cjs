'use strict';

// Actual local MiniLM + BM25 ablation. Never sends source data or briefs to a
// remote model. Reports failures without rewriting labels or lowering gates.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {buildCorpus}=require('../data.cjs');
const enrichments=require('../enrichments.cjs');
const identityReviews=require('../identity-reviews.cjs');
const {createBriefInterpreter}=require('../brief.cjs');
const {ExpertSearchEngine}=require('../search.cjs');
const pack=require('./scenarios.cjs');
const root=path.resolve(__dirname,'..');
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const hash=value=>createHash('sha256').update(value).digest('hex');
function candidateSupports(candidate,corpus,pattern){
  if(!pattern)return false;
  const re=new RegExp(pattern,'i');
  return corpus.passages.some(p=>p.candidateId===candidate.id&&['clinical-practice','clinical-interest','procedure','research'].includes(p.type)&&re.test(p.text)&&!p.qualifiers?.includes('training-not-practice'));
}
function scoreCase(scenario,brief,response,corpus){
  const results=response.results||[], checks=[];
  const add=(name,pass,detail)=>checks.push({name,pass:!!pass,...(detail?{detail}:{})});
  if(scenario.expectClarification)add('clarification',response.needsClarification===true&&!results.length);
  if(scenario.expectEmpty)add('insufficient-documented-evidence',results.length===0);
  for(const label of scenario.removedLabels||[])add(`removed:${label}`,!brief.requirements.some(r=>r.label===label));
  for(const label of scenario.requirementLabels||scenario.expectations.requirementLabels||[])add(`requirement:${label}`,brief.requirements.some(r=>r.label===label));
  const technology=brief.requirements.filter(r=>r.kind==='technology');
  if(typeof scenario.expectedTechnologyPresent==='boolean')add('technology-context-preserved',!!technology.length===scenario.expectedTechnologyPresent);
  if(scenario.expectedTechnologyPattern)add('technology-context-meaning',technology.some(r=>new RegExp(scenario.expectedTechnologyPattern,'i').test([r.label,r.text,r.evidence].filter(Boolean).join(' '))));
  for(const label of scenario.mustRemainUnconfirmed||[]){
    const matches=results.flatMap(r=>r.requirementMatrix.filter(m=>m.label===label));
    add(`unknown:${label}`,matches.length===0||matches.every(m=>m.status!=='documented'));
  }
  add('no-ai-approval',results.every(r=>!r.qualificationStatus||r.qualificationStatus==='not-reviewed'));
  add('no-conflict-free',results.every(r=>!r.relationshipStatus||r.relationshipStatus==='not-reviewed'));
  add('current-practice-not-assumed',results.every(r=>r.requirementMatrix.filter(m=>m.kind==='currentPractice').every(m=>m.status!=='documented')));
  add('correct-candidate-evidence',results.every(r=>r.evidence.every(p=>p.candidateId===r.id)));
  const labelledCandidates=results.filter(r=>r.sourceRecordIds.some(id=>(scenario.knownRelevantSourceIds||[]).includes(id)));
  for(const kind of scenario.expectations.unknownKinds||[])add(`no-inferred:${kind}`,labelledCandidates.every(r=>r.requirementMatrix.filter(m=>m.kind===kind).every(m=>m.status!=='documented')));
  if(scenario.relationshipOrganisation){
    add('manufacturer-retained',brief.manufacturer===scenario.relationshipOrganisation);
    if(scenario.expectNoEstablishedRelationship)add('no-invented-relationship',results.every(r=>r.relationships.every(p=>!p.text.toLowerCase().includes(scenario.relationshipOrganisation.toLowerCase()))));
    else {
      const hall=results.find(r=>r.sourceRecordIds.includes('spire_668'));
      add('documented-relationship-surfaced',!!hall&&hall.relationships.some(p=>/check 4 cancer/i.test(p.text)));
    }
  }
  if(scenario.family==='complementary-panel'){
    add('panel-role-goal-preserved',brief.panelSize===2&&brief.roles.some(r=>/clinician/i.test(r))&&brief.roles.some(r=>/research/i.test(r)));
    add('no-panel-padding',results.every(r=>r.evidence.length>0));
  }
  const rankable=!scenario.expectClarification&&!scenario.expectEmpty;
  // Quarantining an identity is correct safety behaviour, but must not silently
  // remove a frozen reference from the recall denominator and inflate the score.
  const referenceAvailability=(scenario.knownRelevantSourceIds||[]).map(sourceId=>{
    const candidate=corpus.candidates.find(c=>c.sourceRecordIds.includes(sourceId));
    return {sourceId,candidateId:candidate?.id||null,state:!candidate?'missing':candidate.needsIdentityReview?'held-for-identity-review':'searchable'};
  });
  const knownIds=[...new Set(referenceAvailability.map(r=>r.candidateId||`missing-source:${r.sourceId}`))];
  const first20=new Set(results.slice(0,20).map(c=>c.id));
  const first5=results.slice(0,5);
  const lexical=new Set(response.diagnostics?.bm25CandidateIds||[]),semantic=new Set(response.diagnostics?.semanticCandidateIds||[]);
  const semanticOnly=[...semantic].filter(id=>!lexical.has(id)),lexicalOnly=[...lexical].filter(id=>!semantic.has(id));
  return {id:scenario.id,split:scenario.split,family:scenario.family,checks,total:results.length,
    knownRelevantIds:knownIds,referenceAvailability,knownRecallAt20:rankable&&knownIds.length?knownIds.filter(id=>first20.has(id)).length/knownIds.length:null,
    sourceSupportedPrecisionAt5:rankable&&scenario.clinicalPattern?(first5.length?first5.filter(c=>candidateSupports(c,corpus,scenario.clinicalPattern)).length/first5.length:0):null,
    top5:first5.map(r=>({id:r.id,name:r.name,sourceRecordIds:r.sourceRecordIds,evidenceIds:r.evidence.map(p=>p.id)})),
    retrievalContribution:{bm25OnlyCandidates:lexicalOnly.length,semanticOnlyCandidates:semanticOnly.length,sharedCandidates:[...lexical].filter(id=>semantic.has(id)).length,
      semanticOnlyInTop20:semanticOnly.filter(id=>first20.has(id)).length,bm25OnlyInTop20:lexicalOnly.filter(id=>first20.has(id)).length},
    diagnostics:response.diagnostics};
}
async function evaluate({corpus,engine,split='holdout',modes=['hybrid','bm25','semantic'],onCase=()=>{},scenarioPack=pack,scenarioFingerprint=null,evaluationRound=null}){
  const interpreter=createBriefInterpreter({client:null}),cases=[];
  for(const scenario of scenarioPack.scenarios.filter(s=>split==='all'||s.split===split)){
    let parsed=await interpreter({message:scenario.message});
    for(const message of scenario.followups||[])parsed=await interpreter({message,previous:parsed.brief});
    const byMode={};
    for(const mode of modes){
      const started=performance.now();
      const response=parsed.needsClarification?{results:[],needsClarification:true,diagnostics:{retrievalMode:mode}}:await engine.search(parsed.brief,{documentedOnly:!!scenario.documentedOnly,retrievalMode:mode});
      byMode[mode]={...scoreCase(scenario,parsed.brief,response,corpus),durationMs:Math.round(performance.now()-started)};
    }
    cases.push({id:scenario.id,brief:parsed.brief,interpretationMode:parsed.mode,byMode});onCase(cases.at(-1));
  }
  const summary={};
  for(const mode of modes){
    const scored=cases.map(c=>c.byMode[mode]);
    summary[mode]={cases:scored.length,checks:scored.flatMap(c=>c.checks).length,failedChecks:scored.flatMap(c=>c.checks.filter(check=>!check.pass).map(check=>({id:c.id,...check}))),
      knownRecallAt20:mean(scored.map(c=>c.knownRecallAt20).filter(x=>x!==null)),sourceSupportedPrecisionAt5:mean(scored.map(c=>c.sourceSupportedPrecisionAt5).filter(x=>x!==null)),
      contribution:{casesWithUniqueSemanticCandidate:scored.filter(c=>c.retrievalContribution.semanticOnlyCandidates>0).length,casesWithUniqueSemanticCandidateInTop20:scored.filter(c=>c.retrievalContribution.semanticOnlyInTop20>0).length,casesWithUniqueBm25CandidateInTop20:scored.filter(c=>c.retrievalContribution.bm25OnlyInTop20>0).length},
      byFamily:Object.fromEntries([...new Set(scored.map(c=>c.family))].map(family=>{const c=scored.filter(x=>x.family===family);return [family,{cases:c.length,knownRecallAt20:mean(c.map(x=>x.knownRecallAt20).filter(x=>x!==null)),sourceSupportedPrecisionAt5:mean(c.map(x=>x.sourceSupportedPrecisionAt5).filter(x=>x!==null))}];}))};
  }
  const hybrid=summary.hybrid,baseline=summary.bm25;
  const gates=hybrid?{
    criticalChecks:hybrid.failedChecks.length===0,knownRecallAt20:hybrid.knownRecallAt20>=.9,sourceSupportedPrecisionAt5:hybrid.sourceSupportedPrecisionAt5>=.8,
    noBm25BaselineRegression:baseline?hybrid.knownRecallAt20>=baseline.knownRecallAt20&&hybrid.sourceSupportedPrecisionAt5>=baseline.sourceSupportedPrecisionAt5:null,
    actualRetrievalMethods:cases.some(c=>c.byMode.hybrid?.diagnostics.bm25Candidates>0)&&cases.some(c=>c.byMode.hybrid?.diagnostics.semanticCandidates>0)
  }:{};
  return {version:scenarioPack.version,evaluatedAt:new Date().toISOString(),split,...(evaluationRound?{evaluationRound}:{}),corpusVersion:corpus.version,corpusAudit:corpus.audit,scenarioFingerprint:scenarioFingerprint||hash(scenarioPack===pack?fs.readFileSync(path.join(__dirname,'scenarios.cjs')):JSON.stringify(scenarioPack)),
    modelBackedInterpretation:false,paidApiCalls:0,embeddingModel:engine.health().embeddingModel,summary,gates,passed:Object.values(gates).every(value=>value===true),cases,
    limitations:['Known-candidate recall uses a small source-reviewed reference set, not an exhaustive clinical gold standard.','First-page precision measures central clinical source support, not full qualification, availability or clinical superiority.','These cases exercise deterministic interpretation; paid DeepSeek interpretation requires a separate explicitly reported smoke check.','Source evidence can be historical or self-reported; observedAt is not a practice date.']};
}
function saveReport(report,cacheDir=path.join(root,'.cache')){
  if(report.evaluationRound&&!/^[a-z0-9-]+$/.test(report.evaluationRound))throw new Error('Invalid evaluation round');
  const stem=`evaluation-${report.split}${report.evaluationRound?'-'+report.evaluationRound:''}`;
  const first=path.join(cacheDir,`${stem}-first.json`),latest=path.join(cacheDir,`${stem}.json`);
  const json=JSON.stringify(report,null,2);
  if(!fs.existsSync(first))fs.writeFileSync(first,json,{flag:'wx'});
  fs.writeFileSync(latest,json);
  return {first,latest};
}
async function main(){
  const split=process.argv.find(x=>x.startsWith('--split='))?.split('=')[1]||'holdout';
  if(!['development','holdout','all'].includes(split))throw new Error('Invalid split');
  const round=process.argv.find(x=>x.startsWith('--pack='))?.split('=')[1]||null;
  if(round&&!['round-two','final'].includes(round))throw new Error('Unknown evaluation pack');
  const scenarioFile=path.join(__dirname,round?`holdout-${round}.cjs`:'scenarios.cjs');
  const selectedPack=round?require(scenarioFile):pack;
  const rawFile=path.join(root,'.cache/raw.json');const rawBytes=fs.readFileSync(rawFile),before=hash(rawBytes);
  const raw=JSON.parse(rawBytes);console.log('Building audited corpus');
  const corpus=buildCorpus(raw,{enrichments,identityReviews});
  const transformers=await import('@huggingface/transformers');
  transformers.env.allowRemoteModels=false;transformers.env.allowLocalModels=true;
  transformers.env.localModelPath=path.resolve(root,'../demo/.cache/models');transformers.env.cacheDir=transformers.env.localModelPath;
  const embedder=await transformers.pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
  const queryCache=new Map();
  const embedQuery=async texts=>{
    const missing=[...new Set(texts.filter(t=>!queryCache.has(t)))];
    if(missing.length){const vectors=(await embedder(missing,{pooling:'mean',normalize:true,truncation:true})).tolist();missing.forEach((t,i)=>queryCache.set(t,vectors[i]));}
    return texts.map(t=>queryCache.get(t));
  };
  try{
    let last=0;
    const engine=new ExpertSearchEngine({embedQuery,cacheDir:path.join(root,'.cache'),onProgress:message=>{if(Date.now()-last>10000){last=Date.now();console.log(message);}}});
    await engine.init(corpus);
    const report=await evaluate({corpus,engine,split,scenarioPack:selectedPack,scenarioFingerprint:hash(fs.readFileSync(scenarioFile)),evaluationRound:round,onCase:r=>console.log(`${r.id}: ${Object.entries(r.byMode).map(([m,c])=>`${m} recall=${c.knownRecallAt20} precision=${c.sourceSupportedPrecisionAt5}`).join('; ')}`)});
    if(hash(fs.readFileSync(rawFile))!==before)throw new Error('Protected source cache changed');
    const out=saveReport(report);console.log(JSON.stringify({out,summary:report.summary,gates:report.gates,passed:report.passed}));
    if(!report.passed)process.exitCode=1;
  }finally{await embedder.dispose();}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={scoreCase,evaluate,candidateSupports,saveReport};
