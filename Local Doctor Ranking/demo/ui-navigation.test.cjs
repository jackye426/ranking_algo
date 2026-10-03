'use strict';
// Offline navigation checks. History traversal and native dialog close events
// are asynchronous; transport deliberately permits late responses after abort.
// Layout, native focus trapping and actual browser gestures remain browser QA.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function harness() {
  const ids=new Map(),timers=new Map();let timerId=0;
  const schedule=(callback,delay=0)=>{const id=++timerId;timers.set(id,{callback,delay});return id;};
  const cancel=id=>timers.delete(id);
  const events=target=>Object.assign(target,{events:{},addEventListener(name,callback){(this.events[name]||=[]).push(callback);},
    removeEventListener(name,callback){this.events[name]=(this.events[name]||[]).filter(fn=>fn!==callback);},
    emit(name,event={}){const value={type:name,target:this,currentTarget:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...event};for(const fn of this.events[name]||[])fn(value);return value;},
    dispatchEvent(event){return !this.emit(event.type,event).defaultPrevented;}});
  class E {
    constructor(tag='div'){events(this);this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.attributes={};this.style={setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}};this.dataset={};this._text='';this.className='';this.hidden=false;this.disabled=false;this.value='';this.scrollHeight=34;this.scrollTop=0;this.open=false;}
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
    click(){if(!this.disabled){this.focus();this.emit('click');}}
    requestSubmit(){this.emit('submit');}
    focus(){if(!this.disabled&&!this.closest('[hidden]'))document.activeElement=this;}
    scrollIntoView(){}
    showModal(){if(this.open)return;this._opener=document.activeElement;this.open=true;}
    close(){if(!this.open)return;this.open=false;this._opener?.focus();schedule(()=>this.emit('close'));}
    getBoundingClientRect(){return {left:0,right:600,top:0,bottom:100,width:600,height:100};}
    get firstElementChild(){return this.children[0]||null;}
    get childElementCount(){return this.children.length;}
    get isConnected(){return this===document.body||!!this.parentNode?.isConnected;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    closest(selector){return selector.split(',').some(part=>this.matches(part.trim()))?this:this.parentNode?.closest(selector)||null;}
    matches(selector){
      if(selector==='[hidden]')return this.hidden;
      if(selector==='[data-query]')return typeof this.dataset.query==='string';
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
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const node=new E(match[1]);node.setAttribute('id',match[3]);node.className=match[2].match(/class="([^"]+)"/)?.[1]||'';node.hidden=/\bhidden\b/.test(match[2]);document.body.append(node);
  }
  const $=id=>{const node=ids.get(id);assert.ok(node,`Required current UI element #${id}`);return node;};
  const move=(parent,names)=>names.forEach(name=>ids.has(name)&&$(parent).append($(name)));
  move('landing',['landing-form','resume-search','homepage-story']);move('landing-form',['initial-query','search-example']);
  move('workspace',['active-criteria','history-preview','submitted-message','search-status','search-error','conversation','followup-form','search-title','result-total']);move('followup-form',['followup-query']);
  move('match-dialog',['sheet-title','sheet-identity','sheet-close','sheet-scroll','sheet-status']);move('sheet-scroll',['sheet-content','sheet-caveats','sheet-provenance']);
  move('history-dialog',['history-close','history-list']);move('about-dialog',['about-close','about-done','data-description','data-source-label']);
  for(const id of ['initial-query','followup-query'])$(id).form=$(id==='initial-query'?'landing-form':'followup-form');
  for(const id of ['landing-form','followup-form']){const button=new E('button');button.className='send-button';$(id).append(button);}
  const overview=new E();overview.className='search-overview';$('workspace').append(overview);
  const overlay=new E('span');overlay.className='search-example-text';overlay.textContent='Find a knee specialist';$('search-example').append(overlay);
  const window=events({scrollX:0,scrollY:0,innerHeight:800,location:{origin:'http://localhost:3000'},navigator:{},
    matchMedia:query=>events({matches:query.includes('prefers-reduced-motion')}),setTimeout:schedule,clearTimeout:cancel,
    requestAnimationFrame:callback=>schedule(callback),cancelAnimationFrame:cancel,
    scrollTo(first,second){if(typeof first==='object'){this.scrollX=first.left??this.scrollX;this.scrollY=first.top??this.scrollY;}else{this.scrollX=first;this.scrollY=second;}}});
  const stack=[null];let position=0;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const history={scrollRestoration:'auto',get state(){return stack[position];},get length(){return stack.length;},
    pushState(value){stack.splice(position+1);stack.push(copy(value));position=stack.length-1;},replaceState(value){stack[position]=copy(value);},
    go(delta){const target=position+delta;if(target<0||target>=stack.length)return;const entry=stack[target];schedule(()=>{const index=stack.indexOf(entry);if(index<0)return;position=index;window.emit('popstate',{state:copy(entry)});});},
    back(){this.go(-1);},forward(){this.go(1);}};
  window.history=history;
  const requests=[];
  const fetch=(url,options)=>{
    if(url==='/api/health')return Promise.resolve({ok:true,json:async()=>({ready:true,recordCount:4031})});
    assert.ok(['/api/chat','/api/match-explanation'].includes(url),'Unexpected offline transport request: '+url);
    return new Promise((resolve,reject)=>requests.push({url,options,body:JSON.parse(options.body),reject,
      resolve:(body,status=200)=>resolve({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>body})}));
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),{document,window,history,fetch,URL,AbortController,console,setTimeout:schedule,clearTimeout:cancel});
  async function flush(){for(let round=0;round<12;round++){await new Promise(resolve=>setImmediate(resolve));const pending=[...timers].filter(([,timer])=>timer.delay<1000);if(!pending.length){await Promise.resolve();return;}for(const [id,timer] of pending){if(timers.delete(id))timer.callback();}}throw new Error('Short UI task queue did not settle');}
  const start=message=>{$('initial-query').value=message;$('initial-query').focus();$('landing-form').requestSubmit();return requests.at(-1);};
  const refine=message=>{$('followup-query').value=message;$('followup-query').focus();$('followup-form').requestSubmit();return requests.at(-1);};
  const visible=()=>document.querySelectorAll('.turn').filter(node=>!node.closest('[hidden]'));
  return {$,document,window,history,requests,flush,start,refine,visible,dispose:()=>timers.clear()};
}

const person={id:'tim',name:'Mr Timothy Waters',specialty:'Consultant Orthopaedic Surgeon',clinicalInterests:['Knee replacement'],locations:[{name:'Spire Bushey',postcode:'WD6 3SU'}],insurers:[],insuranceEvidence:[],profileUrl:'https://www.spirehealthcare.com/consultant-profiles/example/',evidenceUrl:'/sources/tim',
  personalizedMatch:{summary:'The profile lists knee replacement practice.',citations:[{id:'e1',text:'Knee replacement',sourceUrl:'/sources/tim'}],caveats:[]}};
const result=(searchId,results=[person])=>({sessionId:'session-'+searchId,searchId,criteria:{topic:'knee'},criteriaLabels:[{key:'topic',label:'Knee'}],message:'Search completed',total:results.length,results,notices:[],suggestions:[]});
const explanation={summary:'The profile lists knee replacement.',reasons:[{title:'Knee',text:'Knee replacement is listed.',evidenceIds:['e1']}],citations:[{id:'e1',text:'Knee replacement',sourceUrl:'/sources/tim'}],caveats:[],provider:'openrouter',retryable:false};
async function ready(h,id='initial',people){h.start('Find a knee specialist').resolve(result(id,people));await h.flush();}

test('submission clears immediately, shows the submitted request and preserves the next draft',async t=>{
  const h=harness();t.after(h.dispose);
  const first=h.start('Find a knee specialist');
  assert.equal(h.$('initial-query').value,'');assert.equal(h.$('followup-query').value,'');
  assert.match(h.$('submitted-message').textContent,/Find a knee specialist/);
  h.$('followup-query').value='Only those accepting Bupa';
  first.resolve(result('first'));await h.flush();
  assert.equal(h.$('followup-query').value,'Only those accepting Bupa');
  const second=h.refine('Only those accepting Bupa');
  assert.equal(h.$('followup-query').value,'');assert.match(h.$('submitted-message').textContent,/Only those accepting Bupa/);
  h.$('followup-query').value='Closer to SW5';second.resolve(result('second'));await h.flush();
  assert.equal(h.$('followup-query').value,'Closer to SW5');assert.equal(h.visible().length,1);
});

test('retry resends the failed request without overwriting a different draft',async t=>{
  const h=harness();t.after(h.dispose);await ready(h);
  const failed=h.refine('Only those accepting Bupa');h.$('followup-query').value='Closer to SW5';
  failed.reject(new Error('Offline fixture'));await h.flush();
  assert.equal(h.$('followup-query').value,'Closer to SW5');
  h.$('search-error').querySelector('.retry-button').click();
  assert.equal(h.requests.at(-1).body.message,'Only those accepting Bupa');assert.equal(h.$('followup-query').value,'Closer to SW5');
  h.requests.at(-1).resolve(result('retried'));await h.flush();
  assert.equal(h.$('followup-query').value,'Closer to SW5');assert.equal(h.visible().length,1);
});

test('a search settling on Home keeps Home and focus, then resumes its saved result',async t=>{
  const h=harness();t.after(h.dispose);const pending=h.start('Find a knee specialist');
  h.$('brand-home').click();assert.equal(h.$('workspace').hidden,true);assert.equal(h.document.activeElement,h.$('initial-query'));
  h.$('initial-query').value='Unsent next search';pending.resolve(result('background'));await h.flush();
  assert.equal(h.$('landing').hidden,false);assert.equal(h.$('workspace').hidden,true);assert.equal(h.visible().length,0);
  assert.equal(h.document.activeElement,h.$('initial-query'));assert.equal(h.$('initial-query').value,'Unsent next search');
  assert.equal(h.$('resume-search').hidden,false);const count=h.requests.length;h.$('resume-search').click();await h.flush();
  assert.equal(h.requests.length,count);assert.equal(h.$('workspace').hidden,false);assert.equal(h.visible().length,1);
  assert.match(h.$('submitted-message').textContent,/Find a knee specialist/);
});

test('a failed search on Home remains resumable without stealing focus or discarding a draft',async t=>{
  const h=harness();t.after(h.dispose);const pending=h.start('Find a knee specialist');h.$('brand-home').click();
  h.$('initial-query').value='A different unsent request';pending.reject(new Error('Offline fixture'));await h.flush();
  assert.equal(h.$('workspace').hidden,true);assert.equal(h.document.activeElement,h.$('initial-query'));
  assert.equal(h.$('initial-query').value,'A different unsent request');assert.equal(h.$('resume-search').hidden,false);
  h.$('resume-search').click();assert.equal(h.$('workspace').hidden,false);assert.match(h.$('search-error').textContent,/Offline fixture/);
});

test('reset isolates an old pending response from the next search',async t=>{
  const h=harness();t.after(h.dispose);const old=h.start('Old knee request');h.$('new-search').click();
  assert.equal(old.options.signal.aborted,true);const fresh=h.start('Fresh hip request');
  fresh.resolve(result('fresh',[{...person,id:'fresh',name:'Fresh Consultant'}]));await h.flush();
  old.resolve(result('old',[{...person,name:'STALE Consultant'}]));await h.flush();
  assert.equal(h.visible().length,1);assert.match(h.visible()[0].textContent,/Fresh Consultant/);assert.doesNotMatch(h.$('conversation').textContent,/STALE/);
  assert.match(h.$('submitted-message').textContent,/Fresh hip request/);assert.equal(fresh.body.sessionId,undefined);
});

test('asynchronous browser Back and Forward restore a profile without another AI request',async t=>{
  const h=harness();t.after(h.dispose);await ready(h,'snapshot');
  const card=h.visible()[0];card.querySelector('.explanation-toggle').click();
  const pending=h.requests.at(-1);assert.equal(pending.url,'/api/match-explanation');assert.equal(pending.body.searchId,'snapshot');
  assert.equal(h.history.state.screen,'profile');const count=h.requests.length;
  h.history.back();assert.equal(h.$('match-dialog').open,true,'history traversal is asynchronous');await h.flush();
  assert.equal(h.$('match-dialog').open,false);assert.equal(h.$('workspace').hidden,false);assert.equal(pending.options.signal.aborted,true);
  pending.resolve({...explanation,summary:'STALE closed profile'});await h.flush();
  h.history.forward();await h.flush();
  assert.equal(h.$('match-dialog').open,true);assert.match(h.$('sheet-identity').textContent,/Timothy Waters/);
  assert.equal(h.requests.length,count,'Forward restores the source profile without paid AI generation');
  assert.doesNotMatch(h.$('sheet-content').textContent,/STALE/);assert.equal(h.history.state.profileKey,'snapshot:tim');
});

test('closing then immediately opening another profile survives queued traversal and close events',async t=>{
  const h=harness();t.after(h.dispose);await ready(h,'two',[person,{...person,id:'second',name:'Second Consultant'}]);
  const buttons=h.visible()[0].querySelectorAll('.view-consultant');assert.equal(buttons.length,2);
  buttons[0].click();assert.equal(h.$('match-dialog').open,true);
  h.$('sheet-close').click();buttons[1].click();
  assert.match(h.$('sheet-identity').textContent,/Second Consultant/);await h.flush();
  assert.equal(h.$('match-dialog').open,true,'a queued close/traversal must not dismiss the newly opened profile');
  assert.match(h.$('sheet-identity').textContent,/Second Consultant/);assert.equal(h.history.state.profileKey,'two:second');
  assert.equal(h.requests.filter(request=>request.url==='/api/match-explanation').length,0);
});

test('profile Back and close restore the exact View or Why trigger and result scroll position',async t=>{
  for(const selector of ['.view-consultant','.explanation-toggle'])for(const action of ['back','close']) {
    const h=harness();t.after(h.dispose);await ready(h,`${action}-${selector}`);
    const trigger=h.visible()[0].querySelector(selector);h.window.scrollTo({top:640});trigger.click();
    assert.equal(h.document.activeElement,h.$('sheet-close'));assert.equal(h.$('match-dialog').open,true);
    // Simulate the page position changing while the modal is open. Traversal
    // must use the captured result position, not a default or modal position.
    h.window.scrollTo({top:40});
    if(action==='back')h.history.back();else h.$('sheet-close').click();
    await h.flush();
    assert.equal(h.$('match-dialog').open,false,`${selector} ${action}`);
    assert.equal(h.document.activeElement,trigger,`${selector} ${action} restores its own trigger`);
    assert.equal(h.window.scrollY,640,`${selector} ${action} restores the result reading position`);
    assert.equal(h.history.state.screen,'results');
  }
});

test('Home, reset and refinement can supersede a queued profile-close traversal',async t=>{
  for(const action of ['home','reset','refine']) {
    const h=harness();t.after(h.dispose);await ready(h,'before-'+action);
    h.visible()[0].querySelector('.view-consultant').click();h.$('sheet-close').click();
    if(action==='home')h.$('brand-home').click();
    else if(action==='reset')h.$('new-search').click();
    else h.refine('Only those accepting Bupa');
    await h.flush();
    assert.equal(h.$('match-dialog').open,false,action);
    if(action==='refine') {
      assert.equal(h.history.state.screen,'results');assert.equal(h.$('workspace').hidden,false);
      assert.match(h.$('submitted-message').textContent,/Only those accepting Bupa/);
      h.requests.at(-1).resolve(result('after-refine'));await h.flush();assert.equal(h.visible().length,1);
    } else {
      assert.equal(h.history.state.screen,'home');assert.equal(h.$('workspace').hidden,true);
      assert.equal(h.document.activeElement,h.$('initial-query'));
      assert.equal(h.$('resume-search').hidden,action==='reset');
      if(action==='reset')assert.equal(h.$('conversation').childElementCount,0);
    }
  }
});
