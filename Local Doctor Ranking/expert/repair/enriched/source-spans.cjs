'use strict';
// Proposal/review utility only. It does not read, write, approve or publish data.
const {createHash}=require('node:crypto');
const digest=text=>createHash('sha256').update(text).digest('hex');
function sourceUnits(text){
 if(typeof text!=='string')throw Error('Source text required');
 // Equal-length shadow joins wrapped prose for segmentation; all returned text
 // is sliced from the untouched source, including dates, negation and short terms.
 const shadow=text.replace(/[\r\n]/g,' '),units=[];
 for(const item of new Intl.Segmenter('en-GB',{granularity:'sentence'}).segment(shadow)){
  const start=item.index,end=start+item.segment.length;
  units.push({start,end,text:text.slice(start,end)});
 }
 if(units.map(x=>x.text).join('')!==text)throw Error('Segmentation lost source text');
 return units;
}
function retainedSpans(text,omissions){
 let previous=0;const kept=[];
 for(const item of omissions){
  if(!Number.isSafeInteger(item.start)||!Number.isSafeInteger(item.end)||item.start<previous||item.end<=item.start||item.end>text.length||item.text!==text.slice(item.start,item.end))throw Error('Invalid, overlapping or changed omission');
  if(item.start>previous)kept.push({start:previous,end:item.start,text:text.slice(previous,item.start)});
  previous=item.end;
 }
 if(previous<text.length)kept.push({start:previous,end:text.length,text:text.slice(previous)});
 return kept;
}
function validateReviewedSpans(text,decision){
 if(decision?.approved!==true||typeof decision.reviewId!=='string'||!decision.reviewId.trim()||decision.sourceTextSha256!==digest(text))throw Error('Explicit source-bound review required');
 const kept=retainedSpans(text,decision.omissions||[]);
 if(JSON.stringify(kept)!==JSON.stringify(decision.retainedSpans))throw Error('Retained source spans disagree');
 if(!kept.some(x=>x.text.trim())&&decision.action!=='withhold-source-item')throw Error('Empty professional text requires explicit withholding');
 return structuredClone(kept);
}
module.exports={digest,sourceUnits,retainedSpans,validateReviewedSpans};
