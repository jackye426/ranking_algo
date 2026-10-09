'use strict';
// Offline bounded conversion. Uses the already-installed stream-json audit dependency.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {parser}=require('stream-json'),{pick}=require('stream-json/filters/Pick'),{streamValues}=require('stream-json/streamers/StreamValues');
const ARRAY_FIELDS=['candidates','passages','identityLedger'],META_FIELDS=['audit','version'],sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function segmentCorpus(reportFile,output,{limitBytes=16*1024*1024}={}){
 if(!path.isAbsolute(reportFile||'')||!path.isAbsolute(output||'')||!Number.isInteger(limitBytes)||limitBytes<256||limitBytes>32*1024*1024)throw Error('Absolute input/new output and bounded segment size required');
 try{if((await fsp.readdir(output)).length)throw Error('Segment output must be new or empty');}catch(e){if(e.code!=='ENOENT')throw e;}
 const report=JSON.parse(await fsp.readFile(reportFile,'utf8')),artifact=report.corpusExports?.release;if(report.passed!==true||!artifact||path.basename(artifact.file)!==artifact.file)throw Error('A passed replay and its bounded release export are required');
 const input=path.join(path.dirname(reportFile),artifact.file),sourceHash=crypto.createHash('sha256'),fingerprint=crypto.createHash('sha256'),fields=Object.fromEntries(ARRAY_FIELDS.map(key=>[key,{count:0,segments:[]}])),metadata={},pending=[];let bytes=0,active=null,parts=[],partBytes=2;
 await fsp.mkdir(output,{recursive:true});
 async function flush(){if(!parts.length)return;const text='['+parts.join(',')+']',file=active+'-'+String(fields[active].segments.length+1).padStart(4,'0')+'.json';await fsp.writeFile(path.join(output,file),text,{flag:'wx'});fields[active].segments.push({file,sha256:sha(text),bytes:Buffer.byteLength(text),count:parts.length});parts=[];partBytes=2;}
 const checksum=new Transform({transform(chunk,encoding,callback){sourceHash.update(chunk);bytes+=chunk.length;callback(null,chunk);}});
 const selected=pick({filter:(stack,token)=>{
  if(stack.length===1&&!ARRAY_FIELDS.includes(stack[0])&&!META_FIELDS.includes(stack[0]))throw Error('Unexpected top-level corpus field');
  const wanted=stack.length===2&&ARRAY_FIELDS.includes(stack[0])&&typeof stack[1]==='number'||stack.length===1&&META_FIELDS.includes(stack[0]);if(wanted)pending.push(stack[0]);return wanted;
 }});
 await pipeline(fs.createReadStream(input),checksum,parser({streamKeys:false,streamStrings:false,streamNumbers:false}),selected,streamValues(),async source=>{
  for await(const {value} of source){const key=pending.shift();if(!key)throw Error('Corpus stream lost field ownership');if(META_FIELDS.includes(key)){if(Object.hasOwn(metadata,key))throw Error('Duplicate corpus metadata');metadata[key]=value;continue;}if(active!==key){await flush();active=key;}const text=JSON.stringify(value),size=Buffer.byteLength(text);if(size+2>limitBytes)throw Error('One corpus record exceeds the segment limit');if(parts.length&&partBytes+size+1>limitBytes)await flush();parts.push(text);partBytes+=size+(parts.length>1?1:0);fields[key].count++;if(key==='candidates'||key==='passages')fingerprint.update(text);}
 });
 await flush();const actualSha=sourceHash.digest('hex'),logicalFingerprint=fingerprint.digest('hex');
 if(pending.length||bytes!==artifact.bytes||actualSha!==artifact.sha256||metadata.version!==report.release.corpusVersion||!metadata.version.endsWith('-'+logicalFingerprint.slice(0,20))||fields.candidates.count!==metadata.audit?.candidates||fields.passages.count!==metadata.audit?.passages||fields.identityLedger.count!==metadata.audit?.inputRows)throw Error('Segment source checksum, version, fingerprint or counts failed');
 const manifest={schemaVersion:1,format:'expert-corpus-array-segments-v1',sourceCorpusSha256:actualSha,sourceCorpusBytes:bytes,sourceReplaySha256:sha(await fsp.readFile(reportFile)),logicalFingerprint,maxSegmentBytes:limitBytes,fields,metadata};await fsp.writeFile(path.join(output,'segments-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});return manifest;
}
if(require.main===module)segmentCorpus(...process.argv.slice(2)).then(m=>console.log(JSON.stringify({format:m.format,sourceCorpusSha256:m.sourceCorpusSha256,version:m.metadata.version,counts:Object.fromEntries(Object.entries(m.fields).map(([key,value])=>[key,value.count])),segments:Object.values(m.fields).reduce((n,v)=>n+v.segments.length,0)}))).catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={segmentCorpus};
