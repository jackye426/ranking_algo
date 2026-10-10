'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),U=require('../util.cjs');
const app=process.env.DOCMAP_TEST_RUNTIME_DIR;if(!path.isAbsolute(app||''))throw Error('Set DOCMAP_TEST_RUNTIME_DIR to the supplied immutable expert runtime');const adapter=require(path.join(app,'expert/releases.cjs'));
async function fixture(root,releaseId,{wording='CT and MR reporting.',duplicate=false}={}){
  const runtimeDir=path.join(root,'runtime');await fs.mkdir(runtimeDir,{recursive:true});const files=[];
  for(const file of adapter.REQUIRED_RUNTIME_FILES){const target=path.join(runtimeDir,file);await fs.mkdir(path.dirname(target),{recursive:true});const bytes=await fs.readFile(path.join(app,file));await fs.writeFile(target,bytes);files.push({file,sha256:U.sha(bytes),bytes:bytes.length});}
  const runtimeFile=path.join(runtimeDir,'deployment-manifest.json');await fs.writeFile(runtimeFile,JSON.stringify({files}));
  const dir=path.join(root,releaseId);await fs.mkdir(path.join(dir,'baseline'),{recursive:true});
  const rows=[...adapter.MANDATORY_HOLDS.map((id,i)=>({id,name:'Held Fixture '+i,specialty:'Physiotherapy',about:'Unsafe mixed biography',do_not_recommend:i===0})),
    {id:'fixture_ct',name:'Dr Alice Example',gmc_number:'1234567',specialty:'Radiology',about:wording,clinical_interests:'I do not perform cyst or lipoma procedures.',qualifications:['MD, 2008'],sources:['Bupa'],merge_date:'2026-01-01',email:'private@example.test'},
    {id:'fixture_physio',name:'Jane Example',hcpc_number:'PH123456',specialty:'Physiotherapy',about:'Upper limb rehabilitation.',sources:['Circle']},
    {id:'fixture_sparse',name:'Dr Sparse Example',gmc_number:'1234568',specialty:'Radiology',about:null},
    {id:'fixture_multiple',name:'Dr Bob Example',gmc_number:'1234569',specialty:'Radiology',about:'CT reporting.',about_alternatives:{nuffield:'CT reporting.'},sources:['Bupa','Nuffield']},
    {id:'fixture_conflict_a',name:'Dr Alan Example',gmc_number:'1234570',specialty:'Radiology',about:'CT reporting.'},
    {id:'fixture_conflict_b',name:'Dr Other Person',gmc_number:'1234570',hcpc_number:'PH999999',specialty:'Physiotherapy',about:'Hand rehabilitation.'}
  ];
  const raw={rows,readerVersion:1,fetchedAt:'2026-10-09T12:00:00Z'},rawFile=path.join(dir,'baseline/raw.json');await fs.writeFile(rawFile,JSON.stringify(raw));const baselineSha256=await U.fileHash(rawFile);
  const provenance={sourceUrl:'https://www.finder.bupa.co.uk/Consultant/view/12345/',sourceLabel:'Bupa fixture',sourceDate:null,observedAt:null,snapshotSha256:U.hash('original source bytes'),parserVersion:'fixture-parser-v1',reviewId:'fixture-approved-source-boundary',sourceField:'procedures'};
  const packet={schemaVersion:2,releaseId,baselineSha256,patches:[{sourceRecordId:'fixture_ct',field:'professional_context',beforeHash:U.hash(undefined),approved:true,value:[{kind:'reported-activity',text:'Reported CT procedures: <=7, reporting period not supplied.',provenance,activity:{procedureName:'CT',reportedRange:'<=7',period:null,reportedAdmissions:null}},{kind:'qualification',text:'MD 2008; qualification source date unknown.',provenance:{...provenance,sourceField:'qualifications'}}]}],holds:adapter.MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Synthetic identity hold'})),suppressions:[{sourceRecordId:adapter.MANDATORY_HOLDS[0],field:'about',beforeHash:U.hash('Unsafe mixed biography'),reason:'Wrong owner',reviewId:'fixture-exclusion',sourceEvidence:[{snapshotSha256:U.hash('mixed'),sourceField:'about',sourceRecordId:adapter.MANDATORY_HOLDS[0]}],approved:true}]};
  if(duplicate)packet.patches.push(packet.patches[0]);
  const repairsFile=path.join(dir,'repairs.json');await fs.writeFile(repairsFile,JSON.stringify(packet));
  const manifest={schemaVersion:2,releaseId,projectionVersion:'expert-repair-v2',baseline:{path:'baseline/raw.json',sha256:baselineSha256},repairs:{path:'repairs.json',sha256:await U.fileHash(repairsFile)},runtimeManifestSha256:await U.fileHash(runtimeFile)};
  const manifestPath=path.join(dir,'manifest.json');await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2));
  const validPacket=duplicate?{...packet,patches:packet.patches.slice(0,1)}:packet;
  const applied=adapter.applyRepairs(rows,validPacket,{baselineSha256,releaseId});
  const corpus=require(path.join(app,'expert/data.cjs')).buildCorpus(applied.rows,{identityReviews:[],enrichments:[]});
  const corpusPath=path.join(dir,'corpus.json');await fs.writeFile(corpusPath,JSON.stringify(corpus));
  const replay={passed:true,releaseId,baselineSha256,adapter:applied.summary,corpusVersion:corpus.version,audit:corpus.audit,corpusArtifact:{sha256:await U.fileHash(corpusPath)}};
  const replayPath=path.join(dir,'replay.json');await fs.writeFile(replayPath,JSON.stringify(replay));
  const binding={schemaVersion:1,format:'docmap-db-binding-v1',releaseId,manifestPath,manifestSha256:await U.fileHash(manifestPath),runtimeDir,corpusPath,corpusSha256:await U.fileHash(corpusPath),corpusVersion:corpus.version,replayPath,replaySha256:await U.fileHash(replayPath)};
  const bindingFile=path.join(dir,'binding.json');await fs.writeFile(bindingFile,JSON.stringify(binding,null,2));
  return {bindingFile,bindingSha256:await U.fileHash(bindingFile),binding,packet,manifest,corpus,rows,dir,pin:{releaseId,manifestSha256:binding.manifestSha256,bindingSha256:await U.fileHash(bindingFile),corpusVersion:corpus.version}};
}
module.exports={fixture};
