'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{digest,sourceUnits,retainedSpans,validateReviewedSpans}=require('./source-spans.cjs');
test('source proposal units retain every byte of wrapped prose, negation, short modalities and ranges',()=>{
 const text='No current CT reporting.\r\nMR training only.\nReported range <=7 in 2024–2025.\n\nProfessional role follows.';
 assert.equal(sourceUnits(text).map(x=>x.text).join(''),text);
});
test('source-bound removal preserves exact surrounding wording and order without reconstructing medical wording',()=>{
 const text='No clinical CT activity. MR training only. Personal sentence. Reported <=7 cases in 2024.';
 const start=text.indexOf('Personal'),end=text.indexOf('Reported'),omissions=[{start,end,text:text.slice(start,end)}],kept=retainedSpans(text,omissions);
 const result=validateReviewedSpans(text,{approved:true,reviewId:'human-review-fixture',sourceTextSha256:digest(text),omissions,retainedSpans:kept});
 assert.deepEqual(result.map(x=>x.text),['No clinical CT activity. MR training only. ','Reported <=7 cases in 2024.']);
});
test('unapproved, changed, overlapping and empty replacements fail closed',()=>{
 const text='Original text.',omissions=[{start:0,end:text.length,text}],kept=[];
 assert.throws(()=>validateReviewedSpans(text,{sourceTextSha256:digest(text),omissions,retainedSpans:kept}),/review required/);
 assert.throws(()=>retainedSpans(text,[{start:0,end:5,text:'wrong'}]),/changed omission/);
 assert.throws(()=>retainedSpans(text,[{start:0,end:3,text:'Ori'},{start:2,end:4,text:'ig'}]),/overlapping/);
 assert.throws(()=>validateReviewedSpans(text,{approved:true,reviewId:'r',sourceTextSha256:digest(text),omissions,retainedSpans:kept}),/explicit withholding/);
 assert.deepEqual(validateReviewedSpans(text,{approved:true,reviewId:'r',sourceTextSha256:digest(text),omissions,retainedSpans:kept,action:'withhold-source-item'}),[]);
});
