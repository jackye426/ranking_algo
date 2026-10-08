'use strict';
// Offline packaging only. Source files are read, never overwritten or fetched.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {VERSION,MANDATORY_HOLDS,loadDataRelease}=require('../releases.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function validateFrozenCode(baselineDir,baselineCode,frozen){
 const files={};
 for(const name of ['identity-reviews.cjs','enrichments.cjs','data.cjs']){
  const expected=frozen.files?.find(f=>f.name===name)?.sha256,source=await fs.readFile(path.join(baselineDir,name)),committed=await fs.readFile(path.join(baselineCode,'expert',name));
  if(!expected||hash(source)!==expected)throw Error('Frozen source code checksum mismatch: '+name);
  const byteIdentical=hash(committed)===expected,normalizedEqual=source.toString('utf8').replace(/\r\n/g,'\n')===committed.toString('utf8').replace(/\r\n/g,'\n');
  if(name==='data.cjs'?!normalizedEqual:!byteIdentical)throw Error('Frozen code differs from committed baseline: '+name);
  if(name!=='data.cjs'&&hash(await fs.readFile(path.join(__dirname,'..',name)))!==expected)throw Error('Runtime identity reviews or enrichments changed');
  files[name]={frozenSha256:expected,committedSha256:hash(committed),byteIdentical,normalizedLineEndingsEqual:normalizedEqual};
 }
 return {replayUses:'frozen baseline code',committedReference:frozen.codeCommit,files};
}
async function buildPackage({baselineDir,baselineCode,output,releaseId,repairsFile}){
 if([baselineDir,baselineCode,output].some(p=>!p||!path.isAbsolute(p)))throw Error('Use absolute baseline, baseline-code and new output directories');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(releaseId||''))throw Error('Invalid release ID');
 try{if((await fs.readdir(output)).length)throw Error('Release output must be new or empty');}catch(e){if(e.code!=='ENOENT')throw e;}
 const frozen=JSON.parse(await fs.readFile(path.join(baselineDir,'baseline-manifest.json'),'utf8')),raw=await fs.readFile(path.join(baselineDir,'raw.json'));
 if(frozen.schemaVersion!==1||frozen.rawSha256!==hash(raw)||!frozen.fetchedAt||!frozen.createdAt||!String(frozen.codeCommit||'').startsWith('f9f4'))throw Error('Frozen baseline manifest, checksum or committed-code reference mismatch');
 const codeProof=await validateFrozenCode(baselineDir,baselineCode,frozen),pinned=Object.fromEntries(Object.entries(codeProof.files).map(([name,proof])=>[name,proof.frozenSha256]));
 let packet=repairsFile?JSON.parse(await fs.readFile(repairsFile,'utf8')):{schemaVersion:1,releaseId,baselineSha256:frozen.rawSha256,patches:[],holds:MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Unresolved current provider identity conflict; preserve all existing exclusions and withhold this group pending reconciliation.'}))};
 if(packet.releaseId!==releaseId||packet.baselineSha256!==frozen.rawSha256)throw Error('Repair packet belongs to another release or baseline');
 const patchBytes=JSON.stringify(packet,null,2),manifest={schemaVersion:1,releaseId,projectionVersion:VERSION,baseline:{path:'baseline/raw.json',sha256:frozen.rawSha256},repairs:{path:'repairs.json',sha256:hash(patchBytes)},identityReviewsSha256:pinned['identity-reviews.cjs'],enrichmentsSha256:pinned['enrichments.cjs']};
 await fs.mkdir(path.join(output,'baseline'),{recursive:true});await fs.writeFile(path.join(output,'baseline','raw.json'),raw,{flag:'wx'});await fs.writeFile(path.join(output,'repairs.json'),patchBytes,{flag:'wx'});await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 const loaded=await loadDataRelease(path.join(output,'manifest.json'),{cacheDir:path.join(output,'cache',releaseId)});
 const summary={schemaVersion:1,createdAt:new Date().toISOString(),releaseId,baselineFetchedAt:frozen.fetchedAt,baselineCodeCommit:frozen.codeCommit,codeProof,sourceRows:loaded.rows.length,dataRelease:loaded.dataRelease};
 await fs.writeFile(path.join(output,'package-summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});return summary;
}
if(require.main===module){const [baselineDir,baselineCode,output,releaseId,repairsFile]=process.argv.slice(2);buildPackage({baselineDir,baselineCode,output,releaseId,repairsFile}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={buildPackage,validateFrozenCode};
