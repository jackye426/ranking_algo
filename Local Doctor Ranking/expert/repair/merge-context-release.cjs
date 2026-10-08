'use strict';
// Offline proposal merge. Never replaces an existing release or source file.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {hashValue,MANDATORY_HOLDS}=require('../releases.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function merge(packet,proposals,releaseId){
 const patches=[...packet.patches],contexts=new Map(),seenSources=new Set(),outcomes=[];
 for(const proposal of proposals){
  if(proposal.baselineSha256!==packet.baselineSha256||!Array.isArray(proposal.patches))throw Error('Context proposal baseline mismatch');
  for(const patch of proposal.patches){
   if(patch.field!=='professional_context'||patch.approved!==true||patch.beforeHash!==hashValue(null)||!Array.isArray(patch.value)||!patch.value.length||MANDATORY_HOLDS.includes(patch.sourceRecordId))throw Error('Unapproved, occupied or held context target');
   const entries=contexts.get(patch.sourceRecordId)||[];
   for(const item of patch.value){
    const key=patch.sourceRecordId+'|'+hashValue(item);
    if(seenSources.has(key)){outcomes.push({sourceRecordId:patch.sourceRecordId,outcome:'identical-context-proposal-deduplicated'});continue;}
    seenSources.add(key);entries.push(item);
   }
   contexts.set(patch.sourceRecordId,entries);
  }
 }
 let additions=0,rows=0;
 for(const [sourceRecordId,value]of contexts){
  if(patches.some(p=>p.sourceRecordId===sourceRecordId&&p.field==='professional_context'))throw Error('Base release already has context; explicit reconciliation required');
  if(value.length>100){outcomes.push({sourceRecordId,outcome:'withheld-combined-context-limit',items:value.length});continue;}
  patches.push({sourceRecordId,field:'professional_context',beforeHash:hashValue(null),value,approved:true});rows++;additions+=value.length;
 }
 return {packet:{...packet,releaseId,patches},report:{sourceBoundContextItems:additions,contextRows:rows,existingTextPatches:packet.patches.length,changesNotClaimedAsNovelFacts:true,outcomes}};
}
if(require.main===module){
 const [baseFile,releaseId,outDir,...files]=process.argv.slice(2);
 if(!baseFile||!releaseId||!outDir||!files.length||!path.isAbsolute(outDir)||fs.existsSync(outDir))throw Error('Supply packet, release ID, new absolute output directory and proposal files');
 const packet=JSON.parse(fs.readFileSync(baseFile,'utf8')),inputs=files.map(file=>({file,bytes:fs.readFileSync(file)}));
 const result=merge(packet,inputs.map(x=>JSON.parse(x.bytes)),releaseId);
 fs.mkdirSync(outDir,{recursive:true});
 fs.writeFileSync(path.join(outDir,'repairs.json'),JSON.stringify(result.packet));
 fs.writeFileSync(path.join(outDir,'merge-report.json'),JSON.stringify({...result.report,baselineSha256:packet.baselineSha256,inputs:inputs.map(x=>({file:path.basename(path.dirname(x.file))+'/'+path.basename(x.file),sha256:hash(x.bytes)}))},null,2));
 console.log(JSON.stringify({releaseId,...result.report}));
}
module.exports={merge};
