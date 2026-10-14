'use strict';
const {Client}=require('pg'),fs=require('node:fs/promises'),path=require('node:path');
const {sha}=require('./util.cjs');
async function connect({connectionFile=process.env.DOCMAP_DB_CONNECTION_FILE}={}){
  if(!connectionFile||!path.isAbsolute(connectionFile))throw Error('Server-side connection file required');
  const config=JSON.parse(await fs.readFile(connectionFile,'utf8'));
  if(config.host==='db.oewczjseteyvyvikxxaz.supabase.co')throw Error('Shared DocMap database is not an allowed staging target');
  if(!['127.0.0.1','localhost','::1'].includes(config.host)&&config.ssl?.rejectUnauthorized!==true)throw Error('Remote PostgreSQL requires verified TLS');
  const db=new Client(config);await db.connect();return db;
}
async function migrate(db){
  const root=path.join(__dirname,'supabase','migrations'),files=(await fs.readdir(root)).filter(x=>x.endsWith('.sql')).sort();
  await db.query('begin');try{
    await db.query('create schema if not exists docmap_professional_meta; revoke all on schema docmap_professional_meta from public; create table if not exists docmap_professional_meta.migrations (name text primary key, sha256 text not null)');
    for(const file of files){const sql=await fs.readFile(path.join(root,file),'utf8'),sum=sha(sql),old=await db.query('select sha256 from docmap_professional_meta.migrations where name=$1',[file]);if(old.rows.length){if(old.rows[0].sha256!==sum)throw Error('Migration history drift');continue;}await db.query(sql);await db.query('insert into docmap_professional_meta.migrations values ($1,$2)',[file,sum]);}
    await db.query('commit');
  }catch(e){await db.query('rollback');throw e;}
}
module.exports={connect,migrate};
