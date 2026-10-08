'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createApp}=require('./server.cjs');
async function api(t){const facts=[{id:'interest',candidateId:'a',text:'Coronary disease',type:'clinical-interest',sourceRecordId:'record-a',field:'areas_of_interest',dates:{mergeDate:'2026-02-15T21:25:54.049162+00:00'}},{id:'report',candidateId:'a',text:'I report cardiac CT.',type:'clinical-practice',sourceRecordId:'record-a',field:'about',dates:{},sources:[{sourceUrl:'https://example.org/one',sourceLabel:'Hospital profile'},{sourceUrl:'javascript:evil()',sourceLabel:'unsafe'}]},{id:'foreign',candidateId:'b',text:'Different person',type:'clinical-practice'}];const app=createApp({ready:true,corpus:{candidates:[{id:'a',name:'Clinician A'},{id:'b',name:'Clinician B'}],passages:facts}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));return url=>fetch('http://127.0.0.1:'+server.address().port+url);}
test('citation selects and foregrounds the exact owned passage, with stable anchor',async t=>{const get=await api(t),r=await get('/api/expert/sources/a?evidence=report'),html=await r.text();assert.equal(r.status,200);assert(html.indexOf('I report cardiac CT.')<html.indexOf('Coronary disease'));assert.match(html,/id="evidence-report" class="source-reader-passage cited-passage"/);assert(html.includes('Other stored evidence for this professional'));assert(html.includes('Recorded clinical activity'));assert(html.includes('Listed clinical interests'));assert(!html.includes('Different person'));});
test('wrong-person, obsolete and multi-value citation targets cannot silently show another claim',async t=>{const get=await api(t);for(const path of ['/api/expert/sources/a?evidence=foreign','/api/expert/sources/a?evidence=deleted'])assert.equal((await get(path)).status,404);assert.equal((await get('/api/expert/sources/a?evidence=report&evidence=interest')).status,400);});
test('record page separates unknown evidence date from collapsed technical processing date',async t=>{const get=await api(t),html=await(await get('/api/expert/sources/a?evidence=interest')).text();assert(html.includes('Source date: Not recorded'));assert(html.includes('Original page link unavailable. This quotation comes from the stored record.'));assert(html.indexOf('<summary>Record details</summary>')<html.indexOf('2026-02-15'));assert(html.includes('not when clinical practice occurred'));});
test('deduplicated provenance URLs remain accessible but unsafe schemes are discarded',async t=>{const get=await api(t),html=await(await get('/api/expert/sources/a?evidence=report')).text();assert(html.includes('href="https://example.org/one"'));assert(!html.includes('javascript:'));});

const {renderSourcePage}=require('./sources.cjs');
const person={id:'a',name:'Professor Alexandra A Very Long Consultant Name'};
const fact=(id,extra={})=>({id,candidateId:'a',sourceRecordId:'record-'+id,type:'clinical-interest',field:'areas_of_interest',text:'Passage '+id,sourceLabel:'Hospital profile',dates:{},...extra});
const article=(html,id)=>html.match(new RegExp('<article id="evidence-'+id+'"[\\s\\S]*?</article>'))?.[0]||'';

test('selected passage appears once and every other passage remains in a closed group',()=>{
  const selected=fact('chosen'),other=fact('other'),html=renderSourcePage(person,[other,selected,selected],selected);
  assert.equal((html.match(/id="evidence-chosen"/g)||[]).length,1);
  assert.equal((html.match(/Passage chosen/g)||[]).length,1);
  assert(html.indexOf('id="evidence-chosen"')<html.indexOf('class="source-reader-collection"'));
  assert.match(html,/<details class="source-reader-group"><summary><span>Clinical work and interests<\/span><span class="source-reader-count">1 passage/);
  assert(!html.includes('<details class="source-reader-group" open'));
  assert(!html.includes('style='));
});

test('header retains full identity, honest navigation and only the small source-reader script',()=>{
  const html=renderSourcePage(person,[fact('one')],fact('one')),header=html.match(/<header[\s\S]*?<\/header>/)[0];
  assert(header.includes('<h1>'+person.name+'</h1>'));
  assert(header.includes('href="/expert-discovery">Open Expert Discovery</a>'));
  assert(!header.includes('switch back'));
  assert(html.indexOf('switch back to its original tab')>html.indexOf('source-reader-collection-title'));
  assert.match(html,/<script src="\/expert-assets\/source-reader.js" defer><\/script>/);
  assert(!html.includes('app.js'));assert(!html.includes('<script>'));
});

test('groups use field-aware fixed order and research interests stay interests',()=>{
  const facts=[fact('relationship',{type:'relationship',field:'about'}),fact('location',{type:'professional-background',field:'locations'}),fact('background',{type:'training',field:'about'}),fact('research',{field:'research_interests'}),fact('procedure',{type:'procedure',field:'procedures'}),fact('clinical')];
  const html=renderSourcePage(person,facts);
  const expected=['Clinical work and interests','Procedures','Research','Background and qualifications','Practice locations','Relationships'];
  let last=-1;for(const label of expected){const index=html.indexOf('<summary><span>'+label+'</span>');assert(index>last,label);last=index;}
  assert(article(html,'research').includes('Listed research interests'));
  assert(article(html,'procedure').includes('Recorded procedure listing'));
  assert(article(html,'background').includes('Recorded training'));
  assert(!article(html,'research').includes('Recorded clinical activity'));
});

test('background fields have meaningful labels without reclassifying training or activity',()=>{
  const facts=[fact('qualification',{type:'professional-background',field:'qualifications'}),fact('specialty',{type:'professional-background',field:'specialty_alternatives'}),fact('biography',{type:'professional-background',field:'about_alternatives'}),fact('report',{type:'clinical-practice',field:'about'}),fact('listing',{type:'publication',field:'publications',qualifiers:['publication-listing-link-not-authorship']})];
  const html=renderSourcePage(person,facts);
  for(const [id,label] of [['qualification','Recorded qualifications'],['specialty','Recorded specialty'],['biography','Stored biography excerpt'],['report','Recorded clinical activity'],['listing','Publication reference']])assert(article(html,id).includes(label),id);
});

test('passages sort by provider then field then identifier rather than corpus insertion',()=>{
  const facts=[fact('z',{sourceLabel:'Provider Z',field:'about'}),fact('b',{sourceLabel:'Provider A',field:'interests'}),fact('c',{sourceLabel:'Provider A',field:'about'}),fact('a',{sourceLabel:'Provider A',field:'about'})];
  const html=renderSourcePage(person,facts),ids=[...html.matchAll(/<article id="evidence-([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,['a','c','b','z']);
});

test('provenance deduplicates only identical entries and retains differing dates, attribution and limitations',()=>{
  const one=fact('one',{sourceUrl:'https://hospital.example/profile',attribution:'source-record',dates:{sourceDate:'2010-01-01',observedAt:'2026-10-08'}});
  const same={...one,dates:{observedAt:'2026-10-08',sourceDate:'2010-01-01'}};
  const changedDate={...one,dates:{...one.dates,sourceDate:'2012-01-01'}};
  const changedAttribution={...one,attribution:'reviewed-identity'};
  const changedLimit={...one,review:{limitations:['The source only describes training.']}};
  const html=renderSourcePage(person,[{...one,sources:[same,same,changedDate,changedAttribution,changedLimit]}],one);
  assert.equal((html.match(/class="source-reader-provenance"/g)||[]).length,3);
  assert(html.includes('2012-01-01'));assert(html.includes('reviewed-identity'));assert(html.includes('The source only describes training.'));
  assert.equal((html.match(/Open original page — Hospital profile/g)||[]).length,4,'One main URL, three materially distinct provenance entries');
});

test('sources without original URLs retain distinct stored provenance',()=>{
  const one=fact('one',{sources:[{sourceRecordId:'record-alternative',field:'about_alternatives',sourceLabel:'Alternative stored biography',dates:{sourceDate:'2015-06-01'}}]});
  const html=renderSourcePage(person,[one],one);
  assert(html.includes('record-alternative'));assert(html.includes('Alternative stored biography'));assert(html.includes('2015-06-01'));
  assert(!html.includes('href="null"'));
});

test('reviewed summary and literal proof have separate labels and escaped semantic content',()=>{
  const one=fact('one',{text:'Reviewed interpretation & context.',reviewedParaphrase:true,sourceQuote:'Reports CT & MR.',review:{limitations:['Does not establish current practice.']}}),html=renderSourcePage(person,[one],one);
  assert(html.includes('Reviewed source summary'));assert(html.includes('Exact source excerpt'));
  assert(html.includes('<blockquote>Reports CT &amp; MR.</blockquote>'));
  assert(!html.includes('<blockquote>Reviewed interpretation'));
  assert(html.includes('Does not establish current practice.'));
  assert.equal((html.match(/Reports CT &amp; MR\./g)||[]).length,1);
});

test('summary-only records never manufacture a literal source excerpt',()=>{
  const one=fact('one',{reviewedParaphrase:true,sourceQuote:null}),html=renderSourcePage(person,[one],one);
  assert(html.includes('No literal excerpt was recorded; this is a reviewed summary.'));
  assert(!html.includes('Exact source excerpt'));assert(!html.includes('<blockquote>'));
});

test('explicit list and paragraph sequence keeps short and negative entries and escapes source text',()=>{
  const one=fact('one',{type:'biography',field:'about',text:'Areas include:\n- CT\n- MR\nNo present clinical practice.\n- <script>alert(1)</script>\nFinal paragraph.'}),html=renderSourcePage(person,[one],one);
  assert(html.includes('<blockquote><p>Areas include:</p><ul><li>CT</li><li>MR</li></ul><p>No present clinical practice.</p><ul><li>&lt;script&gt;alert(1)&lt;/script&gt;</li></ul><p>Final paragraph.</p></blockquote>'));
  assert.equal((html.match(/No present clinical practice\./g)||[]).length,1);
  assert(!html.includes('<script>alert'));
});

test('flattened medical procedure strings are not split into inferred procedures or counts',()=>{
  const text='Brain tumour surgery, e.g. SRT/SBRT and Gamma Knife; biopsy +/- imaging 10–20',one=fact('one',{type:'procedure',field:'procedures_completed',text}),html=renderSourcePage(person,[one]);
  assert(html.includes('<blockquote>'+text+'</blockquote>'));
  assert(html.includes('1 passage'));assert(!html.includes('1 procedure'));assert(!html.includes('<li>Brain'));
});

test('renderer cannot display foreign or detached selected evidence and does not mutate sources',()=>{
  const own=fact('own'),foreign=fact('foreign',{candidateId:'b',text:'FOREIGN SECRET'}),detached={...own,text:'REPLACEMENT CLAIM'},facts=[own,foreign],before=JSON.stringify(facts);
  const html=renderSourcePage(person,facts,detached);
  assert(html.includes('Passage own'));assert(!html.includes('REPLACEMENT CLAIM'));assert(!html.includes('FOREIGN SECRET'));
  assert.equal(JSON.stringify(facts),before);
});

test('unsafe URL credentials, protocols and hostile names never become executable page content',()=>{
  const one=fact('one',{sourceUrl:'javascript:alert(1)',sourceLabel:'<img onerror=alert(1)>',sources:[{sourceUrl:'https://secret:password@example.org/profile'},{sourceUrl:'data:text/html,evil'}]}),html=renderSourcePage({...person,name:'<script>evil()</script>'},[one],one);
  assert(!html.includes('javascript:'));assert(!html.includes('secret:password'));assert(!html.includes('data:text/html'));
  assert(html.includes('&lt;script&gt;evil()&lt;/script&gt;'));assert(html.includes('&lt;img onerror=alert(1)&gt;'));
});

test('unknown and recorded dates are visible while their general qualification appears once',()=>{
  const html=renderSourcePage(person,[fact('one'),fact('two',{dates:{sourceDate:'2015-01-01',mergeDate:'2026-01-01'}})]);
  assert(html.includes('Source date: Not recorded.'));assert(html.includes('Source date: 2015-01-01.'));
  assert.equal((html.match(/Source dates describe the available record/g)||[]).length,1);
  assert(html.indexOf('<summary>Record details</summary>')<html.indexOf('2026-01-01'));
});

test('empty evidence gets an explicit state without an empty disclosure group',()=>{
  const html=renderSourcePage(person,[]);
  assert(html.includes('No source passages are available for this professional.'));assert(!html.includes('<details class="source-reader-group">'));
});

test('aggregate qualifiers do not duplicate otherwise identical stored source provenance',()=>{
  const one=fact('one',{type:'training',qualifiers:['training-not-practice'],sourceUrl:'https://hospital.example/profile'});
  const stored={sourceRecordId:one.sourceRecordId,field:one.field,sourceLabel:one.sourceLabel,sourceUrl:one.sourceUrl,dates:one.dates};
  const html=renderSourcePage(person,[{...one,sources:[stored]}],one);
  assert(!html.includes('class="source-reader-provenance"'));
  assert(html.includes('Training does not establish current practice.'));
});

test('provenance with distinct reviewed excerpts is retained even at the same source URL',()=>{
  const one=fact('one',{reviewedParaphrase:true,sourceQuote:'First literal excerpt.',sourceUrl:'https://hospital.example/profile'});
  const html=renderSourcePage(person,[{...one,sources:[{...one,sourceQuote:'Second literal excerpt.'}]}],one);
  assert.equal((html.match(/class="source-reader-provenance"/g)||[]).length,1);
  assert(html.includes('<blockquote>Second literal excerpt.</blockquote>'));
});

test('a name-only publication excerpt remains distinct from study-context summary',()=>{
  const one=fact('norris',{type:'research',text:'The study evaluates a skin-lesion diagnostic aid in primary care.',reviewedParaphrase:true,sourceQuote:'Paul Norris',review:{limitations:['Coauthorship does not establish a particular investigator task.']}}),html=renderSourcePage({id:'a',name:'Dr Paul Norris'},[one],one);
  assert(html.includes('<blockquote>Paul Norris</blockquote>'));
  assert(!html.includes('<blockquote>The study evaluates'));
  assert(html.includes('Coauthorship does not establish a particular investigator task.'));
});

test('ordinary procedure lines preserve continuations without inventing procedure boundaries',()=>{
  const one=fact('herbert',{type:'procedure',field:'procedures',text:'Brain tumour treatments e.g.\nSRT/SBRT and Gamma Knife\n10–20 admissions'}),html=renderSourcePage(person,[one],one);
  assert(html.includes('<blockquote><p>Brain tumour treatments e.g.</p><p>SRT/SBRT and Gamma Knife</p><p>10–20 admissions</p></blockquote>'));
  assert(!article(html,'herbert').includes('<li>'));
});
