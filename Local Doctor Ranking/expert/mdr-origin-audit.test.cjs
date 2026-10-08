'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDeviceInterpreter,validateDeviceContext,validateDeviceDraft}=require('./device-context-set.cjs');
const {createBriefInterpreter,canonicalKey}=require('./brief.cjs');
const taxonomy=require('./emdn-taxonomy.cjs');
const clone=value=>structuredClone(value);
const make=options=>createDeviceInterpreter({interpret:createBriefInterpreter({client:null}),...options});
const update=(action,...codes)=>({action,classifications:codes.map(code=>({system:code.startsWith('MD')?'MDR':'EMDN',code}))});
const continuation=d=>({proposal:d,questionId:d.questionId,questionRevision:d.questionRevision});
const labels=result=>result.brief.requirements.map(r=>r.label);
async function pending(){const run=make(),first=await run({message:'Dermatologists for dermoscopy with Z12040118'}),question=await run({previous:first.brief,message:'Add MDA0315'});assert.equal(question.deviceError?.code,'device-clarification');return {run,previous:first.brief,draft:question.deviceError.deviceDraft};}

// Synthetic mapping injection tests shared provenance independently of the
// catalogue's current three mappings. It is not a new clinical interpretation.
const sharedTaxonomy={...taxonomy,getMapping:code=>code==='J010792'?{...taxonomy.getMapping('Z12040118'),code}:taxonomy.getMapping(code)};

test('one shared derived focus survives removal of either code and disappears with its last source',async()=>{
 for(const firstRemoved of ['J010792','Z12040118']){
  const run=make({taxonomy:sharedTaxonomy}),first=await run({message:'Dermatologists for EMDN Z12040118 and J010792 for the same device'}),original=clone(first.brief);
  assert.equal(first.deviceError,undefined);const concept=first.brief.deviceContext.concepts[0];assert.equal(concept.origins.length,2);assert.equal(concept.userOrigin,false);assert.equal(concept.legacyOrigin,false);
  const one=await run({previous:first.brief,classificationUpdate:update('remove',firstRemoved)});
  assert(labels(one).includes('Skin-lesion imaging'));assert.equal(one.brief.deviceContext.concepts[0].origins.length,1);assert.deepEqual(first.brief,original);
  const none=await run({previous:one.brief,classificationUpdate:{action:'clear'}});assert(!labels(none).includes('Skin-lesion imaging'));assert(labels(none).includes('Dermatologist'));
 }
});

test('explicit suppression survives both source removal and re-add until the user restores the clinical criterion',async()=>{
 const run=make({taxonomy:sharedTaxonomy}),first=await run({message:'Dermatologists for EMDN Z12040118 and J010792 for the same device'}),id=first.brief.requirements.find(r=>r.label==='Skin-lesion imaging').id;
 const removed=await run({previous:first.brief,removeRequirementId:id});assert(!labels(removed).includes('Skin-lesion imaging'));assert.equal(removed.brief.deviceContext.suppressedConceptKeys.length,1);
 const one=await run({previous:removed.brief,classificationUpdate:update('remove','J010792')});
 const both=await run({previous:one.brief,message:'The same device',classificationUpdate:update('add','J010792')});assert.equal(both.deviceError,undefined);assert(!labels(both).includes('Skin-lesion imaging'));
 const refined=await run({previous:both.brief,message:'Clinical research helpful'});assert(!labels(refined).includes('Skin-lesion imaging'));
 const restored=await run({previous:refined.brief,message:'I need dermoscopy'});assert(labels(restored).includes('Skin-lesion imaging'));assert.equal(restored.brief.deviceContext.suppressedConceptKeys.length,0);assert(restored.brief.deviceContext.concepts.find(c=>c.requirementId===id).userOrigin);
 const cleared=await run({previous:restored.brief,classificationUpdate:{action:'clear'}});assert(labels(cleared).includes('Skin-lesion imaging'));assert(labels(cleared).includes('Dermatologist'));
});

test('new-context concept identity must agree with the actual referenced requirement',async()=>{
 const first=await make()({message:'Z12040118'}),context=clone(first.brief.deviceContext);
 assert.equal(context.concepts[0].key,canonicalKey('modality','Skin-lesion imaging'));assert(validateDeviceContext(context,first.brief.requirements));
 context.concepts[0].key=canonicalKey('modality','Cardiac CT');assert.equal(validateDeviceContext(context,first.brief.requirements),false);
});

test('active classification-derived concepts require a retained source or an explicit user or legacy origin',async()=>{
 const first=await make()({message:'Z12040118'}),context=clone(first.brief.deviceContext);
 context.concepts[0].origins=[];assert.equal(validateDeviceContext(context,first.brief.requirements),false);
 context.concepts[0].userOrigin=true;assert.equal(validateDeviceContext(context,first.brief.requirements),true);
 context.concepts[0].userOrigin=false;context.concepts[0].legacyOrigin=true;assert.equal(validateDeviceContext(context,first.brief.requirements),true);
});

for(const message of ['MDA0315 for coronary disease diagnosis; a separate device Z12040118 for dermoscopy'])test('explicit multiple-device intent does not collapse into one successful search: '+message,async()=>{
 const run=make(),first=await run({message:'Cardiologists'}),previous=clone(first.brief),out=await run({previous:first.brief,message});
 assert(out.deviceError,'Explicit separate devices need an explicit resolution');assert.deepEqual(out.brief,previous);
});

for(const mutation of ['different-base','drop-accepted-role','invent-role','mismatched-metadata'])test('corrupted pending proposal cannot apply hidden scope changes: '+mutation,async()=>{
 const {run,previous,draft}=await pending(),d=clone(draft),accepted=clone(previous);
 if(mutation==='different-base')d.baseBrief.requirements=d.baseBrief.requirements.filter(r=>r.kind!=='role');
 if(mutation==='drop-accepted-role')d.proposedBrief.requirements=d.proposedBrief.requirements.filter(r=>r.kind!=='role');
 if(mutation==='invent-role')d.proposedBrief.requirements.push({id:'injected-role',kind:'role',label:'Radiologist',text:'Radiologist',importance:'essential',strictRole:true,polarity:'include'});
 if(mutation==='mismatched-metadata')d.proposedBrief.deviceContext.classifications[0].officialTerm='Invented category label';
 const out=await run({previous,message:'Software to analyse skin lesions using dermoscopy',classificationContinuation:continuation(d)});
 assert(out.deviceError,'The corrupted proposal must be rejected');assert.deepEqual(out.brief,accepted);assert.deepEqual(previous,accepted);
});

test('structured action cannot silently override a contradictory written action on the same code',async()=>{
 const run=make(),first=await run({message:'Dermatologists for dermoscopy with Z12040118'}),previous=clone(first.brief);
 const out=await run({previous:first.brief,message:'Remove MDA0315 for software to analyse skin lesions',classificationUpdate:update('add','MDA0315')});
 assert.equal(out.deviceError?.code,'device-conflict');assert.deepEqual(out.brief,previous);
});

test('a continuation against a newer accepted version leaves all accepted classifications and criteria intact',async()=>{
 const {run,previous,draft}=await pending(),newer=await run({previous,message:'Clinical research helpful'}),snapshot=clone(newer.brief);
 const out=await run({previous:newer.brief,message:'Software to analyse skin lesions',classificationContinuation:continuation(draft)});
 assert.equal(out.deviceError?.code,'device-conflict');assert.deepEqual(out.brief,snapshot);assert.deepEqual(newer.brief,snapshot);
});

for(const message of ['Z12040118 + MDA0315','MDA0315 + Z11030692','V92 + MDA0315','Z11030692 + MDS1009'])test('every authentic intermediate draft in a fresh mixed-code search can resume: '+message,async()=>{
 const run=make();let out=await run({message}),questions=0;
 while(out.deviceError?.deviceDraft&&questions++<4){
  const draft=out.deviceError.deviceDraft;assert(validateDeviceDraft(draft),'The server-generated intermediate draft must satisfy its own validator');
  const answer=message.includes('Z12040118')?'Software to analyse skin lesions using dermoscopy':'Software to diagnose coronary artery disease using cardiac CT';
  out=await run({message:answer,classificationContinuation:continuation(draft)});
 }
 assert.equal(out.deviceError,undefined);assert.equal(out.needsClarification,false);assert.equal(out.brief.deviceContext.classifications.length,2);assert(validateDeviceContext(out.brief.deviceContext,out.brief.requirements));
});
