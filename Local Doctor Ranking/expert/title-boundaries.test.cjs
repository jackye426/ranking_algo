'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{buildCorpus,splitPassages}=require('./data.cjs'),{buildProfile}=require('./profile.cjs');
test('ordinary lowercase word endings never become professional titles at a sentence boundary',()=>{
 for(const text of ['He has extensive experience of dealing with general and acute medical problems and has held various educational and non-clinical roles.','Upper and lower gastrointestinal symptoms\nHe has performed more than 9,000 endoscopic procedures.','Mr Williams also has advanced training.','I assess health problems and has held clinics; I do not perform surgery.']){
  const parts=splitPassages(text);assert.equal(parts.join(' ').replace(/\s+/g,' '),text.replace(/\s+/g,' '));
  assert.ok(!parts.some(p=>/^ms\s/i.test(p)),text);
 }
});
test('full evidence and profile retain problems as one exact source word',()=>{
 const text='I assess medical problems and has held teaching roles.',raw=[{id:'source',name:'Dr Alex Example',gmc_number:'7444401',about:text}],corpus=buildCorpus(raw),c=corpus.candidates[0],p=corpus.passages.filter(p=>p.field==='about');
 assert.equal(p.map(p=>p.text).join(' '),text);assert.equal(buildProfile(c,corpus.passages).about.map(p=>p.text).join(' '),text);assert.equal(raw[0].about,text);
});
test('a real capitalized glued title still separates two owners without rewriting words',()=>{
 const text='I assess knee injuriesDr Jones is a dermatologist.';
 const p=splitPassages(text);assert.equal(p.join(''),text);assert.ok(p.some(s=>s.startsWith('Dr Jones')));
});
