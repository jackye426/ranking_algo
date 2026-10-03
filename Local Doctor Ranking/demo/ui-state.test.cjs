// State integration checks with a minimal DOM and mocked transport. These cover
// request ownership, history and sheet lifecycle; browser QA covers layout,
// native focus trapping, gestures and animation.
const test=require('node:test');
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8'),source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8'),ids=new Map();
class E{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.attributes={};this.events={};this.style={setProperty(k,v){this[k]=v},removeProperty(k){delete this[k]}};this.dataset={};this._text='';this.className='';this.hidden=false;this.disabled=false;this.value='';this.scrollHeight=34;this.open=false}
 set textContent(v){this._text=String(v);this.children.forEach(c=>c.parentNode=null);this.children=[]}get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 get classList(){return{add:(...cs)=>{for(const c of cs)if(!this.className.split(' ').includes(c))this.className=(this.className+' '+c).trim()},remove:(...cs)=>{this.className=this.className.split(' ').filter(v=>!cs.includes(v)).join(' ')},contains:c=>this.className.split(' ').includes(c),toggle:(c,v)=>{const on=v===undefined?!this.className.split(' ').includes(c):v;on?this.classList.add(c):this.classList.remove(c);return on}}}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);if(k==='id'){this.id=String(v);ids.set(this.id,this)}}getAttribute(k){return this.attributes[k]??null}
 append(...items){for(let child of items){if(typeof child==='string'){const n=new E('#text');n.textContent=child;child=n}child.remove();child.parentNode=this;this.children.push(child)}}
 prepend(...items){for(const child of items.reverse()){child.remove();child.parentNode=this;this.children.unshift(child)}}
 replaceChildren(...items){this.children.forEach(c=>c.parentNode=null);this.children=[];this._text='';this.append(...items)}
 remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null}}
 addEventListener(name,fn){(this.events[name]||=[]).push(fn)}emit(name,event={}){for(const fn of this.events[name]||[])fn({target:this,preventDefault(){},...event})}click(){if(!this.disabled){this.focus();this.emit('click')}}requestSubmit(){this.emit('submit')}focus(){document.activeElement=this}scrollIntoView(){}
 showModal(){this._opener=document.activeElement;this.open=true}close(){this.open=false;this._opener?.focus();setTimeout(()=>this.emit('close'),0)}getBoundingClientRect(){return{left:0,right:600,top:0,bottom:100,width:600,height:100}}get firstElementChild(){return this.children[0]||null}closest(s){return s.split(',').some(v=>this.matches(v.trim()))?this:this.parentNode?.closest(s)||null}
 contains(node){return node===this||this.children.some(child=>child.contains(node))}
 get childElementCount(){return this.children.length}get isConnected(){return this===document.body||!!this.parentNode?.isConnected}
 matches(s){if(s==='[data-query]')return!!this.dataset.query;const tag=s.match(/^[a-z]+/i)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;for(const cls of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(cls[1]))return false;return!!(tag||s.startsWith('.'))}
 querySelectorAll(selectors){const all=[];const visit=n=>{for(const c of n.children){if(selectors.split(',').some(s=>c.matches(s.trim())))all.push(c);visit(c)}};visit(this);return all}querySelector(s){return this.querySelectorAll(s)[0]||null}
}
const document={visibilityState:'visible',addEventListener(){},createDocumentFragment:()=>new E('fragment'),body:new E('body'),activeElement:null,getElementById:id=>ids.get(id)||null,createElement:t=>new E(t),createElementNS:(_,t)=>new E(t),createTextNode:t=>{const e=new E('#text');e.textContent=t;return e},querySelectorAll:s=>document.body.querySelectorAll(s),querySelector:s=>document.body.querySelector(s)};
for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const n=new E(m[1]);n.setAttribute('id',m[3]);n.className=m[2].match(/class="([^"]+)"/)?.[1]||'';n.hidden=/\bhidden\b/.test(m[2]);document.body.append(n)}
for(const id of ['initial-query','followup-query'])ids.get(id).form=ids.get(id==='initial-query'?'landing-form':'followup-form');
for(const id of ['landing-form','followup-form']){const b=new E('button');b.className='send-button';ids.get(id).append(b)}
const overview=new E();overview.className='search-overview';document.body.append(overview);
const overlayText=new E('span');overlayText.className='search-example-text';ids.get('search-example').append(overlayText);
const requests=[];
function fetch(url,options){if(url==='/api/health')return Promise.resolve({ok:true,json:async()=>({ready:true,recordCount:4031})});return new Promise((resolve,reject)=>requests.push({url,options,body:JSON.parse(options.body),resolve:body=>resolve({ok:true,status:200,headers:{get:()=>null},json:async()=>body}),reject}))}
const window={scrollX:0,scrollY:0,innerHeight:800,location:{origin:'http://localhost:3000'},matchMedia:()=>({matches:true}),addEventListener(){},scrollTo(){},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout};
vm.runInNewContext(source,{document,window,history:{},fetch,URL,AbortController,console,setTimeout,clearTimeout});
const tick=()=>new Promise(r=>setImmediate(r)),flush=async()=>{await tick();await tick()},$=id=>ids.get(id),submit=m=>{$('followup-query').value=m;$('followup-form').requestSubmit()},visible=()=>document.querySelectorAll('.turn').filter(n=>!n.hidden);
const person={id:'tim',name:'Mr Timothy Waters',specialty:'Consultant Orthopaedic Surgeon',locations:[{name:'Spire Bushey',postcode:'WD6 3SU'}],insurers:['Bupa'],insuranceEvidence:[{insurer:'Bupa',text:'Not fee assured. Some fees can exceed cover.',sourceUrl:'https://finder.bupa.co.uk/tim'}],profileUrl:'https://www.spirehealthcare.com/tim',evidenceUrl:'/sources/tim',personalizedMatch:{summary:'A source-based summary of the listed knee replacement practice.',citations:[{id:'bio',text:'I am a Consultant Orthopaedic Surgeon with over 25 years of experience.',sourceUrl:'/sources/tim'},{id:'e1',text:'Knee replacement',sourceUrl:'/sources/tim'}],caveats:['Procedure evidence describes recorded practice; confirm availability.']}};
const data=(searchId,insurance=null,total=104)=>({sessionId:'session',searchId,criteria:{topic:'knee',location:'London',insurance},criteriaLabels:[{key:'topic',label:'Knee'},{key:'location',label:'London'},...(insurance?[{key:'insurance',label:insurance}]:[])],message:'Search completed',total,results:[person],notices:[],suggestions:[]});
test('frontend preserves search state and owns explanation requests across sheet, history and reset',async()=>{
 $('initial-query').value='Find knee London';$('landing-form').requestSubmit();assert.equal(requests.length,1);requests.at(-1).resolve(data('s1'));await flush();
 assert.equal(visible().length,1);assert.equal(requests.filter(r=>r.url==='/api/match-explanation').length,0);
 assert.equal(visible()[0].querySelectorAll('.profile-details').length,0);assert.match(visible()[0].textContent,/Profile includes.*Knee replacement/);
 let why=visible()[0].querySelector('.explanation-toggle');why.click();let pending=requests.at(-1);
 assert.equal($('match-dialog').open,true);assert.equal(pending.url,'/api/match-explanation');assert.equal(pending.body.searchId,'s1');assert.equal($('sheet-close'),document.activeElement);
 why.click();assert.equal(requests.at(-1),pending);assert.match($('sheet-content').textContent,/Personalising your explanation/);assert.match($('sheet-caveats').textContent,/Not fee assured/);assert.match($('sheet-content').textContent,/Profile summary.*A source-based summary/);assert.doesNotMatch($('sheet-content').textContent,/AI-generated explanation/);assert.equal($('sheet-content').querySelectorAll('.sheet-skeleton').length,0);
 $('match-dialog').emit('cancel');assert.equal($('match-dialog').open,false);assert.equal(pending.options.signal.aborted,true);assert.equal(document.activeElement,why);
 const explanation={summary:'Your knee search matches the recorded practice.',reasons:[{title:'Knee',text:'Knee replacement is listed.',evidenceIds:['e1']}],citations:[{id:'e1',text:'Knee replacement',sourceUrl:'/sources/tim'}],caveats:['Not fee assured. Some fees can exceed cover.'],provider:'openrouter',retryable:false};
 pending.resolve({...explanation,summary:'STALE CLOSED RESPONSE'});await flush();assert.doesNotMatch($('sheet-content').textContent,/STALE/);
 why.click();assert.notEqual(requests.at(-1),pending);const openSources=$('sheet-provenance').querySelector('details');openSources.open=true;openSources.querySelector('summary').focus();requests.at(-1).resolve(explanation);await flush();assert.match($('sheet-content').textContent,/AI-generated explanation/);assert.doesNotMatch($('sheet-content').textContent,/A source-based summary/);assert.match($('sheet-provenance').textContent,/Source evidence|Insurance details/);assert.equal($('sheet-content').querySelectorAll('a').length,0);assert.equal(document.activeElement,$('sheet-provenance').querySelector('summary'));assert.equal($('sheet-provenance').querySelector('details').open,true);
 $('sheet-close').click();const requestCount=requests.length;why.click();assert.equal(requests.length,requestCount);assert.match($('sheet-content').textContent,/matches the recorded practice/);$('sheet-close').click();
 submit('Only Bupa');pending=requests.at(-1);assert.equal(visible().length,1);assert.doesNotMatch($('active-criteria').textContent,/Bupa/);pending.reject(new Error('Temporary connection failure'));await flush();assert.match($('result-total').textContent,/104/);assert.doesNotMatch($('active-criteria').textContent,/Bupa/);
 $('search-error').querySelector('.retry-button').click();requests.at(-1).resolve(data('s2','Bupa',4));await flush();assert.match($('active-criteria').textContent,/Bupa/);
 why=visible()[0].querySelector('.explanation-toggle');why.click();pending=requests.at(-1);assert.equal(pending.body.searchId,'s2');
 submit('Closer SW5');assert.equal($('match-dialog').open,false);assert.equal(pending.options.signal.aborted,true);const searchPending=requests.at(-1);
 pending.resolve({...explanation,summary:'STALE DURING REFINEMENT'});searchPending.resolve({...data('s3','Bupa',3),criteriaLabels:[{key:'topic',label:'Knee'},{key:'location',label:'SW5'},{key:'insurance',label:'Bupa'}]});await flush();assert.doesNotMatch($('sheet-content').textContent,/STALE/);
 submit('Failure before history');requests.at(-1).reject(new Error('offline'));await flush();assert.equal($('search-error').hidden,false);
 $('history-open').click();$('history-list').querySelectorAll('.text-button')[2].click();assert.match($('active-criteria').textContent,/London/);assert.equal($('followup-query').disabled,true);assert.equal($('search-error').hidden,true);
 const older=visible()[0].querySelector('.explanation-toggle');const beforeHistoryReveal=requests.length;older.click();assert.equal(requests.length,beforeHistoryReveal);assert.match($('sheet-content').textContent,/matches the recorded practice/);$('sheet-close').click();
 $('return-current').click();assert.match($('active-criteria').textContent,/SW5/);assert.equal($('followup-query').disabled,false);assert.equal($('search-error').hidden,false);
 why=visible()[0].querySelector('.explanation-toggle');why.click();pending=requests.at(-1);assert.equal(pending.body.searchId,'s3');$('new-search').click();assert.equal(pending.options.signal.aborted,true);pending.resolve({...explanation,summary:'STALE RESET'});await flush();assert.equal($('match-dialog').open,false);assert.equal($('workspace').hidden,true);assert.equal($('conversation').textContent,'');assert.doesNotMatch($('sheet-content').textContent,/STALE/);
 $('initial-query').value='fresh';$('landing-form').requestSubmit();pending=requests.at(-1);$('new-search').click();pending.resolve(data('late'));await flush();assert.equal($('workspace').hidden,true);
 $('initial-query').value='another search';$('landing-form').requestSubmit();requests.at(-1).resolve({...data('multi'),results:[person,{...person,id:'second',name:'Dr Test Consultant'},{...person,id:'unsourced',personalizedMatch:{summary:'UNVERIFIED PREVIEW',citations:[]}}]});await flush();
 const buttons=visible()[0].querySelectorAll('.explanation-toggle');buttons[0].click();const firstCardRequest=requests.at(-1);buttons[1].click();const secondCardRequest=requests.at(-1);
 assert.equal(firstCardRequest.options.signal.aborted,true);assert.equal(secondCardRequest.body.consultantId,'second');assert.equal(secondCardRequest.body.searchId,'multi');await flush();assert.equal($('match-dialog').open,true);assert.match($('sheet-identity').textContent,/Dr Test Consultant/);assert.equal(secondCardRequest.options.signal.aborted,false);
 firstCardRequest.resolve({...explanation,summary:'STALE OTHER CONSULTANT'});await flush();assert.doesNotMatch($('sheet-content').textContent,/STALE/);
 secondCardRequest.resolve({...explanation,caveats:['This test record is not fee assured and not in Open Referral.'],provider:'evidence',notice:'AI wording was not verified.',retryable:true});await flush();assert.match($('sheet-content').textContent,/Profile evidence/);assert.match($('sheet-caveats').textContent,/Not fee assured/);assert.match($('sheet-caveats').textContent,/Not in the Open Referral network/);assert.doesNotMatch($('sheet-content').textContent,/AI-generated explanation/);
 $('sheet-content').querySelector('.explanation-retry').click();requests.at(-1).reject(new Error('offline'));await flush();assert.match($('sheet-content').textContent,/offline/);assert.match($('sheet-content').textContent,/matches the recorded practice/);assert.match($('sheet-provenance').textContent,/Insurance details/);
 $('match-dialog').emit('pointerdown',{clientX:1000,clientY:1000});$('match-dialog').emit('click',{clientX:1000,clientY:1000});assert.equal($('match-dialog').open,false);assert.equal(document.activeElement,buttons[1]);buttons[2].click();assert.doesNotMatch($('sheet-content').textContent,/UNVERIFIED PREVIEW/);assert.equal($('sheet-content').querySelectorAll('.sheet-skeleton').length,1);
 $('new-search').click();
 $('initial-query').value='Knee replacement near SW5 accepting Bupa';$('landing-form').requestSubmit();
 const collision={...data('collision'),criteria:{topic:'Knee replacement',procedures:['Knee replacement']},criteriaLabels:[{key:'topic',label:'Knee replacement'},{key:'procedures',label:'Knee replacement'}]};
 requests.at(-1).resolve(collision);await flush();
 const chips=$('active-criteria').querySelectorAll('button');assert.equal(chips.length,2);assert.equal(chips[0].textContent,'Knee replacement');assert.equal(chips[1].textContent,'Procedure: Knee replacement');assert.equal(collision.criteriaLabels[1].label,'Knee replacement');
 chips[1].click();assert.equal(requests.at(-1).body.removeCriterion,'procedures');requests.at(-1).resolve({...data('procedure-removed'),criteria:{topic:'Knee replacement',procedures:[]},criteriaLabels:[{key:'topic',label:'Knee replacement'}]});await flush();
 $('active-criteria').querySelector('button').click();assert.equal(requests.at(-1).body.removeCriterion,'topic');requests.at(-1).resolve({...data('topic-removed'),criteria:{},criteriaLabels:[]});await flush();assert.equal($('active-criteria').childElementCount,0);
 $('new-search').click();
});

test('demo guide prepares a fresh search without sending, copies only on success and preserves modal ownership',async()=>{
 $('new-search').click();await flush();
 const before=requests.length;
 $('demo-guide-open').click();
 assert.equal($('demo-guide-dialog').open,true);assert.equal(document.activeElement,$('demo-guide-close'));
 const scenarios=$('demo-guide-list').querySelectorAll('.demo-scenario');
 assert.equal(scenarios.length,4);assert.equal(scenarios[0].open,true);
 assert.equal(requests.length,before);
 let written;
 window.navigator={clipboard:{writeText:async text=>{written=text}}};
 scenarios[0].querySelectorAll('.demo-step-action')[1].click();await flush();
 assert.equal(written,'Physiotherapy hasn’t helped');assert.match($('demo-guide-status').textContent,/Follow-up copied/);
 assert.equal(requests.length,before);assert.equal($('initial-query').value,'');
 window.navigator.clipboard.writeText=async()=>{throw Error('Denied')};
 scenarios[0].querySelectorAll('.demo-step-action')[1].click();await flush();
 assert.match($('demo-guide-status').textContent,/Couldn’t copy/);
 assert.equal(scenarios[0].querySelectorAll('.demo-step-action')[1].textContent,'Copy follow-up');
 let resolveCopy;
 window.navigator.clipboard.writeText=()=>new Promise(resolve=>{resolveCopy=resolve});
 scenarios[0].querySelectorAll('.demo-step-action')[1].click();
 $('demo-guide-close').click();$('demo-guide-open').click();resolveCopy();await flush();
 assert.equal($('demo-guide-status').textContent,'','an old clipboard promise cannot update a reopened guide');
 $('demo-guide-dialog').emit('cancel');await flush();
 assert.equal($('demo-guide-dialog').open,false);assert.equal(document.activeElement,$('demo-guide-open'));
 $('initial-query').value='Existing knee search';$('landing-form').requestSubmit();requests.at(-1).resolve(data('before-guide'));await flush();
 const afterSearch=requests.length;
 $('about-open').click();$('demo-guide-about').click();await flush();
 assert.equal($('about-dialog').open,false);assert.equal($('demo-guide-dialog').open,true);
 $('demo-guide-close').click();await flush();assert.equal(document.activeElement,$('about-open'));
 $('about-open').click();$('demo-guide-about').click();await flush();
 $('demo-guide-list').querySelectorAll('.demo-start-action')[1].click();await flush();
 assert.equal(requests.length,afterSearch,'choosing a scenario only prepares the input');
 assert.equal($('demo-guide-dialog').open,false);assert.equal($('workspace').hidden,true);
 assert.equal($('conversation').childElementCount,0);assert.equal(document.activeElement,$('initial-query'));
 assert.equal($('initial-query').value,'My periods are very painful and I haven’t been diagnosed with endometriosis');
 assert.equal(document.body.classList.contains('demo-guide-open'),false);
 $('landing-form').requestSubmit();const freshRequest=requests.at(-1);
 freshRequest.resolve(data('after-guide'));await flush();$('new-search').click();
 assert.equal(freshRequest.body.sessionId,undefined,'explicit submission starts without the earlier session');
});
