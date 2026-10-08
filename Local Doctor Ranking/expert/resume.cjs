'use strict';
// A saved brief is user input, not a trusted search snapshot. Accept only the
// assessment schema; candidate evidence, project notes and review states never
// cross this boundary. Retrieval rebuilds every candidate from the server corpus.
const {KINDS,IMPORTANCES,MATCH_INTENTS,blankBrief,sufficient,discoveryQuestion}=require('./brief.cjs');
const isObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,allowed)=>isObject(v)&&Object.keys(v).every(k=>allowed.includes(k));
const string=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
function restoreBrief(value){
  const fail=()=>{throw new TypeError('This saved brief cannot be resumed. Check its requirements or start a new assessment.');};
  if(!fields(value,['version','summary','requirements','roles','excludedRoles','roleMode','geography','panelSize','timing','manufacturer','contactFilter','locationFilter'])||!Number.isSafeInteger(value.version)||value.version<0||value.version>100000||!Array.isArray(value.requirements)||value.requirements.length>64)fail();
  const brief=blankBrief(),ids=new Set();brief.version=value.version;
  for(const r of value.requirements){
    if(!fields(r,['id','kind','label','text','importance','evidence','polarity','strictRole','matchIntent'])||!string(r.id,179)||!r.id||ids.has(r.id)||!KINDS.has(r.kind)||!string(r.label,500)||!r.label.trim()||!string(r.text,4000)||!r.text.trim()||!IMPORTANCES.has(r.importance)||(r.evidence!==undefined&&!string(r.evidence,4000))||(r.matchIntent!==undefined&&(!MATCH_INTENTS.has(r.matchIntent)||r.kind==='role'))||(r.polarity!==undefined&&!['include','exclude'].includes(r.polarity))||(r.strictRole!==undefined&&typeof r.strictRole!=='boolean')||(r.kind!=='role'&&(r.polarity==='exclude'||r.strictRole===true)))fail();
    ids.add(r.id);brief.requirements.push({id:r.id,kind:r.kind,label:r.label,text:r.text,importance:r.importance,...(r.matchIntent!==undefined?{matchIntent:r.matchIntent}:{}),...(r.evidence!==undefined?{evidence:r.evidence}:{}),...(r.kind==='role'?{polarity:r.polarity==='exclude'?'exclude':'include',strictRole:r.strictRole===true&&r.polarity!=='exclude'}:{})});
  }
  for(const key of ['summary','geography','timing','manufacturer'])if(value[key]!=null&&!string(value[key],key==='summary'?12000:500))fail();
  for(const key of ['roles','excludedRoles'])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>64||value[key].some(v=>!string(v,500))))fail();
  if(value.roleMode!=null&&value.roleMode!=='only')fail();
  if(value.panelSize!=null&&(!Number.isSafeInteger(value.panelSize)||value.panelSize<1||value.panelSize>100))fail();
  if(value.contactFilter!=null&&value.contactFilter!=='not-contacted')fail();
  brief.roles=brief.requirements.filter(r=>r.kind==='role'&&r.polarity!=='exclude').map(r=>r.label);
  brief.excludedRoles=brief.requirements.filter(r=>r.kind==='role'&&r.polarity==='exclude').map(r=>r.label);
  // Older saved briefs express an only-role constraint at brief level. The
  // ranker deliberately supports that representation; never broaden it here.
  brief.roleMode=brief.requirements.some(r=>r.strictRole)||value.roleMode==='only'&&brief.roles.length?'only':null;
  if(value.locationFilter!==undefined){if(value.locationFilter!==null&&!require('./geo.cjs').validateLocation(value.locationFilter))fail();brief.locationFilter=value.locationFilter?structuredClone(value.locationFilter):null;}
  const places=brief.requirements.filter(r=>r.kind==='geography');
  brief.geography=places.length?(value.geography||places.map(r=>r.text).join(' · ')):null;
  for(const key of ['timing','manufacturer','panelSize','contactFilter'])brief[key]=value[key]??null;
  brief.summary=brief.requirements.filter(r=>r.kind!=='geography').map(r=>r.polarity==='exclude'?'Exclude '+r.label:r.label).join(' · ');
  return {brief,needsClarification:!sufficient(brief),question:sufficient(brief)?null:discoveryQuestion,notices:[],mode:'saved-brief'};
}
module.exports={restoreBrief};
