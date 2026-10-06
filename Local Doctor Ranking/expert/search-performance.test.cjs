'use strict';
// Small synthetic fixtures only. No model, corpus cache or network is used.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const data=require('./data.cjs');
function isolatedSearch(){
  const counts={segments:0,classifications:0},filename=path.join(__dirname,'search.cjs');
  const instance=new Module(filename,module);instance.filename=filename;instance.paths=Module._nodeModulePaths(__dirname);
  const requireOriginal=instance.require.bind(instance);
  instance.require=id=>id==='./data.cjs'?{...data,
    activityClauses(...args){counts.segments++;return data.activityClauses(...args);},
    classifyPassage(...args){counts.classifications++;return data.classifyPassage(...args);}
  }:requireOriginal(id);
  instance._compile(fs.readFileSync(filename,'utf8'),filename);
  return {matrixFor:instance.exports.matrixFor,counts};
}
const candidate={id:'synthetic-a',name:'Fictional clinician',locations:[]};
const req=(kind,label)=>({id:kind,kind,label,text:label,importance:'essential'});
const brief={requirements:[req('modality','Cardiac CT'),req('condition','Coronary artery disease'),req('population','Adults'),req('activity','Image interpretation')]};
function passages(){return [{id:'synthetic-source',candidateId:candidate.id,sourceRecordId:'record-a',field:'about',type:'clinical-practice',attribution:'source-record',attributes:{},qualifiers:[],dates:{sourceDate:null},text:'She is an adult cardiologist. She personally reports cardiac CT. Her clinical interests include coronary artery disease.'}];}

test('repeated evidence checks reuse clause classification without changing complete matrix output',()=>{
  const {matrixFor,counts}=isolatedSearch(),ps=passages();
  const initial=matrixFor(candidate,ps,brief),cold={...counts};
  assert.ok(cold.classifications>0);assert.ok(cold.segments>0);
  counts.classifications=0;counts.segments=0;
  for(let i=0;i<4;i++)assert.deepEqual(matrixFor(candidate,ps,brief),initial);
  assert.equal(counts.classifications,0,'warmed source clauses should not be reclassified for every proof/requirement');
  assert.ok(counts.segments/4<cold.segments,'source segmentation is reused; scope-specific population checks remain');
});

for(const [field,value]of [
  ['text','She received training in cardiac CT. She treats adult patients with coronary artery disease.'],
  ['type','training'],['field','qualifications'],['attribution','verified-source'],
  ['sourceQuote','She received training in cardiac CT.']
])test('source correction invalidates cached descriptors for '+field,()=>{
  const {matrixFor}=isolatedSearch(),ps=passages();matrixFor(candidate,ps,brief);
  ps[0][field]=value;
  assert.deepEqual(matrixFor(candidate,ps,brief),isolatedSearch().matrixFor(candidate,structuredClone(ps),brief));
});

test('fresh passage metadata remains visible while source descriptors are cached',()=>{
  const {matrixFor}=isolatedSearch(),ps=passages();matrixFor(candidate,ps,brief);
  ps[0].qualifiers=['historical'];ps[0].dates.sourceDate='2011';ps[0].review={limitations:['Historical record; current activity needs confirmation.']};
  const actual=matrixFor(candidate,ps,brief);
  assert.deepEqual(actual,isolatedSearch().matrixFor(candidate,structuredClone(ps),brief));
  assert.equal(actual.find(row=>row.kind==='activity').status,'potential');
  assert.equal(actual[0].supportingEvidence[0].sourceDate,'2011');
  assert.deepEqual(actual[0].supportingEvidence[0].limits,ps[0].review.limitations);
});

test('activity-specific interest guard remains outside the shared clause cache',()=>{
  const {matrixFor}=isolatedSearch(),ps=passages();
  ps[0].text='My clinical interests include reporting cardiac CT.';
  const modality={requirements:[req('modality','Cardiac CT')]},activity={requirements:[...modality.requirements,req('activity','Image interpretation')]};
  matrixFor(candidate,ps,modality);
  const actual=matrixFor(candidate,ps,activity);
  assert.deepEqual(actual,isolatedSearch().matrixFor(candidate,structuredClone(ps),activity));
  assert.equal(actual[1].status,'potential');assert.equal(actual[1].supportingEvidence[0].evidenceType,'clinical-interest');
});

test('literal supporting quote and reviewed summary keep distinct descriptors and exact text',()=>{
  const {matrixFor}=isolatedSearch(),ps=passages();
  Object.assign(ps[0],{type:'research',attribution:'verified-source',reviewedParaphrase:true,text:'Dr Fictional coauthored a historical skin-lesion imaging study in primary care.',sourceQuote:'Dr Fictional',review:{limitations:['Coauthorship alone does not establish appraisal competence.']}});
  const b={requirements:[req('setting','Primary care'),req('modality','Skin-lesion imaging')]};
  const first=matrixFor(candidate,ps,b);assert.equal(first[0].supportingEvidence[0].kind,'reviewed-summary');
  assert.equal(first[0].supportingEvidence[0].text,ps[0].text);
  assert.deepEqual(matrixFor(candidate,ps,b),first);
  ps[0].sourceQuote='The historical skin-lesion imaging study took place in primary care.';
  const changed=matrixFor(candidate,ps,b);
  assert.deepEqual(changed,isolatedSearch().matrixFor(candidate,structuredClone(ps),b));
  assert.equal(changed[0].supportingEvidence[0].kind,'source-quote');assert.equal(changed[0].supportingEvidence[0].text,ps[0].sourceQuote);
});
