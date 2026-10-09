'use strict';
// Propose exact source-bound paragraph policies from independent review decisions.
// The output is an auditable overlay, not an automatically approved release.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {diagnostics}=require('./diagnose_context_projection.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function paragraphs(text){const result=[];let start=0;const boundary=/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/g;function add(end){let a=start,b=end;while(a<b&&/\s/.test(text[a]))a++;while(b>a&&/\s/.test(text[b-1]))b--;if(b>a)result.push({start:a,end:b,text:text.slice(a,b)});}for(const m of text.matchAll(boundary)){add(m.index);start=m.index+m[0].length;}add(text.length);return result;}
function prepare(packetFile,reviewFile,outputFile){
 if(fs.existsSync(outputFile))throw Error('Choose a new immutable overlay path');
 const packetBytes=fs.readFileSync(packetFile),reviewBytes=fs.readFileSync(reviewFile),packet=JSON.parse(packetBytes),review=JSON.parse(reviewBytes),d=diagnostics();
 const source=new Map();for(const patch of packet.patches)if(patch.field==='professional_context')for(const item of patch.value)source.set(item.provenance.reviewId,{record:patch.sourceRecordId,item});
 const proposals=new Map(),outcomes=[];
 for(const decision of review.decisions){
  if(!['retain-with-source-context','retain-as-recorded-professional-entry'].includes(decision.decision))continue;
  const owner=source.get(decision.reviewId);if(!owner){outcomes.push({reviewId:decision.reviewId,text:decision.text,outcome:'source-withheld'});continue;}
  const {record,item}=owner;assert.equal(item.kind,'biography');
  const matches=paragraphs(item.text).filter(p=>d.splitPassages(p.text).includes(decision.text));
  if(!matches.length){outcomes.push({reviewId:decision.reviewId,text:decision.text,outcome:'no-unambiguous-paragraph-boundary'});continue;}
  let proposal=proposals.get(decision.reviewId);if(!proposal){proposal={sourceRecordId:record,kind:item.kind,sourceText:item.text,sourceProvenance:item.provenance,segmentationPolicy:{schemaVersion:1,reviewId:decision.reviewId,textSha256:sha(item.text),spans:[]},reviewDecisions:[]};proposals.set(decision.reviewId,proposal);}
  for(const match of matches){
   if(match.text.length>5000){outcomes.push({reviewId:decision.reviewId,text:decision.text,outcome:'paragraph-exceeds-safe-bound',start:match.start,end:match.end});continue;}
   const mode=d.normalizeText(match.text)===decision.text&&match.text.length<=80&&decision.decision==='retain-as-recorded-professional-entry'?'professional-entry':'source-context';
   if(!proposal.segmentationPolicy.spans.some(s=>s.start===match.start&&s.end===match.end))proposal.segmentationPolicy.spans.push({...match,mode});
   proposal.reviewDecisions.push({text:decision.text,decision:decision.decision,reason:decision.reason,start:match.start,end:match.end});
   outcomes.push({reviewId:decision.reviewId,text:decision.text,outcome:'proposed-exact-paragraph-span',start:match.start,end:match.end,mode});
  }
 }
 const policies=[...proposals.values()].filter(p=>p.segmentationPolicy.spans.length);for(const p of policies)p.segmentationPolicy.spans.sort((a,b)=>a.start-b.start);
 const result={schemaVersion:1,status:'Proposed; requires independent paragraph-level verification before release attachment',sourcePacketSha256:sha(packetBytes),reviewReceiptSha256:sha(reviewBytes),runtimeDataSha256:d.codeSha256,policies,outcomes,counts:{policies:policies.length,spans:policies.reduce((n,p)=>n+p.segmentationPolicy.spans.length,0),reviewedShortDecisions:review.decisions.filter(d=>['retain-with-source-context','retain-as-recorded-professional-entry'].includes(d.decision)).length},sourceTextChanged:false};
 fs.writeFileSync(outputFile,JSON.stringify(result,null,2));return {...result.counts,outputFile};
}
if(require.main===module){try{console.log(JSON.stringify(prepare(...process.argv.slice(2))));}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={paragraphs,prepare};
