'use strict';

// Select an inspectable, deliberately stratified source-record review sample.
// Generated excerpts remain in the ignored cache; the decision ledger records
// hashes and references. This is not a live-page verification script.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {buildCorpus,normalizeText}=require('../data.cjs');
const enrichments=require('../enrichments.cjs');
const identityReviews=require('../identity-reviews.cjs');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const root=path.resolve(__dirname,'..');
function createSample(raw,corpus,{excludeSourceIds=new Set(),excludeTexts=new Set(),excludeCandidateIds=new Set(),seed='initial'}={}){
  const rows=raw.rows||raw, byRow=new Map(rows.map(r=>[String(r.id),r]));
  const orders=new Map();
  const order=id=>{if(!orders.has(id))orders.set(id,seed==='initial'?id:hash([seed,id]));return orders.get(id);};
  const groups=[], chosen=new Set();
  const add=(label,predicate,limit)=>{
    if(limit<=0)return;
    for(const candidate of corpus.candidates.filter(c=>!excludeCandidateIds.has(c.id)&&!c.sourceRecordIds.some(id=>excludeSourceIds.has(id))).filter(predicate).sort((a,b)=>order(a.id).localeCompare(order(b.id)))){
      if(chosen.has(candidate.id))continue;
      chosen.add(candidate.id);const sources=candidate.sourceRecordIds.map(id=>byRow.get(id));
      groups.push({candidateId:candidate.id,stratum:label,name:candidate.name,registrations:candidate.registrations,decision:candidate.needsIdentityReview?'held-for-review':sources.length>1?'merged':'retained',issues:candidate.identityIssues,
        sources:sources.map(r=>({id:r.id,name:r.name,gmc:r.gmc_number,hcpc:r.hcpc_number,profileUrls:r.profile_urls})),inputHash:hash(sources)});
      if(--limit===0)break;
    }
  };
  add('prepared-demo',c=>c.sourceRecordIds.some(id=>['bupa_11411','bupa_14429','bupa_12291','spire_668'].includes(id)),4);
  add('held-identity',c=>c.needsIdentityReview,16);
  add('merged',c=>!c.needsIdentityReview&&c.sourceRecordIds.length>1,20);
  add('non-gmc',c=>c.registrations.some(r=>r.body!=='GMC'),10);
  add('alternate-biography',c=>c.sourceRecordIds.some(id=>JSON.stringify(byRow.get(id)?.about_alternatives||{}).length>150),15);
  add('publication-field',c=>c.sourceRecordIds.some(id=>byRow.get(id)?.publications?.length),10);
  add('volume-field',c=>c.sourceRecordIds.some(id=>byRow.get(id)?.procedure_volumes_phin?.length),10);
  add('sparse-record',c=>c.evidenceIds.length>0&&c.evidenceIds.length<4,10);
  add('coverage-fill',()=>true,100-groups.length);
  const claims=[],selected=new Set();
  const addClaims=(label,predicate,limit)=>{
    if(limit<=0)return;
    for(const p of corpus.passages.filter(p=>!excludeCandidateIds.has(p.candidateId)&&!excludeTexts.has(p.text)&&!p.sources.some(s=>excludeSourceIds.has(s.sourceRecordId))).filter(predicate).sort((a,b)=>order(a.id).localeCompare(order(b.id)))){
      if(selected.has(p.id))continue;
      selected.add(p.id);
      const sourceRows=p.sources.map(s=>({sourceRecordId:s.sourceRecordId,field:s.field,available:byRow.has(s.sourceRecordId),sourceValue:byRow.has(s.sourceRecordId)?byRow.get(s.sourceRecordId)[s.field]:null}));
      const normalizedSource=sourceRows.map(s=>normalizeText(typeof s.sourceValue==='string'?s.sourceValue:JSON.stringify(s.sourceValue)));
      claims.push({id:p.id,candidateId:p.candidateId,stratum:label,type:p.type,text:p.text,qualifiers:p.qualifiers,sources:p.sources,dates:p.dates,attribution:p.attribution,attributes:p.attributes,
        exactSourceSubstring:normalizedSource.some(s=>s.includes(p.text)),sourceRows,inputHash:hash([p.text,p.sources]),reviewState:'awaiting-source-record-review'});
      if(--limit===0)break;
    }
  };
  addClaims('targeted-enrichment',p=>p.attribution==='verified-source',20);
  addClaims('research',p=>p.type==='research',25);
  addClaims('publication',p=>p.type==='publication',20);
  addClaims('relationship',p=>p.type==='relationship',15);
  addClaims('volume',p=>!!p.volume,20);
  addClaims('training',p=>p.type==='training',15);
  addClaims('clinical-practice',p=>p.type==='clinical-practice',30);
  addClaims('alternate-biography',p=>p.field==='about_alternatives',25);
  addClaims('clinical-interest',p=>p.type==='clinical-interest',20);
  addClaims('coverage-fill',()=>true,200-claims.length);
  return {version:'expert-source-sample-v1',seed,sampledAt:'2026-10-06',corpusVersion:corpus.version,inputRows:rows.length,groups,claims,limitations:['Source-record fidelity review is distinct from fresh public-page verification.','Stratified sample is diagnostic, not an estimate of prevalence or clinical qualification.']};
}
if(require.main===module){
  const raw=JSON.parse(fs.readFileSync(path.join(root,'.cache/raw.json'),'utf8'));
  const corpus=buildCorpus(raw,{enrichments,identityReviews});
  const roundTwo=process.argv.includes('--holdout-round-two');
  const roundThree=process.argv.includes('--holdout-round-three');
  const roundFour=process.argv.includes('--holdout-round-four');
  const roundFive=process.argv.includes('--holdout-round-five');
  const holdout=process.argv.includes('--holdout')||roundTwo||roundThree||roundFour||roundFive;
  const previous=holdout?['evaluation-sample-initial.json',...(roundTwo||roundThree||roundFour||roundFive?['evaluation-sample-holdout.json']:[]),...(roundThree||roundFour||roundFive?['evaluation-sample-holdout-round-two.json']:[]),...(roundFour||roundFive?['evaluation-sample-holdout-round-three.json']:[]),...(roundFive?['evaluation-sample-holdout-round-four.json']:[])].map(file=>JSON.parse(fs.readFileSync(path.join(root,'.cache',file),'utf8'))):[];
  const excludeSourceIds=new Set(previous.flatMap(s=>[...s.groups.flatMap(g=>g.sources.map(s=>s.id)),...s.claims.flatMap(p=>p.sources.map(s=>s.sourceRecordId))]));
  const excludeTexts=new Set(previous.flatMap(s=>s.claims.map(p=>p.text)));
  const excludeCandidateIds=new Set(roundThree||roundFour||roundFive?previous.flatMap(s=>[...s.groups.map(g=>g.candidateId),...s.claims.map(p=>p.candidateId)]):[]);
  const sample=createSample(raw,corpus,{excludeSourceIds,excludeTexts,excludeCandidateIds,seed:roundFive?'expert-holdout-round-five-2026-10-06':roundFour?'expert-holdout-round-four-2026-10-06':roundThree?'expert-holdout-round-three-2026-10-06':roundTwo?'expert-holdout-round-two-2026-10-06':holdout?'expert-holdout-2026-10-06':'initial'});
  const file=path.join(root,'.cache',roundFive?'evaluation-sample-holdout-round-five.json':roundFour?'evaluation-sample-holdout-round-four.json':roundThree?'evaluation-sample-holdout-round-three.json':roundTwo?'evaluation-sample-holdout-round-two.json':holdout?'evaluation-sample-holdout.json':'evaluation-sample.json');
  if(holdout&&fs.existsSync(file))throw new Error('Frozen holdout sample already exists; cannot overwrite it.');
  fs.writeFileSync(file,JSON.stringify(sample,null,2));
  console.log(JSON.stringify({file,groups:sample.groups.length,claims:sample.claims.length,corpusVersion:corpus.version,audit:corpus.audit}));
}
module.exports={createSample,hash};
