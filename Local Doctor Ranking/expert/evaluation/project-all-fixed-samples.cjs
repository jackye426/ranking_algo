'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {projectSample}=require('./project-frozen-sample.cjs');
const cache=path.resolve(__dirname,'../.cache');
const names=['initial','holdout','holdout-round-two','holdout-round-three','holdout-round-four','holdout-round-five','final'];
function projectAll(corpus){
  return names.map(name=>{
    const sample=JSON.parse(fs.readFileSync(path.join(cache,`evaluation-sample-${name}.json`),'utf8'));
    const projection=projectSample(corpus,sample);
    // Preserve the pre-correction projections and immutable first-pass ledgers.
    const output=path.join(cache,name==='final'?'evaluation-final-projected.json':`evaluation-regression-final-${name}.json`);
    fs.writeFileSync(output,JSON.stringify(projection,null,2));
    return {name,output,corpusVersion:projection.corpusVersion,sampleFingerprint:projection.sampleFingerprint,groups:projection.groups.length,anchors:projection.claims.length,fullyWithheldAnchors:projection.claims.filter(c=>!c.current.length).length};
  });
}
if(require.main===module){
  const {buildCorpus}=require('../data.cjs');
  const raw=JSON.parse(fs.readFileSync(path.join(cache,'raw.json'),'utf8'));
  const corpus=buildCorpus(raw,{enrichments:require('../enrichments.cjs'),identityReviews:require('../identity-reviews.cjs')});
  console.log(JSON.stringify(projectAll(corpus)));
}
module.exports={projectAll};
