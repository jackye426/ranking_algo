'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {buildCorpus}=require('../data.cjs');
const enrichments=require('../enrichments.cjs');
const identityReviews=require('../identity-reviews.cjs');
const root=path.resolve(__dirname,'..');
const clean=text=>String(text||'').normalize('NFKC').replace(/\s+/g,' ').trim();
function projectSample(corpus,sample){
  const bySource=new Map();
  for(const p of corpus.passages)for(const source of p.sources){const key=source.sourceRecordId+'|'+source.field;if(!bySource.has(key))bySource.set(key,[]);bySource.get(key).push(p);}
  return {
    version:'expert-frozen-sample-projection-v1',sampleFingerprint:createHash('sha256').update(JSON.stringify(sample)).digest('hex'),
    anchorCorpusVersion:sample.corpusVersion,corpusVersion:corpus.version,projectedAt:new Date().toISOString(),audit:corpus.audit,
    groups:sample.groups.map(g=>({anchor:g,current:corpus.candidates.filter(c=>c.sourceRecordIds.some(id=>g.sources.some(s=>s.id===id))).map(c=>({id:c.id,name:c.name,registrations:c.registrations,sourceRecordIds:c.sourceRecordIds,needsIdentityReview:c.needsIdentityReview,identityIssues:c.identityIssues,profileUrls:c.profileUrls,role:c.role,specialty:c.specialty}))})),
    claims:sample.claims.map((anchor,index)=>{
      const related=[...new Map(anchor.sources.flatMap(s=>bySource.get(s.sourceRecordId+'|'+s.field)||[]).map(p=>[p.id,p])).values()];
      // The normalizer can repair missing spaces after sentence stops. Compare
      // those original sentence constituents too; an ID/packing change alone
      // must not be reported as discarded evidence.
      const lines=anchor.text.split(/\n+|(?<=[.!?])\s*(?=[A-Z])/).map(clean).filter(Boolean);
      const current=related.filter(p=>lines.some(line=>clean(p.text).includes(line)||line.length>20&&line.includes(clean(p.text))));
      const retainedLines=lines.filter(line=>current.some(p=>clean(p.text).includes(line)));
      return {index,anchor,current,retainedConstituents:retainedLines.length,totalConstituents:lines.length};
    }),
    limitations:['Selection anchors are fixed. A changed evidence ID or type does not select a replacement sample.','Conservatively withheld passages count as reduced coverage, not new expertise.','Projection requires independent review; matching source substrings does not establish correct interpretation.']
  };
}
if(require.main===module){
  const stem=process.argv.find(v=>v.startsWith('--sample='))?.slice(9)||'holdout-round-two';
  if(!['holdout','holdout-round-two','holdout-round-three','holdout-round-four','holdout-round-five','initial','final'].includes(stem))throw new Error('Unknown frozen sample');
  const sample=JSON.parse(fs.readFileSync(path.join(root,'.cache',`evaluation-sample-${stem}.json`),'utf8'));
  const raw=JSON.parse(fs.readFileSync(path.join(root,'.cache/raw.json'),'utf8'));
  const corpus=buildCorpus(raw,{enrichments,identityReviews});const projection=projectSample(corpus,sample);
  const output=path.join(root,'.cache',`evaluation-${stem}-projected.json`);fs.writeFileSync(output,JSON.stringify(projection,null,2));
  console.log(JSON.stringify({output,corpusVersion:projection.corpusVersion,groups:projection.groups.length,claims:projection.claims.length,fullyWithheld:projection.claims.filter(p=>!p.current.length).length}));
}
module.exports={projectSample};
