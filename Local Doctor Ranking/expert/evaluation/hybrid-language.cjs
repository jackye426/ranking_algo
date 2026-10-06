'use strict';

// A bounded, transparent passage-language probe, not a full-directory benchmark.
// Fixed before scoring. No model API, credentials, Supabase read or remote download.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const enrichments = require('../enrichments.cjs');
const {BM25Index, tokens} = require('../search.cjs');
const ROOT = path.resolve(__dirname, '..');
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const THRESHOLD = 0.4;
const key = (source, field) => `${source}:${field}`;
const CT = [key('bupa_11411','targeted_public_profile'),key('bupa_14429','targeted_public_profile')];
const SKIN = [key('bupa_12291','targeted_public_profile'),key('spire_668','targeted_public_research')];
const QUERIES = Object.freeze([
  {id:'skin-exact',kind:'exact',query:'dermoscopy skin cancer diagnosis',expected:SKIN},
  {id:'skin-everyday',kind:'everyday',query:'Who checks suspicious moles using magnified pictures?',expected:SKIN},
  {id:'heart-exact',kind:'exact',query:'cardiac coronary CT',expected:CT},
  {id:'heart-everyday',kind:'everyday',query:'Who interprets pictures of arteries supplying the heart?',expected:CT,note:'An exploratory anatomical paraphrase, not an explicit request for CT. A retrieved CT passage does not establish that CT was intended.'},
  {id:'study-exact',kind:'exact',query:'MoleMate primary care diagnostic performance referral study',expected:[key('bupa_12291','targeted_publication')]},
  {id:'study-everyday',kind:'everyday',query:'Who helped study a tool that tells family doctors which unusual moles to send to hospital?',expected:[key('bupa_12291','targeted_publication')]},
  {id:'relationship-exact',kind:'exact',query:'Check 4 Cancer clinical advisor telemedicine',expected:[key('spire_668','targeted_public_relationship')]},
  {id:'relationship-everyday',kind:'everyday',query:'Who advises a business offering remote mole checks?',expected:[key('spire_668','targeted_public_relationship')]},
  {id:'vascular-exact',kind:'exact',query:'vascular radiology trials',expected:[key('bupa_11411','targeted_public_research')]},
  {id:'vascular-everyday',kind:'everyday',query:'Who takes part in studies about blood vessel scans?',expected:[key('bupa_11411','targeted_public_research')]},
  {id:'broad-research',kind:'broad',query:'clinical research',expected:[key('spire_668','targeted_public_research'),key('bupa_12291','targeted_publication'),key('bupa_11411','targeted_public_research')],note:'Deliberately broad: related research is not proof of a specific assessment task.'},
  {id:'negative-knee',kind:'negative',query:'robotic knee replacement surgery',expected:[],note:'No reviewed passage establishes this expertise. Any above-threshold result is a false positive for this probe.'}
].map(q=>Object.freeze({...q,expected:Object.freeze(q.expected)})));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const passages = () => enrichments.filter(e=>e.verified).map(e=>({id:key(e.sourceRecordId,e.field),sourceRecordId:e.sourceRecordId,field:e.field,type:e.type,text:e.text,excerpt:e.excerpt,sourceUrl:e.sourceUrl,sourceLabel:e.sourceLabel,sourceDate:e.sourceDate,limitations:e.review?.limitations||[]}));
function freeze() {
  const sourcePassages=passages();
  if(new Set(sourcePassages.map(p=>p.id)).size!==sourcePassages.length)throw new Error('Source keys are not unique.');
  if(QUERIES.some(q=>q.expected.some(id=>!sourcePassages.some(p=>p.id===id))))throw new Error('Unknown expected source key.');
  return {version:1,model:MODEL,semanticThreshold:THRESHOLD,querySetHash:hash(QUERIES),sourceHash:hash(sourcePassages),queries:QUERIES,passages:sourcePassages};
}
async function localEmbedder() {
  const runtime = await import('@huggingface/transformers');
  runtime.env.allowRemoteModels = false;
  runtime.env.allowLocalModels = true;
  runtime.env.localModelPath = path.resolve(ROOT,'../demo/.cache/models');
  runtime.env.cacheDir = runtime.env.localModelPath;
  const extract = await runtime.pipeline('feature-extraction',MODEL,{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
  return async texts => (await extract(texts,{pooling:'mean',normalize:true,truncation:true})).tolist();
}
const dot = (a,b) => a.reduce((sum,value,i)=>sum+value*b[i],0);
function compare(view, sourcePassages, queryVectors, passageVectors) {
  const items=sourcePassages.map(p=>({...p,text:view==='reviewed-summary'?p.text:p.excerpt}));
  const bm25=new BM25Index(items);
  return QUERIES.map((q,qi)=>{
    const lexical=bm25.search(q.query),lexicalScores=new Map(lexical.map((x,i)=>[x.index,{score:x.score,rank:i+1}]));
    const semantic=items.map((p,i)=>({index:i,score:dot(queryVectors[qi],passageVectors[i])})).sort((a,b)=>b.score-a.score||a.index-b.index);
    const semanticScores=new Map(semantic.map((x,i)=>[x.index,{score:x.score,rank:i+1}]));
    const admitted=semantic.filter(x=>x.score>=THRESHOLD);
    const fusion=new Map();
    for(const list of [lexical,admitted])list.forEach((hit,i)=>fusion.set(hit.index,(fusion.get(hit.index)||0)+1/(60+i+1)));
    const fusionRanks=new Map([...fusion].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([index,score],i)=>[index,{score,rank:i+1}]));
    const queryTokens=new Set(tokens(q.query));
    const scores=items.map((p,i)=>({id:p.id,expected:q.expected.includes(p.id),sharedTokens:[...new Set(tokens(p.text))].filter(t=>queryTokens.has(t)),bm25:lexicalScores.get(i)?.score||0,bm25Rank:lexicalScores.get(i)?.rank||null,cosine:semanticScores.get(i).score,semanticRank:semanticScores.get(i).rank,semanticAdmitted:semanticScores.get(i).score>=THRESHOLD,rrf:fusionRanks.get(i)?.score||0,rrfRank:fusionRanks.get(i)?.rank||null}));
    const best=(method,admittedOnly)=>scores.filter(s=>s.expected&&(!admittedOnly||s.semanticAdmitted)&&s[method]!==null).sort((a,b)=>a[method]-b[method])[0]||null;
    return {...q,scores,bestExpectedBM25:best('bm25Rank'),bestExpectedSemantic:best('semanticRank',true),bestExpectedRRF:best('rrfRank'),zeroOverlapSemantic:scores.filter(s=>s.expected&&s.sharedTokens.length===0&&s.semanticAdmitted).map(s=>s.id),falsePositiveSemantic:q.expected.length?[]:scores.filter(s=>s.semanticAdmitted).map(s=>s.id)};
  });
}
const escape = value => String(value??'').replace(/\|/g,'\\|');
function markdown(report) {
  const summary=report.results['reviewed-summary'];
  const sensitivity=report.results['literal-excerpt'];
  const positive=summary.filter(q=>q.expected.length);
  const zero=summary.filter(q=>q.zeroOverlapSemantic.length);
  const strongestTarget = (queries,id) => queries.find(q=>q.id===id).scores.filter(s=>s.expected).sort((a,b)=>b.cosine-a.cosine)[0];
  const value = (queries,id) => strongestTarget(queries,id).cosine.toFixed(4);
  const rank = (x,method) => x[method]?String(x[method][method==='bestExpectedBM25'?'bm25Rank':method==='bestExpectedSemantic'?'semanticRank':'rrfRank']):'—';
  const lines=['# What semantic retrieval contributes','',`Recorded ${report.recordedAt}. This bounded offline probe uses ${report.passages.length} reviewed public-source passages and ${report.queries.length} fixed queries. No paid model, remote download, Supabase connection or private project data was used.`,
    '', '**This is evidence about language matching, not demonstrated aggregate ranking uplift.** The separate full development evaluation currently reports the same 91.7% known-candidate recall and 100% central-result precision for hybrid and BM25 retrieval, with no uniquely semantic candidate in its top 20. This small probe does not replace that result.',
    '', '## Method', '', '- Freeze five exact-term / everyday-language pairs before scoring, plus broad research and an unrelated knee-surgery control. No query is removed after seeing its score. The expected passage keys are a disclosed, manually defined probe target, not independent held-out labels.',
    '- Use the production BM25 implementation (k1=1.5, b=0.75), including its stopwords and token aliases. Use the existing quantized local all-MiniLM-L6-v2 model, mean pooling and normalized vectors. Cosine ≥0.40 uses the production passage-admission threshold.',
    '- Score every query against every passage. Show RRF (k=60) as an illustrative passage fusion. The full system also decomposes requirements, expands known concepts, checks evidence scope and reranks candidates; those steps are deliberately excluded here to isolate lexical and embedding behavior.',
    '- Run the same fixed queries twice: reviewed source summaries, then literal supporting excerpts only. Reviewed summaries are human source-grounded paraphrases, not verbatim quotations. Some literal excerpts are very short and cannot carry the full reviewed context.',
    '- A cosine is similarity, not confidence or proof. “Admitted” means available for later evidence checks, never that the professional fulfils the requirement.',
    '', `Query-set SHA-256: \`${report.querySetHash}\`. Source SHA-256: \`${report.sourceHash}\`. Model: \`${report.model}\`.`,
    '', '## All query outcomes', '', 'Ranks below show the best expected passage. A dash means no expected passage was retrieved by BM25, or no expected semantic passage reached 0.40. Semantic rank is among all passages, including those below the admission threshold.', '', '| Query | BM25 rank | Semantic rank | Fused rank | Literal-only BM25 / semantic rank | Zero-overlap semantic target |', '| --- | ---: | ---: | ---: | --- | --- |'];
  for(const q of summary){const literal=sensitivity.find(x=>x.id===q.id);lines.push(`| ${escape(q.query)} | ${rank(q,'bestExpectedBM25')} | ${rank(q,'bestExpectedSemantic')} | ${rank(q,'bestExpectedRRF')} | ${rank(literal,'bestExpectedBM25')} / ${rank(literal,'bestExpectedSemantic')} | ${q.zeroOverlapSemantic.join(', ')||'—'} |`);}
  lines.push('',`Across the ${positive.length} non-negative probe queries, BM25 retrieved at least one expected passage for ${positive.filter(q=>q.bestExpectedBM25).length}; semantic retrieval admitted at least one for ${positive.filter(q=>q.bestExpectedSemantic).length}. These are small, preselected passage-probe counts, not general search recall. ${zero.length} queries admitted an expected passage with **zero shared normalized keyword tokens**.`,
    '', '## What actually happened', '',
    `- **A real vocabulary bridge:** “arteries supplying the heart” reached the coronary-CT passage at cosine ${value(summary,'heart-everyday')}; “blood vessel scans” reached vascular-radiology research at ${value(summary,'vascular-everyday')}. Both had BM25 0 and zero shared normalized tokens. The bridge also appeared in the literal-excerpt run (${value(sensitivity,'heart-everyday')} and ${value(sensitivity,'vascular-everyday')}).`,
    `- **An ordering benefit in this small corpus:** the family-doctor / unusual-moles study request ranked the MoleMate summary second with BM25 and first with MiniLM (cosine ${value(summary,'study-everyday')}). Its one shared token was “study”; this is improved passage selection, not a new candidate discovered in the full directory.`,
    `- **Two everyday requests failed:** the suspicious-moles / magnified-pictures request’s strongest expected summary scored ${value(summary,'skin-everyday')}, and the remote-mole-checks advisory request scored ${value(summary,'relationship-everyday')}. Neither reached 0.40, and BM25 found neither expected target. The latter was the most similar passage but still below threshold; a high relative rank does not make weak evidence acceptable.`,
    '- **Fusion can worsen a passage’s order:** vascular research was semantic rank 1 but illustrative RRF rank 2 because a different passage received lexical credit for the generic word “study”. In the literal-only relationship case, BM25 found the advisory excerpt first, while semantic retrieval admitted a telemedicine-research excerpt instead; fusion moved the actual advisory target to second. This supports retaining requirement-specific evidence checks after retrieval.',
    `- **Missing context stays missing:** “Paul Norris” alone scored ${value(sensitivity,'study-exact')} for the exact trial query and ${value(sensitivity,'study-everyday')} for the everyday study query. The reviewed study summary carried information absent from that short quotation. A fuller source passage would be preferable where available; these results must not be attributed to embeddings alone.`,
    `- **The negative control was rejected:** no passage reached 0.40 for robotic knee-replacement surgery. Maximum cosine was ${Math.max(...summary.find(q=>q.id==='negative-knee').scores.map(s=>s.cosine)).toFixed(4)} for summaries and ${Math.max(...sensitivity.find(q=>q.id==='negative-knee').scores.map(s=>s.cosine)).toFixed(4)} for literal excerpts. One negative query is not a general false-positive-rate estimate.`,
    '', '## Interpretation and limits', '', 'The exact-term queries test that keyword search remains valuable. Everyday paraphrases test whether a related passage can enter the candidate pool without the user reproducing its vocabulary. The literal-only run exposes dependence on available context: a supporting quote consisting only of “Paul Norris” cannot communicate the trial, setting or role. Neither retrieval path can reconstruct missing evidence.', '', 'The coronary paraphrase mentions heart arteries but does not specify CT. A related CT passage is an exploratory lead, not authority to invent the intended modality. Similarly, “research” is broad and historical coauthorship is not individual diagnostic-study appraisal. Advisory relationship evidence is a prompt for review, not a conflict determination.', '', 'Keep the claim narrow: local semantic retrieval can bridge some everyday phrases to related professional passages, while exact terms remain strong for BM25. This probe exposes both missed paraphrases and fusion errors; it does not establish that the overall shortlist is better. A larger independent assessment with varied language and hard negatives is needed before that claim.', '', 'Detailed successes, misses and negative-control scores are retained below. No change to production thresholds or query rules was made based on this probe.', '', '## Source inventory', '');
  for(const p of report.passages)lines.push(`- **${p.id}** · ${p.type} · [${p.sourceLabel}](${p.sourceUrl}).`, `  - Reviewed summary: ${p.text}`, `  - Exact supporting excerpt: “${p.excerpt}”`, `  - Limits: ${p.limitations.join(' ')}`);
  for(const [view,queries]of Object.entries(report.results)){
    lines.push('',`## Every score: ${view}`, '', 'BM25 and cosine are on different scales and must not be compared numerically to each other. “Expected” means the predeclared probe target. BM25 0 has no rank; the negative control has no expected target.');
    for(const q of queries){
      lines.push('',`### ${q.id}`, '', q.query, '', ...(q.note?[q.note,'']:[]), '| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |', '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |');
      for(const s of q.scores)lines.push(`| ${s.id} | ${s.expected?'Yes':'No'} | ${s.sharedTokens.join(', ')||'None'} | ${s.bm25.toFixed(4)} | ${s.bm25Rank||'—'} | ${s.cosine.toFixed(4)} | ${s.semanticRank} | ${s.semanticAdmitted?'Yes':'No'} | ${s.rrfRank||'—'} |`);
    }
  }
  lines.push('', '## Reproduce', '', 'From `Local Doctor Ranking/` after the local embedding model has been cached:', '', '```powershell', 'node expert/evaluation/hybrid-language.cjs --freeze-only', 'node expert/evaluation/hybrid-language.cjs', '```', '', 'The runner refuses remote model downloads. The frozen query/source manifest and complete machine-readable report are saved in the ignored expert cache; this document contains every query and every passage score. No production index is read or overwritten.', '');
  return lines.join('\n');
}
async function main() {
  const manifest=freeze();
  const cacheDir=path.join(ROOT,'.cache/hybrid-language');
  fs.mkdirSync(cacheDir,{recursive:true});
  const manifestPath=path.join(cacheDir,'manifest.json');
  if(process.argv.includes('--freeze-only')){fs.writeFileSync(manifestPath,JSON.stringify({...manifest,frozenAt:new Date().toISOString()},null,2));console.log(JSON.stringify({frozen:true,queries:QUERIES.length,passages:manifest.passages.length,querySetHash:manifest.querySetHash,sourceHash:manifest.sourceHash}));return;}
  if(!fs.existsSync(manifestPath))throw new Error('Freeze the query/source manifest with --freeze-only before scoring.');
  const frozen=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(frozen.querySetHash!==manifest.querySetHash||frozen.sourceHash!==manifest.sourceHash)throw new Error('Frozen query set or public sources changed. Review before freezing a new probe; preserve prior results.');
  const started=performance.now(),embed=await localEmbedder();
  const queryVectors=await embed(QUERIES.map(q=>q.query));
  const summaryVectors=await embed(manifest.passages.map(p=>p.text));
  const literalVectors=await embed(manifest.passages.map(p=>p.excerpt));
  const report={...frozen,recordedAt:new Date().toISOString(),elapsedMs:Math.round(performance.now()-started),results:{'reviewed-summary':compare('reviewed-summary',manifest.passages,queryVectors,summaryVectors),'literal-excerpt':compare('literal-excerpt',manifest.passages,queryVectors,literalVectors)}};
  fs.writeFileSync(path.join(cacheDir,'results.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(ROOT,'docs/HYBRID_CONTRIBUTION.md'),markdown(report));
  console.log(JSON.stringify({queries:QUERIES.length,passages:manifest.passages.length,elapsedMs:report.elapsedMs,results:Object.entries(report.results).map(([view,queries])=>({view,queries:queries.map(q=>({id:q.id,bm25:q.bestExpectedBM25?.bm25Rank||null,semantic:q.bestExpectedSemantic?.semanticRank||null,zeroOverlapSemantic:q.zeroOverlapSemantic,falsePositiveSemantic:q.falsePositiveSemantic}))}))},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={QUERIES,freeze,compare,markdown};
