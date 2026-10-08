'use strict';

// Designation-scope catalogue membership is not device assignment or evidence
// of a professional's competence. No model or network is involved in lookup.
const {createHash}=require('node:crypto');
const corpus=require('./data/mdr-2017-2185.json');
const MAPPING_VERSION='docmap-mdr-clarification-v1';
const FAMILIES=Object.freeze({
  MDA:{dimension:'design-purpose',label:'Active device design and intended purpose'},
  MDN:{dimension:'design-purpose',label:'Non-active device design and intended purpose'},
  MDS:{dimension:'specific-characteristic',label:'Specific device characteristics'},
  MDT:{dimension:'technology-process',label:'Manufacturing technologies and processes'}
});
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function normalizeCode(value){
  if(typeof value!=='string'||value.length>64)return null;
  const match=/^(MD[ANST])(?:[ \t\u00a0]*-[ \t\u00a0]*|[ \t\u00a0]*)([0-9]{4})$/i.exec(value.trim());
  return match?match[1].toUpperCase()+match[2]:null;
}
const digest=createHash('sha256').update(JSON.stringify(corpus.nodes)).digest('hex');
if(digest!==corpus.metadata.catalogueSha256||corpus.nodes.length!==71)throw new Error('MDR catalogue integrity check failed');
const byCode=new Map();
const metadata=freeze({...corpus.metadata,taxonomyDigest:digest,mappingVersion:MAPPING_VERSION,reviewedMappingCodes:[]});
function getClarification(value){
  const code=normalizeCode(value),raw=code&&corpus.nodes.find(n=>n.code===code);
  if(!raw)return null;
  if(code==='MDA0315')return freeze({required:true,type:'device-purpose',question:'What does the software do, and which clinical subject, procedure or modality should the expert know?'});
  if(raw.family==='MDS'||raw.family==='MDT')return freeze({required:true,type:'technical-context',question:'Which device and clinical application does this code concern, and do you need clinical expertise or expertise in its technical characteristics or manufacturing process?'});
  return freeze({required:true,type:'clinical-application',question:'What is the device used for, and which clinical subject, procedure or modality should the expert know?'});
}
for(const raw of corpus.nodes){
  if(normalizeCode(raw.code)!==raw.code||!FAMILIES[raw.family]||raw.family!==raw.code.slice(0,3)||byCode.has(raw.code)||!raw.term)throw new Error('Invalid or duplicate MDR catalogue code');
  const family=FAMILIES[raw.family];
  byCode.set(raw.code,freeze({
    system:'MDR',code:raw.code,displayCode:raw.family+' '+raw.code.slice(3),family:raw.family,
    dimension:family.dimension,familyDescription:family.label,term:raw.term,termRaw:raw.termRaw,
    release:metadata.release,taxonomyVersion:metadata.taxonomyVersion,taxonomyDigest:digest,
    sourceUrl:metadata.sourceUrl,source:{document:metadata.sourceTitle,page:raw.page,columns:['code','label']},
    // This is a flat designation catalogue; do not invent an EMDN-style tree.
    path:[{code:raw.code,term:raw.term}],limitations:metadata.limitations,
    clarification:getClarification(raw.code)
  }));
}
for(const [family,count]of Object.entries(metadata.familyCounts))if([...byCode.values()].filter(n=>n.family===family).length!==count)throw new Error('MDR family count mismatch');
function lookup(value){const code=normalizeCode(value);return code?byCode.get(code)||null:null;}
function getMetadata(){return metadata;}
function getMapping(){return null;}

function detectCodes(input){
  const message=typeof input==='string'?input.slice(0,20000):'';
  const references=[];
  // Prefix plus digits is deliberate code-shaped input. Bare MDR, MDS and MDT
  // prose stays prose, including MDR 2017/745 and clinical "MDS EB2" wording.
  // Capture malformed suffixes/lengths as one token, never repair or truncate.
  const pattern=/\b(?:(?:MD[A-QS-Z]|IV[A-Z])(?:[A-Za-z]*[0-9][A-Za-z0-9_-]*|[ \t\u00a0]*(?:[-_][ \t\u00a0]*)*[0-9][A-Za-z0-9_-]*)(?:[ \t]+[0-9][A-Za-z0-9_-]*)*|MDR[0-9][A-Za-z0-9_-]*)(?![A-Za-z0-9_])/gi;
  for(const token of message.matchAll(pattern)){
    const input=token[0],prefix=input.slice(0,3).toUpperCase(),ivdr=prefix.startsWith('IV');
    const code=normalizeCode(input)||input.toUpperCase();
    const node=!ivdr&&lookup(input);
    const declared=/\b(EMDN|MDR|IVDR)(?:\s+(?:codes?|category|categories))?\s*[:#=]?\s*$/i.exec(message.slice(Math.max(0,token.index-55),token.index));
    const mismatch=declared&&declared[1].toUpperCase()!==(ivdr?'IVDR':'MDR');
    references.push({input,system:ivdr?'IVDR':'MDR',code,start:token.index,end:token.index+input.length,explicit:!!declared,valid:!!node&&!mismatch,reason:mismatch?'system-mismatch':ivdr?'unsupported-system':node?null:normalizeCode(input)?'not-in-release':'invalid-format'});
  }
  // A dangling family in an explicit code list is an incomplete selection,
  // while phrases such as "MDS clinic" and "MDT meeting" remain ordinary text.
  for(const token of message.matchAll(/\b(?:MD[ANST]|IV[RSTP])(?:[ \t]*[-_])?(?![A-Za-z0-9_])/gi)){
    if(references.some(r=>token.index>=r.start&&token.index<r.end))continue;
    const before=message.slice(0,token.index),after=message.slice(token.index+token[0].length);
    const declared=/\b(?:MDR|IVDR)(?:\s+codes?)?\s*[:#=]?\s*$/i.test(before);
    const previous=references.filter(r=>r.end<=token.index).at(-1);
    const listed=previous&&/^\s*(?:[,;/&+]|and)\s*$/i.test(message.slice(previous.end,token.index))&&/^\s*(?:$|[,;/&+.!?])/.test(after);
    if(!declared&&!listed)continue;
    const ivdr=/^IV/i.test(token[0]);
    references.push({input:token[0],system:ivdr?'IVDR':'MDR',code:token[0].toUpperCase(),start:token.index,end:token.index+token[0].length,explicit:true,valid:false,reason:'invalid-format'});
  }
  references.sort((a,b)=>a.start-b.start);
  const unique=values=>[...new Set(values)];
  return {
    codes:unique(references.filter(r=>r.valid).map(r=>r.code)),
    classifications:[...new Map(references.filter(r=>r.valid).map(r=>[r.code,{system:'MDR',code:r.code}])).values()],
    invalidCodes:unique(references.filter(r=>!r.valid&&r.reason!=='unsupported-system').map(r=>r.code)),
    unsupportedCodes:unique(references.filter(r=>r.reason==='unsupported-system').map(r=>r.code)),
    ambiguousCategories:[],references
  };
}
module.exports={lookup,normalizeCode,detectCodes,getMapping,getClarification,getMetadata,MAPPING_VERSION,FAMILIES};
