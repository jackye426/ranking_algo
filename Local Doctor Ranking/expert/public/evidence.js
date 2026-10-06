(function(root){
  'use strict';
  // Shared presentation only. These helpers never change matrix outcomes,
  // retrieval scores, qualification decisions or the source text.
  const list=value=>Array.isArray(value)?value:[];
  const normal=value=>String(value||'').replace(/\s+/g,' ').trim();
  const contextKinds=new Set(['question','technology','workflow','manufacturer','independence','timing','availability']);
  const typeNames={'clinical-practice':'Recorded activity','clinical-interest':'Listed interest',procedure:'Listed procedure',research:'Recorded research',trial:'Recorded study contribution',publication:'Recorded publication',training:'Recorded training',relationship:'Recorded relationship','professional-background':'Recorded background',location:'Recorded location',registration:'Recorded identifier'};
  const typeStrength={'clinical-practice':6,research:5,trial:5,publication:4,'clinical-interest':3,procedure:2,training:1,'professional-background':0,location:0,registration:0,relationship:0};
  const typeOf=value=>typeof value==='string'?value:value?.evidenceType||value?.type||'';
  const typeLabel=value=>typeNames[typeOf(value)]||'Recorded evidence';
  const requirementLabel=requirement=>(requirement?.polarity==='exclude'?'Exclude: ':requirement?.strictRole?'Allowed role: ':'')+(requirement?.label||'Requirement');
  const sourceType=item=>typeOf(item.support)||typeOf(item.evidence);
  const activeRequirement=(row,brief)=>list(brief?.requirements).find(r=>r.id===row?.requirementId)||row||{};
  function safeUrl(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
  const evidenceAnchor=id=>typeof id==='string'&&id?'evidence-'+id:null;
  function recordUrl(candidateId,evidenceId,baseUrl){
    const base=safeUrl(baseUrl);if(!base||typeof candidateId!=='string'||!candidateId)return null;
    const url=new URL('/api/expert/sources/'+encodeURIComponent(candidateId),base);
    if(typeof evidenceId==='string'&&evidenceId){url.searchParams.set('evidence',evidenceId);url.hash=evidenceAnchor(evidenceId);}
    return url.href;
  }
  function sourceLinks(evidence){
    const links=new Map();
    for(const source of [evidence,...list(evidence?.sources)]){
      if(!source)continue;const url=safeUrl(source.sourceUrl);if(!url)continue;
      const provenance={sourceRecordId:source.sourceRecordId||null,field:source.field||null,sourceLabel:source.sourceLabel||'Stored professional source',dates:{...(source.dates||{})},attribution:source.attribution||'source-record'};
      if(!links.has(url))links.set(url,{url,label:provenance.sourceLabel,...provenance,provenance:[]});
      const entry=links.get(url);if(!entry.provenance.some(p=>JSON.stringify(p)===JSON.stringify(provenance)))entry.provenance.push(provenance);
    }
    return [...links.values()];
  }
  function ownedSupport(candidate,row){
    if(!row)return [];
    const evidence=list(candidate?.evidence).filter(e=>e?.candidateId===candidate.id&&typeof e.text==='string');
    const supports=Array.isArray(row.supportingEvidence)?row.supportingEvidence:list(row.evidenceIds).map(id=>{
      const e=evidence.find(p=>p.id===id);return e?{evidenceId:id,text:e.text,kind:e.reviewedParaphrase?'reviewed-summary':'source-quote',evidenceType:e.type,sourceQuote:e.sourceQuote||null,sourceDate:e.dates?.sourceDate||null,limits:list(e.review?.limitations)}:null;
    }).filter(Boolean);
    return supports.map(support=>({support,evidence:evidence.find(e=>e.id===support.evidenceId)})).filter(({support,evidence:e})=>{
      if(!e||!list(row.evidenceIds).includes(e.id)||typeof support.text!=='string'||!support.text.trim())return false;
      // A selected span must remain owned by the retained source or its literal
      // excerpt. Never create a new quotation from a detached display string.
      return e.text.includes(support.text)||(typeof e.sourceQuote==='string'&&e.sourceQuote.includes(support.text));
    }).map(item=>({...item,match:row}));
  }
  function scopeWeight(item,candidate,brief){
    const quote=normal(item.support.text),seen=new Set();let weight=0;
    for(const row of list(candidate?.requirementMatrix)){
      const requirement=activeRequirement(row,brief),kind=requirement.kind||row.kind;
      if(requirement.polarity==='exclude'||contextKinds.has(kind)||!['documented','potential'].includes(row.status)||seen.has(row.requirementId))continue;
      if(!ownedSupport(candidate,row).some(p=>normal(p.support.text)===quote))continue;
      seen.add(row.requirementId);weight+=({activity:12,modality:8,procedure:8,condition:6,research:6,population:4,setting:4})[kind]||0;
      if(requirement.importance==='preferred')weight-=2;
    }
    return weight;
  }
  // This is an excerpt-detail tie-breaker, not evidence extraction: only an
  // already scoped, matrix-owned claim can receive a presentation preference.
  function actionDetail(item){return /\b(?:report(?:s|ed|ing)?|interpret(?:s|ed|ing)?|supervis(?:e|es|ed|ing)|perform(?:s|ed|ing)?|treat(?:s|ed|ing)?|manag(?:e|es|ed|ing)|evaluat(?:e|es|ed|ing)|led|coauthor(?:ed)?|authored)\b/i.test(item.support.text)?1:0;}
  function compareProofs(a,b,candidate,brief){
    return (typeStrength[sourceType(b)]??0)-(typeStrength[sourceType(a)]??0)||scopeWeight(b,candidate,brief)-scopeWeight(a,candidate,brief)||actionDetail(b)-actionDetail(a)||Math.min(160,b.support.text.length)-Math.min(160,a.support.text.length);
  }
  function supportFor(candidate,row,brief){
    const requirement=activeRequirement(row,brief);
    return ownedSupport(candidate,row).map(item=>({...item,requirement})).sort((a,b)=>compareProofs(a,b,candidate,brief));
  }
  function outcome(row,candidate,requirement){
    const r=requirement||row||{},status=row?.status||'unknown';
    if(r.polarity==='exclude')return {label:'Role exclusion filter',status,evidenceType:null,meaning:'An explicit role restriction, not a positive qualification.',note:status==='documented'?'The excluded role is recorded; review this candidate against your restriction.':['mismatch','needs-review'].includes(status)?'A source qualification or negative role statement needs scope and date review. This is not a positive role claim.':'No excluded role is established in the retained records. Incomplete role data does not prove absence; confirm directly.'};
    const proof=supportFor(candidate,row,{requirements:[{...r,id:r.id||row?.requirementId}]}),evidenceType=proof[0]?sourceType(proof[0]):null;
    const meanings={'clinical-practice':'The source records clinical activity. Its scope and current relevance still need confirmation.','clinical-interest':'The source lists an interest in this area; this does not establish performed clinical work.',procedure:'A procedure listing does not by itself establish personal performance or current practice.',research:'The recorded research role and dates define this evidence; specific assessment tasks still need qualification.',trial:'The recorded study contribution does not by itself establish appraisal or regulatory assessment competence.',publication:'A publication or authorship record does not by itself establish appraisal or regulatory assessment competence.',training:'Training does not establish current or independent practice.',location:'A recorded practice location does not establish residence, current practice or availability.',registration:'A recorded identifier is not a live registration check.',relationship:'A recorded relationship requires scope and date review; it is not a conflict determination.'};
    const meaning=meanings[evidenceType]||'Review the recorded scope and confirm its relevance to this engagement.';
    const labels={potential:'Potential relevance',unknown:'Confirmation required','needs-review':'Source qualification to review',mismatch:'Recorded limitation',context:'Engagement context'};
    const label=status==='documented'?(r.kind==='role'?'Recorded role':typeLabel(evidenceType)):labels[status]||'Confirmation required';
    return {label,status,evidenceType,meaning,note:status==='documented'?meaning:row?.note||'Not established by the available records; this is not evidence of absence.'};
  }
  function cardProofs(candidate,brief,{limit=2}={}){
    const all=[];
    for(const row of list(candidate?.requirementMatrix)){
      const requirement=activeRequirement(row,brief),kind=requirement.kind||row.kind;
      if(!['documented','potential'].includes(row.status)||requirement.polarity==='exclude'||contextKinds.has(kind)||['geography','location','role','currentPractice'].includes(kind))continue;
      all.push(...supportFor(candidate,row,brief));
    }
    // Choose a task-specific occurrence before deduplicating its repeated quote
    // across modality, activity and population requirements.
    const taskOrder=item=>({activity:5,modality:4,procedure:4,condition:3,research:3,population:2,setting:2})[item.requirement.kind||item.match.kind]||0;
    all.sort((a,b)=>compareProofs(a,b,candidate,brief)||taskOrder(b)-taskOrder(a));
    const unique=[],seen=new Set();
    for(const item of all){const key=normal(item.support.text);if(seen.has(key))continue;seen.add(key);const coveredRequirementIds=[...new Set(all.filter(other=>normal(other.support.text)===key).map(other=>other.match.requirementId))];unique.push({...item,coveredRequirementIds});}
    const first=unique.find(item=>['clinical-practice','clinical-interest','procedure'].includes(sourceType(item)))||unique[0];
    if(!first||limit<=0)return [];
    const selected=[first],covered=new Set(first.coveredRequirementIds),remaining=unique.filter(item=>item!==first);
    while(selected.length<Math.min(6,limit)){
      const addsScope=item=>item.coveredRequirementIds.some(id=>!covered.has(id));
      const newScopeWeight=item=>item.coveredRequirementIds.filter(id=>!covered.has(id)).reduce((sum,id)=>{const row=list(candidate.requirementMatrix).find(r=>r.requirementId===id),r=activeRequirement(row,brief);return sum+((({activity:12,modality:8,procedure:8,condition:6,research:6,population:4,setting:4})[r.kind]||0)*(r.importance==='preferred'?.5:1)*(row?.status==='potential'?.5:1));},0);
      const available=remaining.filter(addsScope).sort((a,b)=>newScopeWeight(b)-newScopeWeight(a)||compareProofs(a,b,candidate,brief));
      const next=available.find(item=>['research','trial','publication'].includes(sourceType(item)))||available[0];
      if(!next)break;
      // Label a repeated passage by the NEW requirement it contributes, rather
      // than displaying a second weaker proof for an already-covered modality.
      const occurrence=all.filter(item=>normal(item.support.text)===normal(next.support.text)&&!covered.has(item.match.requirementId)).sort((a,b)=>taskOrder(b)-taskOrder(a))[0]||next;
      selected.push({...occurrence,coveredRequirementIds:next.coveredRequirementIds});remaining.splice(remaining.indexOf(next),1);next.coveredRequirementIds.forEach(id=>covered.add(id));
    }
    return selected;
  }
  function gaps(candidate,brief){
    const result={essential:[],preferred:[]},requirements=list(brief?.requirements).length?brief.requirements:list(candidate?.requirementMatrix).map(row=>({...row,id:row.requirementId}));
    for(const requirement of requirements){
      if(requirement.polarity==='exclude'||contextKinds.has(requirement.kind))continue;
      const row=list(candidate?.requirementMatrix).find(r=>r.requirementId===requirement.id),existing=list(candidate?.gaps).find(g=>g.requirementId===requirement.id),status=row?.status||existing?.status||'unknown';
      if(['documented','context'].includes(status))continue;
      const importance=requirement.importance==='preferred'?'preferred':'essential';
      result[importance].push({...requirement,requirementId:requirement.id,label:requirementLabel(requirement),importance,status,note:row?.note||existing?.note||'Not established by the available records; this is not evidence of absence.',evidenceIds:[...list(row?.evidenceIds)]});
    }
    return result;
  }
  const api={typeLabel,requirementLabel,outcome,supportFor,cardProofs,gaps,safeUrl,sourceLinks,recordUrl,evidenceAnchor};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DocMapEvidence=api;
})(globalThis);
