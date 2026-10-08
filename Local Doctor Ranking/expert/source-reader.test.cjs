'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'public/source-reader.js'),'utf8');
function reader(hash='#evidence-selected',initialHeight=90) {
  const events={},css={},jumps=[],group={tagName:'DETAILS',open:false,parentElement:null};
  let height=initialHeight,resize,fontsReady;
  const target={classList:{contains:v=>['source-reader-passage','cited-passage'].includes(v)},parentElement:group,scrollIntoView:opts=>jumps.push(opts)};
  const document={querySelector:()=>({classList:{toggle:(key,value)=>css[key]=value},getBoundingClientRect:()=>({height})}),documentElement:{style:{setProperty:(k,v)=>css[k]=v}},
    getElementById:id=>id==='evidence-selected'?target:null,fonts:{ready:{then:fn=>fontsReady=fn}}};
  const location={hash},window={innerHeight:740,scrollTo:opts=>jumps.push(opts),addEventListener:(name,fn)=>events[name]=fn};
  vm.runInNewContext(code,{document,location,window,ResizeObserver:class{constructor(fn){resize=fn;}observe(){}}});
  return {css,jumps,group,events,location,resize:()=>resize(),fonts:()=>fontsReady(),height:v=>height=v};
}
test('citation navigation exposes its group and accounts for full sticky identity height',()=>{
  const r=reader();assert.equal(r.css['--source-reader-header-height'],'90px');assert.equal(r.group.open,true);assert.equal(r.jumps.length,1);
  r.height(158);r.resize();assert.equal(r.css['--source-reader-header-height'],'158px');assert.equal(r.jumps.length,1,'resizing must not steal reading position');
});
test('font settlement cannot override reading after interaction',()=>{
  const r=reader();r.events.wheel();r.fonts();assert.equal(r.jumps.length,1);
  r.events.hashchange();assert.equal(r.jumps.length,2,'explicit hash navigation still works');
});
test('index visits and malformed or missing anchors do not move the reader',()=>{
  for(const hash of ['', '#%bad', '#unrelated', '#evidence-obsolete']){const r=reader(hash);r.fonts();assert.equal(r.jumps.length,0);assert.equal(r.group.open,false);}
});
test('enlarged identities remain fully readable without a screen-sized sticky obstruction',()=>{
  const r=reader('#evidence-selected',640);
  assert.equal(r.css['source-reader-header-in-flow'],true);
  assert.equal(r.css['--source-reader-header-height'],'0px');
  assert.equal(r.jumps[0].top,0,'the initial selected passage follows the complete identity');
  r.height(180);r.resize();assert.equal(r.css['source-reader-header-in-flow'],false);
  assert.equal(r.jumps.length,1,'resize must not reset reading');
});
