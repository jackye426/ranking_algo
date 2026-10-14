'use strict';
// Optional independent product preview entry point; never selects the main service.
const R=require('./reader.cjs'),{prepareDatabaseExpert}=require('./expert-adapter.cjs');
async function createDatabaseExpertApp({db,pin,cacheDir,modelDir,runtimeRoot,staging=false}){
  const engine=await prepareDatabaseExpert({db,pin,cacheDir,modelDir,runtimeRoot,staging}),r=await R.release(db,pin,{staging});
  const express=require(require.resolve('express',{paths:[runtimeRoot]})),app=express();
  app.use(async(req,res,next)=>{try{await R.release(db,pin,{staging});const json=res.json.bind(res);res.json=body=>json(body&&typeof body==='object'&&!Array.isArray(body)?{...body,databaseVersions:R.versions(r)}:body);next();}catch{res.status(503).json({ready:false,error:'Pinned approved database release unavailable'});}});
  const {createApp}=require(require('node:path').join(runtimeRoot,'expert/server.cjs'));app.use(createApp(engine));
  return {app,engine};
}
module.exports={createDatabaseExpertApp};
