'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
// Exercise the actual profile renderers with a small DOM. Transport and broader
// navigation ownership are covered by ui-state.test.cjs; no model calls here.
class Element {
  constructor(tag='div'){this.tagName=tag;this.className='';this.children=[];this.attributes={};this.events={};this.dataset={};this._text='';this.open=false;this.disabled=false;this.scrollTop=0;this.parentNode=null;this.style={removeProperty(){}};}
  set textContent(value){this._text=String(value);this.children=[];} get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  get classList(){return {contains:value=>this.className.split(' ').includes(value),add:(...values)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...values])].join(' ');},remove:(...values)=>{this.className=this.className.split(' ').filter(value=>!values.includes(value)).join(' ');},toggle:(value,force)=>{const add=force??!this.classList.contains(value);add?this.classList.add(value):this.classList.remove(value);return add;}};}
  append(...children){for(let child of children){if(typeof child==='string')child=Object.assign(new Element('#text'),{_text:child});if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(item=>item!==child);child.parentNode=this;this.children.push(child);}}
  replaceChildren(...children){this._text='';this.children.forEach(child=>child.parentNode=null);this.children=[];this.append(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);} getAttribute(key){return this.attributes[key];}
  addEventListener(name,fn){(this.events[name]||=[]).push(fn);} click(){if(this.disabled)return;const event={target:this,button:0,defaultPrevented:false};for(let node=this;node;node=node.parentNode)for(const fn of node.events.click||[])fn(event);}
  querySelectorAll(selector){const found=[];const walk=node=>{for(const child of node.children){if(selector.startsWith('.')?child.classList.contains(selector.slice(1)):child.tagName===selector)found.push(child);walk(child);}};walk(this);return found;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;} get firstElementChild(){return this.children[0];} get childElementCount(){return this.children.length;}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  closest(selectors){if(selectors.split(',').some(selector=>selector.trim()===this.tagName))return this;return this.parentNode?.closest(selectors)||null;}
  getBoundingClientRect(){return this.rect||{top:0,bottom:100};} get isConnected(){return true;}
  showModal(){this.open=true;} close(){this.open=false;} focus(){} scrollIntoView(){throw new Error('Profile opening must not scroll into view');}
}
function harness(){
  const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const el=(tag,className,text)=>{const node=new Element(tag);node.className=className||'';if(text!==undefined)node.textContent=text;return node;};
  const list=value=>Array.isArray(value)?value:value?[value]:[];
  const citations=person=>list(person.personalizedMatch?.citations).filter(item=>item.text&&item.sourceUrl);
  const loads=[],routes=[],restored=[];
  const runtime={$,el,list,textValue:value=>typeof value==='string'?value:value?.name||value?.label||'',icon:name=>el('svg','icon'),baselineCitations:citations,
    link:(label,url,className)=>url?el('a',className,label):null,portrait:()=>el('div','avatar'),safeUrl:value=>value||null,
    state:{epoch:1,busy:false},matchSheet:{entry:null,dialog:$('dialog'),version:0},reducedMotion:true,explanationNumber:0,sheetDrag:null,
    document:{createDocumentFragment:()=>new Element('fragment'),createTextNode:text=>el('#text','',text),body:el('body')},
    window:{setTimeout:()=>0,clearTimeout(){}},renderSheetCaveats(){},renderSheetSources(){const previous=$('sheet-provenance').querySelector('details');const details=new Element('details');details.open=previous?.open||false;$('sheet-provenance').replaceChildren(details);},reset(){},
    cancelExplanation(entry){if(entry)entry.pending=null;},captureResultsPosition(){return {top:$('results-region').scrollTop};},restoreResultsPosition(snapshot){restored.push(snapshot);$('results-region').scrollTop=snapshot.top;},profileRouteClosed(){},
    loadMatchExplanation(entry){loads.push(entry);},profileRouteOpened(entry,explain){routes.push({entry,explain});}};
  vm.createContext(runtime);
  vm.runInContext(section('  function closeMatchSheet(', '  function sourceLabel(')+section('  function displayProfileText(', '  function checkedExplanation(')+section('  function openMatchSheet(', "  $('sheet-close').addEventListener")+section('  function differentiator(', '  function renderResponse('),runtime);
  return {runtime,$,loads,routes,restored};
}
const consultant={id:'example',name:'Dr Example',specialty:'Orthopaedic surgery',gmc:'1234567',description:'The source describes a consultant with a practice in knee and hip conditions.',
  clinicalInterests:['Hip arthritis','Knee replacement','Sports injuries','Meniscal surgery'],procedures:['Orthopaedics - hip and knee'],languages:['English','French'],
  locations:[{name:'Spire Example Hospital',address:'Example Road',city:'London',postcode:'SW5 0AA'},{name:'Spire Second Hospital',postcode:'WD1 1AA'}],
  profileUrl:'https://www.spirehealthcare.com/example',evidenceUrl:'/sources/example',distanceMiles:4.2,distanceLabel:'4.2 mi from SW5',insurers:[],
  personalizedMatch:{summary:'A grounded summary of the listed knee practice.',citations:[{text:'Record lists: Knee replacement',sourceUrl:'/sources/example',criterion:'Knee replacement'}]}};
const entry=person=>({person,context:{criteria:{topic:'knee',procedures:['Knee replacement']}},epoch:1,cached:null,pending:null,error:null});

test('profile essentials and expanded reading state survive AI loading, success, failure and retry',()=>{
  const {runtime:r,$}=harness();const selected=entry(consultant);r.matchSheet.entry=selected;r.renderSheet(selected);
  const profile=$('sheet-content').querySelector('.consultant-profile');const more=profile.querySelector('.profile-clinical');assert.equal(profile.querySelectorAll('details').length,3);for(const details of profile.querySelectorAll('details'))assert.equal(details.open,false);more.open=true;
  assert.equal($('sheet-content').firstElementChild.classList.contains('profile-match-panel'),true);
  for(const text of ['About','Clinical focus','Spire Example Hospital','Spire Second Hospital','SW5 0AA','Languages listed','French','1234567','View full Spire profile'])assert.ok(profile.textContent.includes(text),text);
  assert.doesNotMatch(profile.textContent,/Relevant to your search|Full profile summary/);
  const expected=profile.textContent;assert.match($('sheet-content').textContent,/Personalise my match/);
  selected.pending={};r.renderSheet(selected);assert.equal($('sheet-content').querySelector('.consultant-profile'),profile);assert.equal(profile.textContent,expected);assert.match($('sheet-content').textContent,/Personalising your explanation/);assert.equal(more.open,true);
  selected.pending=null;selected.cached={summary:'A personalised explanation with source support.',provider:'openrouter'};r.renderSheet(selected);
  assert.equal($('sheet-content').querySelector('.consultant-profile'),profile);assert.equal(profile.textContent,expected);assert.match($('sheet-content').textContent,/AI-generated explanation/);assert.doesNotMatch($('sheet-content').textContent,/A grounded summary/);
  selected.error=new Error('Temporary service issue');r.renderSheet(selected);assert.equal(profile.textContent,expected);assert.match($('sheet-content').textContent,/Temporary service issue/);assert.match($('sheet-content').textContent,/A personalised explanation/);
  selected.error=null;selected.pending={};r.renderSheet(selected);assert.equal(profile.textContent,expected);assert.equal(more.open,true);assert.equal($('sheet-content').getAttribute('aria-busy'),'false');assert.equal($('sheet-content').querySelector('.profile-match-panel').getAttribute('aria-busy'),'true');
});

test('the single primary card action opens immediately with AI, while history restoration does not request it',()=>{
  const {runtime:r,$,loads}=harness();const card=r.consultantCard(consultant,0,{criteria:{topic:'knee'},sessionId:'session',searchId:'search'});
  assert.equal(card.querySelectorAll('.card-focus-text').length,1);assert.match(card.textContent,/listed practice/);assert.match(card.textContent,/Why consider this consultant/);
  const view=card.querySelector('.view-consultant');assert.equal(card.querySelectorAll('.view-consultant').length,1);view.click();const first=r.matchSheet.entry;
  assert.equal(r.matchSheet.dialog.open,true);assert.equal(loads.length,1);assert.equal(r.matchSheet.returnFocus,view);assert.match($('sheet-content').textContent,/Practice locations/);
  r.closeMatchSheet();r.openMatchSheet(first,{explain:false});assert.equal(r.matchSheet.entry,first);assert.equal(loads.length,1);assert.equal(loads[0],first);assert.equal(r.matchSheet.returnFocus,view);assert.equal(loads[0].request.searchId,'search');assert.equal(loads[0].request.consultantId,'example');
});

test('highlights retain exact clinical text and do not promote specialty tags, biography or terminology into procedures',()=>{
  const {runtime:r}=harness();const person={...consultant,clinicalInterests:['Knee replacement','Hip arthritis'],personalizedMatch:{citations:[
    {text:'I have over 25 years of experience.',criterion:'Profile',sourceUrl:'/sources/example'},
    {text:'Keyhole surgery is called laparoscopy.',criterion:'Plain-English terminology',kind:'terminology',sourceUrl:'https://www.nhs.uk'},
    {text:'Record lists: Knee replacement',criterion:'Procedure',sourceUrl:'/sources/example'}]}};
  assert.deepEqual(Array.from(r.profileHighlights(person,{criteria:{topic:'knee'}},3),item=>item.text),['Knee replacement','Hip arthritis']);
  const empty={...person,clinicalInterests:[],personalizedMatch:{citations:[]}};assert.equal(r.profileHighlights(empty,{},3).length,0);
});

test('summary without linked evidence is not displayed, while genuine available profile details remain',()=>{
  const {runtime:r,$}=harness();const selected=entry({...consultant,personalizedMatch:{summary:'UNVERIFIED SUMMARY',citations:[]}});r.matchSheet.entry=selected;r.renderSheet(selected);
  assert.doesNotMatch($('sheet-content').textContent,/UNVERIFIED SUMMARY/);assert.match($('sheet-content').textContent,/Example Road/);assert.match($('sheet-content').textContent,/Knee replacement/);
});

test('malformed display fragments are withheld without losing valid short clinical terms',()=>{
  const {runtime:r}=harness();
  const broken=['tise:Knee Su','Knee and Hip su','ea of Expe','Sports knee injuries (meniscal management','Specialist interests (Knee & Hip)Knee arthroscopy','Meniscal surgery...','Painful knees & hipsHip surgery:- Robotic-assisted surgery. Primary hip replacement'];
  for(const text of broken)assert.equal(r.readableProfileExcerpt(text),false,text);
  for(const text of ['Hip OA','Upper GI','Ear surgery','Laser eye surgery','Sports knee injuries (meniscal management)','McMurray testing','Dupuytren’s disease','ACL reconstruction','DeQuervain release','eGFR assessment'])assert.equal(r.readableProfileExcerpt(text),true,text);
  const person={...consultant,clinicalInterests:broken,personalizedMatch:{citations:[]}};
  assert.equal(r.profileHighlights(person).length,0);const selected=entry(person);r.matchSheet.entry=selected;r.renderSheet(selected);
  assert.equal(r.$('sheet-content').querySelector('.profile-clinical'),null);
  r.validCitations=value=>value||[];r.fullCaveats=()=>[];r.sourceLabel=()=> 'Source';
  vm.runInContext(section('  function renderSheetSources(', '  function renderSheetCaveats('),r);r.renderSheetSources(selected);
  for(const text of broken)assert.ok(r.$('sheet-provenance').textContent.includes(text),`exact evidence retained: ${text}`);
});

test('card and initial Why relevance use a complete clinical sentence without duplicate summary sections',()=>{
  const {runtime:r,$}=harness();const summary='Dr Example is an orthopaedic surgeon whose profile includes knee replacement. That connects with your knee search and gives you a specific area of practice to discuss, without assuming which treatment would be right for you. The nearest listed Spire practice is about 4.2 miles away in a straight line.';
  const person={...consultant,personalizedMatch:{...consultant.personalizedMatch,summary}};
  const card=r.consultantCard(person,0,{criteria:{topic:'knee'}});const concise=r.conciseProfileRelevance(person,{criteria:{topic:'knee'}});
  assert.equal(concise,'The profile includes knee replacement.');assert.doesNotMatch(concise,/Dr Example|That connects|nearest|\.\.\.|…/);
  const selected=entry(person);r.matchSheet.entry=selected;r.renderSheet(selected);
  const profile=$('sheet-content').querySelector('.consultant-profile');assert.equal(profile.children[0].classList.contains('profile-about'),true);assert.equal(profile.querySelector('.profile-full-summary'),null);assert.equal($('sheet-content').querySelector('.sheet-preview').textContent,'From profile evidenceThe profile includes knee replacement.');
  selected.cached={summary:'An additional AI explanation.',provider:'openrouter'};r.renderSheet(selected);assert.equal($('sheet-content').querySelector('.sheet-preview'),null);assert.equal(profile.querySelector('.profile-full-summary'),null);
});

test('display sentence spacing is repaired without changing the original description and AI action focus stays in the panel',()=>{
  const {runtime:r,$}=harness();const person={...consultant,description:'He qualified in 1997.He trained in London.'};const selected=entry(person);r.matchSheet.entry=selected;r.renderSheet(selected);
  assert.equal(person.description,'He qualified in 1997.He trained in London.');assert.match($('sheet-content').textContent,/1997\. He trained/);
  const panel=$('sheet-content').querySelector('.profile-match-panel'),start=panel.querySelector('.explanation-start');let focused=false;panel.focus=()=>{focused=true;r.document.activeElement=panel;};r.document.activeElement=start;
  selected.pending={};r.renderSheet(selected);assert.equal(focused,true);assert.equal(r.document.activeElement,panel);assert.equal(panel.getAttribute('tabindex'),'-1');
  focused=false;r.document.activeElement=$('sheet-content').querySelector('.profile-about');selected.pending=null;selected.error=new Error('offline');r.renderSheet(selected);assert.equal(focused,false);
});

test('generic anatomy summaries prefer a documented clinical interest or a complete genuine biography sentence',()=>{
  const {runtime:r}=harness();const person={...consultant,clinicalInterests:['Knee arthroscopy','Shoulder'],personalizedMatch:{summary:'Dr Example is an orthopaedic surgeon whose profile includes knee. That connects with your search.',citations:[{text:'Record lists: knee',criterion:'Clinical interest',sourceUrl:'/sources/example'}]}};
  assert.equal(r.conciseProfileRelevance(person,{criteria:{topic:'knee'}}),'The profile lists Knee arthroscopy.');
  assert.deepEqual(Array.from(r.profileHighlights(person,{},3),item=>item.text),['Knee arthroscopy']);
  const biographyOnly={...person,clinicalInterests:['Knee'],description:'The source describes a consultant with a practice in knee and hip conditions.'};
  assert.equal(r.conciseProfileRelevance(biographyOnly),biographyOnly.description);
  assert.equal(r.informativeProfilePhrase('The profile includes knee.'),false);assert.equal(r.informativeProfilePhrase('Hip and knee.'),false);assert.equal(r.informativeProfilePhrase('The profile includes endometriosis.'),true);
});

test('the Rahij Anwar source corruption stays in evidence and falls back to an intact clinical biography sentence',()=>{
  const {runtime:r,$}=harness();
  // Exact public clinical-interest strings from bupa_27074, mapped as
  // supabase-c-4752679. The source split ordinary words at the letter r.
  const raw=['Knee and Hip su','ge','yA','ea of Expe','tise:Knee Su','yHip Su','yGene','al O','thopaedicsâ€‹'];
  const clinical='My subspecialty is lower limb surgery and I have a particular specialist interest in hip and knee surgery.';
  const person={...consultant,id:'supabase-c-4752679',name:'Mr Rahij Anwar',clinicalInterests:raw,
    description:`I am a highly-qualified Consultant Orthopaedic and Trauma Surgeon with over 20 years of experience in various capacities and have been a consultant for over seven years. ${clinical}`,
    personalizedMatch:{summary:'Mr Rahij Anwar has a profile that includes yGene.',citations:[{text:'Record lists: yGene',sourceUrl:'/sources/supabase-c-4752679',criterion:'Clinical interest'}]}};
  assert.equal(r.profileHighlights(person,{criteria:{topic:'knee'}},3).length,0);
  const card=r.consultantCard(person,0,{criteria:{topic:'knee'}});assert.doesNotMatch(card.textContent,/yGene|thopaedicsâ|highly-qualified/);assert.equal(r.conciseProfileRelevance(person,{criteria:{topic:'knee'}}),clinical);
  const selected=entry(person);r.matchSheet.entry=selected;r.renderSheet(selected);assert.equal($('sheet-content').querySelector('.profile-clinical'),null);
  r.validCitations=value=>value||[];r.fullCaveats=()=>[];r.sourceLabel=()=> 'Source';vm.runInContext(section('  function renderSheetSources(', '  function renderSheetCaveats('),r);r.renderSheetSources(selected);
  for(const text of raw)assert.ok($('sheet-provenance').textContent.includes(text),text);
  for(const text of ['Ménière’s disease','Sjögren syndrome','iStent surgery','eGFR assessment'])assert.equal(r.readableProfileExcerpt(text),true,text);
  for(const text of ['thopaedicsâ€‹','MÃ©niÃ¨re disease','Knee\uFFFD surgery','KneeÂ\u00a0surgery'])assert.equal(r.readableProfileExcerpt(text),false,text);
});

test('whole-card activation delegates once to its native button and leaves links and selected text independent',()=>{
  const {runtime:r,loads}=harness();const card=r.consultantCard(consultant,0,{criteria:{topic:'knee'},sessionId:'session',searchId:'search'});
  assert.equal(card.getAttribute('role'),undefined);assert.equal(card.getAttribute('tabindex'),undefined);assert.equal(card.querySelectorAll('.view-consultant').length,1);
  const sourceLink=new Element('a'),linkIcon=new Element('svg');sourceLink.append(linkIcon);card.append(sourceLink);linkIcon.click();assert.equal(loads.length,0);
  r.window.getSelection=()=>({isCollapsed:false,toString:()=> 'selected profile words'});card.click();assert.equal(loads.length,0);
  r.window.getSelection=()=>({isCollapsed:true,toString:()=> ''});r.state.busy=true;card.click();assert.equal(loads.length,0);r.state.busy=false;
  card.click();assert.equal(loads.length,1);assert.equal(r.matchSheet.returnFocus,card.querySelector('.view-consultant'));
});

test('reopening the same search and consultant preserves accordions, source disclosure and sheet scroll while restoring the results region',()=>{
  const {runtime:r,$,loads,restored}=harness();const context={criteria:{topic:'knee'},sessionId:'session',searchId:'search'};
  const card=r.consultantCard(consultant,0,context),button=card.querySelector('.view-consultant');$('results-region').scrollTop=571;button.click();
  const first=r.matchSheet.entry,profile=$('sheet-content').querySelector('.consultant-profile');profile.querySelector('.profile-about').open=true;profile.querySelector('.profile-locations').open=true;$('sheet-provenance').querySelector('details').open=true;$('sheet-scroll').scrollTop=312;
  first.cached={summary:'A checked match explanation.',provider:'openrouter'};$('results-region').scrollTop=0;r.closeMatchSheet();assert.equal($('results-region').scrollTop,571);assert.equal(restored.at(-1).top,571);
  button.click();assert.equal(r.matchSheet.entry,first);assert.equal(loads.length,1);assert.equal($('sheet-content').querySelector('.consultant-profile'),profile);assert.equal(profile.querySelector('.profile-about').open,true);assert.equal(profile.querySelector('.profile-locations').open,true);assert.equal($('sheet-provenance').querySelector('details').open,true);assert.equal($('sheet-scroll').scrollTop,312);
  const newer=r.consultantCard(consultant,0,{...context,searchId:'newer-search'});newer.querySelector('.view-consultant').click();assert.notEqual(r.matchSheet.entry,first);assert.equal($('sheet-scroll').scrollTop,0);assert.equal($('sheet-provenance').querySelector('details').open,false);for(const details of $('sheet-content').querySelectorAll('.profile-accordion'))assert.equal(details.open,false);
  r.closeMatchSheet();button.click();assert.equal($('sheet-scroll').scrollTop,312);assert.equal(profile.querySelector('.profile-about').open,true);
});

test('an explanation update preserves a reader’s position in details below the panel',()=>{
  const {runtime:r,$}=harness();const selected=entry(consultant);r.matchSheet.entry=selected;r.renderSheet(selected);
  const panel=$('sheet-content').querySelector('.profile-match-panel'),profile=$('sheet-content').querySelector('.consultant-profile');$('sheet-scroll').scrollTop=240;$('sheet-scroll').rect={top:0,bottom:600};panel.rect={top:-300,bottom:-10};let profileTop=-10;profile.getBoundingClientRect=()=>({top:profileTop,bottom:800});
  const replace=panel.replaceChildren.bind(panel);panel.replaceChildren=(...children)=>{replace(...children);profileTop+=80;};selected.cached={summary:'A longer checked explanation.',provider:'openrouter'};r.renderSheet(selected);assert.equal($('sheet-scroll').scrollTop,320);
});
