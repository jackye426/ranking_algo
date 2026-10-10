'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const U=require('./util.cjs'),P=require('./prepare.cjs');
const ALLOWED=new Set('id name title first_name last_name name_alternatives gmc_number hcpc_number gdc_number nmc_number specialty specialties specialty_source specialty_alternatives about about_source about_alternatives clinical_interests areas_of_interest research_interests nhs_base nhs_posts qualifications detailed_qualifications professional_memberships publications procedures procedures_completed procedure_volumes_phin profile_urls urls locations languages sources merge_date requires_review do_not_recommend blacklisted professional_context professional_role role professional_experience isrctn_trials trials teaching_interests _expertEvidenceExclusions'.split(' '));
const PRIVATE=/^(?:raw|email.*|.*_email|phone.*|.*_phone|contact_phone.*|contact_info.*|contact_info_spire|booking.*|fees.*|patient_satisfaction.*|patient_notes?|private_notes?|password|token|secret|api_key)$/i;
function privacy(row){const omitted=[];function clean(v,at){if(Array.isArray(v))return v.map((x,i)=>clean(x,at+'.'+i));if(v&&typeof v==='object'){const o={};for(const [k,x]of Object.entries(v)){if(PRIVATE.test(k)){omitted.push(at+'.'+k);continue;}o[k]=clean(x,at+'.'+k);}return o;}return v;}const o={};for(const[k,v]of Object.entries(row)){if(!ALLOWED.has(k)){omitted.push(k);continue;}o[k]=clean(v,k);}return {row:o,omitted};}
function provenance(v){if(!v||typeof v!=='object')throw Error('Missing source provenance');U.safeUrl(v.sourceUrl);U.date(v.sourceDate);U.date(v.observedAt);if(!/^[a-f0-9]{64}$/.test(v.snapshotSha256||'')||!v.reviewId||!v.sourceLabel||!v.parserVersion)throw Error('Unbound correction provenance');}
async function preflight(bindingFile,bindingSha256,{prepareRecords=true,outputDir}={}){
  await U.verify(bindingFile,bindingSha256);const binding=await U.json(bindingFile);
  if(binding.schemaVersion!==1||binding.format!=='docmap-db-binding-v1')throw Error('Unsupported database binding');
  if(binding.profileVersion!==undefined&&!['expert-profile-v1','expert-profile-v2','expert-profile-v3'].includes(binding.profileVersion)||!/^expert-corpus-v[23]-[a-f0-9]{20}$/.test(binding.corpusVersion))throw Error('Unsupported corpus/profile projection');
  await U.verify(binding.manifestPath,binding.manifestSha256);const manifest=await U.json(binding.manifestPath),root=path.dirname(binding.manifestPath);
  if(![1,2].includes(manifest.schemaVersion)||!['expert-repair-v1','expert-repair-v2'].includes(manifest.projectionVersion)||manifest.releaseId!==binding.releaseId)throw Error('Unsupported package schema/projection');
  for(const k of ['baseline','repairs','cacheManifest','runtimeDependencyManifest'])if(manifest[k])await U.verify(U.inside(root,manifest[k].path),manifest[k].sha256);
  await U.verify(binding.corpusPath,binding.corpusSha256);await U.verify(binding.replayPath,binding.replaySha256);
  const replay=await U.json(binding.replayPath),runtime=await U.json(path.join(binding.runtimeDir,'deployment-manifest.json'));
  await U.verify(path.join(binding.runtimeDir,'deployment-manifest.json'),manifest.runtimeManifestSha256);
  const runtimeFiles=new Set();for(const item of runtime.files){if(runtimeFiles.has(item.file))throw Error('Duplicate runtime file');runtimeFiles.add(item.file);await U.verify(U.inside(binding.runtimeDir,item.file),item.sha256);}
  const adapter=require(path.join(binding.runtimeDir,'expert','releases.cjs'));
  for(const file of adapter.REQUIRED_RUNTIME_FILES)if(!runtimeFiles.has(file))throw Error('Incomplete frozen runtime');
  if(replay.passed!==true||replay.releaseId!==manifest.releaseId||replay.baselineSha256!==manifest.baseline.sha256||replay.corpusVersion!==binding.corpusVersion||replay.corpusArtifact?.sha256!==binding.corpusSha256)throw Error('Corpus replay binding mismatch');
  const corpusHeader=await P.envelope(binding.corpusPath,['candidates','passages','identityLedger']);
  if(Object.keys(corpusHeader).some(k=>!['candidates','passages','identityLedger','audit','version'].includes(k))||corpusHeader.version!==binding.corpusVersion||U.hash(corpusHeader.audit)!==U.hash(replay.audit))throw Error('Corpus envelope/version/audit mismatch');
  for(const [name,sum]of Object.entries(replay.runtimeCodeHashes||{}))await U.verify(path.join(binding.runtimeDir,'expert',name),sum);
  if(U.hash(adapter.MANDATORY_HOLDS)!==U.hash(replay.adapter.mandatoryHolds))throw Error('Safety decision parity failed');
  const checked={binding,bindingSha256,manifest,replay,adapter,root};
  if(prepareRecords)checked.prepared=await prepareInputs(checked,outputDir);
  return checked;
}
async function prepareInputs(checked,outputDir){
  // All decisions for a source owner are kept in one batch. The frozen adapter
  // enforces fields, before hashes, ownership, conflicts and mandatory holds.
  outputDir=outputDir||path.join(__dirname,'.private','preflight-'+crypto.randomUUID());
  const prepared=await P.prepare({...checked,outputDir,privacy,provenance});
  for(const k of ['baseline','repairs'])await U.verify(U.inside(checked.root,checked.manifest[k].path),checked.manifest[k].sha256);
  return prepared;
}
async function importRelease(db,{bindingFile,bindingSha256,reportFile,onProgress=()=>{},failAfter=null}){
  const checked=await preflight(bindingFile,bindingSha256,{prepareRecords:false});const {binding,manifest,replay}=checked,rid=manifest.releaseId,started=Date.now();
  const old=(await db.query('select * from docmap_professional.releases where release_id=$1',[rid])).rows[0];
  if(old){if(old.manifest_sha256!==binding.manifestSha256||old.binding_sha256!==bindingSha256||old.corpus_sha256!==binding.corpusSha256)throw Error('Release ID is already bound to different immutable bytes');return {releaseId:rid,idempotent:true,reconciliationSha256:old.reconciliation_sha256};}
  if(!reportFile||!path.isAbsolute(reportFile))throw Error('Private complete reconciliation report path required');
  const prepared=await prepareInputs(checked,path.join(path.dirname(reportFile),'prepared-'+rid+'-'+crypto.randomUUID())),{safetySha256}=prepared;
  await fs.mkdir(path.dirname(reportFile),{recursive:true});const report=await fs.open(reportFile+'.pending','wx');
  const tally={},outcomeHash=crypto.createHash('sha256'),sourceVersions=new Map(),recordHashes=new Map(),memberIds=new Map();let dispositions=0,reportLines=[],reportBytes=0;
  async function flushReport(){if(reportLines.length){await report.write(reportLines.join(''));reportLines=[];reportBytes=0;}}
  async function outcome(kind,id,expected,actual,status='equal'){const x={kind,id,expectedSha256:expected,actualSha256:actual,status};const line=JSON.stringify(x)+'\n';reportLines.push(line);reportBytes+=Buffer.byteLength(line);if(reportBytes>=128*1024)await flushReport();outcomeHash.update(line);tally[kind]=(tally[kind]||0)+1;if(expected!==actual)throw Error('Reconciliation discrepancy: '+kind);}
  const writers=Object.fromEntries(['records','fields','source_versions','identities','members','identity_decisions','evidence','evidence_sources','dispositions'].map(t=>[t,U.batch(db,t)]));
  async function source(record,claim){
    const snapshot=claim?.repairProvenance?.snapshotSha256||claim?.snapshotSha256||recordHashes.get(record);
    if(!/^[a-f0-9]{64}$/.test(snapshot||''))throw Error('Evidence source has no immutable source version');
    const url=claim?.sourceUrl||null,id=U.hash([record,url,snapshot]);if(url)U.safeUrl(url);
    if(claim?.repairProvenance?.baselineSha256&&claim.repairProvenance.baselineSha256!==manifest.baseline.sha256)throw Error('Foreign baseline provenance');
    const dates=claim?.dates||claim||{};U.date(dates.sourceDate);U.date(dates.observedAt);
    // Every assertion is checked, even when its content version is reused.
    if(sourceVersions.has(id))return id;
    const v={release_id:rid,source_version_id:id,record_id:record,provider:claim?.sourceLabel||'Legacy integrated professional record',source_key:record+'|'+(url||'unlinked'),content_sha256:snapshot,hash_semantics:claim?.repairProvenance?.snapshotSha256||claim?.snapshotSha256?'asserted-source-snapshot':'canonical-integrated-record',source_url:url,source_date:dates.sourceDate||null,observed_at:dates.observedAt||null,archive_ref:null,archive_status:'not-supplied'};
    // Snapshot assertions are never relabelled as verified original archives.
    sourceVersions.set(id,U.hash(v));await writers.source_versions.push(v);return id;
  }
  await db.query('begin');try{
    await db.query("set local statement_timeout='10min'");
    await db.query('select pg_advisory_xact_lock(hashtext($1))',[rid]);
    if((await db.query('select 1 from docmap_professional.releases where release_id=$1',[rid])).rows.length)throw Error('Concurrent import completed; repeat safely');
    for await(const r of P.lines(prepared.preparedFile)){
      const i=r.ordinal,id=r.recordId;recordHashes.set(id,r.originalSha256);
      await writers.records.push({release_id:rid,ordinal:i,record_id:id,original_sha256:r.originalSha256,projected_sha256:r.projectedSha256,original:r.original,projected:r.projected,projected_json:JSON.stringify(r.projected)});
      for(const[field,value]of Object.entries(r.projected))await writers.fields.push({release_id:rid,record_id:id,field,value_sha256:U.hash(value),value});
      if(r.privacyOmissions.length)await writers.dispositions.push({release_id:rid,ordinal:dispositions++,kind:'privacy-filter',record_id:id,field:null,payload_sha256:U.hash({omittedPaths:r.privacyOmissions,originalPreservedIn:manifest.baseline}),payload:{omittedPaths:r.privacyOmissions,originalPreservedIn:manifest.baseline}});
      await source(id);if(i%5000===0)onProgress({phase:'records',count:i});if(failAfter===i)throw Error('Injected interrupted import');
    }
    for(const [kind,items]of [['correction',P.lines(prepared.patchFile)],['field-exclusion',prepared.suppressions],['identity-hold',prepared.holds]])for await(const item of items){await writers.dispositions.push({release_id:rid,ordinal:dispositions++,kind,record_id:item.sourceRecordId,field:item.field||null,payload_sha256:U.hash(item),payload:item});await outcome(kind,String(dispositions-1),U.hash(item),U.hash(item),'validated');if(kind==='correction'){const claims=item.field==='professional_context'?item.value.map(x=>x.provenance):[item.provenance];for(const claim of claims)await source(item.sourceRecordId,claim);}}
    for(const t of ['records','fields','source_versions','dispositions'])await writers[t].flush();
    // Check actual database round-trip hashes, not merely inserted input values.
    for(let after=-1;;){const page=await db.query('select ordinal,record_id,projected_sha256,projected_json from docmap_professional.records where release_id=$1 and ordinal>$2 order by ordinal limit 500',[rid,after]);if(!page.rows.length)break;for(const row of page.rows){await outcome('record',row.record_id,row.projected_sha256,U.hash(JSON.parse(row.projected_json)));after=row.ordinal;}}
    global.gc?.();
    await U.eachArray(binding.corpusPath,'candidates',async(c,ordinal)=>{
      memberIds.set(c.id,{held:c.needsIdentityReview,records:new Set(c.sourceRecordIds),evidenceIds:new Set(c.evidenceIds)});
      const h=U.hash(c);await writers.identities.push({professional_id:c.id,origin:'legacy-candidate-id'});
      await writers.members.push({release_id:rid,ordinal,professional_id:c.id,held:c.needsIdentityReview,payload_sha256:h,payload:c,payload_json:JSON.stringify(c)});
    });await writers.identities.flush();await writers.members.flush();onProgress({phase:'members',count:memberIds.size});
    const fingerprint=crypto.createHash('sha256');for(let after=-1;;){const page=await db.query('select ordinal,professional_id,payload_sha256,payload_json from docmap_professional.members where release_id=$1 and ordinal>$2 order by ordinal limit 500',[rid,after]);if(!page.rows.length)break;for(const row of page.rows){fingerprint.update(row.payload_json);await outcome('member',row.professional_id,row.payload_sha256,U.hash(JSON.parse(row.payload_json)));after=row.ordinal;}}
    let count=0;
    await U.eachArray(binding.corpusPath,'passages',async(p,ordinal)=>{
      const owner=memberIds.get(p.candidateId);if(!owner||owner.held||!owner.evidenceIds.has(p.id)||!Array.isArray(p.sources)||!p.sources.length)throw Error('Held, orphaned or misattributed evidence');
      for(const src of p.sources){if(!owner.records.has(src.sourceRecordId)&&!String(src.sourceRecordId).startsWith('enrichment:'))throw Error('Cross-person evidence source');if(String(src.sourceRecordId).startsWith('enrichment:')&&!src.identityBasis&&!src.review)throw Error('Unbound enrichment owner');}
      const h=U.hash(p);await writers.evidence.push({release_id:rid,ordinal,evidence_id:p.id,professional_id:p.candidateId,type:p.type,text:p.text,qualifiers:p.qualifiers||[],dates:p.dates||{},payload_sha256:h,payload:p,payload_json:JSON.stringify(p)});
      for(let n=0;n<p.sources.length;n++){const src=p.sources[n];await writers.evidence_sources.push({release_id:rid,evidence_id:p.id,ordinal:n,source_version_id:await source(src.sourceRecordId,src),original_field:src.repairProvenance?.originalSourceField||src.originalSourceField||src.field,payload_sha256:U.hash(src),payload:src});}
      count++;if(count%25000===0)onProgress({phase:'evidence',count});
    });await writers.evidence.flush();await writers.evidence_sources.flush();await writers.source_versions.flush();
    for(let after=-1;;){const page=await db.query('select ordinal,evidence_id,payload_sha256,payload_json from docmap_professional.evidence where release_id=$1 and ordinal>$2 order by ordinal limit 500',[rid,after]);if(!page.rows.length)break;for(const row of page.rows){fingerprint.update(row.payload_json);await outcome('evidence',row.evidence_id,row.payload_sha256,U.hash(JSON.parse(row.payload_json)));after=row.ordinal;}}
    if(!binding.corpusVersion.endsWith('-'+fingerprint.digest('hex').slice(0,20)))throw Error('Database corpus fingerprint differs from immutable package');
    await U.eachArray(binding.corpusPath,'identityLedger',async(p,ordinal)=>{if(p.candidateId&&!memberIds.get(p.candidateId)?.records.has(p.sourceRecordId)||!recordHashes.has(p.sourceRecordId))throw Error('Identity decision membership mismatch');await writers.identity_decisions.push({release_id:rid,ordinal,record_id:p.sourceRecordId,professional_id:p.candidateId||null,decision:p.decision,payload_sha256:U.hash(p),payload:p,payload_json:JSON.stringify(p)});});await writers.identity_decisions.flush();
    for(let after=-1;;){const page=await db.query('select ordinal,record_id,payload_sha256,payload_json from docmap_professional.identity_decisions where release_id=$1 and ordinal>$2 order by ordinal limit 500',[rid,after]);if(!page.rows.length)break;for(const row of page.rows){await outcome('identity-decision',row.record_id,row.payload_sha256,U.hash(JSON.parse(row.payload_json)));after=row.ordinal;}}
    for(const [table,keys,value,hashColumn]of [['fields',['record_id','field'],'value','value_sha256'],['evidence_sources',['evidence_id','ordinal'],'payload','payload_sha256'],['dispositions',['ordinal'],'payload','payload_sha256']]){
      let after=keys.map(k=>k==='ordinal'?-1:'');for(;;){const predicate=keys.length===1?`${keys[0]}>$2`:`(${keys.join(',')})>($2,$3)`;const page=await db.query(`select ${keys.join(',')},${value} as value,${hashColumn} as expected from docmap_professional.${table} where release_id=$1 and ${predicate} order by ${keys.join(',')} limit 500`,[rid,...after]);if(!page.rows.length)break;for(const x of page.rows){await outcome(table,keys.map(k=>x[k]).join('|'),x.expected,U.hash(x.value));after=keys.map(k=>x[k]);}}
    }
    for(let after='';;){const page=await db.query('select * from docmap_professional.source_versions where release_id=$1 and source_version_id>$2 order by source_version_id limit 500',[rid,after]);if(!page.rows.length)break;for(const x of page.rows){await outcome('source-version',x.source_version_id,sourceVersions.get(x.source_version_id),U.hash(x));after=x.source_version_id;}}
    const typed=await db.query("select count(*)::int n from docmap_professional.evidence where release_id=$1 and (type<>payload->>'type' or text<>payload->>'text' or qualifiers<>payload->'qualifiers' or dates<>payload->'dates')",[rid]);if(typed.rows[0].n)throw Error('Structured evidence columns differ from source payload');
    const counts={records:recordHashes.size,members:memberIds.size,evidence:count,sourceVersions:sourceVersions.size,dispositions,audit:replay.audit};
    if(count!==replay.audit.passages||memberIds.size!==replay.audit.candidates||tally['identity-decision']!==replay.audit.inputRows)throw Error('Imported population mismatch');
    // A newly inserted release is absent from previous statistics. Analyze
    // before the hold join too: otherwise PostgreSQL can estimate one row
    // on each side and rescan every held member for every passage.
    onProgress({phase:'analyze-reconciliation',count});await db.query('analyze docmap_professional.members,docmap_professional.evidence');
    const consistency=await db.query('select count(*)::int as n from docmap_professional.evidence e join docmap_professional.members m using(release_id,professional_id) where e.release_id=$1 and m.held',[rid]);if(consistency.rows[0].n)throw Error('Held evidence leaked');
    // Recheck immutable inputs after long-running import/reconciliation so
    // another process cannot change verified inputs between verification/use.
    await U.verify(bindingFile,bindingSha256);await U.verify(binding.manifestPath,binding.manifestSha256);await U.verify(binding.corpusPath,binding.corpusSha256);await U.verify(binding.replayPath,binding.replaySha256);
    for(const k of ['baseline','repairs','cacheManifest','runtimeDependencyManifest'])if(manifest[k])await U.verify(U.inside(path.dirname(binding.manifestPath),manifest[k].path),manifest[k].sha256);
    await U.verify(path.join(binding.runtimeDir,'deployment-manifest.json'),manifest.runtimeManifestSha256);const finalRuntime=await U.json(path.join(binding.runtimeDir,'deployment-manifest.json'));for(const item of finalRuntime.files)await U.verify(U.inside(binding.runtimeDir,item.file),item.sha256);
    const reconciliationSha256=outcomeHash.digest('hex');
    await U.insertBatch(db,'releases',[{release_id:rid,manifest_sha256:binding.manifestSha256,binding_sha256:bindingSha256,schema_version:manifest.schemaVersion,projection_version:manifest.projectionVersion,corpus_version:binding.corpusVersion,corpus_sha256:binding.corpusSha256,safety_sha256:safetySha256,manifest,binding,manifest_json:await fs.readFile(binding.manifestPath,'utf8'),binding_json:await fs.readFile(bindingFile,'utf8'),counts,reconciliation_sha256:reconciliationSha256}]);
    // New-table estimates can otherwise pick a release-only index and scan the
    // entire corpus for every FK lookup. Analyze inside this transaction: all
    // parents are complete and remain invisible to other readers until commit.
    onProgress({phase:'analyze-parents',count});await db.query('analyze docmap_professional.records,docmap_professional.members,docmap_professional.evidence,docmap_professional.source_versions,docmap_professional.releases');
    onProgress({phase:'final-constraints',count});const constraintsStarted=Date.now();await db.query("set local statement_timeout='10min'");await db.query('set constraints all immediate');const finalConstraintsMs=Date.now()-constraintsStarted;await flushReport();await report.sync();await db.query('commit');await report.close();await fs.rename(reportFile+'.pending',reportFile);
    const summary={releaseId:rid,status:'staged-unapproved',passed:true,counts,outcomes:tally,discrepancies:0,reconciliationSha256,manifestSha256:binding.manifestSha256,bindingSha256,corpusVersion:binding.corpusVersion,safetySha256,milliseconds:Date.now()-started,finalConstraintsMs,preparation:prepared.receipt};await fs.writeFile(reportFile+'.summary.json',JSON.stringify(summary,null,2),{flag:'wx'});return summary;
  }catch(e){await db.query('rollback');await flushReport();await report.close();await fs.rename(reportFile+'.pending',reportFile+'.failed');throw e;}
}
module.exports={preflight,importRelease,privacy,provenance};
