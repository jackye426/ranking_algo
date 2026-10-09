'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./releases.cjs'),{buildCorpus}=require('./data.cjs'),{buildProfile,VERSION:profileVersion}=require('./profile.cjs'),{renderSourcePage}=require('./sources.cjs'),P=require('./public/projects.js');
const {suppressionIndex,forbiddenProvenance}=require('./repair/enriched/verify_exclusion_surfaces.cjs');
const releaseId='suppression-surfaces-new',baselineSha256='a'.repeat(64);
const brief={version:1,summary:'Cardiac CT',requirements:[{id:'ct',kind:'modality',text:'Cardiac CT',label:'Cardiac CT',importance:'focus'}]};
function fixture(){
 const fields=['about','clinical_interests','areas_of_interest','research_interests','qualifications','professional_memberships'];
 const row={id:'source-one',name:'Dr Source Example',gmc_number:'7000001',specialty:'Radiology',about_alternatives:{phin:'WITHHELD_PHIN unsafe source text.',previous:'WITHHELD_PREVIOUS unsafe source text.',spire:'WITHHELD_SPIRE unsafe source text.',bupa:'I report cardiac CT. I do not perform surgery.'},locations:[{name:'Example Hospital'}]};
 for(const field of fields)row[field]='WITHHELD_'+field.toUpperCase()+' unsafe source text.';
 const raw=[row,...R.MANDATORY_HOLDS.map((id,i)=>({id,name:'Held Person '+i,gmc_number:String(7000002+i),about:'Held professional biography.'}))];
 const suppressions=[...fields,...['phin','previous','spire'].map(provider=>'about_alternatives.'+provider)].map((field,i)=>({sourceRecordId:row.id,field,beforeHash:R.hashValue(field.split('.').reduce((value,key)=>value[key],row)),approved:true,reason:'Source-reviewed unsafe wording.',reviewId:'surface-review-'+i,sourceEvidence:[{sourceRecordId:row.id,snapshotSha256:'b'.repeat(64),sourceField:field}]}));
 const context={kind:'biography',text:'An intact, attributable alternative describes cardiac CT reporting.',provenance:{sourceUrl:null,sourceLabel:'Stored corrected provider profile',sourceDate:null,observedAt:null,snapshotSha256:'c'.repeat(64),parserVersion:'surface-fixture-v1',reviewId:'separate-approved-context',sourceField:'about'}};
 const packet={schemaVersion:2,releaseId,baselineSha256,suppressions,holds:R.MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Known identity hold'})),patches:[{sourceRecordId:row.id,field:'professional_context',beforeHash:R.hashValue(null),value:[context],approved:true}]};
 const prepared=R.applyRepairs(raw,packet,{releaseId,baselineSha256}),corpus=buildCorpus(prepared.rows),candidate=corpus.candidates.find(c=>c.sourceRecordIds.includes(row.id)),passages=corpus.passages.filter(p=>p.candidateId===candidate.id);
 return {raw,packet,prepared,corpus,candidate,passages,index:suppressionIndex(packet)};
}
function save(corpus,candidate,passages,dataReleaseId){
 const profile=buildProfile(candidate,passages,{corpusVersion:corpus.version,dataReleaseId});
 const saved={...candidate,dataReleaseId,evidence:passages,requirementMatrix:[],reasons:[],profileBackground:profile};
 let project=P.setBrief(P.createProject('Disposable verification'),brief,corpus.version,{dataReleaseId});
 project=P.saveCandidate(project,saved,brief,corpus.version,{dataReleaseId});return {project,profile};
}
test('all currently used suppression fields stay absent across prepared evidence, profile, source reader and newly saved exports',()=>{
 const h=fixture(),before=structuredClone(h.raw),{project,profile}=save(h.corpus,h.candidate,h.passages,releaseId),sourceHtml=renderSourcePage(h.candidate,h.passages,h.passages[0],{corpusVersion:h.corpus.version,profileVersion,dataRelease:{releaseId}}),html=P.exportHTML(project),restored=P.importJSON(P.exportJSON(project));
 assert.equal(h.packet.suppressions.length,9);assert.deepEqual(h.raw,before);
 for(const surface of [h.corpus.passages,profile,restored]){assert.equal(forbiddenProvenance(surface,h.index).length,0);assert.doesNotMatch(JSON.stringify(surface),/WITHHELD_/);}
 for(const surface of [sourceHtml,html]){assert.doesNotMatch(surface,/WITHHELD_/);assert.match(surface,/I do not perform surgery/);assert.match(surface,/intact, attributable alternative/);}
 assert.deepEqual(restored.candidates,project.candidates);assert.equal(restored.events.length,0);assert.equal(restored.candidates[0].qualification,'not-reviewed');
 assert(h.corpus.passages.some(p=>p.field==='professional_context.biography'&&p.repairProvenance.originalSourceField==='about'),'A separate accepted correction must not be suppressed just because its original provider heading has the same name');
});
test('nested-provider checks inspect deduplicated extra sources without blocking a different provider',()=>{
 const index=suppressionIndex({suppressions:[{sourceRecordId:'one',field:'about_alternatives.phin',reviewId:'r'}]});
 assert.equal(forbiddenProvenance({sourceRecordId:'one',field:'about_alternatives',sourceLabel:'Bupa'},index).length,0);
 assert.equal(forbiddenProvenance({sourceRecordId:'one',field:'professional_context.biography',sourceLabel:'phin'},index).length,0);
 assert.equal(forbiddenProvenance({sourceRecordId:'one',field:'about_alternatives',sourceLabel:'Bupa',sources:[{sourceRecordId:'one',field:'about_alternatives',sourceLabel:'PHIN'}]},index).length,1);
 assert.equal(forbiddenProvenance({sourceRecordId:'different-person',field:'about_alternatives',sourceLabel:'phin'},index).length,0);
});
test('old saved wording remains unchanged and marked for review while live obsolete or suppressed citations cannot substitute new text',async t=>{
 const h=fixture(),oldCorpus=buildCorpus(h.raw),oldCandidate=oldCorpus.candidates.find(c=>c.sourceRecordIds.includes('source-one')),oldPassages=oldCorpus.passages.filter(p=>p.candidateId===oldCandidate.id);
 let {project}=save(oldCorpus,oldCandidate,oldPassages,'suppression-surfaces-old');
 project.notes='Disposable private note';project=P.changeReview(project,oldCandidate.id,'qualification','reviewed-by-team',{actor:'user'});const history=structuredClone(project.candidates[0]);
 project=P.setBrief(project,brief,h.corpus.version,{dataReleaseId:releaseId});const restored=P.importJSON(P.exportJSON(project));
 assert.equal(restored.candidates[0].needsReview,true);assert.equal(restored.notes,project.notes);assert.deepEqual(restored.candidates[0].candidate,history.candidate);assert.deepEqual(restored.candidates[0].decisions,history.decisions);assert.match(P.exportHTML(restored),/WITHHELD_ABOUT/);
 let modelCalls=0;const app=require('./server.cjs').createApp({ready:true,corpus:h.corpus,dataRelease:{releaseId}},{generate:async()=>{modelCalls++;throw Error('Unexpected model call');}}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,old=oldPassages.find(p=>p.text.includes('WITHHELD_ABOUT'));
 assert(old);const route=base+'/api/expert/sources/'+oldCandidate.id+'?evidence='+old.id;
 assert.equal((await fetch(route+'&corpusVersion='+oldCorpus.version+'&profileVersion='+profileVersion+'&dataReleaseId=suppression-surfaces-old')).status,410);
 assert.equal((await fetch(route+'&corpusVersion='+h.corpus.version+'&profileVersion='+profileVersion+'&dataReleaseId='+releaseId)).status,404);
 const current=await fetch(base+'/api/expert/sources/'+h.candidate.id);assert.equal(current.status,200);assert.doesNotMatch(await current.text(),/WITHHELD_/);assert.equal(modelCalls,0);
});
