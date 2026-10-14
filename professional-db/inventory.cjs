'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),U=require('./util.cjs');
async function inventory(root,output){
  if(!path.isAbsolute(root)||!path.isAbsolute(output))throw Error('Absolute inventory paths required');await fs.mkdir(output,{recursive:true});
  const roots=[path.join(root,'repair-private','releases'),path.join(root,'enriched-private','final-packages-v17'),path.join(root,'enriched-private','final-packages-v19')],items=[];
  for(const parent of roots){let dirs=[];try{dirs=await fs.readdir(parent,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const d of dirs.filter(x=>x.isDirectory())){const mp=path.join(parent,d.name,'manifest.json');let m;try{m=await U.json(mp);}catch(e){if(e.code==='ENOENT')continue;throw e;}
      const hashes={manifest:await U.fileHash(mp)},verified=[];for(const key of ['baseline','repairs','cacheManifest','runtimeDependencyManifest'])if(m[key]){const file=U.inside(path.dirname(mp),m[key].path);hashes[key]=await U.fileHash(file);verified.push(hashes[key]===m[key].sha256);}
      const counts={sourceRows:0,baselineExclusions:0,holds:0,fieldExclusions:0,patches:0,contextItems:0},packetFile=U.inside(path.dirname(mp),m.repairs.path);
      await U.eachArray(U.inside(path.dirname(mp),m.baseline.path),'rows',async r=>{counts.sourceRows++;if(r.do_not_recommend===true)counts.baselineExclusions++;});
      await U.eachArray(packetFile,'patches',async p=>{counts.patches++;if(p.field==='professional_context')counts.contextItems+=p.value.length;});
      await U.eachArray(packetFile,'holds',async()=>counts.holds++);if(m.schemaVersion===2)await U.eachArray(packetFile,'suppressions',async()=>counts.fieldExclusions++);
      items.push({releaseId:m.releaseId,manifestPath:mp,hashes,allArtifactHashesMatch:verified.every(Boolean),schemaVersion:m.schemaVersion,projectionVersion:m.projectionVersion,...counts,approvalStatus:m.releaseId.startsWith('context-r2')?'withheld-retrieval-regression':m.releaseId.endsWith('-v4')?'staged-source-reviewed-not-product-approved':m.releaseId.endsWith('-v2')?'historical-preview-receipt-only-superseded-safety-policy':'superseded-do-not-select',approvalLink:'Historical checkpoint and retained repair/RELEASE-ROLLBACK.md; no exact current product approval receipt supplied'});
    }
  }
  const bindings=[];for(const name of ['enriched-r3-20261009-v4','safe-r1-20261009-v4']){
    const item=items.find(x=>x.releaseId===name&&x.manifestPath.includes('final-packages-v19'));if(!item)throw Error('Missing current immutable package');
    const replayDir=path.join(root,'enriched-private','replay',name.startsWith('enriched')?'r3-v19':'safe-r1-v19'),replayPath=path.join(replayDir,'replay-report.json'),r=await U.json(replayPath),corpusPath=path.join(replayDir,'corpus.json');
    const binding={schemaVersion:1,format:'docmap-db-binding-v1',releaseId:name,manifestPath:item.manifestPath,manifestSha256:item.hashes.manifest,corpusPath,corpusSha256:r.corpusArtifact.sha256,corpusVersion:r.corpusVersion,replayPath,replaySha256:await U.fileHash(replayPath),runtimeDir:path.join(root,'enriched-private','app-stage-final-v4'),approvalStatus:'staged-unapproved'};
    await U.verify(corpusPath,binding.corpusSha256);const file=path.join(output,name+'.binding.json');await fs.writeFile(file,JSON.stringify(binding,null,2),{flag:'wx'});bindings.push({releaseId:name,bindingFile:file,bindingSha256:await U.fileHash(file),corpusVersion:r.corpusVersion,corpusSha256:binding.corpusSha256,counts:r.audit});
  }
  const result={createdAt:new Date().toISOString(),sharedSchema:{project:'oewczjseteyvyvikxxaz',table:'public.integrated_practitioners',readOnlyObservedRows:40876,readOnlyObservedExclusions:32},items,bindings};await fs.writeFile(path.join(output,'inventory.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
}
if(require.main===module)inventory(...process.argv.slice(2)).then(x=>console.log(JSON.stringify({packages:x.items.length,bindings:x.bindings}))).catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={inventory};
