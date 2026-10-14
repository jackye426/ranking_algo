'use strict';
// Uses an isolated copy of this exact local module to expose existing pure
// parsing predicates for inspection. It does not edit the production module.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function diagnostics(){
 const file=path.resolve(__dirname,'../../data.cjs'),code=fs.readFileSync(file,'utf8');
 const start=code.indexOf('function useful(text,field'),end=code.indexOf('\nfunction valueEntries',start);assert(start>=0&&end>start);
 const lines=code.slice(start,end).split('\n');let n=0;const rules=[];
 const diagnostic=lines.map(line=>{
  if(line.includes('return false;')){const rule='filter-'+(++n);rules.push({rule,code:line.trim()});return line.replace('return false;',`return '${rule}';`);}
  return line.replace('function useful(','function rejectionReason(').replace('return true;','return null;');
 }).join('\n');
 const instance=new Module(file,module);instance.filename=file;instance.paths=Module._nodeModulePaths(path.dirname(file));
 instance._compile(code+'\n'+diagnostic+'\nmodule.exports.diagnostic={normalizeText,splitPassages,useful,rejectionReason,valueEntries,sourceFor,rowEvidence,splitRecordedBlock:typeof splitRecordedBlock===\"function\"?splitRecordedBlock:null};',file);
 return {...instance.exports.diagnostic,rules,codeSha256:sha(code)};
}
function run(packetFile,projectionFile,outputFile){
 if(fs.existsSync(outputFile))throw Error('Use a new report path');
 const packetBytes=fs.readFileSync(packetFile),projectionBytes=fs.readFileSync(projectionFile),packet=JSON.parse(packetBytes),projection=JSON.parse(projectionBytes),d=diagnostics();
 const findings=new Map([...projection.missing.map(f=>[f.reviewId,{...f,issue:'no-passage'}]),...projection.tokenCoverageNeedsReview.map(f=>[f.reviewId,{...f,issue:'partial-token-coverage'}])]);
 const counts={},items=[];
 for(const patch of packet.patches){if(patch.field!=='professional_context')continue;for(const item of patch.value){const finding=findings.get(item.provenance.reviewId);if(!finding)continue;
  const field=item.kind==='biography'?'about':'professional_context.'+item.kind;
  const segments=d.splitPassages(item.text).map(text=>({text,reason:d.rejectionReason(text,field)}));
  for(const segment of segments)if(segment.reason)counts[segment.reason]=(counts[segment.reason]||0)+1;
  items.push({...finding,sourceText:item.text,provenance:item.provenance,normalizedText:d.normalizeText(item.text),segments});
 }}
 const result={schemaVersion:1,sourcePacketSha256:sha(packetBytes),projectionReceiptSha256:sha(projectionBytes),runtimeDataSha256:d.codeSha256,rules:d.rules,findings:items,counts,readOnly:true};
 fs.writeFileSync(outputFile,JSON.stringify(result,null,2));return {items:items.length,counts,outputFile};
}
if(require.main===module){try{console.log(JSON.stringify(run(...process.argv.slice(2))));}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={diagnostics,run};
