'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {Client}=require('pg'),{migrate}=require('../db.cjs'),U=require('../util.cjs'),{fixture}=require('./fixture.cjs'),I=require('../importer.cjs'),{createPreview}=require('../preview.cjs');
test('loopback database preview uses pinned evidence across search/profile/citation/export',async()=>{
  const config=await U.json(process.env.DOCMAP_DB_CONNECTION_FILE);assert.equal(config.host,'127.0.0.1');const admin=new Client({...config,database:'postgres'});await admin.connect();const name='docmap_preview_test_'+process.pid;await admin.query(`create database ${name}`);const db=new Client({...config,database:name});await db.connect();let preview;
  try{await migrate(db);const root=path.resolve(__dirname,'../.private/preview-test-'+Date.now());await fs.mkdir(root,{recursive:true});const f=await fixture(root,'test-preview');await I.importRelease(db,{...f,reportFile:path.join(root,'receipt.ndjson')});preview=await createPreview({db,pin:f.pin,staging:true});await new Promise(resolve=>preview.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+preview.server.address().port;
    const health=await(await fetch(base+'/health')).json();assert.equal(health.status,'staged-unapproved');assert.equal(health.releaseId,f.pin.releaseId);
    const search=await(await fetch(base+'/api/search?q=CT%20MR')).json();assert.ok(search.hits.length);assert.equal(search.corpusVersion,f.pin.corpusVersion);const hit=search.hits[0];
    const citation=await(await fetch(base+'/api/citation?'+new URLSearchParams({candidateId:hit.candidate.id,evidenceId:hit.evidence.id,releaseId:f.pin.releaseId}))).json();assert.deepEqual(citation.evidence,hit.evidence);
    const old=await fetch(base+'/api/citation?'+new URLSearchParams({candidateId:hit.candidate.id,evidenceId:hit.evidence.id,releaseId:'missing'}));assert.equal(old.status,410);
    const profile=await(await fetch(base+'/api/profile?candidateId='+hit.candidate.id)).json();assert.equal(profile.versions.dataReleaseId,f.pin.releaseId);const exported=await(await fetch(base+'/api/export?candidateId='+hit.candidate.id)).json();assert.equal(exported.versions.manifestSha256,f.pin.manifestSha256);assert.ok(exported.evidence.some(x=>x.id===hit.evidence.id));
    const S=require('../saved-evidence.cjs'),empty=await S.capture(db,f.pin,{candidateId:hit.candidate.id,evidenceIds:[]},{staging:true});assert.deepEqual(S.restore(empty).evidence,[]);assert.equal(empty.snapshot.versions.manifestSha256,f.pin.manifestSha256);
    assert.equal((await fetch(base+'/.private/connection.json')).status,404);assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
  }finally{if(preview)await new Promise(resolve=>preview.server.close(resolve));await db.end();await admin.query(`drop database ${name}`);await admin.end();}
});
