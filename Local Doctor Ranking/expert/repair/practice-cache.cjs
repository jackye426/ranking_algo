'use strict';
// Offline-only preparation helper. Accepts checksum-verified corpus segments,
// leaves original corpus/source rows unchanged and writes one new snapshot.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {createPracticeSnapshot}=require('../practice-cache.cjs'),{createExpertGeoService}=require('../geo.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function loadPracticeCorpus(file){
 const descriptor=JSON.parse(await fs.readFile(file,'utf8'));
 if(descriptor.format!=='expert-corpus-array-segments-v1'||!descriptor.metadata?.version||!Array.isArray(descriptor.fields?.candidates?.segments)||descriptor.fields.candidates.segments.length>1000||!Number.isSafeInteger(descriptor.fields.candidates.count)||descriptor.fields.candidates.count>100000)throw Error('Verified bounded corpus segments required');
 const candidates=[],root=path.dirname(file);
 const seen=new Set();
 for(const part of descriptor.fields.candidates.segments){if(!/^[a-z]+-\d{4}\.json$/.test(part.file)||seen.has(part.file)||!/^[a-f0-9]{64}$/.test(part.sha256)||!Number.isSafeInteger(part.bytes)||part.bytes<2||part.bytes>32*1024*1024||!Number.isSafeInteger(part.count)||part.count<1||candidates.length+part.count>descriptor.fields.candidates.count)throw Error('Invalid candidate segment');seen.add(part.file);const file=path.join(root,part.file);if((await fs.stat(file)).size!==part.bytes)throw Error('Candidate segment byte count mismatch');const bytes=await fs.readFile(file);if(sha(bytes)!==part.sha256)throw Error('Candidate segment checksum mismatch');const rows=JSON.parse(bytes);if(!Array.isArray(rows)||rows.length!==part.count)throw Error('Candidate segment count mismatch');candidates.push(...rows);}
 if(candidates.length!==descriptor.fields.candidates.count||candidates.length!==descriptor.metadata.audit.candidates)throw Error('Incomplete candidate corpus');return {version:descriptor.metadata.version,candidates};
}
async function prepare({segmentsManifest,releaseId,geoCacheFile,output}){
 if([segmentsManifest,geoCacheFile,output].some(p=>!path.isAbsolute(p||'')))throw Error('Use absolute artifact paths');
 try{await fs.stat(output);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 const corpus=await loadPracticeCorpus(segmentsManifest),snapshot=await createPracticeSnapshot(corpus,{releaseId,geo:createExpertGeoService({cacheFile:geoCacheFile})});await fs.writeFile(output,JSON.stringify(snapshot),{flag:'wx'});return {releaseId,corpusVersion:snapshot.corpusVersion,practiceFingerprint:snapshot.practiceFingerprint,coverage:snapshot.coverage,sha256:sha(await fs.readFile(output))};
}
if(require.main===module){const [segmentsManifest,releaseId,geoCacheFile,output]=process.argv.slice(2);prepare({segmentsManifest,releaseId,geoCacheFile,output}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={loadPracticeCorpus,prepare};
