'use strict';
// Offline navigation checks. History traversal and native dialog close events
// are asynchronous; transport deliberately permits late responses after abort.
// Layout, native focus trapping and actual browser gestures remain browser QA.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const P=require('./public/projects.js');
const crypto=require('node:crypto').webcrypto;
function harness({pathname='/expert-discovery',initialProjects=[],storageError=false,healthCorpusVersion=null,rememberedProjectId=null}={}) {
  const ids=new Map(),timers=new Map(),styleWrites=[];let timerId=0,layoutEnabled=false,failStorage=storageError;const savedProjects=new Map(initialProjects.map(p=>[p.id,structuredClone(p)]));const downloads=[];
  const schedule=(callback,delay=0)=>{const id=++timerId;timers.set(id,{callback,delay});return id;};
  const cancel=id=>timers.delete(id);
  const events=target=>Object.assign(target,{events:{},addEventListener(name,callback){(this.events[name]||=[]).push(callback);},
    removeEventListener(name,callback){this.events[name]=(this.events[name]||[]).filter(fn=>fn!==callback);},
    emit(name,event={}){const value={type:name,target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.cancelBubble=true;},...event,currentTarget:this};for(const fn of this.events[name]||[])fn(value);if(typeof this['on'+name]==='function')this['on'+name](value);if(!value.cancelBubble&&['click','keydown'].includes(name)&&this.parentNode)return this.parentNode.emit(name,value);return value;},
    dispatchEvent(event){return !this.emit(event.type,event).defaultPrevented;}});
  class E {
    constructor(tag='div'){events(this);this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.attributes={};this.style=new Proxy({setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}},{set:(target,key,value)=>{styleWrites.push({node:this,key,value});target[key]=value;return true;}});this.dataset={};this._text='';this.className='';this.hidden=false;this.disabled=false;this.value='';this._scrollHeight=34;this._scrollTop=0;this.clientHeight=400;this.clientWidth=600;this.open=false;}
    get scrollHeight(){if(layoutEnabled&&this.id==='results-region'){const cards=this.querySelectorAll('.candidate-card').filter(node=>!node.closest('[hidden]'));return Math.max(this.clientHeight,...cards.map((card,index)=>card._contentTop??100+index*300).map(top=>top+360));}return this._scrollHeight;}
    set scrollHeight(value){this._scrollHeight=value;}
    get scrollTop(){return this._scrollTop;}
    set scrollTop(value){this._scrollTop=Math.max(0,layoutEnabled&&this.id==='results-region'?Math.min(Number(value)||0,this.scrollHeight-this.clientHeight):Number(value)||0);}
    set textContent(value){this._text=String(value);this.children.forEach(child=>child.parentNode=null);this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
    get classList(){return {add:(...names)=>{for(const name of names)if(!this.className.split(' ').includes(name))this.className=(this.className+' '+name).trim();},remove:(...names)=>{this.className=this.className.split(' ').filter(value=>!names.includes(value)).join(' ');},contains:name=>this.className.split(' ').includes(name),toggle:(name,force)=>{const next=force===undefined?!this.className.split(' ').includes(name):force;next?this.classList.add(name):this.classList.remove(name);return next;}};}
    setAttribute(key,value){this.attributes[key]=String(value);if(key==='class')this.className=String(value);if(key==='id'){this.id=String(value);ids.set(this.id,this);}if(key==='hidden')this.hidden=true;}
    getAttribute(key){return this.attributes[key]??null;}
    removeAttribute(key){delete this.attributes[key];if(key==='hidden')this.hidden=false;}
    append(...children){for(let child of children){if(typeof child==='string'){const text=new E('#text');text.textContent=child;child=text;}if(child.tagName==='FRAGMENT'){this.append(...[...child.children]);continue;}child.remove();child.parentNode=this;this.children.push(child);}}
    prepend(...children){for(const child of children.reverse()){child.remove();child.parentNode=this;this.children.unshift(child);}}
    replaceChildren(...children){this.children.forEach(child=>child.parentNode=null);this.children=[];this._text='';this.append(...children);}
    remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}}
    click(){if(!this.disabled){if(this.download)downloads.push({name:this.download,url:this.href});this.focus();const event=this.emit('click');if(!event.cancelBubble)document.emit('click',event);}}
    requestSubmit(){this.emit('submit');}
    focus(){if(!this.disabled&&!this.closest('[hidden]'))document.activeElement=this;}
    scrollIntoView(){}
    scrollTo(first,second){this.scrollTop=typeof first==='object'?first.top??this.scrollTop:second;}
    showModal(){if(this.open)return;this._opener=document.activeElement;this.open=true;}
    close(){if(!this.open)return;this.open=false;this._opener?.focus();schedule(()=>this.emit('close'));}
    getBoundingClientRect(){let top=0,height=100;if(this.id==='results-region'){top=100;height=this.clientHeight;}else if(layoutEnabled&&this.classList.contains('candidate-card')){const siblings=this.parentNode.children.filter(node=>node.classList.contains('candidate-card'));top=100+(this._contentTop??100+siblings.indexOf(this)*300)-(ids.get('results-region')?.scrollTop||0);height=280;}return {left:0,right:600,top,bottom:top+height,width:600,height};}
    get firstElementChild(){return this.children[0]||null;}
    get childElementCount(){return this.children.length;}
    get isConnected(){return this===document.body||!!this.parentNode?.isConnected;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    closest(selector){return selector.split(',').some(part=>this.matches(part.trim()))?this:this.parentNode?.closest(selector)||null;}
    matches(selector){
      if(selector==='[hidden]')return this.hidden;
      const data=selector.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);if(data){const key=data[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.dataset[key]!==undefined&&(data[2]===undefined||this.dataset[key]===data[2]);}
      const attribute=selector.match(/^\[data-candidate-id(?:="([^"]+)")?\]$/);if(attribute)return this.dataset.candidateId!==undefined&&(attribute[1]===undefined||this.dataset.candidateId===attribute[1]);
      if(selector.startsWith('#'))return this.id===selector.slice(1);
      const tag=selector.match(/^[a-z]+/i)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;
      for(const match of selector.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(match[1]))return false;
      return Boolean(tag||selector.startsWith('.'));
    }
    querySelectorAll(selectors){const found=[];const visit=node=>{for(const child of node.children){if(selectors.split(',').some(selector=>child.matches(selector.trim())))found.push(child);visit(child);}};visit(this);return found;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  }
  const document=events({visibilityState:'visible',body:new E('body'),activeElement:null,getElementById:id=>ids.get(id)||null,
    createElement:tag=>new E(tag),createElementNS:(_ns,tag)=>new E(tag),createDocumentFragment:()=>new E('fragment'),
    createTextNode:text=>{const node=new E('#text');node.textContent=text;return node;},querySelectorAll:selector=>document.body.querySelectorAll(selector),querySelector:selector=>document.body.querySelector(selector)});
  document.documentElement=new E('html');document.documentElement.clientHeight=800;
  const html=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const node=new E(match[1]);node.setAttribute('id',match[3]);node.className=match[2].match(/class="([^"]+)"/)?.[1]||'';node.placeholder=match[2].match(/placeholder="([^"]+)"/)?.[1]||'';node.hidden=/\bhidden\b/.test(match[2]);document.body.append(node);
  }
  const $=id=>{const element=ids.get(id);assert.ok(element,`Required current UI element #${id}`);return element;};
  const move=(parent,names)=>names.forEach(name=>ids.has(name)&&$(parent).append($(name)));
  move('home',['home-form','resume-search','home-title','health-status']);move('home-form',['home-input','home-submit']);
  move('workspace',['brief-content','results-region','followup-form','composer-status','compare-tray','results-title','result-count','home-return','focused-view','directory-view','view-updated','toggle-brief']);
  move('brief-content',['requirements','brief-facts','documented-only','uncontacted-only','sidebar-project']);
  const sidebar=new E();sidebar.className='brief-sidebar';$('workspace').append(sidebar);sidebar.append($('brief-content'));
  move('results-region',['search-error','result-notices','clarification','candidate-list','load-more','ranking-note']);
  move('followup-form',['followup-input','followup-submit']);move('compare-tray',['compare-count','compare-clear','compare-open']);
  move('project-view',['project-title','project-subtitle','project-return','export-json','export-html','import-project','import-file','project-brief','project-candidates','project-notes','project-save-status','save-project-notes']);
  move('profile-dialog',['profile-close','profile-scroll']);move('profile-scroll',['profile-identity','profile-content']);
  move('compare-dialog',['compare-title','compare-close','comparison-brief','comparison-table','comparison-explain','comparison-answer']);
  move('new-project-dialog',['new-project-form','new-project-close']);move('new-project-form',['new-project-name']);
  move('event-dialog',['event-form','event-close']);move('event-form',['event-type','event-detail']);move('storage-alert',['storage-message','emergency-export']);
  for(const id of ['home-input','followup-input'])$(id).form=$(id==='home-input'?'home-form':'followup-form');
  for(const value of ['cardiac','skin','panel']){const example=new E('button');example.dataset.example=value;$('home').append(example);}
  const window=events({scrollX:0,scrollY:0,innerHeight:800,location:{origin:'http://localhost:3100',pathname,search:'',hash:''},navigator:{},getSelection:()=>({toString:()=>''}),getComputedStyle:()=>({font:'16px sans-serif',fontSize:'16px',lineHeight:'24px',paddingTop:'0px',paddingBottom:'0px',borderTopWidth:'0px',borderBottomWidth:'0px',boxSizing:'border-box',getPropertyValue:()=>''}),
    matchMedia:query=>events({matches:query.includes('prefers-reduced-motion')}),setTimeout:schedule,clearTimeout:cancel,
    requestAnimationFrame:callback=>schedule(callback),cancelAnimationFrame:cancel,
    scrollTo(first,second){if(typeof first==='object'){this.scrollX=first.left??this.scrollX;this.scrollY=first.top??this.scrollY;}else{this.scrollX=first;this.scrollY=second;}}});
  const stack=[null],urls=[pathname];let position=0;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const history={scrollRestoration:'auto',get state(){return stack[position];},get length(){return stack.length;},
    pushState(value,_title,url){stack.splice(position+1);urls.splice(position+1);stack.push(copy(value));urls.push(url||urls[position]);position=stack.length-1;window.location.pathname=urls[position];},replaceState(value,_title,url){stack[position]=copy(value);if(url)urls[position]=url;window.location.pathname=urls[position];},
    go(delta){const target=position+delta;if(target<0||target>=stack.length)return;const entry=stack[target];schedule(()=>{const index=stack.indexOf(entry);if(index<0)return;position=index;window.location.pathname=urls[position];window.emit('popstate',{state:copy(entry)});});},
    back(){this.go(-1);},forward(){this.go(1);}};
  window.history=history;
  const requests=[];
  const fetch=(url,options)=>{
    if(url==='/api/expert/health')return Promise.resolve({ok:true,json:async()=>({ready:true,corpusVersion:healthCorpusVersion,counts:{candidates:23000}})});
    assert.ok(['/api/expert/search','/api/expert/explain','/api/expert/page','/api/expert/shortlist-view'].includes(url),'Unexpected offline transport request: '+url);
    return new Promise((resolve,reject)=>requests.push({url,options,body:JSON.parse(options.body),reject,
      resolve:(body,status=200)=>resolve({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>body})}));
  };
  window.DocMapProjects={...P,storage:{list:async()=>[...savedProjects.values()],save:async p=>{if(failStorage)throw new Error('Browser storage is unavailable. Export your work before closing this page.');savedProjects.set(p.id,structuredClone(P.validateProject(p)));}}};
  const localValues=new Map(rememberedProjectId?[['docmap-expert-project-id',rememberedProjectId]]:[]),localStorage={getItem:key=>localValues.get(key)||null,setItem:(key,value)=>localValues.set(key,value)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/app.js'),'utf8'),{document,window,navigator:window.navigator,history,location:window.location,localStorage,fetch,URL,Blob,AbortController,structuredClone,crypto,console,getComputedStyle:window.getComputedStyle,requestAnimationFrame:window.requestAnimationFrame,setTimeout:schedule,clearTimeout:cancel});
  async function flush(){for(let round=0;round<12;round++){await new Promise(resolve=>setImmediate(resolve));const pending=[...timers].filter(([,timer])=>timer.delay<1000);if(!pending.length){await Promise.resolve();return;}for(const [id,timer] of pending){if(timers.delete(id))timer.callback();}}throw new Error('Short UI task queue did not settle');}
  const start=message=>{$('home-input').value=message;$('home-input').emit('input');$('home-input').focus();$('home-form').requestSubmit();return requests.at(-1);};
  const refine=message=>{$('followup-input').value=message;$('followup-input').emit('input');$('followup-input').focus();$('followup-form').requestSubmit();return requests.at(-1);};
  const draft=(value,id='followup-input')=>{$(id).value=value;$(id).emit('input');};
  return {$,document,window,history,requests,flush,start,refine,draft,savedProjects,downloads,styleWrites,localValues,setStorageError:value=>{failStorage=value;},enableLayout:()=>{layoutEnabled=true;},dispose:()=>timers.clear()};
}
const brief={version:1,summary:'Cardiac CT for coronary artery disease',requirements:[{id:'ct',kind:'modality',label:'Cardiac CT',text:'Cardiac CT',importance:'essential'},{id:'practice',kind:'currentPractice',label:'Current practice',text:'Current practice',importance:'essential'}],manufacturer:null,panelSize:null,roles:[],geography:null};
function person(id='expert-one',rank=1){const e={id:'e-'+id,candidateId:id,text:'Has a specialist interest in cardiac CT and coronary artery disease.',type:'clinical-interest',field:'biography',sourceRecordId:'source-'+id,sourceUrl:'https://example.com/'+id,sourceLabel:'Professional profile',dates:{sourceDate:null,observedAt:'2026-10-01'},qualifiers:['stated-interest'],attribution:'source-record'};return{id,name:'Dr '+id.replace(/-/g,' '),rank,role:'Consultant Cardiologist',specialty:'Cardiology',organisations:['Example hospital'],locations:[{name:'Example hospital',city:'London'}],registrations:[],evidence:[e],requirementMatrix:[{requirementId:'ct',label:'Cardiac CT',importance:'essential',status:'potential',evidenceIds:[e.id],note:'Stated interest; current activity requires confirmation.'},{requirementId:'practice',label:'Current practice',importance:'essential',status:'unknown',evidenceIds:[],note:'Current practice needs confirmation.'}],reasons:[{text:'Recorded interest in cardiac CT is relevant to the clinical scope.',status:'potential',evidenceIds:[e.id]}],gaps:[{requirementId:'practice',label:'Current practice',importance:'essential',status:'unknown'}],questions:[{kind:'qualification',text:'What is your current cardiac CT practice?'}],relationships:[]};}
const result=(id,people=[person()],extras={})=>({sessionId:'session',searchId:id,brief:structuredClone(brief),corpusVersion:'corpus-test',results:people,total:people.length,nextCursor:null,notices:[],needsClarification:false,...extras});
async function setup(t,options){const h=harness(options);t.after(h.dispose);await h.flush();return h;}
async function ready(h,id='first',people,extras){h.start('We need cardiac CT expertise').resolve(result(id,people,extras));await h.flush();}
const cards=h=>h.$('candidate-list').children;
const action=(host,label)=>host.querySelectorAll('button').find(b=>b.textContent===label);

function publicCardiacProject(){
  const enrichments=require('./enrichments.cjs'),{matrixFor}=require('./search.cjs');
  let project=P.createProject('Export fixture — fictional cardiac CT brief');
  for(const [sourceId,name,role]of [['bupa_11411','Dr Neghal Kandiyil','Consultant Radiologist'],['bupa_14429','Dr Sanjay Banypersad','Consultant Cardiologist']]){
    const id='public-export-'+sourceId;
    const evidence=enrichments.filter(e=>e.sourceRecordId===sourceId).map((e,i)=>({...e,id:id+'-'+i,candidateId:id,sourceQuote:e.excerpt,reviewedParaphrase:true,attribution:'verified-source',dates:{sourceDate:e.sourceDate,observedAt:e.observedAt},qualifiers:[]}));
    const candidate={...person(id),name,role,evidence,reasons:evidence.filter(e=>e.type==='clinical-practice').map(e=>({text:e.text,evidenceIds:[e.id]}))};
    candidate.requirementMatrix=matrixFor(candidate,evidence,brief);
    candidate.gaps=candidate.requirementMatrix.filter(r=>r.status!=='documented');
    project=P.saveCandidate(project,candidate,brief,'public-export-fixture-v1');
  }
  project.notes='Automated export verification fixture. No recruitment activity occurred.';
  project.candidates[0].notes='Confirm current coronary CT activity directly.';
  project.draft='Unsent fictional follow-up';
  return project;
}

test('offline export/import handlers preserve two real public profiles, notes, draft and unreviewed states on reinitialization',async t=>{
  const original=publicCardiacProject(),h=await setup(t,{initialProjects:[original],pathname:'/expert-discovery/project'});
  h.$('export-json').click();h.$('export-html').click();
  assert.equal(h.downloads.length,2);
  const json=await(await fetch(h.downloads[0].url)).text(),html=await(await fetch(h.downloads[1].url)).text();
  t.after(()=>h.downloads.forEach(d=>URL.revokeObjectURL(d.url)));
  assert.match(h.downloads[0].name,/\.json$/);assert.match(h.downloads[1].name,/-review-pack\.html$/);
  const payload=JSON.parse(json);assert.equal(payload.format,'docmap-expert-project');assert.deepEqual(payload.project,original);
  assert.ok(html.includes('Dr Neghal Kandiyil'));assert.ok(html.includes('Dr Sanjay Banypersad'));
  assert.ok(html.includes('cardiac CT and MRI service'));assert.ok(html.includes('Current practice'));
  assert.ok(html.includes('No activity recorded in this project.'));assert.ok(!html.includes('<script'));
  h.$('import-file').files=[{size:Buffer.byteLength(json),text:async()=>json}];h.$('import-file').emit('change');await h.flush();
  assert.equal(h.savedProjects.size,2);
  assert.deepEqual(h.savedProjects.get(original.id),original,'Import must preserve the original project');
  const imported=[...h.savedProjects.values()].find(p=>p.id!==original.id);
  assert.equal(imported.importedFrom,original.id);assert.deepEqual(imported.candidates,original.candidates);
  assert.equal(imported.notes,original.notes);assert.equal(imported.draft,original.draft);assert.deepEqual(imported.events,[]);
  for(const saved of imported.candidates){assert.equal(saved.qualification,'not-reviewed');assert.equal(saved.independence,'not-reviewed');assert.deepEqual(saved.decisions,[]);}
  const restored=await setup(t,{initialProjects:[structuredClone(imported)],pathname:'/expert-discovery/project'});
  assert.equal(restored.$('project-title').textContent,imported.name);
  assert.equal(restored.$('project-candidates').querySelectorAll('.saved-card').length,2);
  assert.equal(restored.$('project-notes').value,original.notes);
  assert.equal(restored.requests.length,0,'Restoring an exported project must not start search or AI requests');
});

test('submission clears immediately and a late response preserves the next draft and focus',async t=>{
  const h=await setup(t),pending=h.start('We need cardiac CT expertise');
  assert.equal(h.$('home-input').value,'');assert.equal(h.$('followup-input').value,'');assert.match(h.$('composer-status').textContent,/Brief received/);
  h.draft('Include research experience\nBut regulatory experience is optional');const focused=h.document.activeElement;
  pending.resolve(result('first'));await h.flush();
  assert.equal(h.$('followup-input').value,'Include research experience\nBut regulatory experience is optional');assert.equal(h.document.activeElement,focused);assert.equal(cards(h).length,1);
});

test('retry reuses the failed message without clearing a fresh draft',async t=>{
  const h=await setup(t);await ready(h);const failed=h.refine('Clinical research is preferred');h.draft('Primary care matters too');failed.reject(new Error('Offline fixture'));await h.flush();
  action(h.$('search-error'),'Retry').click();assert.equal(h.requests.at(-1).body.message,'Clinical research is preferred');assert.equal(h.$('followup-input').value,'Primary care matters too');
  h.requests.at(-1).resolve(result('retried'));await h.flush();assert.equal(h.$('followup-input').value,'Primary care matters too');
});

test('filter changes preserve the draft and failed filtering restores the applied controls',async t=>{
  const h=await setup(t);await ready(h);h.draft('A draft that has not been sent');h.$('documented-only').checked=true;h.$('documented-only').emit('change');
  assert.equal(h.requests.at(-1).body.documentedOnly,true);assert.equal(h.$('followup-input').value,'A draft that has not been sent');h.requests.at(-1).reject(new Error('Offline fixture'));await h.flush();
  assert.equal(h.$('documented-only').checked,false);assert.equal(cards(h).length,1);assert.equal(h.$('followup-input').value,'A draft that has not been sent');
});

test('background completion keeps Home visible and resumes without a second search',async t=>{
  const h=await setup(t),pending=h.start('We need cardiac CT expertise');h.$('brand-home').click();h.draft('Unsent next detail','home-input');h.$('home-input').focus();pending.resolve(result('background'));await h.flush();
  assert.equal(h.$('home').hidden,false);assert.equal(h.$('workspace').hidden,true);assert.equal(h.document.activeElement,h.$('home-input'));assert.equal(h.$('home-input').value,'Unsent next detail');
  h.$('resume-search').click();assert.equal(h.requests.length,1);assert.equal(h.$('workspace').hidden,false);assert.equal(h.$('followup-input').value,'');assert.equal(cards(h).length,1);h.$('brand-home').click();assert.equal(h.$('home-input').value,'Unsent next detail');
});

test('focused and directory views retain the snapshot; paging uses only its cursor',async t=>{
  const h=await setup(t);await ready(h,'paged',Array.from({length:6},(_,i)=>person('expert-'+i,i+1)),{total:8,nextCursor:'cursor-two'});h.$('directory-view').click();
  assert.equal(h.requests.length,1);assert.equal(cards(h).length,6);h.$('load-more').click();assert.equal(h.requests.at(-1).url,'/api/expert/page');assert.deepEqual(h.requests.at(-1).body,{sessionId:'session',searchId:'paged',cursor:'cursor-two'});
  h.requests.at(-1).resolve({results:[person('expert-six',7),person('expert-seven',8)],total:8,nextCursor:null});await h.flush();assert.equal(cards(h).length,8);assert.equal(h.$('load-more').hidden,true);
  h.$('focused-view').click();assert.equal(cards(h).length,6);h.$('directory-view').click();assert.equal(cards(h).length,8);assert.equal(h.requests.length,2);
});

test('card, source and save interactions are independent; opening and Forward never request AI',async t=>{
  const h=await setup(t);await ready(h);const card=cards(h)[0];card.querySelector('.card-link').click();assert.equal(h.$('profile-dialog').open,false);action(card,'Save').click();await h.flush();assert.equal(h.$('profile-dialog').open,false);assert.equal([...h.savedProjects.values()][0].candidates.length,1);
  card.click();assert.equal(h.$('profile-dialog').open,true);assert.equal(h.requests.length,1);h.$('profile-close').click();await h.flush();assert.equal(h.$('profile-dialog').open,false);assert.equal(h.document.activeElement.className,'card-open');
  h.history.forward();await h.flush();assert.equal(h.$('profile-dialog').open,true);assert.equal(h.requests.length,1);
});

test('text selection prevents card activation and the primary name action is keyboard reachable',async t=>{
  const h=await setup(t);await ready(h);h.window.getSelection=()=>({toString:()=> 'Selected source text'});cards(h)[0].click();assert.equal(h.$('profile-dialog').open,false);const open=cards(h)[0].querySelector('.card-open');assert.equal(open.tagName,'BUTTON');open.click();assert.equal(h.$('profile-dialog').open,true);
});

test('profile disclosures and reading position survive close and reopen for the same search',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();const sections=h.$('profile-content').querySelectorAll('details');sections[1].open=true;sections[4].open=true;h.$('profile-scroll').scrollTop=570;
  h.$('profile-close').click();await h.flush();cards(h)[0].querySelector('.card-open').click();assert.equal(h.$('profile-scroll').scrollTop,570);const reopened=h.$('profile-content').querySelectorAll('details');assert.equal(reopened[1].open,true);assert.equal(reopened[4].open,true);assert.equal(reopened[0].open,false);assert.equal(h.requests.length,1);
});

test('AI starts deliberately once and replaces only its answer area with source evidence retained',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();const sections=h.$('profile-content').querySelectorAll('details');sections[0].open=true;const explain=action(h.$('profile-content'),'Generate a relevance summary');explain.click();assert.equal(h.requests.at(-1).url,'/api/expert/explain');assert.equal(h.requests.at(-1).body.kind,'explanation');explain.click();assert.equal(h.requests.length,2);
  h.requests.at(-1).resolve({summary:'The profile records an interest in the relevant modality.',sections:[],citations:[],provider:'openrouter',retryable:false});await h.flush();assert.equal(sections[0].open,true);assert.equal(sections[0].isConnected,true);assert.match(h.$('profile-content').textContent,/Current practice/);assert.equal(action(h.$('profile-content'),'Explanation ready').disabled,true);
  h.$('profile-close').click();await h.flush();h.history.forward();await h.flush();assert.equal(h.requests.length,2);assert.match(h.$('profile-content').textContent,/The profile records an interest/);
});

test('comparison uses the same evidence outcomes and only requests AI on explicit action',async t=>{
  const h=await setup(t);await ready(h,'compare',[person('a',1),person('b',2)]);action(cards(h)[0],'Compare').click();assert.equal(h.$('compare-open').disabled,true);action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.equal(h.$('compare-dialog').open,true);assert.equal(h.requests.length,1);assert.match(h.$('comparison-table').textContent,/Confirmation required/);assert.doesNotMatch(h.$('comparison-table').textContent,/Potential relevance/);
  h.$('comparison-explain').click();assert.equal(h.requests.at(-1).body.kind,'comparison');assert.deepEqual(h.requests.at(-1).body.candidateIds,['a','b']);
});

test('new project navigation during pending retrieval leaves the new project and draft intact',async t=>{
  const h=await setup(t),pending=h.start('We need cardiac CT expertise');const originalId=[...h.savedProjects.keys()][0];h.$('new-project').click();h.$('new-project-name').value='Skin device';h.$('new-project-form').requestSubmit();await h.flush();h.draft('Skin lesion imaging in primary care','home-input');pending.resolve(result('old-project'));await h.flush();
  assert.equal(h.$('home').hidden,false);assert.equal(h.$('home-input').value,'Skin lesion imaging in primary care');assert.notEqual(h.$('project-select').value,originalId);assert.equal(h.savedProjects.get(originalId).activeBrief.summary,brief.summary);assert.equal([...h.savedProjects.values()].find(p=>p.name==='Skin device').activeBrief,null);
});

test('project switching immediately flushes a draft that is inside the debounce window',async t=>{
  const one=P.createProject('One'),two=P.createProject('Two'),h=await setup(t,{initialProjects:[one,two]});h.draft('A just-typed brief','home-input');h.$('project-select').value=two.id;h.$('project-select').emit('change');await h.flush();assert.equal(h.savedProjects.get(one.id).draft,'A just-typed brief');
  h.$('project-select').value=one.id;h.$('project-select').emit('change');h.$('project-return').click();assert.equal(h.$('home-input').value,'A just-typed brief');
});

test('visibility change flushes drafts while keeping project details out of local storage',async t=>{
  const h=await setup(t);h.draft('Pending at page hide','home-input');h.document.visibilityState='hidden';h.document.emit('visibilitychange');await h.flush();assert.equal([...h.savedProjects.values()][0].draft,'Pending at page hide');
});

test('storage failure keeps an in-memory project and exposes a working export recovery',async t=>{
  const h=await setup(t);await ready(h);h.setStorageError(true);action(cards(h)[0],'Save').click();await h.flush();assert.equal(h.$('storage-alert').hidden,false);assert.match(h.$('storage-message').textContent,/Export/);assert.equal(h.$('saved-count').textContent,'1');h.$('emergency-export').click();assert.equal(h.downloads.length,1);assert.match(h.downloads[0].name,/\.json$/);
});

test('removing a requirement sends the stable identifier and does not alter a draft',async t=>{
  const h=await setup(t);await ready(h);h.draft('Unsent context');h.$('requirements').querySelector('.remove-requirement').click();assert.equal(h.requests.at(-1).body.removeRequirementId,'ct');assert.equal(h.requests.at(-1).body.message,undefined);assert.equal(h.$('followup-input').value,'Unsent context');
});

test('an empty or clarification response replaces the shortlist without losing the composer',async t=>{
  const h=await setup(t);await ready(h);h.refine('Only fully documented essentials').resolve(result('empty',[]));await h.flush();assert.equal(cards(h).length,0);assert.match(h.$('clarification').textContent,/current constraints/);assert.equal(h.$('followup-input').closest('[hidden]'),null);
  h.refine('Start a new brief').resolve({sessionId:'session',brief,needsClarification:true,question:'Which clinical use is this assessment about?',notices:[],results:[],total:0});await h.flush();assert.match(h.$('clarification').textContent,/Which clinical use/);assert.equal(cards(h).length,0);assert.equal(h.$('followup-submit').disabled,false);
});

test('retrying a failed filter retries its intended values while retaining the new draft',async t=>{
  const h=await setup(t);await ready(h);h.$('documented-only').checked=true;h.$('documented-only').emit('change');h.requests.at(-1).reject(new Error('Offline fixture'));await h.flush();h.draft('Another unsent detail');action(h.$('search-error'),'Retry').click();assert.equal(h.requests.at(-1).body.documentedOnly,true);assert.equal(h.$('followup-input').value,'Another unsent detail');h.requests.at(-1).resolve(result('strict'));await h.flush();assert.equal(h.$('documented-only').checked,true);
});

test('historical snapshots show their own filters and require explicit return before refinement',async t=>{
  const h=await setup(t);await ready(h,'earlier');h.$('directory-view').click();h.$('documented-only').checked=true;h.$('documented-only').emit('change');h.requests.at(-1).resolve(result('current'));await h.flush();h.draft('Unsent draft retained across history');h.history.back();await h.flush();
  assert.equal(h.$('documented-only').checked,false);assert.equal(h.$('followup-input').readOnly,true);assert.equal(h.$('followup-submit').disabled,true);assert.match(h.$('composer-status').textContent,/Earlier results/);assert.equal(h.$('view-updated').hidden,false);
  h.$('followup-form').requestSubmit();assert.equal(h.requests.length,2);h.$('view-updated').click();assert.equal(h.$('followup-input').readOnly,false);assert.equal(h.$('documented-only').checked,true);assert.equal(h.$('followup-input').value,'Unsent draft retained across history');assert.equal(h.requests.length,2);assert.doesNotMatch(h.$('composer-status').textContent,/Earlier results/);
});

test('closing and reopening a profile during AI preparation reuses the pending request',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();action(h.$('profile-content'),'Generate a relevance summary').click();const pending=h.requests.at(-1);h.$('profile-close').click();await h.flush();cards(h)[0].querySelector('.card-open').click();assert.equal(action(h.$('profile-content'),'Checking the source evidence…').disabled,true);assert.equal(h.requests.length,2);
  pending.resolve({summary:'An evidence-grounded explanation of the clinical interest.',sections:[],citations:[],retryable:false});await h.flush();assert.match(h.$('profile-content').textContent,/An evidence-grounded explanation/);assert.equal(action(h.$('profile-content'),'Explanation ready').disabled,true);
});

test('AI failure preserves the source evidence and offers an explicit retry',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();action(h.$('profile-content'),'Generate a relevance summary').click();h.requests.at(-1).reject(new Error('Provider temporarily unavailable'));await h.flush();assert.match(h.$('profile-content').textContent,/specialist interest in cardiac CT/);assert.equal(action(h.$('profile-content'),'Retry personalisation').disabled,false);assert.equal(h.requests.length,2);
});

test('a changed search never inherits another snapshot’s explanation or profile disclosure state',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();h.$('profile-content').querySelector('details').open=true;action(h.$('profile-content'),'Generate a relevance summary').click();h.requests.at(-1).resolve({summary:'Only the old brief.',sections:[],citations:[],retryable:false});await h.flush();h.$('profile-close').click();await h.flush();h.refine('Research is preferred').resolve(result('new-search'));await h.flush();cards(h)[0].querySelector('.card-open').click();assert.doesNotMatch(h.$('profile-content').textContent,/Only the old brief/);assert.equal(h.$('profile-content').querySelector('details').open,false);assert.equal(action(h.$('profile-content'),'Generate a relevance summary').disabled,false);assert.equal(h.requests.length,3);
});

test('project contact filtering uses only explicit local activity and does not contact anyone',async t=>{
  const h=await setup(t);await ready(h);action(cards(h)[0],'Save').click();await h.flush();h.$('open-project').click();action(h.$('project-candidates'),'Record activity').click();h.$('event-type').value='contact-recorded';h.$('event-detail').value='Team recorded an earlier enquiry.';h.$('event-form').requestSubmit();await h.flush();h.$('project-return').click();h.refine('Only people we have not already contacted');assert.deepEqual(h.requests.at(-1).body.excludeContactedIds,['expert-one']);assert.equal(h.requests.filter(r=>r.url.includes('send')).length,0);assert.equal(h.requests.length,2);
});

test('saved snapshots offer editable outreach drafts without making a model or sending request',async t=>{
  const p=P.saveCandidate(P.createProject('Saved snapshot'),person(),brief,'corpus-test'),h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'});const saved=h.$('project-candidates').querySelector('.saved-card');action(saved,'Prepare outreach draft').click();await h.flush();const draft=saved.querySelector('.draft-area');assert.ok(draft);assert.match(draft.value,/current professional work/);assert.match(draft.value,/What is your current cardiac CT practice/);draft.value+='\nTeam-edited sentence.';action(saved,'Download draft').click();assert.equal(h.downloads.length,1);assert.equal(h.requests.length,0);assert.match(saved.textContent,/No message has been sent/);
});

test('review decisions and notes only change after the user performs their explicit controls',async t=>{
  const p=P.saveCandidate(P.createProject('Review fixture'),person(),brief,'corpus-test'),h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'});let stored=h.savedProjects.get(p.id);assert.equal(stored.candidates[0].decisions.length,0);const card=h.$('project-candidates').querySelector('.saved-card'),select=card.querySelector('select');select.value='follow-up-needed';select.emit('change');await h.flush();stored=h.savedProjects.get(p.id);assert.equal(stored.candidates[0].qualification,'follow-up-needed');assert.equal(stored.candidates[0].independence,'not-reviewed');assert.equal(stored.candidates[0].decisions[0].actor,'user');const notes=card.querySelector('.notes-field');notes.value='Confirm current practice at interview.';assert.equal(stored.candidates[0].notes,'');action(card,'Save notes').click();await h.flush();assert.equal(h.savedProjects.get(p.id).candidates[0].notes,notes.value);
});

test('comparison selections retain fresh evidence after a candidate moves beyond the focused six',async t=>{
  const h=await setup(t);await ready(h,'first',[person('a',1),person('b',2)]);action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.refine('Research is preferred').resolve(result('new',[person('a',1),person('c',2)],{total:12,nextCursor:'more'}));await h.flush();
  assert.equal(h.requests.at(-1).url,'/api/expert/shortlist-view');assert.deepEqual(h.requests.at(-1).body,{sessionId:'session',searchId:'new',candidateIds:['a','b']});assert.equal(h.$('compare-open').disabled,true);const updatedB=person('b',8);updatedB.requirementMatrix[0].note='Evidence refreshed for the new brief';h.requests.at(-1).resolve({brief,corpusVersion:'corpus-test',results:[person('a',1),updatedB]});await h.flush();assert.equal(h.$('compare-open').disabled,false);assert.equal(h.$('compare-count').textContent,'2 selected');h.$('compare-open').click();assert.match(h.$('comparison-table').textContent,/Dr b/);assert.equal(cards(h).length,2);assert.equal(h.requests.length,3);
});

test('clearing a selection while its new-snapshot evidence loads is respected',async t=>{
  const h=await setup(t);await ready(h,'first',[person('a',1),person('b',2)]);action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.refine('Research is preferred').resolve(result('new',[person('a',1),person('c',2)],{total:12}));await h.flush();const pending=h.requests.at(-1);h.$('compare-clear').click();pending.resolve({brief,results:[person('a',1),person('b',8)]});await h.flush();assert.equal(h.$('compare-tray').hidden,true);assert.equal(h.$('compare-count').textContent,'0 selected');
});

test('reviewed enrichments never masquerade as verbatim source passages',async t=>{
  const h=await setup(t),candidate=person();candidate.evidence[0].text='A reviewed summary of relevant clinical expertise.';candidate.evidence[0].reviewedParaphrase=true;candidate.evidence[0].sourceQuote='My practice includes interpreting cardiac CT.';candidate.evidence[0].review={limitations:['This undated biography does not establish present practice.']};await ready(h,'enriched',[candidate]);assert.equal(cards(h)[0].querySelector('blockquote'),null);assert.equal(cards(h)[0].querySelector('.reviewed-source-summary').textContent,'A reviewed summary of relevant clinical expertise.');cards(h)[0].querySelector('.card-open').click();const evidence=h.$('profile-content').querySelector('.evidence-item');assert.match(evidence.textContent,/Reviewed source summary/);assert.equal(evidence.querySelector('.reviewed-source-summary').textContent,'A reviewed summary of relevant clinical expertise.');assert.equal(evidence.querySelector('blockquote').textContent,'My practice includes interpreting cardiac CT.');assert.match(evidence.textContent,/Exact source excerpt/);assert.match(evidence.textContent,/Source limitation: This undated biography does not establish present practice/);
});

test('copy backup provides the same restorable project without sending notes to an API',async t=>{
  const p=P.saveCandidate(P.createProject('Copy backup fixture'),person(),brief,'corpus-test');p.notes='Private local fixture notes';
  const h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'});let copied='';
  h.window.navigator.clipboard={writeText:async text=>{copied=text;}};h.$('copy-json').click();await h.flush();
  assert.equal(P.importJSON(copied).notes,p.notes);assert.equal(P.importJSON(copied).candidates.length,1);assert.equal(h.requests.length,0);
});

test('a changed server corpus flags saved evidence before any new search without changing decisions or source versions',async t=>{
  let p=P.saveCandidate(P.createProject('Earlier evidence'),person(),brief,'corpus-old');p=P.changeReview(p,'expert-one','qualification','follow-up-needed',{actor:'user'});p.notes='Keep these notes';
  const h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project',healthCorpusVersion:'corpus-new'});await h.flush();
  const saved=h.savedProjects.get(p.id);assert(saved.candidates[0].needsReview);assert.equal(saved.candidates[0].qualification,'follow-up-needed');assert.equal(saved.candidates[0].corpusVersion,'corpus-old');assert.deepEqual(saved.candidates[0].decisions,p.candidates[0].decisions);assert.equal(saved.notes,p.notes);assert.match(h.$('project-candidates').textContent,/evidence has changed/);assert.equal(h.requests.length,0);
});

for(const outcome of ['success','error'])for(const navigation of ['another comparison','another project'])test(`late comparison ${outcome} cannot paint ${navigation}`,async t=>{
  const alpha=P.createProject('First assessment'),beta=P.createProject('Second assessment');
  const h=await setup(t,{initialProjects:[alpha,beta]});await ready(h,'original',[person('a',1),person('b',2),person('c',3),person('d',4)]);
  action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();h.$('comparison-explain').click();const pending=h.requests.at(-1);
  h.$('compare-close').click();await h.flush();
  if(navigation==='another project'){
    h.$('project-select').value=beta.id;h.$('project-select').emit('change');h.$('project-return').click();
    await ready(h,'other-project-search',[person('c',1),person('d',2)]);
  }else h.$('compare-clear').click();
  const offset=navigation==='another project'?0:2;action(cards(h)[offset],'Compare').click();action(cards(h)[offset+1],'Compare').click();h.$('compare-open').click();
  const calls=h.requests.length;assert.match(h.$('comparison-table').textContent,/Dr c/);
  if(outcome==='success')pending.resolve({summary:'OLD A/B ANSWER',sections:[],citations:[],retryable:false});else pending.reject(new Error('OLD A/B FAILURE'));
  await h.flush();assert.doesNotMatch(h.$('comparison-answer').textContent,/OLD A\/B/);assert.equal(h.$('comparison-explain').textContent,'Generate a comparison summary');assert.equal(h.$('comparison-explain').disabled,false);assert.equal(h.requests.length,calls);
  if(navigation==='another comparison'&&outcome==='success'){
    h.$('compare-close').click();await h.flush();h.$('compare-clear').click();action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();
    assert.match(h.$('comparison-answer').textContent,/OLD A\/B ANSWER/);assert.equal(h.$('comparison-explain').disabled,true);assert.equal(h.requests.length,calls);
  }
});

test('reopening the same comparison while pending paints its response once without another AI call',async t=>{
  const h=await setup(t);await ready(h,'same',[person('a',1),person('b',2)]);action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();h.$('comparison-explain').click();const pending=h.requests.at(-1);
  h.$('compare-close').click();await h.flush();h.$('compare-open').click();assert.equal(h.$('comparison-explain').disabled,true);
  pending.resolve({summary:'Correct reopened comparison',sections:[],citations:[],retryable:false});await h.flush();assert.match(h.$('comparison-answer').textContent,/Correct reopened comparison/);assert.equal(h.requests.length,2);
});

for(const outcome of ['success','error'])test(`pending refinement ${outcome} preserves a historical result view and draft`,async t=>{
  const h=await setup(t);await ready(h,'older',[person('older',1)]);h.$('directory-view').click();
  const newerBrief={...structuredClone(brief),version:2,summary:'Newer research brief',requirements:[{id:'research',kind:'research',label:'Clinical research',text:'Clinical research',importance:'preferred'}]};
  h.refine('Research is preferred').resolve(result('newer',[person('newer',1)],{brief:newerBrief}));await h.flush();
  const pending=h.refine('Add experience in adults');h.draft('Unsent draft while reading history');h.history.back();await h.flush();
  assert.equal(h.history.state.searchId,'older');assert.match(h.$('requirements').textContent,/Cardiac CT/);assert.match(cards(h)[0].textContent,/Dr older/);
  if(outcome==='success')pending.resolve(result('newest',[person('newest',1)],{brief:{...newerBrief,version:3}}));else pending.reject(new Error('Newer search failed'));
  await h.flush();assert.equal(h.history.state.searchId,'older');assert.match(cards(h)[0].textContent,/Dr older/);assert.match(h.$('requirements').textContent,/Cardiac CT/);assert.doesNotMatch(h.$('requirements').textContent,/Clinical research/);assert.equal(h.$('followup-input').value,'Unsent draft while reading history');assert.equal(h.$('followup-input').readOnly,true);assert.equal(h.$('view-updated').hidden,false);assert.equal(h.requests.length,3);
  h.$('view-updated').click();assert.equal(h.history.state.searchId,outcome==='success'?'newest':'newer');assert.equal(h.$('followup-input').value,'Unsent draft while reading history');assert.equal(h.requests.length,3);
});

test('a newly created project is remembered immediately and selected on reload',async t=>{
  const first=P.createProject('Earlier project'),second=P.createProject('Previously selected');
  const h=await setup(t,{initialProjects:[first,second],rememberedProjectId:second.id});assert.equal(h.$('project-select').value,second.id);
  h.$('new-project').click();h.$('new-project-name').value='New assessment';h.$('new-project-form').requestSubmit();
  const remembered=h.localValues.get('docmap-expert-project-id');assert.ok(remembered);assert.notEqual(remembered,second.id);await h.flush();
  assert.equal(h.savedProjects.get(remembered).name,'New assessment');assert.equal(h.$('project-select').value,remembered);
  const reload=await setup(t,{initialProjects:[...h.savedProjects.values()],rememberedProjectId:remembered});assert.equal(reload.$('project-select').value,remembered);assert.equal(reload.requests.length,0);
});

test('file import enforces the displayed 12 MB limit before reading an oversized backup',async t=>{
  const h=await setup(t);let read=false;h.$('import-file').files=[{size:12_000_001,text:async()=>{read=true;return '{}';}}];h.$('import-file').emit('change');await h.flush();
  assert.equal(read,false);assert.match(h.$('toast').textContent,/no larger than 12 MB/);assert.equal(h.savedProjects.size,1);assert.equal(h.requests.length,0);
  const backup=P.exportJSON(P.createProject('Boundary backup'));h.$('import-file').files=[{size:12_000_000,text:async()=>backup}];h.$('import-file').emit('change');await h.flush();
  assert.equal(h.savedProjects.size,2);assert.ok([...h.savedProjects.values()].some(p=>p.name==='Boundary backup'));assert.equal(h.requests.length,0);
});

test('Home starts a separate assessment with clean filters while preserving notes, shortlist, drafts and live history',async t=>{
  const h=await setup(t);await ready(h,'cardiac');const firstId=h.$('project-select').value;
  action(cards(h)[0],'Save').click();await h.flush();h.$('open-project').click();h.$('project-notes').value='Keep the original assessment decisions.';h.$('save-project-notes').click();await h.flush();h.$('project-return').click();
  h.$('documented-only').checked=true;h.$('documented-only').emit('change');h.requests.at(-1).resolve(result('strict-cardiac'));await h.flush();h.draft('A cardiac refinement still being written');h.$('brand-home').click();
  assert.equal(h.$('home-input').value,'');assert.match(h.$('home-intent').textContent,/Start a new assessment/);assert.match(h.$('resume-search').textContent,/Resume & refine/);
  const next=h.start('Assess skin-lesion software for primary care');assert.equal(next.body.sessionId,undefined);assert.equal(next.body.documentedOnly,false);assert.deepEqual(next.body.excludeContactedIds,[]);const secondId=h.$('project-select').value;assert.notEqual(secondId,firstId);
  next.resolve(result('skin',[person('skin')],{sessionId:'skin-session',brief:{...brief,summary:'Skin-lesion assessment'}}));await h.flush();
  const first=h.savedProjects.get(firstId);assert.equal(first.notes,'Keep the original assessment decisions.');assert.equal(first.candidates.length,1);assert.equal(first.draft,'A cardiac refinement still being written');assert.equal(first.activeBrief.summary,brief.summary);assert.equal(first.briefVersions.length,1);
  h.history.back();await h.flush();assert.equal(h.$('project-select').value,firstId);h.$('resume-search').click();assert.equal(h.$('followup-input').value,first.draft);assert.equal(h.$('documented-only').checked,true);assert.equal(h.history.state.searchId,'strict-cardiac');assert.equal(h.requests.length,3);
  const refinement=h.refine('Clinical research is optional');assert.equal(refinement.body.sessionId,'session');assert.equal(refinement.body.documentedOnly,true);
});

for(const oldOutcome of ['success','failure'])test(`a new Home assessment stays separate when the previous pending search ends in ${oldOutcome}`,async t=>{
  const h=await setup(t),old=h.start('A cardiac assessment');const oldId=h.$('project-select').value;h.draft('Keep this unsent cardiac detail');h.$('brand-home').click();const next=h.start('A separate skin assessment');const newId=h.$('project-select').value;assert.notEqual(newId,oldId);assert.equal(next.body.sessionId,undefined);h.draft('New skin refinement');
  if(oldOutcome==='success')old.resolve(result('old-cardiac'));else old.reject(new Error('Old search failed'));
  await h.flush();assert.equal(h.$('project-select').value,newId);assert.equal(h.$('followup-input').value,'New skin refinement');assert.equal(h.savedProjects.get(oldId).draft,'Keep this unsent cardiac detail');assert.doesNotMatch(h.$('candidate-list').textContent,/Dr expert one/);
  next.resolve(result('new-skin',[person('skin')]));await h.flush();assert.match(h.$('candidate-list').textContent,/Dr skin/);assert.equal(h.$('followup-input').value,'New skin refinement');
});

test('separate Home and refinement drafts survive storage, import and reload without implicit search',async t=>{
  const h=await setup(t);await ready(h);h.draft('Unsent current assessment refinement');h.$('brand-home').click();h.draft('An unsent new assessment','home-input');h.window.emit('pagehide');await h.flush();const p=h.savedProjects.get(h.$('project-select').value);
  assert.equal(p.draft,'Unsent current assessment refinement');assert.equal(p.newAssessmentDraft,'An unsent new assessment');assert.equal(P.importJSON(P.exportJSON(p)).newAssessmentDraft,p.newAssessmentDraft);
  const reloaded=await setup(t,{initialProjects:[p]});assert.equal(reloaded.$('home-input').value,p.newAssessmentDraft);assert.match(reloaded.$('resume-search').textContent,/Review saved project/);reloaded.$('resume-search').click();assert.equal(reloaded.$('project-view').hidden,false);assert.equal(reloaded.requests.length,0);assert.equal(reloaded.$('project-return').textContent,'← New assessment');
});

test('result acknowledgement mentions an unsent refinement only when it exists',async t=>{
  const h=await setup(t);await ready(h);assert.equal(h.$('composer-status').textContent,'Search updated · ready to refine.');const pending=h.refine('Research is preferred');h.draft('Another detail');pending.resolve(result('updated'));await h.flush();assert.match(h.$('composer-status').textContent,/unsent refinement is still here/);
});

test('textarea measurement includes its placeholder and never collapses the visible input',async t=>{
  const h=await setup(t);await ready(h);h.styleWrites.length=0;h.draft('');h.window.emit('resize');
  const mirrors=h.styleWrites.filter(write=>write.node.style.position==='fixed').map(write=>write.node);assert.ok(mirrors.some(mirror=>mirror.textContent===h.$('followup-input').placeholder+'\n'));
  const sizes=h.styleWrites.filter(write=>write.node===h.$('followup-input')&&write.key==='height');assert.ok(sizes.length);assert.ok(sizes.every(write=>Number.parseFloat(write.value)>=36&&Number.parseFloat(write.value)<=140));assert.equal(h.$('followup-input').style.overflowY,'hidden');
});

test('cards and comparison show the matching clause, separate reviewed summaries and retain research limits',async t=>{
  const h=await setup(t),one=person('one'),two=person('two'),e=one.evidence[0];e.text='An unrelated opening paragraph. Reports cardiac CT for coronary artery disease.';e.type='clinical-practice';
  one.requirementMatrix[0].supportingEvidence=[{evidenceId:e.id,text:'Reports cardiac CT for coronary artery disease.',kind:'source-quote',sourceDate:null,limits:[]}];
  const research={...e,id:'study-one',type:'research',text:'A coauthor on a diagnostic study in primary care.',sourceQuote:'A. Example',reviewedParaphrase:true};one.evidence.push(research);one.requirementMatrix.push({requirementId:'study',label:'Diagnostic studies',status:'potential',importance:'preferred',evidenceIds:[research.id],supportingEvidence:[{evidenceId:research.id,text:research.text,kind:'reviewed-summary',sourceQuote:research.sourceQuote,sourceQuoteSupportsRequirement:false,sourceDate:'2015-06-01',limits:['Coauthorship does not establish personal appraisal responsibilities.']}]});
  const extended={...brief,requirements:[...brief.requirements,{id:'study',label:'Diagnostic studies',kind:'research',importance:'preferred'}]};await ready(h,'scoped',[one,two],{brief:extended});
  const card=cards(h)[0];assert.match(card.textContent,/Recorded activity/);assert.match(card.textContent,/Research evidence/);assert.doesNotMatch(card.textContent,/unrelated opening|A\. Example/);assert.equal(card.querySelector('blockquote').textContent,'Reports cardiac CT for coronary artery disease.');assert.match(card.textContent,/Reviewed source summary/);assert.match(card.textContent,/2015-06-01/);assert.match(card.textContent,/Coauthorship does not establish/);
  action(card,'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.doesNotMatch(h.$('comparison-table').textContent,/unrelated opening|A\. Example/);assert.match(h.$('comparison-table').textContent,/Coauthorship does not establish/);assert.ok(h.$('comparison-table').querySelectorAll('.comparison-candidate-name').length>=4);assert.equal(h.requests.length,1);
});

test('explicit excluded and permitted roles remain visibly constraints in brief and comparison',async t=>{
  const h=await setup(t),roles={...brief,roleMode:'only',excludedRoles:['Psychiatrist'],requirements:[...brief.requirements,{id:'no-psychiatrist',label:'Psychiatrist',kind:'role',polarity:'exclude',importance:'essential'},{id:'psychologist',label:'Clinical psychologist',kind:'role',strictRole:true,importance:'essential'}]};await ready(h,'roles',[person('one'),person('two')],{brief:roles});
  assert.match(h.$('requirements').textContent,/Exclude: Psychiatrist/);assert.match(h.$('requirements').textContent,/Allowed role: Clinical psychologist/);assert.match(h.$('brief-facts').textContent,/Permitted roles only: Clinical psychologist/);assert.equal(h.$('requirements').querySelectorAll('select').length,2);
  action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.match(h.$('comparison-table').textContent,/Exclude: Psychiatrist/);assert.match(h.$('comparison-table').textContent,/Allowed role: Clinical psychologist/);assert.match(h.$('comparison-table').textContent,/Role exclusion filter/);assert.match(h.$('comparison-table').textContent,/Incomplete role data does not prove absence/);
});

test('a scoped clinical interest never borrows an unrelated parent practice label',async t=>{
  const h=await setup(t),c=person();c.evidence[0].type='clinical-practice';c.evidence[0].text='Practises echocardiography. Has an interest in cardiac CT.';c.requirementMatrix[0].supportingEvidence=[{evidenceId:c.evidence[0].id,text:'Has an interest in cardiac CT.',kind:'source-quote',evidenceType:'clinical-interest',limits:[]}];await ready(h,'scope',[c]);
  assert.match(cards(h)[0].textContent,/Recorded interest · Cardiac CT/);assert.doesNotMatch(cards(h)[0].textContent,/Recorded activity|Practises echocardiography/);cards(h)[0].querySelector('.card-open').click();assert.match(h.$('profile-content').querySelector('.relevance-panel').textContent,/Recorded interest/);assert.doesNotMatch(h.$('profile-content').querySelector('.relevance-panel').textContent,/Recorded activity/);
});

test('shortlist explicitly identifies an essential setting gap across the shown leads',async t=>{
  const h=await setup(t),people=[person('one'),person('two')],scope={...brief,requirements:[...brief.requirements,{id:'setting',kind:'setting',label:'Primary care',importance:'essential'}]};await ready(h,'partial',people,{brief:scope,total:1999});
  assert.equal(h.$('result-count').textContent,'1,999 evidence leads · 2 shown · 2 need essential checks');assert.match(h.$('result-notices').textContent,/Primary care needs confirmation for all 2 shown/);
});

for(const status of ['mismatch','needs-review'])test(`a ${status} activity passage stays a visible limitation rather than a positive card/profile proof`,async t=>{
  const h=await setup(t),c=person();c.evidence[0].text='I do not report cardiac CT.';c.evidence[0].type='clinical-practice';c.requirementMatrix[0]={...c.requirementMatrix[0],status,note:'The source limits this activity.',supportingEvidence:[{evidenceId:c.evidence[0].id,text:c.evidence[0].text,kind:'source-quote',evidenceType:'clinical-practice',limits:[]}]};c.reasons=[{text:'This source limits cardiac CT reporting.',status,evidenceIds:[c.evidence[0].id]}];await ready(h,'negative',[c]);
  assert.doesNotMatch(cards(h)[0].textContent,/Recorded activity/);assert.match(cards(h)[0].textContent,/Recorded limitation · Cardiac CT/);assert.match(cards(h)[0].textContent,/The source limits this activity/);cards(h)[0].querySelector('.card-open').click();const panel=h.$('profile-content').querySelector('.relevance-panel');assert.doesNotMatch(panel.textContent,/Recorded activity/);assert.match(panel.textContent,/Recorded limitation/);
});

test('potential evidence is explicitly qualified on cards and in the profile',async t=>{
  const h=await setup(t);await ready(h);assert.match(cards(h)[0].textContent,/Potential relevance · confirmation required/);cards(h)[0].querySelector('.card-open').click();assert.match(h.$('profile-content').querySelector('.relevance-panel').textContent,/Potential relevance · confirmation required/);
});

for(const withResearch of [false,true])test(`alternative CT biographies do not duplicate the card proof${withResearch?' when distinct research evidence is available':''}`,async t=>{
  const h=await setup(t),c=person(),first=c.evidence[0];first.type='clinical-practice';first.text='Reports cardiac CT scans.';const alternative={...first,id:'ct-alternative',text:'Has experience reporting cardiac CT.'};c.evidence.push(alternative);
  c.requirementMatrix[0].status='documented';c.requirementMatrix[0].evidenceIds=[first.id,alternative.id];c.requirementMatrix[0].supportingEvidence=[first,alternative].map(e=>({evidenceId:e.id,text:e.text,kind:'source-quote',evidenceType:'clinical-practice',limits:[]}));
  const scope=structuredClone(brief);
  if(withResearch){const research={...first,id:'research-distinction',type:'research',text:'Led a diagnostic performance study.'};c.evidence.push(research);scope.requirements.push({id:'study',kind:'research',label:'Clinical research',importance:'preferred'});c.requirementMatrix.push({requirementId:'study',label:'Clinical research',status:'documented',importance:'preferred',evidenceIds:[research.id],supportingEvidence:[{evidenceId:research.id,text:research.text,kind:'source-quote',evidenceType:'research',limits:[]}]});}
  await ready(h,'distinct-proofs',[c],{brief:scope});const card=cards(h)[0];assert.equal(card.querySelectorAll('.requirement-proof').length,withResearch?2:1);assert.match(card.textContent,/Reports cardiac CT scans/);assert.doesNotMatch(card.textContent,/Has experience reporting cardiac CT/);if(withResearch)assert.match(card.textContent,/Led a diagnostic performance study/);
  card.querySelector('.card-open').click();const profile=h.$('profile-content');assert.doesNotMatch(profile.querySelector('.relevance-panel').textContent,/Has experience reporting cardiac CT/);assert.match(profile.textContent,/Has experience reporting cardiac CT/,'The alternate source stays available in the evidence disclosures');
});
