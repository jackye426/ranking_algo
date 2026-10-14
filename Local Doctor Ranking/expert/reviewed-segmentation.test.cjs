'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {paragraphRanges,validatePolicy,reviewedBiographySegments}=require('./reviewed-segmentation.cjs');
const sha=text=>createHash('sha256').update(text).digest('hex');
const make=(text,spans)=>({schemaVersion:1,reviewId:'review-owned-source',textSha256:sha(text),spans});
const select=(text,index,mode='source-context')=>({...paragraphRanges(text)[index],mode});
const run=(text,policy,split=value=>[value.trim()])=>reviewedBiographySegments(text,{reviewId:'review-owned-source',policy,split});
const bad=(text,policy)=>assert.throws(()=>run(text,policy),{code:'INVALID_REVIEWED_SEGMENTATION'});

test('absent policy preserves the normal splitter output and ordering exactly',()=>{
  const source='Source one. Source two.';let seen;
  const pieces=run(source,null,value=>{seen=value;return ['Source one.','Source two.'];});
  assert.equal(seen,source);assert.deepEqual(pieces,[{text:'Source one.',neutral:false,reviewedShort:false},{text:'Source two.',neutral:false,reviewedShort:false}]);
});
test('only blank lines establish source paragraphs, including CRLF and old CR',()=>{
  assert.deepEqual(paragraphRanges(' \ufeffMD\r\nMR\r\n \r\n Adult urology \r\rAge range 16+\n'),[
    {start:2,end:8,text:'MD\r\nMR'},{start:14,end:27,text:'Adult urology'},{start:30,end:43,text:'Age range 16+'}]);
});
test('an approved exact short paragraph is retained without inventing a qualification',()=>{
  const source='An unchanged preceding statement.\n\nMammography\n\nAn unchanged final statement.';
  const policy=make(source,[select(source,1,'professional-entry')]),before=JSON.stringify(policy);
  assert.deepEqual(run(source,policy),[
    {text:'An unchanged preceding statement.',neutral:false,reviewedShort:false},
    {text:'Mammography',neutral:false,reviewedShort:true},
    {text:'An unchanged final statement.',neutral:false,reviewedShort:false},
  ]);assert.equal(JSON.stringify(policy),before);
});
test('reviewed qualification and bibliography fragments retain their whole original paragraph and neutral meaning',()=>{
  const source='FRCS. (Ed.) FRCS. (Glas), CCT\n\nPaper one. Journal A. 2009.\nPaper two. Journal A. 2009.\n\nThe next recorded paragraph.';
  const policy=make(source,[select(source,0),select(source,1)]);
  const result=run(source,policy,text=>text.trim().split(/(?<=\.)\s+/));
  assert.equal(result[0].text,'FRCS. (Ed.) FRCS. (Glas), CCT');assert.equal(result[1].text,'Paper one. Journal A. 2009.\nPaper two. Journal A. 2009.');
  assert.ok(result.slice(0,2).every(piece=>piece.neutral&&!piece.reviewedShort));assert.equal(result[2].text,'The next recorded paragraph.');
});
test('changed source, wrong review identity, unknown keys and malformed spans fail closed',()=>{
  const source='Adult urology',policy=make(source,[select(source,0,'professional-entry')]);
  bad(source+' ',policy);bad(source,{...policy,reviewId:'other'});bad(source,{...policy,approved:true});
  bad(source,{...policy,spans:[{...policy.spans[0],text:'Paediatric urology'}]});
  bad(source,{...policy,spans:[{...policy.spans[0],start:-1}]});bad(source,{...policy,spans:[{...policy.spans[0],ignorePrivacy:true}]});
  bad(source,{...policy,spans:[{...policy.spans[0],mode:'performed-activity'}]});
});
test('fragment approvals cannot cut a paragraph, reorder or duplicate spans',()=>{
  const source='I obtained FRCS. England.\n\nMammography';
  bad(source,make(source,[{start:11,end:16,text:'FRCS.',mode:'professional-entry'}]));
  const first=select(source,0),second=select(source,1);
  bad(source,make(source,[second,first]));bad(source,make(source,[first,first]));
});
test('professional entry and evidence size limits prevent broad paragraph bypass',()=>{
  const large='Recorded '.repeat(600).trim();bad(large,make(large,[select(large,0)]));
  const paragraph='Professional wording '.repeat(6).trim();bad(paragraph,make(paragraph,[select(paragraph,0,'professional-entry')]));
  const source='CT\n\nMR';bad(source,make(source,[{start:0,end:source.length,text:source,mode:'professional-entry'}]));
});
test('No and negative list introductions cannot be detached from positive-looking entries',()=>{
  for(const source of ['No\n\nCT\nMR','I do not perform:\r\n\r\nCT\r\nMR']){
    const last=paragraphRanges(source).at(-1);bad(source,make(source,[{...last,mode:'source-context'}]));
    const result=run(source,make(source,[{start:0,end:source.length,text:source,mode:'source-context'}]));
    assert.deepEqual(result,[{text:source,neutral:true,reviewedShort:false}]);
  }
});
test('contact and malformed wording are never repaired or granted a filtering exemption',()=>{
  const source='Department of !6 consultants. Contact: 020 7946 0123.';
  const pieces=run(source,make(source,[select(source,0)]));
  assert.equal(pieces[0].text,source);assert.deepEqual(Object.keys(pieces[0]),['text','neutral','reviewedShort']);assert.equal(pieces[0].reviewedShort,false);
});
test('actual inequality, exact entities and BOM bytes stay source-bound and unmodified',()=>{
  const source='\ufeffRecorded result <1% and >90%; M.Sc. &amp; FRCS.\r\nContinued source text.';
  const selected=select(source,0),policy=make(source,[selected]);assert.equal(validatePolicy(source,policy.reviewId,policy),policy);
  assert.equal(run(source,policy)[0].text,source.trim());bad(source.replace('&amp;','&'),policy);
});
