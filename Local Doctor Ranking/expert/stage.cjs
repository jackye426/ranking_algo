'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=path.resolve(__dirname,'..'),destination=process.argv[2]&&path.resolve(process.argv[2]);
if(!destination||destination===source||destination.startsWith(source+path.sep))throw new Error('Choose a new staging directory outside the application.');
if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw new Error('Staging directory must be empty.');
const files=['package.json','package-lock.json','demo/models.cjs',...['server','reader','releases','data','brief','search','ai','transport','enrichments','identity-reviews','resume','sources','geo','profile','emdn-taxonomy','device-context'].map(n=>'expert/'+n+'.cjs'),'expert/data/emdn-2026.json','expert/entrypoint.sh','expert/public/index.html','expert/public/app.js','expert/public/styles.css','expert/public/projects.js','expert/public/evidence.js','expert/public/source-reader.js','public/fonts/inter-variable.ttf','public/fonts/OFL-Inter.txt','public/brand/docmap-logo.jpg'];
for(const file of files)if(!fs.statSync(path.join(source,file)).isFile())throw new Error('Missing file: '+file);
fs.mkdirSync(destination,{recursive:true});const manifest=[];
for(const file of files){const target=path.join(destination,file),bytes=fs.readFileSync(path.join(source,file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);manifest.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
fs.copyFileSync(path.join(__dirname,'Dockerfile'),path.join(destination,'Dockerfile'));
fs.writeFileSync(path.join(destination,'.dockerignore'),'node_modules\n**/.cache\n**/.env*\n.git\n');
fs.writeFileSync(path.join(destination,'railway.toml'),'[build]\nbuilder = "DOCKERFILE"\ndockerfilePath = "Dockerfile"\n[deploy]\nhealthcheckPath = "/api/expert/health"\nhealthcheckTimeout = 3600\nrestartPolicyType = "ON_FAILURE"\nrestartPolicyMaxRetries = 3\n');
fs.writeFileSync(path.join(destination,'deployment-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files:manifest},null,2));
console.log(JSON.stringify({staged:true,files:manifest.length,bytes:manifest.reduce((n,f)=>n+f.bytes,0),destination}));
