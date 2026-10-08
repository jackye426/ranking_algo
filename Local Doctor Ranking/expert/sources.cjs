'use strict';
const {sourceLinks,safeUrl,displayBlocks,volumeSummary}=require('./public/evidence.js');
const {repairProvenance}=require('./data.cjs');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=value=>Array.isArray(value)?value:[];
const evidenceAnchor=id=>'evidence-'+id;
const labels={'clinical-interest':'Listed clinical interests','clinical-practice':'Recorded clinical activity',procedure:'Recorded procedure listing',research:'Recorded research involvement',publication:'Recorded publication evidence',trial:'Recorded study involvement',qualification:'Recorded qualifications',training:'Recorded training',teaching:'Recorded teaching',affiliation:'Recorded affiliation',relationship:'Recorded relationship',location:'Recorded practice location','activity-volume':'Reported activity volume',registration:'Recorded registration identifier',biography:'Stored biography excerpt'};
const backgroundLabels={qualifications:'Recorded qualifications',detailed_qualifications:'Recorded qualifications',professional_memberships:'Recorded memberships',specialty:'Recorded specialty',specialties:'Recorded specialty',specialty_alternatives:'Recorded specialty',professional_role:'Recorded professional role',nhs_posts:'Recorded NHS role',nhs_base:'Recorded NHS role',about:'Stored biography excerpt',about_alternatives:'Stored biography excerpt',professional_experience:'Stored biography excerpt'};
const qualifications={historical:'This passage describes historical activity.','stated-interest':'A listed interest does not establish performed clinical activity.','research-interest-not-study-experience':'Research interest is not evidence of conducting or evaluating a study.','bibliographic-reference-not-training-or-authorship':'A bibliographic reference does not establish training or authorship.','publication-listing-link-not-authorship':'A publication-profile link does not verify individual publications or authorship.','legal-work-not-clinical-care':'Medico-legal work does not establish clinical care.','training-not-practice':'Training does not establish current practice.','reported-current-practice':'The source reports current practice; confirm its date and present relevance.','contains-negation':'Read negative statements in context before relying on this passage.','relationship-not-conflict-determination':'A recorded relationship is not a conflict-of-interest determination.','self-reported-activity':'Reported activity has not been independently counted.','recorded-location-not-residence-or-current-practice':'A listed location does not establish residence or current practice.'};
const groups=[['clinical','Clinical work and interests'],['procedures','Procedures'],['research','Research'],['background','Background and qualifications'],['locations','Practice locations'],['relationships','Relationships']];
const researchFields=new Set(['research_interests','publications','trials','isrctn_trials']);
const procedureFields=new Set(['procedures','procedures_completed','procedure_volumes_phin']);
function sourceLabel(p){return p.sourceLabel||'Stored professional record';}
function passageLabel(p){
  if(p.field==='research_interests'&&p.type==='clinical-interest')return 'Listed research interests';
  if(p.field==='publications'&&list(p.qualifiers).some(q=>/publication-listing-link-not-authorship|bibliographic-reference-not-training-or-authorship/.test(q)))return 'Publication reference';
  return labels[p.type]||(p.type==='professional-background'?backgroundLabels[p.field]:null)||'Stored professional background';
}
function groupKey(p){
  if(p.type==='relationship')return 'relationships';
  if(p.type==='location'||p.field==='locations')return 'locations';
  if(['research','trial','publication','research-context'].includes(p.type)||researchFields.has(p.field))return 'research';
  if(['procedure','activity-volume'].includes(p.type)||procedureFields.has(p.field))return 'procedures';
  if(['clinical-practice','clinical-interest'].includes(p.type))return 'clinical';
  return 'background';
}
function originalLinks(p){return sourceLinks(p);}
function limitsFor(p){return [...new Set([...list(p.review?.limitations),...list(p.qualifiers).map(v=>qualifications[v]||String(v).replace(/-/g,' '))].filter(v=>typeof v==='string'&&v.trim()))];}
function formattedText(value,field,{quote=false}={}){
  const blocks=displayBlocks(typeof value==='string'?value:'',field);
  // Layout only: reviewed summaries never become literal quotations.
  if(quote&&blocks.length===1&&blocks[0].kind==='paragraph')return `<blockquote>${escape(blocks[0].text)}</blockquote>`;
  let html='',inList=false;
  for(const block of blocks){
    if(block.kind==='list-item'){if(!inList){html+='<ul>';inList=true;}html+=`<li>${escape(block.text)}</li>`;}
    else{if(inList){html+='</ul>';inList=false;}html+=`<p>${escape(block.text)}</p>`;}
  }
  if(inList)html+='</ul>';
  return quote?`<blockquote>${html}</blockquote>`:html;
}
function stableKey(value){
  if(Array.isArray(value))return '['+value.map(stableKey).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableKey(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function provenance(p){
  const seen=new Set(),result=[];
  for(const source of [p,...list(p.sources)]){
    if(!source||typeof source!=='object')continue;
    // Match the stored provenance schema, rather than aggregate passage
    // qualifiers which are not copied into each source by corpus preparation.
    const entry={sourceRecordId:source.sourceRecordId||null,field:source.field||null,sourceLabel:sourceLabel(source),sourceUrl:safeUrl(source.sourceUrl),dates:source.dates||{},attribution:source.attribution||'Stored source record',identityBasis:source.identityBasis||source.review?.identityBasis||null,reviewedParaphrase:source.reviewedParaphrase===true,sourceQuote:source.sourceQuote||null,review:source.review||null,...repairProvenance(source.repairProvenance),limits:[...new Set(list(source.review?.limitations).filter(v=>typeof v==='string'&&v.trim()))]};
    const key=stableKey(entry);if(seen.has(key))continue;seen.add(key);result.push(entry);
  }
  return result;
}
function metadata(p,{evidenceId}={}){
  const rows=[...(evidenceId?[['Evidence identifier',evidenceId]]:[]),['Stored source record',p.sourceRecordId||'Not recorded'],['Source field',p.field||'Not recorded'],['Attribution',p.attribution||'Stored source record'],['Source date',p.dates?.sourceDate||'Not recorded'],['Retrieved or checked',p.dates?.observedAt||'Not recorded'],['Database processing date',p.dates?.mergeDate||'Not recorded']];
  if(p.identityBasis)rows.push(['Identity attribution',typeof p.identityBasis==='string'?p.identityBasis:JSON.stringify(p.identityBasis)]);
  for(const [key,label]of Object.entries({releaseId:'Data release',baselineSha256:'Frozen baseline SHA-256',beforeHash:'Original field SHA-256',snapshotSha256:'Source snapshot SHA-256',parserVersion:'Source parser',reviewId:'Source comparison record',originalSourceField:'Original source field'}))if(p.repairProvenance?.[key])rows.push([label,p.repairProvenance[key]]);
  return `<dl class="source-reader-metadata">${rows.map(([label,value])=>`<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>`;
}
function renderLimits(limits){return limits.length?`<div class="source-reader-limits"><p><strong>What this evidence establishes</strong></p><ul>${limits.map(value=>`<li>${escape(value)}</li>`).join('')}</ul></div>`:'';}
function renderSourcePage(candidate,facts,selected,{corpusVersion,profileVersion,dataRelease,legacyCitation=false}={}){
  const seen=new Set(),owned=list(facts).filter(p=>p?.candidateId===candidate.id&&typeof p.id==='string'&&!seen.has(p.id)&&(seen.add(p.id),true));
  // Route validation returns 404 for invalid selections; also retain ownership
  // at this presentation boundary so detached claims cannot be rendered.
  const cited=selected&&owned.find(p=>p.id===selected.id&&selected.candidateId===candidate.id);
  const article=(p,isSelected=false)=>{
    const links=originalLinks(p),provenanceRows=provenance(p),main=provenanceRows[0],limits=limitsFor(p);
    return `<article id="${escape(evidenceAnchor(p.id))}" class="source-reader-passage${isSelected?' cited-passage':''}" tabindex="-1">
      ${isSelected?'<p class="source-reader-kicker">Cited passage</p>':''}
      <h${isSelected?'2':'3'} class="source-reader-type">${escape(passageLabel(p))}</h${isSelected?'2':'3'}>
      ${p.reviewedParaphrase?`<div class="source-reader-summary"><p><strong>Reviewed source summary</strong></p>${formattedText(p.text,p.field)}</div>${p.sourceQuote?`<p class="source-reader-kicker">Exact source excerpt</p><div class="source-reader-quote">${formattedText(p.sourceQuote,p.field,{quote:true})}</div>`:'<p class="source-reader-summary">No literal excerpt was recorded; this is a reviewed summary.</p>'}`:`<p class="source-reader-kicker">Exact source excerpt</p><div class="source-reader-quote">${formattedText(p.text,p.field,{quote:true})}</div>`}
      <p class="source-reader-provider">Source: ${escape(sourceLabel(p))}</p>
      <p class="source-reader-date">Source date: ${escape(p.dates?.sourceDate||'Not recorded')}.</p>
      ${volumeSummary(p).map(value=>`<p class="source-reader-volume">${escape(value)}</p>`).join('')}
      ${renderLimits(limits)}
      <div class="source-reader-links">${links.length?links.map(link=>`<a href="${escape(link.url)}" rel="noopener noreferrer" target="_blank">Open original page — ${escape(link.label)} ↗<span class="sr-only"> (opens in a new tab)</span></a>`).join(''):'<p>Original page link unavailable. This quotation comes from the stored record.</p>'}</div>
      <details class="source-reader-details"><summary>Record details</summary>${metadata(main||p,{evidenceId:p.id})}
        ${provenanceRows.slice(1).map(source=>`<section class="source-reader-provenance"><h4>Additional source record</h4><p>${source.sourceUrl?`<a href="${escape(source.sourceUrl)}" rel="noopener noreferrer" target="_blank">Open original page — ${escape(source.sourceLabel)} ↗<span class="sr-only"> (opens in a new tab)</span></a>`:escape(source.sourceLabel)}</p>${metadata(source)}${source.sourceQuote&&source.sourceQuote!==main.sourceQuote?`<p>Additional exact source excerpt</p><div class="source-reader-quote">${formattedText(source.sourceQuote,source.field,{quote:true})}</div>`:''}${renderLimits(source.limits)}</section>`).join('')}
        <p>Retrieval and database processing dates describe record handling, not when clinical practice occurred.</p>
      </details>
    </article>`;
  };
  const rest=owned.filter(p=>p.id!==cited?.id),compare=(a,b)=>sourceLabel(a).localeCompare(sourceLabel(b),'en')||String(a.field||'').localeCompare(String(b.field||''),'en')||a.id.localeCompare(b.id,'en');
  const collection=groups.map(([key,label])=>{
    const items=rest.filter(p=>groupKey(p)===key).sort(compare);if(!items.length)return '';
    return `<details class="source-reader-group"><summary><span>${escape(label)}</span><span class="source-reader-count">${items.length} ${items.length===1?'passage':'passages'}</span></summary><div class="source-reader-group-content">${items.map(p=>article(p)).join('')}</div></details>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(candidate.name)} — stored source evidence</title><link rel="stylesheet" href="/expert-assets/styles.css"><script src="/expert-assets/source-reader.js" defer></script></head><body class="source-page source-reader">
    <header class="source-reader-header"><div class="source-reader-header-inner"><p class="source-reader-brand">DocMap</p><div class="source-reader-identity"><h1>${escape(candidate.name)}</h1><small>Stored source evidence</small></div><nav class="source-reader-navigation" aria-label="Source page navigation"><a href="/expert-discovery">Open Expert Discovery</a></nav></div></header>
    <main class="source-reader-main">${cited?`<section class="source-reader-selected" aria-label="Selected source passage">${article(cited,true)}</section>`:''}
      <section class="source-reader-collection" aria-labelledby="source-reader-collection-title"><h2 id="source-reader-collection-title">${cited?'Other stored evidence for this professional':'Stored evidence for this professional'}</h2>${collection?`<p class="source-reader-collection-note">Open a section to read the original passages and their source details.</p>${collection}`:`<p class="source-reader-empty">${cited?'No other passages are recorded for this professional.':'No source passages are available for this professional.'}</p>`}</section>
      <p class="source-reader-collection-note">To continue your existing search, switch back to its original tab.</p>
      ${corpusVersion?`<details class="source-reader-record"><summary>Evidence version</summary><p>Corpus: ${escape(corpusVersion)}<br>Profile projection: ${escape(profileVersion||'Not recorded')}${dataRelease?.releaseId?`<br>Data release: ${escape(dataRelease.releaseId)}`:''}</p>${legacyCitation?'<p>This legacy link opens the current evidence collection. The saved project retains the evidence recorded when it was saved.</p>':''}</details>`:''}
      <p class="source-reader-collection-note">Source dates describe the available record, not confirmation of current practice. An unknown source date cannot establish when the activity occurred. Stored professional evidence does not establish current registration, availability, independence or assessment approval.</p>
    </main></body></html>`;
}
module.exports={renderSourcePage,evidenceAnchor,originalLinks};
