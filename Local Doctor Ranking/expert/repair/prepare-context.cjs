'use strict';
// Offline additive proposals. No source writes, new identities, model calls or biography replacement.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {hashValue,MANDATORY_HOLDS}=require('../releases.cjs');
const {buildCorpus,compatibleNames}=require('../data.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sources=[
 ['HCA','Hospital + insurance/HCA/results/final/consultant_profiles_jsonld_reparse_cleaned.json',{conditions:'condition',languages:'language'}],
 ['Cromwell Hospital','Hospital + insurance/Cromwell/results/consultant_profiles_final_20260215_205717.json',{patient_age_group:'population',languages:'language'}],
 ['British Dietetic Association','bda_dietitians_profiles.json',{industry_services:'service'}],
 ['Pelvic Obstetric and Gynaecological Physiotherapy','POGP/results/pogp_profiles.json',{genders_treated:'population'}]
];
const canonical=v=>{try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)return null;u.hash='';u.search='';return u.href.replace(/\/$/,'');}catch{return null;}};
const normal=v=>String(v).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
// Preserve the original array index when blanks are excluded from proposals.
// Review IDs and sourceItemIndex must point into the backed-up source field.
function indexedStrings(value){if(typeof value==='string')return value.trim()?[{text:value,itemIndex:0}]:[];if(Array.isArray(value)&&value.every(v=>typeof v==='string'))return value.map((text,itemIndex)=>({text,itemIndex})).filter(v=>v.text.trim());return [];}
function strings(value){return indexedStrings(value).map(v=>v.text);}
function identity(source,row){
 if(!compatibleNames(source.name,row.name))return 'name-conflict';
 const a=String(source.gmc_number||'').trim(),b=String(row.gmc_number||'').trim();
 if(a&&b&&a!==b)return 'registration-conflict';
 return /^\d{7}$/.test(a)&&a===b?'canonical-url-name-and-gmc':'canonical-url-and-compatible-name';
}
function main(){
 if(process.argv.length!==5)throw Error('Supply baseline, verified backup, and a new output directory');
 const [baseDir,backupDir,outDir]=process.argv.slice(2).map(v=>path.resolve(v));
 if(fs.existsSync(outDir))throw Error('Output directory must be new');
 const bytes=fs.readFileSync(path.join(baseDir,'raw.json')),raw=JSON.parse(bytes);
 const backup=JSON.parse(fs.readFileSync(path.join(backupDir,'backup-manifest.json'),'utf8'));
 const byPath=new Map(backup.files.map(f=>[f.path.replace(/\\/g,'/'),f]));
 const corpus=buildCorpus(raw.rows,{identityReviews:require('../identity-reviews.cjs'),enrichments:require('../enrichments.cjs')});
 const held=new Set(corpus.candidates.filter(c=>c.needsIdentityReview||c.sourceRecordIds.some(id=>MANDATORY_HOLDS.includes(id))).flatMap(c=>c.sourceRecordIds));
 const byUrl=new Map(),byRow=new Map(raw.rows.map(r=>[r.id,r]));
 for(const row of raw.rows)for(const u of [...Object.values(row.profile_urls||{}),...Object.values(row.urls||{})].flat()){
  const url=canonical(u);if(!url)continue;if(!byUrl.has(url))byUrl.set(url,new Map());byUrl.get(url).set(row.id,row);
 }
 const candidateText=new Map();for(const p of corpus.passages){if(!candidateText.has(p.candidateId))candidateText.set(p.candidateId,new Set());candidateText.get(p.candidateId).add(normal(p.text));}
 const existing=new Map();for(const c of corpus.candidates)for(const id of c.sourceRecordIds)existing.set(id,candidateText.get(c.id)||new Set());
 const outcomes=[],contexts=new Map(),review=[];
 for(const [provider,file,fields]of sources){
  const input=fs.readFileSync(path.join(backupDir,file)),digest=sha(input),expected=byPath.get(file);
  if(!expected||expected.sha256!==digest)throw Error('Source backup checksum mismatch: '+file);
  const parsed=JSON.parse(input.toString('utf8').replace(/^\uFEFF/,''));
  const rows=Array.isArray(parsed)?parsed:Array.isArray(parsed.profiles)?parsed.profiles:null;
  if(!rows)throw Error('Unrecognized source collection: '+file);
  for(let index=0;index<rows.length;index++){
   const source=rows[index],url=canonical(source.profile_url),matches=url?[...(byUrl.get(url)?.values()||[])]:[];
   const outcome={provider,sourceFile:file,sourceIndex:index,outcome:null,fieldOutcomes:[]};outcomes.push(outcome);
   if(matches.length!==1){outcome.outcome=matches.length?'ambiguous-existing-row':'no-existing-identity';continue;}
   const row=matches[0];outcome.sourceRecordId=row.id;
   if(held.has(row.id)||row.do_not_recommend||row.requires_review){outcome.outcome='identity-held';continue;}
   const basis=identity(source,row);outcome.identityBasis=basis;
   if(/conflict$/.test(basis)){outcome.outcome=basis;continue;}
   outcome.outcome='processed';
   for(const [field,kind]of Object.entries(fields)){
    const values=indexedStrings(source[field]);if(!values.length){outcome.fieldOutcomes.push({field,outcome:source[field]?'incompatible-shape':'empty'});continue;}
    for(const {text,itemIndex}of values){
     const key=normal(text),entry={field,itemIndex,outcome:null};outcome.fieldOutcomes.push(entry);
     if(text.length>5000||/\b(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/.test(text)||/<\/?\w+[^>]*>/.test(text)){entry.outcome='needs-content-review';continue;}
     if(existing.get(row.id)?.has(key)){entry.outcome='already-represented-exact-text';continue;}
     const items=contexts.get(row.id)||[];
     if(items.some(v=>v.kind===kind&&normal(v.text)===key&&v.provenance.sourceUrl===url)){entry.outcome='duplicate-source-item';continue;}
     const reviewId=`context:${provider}:${index}:${field}:${itemIndex}`;
     const item={kind,text,provenance:{sourceUrl:url,sourceLabel:provider,sourceDate:null,observedAt:null,snapshotSha256:digest,parserVersion:'provider-context-v1',reviewId,sourceField:field}};
     items.push(item);contexts.set(row.id,items);entry.outcome='source-supported-addition';
     review.push({reviewId,sourceRecordId:row.id,sourceFile:file,sourceIndex:index,sourceField:field,sourceItemIndex:itemIndex,sourceSha256:digest,identityBasis:basis,text,exactSourceMatch:true,reviewMethod:'deterministic-original-field-equality',limitations:['Historical stored export; current practice and current availability not verified.']});
    }
   }
  }
 }
 const oversized=new Set([...contexts].filter(([,items])=>items.length>100).map(([id])=>id));
 for(const outcome of outcomes)if(oversized.has(outcome.sourceRecordId))for(const field of outcome.fieldOutcomes)if(field.outcome==='source-supported-addition')field.outcome='withheld-context-limit';
 const acceptedReview=review.filter(item=>!oversized.has(item.sourceRecordId));
 const patches=[...contexts].filter(([id])=>!oversized.has(id)).map(([sourceRecordId,value])=>({sourceRecordId,field:'professional_context',beforeHash:hashValue(byRow.get(sourceRecordId).professional_context),value,approved:true}));
 const counts={};for(const r of outcomes){counts[r.outcome]=(counts[r.outcome]||0)+1;for(const f of r.fieldOutcomes)counts[f.outcome]=(counts[f.outcome]||0)+1;}
 fs.mkdirSync(outDir,{recursive:true});
 fs.writeFileSync(path.join(outDir,'context-proposals.json'),JSON.stringify({baselineSha256:sha(bytes),patches}));
 fs.writeFileSync(path.join(outDir,'review-ledger.json'),JSON.stringify(acceptedReview,null,2));
 fs.writeFileSync(path.join(outDir,'withheld-contexts.json'),JSON.stringify(review.filter(item=>oversized.has(item.sourceRecordId)),null,2));
 fs.writeFileSync(path.join(outDir,'processing-outcomes.json'),JSON.stringify(outcomes,null,2));
 const report={schemaVersion:1,baselineSha256:sha(bytes),sourceRows:outcomes.length,changedRows:patches.length,additionalItems:acceptedReview.length,withheldOversizedRows:oversized.size,counts,classification:'Source-bound staged additions; no new people or whole biographies; not a human review or proof of currentness',deferred:['Profession and consultation setting lack an approved source-bound adapter in this release.','Alternative biographies and other provider details remain comparison queues, not overwritten fields.']};
 fs.writeFileSync(path.join(outDir,'context-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(require.main===module)main();
module.exports={identity,strings,indexedStrings,canonical};
