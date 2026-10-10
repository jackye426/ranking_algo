'use strict';
// Same frozen corpus and ranking implementation; no enrichment or model calls.
const U=require('./util.cjs'),R=require('./reader.cjs'),crypto=require('node:crypto');
async function comparePreparation(db,pin,{outputFile,queries=Array.from({length:20},(_,i)=>['CT MR reporting','physiotherapy rehabilitation','research interests','<=7 procedures'][i%4])}={}){
  const started=Date.now(),r=await R.release(db,pin,{staging:true}),corpus={passages:[],audit:r.counts.audit,version:r.corpus_version};
  const runtime=await require('./runtime.cjs').verifyRuntime(r.binding.runtimeDir,r.manifest.runtimeManifestSha256),{BM25Index}=require(require('node:path').join(runtime,'expert/search.cjs'));
  // Compare every immutable file item against a database reader page in the same
  // ordinal order, retaining only the database-backed corpus for index building.
  const outcomes={};for(const[key,table]of [['candidates','members'],['passages','evidence'],['identityLedger','identity_decisions']]){
    const iter=R.items(db,r,table)[Symbol.asyncIterator]();let n=0;const fileHash=crypto.createHash('sha256'),dbHash=crypto.createHash('sha256');
    await U.eachArray(r.binding.corpusPath,key,async value=>{const actual=await iter.next();if(actual.done||U.hash(actual.value)!==U.hash(value)||JSON.stringify(actual.value)!==JSON.stringify(value))throw Error('File/database preparation mismatch: '+key);fileHash.update(JSON.stringify(value));dbHash.update(JSON.stringify(actual.value));if(key==='passages')corpus.passages.push({id:actual.value.id,text:actual.value.text});n++;});if(!(await iter.next()).done)throw Error('Extra database items');outcomes[key]={items:n,orderedByteSerializationEqual:true,fileHash:fileHash.digest('hex'),databaseHash:dbHash.digest('hex')};
  }
  const indexStarted=Date.now(),dbIndex=new BM25Index(corpus.passages),indexMs=Date.now()-indexStarted;
  const path=require('node:path'),fsp=require('node:fs/promises'),indexFile=outputFile+'.bm25.ndjson',handle=await fsp.open(indexFile,'wx');
  try{await handle.write(JSON.stringify({format:'docmap-bm25-postings-v1',schemaVersion:1,releaseId:pin.releaseId,manifestSha256:pin.manifestSha256,corpusVersion:pin.corpusVersion,projectionVersion:r.projection_version,k1:1.5,b:.75,average:dbIndex.average,documents:corpus.passages.length,orderedEvidenceIdsSha256:U.hash(corpus.passages.map(p=>p.id)),searchImplementationSha256:await U.fileHash(path.join(runtime,'expert/search.cjs'))})+'\n');for(const [term,values]of dbIndex.postings)await handle.write(JSON.stringify({term,postings:Array.from(values)})+'\n');await handle.sync();}finally{await handle.close();}
  const lengthsFile=outputFile+'.lengths.u32',lengths=Buffer.alloc(dbIndex.lengths.length*4);for(let i=0;i<dbIndex.lengths.length;i++)lengths.writeUInt32LE(dbIndex.lengths[i],i*4);await fsp.writeFile(lengthsFile,lengths,{flag:'wx'});
  const bm25={format:'docmap-bm25-postings-v1',postings:{file:indexFile,sha256:await U.fileHash(indexFile)},lengths:{file:lengthsFile,sha256:await U.fileHash(lengthsFile),encoding:'uint32-le'},releaseId:pin.releaseId,manifestSha256:pin.manifestSha256,corpusVersion:pin.corpusVersion,projectionVersion:r.projection_version,safetySha256:r.safety_sha256};
  await db.query('insert into docmap_professional.derived_artifacts(release_id,kind,artifact_sha256,descriptor) values ($1,$2,$3,$4) on conflict do nothing',[pin.releaseId,'bm25-staging-diagnostic',U.hash(bm25),bm25]);
  // File inputs are proven byte-identical above. A second index on the exact
  // file inputs would mirror the implementation; compare score results using
  // the established common implementation and record deterministic score hashes.
  for(const q of queries.slice(0,3))dbIndex.search(q);
  const searches=queries.map(q=>{const t=performance.now(),hits=dbIndex.search(q);return {query:q,milliseconds:performance.now()-t,hits:hits.length,orderedScoresSha256:U.hash(hits),firstEvidenceIds:hits.slice(0,10).map(h=>corpus.passages[h.index].id)};});
  const sorted=searches.map(x=>x.milliseconds).sort((a,b)=>a-b),performanceResult={warmups:3,queries:searches.length,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1)};
  const report={releaseId:pin.releaseId,corpusVersion:pin.corpusVersion,manifestSha256:pin.manifestSha256,passed:true,outcomes,indexMs,bm25,searches,performance:performanceResult,totalMs:Date.now()-started,scope:'Staging transport and BM25 preparation parity; no semantic runtime, relevance or publication approval'};await require('node:fs/promises').writeFile(outputFile,JSON.stringify(report,null,2),{flag:'wx'});return report;
}
module.exports={comparePreparation};
