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
const Evidence=require('./public/evidence.js');
const crypto=require('node:crypto').webcrypto;
function harness({pathname='/expert-discovery',initialProjects=[],storageError=false,healthCorpusVersion=null,rememberedProjectId=null,initialSessionValues=[],reducedMotion=true}={}) {
  const ids=new Map(),timers=new Map(),styleWrites=[];let timerId=0,layoutEnabled=false,failStorage=storageError;const savedProjects=new Map(initialProjects.map(p=>[p.id,structuredClone(p)]));const downloads=[];
  let now=Date.now();const mediaQueries=new Map();
  class HarnessDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const schedule=(callback,delay=0)=>{const id=++timerId;timers.set(id,{callback,delay,due:now+delay});return id;};
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
    const node=new E(match[1]);node.setAttribute('id',match[3]);node.className=match[2].match(/class="([^"]+)"/)?.[1]||'';node.placeholder=match[2].match(/placeholder="([^"]+)"/)?.[1]||'';node.hidden=/\bhidden\b/.test(match[2]);for(const attribute of match[2].matchAll(/\b(aria-[\w-]+|role)="([^"]*)"/g))node.setAttribute(attribute[1],attribute[2]);document.body.append(node);
  }
  const $=id=>{const element=ids.get(id);assert.ok(element,`Required current UI element #${id}`);return element;};
  const move=(parent,names)=>names.forEach(name=>ids.has(name)&&$(parent).append($(name)));
  move('home',['home-form','resume-search','home-title','health-status']);move('home-form',['home-input','home-submit']);
  move('workspace',['brief-content','results-region','followup-form','composer-status','compare-tray','results-title','result-count','home-return','focused-view','directory-view','view-updated','toggle-brief']);
  move('brief-content',['requirements','brief-facts','documented-only','uncontacted-only','sidebar-project']);
  const sidebar=new E();sidebar.className='brief-sidebar';$('workspace').append(sidebar);sidebar.append($('brief-slot'));$('brief-slot').append($('brief-content'));move('brief-content',['original-brief']);move('original-brief',['original-brief-text']);move('brief-dialog',['brief-close','brief-done','brief-dialog-content']);move('recovery-dialog',['recovery-form','recovery-close']);move('recovery-form',['recovery-input']);move('home',['home-recovery']);move('project-view',['project-recovery']);
  move('results-region',['search-error','result-notices','clarification','candidate-list','load-more','ranking-note']);
  move('results-region',['search-loading']);move('search-loading',['search-loading-phrase','search-loading-detail']);move('workspace',['composer-progress']);move('composer-progress',['composer-progress-phrase']);
  move('followup-form',['followup-input','followup-submit']);move('compare-tray',['compare-count','compare-clear','compare-open']);
  move('project-view',['project-title','project-subtitle','project-return','export-json','export-html','import-project','import-file','project-brief','project-candidates','project-notes','project-save-status','save-project-notes']);
  move('profile-dialog',['profile-close','profile-scroll']);move('profile-scroll',['profile-identity','profile-content']);
  move('compare-dialog',['compare-title','compare-close','comparison-brief','comparison-table','comparison-explain','comparison-answer']);
  move('new-project-dialog',['new-project-form','new-project-close']);move('new-project-form',['new-project-name']);
  move('event-dialog',['event-form','event-close']);move('event-form',['event-type','event-detail']);move('storage-alert',['storage-message','emergency-export']);
  for(const id of ['home-input','followup-input'])$(id).form=$(id==='home-input'?'home-form':'followup-form');
  for(const value of ['cardiac','skin','panel']){const example=new E('button');example.dataset.example=value;$('home').append(example);}
  const window=events({scrollX:0,scrollY:0,innerHeight:800,innerWidth:1280,location:{origin:'http://localhost:3100',pathname,search:'',hash:''},navigator:{},getSelection:()=>({toString:()=>''}),getComputedStyle:()=>({font:'16px sans-serif',fontSize:'16px',lineHeight:'24px',paddingTop:'0px',paddingBottom:'0px',borderTopWidth:'0px',borderBottomWidth:'0px',boxSizing:'border-box',getPropertyValue:()=>''}),
    matchMedia:query=>{if(!mediaQueries.has(query))mediaQueries.set(query,events({matches:query.includes('prefers-reduced-motion')&&reducedMotion}));return mediaQueries.get(query);},setTimeout:schedule,clearTimeout:cancel,
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
  window.DocMapEvidence=Evidence;
  window.DocMapProjects={...P,storage:{list:async()=>[...savedProjects.values()],save:async p=>{if(failStorage)throw new Error('Browser storage is unavailable. Export your work before closing this page.');savedProjects.set(p.id,structuredClone(P.validateProject(p)));}}};
  const localValues=new Map(rememberedProjectId?[['docmap-expert-project-id',rememberedProjectId]]:[]),localStorage={getItem:key=>localValues.get(key)||null,setItem:(key,value)=>localValues.set(key,value)};
  const sessionValues=new Map(initialSessionValues),sessionStorage={getItem:key=>sessionValues.get(key)||null,setItem:(key,value)=>sessionValues.set(key,value),removeItem:key=>sessionValues.delete(key)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/app.js'),'utf8'),{document,window,navigator:window.navigator,history,location:window.location,localStorage,sessionStorage,fetch,URL,Blob,AbortController,structuredClone,crypto,console,Date:HarnessDate,getComputedStyle:window.getComputedStyle,requestAnimationFrame:window.requestAnimationFrame,setTimeout:schedule,clearTimeout:cancel});
  async function flush(){for(let round=0;round<12;round++){await new Promise(resolve=>setImmediate(resolve));const pending=[...timers].filter(([,timer])=>timer.delay<1000);if(!pending.length){await Promise.resolve();return;}for(const [id,timer] of pending){if(timers.delete(id))timer.callback();}}throw new Error('Short UI task queue did not settle');}
  const start=message=>{$('home-input').value=message;$('home-input').emit('input');$('home-input').focus();$('home-form').requestSubmit();return requests.at(-1);};
  const refine=message=>{$('followup-input').value=message;$('followup-input').emit('input');$('followup-input').focus();$('followup-form').requestSubmit();return requests.at(-1);};
  const draft=(value,id='followup-input')=>{$(id).value=value;$(id).emit('input');};
  async function advance(ms){now+=ms;for(const [id,timer]of [...timers].filter(([,timer])=>timer.due<=now))if(timers.delete(id))timer.callback();await flush();}
  function setReducedMotion(value){reducedMotion=value;for(const [query,media]of mediaQueries)if(query.includes('prefers-reduced-motion')){media.matches=value;media.emit('change',{matches:value});}}
  return {$,document,window,history,requests,flush,start,refine,draft,savedProjects,downloads,styleWrites,localValues,sessionValues,advance,setReducedMotion,pendingTimers:delay=>[...timers.values()].filter(timer=>timer.delay===delay).length,setStorageError:value=>{failStorage=value;},enableLayout:()=>{layoutEnabled=true;},dispose:()=>timers.clear()};
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

test('first search immediately shows a single processing view without delaying retrieval or repeating announcements',async t=>{
  const h=await setup(t,{reducedMotion:false}),pending=h.start('Find clinicians who report cardiac CT');
  assert.equal(h.requests.length,1,'The cosmetic sequence must not gate the search request');
  assert.equal(h.$('home-input').value,'');assert.equal(h.$('search-loading').hidden,false);assert.equal(h.$('composer-progress').hidden,true);
  assert.equal(h.$('search-loading').getAttribute('aria-hidden'),'true');assert.equal(h.$('results-region').getAttribute('aria-busy'),'true');
  assert.match(h.$('search-loading-phrase').textContent,/Connecting the dots/);assert.equal(h.$('clarification').hidden,true);
  const announcement=h.$('announcer').textContent;h.draft('Research can be optional\nKeep clinical reporting essential');
  await h.advance(2800);assert.notEqual(h.$('search-loading-phrase').textContent,'Connecting the dots…');
  assert.equal(h.$('announcer').textContent,announcement,'Decorative copy should not be announced every few seconds');
  assert.equal(h.$('followup-input').value,'Research can be optional\nKeep clinical reporting essential');assert.equal(h.document.activeElement,h.$('followup-input'));
  assert.equal(h.requests.length,1);assert.equal(h.pendingTimers(2800),1);
  pending.resolve(result('loaded'));await h.flush();assert.equal(h.$('search-loading').hidden,true);assert.equal(h.$('results-region').getAttribute('aria-busy'),'false');assert.equal(h.pendingTimers(2800),0);
});

test('refinement rotates compact processing copy without replacing cards or moving the draft and reading position',async t=>{
  const h=await setup(t,{reducedMotion:false});await ready(h);const card=cards(h)[0],count=h.$('result-count').textContent,requirements=h.$('requirements').textContent;
  h.$('results-region').scrollTop=180;const pending=h.refine('Diagnostic research is helpful');h.draft('Another detail\nStill being written');
  assert.equal(h.$('search-loading').hidden,true);assert.equal(h.$('composer-progress').hidden,false);assert.equal(h.$('composer-progress').getAttribute('aria-hidden'),'true');
  const firstPhrase=h.$('composer-progress-phrase').textContent;await h.advance(2800);
  assert.notEqual(h.$('composer-progress-phrase').textContent,firstPhrase);assert.equal(cards(h)[0],card);assert.equal(h.$('result-count').textContent,count);assert.equal(h.$('requirements').textContent,requirements);
  assert.equal(h.$('results-region').scrollTop,180);assert.equal(h.$('followup-input').value,'Another detail\nStill being written');assert.equal(h.document.activeElement,h.$('followup-input'));assert.equal(h.requests.length,2);
  pending.resolve(result('refined'));await h.flush();assert.equal(h.$('composer-progress').hidden,true);assert.equal(h.pendingTimers(2800),0);assert.equal(h.$('followup-input').value,'Another detail\nStill being written');
});

test('search completion, clarification, empty results and failure all stop processing without a minimum display time',async t=>{
  for(const outcome of ['success','clarification','empty','failure']){
    const h=await setup(t,{reducedMotion:false});await ready(h);const pending=h.refine('Refine this fictional assessment');h.draft('Keep my newer draft');
    if(outcome==='failure')pending.reject(new Error('Offline loading fixture'));
    else pending.resolve(result('done-'+outcome,outcome==='empty'?[]:[person()],outcome==='clarification'?{needsClarification:true,question:'Which clinical question matters most?'}:{}));
    await h.flush();assert.equal(h.$('search-loading').hidden,true,outcome);assert.equal(h.$('composer-progress').hidden,true,outcome);assert.equal(h.pendingTimers(2800),0,outcome);assert.equal(h.$('results-region').getAttribute('aria-busy'),'false',outcome);
    assert.equal(h.$('followup-input').value,'Keep my newer draft',outcome);assert.equal(h.$('followup-submit').disabled,false,outcome);
    if(outcome==='failure')assert.ok(action(h.$('search-error'),'Retry'));
  }
});

test('hidden pages and navigation pause cosmetic work and returning to pending results starts only one timer',async t=>{
  const h=await setup(t,{reducedMotion:false});await ready(h);const pending=h.refine('Consider diagnostic evaluation experience');
  h.document.visibilityState='hidden';h.document.emit('visibilitychange');const paused=h.$('composer-progress-phrase').textContent;assert.equal(h.pendingTimers(2800),0);
  await h.advance(2800);assert.equal(h.$('composer-progress-phrase').textContent,paused);assert.equal(h.requests.length,2);
  h.document.visibilityState='visible';h.document.emit('visibilitychange');assert.equal(h.pendingTimers(2800),1);
  h.$('brand-home').click();assert.equal(h.$('search-loading').hidden,true);assert.equal(h.$('composer-progress').hidden,true);assert.equal(h.pendingTimers(2800),0);
  h.$('resume-search').click();assert.equal(h.$('composer-progress').hidden,false);assert.equal(h.pendingTimers(2800),1);
  h.$('directory-view').click();h.$('focused-view').click();assert.equal(h.pendingTimers(2800),1,'Repeated routes must not multiply the cosmetic timers');assert.equal(h.requests.length,2);
  h.window.emit('pagehide');assert.equal(h.pendingTimers(2800),0);pending.resolve(result('hidden-completion'));await h.flush();assert.equal(h.pendingTimers(2800),0);
});

test('one project completing in the background cannot stop another project’s processing indication',async t=>{
  const h=await setup(t,{reducedMotion:false}),old=h.start('First fictional cardiac assessment');const firstId=h.$('project-select').value;
  h.$('brand-home').click();const current=h.start('Second fictional skin assessment');assert.notEqual(h.$('project-select').value,firstId);assert.equal(h.pendingTimers(2800),1);
  old.resolve(result('old-project'));await h.flush();assert.equal(h.$('search-loading').hidden,false);assert.equal(h.$('composer-progress').hidden,true);assert.equal(h.pendingTimers(2800),1);assert.equal(cards(h).length,0);
  h.$('open-project').click();assert.equal(h.$('search-loading').hidden,true);assert.equal(h.$('composer-progress').hidden,true);assert.equal(h.pendingTimers(2800),0);
  current.resolve(result('current-project'));await h.flush();assert.equal(h.$('project-view').hidden,false);assert.equal(h.$('search-loading').hidden,true);assert.equal(h.pendingTimers(2800),0);assert.equal(h.requests.length,2);
});

test('historical results do not show a current refinement as processing against the earlier brief',async t=>{
  const h=await setup(t,{reducedMotion:false});await ready(h,'older');h.$('directory-view').click();h.refine('Research is preferred').resolve(result('current'));await h.flush();
  const pending=h.refine('Add adult population evidence');assert.equal(h.$('composer-progress').hidden,false);h.history.back();await h.flush();
  assert.equal(h.history.state.searchId,'older');assert.equal(h.$('search-loading').hidden,true);assert.equal(h.$('composer-progress').hidden,true);assert.equal(h.pendingTimers(2800),0);assert.equal(h.$('results-region').getAttribute('aria-busy'),'false');
  h.$('view-updated').click();assert.equal(h.history.state.searchId,'current');assert.equal(h.$('composer-progress').hidden,false);assert.equal(h.pendingTimers(2800),1);
  pending.resolve(result('latest'));await h.flush();assert.equal(h.$('composer-progress').hidden,true);assert.equal(h.pendingTimers(2800),0);
});

test('reduced motion keeps a clear static status and preference changes cancel or resume cosmetic work',async t=>{
  const h=await setup(t,{reducedMotion:true}),pending=h.start('Find source-backed expertise');
  assert.equal(h.$('search-loading').hidden,false);assert.equal(h.$('search-loading-phrase').textContent,'Searching professional evidence…');assert.equal(h.pendingTimers(2800),0);
  await h.advance(2800);assert.equal(h.$('search-loading-phrase').textContent,'Searching professional evidence…');
  h.setReducedMotion(false);assert.equal(h.pendingTimers(2800),1);await h.advance(2800);assert.notEqual(h.$('search-loading-phrase').textContent,'Searching professional evidence…');
  h.setReducedMotion(true);assert.equal(h.pendingTimers(2800),0);assert.equal(h.$('search-loading-phrase').textContent,'Searching professional evidence…');assert.equal(h.requests.length,1);
  pending.resolve(result('motion-complete'));await h.flush();assert.equal(h.$('search-loading').hidden,true);
});

test('a longer request honestly settles on waiting copy without inventing progress or issuing another request',async t=>{
  const h=await setup(t,{reducedMotion:false}),pending=h.start('Find evidence for a fictional assessment');
  for(let step=0;step<5;step++)await h.advance(2800);
  assert.equal(h.$('search-loading-phrase').textContent,'Still working on your brief…');assert.equal(h.pendingTimers(2800),0);assert.equal(h.requests.length,1);assert.equal(h.$('search-loading').hidden,false);
  await h.advance(2800);assert.equal(h.$('search-loading-phrase').textContent,'Still working on your brief…');assert.equal(h.requests.length,1);
  pending.resolve(result('long-complete'));await h.flush();assert.equal(h.$('search-loading').hidden,true);assert.equal(h.pendingTimers(2800),0);
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
  const h=await setup(t);await ready(h);const card=cards(h)[0];card.querySelector('.source-link').click();assert.equal(h.$('profile-dialog').open,false);action(card,'Save').click();await h.flush();assert.equal(h.$('profile-dialog').open,false);assert.equal([...h.savedProjects.values()][0].candidates.length,1);
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
  const h=await setup(t);await ready(h,'compare',[person('a',1),person('b',2)]);action(cards(h)[0],'Compare').click();assert.equal(h.$('compare-open').disabled,true);action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.equal(h.$('compare-dialog').open,true);assert.equal(h.requests.length,1);assert.match(h.$('comparison-table').textContent,/Confirmation required/);assert.match(h.$('comparison-table').textContent,/Potential relevance/);assert.match(h.$('comparison-table').textContent,/does not establish performed clinical work/);
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
  const reloaded=await setup(t,{initialProjects:[p]});assert.equal(reloaded.$('home-input').value,p.newAssessmentDraft);assert.match(reloaded.$('resume-search').textContent,/Resume discovery/);assert.equal(reloaded.requests.length,0);reloaded.$('resume-search').click();assert.equal(reloaded.$('workspace').hidden,false);assert.equal(reloaded.requests.length,1);assert.deepEqual(reloaded.requests[0].body.resumeBrief,p.activeBrief);assert.equal(reloaded.requests[0].body.message,undefined);assert.equal(reloaded.$('followup-input').value,p.draft);reloaded.requests[0].resolve(result('resumed'));await reloaded.flush();assert.equal(reloaded.$('project-select').value,p.id);assert.equal(reloaded.savedProjects.get(p.id).newAssessmentDraft,p.newAssessmentDraft);
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
  const card=cards(h)[0];assert.match(card.textContent,/Recorded activity/);assert.match(card.textContent,/Recorded research/);assert.doesNotMatch(card.textContent,/unrelated opening|A\. Example/);assert.equal(card.querySelector('blockquote').textContent,'Reports cardiac CT for coronary artery disease.');assert.match(card.textContent,/Reviewed source summary/);assert.match(card.textContent,/2015-06-01/);assert.match(card.textContent,/Coauthorship does not establish/);
  action(card,'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.doesNotMatch(h.$('comparison-table').textContent,/unrelated opening|A\. Example/);assert.match(h.$('comparison-table').textContent,/Coauthorship does not establish/);assert.ok(h.$('comparison-table').querySelectorAll('.comparison-candidate-name').length>=4);assert.equal(h.requests.length,1);
});

test('explicit excluded and permitted roles remain visibly constraints in brief and comparison',async t=>{
  const h=await setup(t),roles={...brief,roleMode:'only',excludedRoles:['Psychiatrist'],requirements:[...brief.requirements,{id:'no-psychiatrist',label:'Psychiatrist',kind:'role',polarity:'exclude',importance:'essential'},{id:'psychologist',label:'Clinical psychologist',kind:'role',strictRole:true,importance:'essential'}]};await ready(h,'roles',[person('one'),person('two')],{brief:roles});
  assert.match(h.$('requirements').textContent,/Exclude: Psychiatrist/);assert.match(h.$('requirements').textContent,/Allowed role: Clinical psychologist/);assert.match(h.$('brief-facts').textContent,/Permitted roles only: Clinical psychologist/);assert.equal(h.$('requirements').querySelectorAll('select').length,2);
  action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.match(h.$('comparison-table').textContent,/Exclude: Psychiatrist/);assert.match(h.$('comparison-table').textContent,/Allowed role: Clinical psychologist/);assert.match(h.$('comparison-table').textContent,/Role exclusion filter/);assert.match(h.$('comparison-table').textContent,/Incomplete role data does not prove absence/);
});

test('a scoped clinical interest never borrows an unrelated parent practice label',async t=>{
  const h=await setup(t),c=person();c.evidence[0].type='clinical-practice';c.evidence[0].text='Practises echocardiography. Has an interest in cardiac CT.';c.requirementMatrix[0].supportingEvidence=[{evidenceId:c.evidence[0].id,text:'Has an interest in cardiac CT.',kind:'source-quote',evidenceType:'clinical-interest',limits:[]}];await ready(h,'scope',[c]);
  assert.match(cards(h)[0].textContent,/Listed interest · Cardiac CT/);assert.doesNotMatch(cards(h)[0].textContent,/Recorded activity|Practises echocardiography/);cards(h)[0].querySelector('.card-open').click();assert.match(h.$('profile-content').querySelector('.relevance-panel').textContent,/Listed interest/);assert.doesNotMatch(h.$('profile-content').querySelector('.relevance-panel').textContent,/Recorded activity/);
});

test('shortlist explicitly identifies an essential setting gap across the shown leads',async t=>{
  const h=await setup(t),people=[person('one'),person('two')],scope={...brief,requirements:[...brief.requirements,{id:'setting',kind:'setting',label:'Primary care',importance:'essential'}]};await ready(h,'partial',people,{brief:scope,total:1999});
  assert.equal(h.$('result-count').textContent,'2 candidates to review · 2 have essential gaps');assert.match(h.$('result-notices').textContent,/Primary care needs confirmation for all 2 shown/);
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
  await ready(h,'distinct-proofs',[c],{brief:scope});const card=cards(h)[0];assert.equal(card.querySelectorAll('.requirement-proof').length,withResearch?2:1);const shown=card.querySelector('blockquote').textContent;assert.ok([first.text,alternative.text].includes(shown));assert.equal(card.querySelectorAll('blockquote').filter(el=>/cardiac CT/.test(el.textContent)).length,1);if(withResearch)assert.match(card.textContent,/Led a diagnostic performance study/);
  card.querySelector('.card-open').click();const profile=h.$('profile-content');assert.equal(profile.querySelector('.relevance-panel').querySelectorAll('blockquote').filter(el=>/cardiac CT/.test(el.textContent)).length,1);assert.match(profile.textContent,/Reports cardiac CT scans/);assert.match(profile.textContent,/Has experience reporting cardiac CT/,'Both alternate sources stay available in the evidence disclosures');
});

test('saved assessment resumes its exact structured scope without transmitting notes or decisions',async t=>{
  let p=P.saveCandidate(P.createProject('Persistent panel'),person(),brief,'corpus-test');p.notes='PRIVATE TEAM NOTE';p.candidates[0].notes='Private candidate note';p.draft='Unsent next detail';p.discoveryFilters={documentedOnly:true,uncontactedOnly:true};p=P.recordEvent(p,person().id,'contact-recorded','A team record',{actor:'user'});const versions=structuredClone(p.briefVersions);
  const h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'});assert.match(h.$('project-return').textContent,/Resume discovery/);assert.equal(h.requests.length,0);h.$('project-return').click();const request=h.requests[0];assert.deepEqual(request.body,{resumeBrief:brief,documentedOnly:true,excludeContactedIds:[person().id]});assert.doesNotMatch(JSON.stringify(request.body),/PRIVATE|Private candidate|sessionId|decisions/);assert.equal(h.$('followup-input').value,p.draft);
  request.resolve(result('resumed'));await h.flush();const next=h.savedProjects.get(p.id);assert.equal(h.savedProjects.size,1);assert.equal(next.notes,p.notes);assert.deepEqual(next.candidates,p.candidates);assert.deepEqual(next.events,p.events);assert.deepEqual(next.briefVersions,versions);assert.equal(next.draft,p.draft);
});

test('a failed submission is restored only into an empty draft and persists for reload retry',async t=>{
  const h=await setup(t);await ready(h);const pending=h.refine('Diagnostic studies are preferred');pending.reject(new Error('Temporary network failure'));await h.flush();assert.equal(h.$('followup-input').value,'Diagnostic studies are preferred');const p=h.savedProjects.get(h.$('project-select').value);assert.equal(p.failedSearch.payload.message,'Diagnostic studies are preferred');assert.equal(p.failedSearch.restoredDraft,true);
  const reloaded=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'});assert.match(reloaded.$('project-recovery').textContent,/Your search did not update/);action(reloaded.$('project-recovery'),'Retry').click();const retry=reloaded.requests[0];assert.equal(retry.body.message,p.failedSearch.payload.message);assert.deepEqual(retry.body.resumeBrief,brief);assert.equal(retry.body.sessionId,undefined);assert.equal(reloaded.$('followup-input').value,'');retry.resolve(result('retried'));await reloaded.flush();assert.equal(reloaded.savedProjects.get(p.id).failedSearch,null);assert.equal(reloaded.savedProjects.get(p.id).draft,'');
});

test('editing a failed request keeps a newer draft separate and never transmits local notes',async t=>{
  const h=await setup(t);await ready(h);const pending=h.refine('Previous request');h.draft('A newer unsent detail');pending.reject(new Error('Temporary failure'));await h.flush();action(h.$('search-error'),'Edit request').click();assert.equal(h.$('recovery-dialog').open,true);h.$('recovery-input').value='Edited previous request';h.$('recovery-form').requestSubmit();assert.equal(h.requests.at(-1).body.message,'Edited previous request');assert.deepEqual(h.requests.at(-1).body.resumeBrief,brief);assert.equal(h.$('followup-input').value,'A newer unsent detail');h.requests.at(-1).resolve(result('edited'));await h.flush();assert.equal(h.$('followup-input').value,'A newer unsent detail');
});

test('an interrupted persisted request remains explicitly retryable after reload',async t=>{
  const h=await setup(t);await ready(h);h.refine('A request interrupted by reload');await h.flush();const p=h.savedProjects.get(h.$('project-select').value);assert.equal(p.failedSearch.status,'pending');const reloaded=await setup(t,{initialProjects:[p]});assert.match(reloaded.$('home-recovery').textContent,/interrupted request is saved/);assert.equal(reloaded.requests.length,0);action(reloaded.$('home-recovery'),'Retry').click();assert.equal(reloaded.requests[0].body.message,'A request interrupted by reload');assert.deepEqual(reloaded.requests[0].body.resumeBrief,brief);
});

test('mobile brief editing moves the same controls into a sheet and preserves them during update',async t=>{
  const h=await setup(t);await ready(h);h.window.innerWidth=390;h.window.emit('resize');const content=h.$('brief-content'),controls=h.$('requirements').querySelectorAll('select');h.$('toggle-brief').click();assert.equal(h.$('brief-dialog').open,true);assert.equal(content.parentNode,h.$('brief-dialog-content'));assert.equal(h.document.querySelectorAll('#brief-content').length,1);controls[0].value='preferred';controls[0].emit('change');assert.deepEqual(h.requests.at(-1).body.patch,{requirementId:'ct',importance:'preferred'});assert.equal(h.$('brief-dialog').open,true);assert.equal(h.document.activeElement,h.$('brief-close'));
  h.requests.at(-1).resolve(result('edited-brief'));await h.flush();assert.equal(h.$('brief-dialog').open,true);h.$('brief-done').click();await h.flush();assert.equal(content.parentNode,h.$('brief-slot'));assert.equal(h.document.activeElement,h.$('toggle-brief'));assert.equal(h.$('toggle-brief').getAttribute('aria-expanded'),'false');h.$('toggle-brief').click();h.window.innerWidth=1280;h.window.emit('resize');await h.flush();assert.equal(h.$('brief-dialog').open,false);assert.equal(content.parentNode,h.$('brief-slot'));
});

test('saved cards lead with scoped evidence, all gap names and independent closed review disclosures',async t=>{
  const b=structuredClone(brief);b.requirements.push({id:'study',label:'Diagnostic study evaluation',kind:'research',importance:'preferred'});const p=P.saveCandidate(P.createProject('Saved evidence'),person(),b,'corpus-test');p.originalBrief='Our original device assessment request';const h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'}),card=h.$('project-candidates').querySelector('.saved-card');assert.match(card.textContent,/Listed interest|Potential relevance/);assert.match(card.textContent,/Essential to confirm: Cardiac CT · Current practice/);assert.match(card.textContent,/Preferred evidence gaps: Diagnostic study evaluation/);assert.match(card.textContent,/Qualification: not reviewed/);assert.equal(card.querySelector('.saved-review').open,false);assert.equal(card.querySelector('.saved-notes').open,false);assert.match(h.$('project-brief').textContent,/Our original device assessment request/);assert.ok(card.querySelector('.source-link').href.includes('?evidence=e-expert-one#evidence-e-expert-one'));assert.equal(h.requests.length,0);
});

test('all retained source provenance links are accessible from the profile without a model request',async t=>{
  const h=await setup(t),c=person();c.evidence[0].sources=[{sourceUrl:'https://second.example/profile',sourceLabel:'Second professional profile'},{sourceUrl:'javascript:alert(1)',sourceLabel:'Unsafe'}];await ready(h,'sources',[c]);cards(h)[0].querySelector('.card-open').click();const links=h.$('profile-content').querySelectorAll('a');assert.ok(links.some(a=>a.href==='https://second.example/profile'));assert.ok(links.some(a=>a.href.includes('?evidence=e-expert-one#evidence-e-expert-one')));assert.ok(!links.some(a=>a.href.startsWith('javascript:')));assert.equal(h.requests.length,1);
});

test('candidate scanning leads with reachable actions and omits duplicate card chrome',async t=>{
  const h=await setup(t),c=person();c.evidence[0].text='Has a specialist interest in cardiac CT. '+('Additional exact recorded context. '.repeat(20));await ready(h,'compact',[c],{total:648});const card=cards(h)[0];assert.equal(card.querySelector('.card-rank'),null);assert.doesNotMatch(card.textContent,/Option 1|Evidence for this assessment/);assert.equal(card.querySelector('.card-actions').querySelectorAll('a').length,0);assert.ok(card.children.indexOf(card.querySelector('.card-actions'))<card.children.indexOf(card.querySelector('.card-relevance')));assert.ok(card.querySelector('blockquote').textContent.length<=151);assert.equal(card.querySelector('blockquote').title,c.evidence[0].text);assert.equal(card.querySelectorAll('.source-link').length,1);assert.equal(h.$('result-count').textContent,'1 candidate to review · 1 has essential gaps');assert.match(h.$('ranking-note').textContent,/648 evidence leads in the wider pool/);assert.match(card.textContent,/Essential to confirm: Cardiac CT · Current practice/);
});

for(const field of ['project','candidate'])test(`a pending ${field} note save does not discard newer edits after navigation`,async t=>{
  const p=P.saveCandidate(P.createProject('Saved assessment'),person(),brief,'corpus-test'),h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'}),store=h.window.DocMapProjects.storage,save=store.save;let finish;store.save=record=>new Promise(resolve=>{finish=()=>save(record).then(resolve);});
  const textarea=field==='project'?h.$('project-notes'):h.$('project-candidates').querySelector('.notes-field'),saveButton=field==='project'?h.$('save-project-notes'):action(h.$('project-candidates'),'Save notes');textarea.value='Submitted note A';textarea.emit('input');saveButton.click();await h.flush();assert.equal(typeof finish,'function');textarea.value='Newer note B';textarea.emit('input');store.save=save;await finish();await h.flush();assert.equal(field==='project'?h.savedProjects.get(p.id).notes:h.savedProjects.get(p.id).candidates[0].notes,'Submitted note A');h.$('brand-home').click();h.$('open-project').click();await h.flush();const restored=field==='project'?h.$('project-notes'):h.$('project-candidates').querySelector('.notes-field');assert.equal(restored.value,'Newer note B');const retrySave=field==='project'?h.$('save-project-notes'):action(h.$('project-candidates'),'Save notes');retrySave.click();await h.flush();assert.equal(field==='project'?h.savedProjects.get(p.id).notes:h.savedProjects.get(p.id).candidates[0].notes,'Newer note B');
});

test('activity entry is cancelled by browser Back and cannot write to a different project with the same candidate',async t=>{
  const a=P.saveCandidate(P.createProject('Project A'),person(),brief,'corpus-test'),b=P.saveCandidate(P.createProject('Project B'),person(),brief,'corpus-test'),h=await setup(t,{initialProjects:[a,b],rememberedProjectId:a.id,pathname:'/expert-discovery/project'});h.$('project-select').value=b.id;h.$('project-select').emit('change');await h.flush();action(h.$('project-candidates'),'Record activity').click();h.$('event-type').value='contact-recorded';h.$('event-detail').value='Intended for project B';assert.equal(h.$('event-dialog').open,true);h.history.back();await h.flush();assert.equal(h.$('project-select').value,a.id);assert.equal(h.$('event-dialog').open,false);h.$('event-form').requestSubmit();await h.flush();assert.equal(h.savedProjects.get(a.id).events.length,0);assert.equal(h.savedProjects.get(b.id).events.length,0);
});

test('an activity submitted before navigation saves only to its origin and does not repaint the new project',async t=>{
  const a=P.saveCandidate(P.createProject('Project A'),person(),brief,'corpus-test'),b=P.saveCandidate(P.createProject('Project B'),person(),brief,'corpus-test'),h=await setup(t,{initialProjects:[a,b],rememberedProjectId:a.id,pathname:'/expert-discovery/project'});h.$('project-select').value=b.id;h.$('project-select').emit('change');await h.flush();const store=h.window.DocMapProjects.storage,save=store.save;let finish;store.save=record=>new Promise(resolve=>{finish=()=>save(record).then(resolve);});action(h.$('project-candidates'),'Record activity').click();h.$('event-type').value='contact-recorded';h.$('event-detail').value='Submitted for project B';h.$('event-form').requestSubmit();await h.flush();h.history.back();await h.flush();assert.equal(h.$('project-title').textContent,'Project A');store.save=save;await finish();await h.flush();assert.equal(h.savedProjects.get(a.id).events.length,0);assert.equal(h.savedProjects.get(b.id).events.length,1);assert.equal(h.savedProjects.get(b.id).events[0].detail,'Submitted for project B');assert.equal(h.$('project-title').textContent,'Project A');assert.equal(h.$('event-dialog').open,false);
});

test('an interrupted connection presents actionable recovery without raw browser error text',async t=>{
  const h=await setup(t);await ready(h);h.refine('Research is preferred').reject(new TypeError('Failed to fetch'));await h.flush();assert.match(h.$('search-error').textContent,/The connection was interrupted. Your previous results are unchanged./);assert.doesNotMatch(h.$('search-error').textContent,/Failed to fetch|TypeError/);assert.equal(h.$('followup-input').value,'Research is preferred');assert.equal(cards(h).length,1);assert.ok(action(h.$('search-error'),'Retry'));
});

test('a selected interest excerpt keeps its own label even when its requirement also has stronger activity evidence',async t=>{
  const h=await setup(t),c=person(),scope=structuredClone(brief);scope.requirements=[{id:'ct',kind:'modality',label:'Cardiac CT',importance:'essential'},{id:'report',kind:'activity',label:'Image interpretation',importance:'essential'},{id:'cad',kind:'condition',label:'Coronary artery disease',importance:'essential'},{id:'adults',kind:'population',label:'Adults',importance:'essential'}];
  c.evidence=[{...c.evidence[0],id:'ct-work',type:'clinical-practice',text:'I report cardiac CT scans.'},{...c.evidence[0],id:'cad-work',type:'clinical-practice',text:'I treat coronary artery disease.'},{...c.evidence[0],id:'cad-interest',type:'clinical-interest',text:'My interests include coronary artery disease in adults.'}];const row=(id,ids)=>({requirementId:id,label:scope.requirements.find(r=>r.id===id).label,status:'documented',importance:'essential',evidenceIds:ids,supportingEvidence:ids.map(eid=>{const e=c.evidence.find(e=>e.id===eid);return{evidenceId:eid,text:e.text,kind:'source-quote',evidenceType:e.type,limits:[]};})});c.requirementMatrix=[row('ct',['ct-work']),row('report',['ct-work']),row('cad',['cad-work','cad-interest']),row('adults',['cad-interest'])];
  assert.equal(Evidence.outcome(c.requirementMatrix[2],c,scope.requirements[2]).label,'Recorded activity');await ready(h,'scope-label',[c],{brief:scope});const card=cards(h)[0],selected=card.querySelectorAll('.requirement-proof').find(block=>block.textContent.includes('My interests include'));assert.ok(selected,'Interest excerpt contributes the additional adults scope');assert.match(selected.querySelector('.small-label').textContent,/Listed interest/);assert.doesNotMatch(selected.querySelector('.small-label').textContent,/Recorded activity/);card.querySelector('.card-open').click();const profile=h.$('profile-content').querySelector('.relevance-panel').querySelectorAll('.requirement-proof').find(block=>block.textContent.includes('My interests include'));assert.match(profile.querySelector('.small-label').textContent,/Listed interest/);
});

test('immediate reload after newer draft input survives before debounce and deferred IndexedDB writes',async t=>{
  const h=await setup(t);await ready(h);h.refine('Research should be optional.').reject(new Error('Offline'));await h.flush();const id=h.$('project-select').value,committed=structuredClone(h.savedProjects.get(id));assert.equal(committed.failedSearch.restoredDraft,true);h.window.DocMapProjects.storage.save=()=>new Promise(()=>{});const newer='A newer draft must survive retry.\nDo not submit this draft.';h.draft(newer);h.window.emit('pagehide');const mirror=JSON.parse(h.sessionValues.get('docmap-expert-draft-v1:'+id));assert.equal(mirror.draft,newer);assert.equal(mirror.failedAutoDraft,null);h.dispose();
  const reload=await setup(t,{initialProjects:[committed],rememberedProjectId:id,initialSessionValues:[...h.sessionValues]});action(reload.$('home-recovery'),'Retry').click();assert.equal(reload.requests[0].body.message,'Research should be optional.');assert.equal(reload.$('followup-input').value,newer);reload.requests[0].resolve(result('recovered'));await reload.flush();assert.equal(reload.$('followup-input').value,newer);assert.equal(reload.savedProjects.get(id).draft,newer);assert.equal(reload.savedProjects.get(id).failedSearch,null);
});

test('an immediate Home reload preserves a separate new-assessment draft without overwriting refinement',async t=>{
  const p=P.setBrief(P.createProject('Existing assessment'),brief,'corpus-test');p.draft='Existing refinement draft';const h=await setup(t,{initialProjects:[p]});h.window.DocMapProjects.storage.save=()=>new Promise(()=>{});h.draft('Unsent new device assessment','home-input');const reloaded=await setup(t,{initialProjects:[p],initialSessionValues:[...h.sessionValues]});assert.equal(reloaded.$('home-input').value,'Unsent new device assessment');reloaded.$('resume-search').click();assert.equal(reloaded.$('followup-input').value,p.draft);reloaded.requests[0].resolve(result('resume-existing'));await reloaded.flush();assert.equal(reloaded.savedProjects.get(p.id).newAssessmentDraft,'Unsent new device assessment');
});

test('submission clears the synchronous draft mirror before any storage promise resolves',async t=>{
  const h=await setup(t);await ready(h);h.draft('Submit this exact refinement');await h.flush();const id=h.$('project-select').value,committed=structuredClone(h.savedProjects.get(id));h.window.DocMapProjects.storage.save=()=>new Promise(()=>{});h.$('followup-form').requestSubmit();const mirror=JSON.parse(h.sessionValues.get('docmap-expert-draft-v1:'+id));assert.equal(mirror.draft,'');assert.equal(mirror.failedAutoDraft,null);const reload=await setup(t,{initialProjects:[committed],initialSessionValues:[...h.sessionValues]});reload.$('resume-search').click();assert.equal(reload.$('followup-input').value,'');assert.equal(reload.requests[0].body.message,undefined);
});

test('starting a new Home assessment clears only its submitted Home mirror and keeps the old refinement',async t=>{
  const h=await setup(t);await ready(h);const oldId=h.$('project-select').value;h.draft('Keep old refinement');h.$('brand-home').click();h.start('New skin imaging assessment');const nextId=h.$('project-select').value;assert.notEqual(nextId,oldId);const previous=JSON.parse(h.sessionValues.get('docmap-expert-draft-v1:'+oldId)),next=JSON.parse(h.sessionValues.get('docmap-expert-draft-v1:'+nextId));assert.equal(previous.draft,'Keep old refinement');assert.equal(previous.homeDraft,'');assert.equal(next.draft,'');assert.equal(next.homeDraft,'');assert.equal(next.failedAutoDraft,null);
});

test('malformed or wrong-project draft mirrors cannot replace a saved draft',async t=>{
  const p=P.setBrief(P.createProject('Existing'),brief,'corpus-test');p.draft='Saved refinement';p.newAssessmentDraft='Saved Home draft';const valid={schema:1,projectId:p.id,draft:'Untrusted replacement',homeDraft:'Untrusted Home',failedAutoDraft:null};for(const value of ['not-json',JSON.stringify({...valid,schema:99}),JSON.stringify({...valid,projectId:'another-project'}),JSON.stringify({...valid,draft:['invalid']}),JSON.stringify({...valid,draft:'x'.repeat(12001)})]){const h=await setup(t,{initialProjects:[p],initialSessionValues:[['docmap-expert-draft-v1:'+p.id,value]]});assert.equal(h.$('home-input').value,'Saved Home draft');h.$('resume-search').click();assert.equal(h.$('followup-input').value,'Saved refinement');}
});
