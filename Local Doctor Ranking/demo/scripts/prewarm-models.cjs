'use strict';

// Download and validate only the two public CPU models used by the demo.
// Intentionally imports no data source and never reads dotenv or credentials.
const fs=require('node:fs/promises');
const path=require('node:path');
const {embed,getEmbedder,getGenerator,EMBEDDING_MODEL,GENERATION_MODEL}=require('../models.cjs');

async function bytesIn(directory) {
  let bytes=0;
  for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const child=path.join(directory,entry.name);
    if(entry.isDirectory()) bytes+=await bytesIn(child);
    else if(entry.isFile()) bytes+=(await fs.stat(child)).size;
  }
  return bytes;
}

async function main() {
  console.log(`[DocMap build] Preparing ${EMBEDDING_MODEL} (q8, CPU).`);
  const vectors=await embed(['Public model warm-up for consultant search.']);
  if(vectors.length!==1||vectors[0].length!==384||!vectors[0].every(Number.isFinite)) {
    throw new Error('Embedding model did not produce a finite 384-dimensional vector.');
  }
  const norm=Math.hypot(...vectors[0]);
  if(Math.abs(norm-1)>0.001) throw new Error('Embedding model normalization check failed.');
  await (await getEmbedder()).dispose();

  console.log(`[DocMap build] Preparing ${GENERATION_MODEL} (q8, CPU).`);
  const generator=await getGenerator();
  const result=await generator('Read the word ready. Answer with that word.',{max_new_tokens:3,do_sample:false});
  if(!Array.isArray(result)||typeof result[0]?.generated_text!=='string'||!result[0].generated_text.trim()) {
    throw new Error('Generation model did not produce text.');
  }
  await generator.dispose();
  const modelBytes=await bytesIn(path.resolve(__dirname,'../.cache/models'));
  console.log(JSON.stringify({modelsReady:true,embeddingDimensions:384,modelBytes,peakRssKiB:process.resourceUsage().maxRSS}));
}

main().catch(error=>{
  console.error('[DocMap build] Model preparation failed:',error.message);
  process.exitCode=1;
});
