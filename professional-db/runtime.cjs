'use strict';
const path=require('node:path'),U=require('./util.cjs');
async function verifyRuntime(root,manifestSha256){if(!path.isAbsolute(root||''))throw Error('Absolute immutable expert runtime required');const file=path.join(root,'deployment-manifest.json');await U.verify(file,manifestSha256);const manifest=await U.json(file),seen=new Set();for(const item of manifest.files){if(seen.has(item.file))throw Error('Duplicate runtime file');seen.add(item.file);await U.verify(U.inside(root,item.file),item.sha256);}for(const file of ['expert/releases.cjs','expert/profile.cjs','expert/search.cjs','expert/public/projects.js'])if(!seen.has(file))throw Error('Incomplete expert runtime');return root;}
module.exports={verifyRuntime};
