'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{buildCorpus,splitPassages,contactDetails}=require('./data.cjs'),{buildProfile}=require('./profile.cjs');
const base={id:'source',name:'Dr Alex Example',gmc_number:'7444401'};
const normalized=x=>x.replace(/\s+/g,' ').trim();
function prepared(extra){const corpus=buildCorpus([{...base,...extra}]),c=corpus.candidates[0];return {corpus,c,profile:buildProfile(c,corpus.passages)};}
test('a short tail created by long-sentence chunking survives biography filtering',()=>{
 const source='He evaluates '+('joint pain, '.repeat(73))+'and joint deterioration.';
 const pieces=splitPassages(source);assert.ok(pieces.length>1);assert.ok(pieces.every(x=>x.length>=15&&x.length<=900));assert.equal(normalized(pieces.join(' ')),normalized(source));
 const {profile}=prepared({about:source});assert.equal(normalized(profile.about.map(p=>p.text).join(' ')),normalized(source));
 assert.equal(prepared({about:'deterioration.'}).profile.about.length,0);
});
test('career year ranges stay readable while genuine booking/contact values remain filtered',()=>{
 const text='PREVIOUS APPOINTMENTS: 1983- 1990 Registrar in general medicine.';
 assert.equal(contactDetails(text),false);assert.equal(prepared({about:text}).profile.about[0].text,text);
 for(const value of [text+' Telephone: 020 1234 5678','Previous appointments: 020 1234 5678','Appointments: 020 1234 5678',text+' Contact me at https://example.org/book'])assert.equal(contactDetails(value),true,value);
});
test('a navigation aside cannot discard substantive clinical or research source text',()=>{
 const fields={clinical_interests:'Melanoma and lesion surgery, sentinel biopsy and dermoscopy. See website for further details.',research_interests:'I have led research in melanoma (see below).'};
 const {corpus}=prepared(fields);
 for(const [field,text]of Object.entries(fields))assert.equal(normalized(corpus.passages.filter(p=>p.field===field).map(p=>p.text).join(' ')),normalized(text.replace(/ See website for further details\.$/,'')));
 const {corpus:standalone}=prepared({clinical_interests:'See website for further details.'});assert.equal(standalone.passages.length,0);
});
