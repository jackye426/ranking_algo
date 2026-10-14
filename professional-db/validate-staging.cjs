'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),U=require('./util.cjs'),{connect,migrate}=require('./db.cjs'),R=require('./reader.cjs');
async function main(){const [inventoryFile,outputDir]=process.argv.slice(2);if(!path.isAbsolute(outputDir))throw Error('Private absolute output required');await fs.mkdir(outputDir,{recursive:true});const inv=await U.json(inventoryFile),db=await connect();try{
  await migrate(db);const reports=[];
  // Full-corpus jobs are deliberately serialized on this workstation.
  for(const b of inv.bindings){const rid=b.releaseId,pin={releaseId:rid,manifestSha256:(await U.json(b.bindingFile)).manifestSha256,bindingSha256:b.bindingSha256,corpusVersion:b.corpusVersion};
    const old=(await db.query('select * from docmap_professional.releases where release_id=$1',[rid])).rows[0];let imported;
    if(old){if(old.binding_sha256!==b.bindingSha256)throw Error('Staging tuple changed');imported={idempotent:true,releaseId:rid,counts:old.counts,reconciliationSha256:old.reconciliation_sha256};}else imported=await require('./importer.cjs').importRelease(db,{bindingFile:b.bindingFile,bindingSha256:b.bindingSha256,reportFile:path.join(outputDir,rid+'.ndjson'),onProgress:x=>console.log(JSON.stringify({releaseId:rid,...x}))});
    const repeated=await require('./importer.cjs').importRelease(db,{bindingFile:b.bindingFile,bindingSha256:b.bindingSha256,reportFile:path.join(outputDir,rid+'-repeat.ndjson')});if(!repeated.idempotent)throw Error('Repeat import duplicated dataset');
    let readinessFailed=false;try{await R.release(db,pin);}catch{readinessFailed=true;}if(!readinessFailed)throw Error('Unapproved staging release became product-ready');
    const examples=await require('./verify-examples.cjs').verifyExamples(db,pin,path.join(outputDir,rid+'-examples.json'));
    const parity=await require('./compare.cjs').comparePreparation(db,pin,{outputFile:path.join(outputDir,rid+'-parity.json')});global.gc?.();
    const config={pin,staging:true,port:55440};await fs.writeFile(path.join(outputDir,rid+'-preview.json'),JSON.stringify(config,null,2),{flag:'wx'});
    reports.push({releaseId:rid,imported,repeatIdempotent:true,productReadinessRejected:true,examples:examples.passed,parity:parity.passed,indexMs:parity.indexMs,performance:parity.performance,queries:parity.searches,totalPreparationMs:parity.totalMs});
  }
  const catalogFile=path.resolve(__dirname,'.private/archive-catalog.json');await require('./archives.cjs').registerArchives(db,{catalogFile,catalogSha256:await U.fileHash(catalogFile)});
  const approvals=(await db.query('select count(*)::int n from docmap_professional.publication_events')).rows[0].n;if(approvals!==0)throw Error('Unexpected real staging approval');
  const summary={passed:true,scope:'Isolated staging transport/parity/BM25; no real product approval or main activation',reports,publicationEvents:approvals,privateArchiveLinks:(await db.query('select count(*)::int n from docmap_professional.archive_links')).rows[0].n};await fs.writeFile(path.join(outputDir,'staging-summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});console.log(JSON.stringify(summary));
}finally{await db.end();}}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={main};
