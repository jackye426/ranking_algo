'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCorpus,splitPassages}=require('./data.cjs'),{buildProfile}=require('./profile.cjs');
const base={id:'wrapped-source',name:'Dr Alex Example',gmc_number:'1234567',specialty:'Sports medicine'};
const canonical=text=>text.replace(/\s+/g,' ').trim();
const about=corpus=>corpus.candidates[0].evidenceIds.map(id=>corpus.passages.find(p=>p.id===id)).filter(p=>p.field==='about');

test('soft-wrapped source sentences retain short endings and subjects verbatim',()=>{
  const text='Dr Alex Example specialises in running\ninjuries and biomechanics, working in elite-level\nsports. Alex is\npassionate about integrating scientific evidence into care. He is a guest\nLecturer in rehabilitation.';
  const corpus=buildCorpus([{...base,about:text}]),passages=about(corpus);
  assert.equal(canonical(passages.map(p=>p.text).join(' ')),canonical(text));
  assert.ok(passages.every(p=>p.text.split('\n').every(line=>text.includes(line))));
  assert.ok(passages.some(p=>canonical(p.text).includes('running injuries')));
  assert.ok(passages.some(p=>canonical(p.text).includes('Alex is passionate')));
  assert.ok(passages.some(p=>canonical(p.text).includes('He is a guest Lecturer')));
});

test('packing never reorders a later training sentence ahead of intervening practice',()=>{
  const first='She completed a diploma in endoscopy.',middle='She runs a specialist clinic for children.',last='She undertook a fellowship in ultrasound.';
  const text=[first,middle,last].join(' '),corpus=buildCorpus([{...base,about:text}]),passages=about(corpus);
  assert.deepEqual(passages.map(p=>p.text),[first,middle,last]);
  assert.deepEqual(passages.map(p=>p.type),['training','clinical-practice','training']);
  const profile=buildProfile(corpus.candidates[0],corpus.passages,{corpusVersion:corpus.version});
  assert.deepEqual(profile.about.map(p=>p.text),[first,middle,last]);
});

test('soft line wrapping does not sever a training or negative qualifier from its object',()=>{
  const corpus=buildCorpus([{...base,about:'She is currently undertaking a Masters in\nclinical rehabilitation. She does not perform\ncardiac CT.'}]);
  const p=corpus.passages.filter(p=>p.field==='about');
  assert.ok(p.some(p=>canonical(p.text)==='She is currently undertaking a Masters in clinical rehabilitation.'));
  assert.ok(p.some(p=>canonical(p.text)==='She does not perform cardiac CT.'&&p.qualifiers.includes('contains-negation')));
});

test('explicit modality lists, list introductions and negative scopes remain readable',()=>{
  for(const text of ['Recorded modalities:\nCT\nMR','I do not perform:\nCT\nMR','No\nCT\nMR']){
    assert.equal(canonical(splitPassages(text).join(' ')),canonical(text));
    const corpus=buildCorpus([{...base,areas_of_interest:text}]),p=corpus.passages.filter(p=>p.field==='areas_of_interest');
    assert.equal(canonical(p.map(p=>p.text).join(' ')),canonical(text));
    if(/No|do not/.test(text))assert.ok(p.every(p=>p.qualifiers.includes('contains-negation')));
  }
});
