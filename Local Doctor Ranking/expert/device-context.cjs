'use strict';
// A nomenclature describes devices, never a professional's credentials. Only
// active, visible clinical requirements enter retrieval; the label is metadata.
const {blankBrief,idFor,sufficient,removeRequirement,discoveryQuestion,CONCEPTS}=require('./brief.cjs');
const {QUESTIONS,createClarification,withClarification}=require('./clarifications.cjs');
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const clone=v=>structuredClone(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const META=['system','code','officialTerm','release','taxonomyVersion','taxonomyDigest','mappingVersion','sourceUrl','hierarchy'];
function validateDeviceContext(value,requirements=[]){
  if(value==null)return true;
  if(!fields(value,[...META,'interpretation','concepts','derivedRequirementIds'])||value.system!=='EMDN'||!text(value.code,32)||!value.code||!text(value.officialTerm,1500)||!value.officialTerm||!['release','taxonomyVersion','taxonomyDigest','mappingVersion'].every(k=>text(value[k],180)&&value[k])||!text(value.interpretation,2000)||!Array.isArray(value.hierarchy)||value.hierarchy.length>20||value.hierarchy.some(p=>!fields(p,['code','term'])||!text(p.code,32)||!text(p.term,1500))||value.sourceUrl!==null&&(!text(value.sourceUrl,1500)||!/^https:\/\//i.test(value.sourceUrl)))return false;
  if(!Array.isArray(value.concepts)||value.concepts.length>16||!Array.isArray(value.derivedRequirementIds)||value.derivedRequirementIds.length>16)return false;
  const keys=new Set(),ids=new Set(),active=[];
  for(const c of value.concepts){if(!fields(c,['key','requirementId','state','sharedWithUser'])||!text(c.key,180)||!c.key||!text(c.requirementId,179)||!c.requirementId||keys.has(c.key)||ids.has(c.requirementId)||!['active','removed'].includes(c.state)||typeof c.sharedWithUser!=='boolean')return false;keys.add(c.key);ids.add(c.requirementId);if(c.state==='active'){if(!requirements.some(r=>r.id===c.requirementId))return false;active.push(c.requirementId);}}
  return JSON.stringify(active)===JSON.stringify(value.derivedRequirementIds);
}
function metadata(node,mapping,taxonomy){const meta=taxonomy.getMetadata();return {system:'EMDN',code:node.code,officialTerm:node.term,release:node.release||meta.release,taxonomyVersion:node.taxonomyVersion||meta.taxonomyVersion||'emdn-'+meta.release+':'+meta.workbookSha256.slice(0,16),taxonomyDigest:meta.workbookSha256,mappingVersion:mapping?.version||meta.mappingVersion,sourceUrl:meta.sourceUrl||null,hierarchy:(node.path||[]).map(({code,term})=>({code,term}))};}
function derive(brief){brief.summary=brief.requirements.filter(r=>r.kind!=='geography').map(r=>r.polarity==='exclude'?'Exclude '+r.label:r.label).join(' · ');return brief;}
function explicitlyMentions(message,r){return [r.label,r.text].some(v=>v&&message.toLowerCase().includes(v.toLowerCase()))||CONCEPTS.some(([kind,label,pattern])=>kind===r.kind&&label===r.label&&pattern.test(message));}
function reconcile(brief){
  const context=brief.deviceContext;if(!context)return brief;
  for(const c of context.concepts)if(c.state==='active'&&!brief.requirements.some(r=>r.id===c.requirementId))c.state='removed';
  context.derivedRequirementIds=context.concepts.filter(c=>c.state==='active').map(c=>c.requirementId);
  const active=context.derivedRequirementIds.map(id=>brief.requirements.find(r=>r.id===id)?.label).filter(Boolean);
  context.interpretation=active.length?'Related expertise: '+active.join(' · '):context.concepts.length?'Device category retained for reference; its related expertise has been removed from this search.':'Broad device category. The clinical search is based on your supplied purpose and expertise.';
  return derive(brief);
}
function clearDevice(brief){for(const c of brief.deviceContext?.concepts||[])if(c.state==='active'&&!c.sharedWithUser)removeRequirement(brief,c.requirementId);delete brief.deviceContext;return derive(brief);}
function failure(input,code,question,draft,kind){
  const clarification=code==='device-clarification'?createClarification(kind||'context',{question,deviceCode:draft?.code}):null;
  return {brief:clone(input.previous||blankBrief()),deviceError:{code,error:question,question,retryable:false,...(draft?{deviceDraft:{...draft,question}}:{}),...(clarification?{clarification}:{})},needsClarification:true,question,...(clarification?{clarification}:{}),notices:[],mode:'device-lookup'};
}
function stripReferences(message,detected){let value=String(message||'');for(const ref of [...(detected.references||[])].sort((a,b)=>b.start-a.start)){if(Number.isInteger(ref.start)&&Number.isInteger(ref.end))value=value.slice(0,ref.start)+' '+value.slice(ref.end);}for(const code of detected.codes||[])value=value.replace(new RegExp('\\b'+code+'\\b','gi'),' ');return clean(value.replace(/\bEMDN(?:\s+(?:code|category))?\s*:?/gi,' ').replace(/\b(?:device\s+)?code\s*:\s*/gi,' ').replace(/[()\[\]]/g,' '));}
const generic=text=>!text||/^(?:(?:please|find|show|me|us|an?|the|clinical|experts?|specialists?|clinicians?|for|with|device|software|category|now|use|search|using)\s*)+[.!?]*$/i.test(text);
const application=/\b(?:cardiac|coronary|heart|brain|head|neuro\w*|lung|thoracic|chest|abdomen|abdominal|pelvi\w*|oncolog\w*|cancer|radiotherap\w*|musculoskel\w*|orthopaedic\w*|vascular|dental|whole[- ]body|general|any\s+(?:clinical|CT)|all\s+(?:clinical|CT))\b/i;
const purpose=/\b(?:analys\w*|analyz\w*|detect\w*|diagnos\w*|monitor\w*|screen\w*|measure\w*|treat\w*|plan\w*|predict\w*|support\w*|reconstruct\w*|segment\w*|visuali[sz]\w*)\b/i;
// Generic purpose wording still needs a clinical subject even if a model
// categorises “clinical condition” or “treatment planning” as expertise.
const unscopedPurpose=value=>!clean(value).replace(/\b(?:the|a|an|and|or|for|of|to|in|with|software|device|clinical|medical|condition|conditions|subject|area|supports?|supporting|diagnosis|diagnostic|diagnostics|monitors?|monitoring|treatment|treatments|planning)\b/gi,'').replace(/[^\p{L}\p{N}]/gu,'');
function createDeviceInterpreter({interpret,taxonomy}={}){
  const getTaxonomy=()=>taxonomy||require('./emdn-taxonomy.cjs');
  async function deviceInterpret(input={}){
    const t=getTaxonomy(),message=clean(input.message),previous=input.previous||blankBrief(),base=clone(previous),detected=t.detectCodes(message);
    const codes=[...new Set(detected.codes||[])],explicit=input.deviceCode!==undefined;
    if(detected.invalidCodes?.length||detected.ambiguousCategories?.length)return failure(input,'device-invalid','We could not resolve that EMDN code. Check the code or describe the clinical expertise you need.');
    if(codes.length>1)return failure(input,'device-multiple','Search one EMDN code at a time. Which device category should we use?');
    if(codes.length&&/\b(?:not|exclude|without|rather than|avoid)\s+(?:EMDN\s*(?:code\s*)?)?[A-Z]\d{2,}\b/i.test(message))return failure(input,'device-conflict','A device-code exclusion is not a clinical expertise filter. Select the code to use, or remove the active device category.');
    const removeText=/\b(?:remove|drop|clear|delete|stop using)\s+(?:(?:the|this|current)\s+)?(?:EMDN(?:\s+(?:code|category))?|device\s+(?:code|category)|[A-Z]\d{2,})\b/i.test(message)&&!/\b(?:do not|don't|not|never)\s+(?:remove|drop|clear|delete)\b/i.test(message);
    if(removeText&&codes.length&&codes[0]!==base.deviceContext?.code)return failure(input,'device-conflict','That code is not the active device category. Remove the active code or select a replacement explicitly.');
    if(/\b(?:do not|don't|never)\s+(?:remove|drop|clear|delete)\s+(?:the\s+)?(?:EMDN|device\s+code|[A-Z]\d{2,})/i.test(message)){
      if(explicit)return failure(input,'device-conflict','The device control conflicts with the instruction to keep the current code. Choose one action.');
      const remainder=message.replace(/\b(?:do not|don't|never)\s+(?:remove|drop|clear|delete)\s+(?:the\s+)?(?:EMDN\s*(?:code\s*)?)?(?:device\s+code|[A-Z]\d{2,})\b/i,'').replace(/^\s*(?:and|,|\.)\s*/,'').trim();
      return remainder===message?{brief:base,needsClarification:!sufficient(base),question:sufficient(base)?null:discoveryQuestion,notices:[],mode:'device-update'}:deviceInterpret({...input,message:remainder});
    }
    if(explicit&&input.deviceCode===null&&codes.length&&!removeText)return failure(input,'device-conflict','The message selects a device code while the code control removes it. Choose which action to apply.');
    if(explicit&&input.deviceCode!==null&&codes.length&&String(input.deviceCode).trim().toUpperCase()!==codes[0])return failure(input,'device-conflict','The EMDN code in the message differs from the selected code. Choose the code you want to use.');
    if(explicit&&input.deviceCode!==null&&removeText)return failure(input,'device-conflict','Choose whether to remove the device category or search the selected code.');
    if(explicit&&input.deviceCode===null||removeText){
      clearDevice(base);let residual=stripReferences(message,detected).replace(/\b(?:remove|drop|clear|delete|stop using)\s+(?:(?:the|this|current)\s+)?(?:device\s+)?(?:code|category)?/gi,'').replace(/^\s*(?:and|,|\.)\s*/,'').trim();
      const parsed=generic(residual)?{brief:base,notices:[],mode:'device-update'}:await interpret({...input,previous:base,message:residual});if(parsed.interpretationIncomplete)return parsed;
      delete parsed.brief.deviceContext;parsed.brief.version=previous.version+1;derive(parsed.brief);parsed.needsClarification=!sufficient(parsed.brief);parsed.question=parsed.needsClarification?discoveryQuestion:null;return parsed;
    }
    const requested=explicit?input.deviceCode:codes[0];
    if(requested===undefined){
      if(base.deviceContext?.code==='Z11030692'&&/\b(?:instead(?:\s+of)?|rather than|use\s+(?:it|this|that|the\s+(?:device|software))\s+for|change\s+(?:the\s+)?(?:application|purpose))\b/i.test(message)&&application.test(message))return failure(input,'device-conflict','This appears to change the CT application. Remove the earlier clinical criterion or select the code again with one application to use.',Object.fromEntries(META.map(k=>[k,base.deviceContext[k]])));
      if(base.deviceContext){
        const node=t.lookup(base.deviceContext.code),mapping=node&&t.getMapping(node.code),expected=node&&metadata(node,mapping,t);
        if(!expected||META.some(k=>JSON.stringify(expected[k])!==JSON.stringify(base.deviceContext[k])))return failure(input,'device-version-changed','The saved device interpretation uses another taxonomy or mapping version. Select the code again to review its current interpretation.');
      }
      const parsed=(!message&&!input.patch&&!input.removeRequirementId)?{brief:base,needsClarification:!sufficient(base),question:sufficient(base)?null:discoveryQuestion,notices:[],mode:'saved-brief'}:await interpret({...input,previous:base});
      if(parsed.interpretationIncomplete)return parsed;
      if(base.deviceContext){parsed.brief.deviceContext=clone(base.deviceContext);for(const c of parsed.brief.deviceContext.concepts){const r=parsed.brief.requirements.find(r=>r.id===c.requirementId);if(r&&message&&!/\b(?:remove|drop|clear|delete)\b/i.test(message)&&explicitlyMentions(message,r)){c.sharedWithUser=true;c.state='active';}}reconcile(parsed.brief);}
      return parsed;
    }
    const node=t.lookup(requested);if(!node)return failure(input,'device-invalid','That EMDN code is not in this version of the nomenclature. Check it or describe the device purpose.');
    const mapping=t.getMapping(node.code),meta=metadata(node,mapping,t),clinical=stripReferences(message,detected),same=base.deviceContext?.code===node.code,sameVersion=same&&META.every(k=>JSON.stringify(meta[k])===JSON.stringify(base.deviceContext[k]));
    if(!sameVersion)clearDevice(base);
    // A newly selected category cannot silently inherit an unrelated clinical
    // application from the previous device. Ask about this explicit selection.
    const clarification=mapping?.clarification||t.getClarification?.(node.code)||node.clarification,type=clarification?.type||'',ct=node.code==='Z11030692',broad=!mapping||node.code==='V92'||/purpose/i.test(type);
    const positiveClinical=clinical.replace(/\s+(?=(?:not(?!\s+(?:only|just))|rather than|instead of)\b)/gi,';').split(/[.;,]|\bbut\b/i).filter(part=>!/^\s*(?:(?:and|but)\s+)?(?:not|no|exclude|without|avoid|rather than|instead of)\b/i.test(part)).join(' ');
    const skin=/\b(?:derm(?:o|ato)scop\w*|skin[- ]lesion|melanoma)\b/i,cardiac=/\b(?:cardiac|coronary)\s+CT|implantable\s+cardiac|remote\s+monitoring\b/i;
    if(ct&&skin.test(positiveClinical)||node.code==='Z12040118'&&cardiac.test(positiveClinical)||node.code==='J010792'&&skin.test(positiveClinical))return failure(input,'device-conflict','The clinical description points to a different area from this EMDN category. Check the code or clarify how those areas relate.',meta);
    if(ct&&!application.test(positiveClinical))return failure(input,'device-clarification',QUESTIONS['ct-application'],meta,'ct-application');
    if(ct&&/\b(?:not(?!\s+(?:only|just|essential|mandatory))|rather than|instead of)\s+\S/i.test(clinical))return failure(input,'device-conflict','We could not safely apply that change of clinical application. Remove the earlier clinical criterion or describe one CT application to use.',meta);
    if(ct&&sameVersion){const wanted=/\b(?:cardiac|coronary|heart)\b/i.test(positiveClinical)?'Cardiac CT':'CT imaging';const earlier=base.deviceContext.concepts.filter(c=>c.state==='active').map(c=>base.requirements.find(r=>r.id===c.requirementId)).find(r=>r?.kind==='modality'&&r.label!==wanted);if(earlier)return failure(input,'device-conflict',`This changes the earlier ${earlier.label.toLowerCase()} application. Remove that criterion or clear the code before choosing the new CT application.`,meta);}
    if(broad&&(generic(clinical)||!purpose.test(clinical)))return failure(input,'device-clarification',node.code==='V92'?QUESTIONS['device-purpose']:clarification?.question||'What does the device do, and in which clinical area will it be used?',meta,'device-purpose');
    let parsed=generic(clinical)?{brief:base,notices:[],mode:'device-lookup'}:await interpret({...input,previous:base,message:clinical});
    if(parsed.interpretationIncomplete)return parsed;
    // Unrequested specialty changes are never guessed from category codes.
    const specs=(mapping?.concepts||[]).map(c=>({kind:({clinical_activity:'activity',clinical_subject:'condition'})[c.kind]||c.kind,label:c.label,text:c.text||c.label}));
    for(const spec of specs)if(spec.kind==='modality'&&/derm(?:o|ato)scop/i.test(spec.text)){spec.label='Skin-lesion imaging';spec.text='Skin-lesion imaging';}
    if(ct){specs.splice(0,specs.length,{kind:'modality',label:/\b(?:cardiac|coronary|heart)\b/i.test(positiveClinical)?'Cardiac CT':'CT imaging',text:/\b(?:cardiac|coronary|heart)\b/i.test(positiveClinical)?'Cardiac CT':'CT imaging'});}
    if(ct&&!/\b(?:cardiac|coronary|heart|general|any|all)\b/i.test(positiveClinical)){
      const subject=positiveClinical.match(/\b(?:lung(?:\s+(?:cancer|nodules?))?|brain(?:\s+(?:tumou?rs?|metastases))?|head|chest|thoracic|abdomen|abdominal|pelvi\w*|musculoskel\w*|orthopaedic\w*|vascular|dental|whole[- ]body)\b/i)?.[0];
      if(subject)specs.push({kind:'condition',label:subject,text:subject});
    }
    if(broad&&!specs.length){
      // The user's literal purpose remains a clinical search focus. The code
      // contributes no imagined clinical domain or professional role.
      const supplied=parsed.brief.requirements.filter(r=>(!previous.requirements.some(old=>old.id===r.id)||explicitlyMentions(positiveClinical,r))&&!['technology','workflow','question','geography','role'].includes(r.kind)&&!unscopedPurpose(r.text));
      if(!supplied.length)return failure(input,'device-clarification',QUESTIONS['device-clinical-subject'],meta,'device-clinical-subject');
    }
    const context=sameVersion?clone(base.deviceContext):{...meta,interpretation:'',concepts:[],derivedRequirementIds:[]};
    for(const spec of specs){
      const key=spec.kind+':'+spec.label.toLowerCase(),old=context.concepts.find(c=>c.key===key);
      const match=parsed.brief.requirements.find(r=>r.kind===spec.kind&&[r.label,r.text].some(v=>v.toLowerCase()===spec.label.toLowerCase()||v.toLowerCase()===spec.text.toLowerCase()));
      if(old?.state==='removed'){if(match&&explicitlyMentions(positiveClinical,match)){old.state='active';old.requirementId=match.id;old.sharedWithUser=true;}else continue;}
      if(old&&match&&explicitlyMentions(positiveClinical,match))old.sharedWithUser=true;
      const id=match?.id||idFor(spec.kind,spec.label);
      if(!match)parsed.brief.requirements.push({id,kind:spec.kind,label:spec.label,text:spec.text,importance:'focus',matchIntent:'topic',evidence:node.code});
      if(!old)context.concepts.push({key,requirementId:id,state:'active',sharedWithUser:!!match});
    }
    parsed.brief.deviceContext=context;parsed.brief.version=previous.version+1;reconcile(parsed.brief);parsed.needsClarification=!sufficient(parsed.brief);parsed.question=parsed.needsClarification?discoveryQuestion:null;parsed.mode='device-lookup';parsed.notices=[...(parsed.notices||[]),'The EMDN category guides related expertise discovery; it does not establish experience with this device.'];return parsed;
  }
  return async input=>withClarification(await deviceInterpret(input));
}
module.exports={createDeviceInterpreter,validateDeviceContext};
