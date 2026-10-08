'use strict';
// Reads the existing restricted reader; never writes to the database or source checkout.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const [destination,sourceApp]=process.argv.slice(2);
 if(!destination||!sourceApp||!path.isAbsolute(destination)||!path.isAbsolute(sourceApp))throw Error('Usage: freeze-baseline <new absolute directory> <source application>');
 await fs.mkdir(destination,{recursive:true});
 const finalize=process.argv.includes('--finalize-existing');
 const existing=await fs.readdir(destination);
 if(existing.length&&!(finalize&&existing.length===1&&existing[0]==='raw.json'))throw Error('Baseline directory must be empty, or contain only raw.json for explicit finalization');
 require('dotenv').config({path:path.join(sourceApp,'.env.local'),quiet:true});
 require('dotenv').config({path:path.join(sourceApp,'expert','.env.local'),override:true,quiet:true});
 if(!finalize&&process.argv.includes('--variables-stdin')){
  let data;try{data=JSON.parse(require('node:fs').readFileSync(0,'utf8').replace(/^\uFEFF/,''));}catch{throw Error('Unable to read private environment input');}
  for(const key of ['SUPABASE_URL','EXPERT_READER_TOKEN'])if(typeof data[key]==='string')process.env[key]=data[key];
 }
 delete process.env.EXPERT_DATA_RELEASE;
 process.env.EXPERT_CACHE_DIR=destination;
 const {fetchRows}=require('../reader.cjs');
 const raw=finalize?JSON.parse(await fs.readFile(path.join(destination,'raw.json'),'utf8')):await fetchRows({onProgress:({rows})=>{if(rows%10000===0)console.log('Read professional records:',rows);}});
 const bytes=await fs.readFile(path.join(destination,'raw.json'));
 const manifest={schemaVersion:1,createdAt:new Date().toISOString(),purpose:'Frozen professional-only baseline; no source writes',fetchedAt:raw.fetchedAt,readerVersion:raw.readerVersion,rows:raw.rows.length,distinctIds:new Set(raw.rows.map(r=>r.id)).size,excludedIds:raw.rows.filter(r=>r.do_not_recommend).map(r=>r.id).sort(),reviewIds:raw.rows.filter(r=>r.requires_review).map(r=>r.id).sort(),rawSha256:hash(bytes),codeCommit:execFileSync('git',['-c','safe.directory='+path.resolve(__dirname,'../../..').replace(/\\/g,'/'),'rev-parse','HEAD'],{cwd:path.join(__dirname,'../..'),encoding:'utf8'}).trim(),files:[]};
 for(const name of ['identity-reviews.cjs','enrichments.cjs','reader.cjs','data.cjs']){const data=await fs.readFile(path.join(sourceApp,'expert',name));await fs.writeFile(path.join(destination,name),data,{flag:'wx'});manifest.files.push({name,sha256:hash(data)});}
 if(manifest.rows!==manifest.distinctIds||!manifest.excludedIds.length)throw Error('Unexpected baseline identity/exclusion census');
 await fs.writeFile(path.join(destination,'baseline-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 console.log(JSON.stringify({rows:manifest.rows,excluded:manifest.excludedIds.length,sha256:manifest.rawSha256,readerVersion:manifest.readerVersion}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
