'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('./server.cjs'),{parseBrief}=require('./brief.cjs'),{VERSION:profileVersion}=require('./profile.cjs');
async function harness(t,{generate=async()=>{throw Error('No model should be called');}}={}){
 const evidence={id:'evidence-test',candidateId:'expert-gmc-7654321',text:'I report cardiac CT.',sourceRecordId:'bupa_1',field:'about',type:'clinical-practice',dates:{},sourceUrl:'https://provider.example/profile/alex',repairProvenance:{releaseId:'test-r1',baselineSha256:'a'.repeat(64),beforeHash:'b'.repeat(64),snapshotSha256:'c'.repeat(64),parserVersion:'parser-v1',reviewId:'automated-comparison-1'}};
 const candidate={id:evidence.candidateId,name:'Dr Alex Example',sourceRecordIds:['bupa_1'],evidenceIds:[evidence.id],evidence:[evidence],locations:[],profileUrls:[],registrations:[{body:'GMC',identifier:'7654321'}],requirementMatrix:[],reasons:[]};
 const engine={ready:true,corpus:{version:'corpus-r1',candidates:[candidate],passages:[evidence]},dataRelease:{releaseId:'test-r1',manifestSha256:'d'.repeat(64),baselineSha256:'a'.repeat(64),repairsSha256:'e'.repeat(64)},search:async brief=>({brief,results:[candidate],corpusVersion:engine.corpus.version})};
 const app=createApp(engine,{interpret:async value=>parseBrief(value),generate}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,post=async(endpoint,body)=>{const response=await fetch(base+'/api/expert/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 return {base,post,engine,candidate,evidence,source:base+'/api/expert/sources/'+candidate.id};
}
test('health and search expose release identity and both projection versions without package paths',async t=>{
 const h=await harness(t),response=await fetch(h.base+'/api/expert/health'),health=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(health.dataRelease,h.engine.dataRelease);assert.equal(health.profileVersion,profileVersion);assert.equal(health.projectionVersions.profile,profileVersion);assert.equal(health.projectionVersions.release,'expert-repair-v1');
 const result=await h.post('search',{message:'Cardiac CT'});assert.equal(result.status,200);assert.deepEqual(result.body.dataRelease,health.dataRelease);assert.equal(result.body.profileVersion,profileVersion);assert.equal(health.dataReleaseId,'test-r1');assert.equal(result.body.dataReleaseId,'test-r1');
 assert.equal(JSON.stringify(health).includes('manifest.json'),false);
});
test('versioned source links reject newer corpus/projection substitutions while legacy citations remain compatible',async t=>{
 const h=await harness(t),query='?evidence='+h.evidence.id+'&corpusVersion=corpus-r1&profileVersion='+profileVersion;
 let response=await fetch(h.source+query);assert.equal(response.status,200);const text=await response.text();assert.ok(text.includes('Source snapshot SHA-256'));assert.ok(text.includes('automated-comparison-1'));assert.ok(text.includes('corpus-r1'));assert.ok(!text.includes('legacy link'));
 response=await fetch(h.source+'?evidence='+h.evidence.id);assert.equal(response.status,200);assert.match(await response.text(),/legacy link opens the current evidence/);
 assert.equal((await fetch(h.source+query.replace('corpus-r1','obsolete-corpus'))).status,410);
 assert.equal((await fetch(h.source+query.replace(profileVersion,'obsolete-profile'))).status,410);
 assert.equal((await fetch(h.source+'?corpusVersion=a&corpusVersion=b')).status,400);
 h.engine.corpus.version='corpus-r2';assert.equal((await fetch(h.source+query)).status,410);assert.equal((await fetch(h.source)).status,200);
 h.candidate.needsIdentityReview=true;assert.equal((await fetch(h.source)).status,404);
});
test('live profiles reject obsolete projection and corpus requests without replacing the saved evidence',async t=>{
 const h=await harness(t),search=(await h.post('search',{message:'Cardiac CT'})).body,body={sessionId:search.sessionId,searchId:search.searchId,candidateId:h.candidate.id,corpusVersion:search.corpusVersion,profileVersion};
 const profile=await h.post('profile',body);assert.equal(profile.status,200);assert.equal(profile.body.dataReleaseId,'test-r1');assert.equal((await h.post('profile',{...body,profileVersion:'old'})).status,410);assert.equal((await h.post('profile',{...body,dataReleaseId:'old-release'})).status,410);
 const legacy={...body};delete legacy.profileVersion;assert.equal((await h.post('profile',legacy)).status,200);
 h.engine.corpus.version='corpus-r2';assert.equal((await h.post('profile',body)).status,410);assert.equal(search.results[0].evidence[0].text,'I report cardiac CT.');
});
test('page, shortlist and cached explanation envelopes preserve the captured release without mutating generated payloads',async t=>{
 const answer=Object.freeze({mode:'fixture',text:'Recorded source evidence.'});let calls=0;const h=await harness(t,{generate:async()=>{calls++;return answer;}});h.engine.search=async brief=>({brief,results:Array.from({length:7},(_,i)=>i?{...h.candidate,id:h.candidate.id+'-'+i}:h.candidate),corpusVersion:h.engine.corpus.version});
 const search=(await h.post('search',{message:'Cardiac CT'})).body,scope={sessionId:search.sessionId,searchId:search.searchId},request={...scope,candidateIds:[h.candidate.id]};h.engine.dataRelease={releaseId:'unrelated-later-release'};
 for(const result of [await h.post('page',{...scope,cursor:search.nextCursor}),await h.post('shortlist-view',request),await h.post('explain',request),await h.post('explain',request)]){assert.equal(result.status,200);assert.equal(result.body.dataReleaseId,'test-r1');assert.equal(result.body.corpusVersion,'corpus-r1');assert.equal(result.body.profileVersion,profileVersion);}
 assert.equal(calls,1);assert.deepEqual(answer,{mode:'fixture',text:'Recorded source evidence.'});
});
test('source reader shows reported ranges and derived estimates with their limitations',async t=>{
 const h=await harness(t);h.evidence.volume={activity:'Example procedure',reportedRange:'25–49',countNumeric:37,reportingPeriod:null,hospital:'<script>bad()</script>',procedureCode:'X123',comparable:false};
 const text=await(await fetch(h.source+'?evidence='+h.evidence.id)).text();assert.match(text,/Reported range: 25–49/);assert.match(text,/Derived estimate: 37 \(not an observed count\)/);assert.match(text,/Reporting period: not recorded/);assert.match(text,/Not comparable across sources or periods/);assert.ok(text.includes('&lt;script&gt;bad()&lt;/script&gt;'));assert.ok(!text.includes('<script>bad()'));
});
test('a corrupt pinned upload leaves startup unready and cannot fall back to a network reader',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),root=await fs.mkdtemp(path.join(os.tmpdir(),'expert-unready-')),manifest=path.join(root,'manifest.json');await fs.writeFile(manifest,'{invalid upload');const names=['EXPERT_DATA_RELEASE','EXPERT_CACHE_DIR','EXPERT_OFFLINE','PORT','HOST'],saved=Object.fromEntries(names.map(k=>[k,process.env[k]])),originalFetch=global.fetch;let outbound=0,runtime;
 t.after(async()=>{if(runtime?.server)await new Promise(resolve=>runtime.server.close(resolve));global.fetch=originalFetch;for(const key of names)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];await fs.rm(root,{recursive:true,force:true});});
 Object.assign(process.env,{EXPERT_DATA_RELEASE:manifest,EXPERT_CACHE_DIR:path.join(root,'test-corrupt'),EXPERT_OFFLINE:'1',PORT:'0',HOST:'127.0.0.1'});global.fetch=async()=>{outbound++;throw Error('Network fallback is forbidden');};
 runtime=await require('./server.cjs').start();const response=await originalFetch('http://127.0.0.1:'+runtime.server.address().port+'/api/expert/health'),health=await response.json();assert.equal(response.status,503);assert.equal(health.ready,false);assert.equal(runtime.engine.failure,true);assert.equal(runtime.engine.corpus,undefined);assert.equal(outbound,0);
});
