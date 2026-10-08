'use strict';

const emdn=require('./emdn-taxonomy.cjs');
const mdr=require('./mdr-taxonomy.cjs');
const REGISTRY_VERSION='docmap-classification-registry-v1';
const adapters=Object.freeze(Object.assign(Object.create(null),{EMDN:emdn,MDR:mdr}));
const unique=values=>[...new Set(values)];
function reference(value){
  if(typeof value==='string'){
    const m=mdr.normalizeCode(value);if(m)return {system:'MDR',code:m};
    const e=emdn.normalizeCode(value);return e?{system:'EMDN',code:e}:null;
  }
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.system!=='string')return null;
  const system=value.system.toUpperCase(),adapter=adapters[system];
  const code=adapter?.normalizeCode(value.code);return code?{system,code}:null;
}
function lookup(value){
  const ref=reference(value);if(!ref)return null;
  const node=adapters[ref.system].lookup(ref.code);if(!node)return null;
  return ref.system==='MDR'?node:Object.freeze({...node,system:'EMDN',family:node.category,dimension:'device-nomenclature',sourceUrl:emdn.getMetadata().sourceUrl});
}
function getMapping(value){const ref=reference(value);return ref?adapters[ref.system].getMapping(ref.code):null;}
function getClarification(value){const ref=reference(value);return ref?adapters[ref.system].getClarification(ref.code):null;}
function getMetadata(system){
  if(system&&typeof system==='object')system=system.system;
  if(system===undefined)return Object.freeze({registryVersion:REGISTRY_VERSION,systems:Object.freeze(['EMDN','MDR'])});
  if(typeof system!=='string')return null;
  if(system.toUpperCase()==='MDR')return mdr.getMetadata();
  if(system.toUpperCase()==='EMDN'){const meta=emdn.getMetadata();return Object.freeze({...meta,system:'EMDN',taxonomyDigest:meta.workbookSha256});}
  return null;
}
function detectCodes(input){
  const message=typeof input==='string'?input.slice(0,20000):'';
  const m=mdr.detectCodes(message);
  // Preserve positions while masking MDR/IVDR tokens, so the EMDN detector can
  // never interpret a fragment inside a malformed multi-letter code.
  let masked=message;for(const ref of [...m.references].sort((a,b)=>b.start-a.start))masked=masked.slice(0,ref.start)+' '.repeat(ref.end-ref.start)+masked.slice(ref.end);
  const e=emdn.detectCodes(masked);
  const references=[...m.references,...e.references.map(r=>({...r,system:'EMDN'}))].sort((a,b)=>a.start-b.start);
  // An explicit mixed list also supplies context for short EMDN codes (V92,
  // A01, etc.). Masking a neighbouring MDR token must not silently lose them.
  if(m.references.length){
    const candidates=[...masked.matchAll(/\b[A-Za-z][0-9][A-Za-z0-9_-]*/g)];
    let changed=true;
    while(changed){changed=false;for(const token of candidates){
      if(references.some(r=>token.index>=r.start&&token.index<r.end))continue;
      const start=token.index,end=start+token[0].length;
      const adjacent=references.some(r=>r.end<=start&&/^\s*(?:[,;/&+]|and)\s*$/i.test(message.slice(r.end,start))||r.start>=end&&/^\s*(?:[,;/&+]|and)\s*$/i.test(message.slice(end,r.start)));
      if(!adjacent)continue;
      const code=token[0].toUpperCase(),node=emdn.lookup(code);
      references.push({input:token[0],system:'EMDN',code,start,end,explicit:true,valid:!!node,reason:node?null:emdn.normalizeCode(code)?'not-in-release':'invalid-format'});changed=true;
    }}
    references.sort((a,b)=>a.start-b.start);
  }
  for(const ref of references.filter(r=>r.system==='EMDN')){
    const declared=/\b(MDR|IVDR)(?:\s+(?:codes?|category|categories))?\s*[:#=]?\s*$/i.exec(message.slice(Math.max(0,ref.start-55),ref.start));
    if(declared){ref.valid=false;ref.reason='system-mismatch';ref.explicit=true;}
  }
  const classifications=[...new Map(references.filter(r=>r.valid).map(r=>[r.system+':'+r.code,{system:r.system,code:r.code}])).values()];
  return {codes:unique(classifications.map(r=>r.code)),classifications,
    invalidCodes:unique(references.filter(r=>!r.valid&&r.reason!=='unsupported-system').map(r=>r.code)),
    unsupportedCodes:unique(references.filter(r=>r.reason==='unsupported-system').map(r=>r.code)),
    ambiguousCategories:e.ambiguousCategories,references};
}
// Detection reports individual tokens for recovery. Acceptance is atomic: one
// invalid/unsupported reference means no selected classifications are returned.
function resolveSet(value){
  if(typeof value==='string'){
    const detected=detectCodes(value);
    if(detected.classifications.length>32)detected.invalidCodes.push('too-many-classifications');
    const valid=!detected.invalidCodes.length&&!detected.unsupportedCodes.length&&!detected.ambiguousCategories.length&&detected.classifications.length>0;
    return {...detected,valid,classifications:valid?detected.classifications:[],nodes:valid?detected.classifications.map(lookup):[]};
  }
  const input=Array.isArray(value)?value:[value];
  if(input.length>32)return {valid:false,classifications:[],nodes:[],invalidCodes:['too-many-classifications'],unsupportedCodes:[]};
  const invalidCodes=[],unsupportedCodes=[],found=new Map();
  for(const item of input){
    const node=lookup(item);
    if(node)found.set(node.system+':'+node.code,{system:node.system,code:node.code});
    else if(typeof item==='object'&&typeof item?.system==='string'&&item.system.toUpperCase()==='IVDR'||typeof item==='string'&&/^IV[A-Z][\s-]*\d/i.test(item.trim()))unsupportedCodes.push(typeof item==='string'?item:String(item.code||''));
    else invalidCodes.push(typeof item==='string'?item:String(item?.code||''));
  }
  const valid=input.length>0&&!invalidCodes.length&&!unsupportedCodes.length,classifications=valid?[...found.values()]:[];
  return {valid,classifications,nodes:classifications.map(lookup),invalidCodes:unique(invalidCodes),unsupportedCodes:unique(unsupportedCodes)};
}
module.exports={lookup,normalizeReference:reference,detectCodes,resolveSet,getMapping,getClarification,getMetadata,REGISTRY_VERSION};
