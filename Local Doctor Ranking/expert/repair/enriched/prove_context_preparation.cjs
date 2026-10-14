'use strict';
// Exercise the actual pure row-preparation path for every accepted context item.
// This lightweight check does not build a corpus/index or fabricate retrieval.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {diagnostics}=require('./diagnose_context_projection.cjs');
const {reviewedBiographySegments}=require('../../reviewed-segmentation.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const words=text=>String(text).match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}\s_]/gu)||[];
const count=values=>{const result=new Map();for(const value of values)result.set(value,(result.get(value)||0)+1);return result;};
function missing(expected,actual){const have=count(actual),result={};for(const [token,n]of count(expected))if(n>(have.get(token)||0))result[token]=n-(have.get(token)||0);return result;}
function prove(packetFile,outputFile){
 if(fs.existsSync(outputFile))throw Error('Choose a new receipt path');
 const packetBytes=fs.readFileSync(packetFile),packet=JSON.parse(packetBytes),d=diagnostics();
 const releaseFile=path.resolve(__dirname,'../../releases.cjs'),releaseCode=fs.readFileSync(releaseFile,'utf8'),instance=new Module(releaseFile,module);instance.filename=releaseFile;instance.paths=Module._nodeModulePaths(path.dirname(releaseFile));instance._compile(releaseCode+'\nmodule.exports.diagnosticProvenance=provenance;',releaseFile);const provenance=instance.exports.diagnosticProvenance;
 const counts={items:0,complete:0,missing:0,partial:0},kinds={},findings=[];
 for(const patch of packet.patches){if(patch.field!=='professional_context')continue;for(const item of patch.value){
  counts.items++;kinds[item.kind]??={items:0,complete:0,missing:0,partial:0};kinds[item.kind].items++;
  const source=provenance(item.provenance,packet,patch),prepared={kind:item.kind,text:item.text,...source,...(item.activity?{activity:structuredClone(item.activity)}:{}),...(item.segmentationPolicy?{segmentationPolicy:structuredClone(item.segmentationPolicy)}:{})};
  const evidence=d.rowEvidence({id:patch.sourceRecordId,professional_context:[prepared]}),normalized=d.normalizeText(item.text),difference=missing(words(normalized),words(evidence.map(e=>e.text).join('\n')));
  let state='complete';if(!evidence.length)state='missing';else if(Object.keys(difference).length)state='partial';counts[state]++;kinds[item.kind][state]++;
  assert(evidence.every(e=>e.sourceRecordId===patch.sourceRecordId&&e.repairProvenance.reviewId===item.provenance.reviewId&&e.field==='professional_context.'+item.kind));
  if(state!=='complete'){
   const field=item.kind==='biography'?'about':'professional_context.'+item.kind,pieces=item.kind==='biography'?reviewedBiographySegments(item.text,{reviewId:item.provenance.reviewId,policy:item.segmentationPolicy,split:d.splitPassages}):d.splitRecordedBlock(item.text,{qualification:['qualification','academic-background'].includes(item.kind)}).map(text=>({text}));
   findings.push({sourceRecordId:patch.sourceRecordId,reviewId:item.provenance.reviewId,kind:item.kind,state,sourceTextSha256:sha(item.text),sourceText:item.text,normalizedText:normalized,missingTokens:difference,sourceProvenance:item.provenance,pieces:pieces.map(piece=>({...piece,text:d.normalizeText(piece.text),rejectionReason:d.rejectionReason(d.normalizeText(piece.text),field,{reviewedContext:true,reviewedShort:piece.reviewedShort===true})})),preparedEvidence:evidence});
  }
 }}
 assert.equal(d.codeSha256,sha(fs.readFileSync(path.resolve(__dirname,'../../data.cjs'))),'Runtime changed during verification');assert.equal(sha(releaseCode),sha(fs.readFileSync(releaseFile)));
 const report={schemaVersion:1,scope:'Actual pure rowEvidence and release provenance functions for every accepted context; no ranking, identity merging or project writes',packetSha256:sha(packetBytes),runtimeDataSha256:d.codeSha256,runtimeReleasesSha256:sha(releaseCode),counts,kinds,rules:d.rules,findings,networkCalls:0,modelCalls:0,corpusBuilt:false,fullPromotionPassClaimed:false};fs.writeFileSync(outputFile,JSON.stringify(report,null,2));return {...counts,outputFile};
}
if(require.main===module){try{console.log(JSON.stringify(prove(...process.argv.slice(2))));}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={prove};
