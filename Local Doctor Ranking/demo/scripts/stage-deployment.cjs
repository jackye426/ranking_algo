'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const source=path.resolve(__dirname,'../..');
const destination=process.argv[2] && path.resolve(process.argv[2]);
if(!destination || destination===source || destination.startsWith(source+path.sep)) throw new Error('Provide a new staging directory outside the application source.');
if(fs.existsSync(destination) && fs.readdirSync(destination).length) throw new Error('Staging directory must be empty; nothing was overwritten.');
// Keep deployment uploads independent of the wider research repository. Never
// copy .env files, node_modules, model/raw-data caches, or unrelated datasets.
const files=['Dockerfile','.dockerignore','railway.toml','package.json','package-lock.json','bm25Service.cjs','location-filter.js',
  ...['server','search','models','geo','data-source','supabase-reader','supabase-mapper','criteria','query-interpreter','clinical-filters','personalized-match','match-explanation','comparison-explanation','evidence-page'].map(name=>`demo/${name}.cjs`),
  'demo/data/public-spire-records.cjs','demo/scripts/prewarm-models.cjs','public/index.html','public/styles.css','public/app.js',
  'public/fonts/inter-variable.ttf','public/fonts/OFL-Inter.txt',
  'public/decision.css','public/profiles.css','public/comparison-data.js','public/comparison.js','public/comparison.css',
  'public/walkthrough.css','public/walkthrough.js','public/healthcare.css','public/healthcare.js','public/brand/docmap-logo.jpg'];
for(const file of files) if(!fs.statSync(path.join(source,file)).isFile()) throw new Error(`Missing deployment file: ${file}`);
fs.mkdirSync(destination,{recursive:true});
const manifest=[];
for(const file of files) {
  const bytes=fs.readFileSync(path.join(source,file));
  const target=path.join(destination,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  manifest.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
const report={createdAt:new Date().toISOString(),destination,files:manifest};
fs.writeFileSync(path.join(destination,'deployment-manifest.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({staged:true,destination,files:manifest.length,bytes:manifest.reduce((sum,file)=>sum+file.bytes,0)}));
