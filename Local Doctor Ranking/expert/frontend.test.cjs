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
    get id(){return this.attributes.id||'';}
    set id(value){if(this.id&&ids.get(this.id)===this)ids.delete(this.id);this.attributes.id=String(value);if(this.attributes.id)ids.set(this.attributes.id,this);}
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
    insertBefore(child,reference){if(reference===null){this.append(child);return child;}assert.ok(this.children.includes(reference),'insertBefore reference must belong to parent');child.remove();child.parentNode=this;this.children.splice(this.children.indexOf(reference),0,child);return child;}
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
  const sidebar=new E();sidebar.className='brief-sidebar';$('workspace').append(sidebar);sidebar.append($('brief-slot'));$('brief-slot').append($('brief-content'));move('brief-content',['original-brief']);move('original-brief',['original-brief-text']);move('brief-dialog',['brief-close','brief-done','brief-dialog-content']);move('recovery-dialog',['recovery-form','recovery-close']);move('recovery-form',['recovery-title','recovery-help','recovery-input-label','recovery-input','recovery-submit']);move('home',['home-recovery']);move('project-view',['project-recovery']);
  move('results-region',['results-title','result-count','search-error','result-notices','clarification','candidate-list','load-more','ranking-note']);
  move('results-region',['search-loading']);move('search-loading',['search-loading-phrase','search-loading-detail']);move('workspace',['composer-progress']);move('composer-progress',['composer-progress-phrase']);
  move('followup-form',['followup-input','followup-submit']);move('compare-tray',['compare-count','compare-clear','compare-open']);
  move('project-view',['project-title','project-subtitle','project-return','export-json','export-html','import-project','import-file','project-brief','project-candidates','project-notes','project-save-status','save-project-notes']);
  move('profile-dialog',['profile-close','profile-scroll']);move('profile-scroll',['profile-identity','profile-content']);
  move('compare-dialog',['compare-title','compare-close','comparison-brief','comparison-table','comparison-explain','comparison-answer']);
  move('new-project-dialog',['new-project-form','new-project-close']);move('new-project-form',['new-project-name']);
  move('event-dialog',['event-form','event-close']);move('event-form',['event-type','event-detail']);move('storage-alert',['storage-message','emergency-export']);
  for(const id of ['home-input','followup-input'])$(id).form=$(id==='home-input'?'home-form':'followup-form');
  for(const value of ['imaging','cardiac','skin','panel']){const example=new E('button');example.dataset.example=value;$('home').append(example);}
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
    assert.ok(['/api/expert/search','/api/expert/explain','/api/expert/page','/api/expert/shortlist-view','/api/expert/profile','/api/expert/location'].includes(url),'Unexpected offline transport request: '+url);
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
function person(id='expert-one',rank=1){const e={id:'e-'+id,candidateId:id,text:'Has a specialist interest in cardiac CT and coronary artery disease.',type:'clinical-interest',field:'biography',sourceRecordId:'source-'+id,sourceUrl:'https://example.com/'+id,sourceLabel:'Professional profile',dates:{sourceDate:null,observedAt:'2026-10-01'},qualifiers:['stated-interest'],attribution:'source-record'};return{id,name:'Dr '+id.replace(/-/g,' '),rank,role:'Consultant Cardiologist',specialty:'Cardiology',organisations:['Example hospital'],locations:[{name:'Example hospital',city:'London'}],registrations:[],evidenceIds:[e.id,'bio-'+id],sourceRecordIds:['source-'+id],evidence:[e],requirementMatrix:[{requirementId:'ct',label:'Cardiac CT',importance:'essential',status:'potential',evidenceIds:[e.id],note:'Stated interest; current activity requires confirmation.'},{requirementId:'practice',label:'Current practice',importance:'essential',status:'unknown',evidenceIds:[],note:'Current practice needs confirmation.'}],reasons:[{text:'Recorded interest in cardiac CT is relevant to the clinical scope.',status:'potential',evidenceIds:[e.id]}],gaps:[{requirementId:'practice',label:'Current practice',importance:'essential',status:'unknown'}],questions:[{kind:'qualification',text:'What is your current cardiac CT practice?'}],relationships:[]};}
const result=(id,people=[person()],extras={})=>({sessionId:'session',searchId:id,brief:structuredClone(brief),corpusVersion:'corpus-test',results:people,total:people.length,nextCursor:null,notices:[],needsClarification:false,...extras});
async function setup(t,options){const h=harness(options);t.after(h.dispose);await h.flush();return h;}
async function ready(h,id='first',people,extras){h.start('We need cardiac CT expertise').resolve(result(id,people,extras));await h.flush();}
const cards=h=>h.$('candidate-list').children;
const action=(host,label)=>host.querySelectorAll('button').find(b=>b.textContent===label);
const requestsFor=(h,path)=>h.requests.filter(r=>r.url==='/api/expert/'+path);
const section=(host,label)=>host.querySelectorAll('details').find(d=>d.dataset.section===label);
const background=(c=person(),version='corpus-test')=>({candidateId:c.id,corpusVersion:version,profileVersion:'expert-profile-v1',qualifications:[],about:[{...c.evidence[0],id:'bio-'+c.id,text:'Recorded training in brain-tumour radiotherapy.',type:'training'}],clinicalInterests:c.evidence,procedures:[],research:[],practiceLocations:c.locations.map(l=>({...l,address:l.address||'',provenance:{sourceRecordId:'source-'+c.id}})),profileUrls:[],registrations:[]});

test('refinement completion preserves the current reading position after scrolling during the request',async t=>{
  const h=await setup(t),people=['alpha','beta','gamma','delta'].map((id,i)=>person(id,i+1));await ready(h,'initial',people);h.enableLayout();
  const region=h.$('results-region');region.scrollTop=100;const pending=h.refine('Research is helpful');region.scrollTop=550;h.draft('A newer unsent detail');const before=cards(h)[1].getBoundingClientRect().top;
  pending.resolve(result('updated',people));await h.flush();
  assert.equal(region.scrollTop,550);assert.equal(cards(h)[1].getBoundingClientRect().top,before);assert.equal(h.$('followup-input').value,'A newer unsent detail');assert.equal(h.document.activeElement,h.$('followup-input'));
});

const taxonomy=require('./emdn-taxonomy.cjs'),deviceNode=taxonomy.lookup('Z11030692'),taxonomyMetadata=taxonomy.getMetadata();
const deviceMetadata={system:'EMDN',code:deviceNode.code,officialTerm:deviceNode.term,release:deviceNode.release,taxonomyVersion:deviceNode.taxonomyVersion,taxonomyDigest:taxonomyMetadata.workbookSha256,mappingVersion:taxonomyMetadata.mappingVersion,sourceUrl:taxonomyMetadata.sourceUrl,hierarchy:deviceNode.path.map(({code,term})=>({code,term}))};
const actualDeviceInterpreter=()=>require('./device-context.cjs').createDeviceInterpreter({taxonomy,interpret:require('./brief.cjs').createBriefInterpreter({client:null})});
const deviceScope=()=>({...structuredClone(deviceMetadata),interpretation:'Clinical expertise in cardiac CT, based on the stated coronary-disease application.',concepts:[{key:'cardiac-ct',requirementId:'ct',state:'active',sharedWithUser:false}],derivedRequirementIds:['ct']});
const deviceDraft=()=>({...structuredClone(deviceMetadata),question:'What clinical task and patient group will this CT system be used for?'});
const deviceFailure=()=>({code:'device-clarification',error:'The device category needs clinical context.',question:deviceDraft().question,deviceDraft:deviceDraft()});

test('results heading shares the scrolling region while view controls and composer remain separate',()=>{
  const html=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8'),region=html.indexOf('id="results-region"'),heading=html.indexOf('class="results-heading"'),composer=html.indexOf('class="composer-wrap"');
  assert(region<heading);assert(heading<html.indexOf('id="candidate-list"'));assert(html.indexOf('id="focused-view"')<region);assert(html.indexOf('id="home-return"')<region);assert(composer>html.indexOf('id="ranking-note"'));
});

test('official EMDN metadata and DocMap interpretation are visibly separate from candidate proof',async t=>{
  const h=await setup(t);h.start('Z11030692 for coronary-disease assessment').resolve(result('device',[person()],{brief:{...brief,deviceContext:deviceScope()}}));await h.flush();
  const context=h.$('result-notices').querySelector('.device-context');assert(context);assert.match(context.textContent,/Official EMDN category/);assert(context.textContent.includes(deviceMetadata.code+' · '+deviceMetadata.officialTerm));assert.match(context.textContent,/Taxonomy release: 2026/);assert.match(context.textContent,/DocMap search interpretation/);assert.match(context.textContent,/Clinical expertise in cardiac CT/);
  assert.equal(context.querySelector('details').open,false);assert.equal(context.querySelector('ol').children.length,5);assert.equal(context.querySelector('a').href,deviceMetadata.sourceUrl);assert.match(h.$('requirements').textContent,/DocMap interpretation of EMDN Z11030692/);assert.doesNotMatch(cards(h)[0].textContent,/COMPUTED TOMOGRAPHS (CT) - MEDICAL DEVICE SOFTWARE/);assert.equal(requestsFor(h,'explain').length,0);
});

test('accepted device context keeps full classification and general qualifications in optional depth',async t=>{
  const h=await setup(t);await ready(h,'compact-device',[person()],{brief:{...brief,deviceContext:deviceScope()}});
  const block=h.$('result-notices').querySelector('.device-context'),details=block.querySelector('details'),interpretation=block.querySelector('.device-interpretation');
  assert(block.classList.contains('device-context-accepted'));assert.equal(details.open,false);assert.equal(details.querySelector('.device-official-term').textContent,deviceMetadata.code+' · '+deviceMetadata.officialTerm);assert(details.contains(block.querySelector('.device-context-note')));assert(!details.contains(interpretation));assert(block.children.indexOf(interpretation)<block.children.indexOf(details));assert.match(cards(h)[0].textContent,/Current practice/);
});

test('only the exact duplicated device notice is removed from accepted results',async t=>{
  const duplicate='The EMDN category guides related expertise discovery; it does not establish experience with this device.',other='Clinical reporting needs confirmation for these candidates.',h=await setup(t);
  await ready(h,'device-notices',[person()],{brief:{...brief,deviceContext:deviceScope()},notices:[duplicate,other]});assert(!h.$('result-notices').textContent.includes(duplicate));assert(h.$('result-notices').textContent.includes(other));
  h.refine('Remove EMDN context').resolve(result('plain-notices',[person()],{notices:[duplicate,other]}));await h.flush();assert(h.$('result-notices').textContent.includes(duplicate));assert(h.$('result-notices').textContent.includes(other));
});

test('a first device clarification leaves an empty composer ready for an answer and retains the editable request',async t=>{
  const h=await setup(t);h.start('Z11030692').resolve(deviceFailure(),422);await h.flush();
  assert.equal(h.$('followup-input').value,'');assert.equal(h.$('composer-status').textContent,'Add the clinical application to continue.');const p=h.savedProjects.get(h.$('project-select').value);assert.equal(p.draft,'');assert.equal(p.failedSearch.payload.message,'Z11030692');assert(!p.failedSearch.restoredDraft);
  const pending=h.$('search-error').querySelector('.device-context');assert(pending.classList.contains('device-context-pending'));assert(!pending.classList.contains('device-context-accepted'));assert.equal(pending.querySelector('.device-context-title').textContent,deviceMetadata.code+' · '+deviceMetadata.officialTerm);
  action(h.$('search-error'),'Edit request').click();assert.equal(h.$('recovery-input').value,'Z11030692');assert.equal(h.$('followup-input').value,'');
});

test('removing accepted EMDN context sends an explicit clear and preserves location and unsent text',async t=>{
  const h=await setup(t);await ready(h,'device',[person()],{brief:{...brief,deviceContext:deviceScope()}});h.draft('Keep this next detail');editLocation(h,'Cambridge');action(h.$('result-notices'),'Remove code').click();
  const request=h.requests.at(-1);assert.equal(request.body.deviceCode,null);assert.equal(request.body.message,undefined);assert.equal(request.body.locationFilter,undefined);assert.equal(h.$('followup-input').value,'Keep this next detail');assert.equal(h.$('followup-location').value,'Cambridge');
  request.resolve(result('without-device'));await h.flush();assert.equal(h.$('result-notices').querySelector('.device-context'),null);assert.equal(h.$('followup-input').value,'Keep this next detail');assert.equal(h.$('followup-location').value,'Cambridge');
});

test('device clarification preserves accepted cards and answers through a separate editable application',async t=>{
  const h=await setup(t);await ready(h);const before=cards(h)[0],pending=h.refine('Z11030692');h.draft('Do not submit this newer draft');pending.resolve(deviceFailure(),422);await h.flush();
  assert.equal(cards(h)[0],before);assert.equal(h.$('followup-input').value,'Do not submit this newer draft');assert.equal(h.$('composer-status').textContent,'Add the clinical application to continue.');assert.match(h.$('search-error').textContent,/What clinical task/);assert.match(h.$('search-error').textContent,/Official EMDN category/);assert.doesNotMatch(h.$('search-error').textContent,/No leads/);
  action(h.$('search-error'),'Add clinical application').click();assert.equal(h.$('recovery-input').value,'');assert.equal(h.$('recovery-title').textContent,'Describe the clinical application');assert.match(h.$('recovery-help').textContent,/patient group/);h.$('recovery-input').value='Coronary-disease assessment in adults';h.$('recovery-form').requestSubmit();
  const request=h.requests.at(-1);assert.equal(request.body.deviceCode,deviceMetadata.code);assert.equal(request.body.message,'Z11030692\nCoronary-disease assessment in adults');assert.deepEqual(request.body.resumeBrief,brief);assert.equal(request.body.deviceContext,undefined);assert.equal(request.body.deviceDraft,undefined);assert.equal(h.$('followup-input').value,'Do not submit this newer draft');
  request.resolve(result('accepted',[person()],{brief:{...brief,deviceContext:deviceScope()}}));await h.flush();assert.equal(h.$('followup-input').value,'Do not submit this newer draft');assert.equal(h.$('search-error').textContent,'');assert.equal(h.savedProjects.get(h.$('project-select').value).failedSearch,null);
});

test('a follow-up answer carries only the pending exact code and its independently submitted location',async t=>{
  const h=await setup(t);h.start('Z11030692').resolve(deviceFailure(),422);await h.flush();assert.equal(cards(h).length,0);editLocation(h,'UK');const request=h.refine('Coronary-disease assessment in adults');
  assert.equal(request.body.deviceCode,'Z11030692');assert.equal(request.body.message,'Z11030692\nCoronary-disease assessment in adults');assert.equal(request.body.locationFilter.query,'UK');assert.equal(request.body.deviceDraft,undefined);assert.equal(request.body.hierarchy,undefined);
});

test('a location-only update does not implicitly apply an unresolved device category',async t=>{
  const h=await setup(t);await ready(h);h.refine('Z11030692').resolve(deviceFailure(),422);await h.flush();h.draft('');editLocation(h,'Oxford');h.$('followup-form').requestSubmit();assert.equal(h.requests.at(-1).body.locationFilter.query,'Oxford');assert.equal(h.requests.at(-1).body.deviceCode,undefined);
});

test('editing an unknown or conflicting code retains exact new text rather than silently adding prior metadata',async t=>{
  const h=await setup(t);await ready(h);h.refine('Z11030692').resolve(deviceFailure(),422);await h.flush();action(h.$('search-error'),'Edit request').click();assert.equal(h.$('recovery-input').value,'Z11030692');h.$('recovery-input').value='V92 for evaluating primary-care diagnosis';h.$('recovery-form').requestSubmit();
  assert.equal(h.requests.at(-1).body.message,'V92 for evaluating primary-care diagnosis');assert.equal(h.requests.at(-1).body.deviceCode,undefined);
});

test('dismissing pending EMDN context changes neither accepted search nor newer draft and needs no request',async t=>{
  const h=await setup(t);await ready(h);h.refine('Z11030692').resolve(deviceFailure(),422);await h.flush();h.draft('A newer cardiology query');const count=h.requests.length,before=cards(h)[0];action(h.$('search-error'),'Dismiss code').click();await h.flush();
  assert.equal(h.requests.length,count);assert.equal(cards(h)[0],before);assert.equal(h.$('followup-input').value,'A newer cardiology query');assert.equal(h.$('search-error').textContent,'');assert.equal(h.savedProjects.get(h.$('project-select').value).failedSearch,null);assert.deepEqual(h.savedProjects.get(h.$('project-select').value).activeBrief,brief);
  h.refine('A newer cardiology query');assert.equal(h.requests.at(-1).body.deviceCode,undefined);
});

test('unknown and multiple code errors remain recoverable and do not claim an official category',async t=>{
  for(const code of ['device-invalid','device-multiple','device-conflict']){
    const h=await setup(t);await ready(h);h.refine('Unresolved EMDN request').resolve({code,error:'Choose one recognised EMDN code.'},422);await h.flush();assert.equal(cards(h).length,1);assert.equal(h.$('search-error').querySelector('.device-context'),null);assert.match(h.$('search-error').textContent,/Choose one recognised/);assert(action(h.$('search-error'),'Edit request'));assert.equal(h.$('followup-input').value,'Unresolved EMDN request');
  }
});

test('device clarification survives reload without automatic lookup or loss of a newer draft',async t=>{
  const h=await setup(t);await ready(h);h.refine('Z11030692').resolve(deviceFailure(),422);await h.flush();h.draft('New unsent detail');await h.flush();const p=h.savedProjects.get(h.$('project-select').value),reload=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'});
  assert.equal(reload.requests.length,0);assert.match(reload.$('project-recovery').textContent,/Z11030692/);action(reload.$('project-recovery'),'Add clinical application').click();reload.$('recovery-input').value='Coronary-disease assessment';reload.$('recovery-form').requestSubmit();assert.equal(reload.requests[0].body.deviceCode,'Z11030692');assert.equal(reload.$('followup-input').value,'New unsent detail');
});

test('device lookup completion in another view never takes over navigation or the newer draft',async t=>{
  const h=await setup(t);await ready(h);const pending=h.refine('Z11030692 for coronary-disease assessment');h.draft('Newer draft');h.$('brand-home').click();pending.resolve(result('device',[person()],{brief:{...brief,deviceContext:deviceScope()}}));await h.flush();assert.equal(h.$('home').hidden,false);assert.equal(h.$('workspace').hidden,true);h.$('resume-search').click();assert.match(h.$('result-notices').textContent,/Official EMDN category/);assert.equal(h.$('followup-input').value,'Newer draft');assert.equal(h.requests.length,2);
});

test('a device clarification retains unresolved role, location and priorities without replaying successful history',async t=>{
  const h=await setup(t);await ready(h);const unresolved='For EMDN Z11030692 find UK cardiologists; research experience is optional.';h.refine(unresolved).resolve(deviceFailure(),422);await h.flush();const request=h.refine('For coronary-disease assessment in adults');
  assert.equal(request.body.message,unresolved+'\nFor coronary-disease assessment in adults');assert.doesNotMatch(request.body.message,/We need cardiac CT expertise/);assert.equal(request.body.deviceCode,'Z11030692');
});

test('an oversized clarification stays editable and never silently drops the unresolved request',async t=>{
  const h=await setup(t);await ready(h);h.refine('Z11030692 '+('clinical context '.repeat(200))).resolve(deviceFailure(),422);await h.flush();const count=h.requests.length,answer='Additional application '.repeat(100);h.refine(answer);
  assert.equal(h.requests.length,count);assert.equal(h.$('followup-input').value,answer);assert.match(h.$('toast').textContent,/Use Edit request/);assert.match(h.$('search-error').textContent,/Official EMDN category/);
});

for(const message of ['J010792','Use EMDN J010792 instead','Remove the EMDN code'])test('a real pending CT question cannot be glued to an explicit device change: '+message,async t=>{
  const interpret=actualDeviceInterpreter(),accepted=await interpret({message:'Dermatologists for Z12040118'}),h=await setup(t);await ready(h,'accepted',[person()],{brief:accepted.brief});
  const unresolved=await interpret({previous:accepted.brief,message:'EMDN Z11030692'});assert.equal(unresolved.deviceError.code,'device-clarification');h.refine('EMDN Z11030692').resolve(unresolved.deviceError,422);await h.flush();
  const request=h.refine(message),parsed=await interpret({...request.body,previous:accepted.brief});assert.equal(parsed.deviceError,undefined);assert.equal(request.body.message,message);assert.equal(request.body.deviceCode,undefined);
  assert.equal(parsed.brief.deviceContext?.code,message.startsWith('Remove')?undefined:'J010792');
});

test('editing a repeated real clarification can replace its previous explicit code',async t=>{
  const interpret=actualDeviceInterpreter(),h=await setup(t),unresolved=await interpret({message:'EMDN Z11030692'});h.start('EMDN Z11030692').resolve(unresolved.deviceError,422);await h.flush();
  const answer=h.refine('Primary care'),again=await interpret(answer.body);assert.equal(again.deviceError.code,'device-clarification');answer.resolve(again.deviceError,422);await h.flush();
  action(h.$('search-error'),'Edit request').click();h.$('recovery-input').value='J010792';h.$('recovery-form').requestSubmit();const retry=h.requests.at(-1),parsed=await interpret(retry.body);assert.equal(parsed.deviceError,undefined);assert.equal(parsed.brief.deviceContext.code,'J010792');assert.equal(retry.body.deviceCode,undefined);
});

test('clinical alphanumeric detail is an application answer, not an unrequested replacement code',async t=>{
  const interpret=actualDeviceInterpreter(),h=await setup(t),unresolved=await interpret({message:'EMDN Z11030692'});h.start('EMDN Z11030692').resolve(unresolved.deviceError,422);await h.flush();
  const request=h.refine('Lung cancer imaging in patients with a T790M mutation'),parsed=await interpret(request.body);assert.equal(request.body.deviceCode,'Z11030692');assert.equal(parsed.deviceError,undefined);assert.equal(parsed.brief.deviceContext.code,'Z11030692');assert(!parsed.brief.requirements.some(r=>r.label==='Cardiac CT'));
});

test('actual taxonomy clarification reloads through project validation and accepts its real interpretation',async t=>{
  const interpret=actualDeviceInterpreter(),h=await setup(t),question=await interpret({message:'For EMDN Z11030692 find UK cardiologists; research is optional.'});h.start('For EMDN Z11030692 find UK cardiologists; research is optional.').resolve(question.deviceError,422);await h.flush();h.draft('Preserve this separate draft');await h.flush();
  const saved=h.savedProjects.get(h.$('project-select').value),roundtrip=P.importJSON(P.exportJSON(saved));assert.deepEqual(roundtrip.failedSearch.deviceDraft,question.deviceError.deviceDraft);const reload=await setup(t,{initialProjects:[roundtrip],pathname:'/expert-discovery/project'});assert.equal(reload.requests.length,0);
  action(reload.$('project-recovery'),'Add clinical application').click();reload.$('recovery-input').value='It supports coronary artery disease diagnosis.';reload.$('recovery-form').requestSubmit();const request=reload.requests.at(-1),accepted=await interpret(request.body);assert.equal(accepted.deviceError,undefined);assert.equal(accepted.brief.deviceContext.code,'Z11030692');request.resolve(result('real-device',[person()],{brief:accepted.brief}));await reload.flush();
  const next=reload.savedProjects.get(reload.$('project-select').value);assert.deepEqual(P.validateProject(next).activeBrief.deviceContext,accepted.brief.deviceContext);assert.equal(next.failedSearch,null);assert.equal(next.draft,'Preserve this separate draft');assert.match(reload.$('result-notices').textContent,/COMPUTED TOMOGRAPHS/);
});

test('a clarification answer keeps explicit location control authoritative over preserved pending text',async t=>{
  const interpret=actualDeviceInterpreter(),h=await setup(t),question=await interpret({message:'EMDN Z11030692 in the UK'});h.start('EMDN Z11030692 in the UK').resolve(question.deviceError,422);await h.flush();editLocation(h,'Cambridge');const request=h.refine('Lung cancer imaging');
  assert.match(request.body.message,/in the UK/);assert.equal(request.body.locationFilter.query,'Cambridge');assert.equal(request.body.deviceCode,'Z11030692');editLocation(h,'Brighton');const accepted=await interpret(request.body);request.resolve(result('geo-device',[person()],{brief:{...accepted.brief,locationFilter:{kind:'country',country:'GB',query:'UK',label:'UK-wide'}}}));await h.flush();assert.equal(h.$('followup-location').value,'Brighton');
});

test('long official terms and hierarchy remain intact as text with optional metadata depth',async t=>{
  const h=await setup(t),scope=deviceScope();scope.officialTerm='DEVICE CATEGORY '.repeat(22).trim();scope.hierarchy.at(-1).term=scope.officialTerm;await ready(h,'long-device',[person()],{brief:{...brief,deviceContext:scope}});
  const block=h.$('result-notices').querySelector('.device-context');assert(block.querySelector('.device-context-title').textContent.endsWith(scope.officialTerm));assert.equal(block.querySelector('details').open,false);assert(block.querySelector('ol').textContent.includes(scope.officialTerm));
  const css=fs.readFileSync(path.join(__dirname,'public/styles.css'),'utf8');assert.match(css,/\.device-context\{[^}]*overflow-wrap:anywhere/);assert.match(css,/\.device-context-heading>div\{min-width:0\}/);
});

test('simple discovery presents relevance and optional research without inventing mandatory gaps',async t=>{
  const h=await setup(t),c=person(),b={...brief,requirements:[{id:'ct',kind:'modality',label:'Cardiac CT',text:'Cardiac CT',importance:'focus',matchIntent:'interest'}]};
  c.requirementMatrix=[{...c.requirementMatrix[0],status:'documented',importance:'focus',kind:'modality'}];
  c.evidence[0].review={limitations:['Availability and regulatory-assessment experience are not confirmed.']};
  const research={...c.evidence[0],id:'related-study',type:'research',text:'Coauthored a 2010 cardiac CT study protocol.',dates:{sourceDate:'2010-05-11'}};c.evidence.push(research);
  c.relatedEvidence=[{evidenceId:research.id,text:research.text,kind:'source-quote',evidenceType:'research',sourceDate:'2010-05-11',limits:[],relatedToRequirementIds:['ct']}];
  await ready(h,'simple',[c],{brief:b});const card=cards(h)[0];
  assert.match(card.textContent,/Cardiac CTListed interest/);assert.match(card.textContent,/Related research/);assert.match(card.textContent,/2010-05-11/);assert.doesNotMatch(card.textContent,/Essential|Must-have|regulatory-assessment|Availability/);
  assert.equal(h.$('result-count').textContent,'1 candidate to explore');assert.equal(h.$('requirements').querySelector('select').value,'focus');
  assert.equal(card.querySelectorAll('.relevance-lead').length,1);assert.equal(card.querySelectorAll('.relevance-detail').length,1);
  assert.ok(card.children.indexOf(card.querySelector('.card-relevance'))<card.children.indexOf(card.querySelector('.card-actions')));
  action(card,'View profile →').click();assert.equal(h.$('profile-dialog').open,true);assert.match(h.$('profile-content').querySelector('.relevance-panel').textContent,/Related research/);assert.doesNotMatch(h.$('profile-content').querySelector('.relevance-panel').textContent,/Availability and regulatory/);assert.match(h.$('profile-content').textContent,/Availability and regulatory/);assert.equal(requestsFor(h,'search').length,1);assert.equal(requestsFor(h,'profile').length,1);assert.equal(requestsFor(h,'explain').length,0);
});

test('user can make a focus criterion mandatory and return it to focus without changing a newer draft',async t=>{
  const h=await setup(t),b={...brief,requirements:[{id:'ct',kind:'modality',label:'Cardiac CT',text:'Cardiac CT',importance:'focus'}]};await ready(h,'focus',[person()],{brief:b});
  let select=h.$('requirements').querySelector('select');assert.equal(select.querySelectorAll('option').length,3);select.value='essential';select.emit('change');assert.deepEqual(h.requests.at(-1).body.patch,{requirementId:'ct',importance:'essential'});
  h.draft('Prefer cardiac CT research too');h.requests.at(-1).resolve(result('must',[person()],{brief:{...b,version:2,requirements:[{...b.requirements[0],importance:'essential'}]}}));await h.flush();assert.equal(h.$('followup-input').value,'Prefer cardiac CT research too');
  select=h.$('requirements').querySelector('select');select.value='focus';select.emit('change');assert.deepEqual(h.requests.at(-1).body.patch,{requirementId:'ct',importance:'focus'});assert.equal(h.$('followup-input').value,'Prefer cardiac CT research too');
});

test('comparison includes additional sourced research without adding it to the search criteria',async t=>{
  const h=await setup(t),a=person('alpha'),b=person('beta'),scope={...brief,requirements:[{...brief.requirements[0],importance:'focus'}]},e={...a.evidence[0],id:'extra',type:'research',text:'Coauthored a cardiac CT study protocol in 2010.',dates:{sourceDate:'2010-05-11'}};
  a.evidence.push(e);a.relatedEvidence=[{evidenceId:e.id,text:e.text,kind:'source-quote',evidenceType:'research',sourceDate:'2010-05-11',relatedToRequirementIds:['ct']}];await ready(h,'related',[a,b],{brief:scope});action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.match(h.$('comparison-table').textContent,/Related research · additional context/);assert.match(h.$('comparison-table').textContent,/2010-05-11/);assert.doesNotMatch(h.$('requirements').textContent,/Related research/);assert.equal(h.requests.length,1);
});

test('compact cards disclose unresolved optional focus in source checks without inventing must-haves',async t=>{
  const h=await setup(t),c=person(),scope={...brief,requirements:[{id:'ct',kind:'modality',label:'Cardiac CT',importance:'focus'},{id:'cad',kind:'condition',label:'Coronary disease',importance:'focus'},{id:'adults',kind:'population',label:'Adults',importance:'focus'},{id:'setting',kind:'setting',label:'Primary care',importance:'focus'}]};
  c.evidence=scope.requirements.map((r,i)=>({...c.evidence[0],id:'f'+i,text:['I report cardiac CT.','I treat coronary disease.','I treat adult patients.','I trained in primary care.'][i],type:i===3?'training':'clinical-practice'}));
  c.requirementMatrix=scope.requirements.map((r,i)=>({requirementId:r.id,label:r.label,kind:r.kind,importance:r.importance,status:i===3?'potential':'documented',evidenceIds:['f'+i]}));
  await ready(h,'many-focus',[c],{brief:scope});const card=cards(h)[0];assert.equal(card.querySelectorAll('.relevance-detail').length,1);assert.doesNotMatch(card.textContent,/Must-have/);action(card,'View profile →').click();const checks=section(h.$('profile-content'),'Sources and search checks');assert.equal(checks.open,false);assert.match(checks.textContent,/How each search criterion matches/);assert.equal(checks.querySelectorAll('.criterion-evidence').length,4);const primary=checks.querySelectorAll('.criterion-evidence').find(r=>r.textContent.includes('Primary care'));assert.match(primary.textContent,/Partial|Potential|confirmation/i);assert.match(primary.textContent,/I trained in primary care/);
});

test('multiple recorded limitations remain visible for ordinary search-focus criteria',async t=>{
  const h=await setup(t),c=person(),scope={...brief,requirements:[{...brief.requirements[0],importance:'focus'},{id:'cad',kind:'condition',label:'Coronary disease',importance:'focus'}]};c.requirementMatrix=[{requirementId:'ct',label:'Cardiac CT',importance:'focus',status:'mismatch',evidenceIds:[c.evidence[0].id]},{requirementId:'cad',label:'Coronary disease',importance:'focus',status:'needs-review',evidenceIds:[c.evidence[0].id]}];await ready(h,'limits',[c],{brief:scope});assert.match(cards(h)[0].textContent,/Source limitations: Cardiac CT · Coronary disease/);assert.doesNotMatch(cards(h)[0].textContent,/Must-have not established/);
});

test('a dangling mismatch source is unavailable evidence rather than a recorded limitation on cards and profiles',async t=>{
  const h=await setup(t),c=person(),scope={...brief,requirements:[{...brief.requirements[0],importance:'focus'}]};c.requirementMatrix=[{requirementId:'ct',label:'Cardiac CT',importance:'focus',status:'mismatch',evidenceIds:['missing-source'],note:'An unsupported imported limitation.'}];
  await ready(h,'dangling-mismatch',[c],{brief:scope});const card=cards(h)[0];assert.match(card.textContent,/Specific experience requested in this search is not established/);assert.doesNotMatch(card.textContent,/Recorded limitation|unsupported imported limitation/);action(card,'View profile →').click();assert.doesNotMatch(h.$('profile-content').querySelector('.relevance-panel').textContent,/Recorded limitation|unsupported imported limitation/);assert.match(h.$('profile-content').textContent,/Supporting text is unavailable/);assert.equal(c.requirementMatrix[0].status,'mismatch');
});

test('comparison does not claim an excluded role is recorded without its source and retains valid role evidence',async t=>{
  const h=await setup(t),a=person('missing'),b=person('sourced'),excluded={id:'exclude',kind:'role',label:'Psychiatrist',text:'Psychiatrist',importance:'essential',polarity:'exclude'},scope={...brief,requirements:[excluded]},owned={...b.evidence[0],id:'recorded-role',type:'professional-background',text:'I am a psychiatrist.'};b.evidence.push(owned);a.requirementMatrix=[{...excluded,requirementId:'exclude',status:'documented',evidenceIds:['missing-role']}];b.requirementMatrix=[{...excluded,requirementId:'exclude',status:'documented',evidenceIds:[owned.id]}];
  await ready(h,'excluded-role-sources',[a,b],{brief:scope});action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();const cells=h.$('comparison-table').querySelectorAll('tr').at(-1).querySelectorAll('td');assert.match(cells[0].textContent,/No excluded role is established/);assert.doesNotMatch(cells[0].textContent,/The excluded role is recorded/);assert.match(cells[1].textContent,/The excluded role is recorded/);assert.equal(a.requirementMatrix[0].status,'documented');
});

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
  card.click();assert.equal(h.$('profile-dialog').open,true);assert.equal(requestsFor(h,'profile').length,1);assert.equal(requestsFor(h,'explain').length,0);h.$('profile-close').click();await h.flush();assert.equal(h.$('profile-dialog').open,false);assert.equal(h.document.activeElement.className,'card-open');
  h.history.forward();await h.flush();assert.equal(h.$('profile-dialog').open,true);assert.equal(requestsFor(h,'profile').length,1);assert.equal(requestsFor(h,'explain').length,0);
});

test('text selection prevents card activation and the primary name action is keyboard reachable',async t=>{
  const h=await setup(t);await ready(h);h.window.getSelection=()=>({toString:()=> 'Selected source text'});cards(h)[0].click();assert.equal(h.$('profile-dialog').open,false);const open=cards(h)[0].querySelector('.card-open');assert.equal(open.tagName,'BUTTON');open.click();assert.equal(h.$('profile-dialog').open,true);
});

test('profile disclosures and reading position survive close and reopen for the same search',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();requestsFor(h,'profile')[0].resolve(background());await h.flush();const content=h.$('profile-content');assert.equal(section(content,'About').open,true);section(content,'About').open=false;section(content,'Recorded procedures').open=true;section(content,'Practice locations').open=true;h.$('profile-scroll').scrollTop=570;
  h.$('profile-close').click();await h.flush();cards(h)[0].querySelector('.card-open').click();assert.equal(h.$('profile-scroll').scrollTop,570);assert.equal(section(content,'Recorded procedures').open,true);assert.equal(section(content,'Practice locations').open,true);assert.equal(section(content,'About').open,false);assert.equal(content.querySelector('.optional-ai').open,false);assert.equal(requestsFor(h,'profile').length,1);assert.equal(requestsFor(h,'explain').length,0);
});

test('AI starts deliberately once and replaces only its answer area with source evidence retained',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();const sections=h.$('profile-content').querySelectorAll('details');sections[0].open=true;const explain=action(h.$('profile-content'),'Generate a relevance summary');explain.click();assert.equal(h.requests.at(-1).url,'/api/expert/explain');assert.equal(h.requests.at(-1).body.kind,'explanation');explain.click();assert.equal(h.requests.length,3);
  h.requests.at(-1).resolve({summary:'The profile records an interest in the relevant modality.',sections:[],citations:[],provider:'openrouter',retryable:false});await h.flush();assert.equal(sections[0].open,true);assert.equal(sections[0].isConnected,true);assert.match(h.$('profile-content').textContent,/Current practice/);assert.equal(action(h.$('profile-content'),'Explanation ready').disabled,true);
  h.$('profile-close').click();await h.flush();h.history.forward();await h.flush();assert.equal(h.requests.length,3);assert.match(h.$('profile-content').textContent,/The profile records an interest/);
});

test('comparison uses the same evidence outcomes and only requests AI on explicit action',async t=>{
  const h=await setup(t);await ready(h,'compare',[person('a',1),person('b',2)]);action(cards(h)[0],'Compare').click();assert.equal(h.$('compare-open').disabled,true);action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.equal(h.$('compare-dialog').open,true);assert.equal(h.requests.length,1);assert.match(h.$('comparison-table').textContent,/Not found in sources/);assert.match(h.$('comparison-table').textContent,/Potential relevance/);assert.match(h.$('comparison-table').textContent,/does not establish performed clinical work/);
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
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();action(h.$('profile-content'),'Generate a relevance summary').click();const pending=h.requests.at(-1);h.$('profile-close').click();await h.flush();cards(h)[0].querySelector('.card-open').click();assert.equal(action(h.$('profile-content'),'Checking the source evidence…').disabled,true);assert.equal(h.requests.length,3);
  pending.resolve({summary:'An evidence-grounded explanation of the clinical interest.',sections:[],citations:[],retryable:false});await h.flush();assert.match(h.$('profile-content').textContent,/An evidence-grounded explanation/);assert.equal(action(h.$('profile-content'),'Explanation ready').disabled,true);
});

test('AI failure preserves the source evidence and offers an explicit retry',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();action(h.$('profile-content'),'Generate a relevance summary').click();h.requests.at(-1).reject(new Error('Provider temporarily unavailable'));await h.flush();assert.match(h.$('profile-content').textContent,/specialist interest in cardiac CT/);assert.equal(action(h.$('profile-content'),'Retry personalisation').disabled,false);assert.equal(h.requests.length,3);
});

test('a changed search never inherits another snapshot’s explanation or profile disclosure state',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();h.$('profile-content').querySelector('details').open=true;action(h.$('profile-content'),'Generate a relevance summary').click();h.requests.at(-1).resolve({summary:'Only the old brief.',sections:[],citations:[],retryable:false});await h.flush();h.$('profile-close').click();await h.flush();h.refine('Research is preferred').resolve(result('new-search'));await h.flush();cards(h)[0].querySelector('.card-open').click();assert.doesNotMatch(h.$('profile-content').textContent,/Only the old brief/);assert.equal(h.$('profile-content').querySelector('details').open,false);assert.equal(action(h.$('profile-content'),'Generate a relevance summary').disabled,false);assert.equal(h.requests.length,4);
});

test('project contact filtering uses only explicit local activity and does not contact anyone',async t=>{
  const h=await setup(t);await ready(h);action(cards(h)[0],'Save').click();await h.flush();h.$('open-project').click();action(h.$('project-candidates'),'Record activity').click();h.$('event-type').value='contact-recorded';h.$('event-detail').value='Team recorded an earlier enquiry.';h.$('event-form').requestSubmit();await h.flush();h.$('project-return').click();h.refine('Only people we have not already contacted');assert.deepEqual(h.requests.at(-1).body.excludeContactedIds,['expert-one']);assert.equal(h.requests.filter(r=>r.url.includes('send')).length,0);assert.equal(requestsFor(h,'search').length,2);assert.equal(requestsFor(h,'profile').length,1);
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
  h.history.back();await h.flush();assert.equal(h.$('project-select').value,firstId);h.$('resume-search').click();assert.equal(h.$('followup-input').value,first.draft);assert.equal(h.$('documented-only').checked,true);assert.equal(h.history.state.searchId,'strict-cardiac');assert.equal(requestsFor(h,'search').length,3);assert.equal(requestsFor(h,'profile').length,1);
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
  const card=cards(h)[0];assert.match(card.textContent,/Recorded activity/);assert.match(card.textContent,/Recorded research/);assert.doesNotMatch(card.textContent,/unrelated opening|A\. Example/);assert.equal(card.querySelector('blockquote').textContent,'Reports cardiac CT for coronary artery disease.');assert.match(card.textContent,/Reviewed source summary/);assert.match(card.textContent,/2015-06-01/);assert.doesNotMatch(card.textContent,/Coauthorship does not establish/);
  action(card,'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.doesNotMatch(h.$('comparison-table').textContent,/unrelated opening|A\. Example/);assert.match(h.$('comparison-table').textContent,/Coauthorship does not establish/);assert.ok(h.$('comparison-table').querySelectorAll('.comparison-candidate-name').length>=4);assert.equal(h.requests.length,1);
});

test('explicit excluded and permitted roles remain visibly constraints in brief and comparison',async t=>{
  const h=await setup(t),roles={...brief,roleMode:'only',excludedRoles:['Psychiatrist'],requirements:[...brief.requirements,{id:'no-psychiatrist',label:'Psychiatrist',kind:'role',polarity:'exclude',importance:'essential'},{id:'psychologist',label:'Clinical psychologist',kind:'role',strictRole:true,importance:'essential'}]};await ready(h,'roles',[person('one'),person('two')],{brief:roles});
  assert.match(h.$('requirements').textContent,/Exclude: Psychiatrist/);assert.match(h.$('requirements').textContent,/Allowed role: Clinical psychologist/);assert.match(h.$('brief-facts').textContent,/Permitted roles only: Clinical psychologist/);assert.equal(h.$('requirements').querySelectorAll('select').length,2);
  action(cards(h)[0],'Compare').click();action(cards(h)[1],'Compare').click();h.$('compare-open').click();assert.match(h.$('comparison-table').textContent,/Exclude: Psychiatrist/);assert.match(h.$('comparison-table').textContent,/Allowed role: Clinical psychologist/);assert.match(h.$('comparison-table').textContent,/Role exclusion filter/);assert.match(h.$('comparison-table').textContent,/Incomplete role data does not prove absence/);
});

test('a scoped clinical interest never borrows an unrelated parent practice label',async t=>{
  const h=await setup(t),c=person();c.evidence[0].type='clinical-practice';c.evidence[0].text='Practises echocardiography. Has an interest in cardiac CT.';c.requirementMatrix[0].supportingEvidence=[{evidenceId:c.evidence[0].id,text:'Has an interest in cardiac CT.',kind:'source-quote',evidenceType:'clinical-interest',limits:[]}];await ready(h,'scope',[c]);
  assert.match(cards(h)[0].textContent,/Cardiac CTListed interest/);assert.doesNotMatch(cards(h)[0].textContent,/Recorded activity|Practises echocardiography/);cards(h)[0].querySelector('.card-open').click();assert.match(h.$('profile-content').querySelector('.relevance-panel').textContent,/Listed interest/);assert.doesNotMatch(h.$('profile-content').querySelector('.relevance-panel').textContent,/Recorded activity/);
});

test('shortlist explicitly identifies an essential setting gap across the shown leads',async t=>{
  const h=await setup(t),people=[person('one'),person('two')],scope={...brief,requirements:[...brief.requirements,{id:'setting',kind:'setting',label:'Primary care',importance:'essential'}]};await ready(h,'partial',people,{brief:scope,total:1999});
  assert.equal(h.$('result-count').textContent,'2 candidates to explore · 2 with a must-have to confirm');assert.match(h.$('result-notices').textContent,/Primary care needs confirmation for all 2 shown/);
});

for(const status of ['mismatch','needs-review'])test(`a ${status} activity passage stays a visible limitation rather than a positive card/profile proof`,async t=>{
  const h=await setup(t),c=person();c.evidence[0].text='I do not report cardiac CT.';c.evidence[0].type='clinical-practice';c.requirementMatrix[0]={...c.requirementMatrix[0],status,note:'The source limits this activity.',supportingEvidence:[{evidenceId:c.evidence[0].id,text:c.evidence[0].text,kind:'source-quote',evidenceType:'clinical-practice',limits:[]}]};c.reasons=[{text:'This source limits cardiac CT reporting.',status,evidenceIds:[c.evidence[0].id]}];await ready(h,'negative',[c]);
  assert.doesNotMatch(cards(h)[0].textContent,/Recorded activity/);assert.match(cards(h)[0].textContent,/Recorded limitation · Cardiac CT/);assert.match(cards(h)[0].textContent,/The source limits this activity/);cards(h)[0].querySelector('.card-open').click();const panel=h.$('profile-content').querySelector('.relevance-panel');assert.doesNotMatch(panel.textContent,/Recorded activity/);assert.match(panel.textContent,/Recorded limitation/);
});

test('potential evidence is explicitly qualified on cards and in the profile',async t=>{
  const h=await setup(t);await ready(h);assert.match(cards(h)[0].textContent,/Partial evidence/);cards(h)[0].querySelector('.card-open').click();assert.match(h.$('profile-content').querySelector('.relevance-panel').textContent,/Potential relevance · confirmation required/);
});

for(const withResearch of [false,true])test(`alternative CT biographies do not duplicate the card proof${withResearch?' when distinct research evidence is available':''}`,async t=>{
  const h=await setup(t),c=person(),first=c.evidence[0];first.type='clinical-practice';first.text='Reports cardiac CT scans.';const alternative={...first,id:'ct-alternative',text:'Has experience reporting cardiac CT.'};c.evidence.push(alternative);
  c.requirementMatrix[0].status='documented';c.requirementMatrix[0].evidenceIds=[first.id,alternative.id];c.requirementMatrix[0].supportingEvidence=[first,alternative].map(e=>({evidenceId:e.id,text:e.text,kind:'source-quote',evidenceType:'clinical-practice',limits:[]}));
  const scope=structuredClone(brief);
  if(withResearch){const research={...first,id:'research-distinction',type:'research',text:'Led a diagnostic performance study.'};c.evidence.push(research);scope.requirements.push({id:'study',kind:'research',label:'Clinical research',importance:'preferred'});c.requirementMatrix.push({requirementId:'study',label:'Clinical research',status:'documented',importance:'preferred',evidenceIds:[research.id],supportingEvidence:[{evidenceId:research.id,text:research.text,kind:'source-quote',evidenceType:'research',limits:[]}]});}
  await ready(h,'distinct-proofs',[c],{brief:scope});const card=cards(h)[0];assert.equal(card.querySelectorAll('.relevance-lead,.relevance-detail').length,withResearch?2:1);const shown=card.querySelector('blockquote').textContent;assert.ok([first.text,alternative.text].includes(shown));assert.equal(card.querySelectorAll('blockquote').filter(el=>/cardiac CT/.test(el.textContent)).length,1);if(withResearch)assert.match(card.textContent,/Led a diagnostic performance study/);
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
  const b=structuredClone(brief);b.requirements.push({id:'study',label:'Diagnostic study evaluation',kind:'research',importance:'preferred'});const p=P.saveCandidate(P.createProject('Saved evidence'),person(),b,'corpus-test');p.originalBrief='Our original device assessment request';const h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'}),card=h.$('project-candidates').querySelector('.saved-card');assert.match(card.textContent,/Listed interest|Potential relevance/);assert.match(card.textContent,/Must-have not established: Cardiac CT · Current practice/);assert.doesNotMatch(card.textContent,/Preferred evidence gaps/ );assert.match(card.textContent,/Qualification: not reviewed/);assert.equal(card.querySelector('.saved-review').open,false);assert.equal(card.querySelector('.saved-notes').open,false);assert.match(h.$('project-brief').textContent,/Our original device assessment request/);assert.ok(card.querySelector('.source-link').href.includes('?evidence=e-expert-one#evidence-e-expert-one'));assert.equal(h.requests.length,0);
});

test('all retained source provenance links are accessible from the profile without a model request',async t=>{
  const h=await setup(t),c=person();c.evidence[0].sources=[{sourceUrl:'https://second.example/profile',sourceLabel:'Second professional profile'},{sourceUrl:'javascript:alert(1)',sourceLabel:'Unsafe'}];await ready(h,'sources',[c]);cards(h)[0].querySelector('.card-open').click();const links=h.$('profile-content').querySelectorAll('a');assert.ok(links.some(a=>a.href==='https://second.example/profile'));assert.ok(links.some(a=>a.href.includes('?evidence=e-expert-one&corpusVersion=corpus-test#evidence-e-expert-one')));assert.ok(!links.some(a=>a.href.startsWith('javascript:')));assert.equal(h.requests.length,2);
});

test('candidate scanning leads with reachable actions and omits duplicate card chrome',async t=>{
  const h=await setup(t),c=person();c.evidence[0].text='Has a specialist interest in cardiac CT. '+('Additional exact recorded context. '.repeat(20));await ready(h,'compact',[c],{total:648});const card=cards(h)[0];assert.equal(card.querySelector('.card-rank'),null);assert.doesNotMatch(card.textContent,/Option 1|Evidence for this assessment/);assert.equal(card.querySelector('.card-actions').querySelectorAll('a').length,0);assert.ok(card.children.indexOf(card.querySelector('.card-actions'))>card.children.indexOf(card.querySelector('.card-relevance')));assert.ok(card.querySelector('blockquote').textContent.length<=211);assert.equal(card.querySelector('blockquote').title,c.evidence[0].text);assert.equal(card.querySelectorAll('.source-link').length,1);assert.equal(h.$('result-count').textContent,'1 candidate to explore · 1 with a must-have to confirm');assert.match(h.$('ranking-note').textContent,/648 candidates in this search/);assert.match(card.textContent,/Must-have not established: Cardiac CT · Current practice/);
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
  assert.equal(Evidence.outcome(c.requirementMatrix[2],c,scope.requirements[2]).label,'Recorded activity');await ready(h,'scope-label',[c],{brief:scope});const card=cards(h)[0],selected=card.querySelectorAll('.relevance-lead,.relevance-detail').find(block=>block.textContent.includes('My interests include'));assert.ok(selected,'Interest excerpt contributes the additional adults scope');assert.match(selected.querySelector('.relevance-label').textContent,/Listed interest/);assert.doesNotMatch(selected.querySelector('.relevance-label').textContent,/Recorded activity/);card.querySelector('.card-open').click();const profile=h.$('profile-content').querySelector('.relevance-panel').querySelectorAll('.requirement-proof').find(block=>block.textContent.includes('My interests include'));assert.match(profile.querySelector('.small-label').textContent,/Listed interest/);
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

const resolvedLocation={kind:'radius',country:'GB',query:'London',label:'London',latitude:51.5074,longitude:-.1278,radiusMiles:25,precision:'city centre',sourceUrl:'https://www.openstreetmap.org/'};
function editLocation(h,value,which='followup',radius=25){h.$(which+'-location').value=value;h.$(which+'-location').emit('input');h.$(which+'-radius').value=String(radius);h.$(which+'-radius').emit('change');}

test('expertise-only search omits location; location edits wait for submission and make the radius visible',async t=>{
  const h=await setup(t);assert.equal(h.$('home-location').placeholder,'Anywhere');assert.equal(h.$('home-location').parentNode.querySelector('.radius-label').hidden,true);
  const first=h.start('Cardiologists with radiology interests');assert.equal(Object.hasOwn(first.body,'locationFilter'),false);first.resolve(result('first'));await h.flush();
  editLocation(h,'London');assert.equal(h.requests.length,1);assert.equal(h.$('followup-location').parentNode.querySelector('.radius-label').hidden,false);
  h.$('followup-form').requestSubmit();const update=h.requests.at(-1);assert.equal(update.body.message,undefined);assert.deepEqual(update.body.locationFilter,{query:'London',radiusMiles:25});assert.equal(update.body.sessionId,'session');
  update.resolve(result('local',[person()],{brief:{...brief,locationFilter:resolvedLocation}}));await h.flush();assert.match(h.$('result-notices').textContent,/Within 25 miles of London/);
});

test('country selection hides radius and a cleared location is an explicit update',async t=>{
  const h=await setup(t);editLocation(h,'UK','home');assert.equal(h.$('home-location').parentNode.querySelector('.radius-label').hidden,true);
  const request=h.start('Cardiologists');assert.deepEqual(request.body.locationFilter,{query:'UK',radiusMiles:25});request.resolve(result('country',[person()],{brief:{...brief,locationFilter:{kind:'country',country:'GB',query:'UK',label:'UK-wide'}}}));await h.flush();
  assert.equal(h.$('followup-location').value,'UK');editLocation(h,'');h.$('followup-form').requestSubmit();assert.equal(h.requests.at(-1).body.locationFilter,null);assert.equal(h.requests.at(-1).body.message,undefined);
});

test('recognised geography fills the control but a late search cannot overwrite a newer location draft',async t=>{
  const h=await setup(t);h.start('Cardiologists in London').resolve(result('first',[person()],{brief:{...brief,locationFilter:resolvedLocation}}));await h.flush();assert.equal(h.$('followup-location').value,'London');
  const pending=h.refine('With cardiac MRI experience');editLocation(h,'Bristol',undefined,50);h.draft('My next requirement');pending.resolve(result('second',[person()],{brief:{...brief,locationFilter:resolvedLocation}}));await h.flush();
  assert.equal(h.$('followup-location').value,'Bristol');assert.equal(Number(h.$('followup-radius').value),50);assert.equal(h.$('followup-input').value,'My next requirement');
  h.$('followup-form').requestSubmit();assert.deepEqual(h.requests.at(-1).body.locationFilter,{query:'Bristol',radiusMiles:50});
});

test('location lookup failure retains results and newer drafts; Search anywhere is explicit recovery',async t=>{
  const h=await setup(t);await ready(h);editLocation(h,'Newport');const pending=h.refine('Clinical reporting');h.draft('Keep this newer draft');pending.resolve({error:'More than one UK place has that name. Add a county or postcode.',code:'location-ambiguous'},422);await h.flush();
  assert.equal(cards(h).length,1);assert.equal(h.$('followup-input').value,'Keep this newer draft');assert.equal(h.$('followup-location').value,'Newport');assert.match(h.$('search-error').textContent,/More than one UK place/);
  action(h.$('search-error'),'Search anywhere').click();const retry=h.requests.at(-1);assert.equal(retry.body.locationFilter,null);assert.equal(retry.body.message,'Clinical reporting');assert.equal(h.$('followup-input').value,'Keep this newer draft');
});

test('incomplete interpretation offers its own retry and preserves the pending requirement',async t=>{
  const h=await setup(t);await ready(h);h.refine('Must have radioactive brain-implant experience').resolve({error:'We could not apply the new must-have. Edit it or retry interpretation.',code:'interpretation-incomplete'},422);await h.flush();
  assert.equal(cards(h).length,1);assert.match(h.$('followup-input').value,/Must have radioactive/);assert.ok(action(h.$('search-error'),'Retry interpretation'));action(h.$('search-error'),'Retry interpretation').click();assert.equal(h.requests.at(-1).body.message,'Must have radioactive brain-implant experience');
});

test('location drafts survive reload separately from the applied search scope',async t=>{
  const h=await setup(t);await ready(h,'local',[person()],{brief:{...brief,locationFilter:resolvedLocation}});editLocation(h,'Bristol',undefined,50);await h.flush();const saved=[...h.savedProjects.values()][0];assert.equal(saved.activeBrief.locationFilter.query,'London');assert.equal(saved.locationDrafts.followup.query,'Bristol');
  const restored=await setup(t,{initialProjects:[saved],initialSessionValues:[...h.sessionValues]});assert.equal(restored.$('followup-location').value,'Bristol');assert.equal(Number(restored.$('followup-radius').value),50);assert.equal(restored.requests.length,0);
});

test('an indirect-match card provides sourced background and its profile loads without AI',async t=>{
  const h=await setup(t),c=person();c.requirementMatrix=[];c.backgroundPreview=[{...c.evidence[0],id:'brain-background',text:'Recorded training in brain-tumour radiotherapy.',type:'training'}];
  await ready(h,'indirect',[c]);const card=cards(h)[0];assert.match(card.textContent,/Recorded training in brain-tumour radiotherapy/);assert.match(card.textContent,/Specific experience requested.*not established/);assert.doesNotMatch(card.textContent,/Related passages were retrieved/);assert.equal(requestsFor(h,'profile').length,0);assert.equal(requestsFor(h,'explain').length,0);
  action(card,'View profile →').click();const req=requestsFor(h,'profile')[0];assert.deepEqual(req.body,{sessionId:'session',searchId:'indirect',candidateId:c.id,corpusVersion:'corpus-test'});req.resolve(background(c));await h.flush();
  const content=h.$('profile-content');assert.equal(section(content,'About').open,true);assert.match(section(content,'About').textContent,/brain-tumour radiotherapy/);for(const title of ['Clinical interests','Recorded procedures','Research','Practice locations','Sources and search checks'])assert.equal(section(content,title).open,false);assert.equal(requestsFor(h,'explain').length,0);
});

test('late background preserves open source checks and reading position without replacing the relevance panel',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();const content=h.$('profile-content'),relevance=content.querySelector('.relevance-panel'),checks=section(content,'Sources and search checks');checks.open=true;h.$('profile-scroll').scrollTop=420;
  requestsFor(h,'profile')[0].resolve(background());await h.flush();assert.equal(content.querySelector('.relevance-panel'),relevance);assert.equal(checks.isConnected,true);assert.equal(checks.open,true);assert.equal(h.$('profile-scroll').scrollTop,420);assert.equal(section(content,'About').open,true);
});

test('wrong-candidate and wrong-version background cannot appear; explicit retry keeps sourced search evidence',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();requestsFor(h,'profile')[0].resolve({...background(),candidateId:'someone-else'});await h.flush();assert.doesNotMatch(h.$('profile-content').textContent,/Recorded training in brain-tumour/);assert.match(h.$('profile-content').textContent,/could not be verified/);assert.match(h.$('profile-content').textContent,/specialist interest in cardiac CT/);
  action(h.$('profile-content'),'Retry background').click();requestsFor(h,'profile')[1].resolve({...background(),corpusVersion:'old-version'});await h.flush();assert.match(h.$('profile-content').textContent,/could not be verified/);assert.equal(requestsFor(h,'explain').length,0);
  action(h.$('profile-content'),'Retry background').click();requestsFor(h,'profile')[2].resolve(background());await h.flush();assert.match(section(h.$('profile-content'),'About').textContent,/brain-tumour/);
});

test('background arriving after another profile opens never paints the wrong consultant',async t=>{
  const h=await setup(t),a=person('first'),b=person('second');await ready(h,'two',[a,b]);cards(h)[0].querySelector('.card-open').click();const old=requestsFor(h,'profile')[0];h.$('profile-close').click();await h.flush();cards(h)[1].querySelector('.card-open').click();old.resolve({...background(a),about:[{...a.evidence[0],text:'First consultant only.'}]});await h.flush();assert.doesNotMatch(h.$('profile-content').textContent,/First consultant only/);assert.match(h.$('profile-identity').textContent,/Dr second/);
  requestsFor(h,'profile')[1].resolve({...background(b),about:[{...b.evidence[0],text:'Second consultant only.'}]});await h.flush();assert.match(section(h.$('profile-content'),'About').textContent,/Second consultant only/);
});

test('loaded background saves with its source version and reopens offline without silent replacement',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();requestsFor(h,'profile')[0].resolve(background());await h.flush();action(h.$('profile-identity'),'Save').click();await h.flush();const saved=[...h.savedProjects.values()][0];assert.equal(saved.candidates[0].candidate.profileBackground.corpusVersion,'corpus-test');
  const restored=await setup(t,{initialProjects:[saved],pathname:'/expert-discovery/project',healthCorpusVersion:'new-corpus'});action(restored.$('project-candidates'),'View evidence').click();assert.match(section(restored.$('profile-content'),'About').textContent,/brain-tumour/);assert.equal(restored.requests.length,0);assert.equal(action(restored.$('profile-content'),'Generate a relevance summary').disabled,true);
});

test('older saved snapshots explicitly lack fuller background without fetching current records',async t=>{
  const p=P.saveCandidate(P.createProject('Older assessment'),person(),brief,'corpus-test'),h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'});action(h.$('project-candidates'),'View evidence').click();assert.match(h.$('profile-content').textContent,/saved snapshot contains search evidence only/);assert.match(h.$('profile-content').textContent,/specialist interest in cardiac CT/);assert.equal(h.requests.length,0);
});

for(const hasSavedBackground of [false,true])test(`saved profile remains a frozen snapshot when a matching live search has newer cached background${hasSavedBackground?' and its own saved background':''}`,async t=>{
  const c=person();if(hasSavedBackground)c.profileBackground={...background(c),about:[{...background(c).about[0],text:'Background retained when the team saved this candidate.'}]};
  const p=P.saveCandidate(P.createProject('Frozen evidence'),c,brief,'corpus-test');p.notes='Private team observations, never part of discovery.';p.candidates[0].notes='An independently saved candidate note.';const savedBefore=structuredClone(p.candidates[0]);
  const h=await setup(t,{initialProjects:[p],pathname:'/expert-discovery/project'});h.$('project-return').click();const live=person();requestsFor(h,'search')[0].resolve(result('same-scope',[live]));await h.flush();
  cards(h)[0].querySelector('.card-open').click();requestsFor(h,'profile')[0].resolve({...background(live),about:[{...background(live).about[0],text:'Newly loaded live background must not enter a saved snapshot.'}]});await h.flush();assert.match(h.$('profile-content').textContent,/Newly loaded live background/);
  h.$('profile-close').click();await h.flush();h.$('open-project').click();const requestsBefore=h.requests.length;action(h.$('project-candidates'),'View evidence').click();
  assert.doesNotMatch(h.$('profile-content').textContent,/Newly loaded live background/);assert.equal(action(h.$('profile-content'),'Generate a relevance summary').disabled,true);assert.match(h.$('profile-content').textContent,/Saved evidence snapshot/);assert.equal(h.requests.length,requestsBefore,'Opening saved evidence cannot refresh it or start AI');
  if(hasSavedBackground)assert.match(section(h.$('profile-content'),'About').textContent,/Background retained when the team saved/);else assert.match(h.$('profile-content').textContent,/saved snapshot contains search evidence only/);
  await h.flush();const stored=h.savedProjects.get(p.id);assert.deepEqual(stored.candidates[0],savedBefore,'No implicit resave, source replacement, decision or note changes');assert.equal(stored.notes,p.notes);assert.equal(requestsFor(h,'explain').length,0);
});

test('background expansion preserves a visible source-check anchor rather than only its numeric scroll offset',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();const region=h.$('profile-scroll'),content=h.$('profile-content'),host=content.querySelector('.profile-background'),relevance=content.querySelector('.relevance-panel'),checks=section(content,'Sources and search checks');checks.open=true;region.scrollTop=420;
  const rectangle=(top,height)=>({left:0,right:600,top,bottom:top+height,width:600,height});region.getBoundingClientRect=()=>rectangle(100,400);relevance.getBoundingClientRect=()=>rectangle(-200,280);
  // Model the real layout dependency: a newly opened About section adds 360px
  // above the evidence the user is reading. Scrolling must compensate by 360px.
  checks.getBoundingClientRect=()=>rectangle(100+560+(section(host,'About')?360:0)-region.scrollTop,400);const beforeTop=checks.getBoundingClientRect().top;
  requestsFor(h,'profile')[0].resolve(background());await h.flush();assert.equal(region.scrollTop,780);assert.equal(checks.getBoundingClientRect().top,beforeTop);assert.equal(checks.open,true);assert.equal(checks.isConnected,true);assert.equal(section(content,'About').open,true);assert.equal(requestsFor(h,'explain').length,0);
});

test('each background Record details disclosure retains its independent state on reopening',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();requestsFor(h,'profile')[0].resolve(background());await h.flush();const details=h.$('profile-content').querySelectorAll('.record-details');assert.equal(details.length,2);assert.equal(new Set(details.map(d=>d.dataset.section)).size,details.length);details[0].open=true;details[1].open=false;const openId=details[0].dataset.section,closedId=details[1].dataset.section;h.$('profile-scroll').scrollTop=250;
  h.$('profile-close').click();await h.flush();cards(h)[0].querySelector('.card-open').click();const reopened=h.$('profile-content');assert.equal(section(reopened,openId).open,true);assert.equal(section(reopened,closedId).open,false);assert.equal(h.$('profile-scroll').scrollTop,250);assert.equal(requestsFor(h,'profile').length,1);assert.equal(requestsFor(h,'explain').length,0);
});

test('location-only Home submission asks for expertise and retains the selected geography for the answer',async t=>{
  const h=await setup(t);editLocation(h,'UK','home');const pending=h.start('');assert.ok(pending);assert.equal(Object.hasOwn(pending.body,'message'),false);assert.deepEqual(pending.body.locationFilter,{query:'UK',radiusMiles:25});assert.equal(h.$('workspace').hidden,false);assert.equal(h.$('search-loading').hidden,false);
  const locationFilter={kind:'country',country:'GB',query:'UK',label:'UK-wide'},locationBrief={...brief,summary:'',requirements:[],locationFilter};pending.resolve({sessionId:'location-session',brief:locationBrief,needsClarification:true,question:'What expertise are you looking for? Enter a specialty or clinical interest.',notices:[],results:[],total:0});await h.flush();
  assert.match(h.$('clarification').textContent,/What expertise are you looking for/);assert.equal(cards(h).length,0);assert.equal(h.$('followup-location').value,'UK');assert.equal(h.$('search-loading').hidden,true);assert.equal(h.$('followup-submit').disabled,false);assert.equal(h.requests.length,1,'Clarification must not silently rank or request another search');
  const answer=h.refine('Cardiologists with radiology interests');assert.equal(answer.body.sessionId,'location-session');assert.equal(answer.body.message,'Cardiologists with radiology interests');assert.equal(Object.hasOwn(answer.body,'locationFilter'),false,'Unchanged location remains in the current session');answer.resolve(result('answered',[person()],{sessionId:'location-session',brief:{...brief,locationFilter}}));await h.flush();assert.equal(cards(h).length,1);assert.match(h.$('result-notices').textContent,/UK-wide/);assert.equal(requestsFor(h,'explain').length,0);
});

test('entirely empty Home submission gives actionable feedback without a request or new assessment',async t=>{
  const h=await setup(t),projectsBefore=[...h.savedProjects.keys()];h.$('home-input').value='   ';h.$('home-form').requestSubmit();await h.flush();
  assert.equal(h.requests.length,0);assert.deepEqual([...h.savedProjects.keys()],projectsBefore);assert.equal(h.$('home').hidden,false);assert.equal(h.$('workspace').hidden,true);assert.equal(h.document.activeElement,h.$('home-input'));assert.equal(h.$('toast').hidden,false);assert.match(h.$('toast').textContent,/Enter a specialty, clinical interest or the expertise you need/);
});

for(const change of ['remove criterion','change priority','documented-only filter','retry clinical request'])test(`an earlier unsent location draft survives ${change} without being acknowledged as applied`,async t=>{
  const h=await setup(t);await ready(h,'london',[person()],{brief:{...brief,locationFilter:resolvedLocation}});
  if(change==='retry clinical request'){h.refine('Research experience is preferred').reject(new Error('Temporary fixture failure'));await h.flush();}
  editLocation(h,'Bristol',undefined,50);h.draft('My unrelated unsent refinement');
  if(change==='remove criterion')h.$('requirements').querySelector('.remove-requirement').click();
  else if(change==='change priority'){const select=h.$('requirements').querySelector('select');select.value='preferred';select.emit('change');}
  else if(change==='documented-only filter'){h.$('documented-only').checked=true;h.$('documented-only').emit('change');}
  else action(h.$('search-error'),'Retry').click();
  const pending=h.requests.at(-1);assert.equal(Object.hasOwn(pending.body,'locationFilter'),false,'This operation did not submit the Bristol draft');pending.resolve(result('updated',[person()],{brief:{...brief,locationFilter:resolvedLocation}}));await h.flush();
  assert.equal(h.$('followup-location').value,'Bristol');assert.equal(Number(h.$('followup-radius').value),50);assert.equal(h.$('followup-input').value,'My unrelated unsent refinement');const stored=[...h.savedProjects.values()][0];assert.equal(stored.activeBrief.locationFilter.query,'London');assert.deepEqual(stored.locationDrafts.followup,{query:'Bristol',radiusMiles:50,dirty:true});
  h.$('followup-form').requestSubmit();assert.deepEqual(h.requests.at(-1).body.locationFilter,{query:'Bristol',radiusMiles:50},'The next deliberate submission still sends the preserved draft');
});

test('retrying an older location request cannot clear a different unsubmitted place',async t=>{
  const h=await setup(t);await ready(h,'london',[person()],{brief:{...brief,locationFilter:resolvedLocation}});editLocation(h,'Manchester',undefined,10);h.$('followup-form').requestSubmit();h.requests.at(-1).reject(new Error('Temporary geocoder outage'));await h.flush();
  editLocation(h,'Bristol',undefined,50);action(h.$('search-error'),'Retry').click();const retry=h.requests.at(-1);assert.deepEqual(retry.body.locationFilter,{query:'Manchester',radiusMiles:10});retry.resolve(result('retried-manchester',[person()],{brief:{...brief,locationFilter:{...resolvedLocation,query:'Manchester',label:'Manchester',radiusMiles:10}}}));await h.flush();
  assert.equal(h.$('followup-location').value,'Bristol');assert.equal(Number(h.$('followup-radius').value),50);const saved=[...h.savedProjects.values()][0];assert.equal(saved.activeBrief.locationFilter.query,'Manchester');assert.deepEqual(saved.locationDrafts.followup,{query:'Bristol',radiusMiles:50,dirty:true});
});

test('a submitted location draft becomes clean and subsequent text-driven geography can fill the control',async t=>{
  const h=await setup(t);await ready(h,'london',[person()],{brief:{...brief,locationFilter:resolvedLocation}});editLocation(h,'Bristol',undefined,50);h.$('followup-form').requestSubmit();h.requests.at(-1).resolve(result('bristol',[person()],{brief:{...brief,locationFilter:{...resolvedLocation,query:'Bristol',label:'Bristol',radiusMiles:50}}}));await h.flush();assert.equal([...h.savedProjects.values()][0].locationDrafts.followup.dirty,false);
  const textUpdate=h.refine('Anywhere is fine');assert.equal(Object.hasOwn(textUpdate.body,'locationFilter'),false,'An acknowledged field cannot override a later text instruction');textUpdate.resolve(result('anywhere',[person()],{brief:{...brief,locationFilter:null}}));await h.flush();assert.equal(h.$('followup-location').value,'');assert.equal([...h.savedProjects.values()][0].locationDrafts.followup.dirty,false);
});

test('profile biography renders contiguous list runs in place from canonical text rather than stale saved blocks',async t=>{
  const h=await setup(t),c=person(),raw='Recorded interests:\n• CT\n• MR\nNo current implant practice is stated.\n- Previous training only\n- No\nFinal source qualification.';
  await ready(h,'readable',[c]);cards(h)[0].querySelector('.card-open').click();const profile=background(c);profile.about[0].text=raw;profile.about[0].excerpt='Truncated preview';profile.about[0].blocks=[{kind:'paragraph',text:'Stale stored presentation'},{kind:'list-item',text:'Incorrect cached list item'}];const original=structuredClone(profile);requestsFor(h,'profile')[0].resolve(profile);await h.flush();
  const fact=section(h.$('profile-content'),'About').querySelector('.background-fact'),display=fact.children.filter(child=>child.tagName==='UL'||child.classList.contains('background-copy'));
  assert.deepEqual(display.map(child=>[child.tagName,child.textContent]),[['P','Recorded interests:'],['UL','CTMR'],['P','No current implant practice is stated.'],['UL','Previous training onlyNo'],['P','Final source qualification.']]);
  assert.doesNotMatch(fact.textContent,/Truncated preview|Stale stored|Incorrect cached/);assert.deepEqual(profile,original,'Rendering must not repair or replace canonical evidence');const quote=fact.querySelector('blockquote');assert.deepEqual(quote.children.map(child=>child.tagName),['P','UL','P','UL','P']);assert.match(quote.textContent,/No current implant practice/);
});

test('full profile retains long canonical biography and terminal qualifications while its card remains compact',async t=>{
  const h=await setup(t),c=person(),raw='Recorded professional background. '.repeat(30)+'No radioactive brain-implant practice is established in this record.';c.requirementMatrix=[];c.backgroundPreview=[{...c.evidence[0],text:raw,excerpt:raw.slice(0,230)+'…'}];
  await ready(h,'long-profile',[c]);const compact=cards(h)[0].querySelector('.background-copy');assert.ok(compact.textContent.length<=211);assert.match(compact.textContent,/…$/);cards(h)[0].querySelector('.card-open').click();const profile=background(c);profile.about[0].text=raw;profile.about[0].excerpt='Short excerpt';requestsFor(h,'profile')[0].resolve(profile);await h.flush();
  const body=section(h.$('profile-content'),'About').querySelector('.background-copy');assert.equal(body.textContent,raw);assert.match(body.textContent,/No radioactive brain-implant practice is established in this record\.$/);assert.equal(requestsFor(h,'explain').length,0);
});

test('legacy project backup display derives lists without migrating saved source text or display blocks',async t=>{
  const c=person();c.profileBackground=background(c);const item=c.profileBackground.about[0];item.text='Modalities:\n• CT\n• MR\nNo';item.blocks=[{kind:'paragraph',text:'Modalities:'}];const p=P.saveCandidate(P.createProject('Legacy display fixture'),c,brief,'corpus-test');p.notes='Team notes remain private and unchanged.';p.candidates[0].notes='Keep the original source record.';
  const backup=P.exportJSON(p),roundTrip=P.importJSON(backup),savedBefore=structuredClone(roundTrip.candidates[0]),h=await setup(t,{initialProjects:[roundTrip],pathname:'/expert-discovery/project'});action(h.$('project-candidates'),'View evidence').click();const about=section(h.$('profile-content'),'About');assert.deepEqual(about.querySelector('.background-bullets').children.map(li=>li.textContent),['CT','MR']);assert.ok(about.querySelectorAll('.background-copy').some(n=>n.textContent==='No'));assert.equal(h.requests.length,0);
  h.$('profile-close').click();await h.flush();const stored=h.savedProjects.get(roundTrip.id);assert.deepEqual(stored.candidates[0],savedBefore);assert.equal(stored.notes,p.notes);const exported=JSON.parse(P.exportJSON(stored));assert.equal(exported.project.candidates[0].candidate.profileBackground.about[0].text,item.text);assert.deepEqual(exported.project.candidates[0].candidate.profileBackground.about[0].blocks,item.blocks);
});

test('native Escape saves profile reading position before the browser can close and reset its layout',async t=>{
  const h=await setup(t);await ready(h);cards(h)[0].querySelector('.card-open').click();requestsFor(h,'profile')[0].resolve(background());await h.flush();const dialog=h.$('profile-dialog'),region=h.$('profile-scroll'),content=h.$('profile-content');section(content,'About').open=false;section(content,'Clinical interests').open=true;section(content,'Sources and search checks').open=true;region.scrollTop=570;let closes=0;dialog.addEventListener('close',()=>closes++);
  // The native cancel default removes the dialog from layout before its close
  // callback runs. Model that browser action unless the application cancels it.
  const cancel=dialog.emit('cancel',{cancelable:true});if(!cancel.defaultPrevented){dialog.close();region.scrollTop=0;}
  assert.equal(cancel.defaultPrevented,true);assert.equal(dialog.open,true,'Controlled history navigation closes after capturing visible state');assert.equal(region.scrollTop,570);await h.flush();assert.equal(dialog.open,false);assert.equal(closes,1);assert.equal(h.history.state.profileId,null);assert.equal(h.document.activeElement.className,'card-open');
  cards(h)[0].querySelector('.card-open').click();assert.equal(dialog.open,true);assert.equal(region.scrollTop,570);assert.equal(section(content,'About').open,false);assert.equal(section(content,'Clinical interests').open,true);assert.equal(section(content,'Sources and search checks').open,true);assert.equal(requestsFor(h,'profile').length,1);assert.equal(requestsFor(h,'explain').length,0);
});

test('saving a result fetches matching full background without opening a profile or using AI',async t=>{
  const h=await setup(t),c=person(),dataReleaseId='r0-safe-20261008-v2';await ready(h,'save-background',[c],{profileVersion:'expert-profile-v2',dataReleaseId});
  action(cards(h)[0],'Save').click();await h.flush();assert.equal(h.$('profile-dialog').open,false);assert.equal(requestsFor(h,'profile').length,1);assert.equal(requestsFor(h,'explain').length,0);
  let saved=[...h.savedProjects.values()][0];assert.equal(saved.candidates[0].candidate.profileBackgroundStatus.state,'loading');assert.equal(saved.candidates[0].candidate.profileBackground,undefined);
  assert.equal(saved.dataReleaseId,dataReleaseId);assert.equal(saved.candidates[0].dataReleaseId,dataReleaseId);
  assert.equal(requestsFor(h,'profile')[0].body.profileVersion,'expert-profile-v2');requestsFor(h,'profile')[0].resolve({...background(c),profileVersion:'expert-profile-v2',dataReleaseId});await h.flush();
  saved=[...h.savedProjects.values()][0];assert.equal(saved.candidates[0].candidate.profileBackgroundStatus.state,'complete');assert.equal(saved.candidates[0].candidate.profileBackground.corpusVersion,'corpus-test');assert.equal(h.$('profile-dialog').open,false);assert.doesNotThrow(()=>P.exportJSON(saved));
  assert.equal(saved.candidates[0].candidate.profileBackground.dataReleaseId,dataReleaseId);assert.equal(P.importJSON(P.exportJSON(saved)).candidates[0].dataReleaseId,dataReleaseId);
});

test('a mismatched release cannot silently replace the background in a saved search snapshot',async t=>{
  const h=await setup(t),c=person();await ready(h,'release-mismatch',[c],{dataReleaseId:'r0-safe-20261008-v2'});action(cards(h)[0],'Save').click();await h.flush();
  requestsFor(h,'profile')[0].resolve({...background(c),dataReleaseId:'bupa-r1-20261008-v2'});await h.flush();
  const saved=[...h.savedProjects.values()][0].candidates[0];assert.equal(saved.dataReleaseId,'r0-safe-20261008-v2');assert.equal(saved.candidate.profileBackgroundStatus.state,'partial');assert.equal(saved.candidate.profileBackground,undefined);
});

test('failed or wrong-projection background stays partial and can be retried without losing notes',async t=>{
  const h=await setup(t),c=person();await ready(h,'save-retry',[c],{profileVersion:'expert-profile-v2'});action(cards(h)[0],'Save').click();await h.flush();
  requestsFor(h,'profile')[0].reject(new Error('Fixture unavailable'));await h.flush();let saved=[...h.savedProjects.values()][0];assert.equal(saved.candidates[0].candidate.profileBackgroundStatus.state,'partial');assert.equal(saved.candidates[0].candidate.profileBackground,undefined);
  h.$('open-project').click();h.$('project-notes').value='Keep the team notes.';h.$('save-project-notes').click();await h.flush();action(h.$('project-candidates'),'Retry background').click();await h.flush();requestsFor(h,'profile')[1].resolve(background(c));await h.flush();saved=[...h.savedProjects.values()][0];assert.equal(saved.candidates[0].candidate.profileBackgroundStatus.state,'partial');assert.equal(saved.notes,'Keep the team notes.');
  action(h.$('project-candidates'),'Retry background').click();await h.flush();requestsFor(h,'profile')[2].resolve({...background(c),profileVersion:'expert-profile-v2'});await h.flush();saved=[...h.savedProjects.values()][0];assert.equal(saved.candidates[0].candidate.profileBackgroundStatus.state,'complete');assert.equal(saved.notes,'Keep the team notes.');assert.equal(saved.candidates.length,1);
});

test('an older save-background response cannot overwrite a newer saved evidence version',async t=>{
  const h=await setup(t),c=person();await ready(h,'old-save',[c]);action(cards(h)[0],'Save').click();await h.flush();const older=requestsFor(h,'profile')[0];
  h.refine('Research preferred').resolve(result('new-save',[c],{corpusVersion:'corpus-new'}));await h.flush();cards(h)[0].querySelector('[data-save-id]').click();await h.flush();const newer=requestsFor(h,'profile')[1];
  newer.resolve({...background(c,'corpus-new'),about:[{...background(c).about[0],text:'The newer saved professional background.'}]});await h.flush();older.resolve(background(c));await h.flush();
  const saved=[...h.savedProjects.values()][0].candidates[0];assert.equal(saved.corpusVersion,'corpus-new');assert.equal(saved.candidate.profileBackground.corpusVersion,'corpus-new');assert.equal(saved.candidate.profileBackground.about[0].text,'The newer saved professional background.');assert.equal(saved.candidate.profileBackgroundStatus.state,'complete');
});

test('qualifications without registrations, passage counts and versioned full sources remain visible',async t=>{
  const h=await setup(t),c=person();await ready(h,'qualifications',[c],{profileVersion:'expert-profile-v2'});cards(h)[0].querySelector('.card-open').click();
  const p={...background(c),profileVersion:'expert-profile-v2',qualifications:[{...c.evidence[0],text:'MSc Clinical Imaging',type:'professional-background',field:'qualifications'}],counts:{about:9,qualifications:1},truncated:true};requestsFor(h,'profile')[0].resolve(p);await h.flush();
  assert.match(section(h.$('profile-content'),'Registration and qualifications').textContent,/MSc Clinical Imaging/);assert.match(h.$('profile-content').textContent,/About: showing 1 of 9 recorded passages/);
  const link=h.$('profile-content').querySelectorAll('a').find(a=>a.textContent==='Open full source collection ↗'),url=new URL(link.href);assert.equal(url.searchParams.get('corpusVersion'),'corpus-test');assert.equal(url.searchParams.get('profileVersion'),'expert-profile-v2');
});

test('compact background never cuts a terminal negative marker from its scoped list',async t=>{
  const h=await setup(t),c=person(),text='Recorded modalities:\n'+('CT MR '.repeat(34))+'\nNo';c.requirementMatrix=[];c.backgroundPreview=[{...c.evidence[0],text,excerpt:text,qualifiers:['contains-negation']}];await ready(h,'negative-preview',[c]);
  assert.equal(cards(h)[0].querySelector('.background-copy').textContent,text);assert.match(cards(h)[0].querySelector('.background-copy').textContent,/No$/);
});
