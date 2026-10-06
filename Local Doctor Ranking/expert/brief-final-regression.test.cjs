'use strict';
// Regressions from the disclosed final holdout, not a new unseen evaluation.
const test=require('node:test'),assert=require('node:assert/strict');
const {parseBrief,createBriefInterpreter}=require('./brief.cjs');
const labels=brief=>brief.requirements.map(r=>r.label);
test('a reference to the research requirement removes the active criterion and its context',()=>{
  const previous=parseBrief({message:'For cardiac CT software, add clinical research as a preferred requirement.'}).brief;
  const {brief}=parseBrief({previous,message:'Remove the research requirement; keep cardiac CT and the software purpose.'});
  assert.ok(!labels(brief).includes('Clinical research'));
  assert.ok(labels(brief).includes('Cardiac CT'));
  assert.ok(!brief.requirements.some(r=>/clinical research/i.test(r.text)));
});
for(const verb of ['retaining','keeping','preserving','maintaining','including'])test('a removal ends before the '+verb+' clause',()=>{
  const previous=parseBrief({message:'We need clinical expertise for skin-lesion image software designed for home use.'}).brief;
  const {brief}=parseBrief({previous,message:`This version will instead be used in primary care. Remove home use, while ${verb} the skin-lesion purpose.`});
  assert.ok(!labels(brief).includes('Community / home use'));
  assert.ok(labels(brief).includes('Skin lesions'));
  assert.ok(labels(brief).includes('Primary care'));
});
test('manufacturer correction does not extract commentary as an organisation',()=>{
  const previous=parseBrief({message:'Cardiac CT software. Manufacturer: Example Imaging.'}).brief;
  const {brief}=parseBrief({previous,message:'The manufacturer field was incorrect. Manufacturer: Example Clinical Systems. Preserve the clinical brief.'});
  assert.equal(brief.manufacturer,'Example Clinical Systems');
  assert.ok(labels(brief).includes('Cardiac CT'));
  assert.equal(parseBrief({previous:brief,message:'The manufacturer field needs checking.'}).brief.manufacturer,'Example Clinical Systems');
});
test('last explicit manufacturer assignment wins and explicit clearing remains supported',()=>{
  const {brief}=parseBrief({message:'Cardiac CT software. Manufacturer is Example A; Manufacturer: Example B.'});
  assert.equal(brief.manufacturer,'Example B');
  assert.equal(parseBrief({previous:brief,message:'Clear the manufacturer.'}).brief.manufacturer,null);
});
test('an unavailable model cannot undo the deterministic refinement fixes',async()=>{
  const interpret=createBriefInterpreter({client:{chat:{completions:{create:async()=>{throw Error('offline');}}}}});
  const previous=parseBrief({message:'Skin-lesion imaging software. Clinical research is preferred. Manufacturer: Example A.'}).brief;
  const next=await interpret({previous,message:'Remove the research requirement, while retaining skin-lesion imaging. Manufacturer: Example B.'});
  assert.equal(next.brief.manufacturer,'Example B');assert.ok(!labels(next.brief).includes('Clinical research'));assert.ok(labels(next.brief).includes('Skin lesions'));
});
