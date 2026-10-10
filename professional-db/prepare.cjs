'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),U=require('./util.cjs');
// Read bounded top-level metadata without assembling the large array values.
async function envelope(file,skip){const result={},seen=new Set(),decoder=new TextDecoder('utf-8',{fatal:true});let depth=0,string=false,escaped=false,state='root',key='',keyRaw='',value='',omit=false,keyRequired=false,started=false,arrayClosed=false,brackets=[];
  for await(const chunk of fs.createReadStream(file)){const text=decoder.decode(chunk,{stream:true});for(const c of text){
    if(state==='root'){if(/\s/.test(c))continue;if(c!=='{')throw Error('Object envelope required');depth=1;state='key';continue;}
    if(state==='done'){if(!/\s/.test(c))throw Error('Trailing envelope content');continue;}
    if(state==='key'){if(/\s/.test(c))continue;if(c==='}'&&!keyRequired){state='done';continue;}if(c!=='"')throw Error('Envelope key required');keyRaw='"';state='key-string';escaped=false;continue;}
    if(state==='key-string'){keyRaw+=c;if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='"'){key=JSON.parse(keyRaw);if(seen.has(key))throw Error('Duplicate envelope key');seen.add(key);state='colon';}if(keyRaw.length>500)throw Error('Envelope key limit');continue;}
    if(state==='colon'){if(/\s/.test(c))continue;if(c!==':')throw Error('Malformed envelope');state='value';value='';omit=skip.includes(key);string=false;escaped=false;started=false;arrayClosed=false;brackets=[];continue;}
    if(state==='value'){
      if(!string&&depth===1&&(c===','||c==='}')){if(!started)throw Error('Missing envelope value');result[key]=omit?null:JSON.parse(value.trim());state=c==='}'?'done':'key';keyRequired=c===',';continue;}
      if(!started){if(/\s/.test(c))continue;started=true;if(omit&&c!=='[')throw Error('Skipped envelope value must be an array');}
      if(arrayClosed&&!/\s/.test(c))throw Error('Missing envelope separator');
      if(!omit){value+=c;if(value.length>1024*1024)throw Error('Envelope metadata limit');}
      if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;}
      else if(c==='"')string=true;else if(c==='['||c==='{'){brackets.push(c);depth++;if(depth>40)throw Error('Envelope nesting limit');}else if(c===']'||c==='}'){if(brackets.pop()!==(c===']'?'[':'{'))throw Error('Mismatched envelope brackets');depth--;if(omit&&depth===1)arrayClosed=true;}
    }
  }}decoder.decode();if(state!=='done')throw Error('Incomplete envelope');return result;}
async function *lines(file){
  // NDJSON uses LF framing. Node25 readline also splits literal U+2028/U+2029,
  // which are valid JSON string content in the immutable source records.
  const decoder=new TextDecoder('utf-8',{fatal:true});let pending='',ordinal=0;
  for await(const chunk of fs.createReadStream(file)){pending+=decoder.decode(chunk,{stream:true});let cut;while((cut=pending.indexOf('\n'))>=0){const line=pending.slice(0,cut);pending=pending.slice(cut+1);if(Buffer.byteLength(line)>16*1024*1024)throw Error('Prepared record limit');let value;try{value=JSON.parse(line);}catch(e){throw Error('Invalid prepared record '+ordinal+' in '+path.basename(file),{cause:e});}ordinal++;yield value;}if(Buffer.byteLength(pending)>16*1024*1024)throw Error('Prepared record limit');}
  pending+=decoder.decode();if(pending.length)throw Error('Incomplete LF-framed preparation file');
}
async function prepare({binding,bindingSha256,manifest,replay,adapter,root,outputDir,privacy,provenance}){
  await fsp.mkdir(outputDir,{recursive:true});const rawFile=U.inside(root,manifest.baseline.path),packetFile=U.inside(root,manifest.repairs.path),rawMeta=await envelope(rawFile,['rows']),packetMeta=await envelope(packetFile,['patches','holds','suppressions']);
  if(Object.keys(rawMeta).some(k=>!['rows','readerVersion','fetchedAt'].includes(k))||rawMeta.readerVersion!==1)throw Error('Unsupported baseline envelope');U.date(rawMeta.fetchedAt);
  if(Object.keys(packetMeta).some(k=>!['schemaVersion','releaseId','baselineSha256','patches','holds','suppressions'].includes(k))||![1,2].includes(packetMeta.schemaVersion)||packetMeta.releaseId!==manifest.releaseId||packetMeta.baselineSha256!==manifest.baseline.sha256)throw Error('Unsupported repair envelope');
  const holds=[],suppressions=[];await U.eachArray(packetFile,'holds',async h=>holds.push(h));if(Object.hasOwn(packetMeta,'suppressions'))await U.eachArray(packetFile,'suppressions',async h=>suppressions.push(h));
  const required=new Set(adapter.MANDATORY_HOLDS),holdRows=new Map(),ids=new Set();let baselineCount=0;
  await U.eachArray(rawFile,'rows',async r=>{if(!r||!r.id||ids.has(r.id))throw Error('Duplicate/missing baseline identity');ids.add(r.id);baselineCount++;if(required.has(r.id))holdRows.set(r.id,r);});
  if(baselineCount!==replay.audit.inputRows||holdRows.size!==required.size)throw Error('Baseline population/holds mismatch');
  const index=new Map(),patchFile=path.join(outputDir,'patches.ndjson'),patchHandle=await fsp.open(patchFile,'wx');let offset=0,patchCount=0;const seen=new Set();
  try{await U.eachArray(packetFile,'patches',async p=>{if(!ids.has(p.sourceRecordId))throw Error('Unknown correction owner');const key=p.sourceRecordId+'|'+p.field;if(seen.has(key))throw Error('Duplicate correction proposal');seen.add(key);if(p.field==='professional_context')for(const c of p.value)provenance(c.provenance);else provenance(p.provenance);const bytes=Buffer.from(JSON.stringify(p)+'\n');if(bytes.length>8*1024*1024)throw Error('Correction record limit');if(!index.has(p.sourceRecordId))index.set(p.sourceRecordId,[]);index.get(p.sourceRecordId).push({offset,length:bytes.length});await patchHandle.write(bytes,0,bytes.length,offset);offset+=bytes.length;patchCount++;});await patchHandle.sync();}finally{await patchHandle.close();}
  const suppressById=new Map();for(const s of suppressions){if(!ids.has(s.sourceRecordId))throw Error('Unknown exclusion owner');if(!suppressById.has(s.sourceRecordId))suppressById.set(s.sourceRecordId,[]);suppressById.get(s.sourceRecordId).push(s);}
  const preparedFile=path.join(outputDir,'records.ndjson'),out=await fsp.open(preparedFile,'wx'),input=await fsp.open(patchFile,'r');let batch=[],count=0,contexts=0;const changed=new Set([...index.keys(),...suppressById.keys(),...holds.map(h=>h.sourceRecordId)]);
  async function flush(){if(!batch.length)return;const patches=[];for(const row of batch)for(const entry of index.get(row.value.id)||[]){const bytes=Buffer.alloc(entry.length);await input.read(bytes,0,bytes.length,entry.offset);patches.push(JSON.parse(bytes.toString('utf8')));}const targetIds=new Set(batch.map(x=>x.value.id)),batchRows=[...batch.map(x=>x.value),...[...holdRows].filter(([id])=>!targetIds.has(id)).map(([,r])=>r)],packet={schemaVersion:packetMeta.schemaVersion,releaseId:packetMeta.releaseId,baselineSha256:packetMeta.baselineSha256,patches,holds,...(packetMeta.schemaVersion===2?{suppressions:batch.flatMap(x=>suppressById.get(x.value.id)||[])}:{})};const applied=adapter.applyRepairs(batchRows,packet,{baselineSha256:manifest.baseline.sha256,releaseId:manifest.releaseId});
    for(let n=0;n<batch.length;n++){const original=batch[n].value,prior=privacy(original),projected=privacy(applied.rows[n]);await out.write(JSON.stringify({ordinal:batch[n].ordinal,recordId:original.id,originalSha256:U.hash(original),original:prior.row,projected:projected.row,projectedSha256:U.hash(projected.row),privacyOmissions:projected.omitted})+'\n');count++;}
    for(const p of patches)if(p.field==='professional_context')contexts+=p.value.length;batch=[];
  }
  try{await U.eachArray(rawFile,'rows',async(value,ordinal)=>{batch.push({value,ordinal});if(batch.length>=50)await flush();});await flush();await out.sync();}finally{await out.close();await input.close();}
  if(count!==baselineCount||patchCount!==replay.adapter.patches||suppressions.length!==replay.adapter.suppressedFields||U.hash(holds.map(h=>h.sourceRecordId).sort())!==U.hash([...required].sort())||changed.size!==replay.adapter.changedRows)throw Error('Prepared safety/population accounting mismatch');
  const receipt={records:count,patches:patchCount,contexts,holds:holds.length,exclusions:suppressions.length,recordArtifactSha256:await U.fileHash(preparedFile),patchArtifactSha256:await U.fileHash(patchFile),bindingSha256};
  await fsp.writeFile(path.join(outputDir,'preparation-receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});return {preparedFile,patchFile,holds,suppressions,safetySha256:U.hash({holds,suppressions}),receipt};
}
module.exports={envelope,lines,prepare};
