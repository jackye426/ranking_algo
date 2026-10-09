'use strict';

// Source-bound presentation/retrieval boundaries for independently reviewed
// biographies. This is not a text repair, expertise classifier or privacy
// exception. The caller must still apply the normal content-safety filters.
const {createHash}=require('node:crypto');
const VERSION='reviewed-biography-segmentation-v1';
const digest=text=>createHash('sha256').update(text).digest('hex');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function invalid(message){const error=new Error(`Invalid reviewed biography segmentation: ${message}`);error.code='INVALID_REVIEWED_SEGMENTATION';throw error;}
function exactKeys(value,keys){return object(value)&&Object.keys(value).every(key=>keys.includes(key));}
function trimRange(text,start,end){while(start<end&&/\s/u.test(text[start]))start++;while(end>start&&/\s/u.test(text[end-1]))end--;return {start,end,text:text.slice(start,end)};}
function paragraphRanges(text){
  // Count newline tokens, not individual CR/LF code units: one CRLF must never
  // be mistaken for a blank line. Single source line breaks remain in a block.
  const newlines=[...text.matchAll(/\r\n|[\r\n]/g)].map(match=>({start:match.index,end:match.index+match[0].length}));
  const boundaries=[];
  for(let i=1;i<newlines.length;i++){
    const before=newlines[i-1],after=newlines[i];
    if(!/^[\t ]*$/.test(text.slice(before.end,after.start)))continue;
    if(boundaries.at(-1)?.end===before.end)boundaries.at(-1).end=after.end;
    else boundaries.push({start:before.start,end:after.end});
  }
  const ranges=[];let start=0;
  for(const boundary of boundaries){const range=trimRange(text,start,boundary.start);if(range.text)ranges.push(range);start=boundary.end;}
  const final=trimRange(text,start,text.length);if(final.text)ranges.push(final);return ranges;
}
function containsNegativeList(text){
  return /(?:^|\n|[•*])\s*No\s*[:.!]?\s*(?=$|\n|[•*])/i.test(text.replace(/\r\n?/g,'\n'))||/\b(?:do not|does not|did not|never|no longer)\b[^\n]*:\s*(?:\n|[•*])/i.test(text.replace(/\r\n?/g,'\n'));
}
function validatePolicy(original,reviewId,policy){
  if(typeof original!=='string')invalid('original text must be a string');
  if(!exactKeys(policy,['schemaVersion','reviewId','textSha256','spans'])||policy.schemaVersion!==1)invalid('unsupported policy shape');
  if(typeof reviewId!=='string'||!reviewId||policy.reviewId!==reviewId)invalid('review identity mismatch');
  if(typeof policy.textSha256!=='string'||!/^[a-f0-9]{64}$/.test(policy.textSha256)||digest(original)!==policy.textSha256)invalid('source text hash mismatch');
  if(!Array.isArray(policy.spans)||policy.spans.length<1||policy.spans.length>200)invalid('expected bounded reviewed spans');
  const paragraphs=paragraphRanges(original),starts=new Set(paragraphs.map(p=>p.start)),ends=new Set(paragraphs.map(p=>p.end));
  let previousEnd=-1;
  for(const span of policy.spans){
    if(!exactKeys(span,['start','end','text','mode'])||!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||span.end<=span.start||span.end>original.length)invalid('invalid span bounds');
    if(span.start<previousEnd)invalid('overlapping or reordered spans');
    if(!['professional-entry','source-context'].includes(span.mode))invalid('unsupported span mode');
    if(typeof span.text!=='string'||original.slice(span.start,span.end)!==span.text)invalid('span wording differs from the source');
    if(!starts.has(span.start)||!ends.has(span.end))invalid('span must retain complete explicit source paragraphs');
    if(span.text.length>5000)invalid('reviewed source block exceeds evidence bound');
    if(span.mode==='professional-entry'&&(span.text.length>80||!paragraphs.some(p=>p.start===span.start&&p.end===span.end)))invalid('professional entry must be one short source paragraph');
    previousEnd=span.end;
  }
  if(containsNegativeList(original)){
    const full=trimRange(original,0,original.length);
    if(policy.spans.length!==1||policy.spans[0].start!==full.start||policy.spans[0].end!==full.end||policy.spans[0].mode!=='source-context')invalid('negative list must retain its complete source context');
  }
  return policy;
}
function reviewedBiographySegments(original,{reviewId,policy=null,split=text=>[text]}={}){
  if(typeof original!=='string')invalid('original text must be a string');
  if(typeof split!=='function')invalid('normal source splitter must be a function');
  const normal=text=>{
    if(!text.trim())return [];
    const pieces=split(text);if(!Array.isArray(pieces)||pieces.some(piece=>typeof piece!=='string'))invalid('normal source splitter returned invalid pieces');
    return pieces.filter(piece=>piece.trim()).map(text=>({text,neutral:false,reviewedShort:false}));
  };
  if(policy==null)return normal(original);
  validatePolicy(original,reviewId,policy);
  const result=[];let cursor=0;
  for(const span of policy.spans){
    result.push(...normal(original.slice(cursor,span.start)));
    // Literal source text: do not normalize, infer missing words, strip negative
    // introductions or combine a claim with text from another source record.
    result.push({text:span.text,neutral:span.mode==='source-context',reviewedShort:span.mode==='professional-entry'});
    cursor=span.end;
  }
  result.push(...normal(original.slice(cursor)));return result;
}
module.exports={VERSION,paragraphRanges,validatePolicy,reviewedBiographySegments};
