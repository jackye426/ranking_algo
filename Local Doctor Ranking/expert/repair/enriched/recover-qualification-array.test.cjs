'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {compileQualificationRecovery,primaryDecision}=require('./recover-qualification-array.cjs');
const {hashValue,MANDATORY_HOLDS}=require('../../releases.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex'),pin=v=>{const bytes=Buffer.from(JSON.stringify(v));return {bytes,sha256:sha(bytes)};};
function fixture(){
  const values=['MRCP(Derm) 2015','MBChB','MBChB Medical School 2008','CT','MR'],baselineSha256='a'.repeat(64),baselineRows=[...MANDATORY_HOLDS.map(id=>({id})),{id:'fictional',qualifications:values,name:'Dr Fictional',gmc:'1234567',excluded:false}];
  const targetPacket=pin({schemaVersion:2,releaseId:'old',baselineSha256,patches:[],holds:MANDATORY_HOLDS.map(sourceRecordId=>({sourceRecordId,reason:'Existing safety hold'})),suppressions:[]});
  const d={approved:true,action:'withhold-qualification-array-and-recover-reviewed-entries',sourceRecordId:'fictional',field:'qualifications',beforeHash:hashValue(values),sourceValues:values,reviewer:'reviewer-A',reviewId:'qualification-review-A',reason:'Conflicting dated qualification; preserve all other exact entries',entries:values.map((sourceValue,index)=>({index,sourceValue,action:index===2?'withhold':'retain',reason:index===2?'Unresolved recorded year':'Exact independently reviewed qualification'})),sourceEvidence:[{sourceRecordId:'fictional',sourceField:'qualifications',snapshotSha256:baselineSha256}],provenance:{sourceUrl:null,sourceLabel:'Stored professional record',sourceDate:null,observedAt:null,snapshotSha256:baselineSha256,sourceField:'qualifications',parserVersion:'reviewed-qualification-array-recovery-v1',reviewId:'qualification-review-A'},currentBindings:[{packetSha256:targetPacket.sha256,suppressionHash:hashValue(null),contextPatchHash:hashValue(null)}]};
  d.secondaryReview={approved:true,reviewer:'reviewer-B',reviewId:'qualification-review-B',primaryDecisionSha256:hashValue(primaryDecision(d))};
  return {baselineRows,baselineSha256,targetPacket,decisions:[d],releaseId:'new'};
}
function approve(f){f.decisions[0].secondaryReview.primaryDecisionSha256=hashValue(primaryDecision(f.decisions[0]));return f;}
test('conflicting array is withheld while exact safe qualifications, CT and MR survive',()=>{
  const f=fixture(),before=JSON.stringify(f),r=compileQualificationRecovery(f),row=r.rows.at(-1);
  assert.equal(JSON.stringify(f),before);assert.equal(row.qualifications,null);
  assert.deepEqual(row.professional_context.map(i=>i.text),['MRCP(Derm) 2015','MBChB','CT','MR']);
  assert.ok(row.professional_context.every(i=>i.kind==='qualification'&&i.sourceUrl===null&&i.sourceDate===null));
  assert.deepEqual(r.packet.holds,JSON.parse(f.targetPacket.bytes).holds);assert.equal(row.name,'Dr Fictional');assert.equal(row.gmc,'1234567');assert.equal(row.excluded,false);
  assert.equal(r.summary.withheldEntries,1);assert.equal(r.summary.retainedEntries,4);
});
test('every original entry needs an explicit reviewed outcome',()=>{for(const mutate of[d=>d.entries.pop(),d=>d.entries[1].index=0,d=>d.entries[2].action='unknown',d=>d.entries[3].sourceValue='CT reporting expert']){const f=fixture();mutate(f.decisions[0]);assert.throws(()=>compileQualificationRecovery(approve(f)));}});
test('dated or undated wording cannot be rewritten during restoration',()=>{const f=fixture();f.decisions[0].entries[2].sourceValue='MBChB Medical School 1998';assert.throws(()=>compileQualificationRecovery(approve(f)),/ownership/);});
test('changed source owner, field, array or packet fails closed',()=>{for(const mutate of[d=>d.sourceRecordId='other',d=>d.field='name',d=>d.beforeHash='b'.repeat(64),d=>d.sourceValues=['New qualification'],d=>d.currentBindings[0].packetSha256='b'.repeat(64)]){const f=fixture();mutate(f.decisions[0]);assert.throws(()=>compileQualificationRecovery(approve(f)));}});
test('independent approval must bind the complete primary decision',()=>{for(const mutate of[d=>d.approved=false,d=>d.secondaryReview.reviewer=d.reviewer,d=>d.reason+=' changed',d=>delete d.secondaryReview]){const f=fixture();mutate(f.decisions[0]);assert.throws(()=>compileQualificationRecovery(f));}});
test('all-inconsistent detailed array can be withheld without inventing a degree year',()=>{const f=fixture(),d=f.decisions[0],value=[{degree:'MBChB School 1998',description:'Bachelor of Medicine'}];f.baselineRows.at(-1).detailed_qualifications=value;d.field='detailed_qualifications';d.sourceValues=value;d.beforeHash=hashValue(value);d.entries=[{index:0,sourceValue:value[0],action:'withhold',reason:'Conflicting dated source item'}];d.provenance.sourceField=d.field;d.sourceEvidence[0].sourceField=d.field;const r=compileQualificationRecovery(approve(f));assert.equal(r.rows.at(-1).detailed_qualifications,null);assert.equal(r.summary.retainedEntries,0);assert.deepEqual(r.rows.at(-1).qualifications,f.baselineRows.at(-1).qualifications);});
test('detailed object cannot be silently converted into a newly written qualification',()=>{const f=fixture(),d=f.decisions[0],value=[{degree:'MBChB School 1998'}];f.baselineRows.at(-1).detailed_qualifications=value;d.field='detailed_qualifications';d.sourceValues=value;d.beforeHash=hashValue(value);d.entries=[{index:0,sourceValue:value[0],action:'retain',reason:'keep'}];d.provenance.sourceField=d.field;d.sourceEvidence[0].sourceField=d.field;assert.throws(()=>compileQualificationRecovery(approve(f)),/restoration/);});
test('unsafe qualification copies need their own explicit removal decision',()=>{const f=fixture(),packet=JSON.parse(f.targetPacket.bytes),d=f.decisions[0],cp={sourceRecordId:'fictional',field:'professional_context',beforeHash:hashValue(undefined),approved:true,value:[{kind:'qualification',text:d.sourceValues[2],provenance:{...d.provenance}}]};packet.patches.push(cp);f.targetPacket=pin(packet);d.currentBindings[0].packetSha256=f.targetPacket.sha256;d.currentBindings[0].contextPatchHash=hashValue(cp);assert.throws(()=>compileQualificationRecovery(approve(f)),/unsafe context copy/);});
test('stale context or exclusion bindings cannot conceal changed safety state',()=>{for(const mutate of[d=>d.currentBindings[0].contextPatchHash='b'.repeat(64),d=>d.currentBindings[0].suppressionHash='b'.repeat(64)]){const f=fixture();mutate(f.decisions[0]);assert.throws(()=>compileQualificationRecovery(approve(f)),/binding/);}});
test('unsafe links and mismatched source provenance cannot be restored',()=>{for(const mutate of[d=>d.provenance.sourceUrl='javascript:alert(1)',d=>d.provenance.sourceField='unrelated',d=>d.sourceEvidence[0].sourceRecordId='other']){const f=fixture();mutate(f.decisions[0]);assert.throws(()=>compileQualificationRecovery(approve(f)));}});
test('duplicate decisions, reused releases and corrupt packet bytes are rejected',()=>{const a=fixture();a.decisions.push(a.decisions[0]);assert.throws(()=>compileQualificationRecovery(a),/duplicate/);const b=fixture();b.releaseId='old';assert.throws(()=>compileQualificationRecovery(b),/fresh/);const c=fixture();c.targetPacket.sha256='b'.repeat(64);assert.throws(()=>compileQualificationRecovery(c),/hash/);});
function detailedFixture(){
 const f=fixture(),d=f.decisions[0],values=[{degree:'FRCS Glasgow 2013',description:'Surgical fellowship'},{degree:'FRCS England 2023',description:'Recorded separate award'},{degree:'CT',description:'MR'}];
 f.baselineRows.at(-1).detailed_qualifications=values;d.field='detailed_qualifications';d.sourceValues=values;d.beforeHash=hashValue(values);
 d.provenance.sourceField=d.field;d.sourceEvidence[0].sourceField=d.field;
 d.entries=values.map((sourceValue,index)=>({index,sourceValue,action:index===0?'withhold':'retain',reason:index===0?'Conflicting Glasgow award year; do not choose a year':'Separate reviewed literal source fields',...(index===0?{}:{recoveries:Object.entries(sourceValue).map(([field,text])=>({sourcePath:[field],text}))})}));
 return approve(f);
}
test('safe detailed entries retain exact separately sourced fields without composing a new degree',()=>{
 const f=detailedFixture(),before=JSON.stringify(f),r=compileQualificationRecovery(f),items=r.rows.at(-1).professional_context;
 assert.equal(JSON.stringify(f),before);assert.equal(r.rows.at(-1).detailed_qualifications,null);
 assert.deepEqual(items.map(i=>i.text),['FRCS England 2023','Recorded separate award','CT','MR']);
 assert.deepEqual(items.map(i=>i.repairProvenance.originalSourceField),['detailed_qualifications.1.degree','detailed_qualifications.1.description','detailed_qualifications.2.degree','detailed_qualifications.2.description']);
 assert.equal(r.summary.retainedEntries,2);assert.equal(r.summary.retainedPassages,4);
});
test('detailed recovery needs reviewed complete literal fields, never inferred combinations',()=>{
 for(const mutate of [d=>d.entries[1].recoveries[0].text+=' expert',d=>d.entries[1].recoveries[0].sourcePath=['description'],d=>d.entries[1].recoveries.pop(),d=>d.entries[1].recoveries.push(d.entries[1].recoveries[0])]){
  const f=detailedFixture();mutate(f.decisions[0]);assert.throws(()=>compileQualificationRecovery(approve(f)),/literal|complete|duplicate/);
 }
});
test('two reviewed arrays bind the original packet while preserving each approved recovery',()=>{
 const detail=detailedFixture(),ordinary=fixture(),d=ordinary.decisions[0];
 detail.decisions.push(d);
 const r=compileQualificationRecovery(detail),row=r.rows.at(-1);
 assert.equal(row.qualifications,null);assert.equal(row.detailed_qualifications,null);
 assert.deepEqual(row.professional_context.map(i=>i.text),['FRCS England 2023','Recorded separate award','CT','MR','MRCP(Derm) 2015','MBChB','CT','MR']);
 assert.equal(r.summary.retainedEntries,6);assert.equal(r.summary.retainedPassages,8);
});
function sourceCopyFixture(){
 const f=fixture(),packet=JSON.parse(f.targetPacket.bytes),d=f.decisions[0],text=d.sourceValues[2];
 const cp={sourceRecordId:'fictional',field:'professional_context',beforeHash:hashValue(undefined),approved:true,value:[{kind:'qualification',text,provenance:{...d.provenance}}]};
 packet.patches.push(cp);f.targetPacket=pin(packet);d.currentBindings[0].packetSha256=f.targetPacket.sha256;d.currentBindings[0].contextPatchHash=hashValue(cp);approve(f);
 const ref=require('../../releases.cjs').applyRepairs(f.baselineRows,packet,{baselineSha256:f.baselineSha256,releaseId:packet.releaseId}).rows;
 const target={targetId:'qualification-copy',sourceRecordId:'fictional',field:'professional_context',path:['professional_context',0,'text'],sourceText:text,sourceTextSha256:sha(text),expectedCurrentFieldHash:hashValue(ref.at(-1).professional_context),baselineFieldHash:hashValue(undefined),origins:[{sourceRecordId:'fictional',field:'professional_context.qualification',sourceUrl:null,sourceLabel:'Stored qualification',dates:{sourceDate:null,observedAt:null}}]};
 const decision={targetId:target.targetId,sourceTextSha256:target.sourceTextSha256,approved:true,omissions:[{start:0,end:text.length,text}],retainedSpans:[],reason:'Conflicting dated copied qualification is withheld'};
 f.scopePreparation={referenceRows:ref,ledger:{baselineSha256:f.baselineSha256,sourceTargets:[target]},reviews:[{reviewer:'source-A',decision}],secondaryReviews:[{targetId:target.targetId,reviewer:'source-B',reviewId:'source-secondary',approved:true,primaryDecisionSha256:hashValue(decision)}],holds:packet.holds};
 return f;
}
test('source-copy containment and reviewed arrays compile in one original-bound transaction',()=>{
 const f=sourceCopyFixture(),before=JSON.stringify(f),r=compileQualificationRecovery(f);
 assert.equal(JSON.stringify(f),before);assert.equal(r.rows.at(-1).qualifications,null);
 assert.deepEqual(r.rows.at(-1).professional_context.map(i=>i.text),['MRCP(Derm) 2015','MBChB','CT','MR']);
 assert.equal(r.sourceHistory.length,1);assert.equal(r.sourceHistory[0].outcome,'withheld-source-item');
 assert.deepEqual(r.packet.holds,JSON.parse(f.targetPacket.bytes).holds);
});
test('combined containment still requires exact independent approval and copy ownership',()=>{
 for(const mutate of [f=>f.scopePreparation.secondaryReviews[0].approved=false,f=>f.scopePreparation.secondaryReviews[0].primaryDecisionSha256='b'.repeat(64),f=>f.scopePreparation.ledger.sourceTargets[0].sourceRecordId='another',f=>f.scopePreparation.reviews[0].decision.omissions[0].text='invented']){
  const f=sourceCopyFixture();mutate(f);assert.throws(()=>compileQualificationRecovery(f));
 }
});
test('scope configuration cannot override frozen input, release identity or holds',()=>{
 for(const mutate of [f=>f.scopePreparation.baselineRows=[],f=>f.scopePreparation.priorPacket={},f=>f.scopePreparation.releaseId='substituted',f=>f.scopePreparation.holds=[]]){
  const f=sourceCopyFixture();mutate(f);assert.throws(()=>compileQualificationRecovery(f));
 }
});
