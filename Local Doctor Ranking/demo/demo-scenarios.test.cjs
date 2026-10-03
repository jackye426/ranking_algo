const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createQueryInterpreter}=require('./query-interpreter.cjs');
const {clinicalRetrievalQuery}=require('./search.cjs');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const start=source.indexOf('// DEMO_SCENARIOS_START');
const end=source.indexOf('// DEMO_SCENARIOS_END',start);
assert.ok(start>=0&&end>start,'the guide has one testable source of exact prompts');
const scenarios=JSON.parse(JSON.stringify(vm.runInNewContext(source.slice(start,end)+'\ndemoScenarios')));

test('the displayed demo conversations preserve the promised criteria across every step',async()=>{
  assert.deepEqual(scenarios.map(s=>s.id),['runner','symptoms','procedure','change-focus']);
  const interpret=createQueryInterpreter({client:null});
  const runs={};
  for(const scenario of scenarios){
    let previous={}; const turns=[];
    for(const message of scenario.prompts){
      const result=await interpret({message,previous});
      assert.notEqual(result.mode,'clarification',scenario.id+': '+message);
      previous=result.criteria; turns.push(result);
    }
    runs[scenario.id]=turns;
  }
  const runner=runs.runner.at(-1).criteria;
  assert.equal(runner.topic,'knee pain'); assert.deepEqual(runner.procedures,[]);
  assert.match(runner.clinicalContext,/get back to running/);
  assert.match(runner.clinicalContext,/Physiotherapy hasn’t helped/);
  const symptoms=runs.symptoms.at(-1).criteria;
  assert.equal(symptoms.topic,'painful periods'); assert.equal(symptoms.specialty,'Gynaecology');
  assert.deepEqual(symptoms.procedures,[]);
  assert.match(symptoms.clinicalContext,/haven’t been diagnosed with endometriosis/);
  assert.doesNotMatch(clinicalRetrievalQuery(symptoms),/endometriosis/i);
  const procedure=runs.procedure.at(-1).criteria;
  assert.equal(procedure.topic,'endometriosis'); assert.deepEqual(procedure.procedures,['Endometriosis excision']);
  assert.equal(procedure.clinicalContext,'Stage 3 endometriosis'); assert.equal(procedure.stage,undefined);
  assert.ok(runs.procedure[0].notices.some(n=>/not a verified filter/.test(n)));
  const change=runs['change-focus'];
  assert.match(change[1].criteria.clinicalContext,/running/); assert.equal(change[1].criteria.location,'London');
  assert.equal(change[2].criteria.topic,'eczema'); assert.equal(change[2].criteria.location,'London');
  assert.equal(change[2].criteria.clinicalContext,null); assert.deepEqual(change[2].criteria.procedures,[]);
});
