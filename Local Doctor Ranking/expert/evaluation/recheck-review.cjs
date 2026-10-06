'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {buildCorpus,normalizeText}=require('../data.cjs');
const enrichments=require('../enrichments.cjs');
const identityReviews=require('../identity-reviews.cjs');
const ledger=require('./review-ledger.cjs');
const root=path.resolve(__dirname,'..');
function recheck(corpus,initial){
  const bySource=new Map();
  for(const p of corpus.passages)for(const source of p.sources){const key=source.sourceRecordId+'|'+source.field;if(!bySource.has(key))bySource.set(key,[]);bySource.get(key).push(p);}
  const identities=ledger.identityReviews.map(item=>{
    const current=corpus.candidates.filter(c=>c.sourceRecordIds.some(id=>item.sourceRecordIds.includes(id)));
    const badGmc=current.some(c=>c.registrations.some(r=>r.body==='GMC'&&c.registrations.some(h=>h.body==='HCPC'&&h.identifier.replace(/\D/g,'').replace(/^0+/,'')===r.identifier.replace(/^0+/,''))));
    return {sourceRecordIds:item.sourceRecordIds,initialDecision:item.reviewDecision,candidateIds:current.map(c=>c.id),pass:current.length>0&&!badGmc};
  });
  const initialClaims=new Map(initial.claims.map(p=>[p.id,p]));
  const claims=ledger.claimReviews.map(item=>{
    const old=initialClaims.get(item.id);if(!old)return {id:item.id,pass:false,reason:'Original frozen sample is missing'};
    const related=[...new Map(item.sourceReferences.flatMap(s=>bySource.get(s.sourceRecordId+'|'+s.field)||[]).map(p=>[p.id,p])).values()];
    const exact=related.filter(p=>normalizeText(p.text).includes(normalizeText(old.text)));
    const parts=exact.length?exact:related.filter(p=>p.text.length>20&&normalizeText(old.text).includes(normalizeText(p.text)));
    if(item.classificationDecision!=='correction-required')return {id:item.id,pass:true,disposition:parts.length?'retained-source-evidence':'conservatively-removed',originalTreatment:item.expectedTreatment};
    let pass=false;
    if(['exclude','publication-link'].includes(item.expectedTreatment))pass=exact.length===0||exact.every(p=>['publication-link','unverified-reference'].includes(p.type)||p.qualifiers.includes('publication-listing-link-not-authorship'));
    else if(item.expectedTreatment==='qualifier-review')pass=parts.every(p=>p.text.includes('with/without')||!p.qualifiers.includes('contains-negation'));
    else if(!parts.length)pass=true; // Conservative removal never turns missing evidence into a negative claim.
    else if(item.expectedTreatment==='research-interest')pass=parts.every(p=>['research-interest','clinical-interest','professional-background'].includes(p.type)||p.qualifiers.some(q=>/interest|unconfirmed/i.test(q)));
    else if(item.expectedTreatment==='professional-background')pass=parts.every(p=>p.type!=='relationship');
    else if(item.expectedTreatment==='clinical-interest')pass=parts.every(p=>['clinical-interest','professional-background'].includes(p.type)||p.qualifiers.some(q=>/interest/i.test(q)));
    else if(item.expectedTreatment==='training')pass=parts.every(p=>p.type==='training'||p.qualifiers.includes('training-not-practice'));
    return {id:item.id,pass,originalTreatment:item.expectedTreatment,current:parts.map(p=>({id:p.id,type:p.type,qualifiers:p.qualifiers})),note:item.note};
  });
  return {reviewedAt:new Date().toISOString(),initialCorpusVersion:ledger.corpusVersion,corpusVersion:corpus.version,identities,claims,
    identityPass:identities.filter(x=>x.pass).length,identityTotal:identities.length,claimPass:claims.filter(x=>x.pass).length,claimTotal:claims.length,
    remaining:claims.filter(x=>!x.pass),limitations:['Checks retained the original stratified sample; it was not reselected after fixes.','Conservative exclusion counts as safe handling, not added data coverage.','This review checks source fidelity and treatment, not clinical qualification or exhaustive identity resolution.']};
}
if(require.main===module){
  const raw=JSON.parse(fs.readFileSync(path.join(root,'.cache/raw.json'),'utf8'));
  const initial=JSON.parse(fs.readFileSync(path.join(root,'.cache/evaluation-sample-initial.json'),'utf8'));
  const corpus=buildCorpus(raw,{enrichments,identityReviews});const report=recheck(corpus,initial);
  const out=path.join(root,'.cache/review-recheck.json');fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({out,identityPass:report.identityPass,identityTotal:report.identityTotal,claimPass:report.claimPass,claimTotal:report.claimTotal,remaining:report.remaining}));
  if(report.identityPass!==report.identityTotal||report.claimPass/report.claimTotal<.98)process.exitCode=1;
}
module.exports={recheck};
