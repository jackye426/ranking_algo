'use strict';

// Opt-in live-model verification. Uses fictional briefs and four freshly reviewed public
// professional-profile anchors only; no Supabase cache is opened. Never reads or prints a credential value.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {buildCorpus} = require('../data.cjs');
const enrichments = require('../enrichments.cjs');
const {parseBrief} = require('../brief.cjs');
const {ExpertSearchEngine} = require('../search.cjs');
const {createExpertAI, snapshot, validateDraft, createWireContext} = require('../ai.cjs');
const root = path.resolve(__dirname, '..');
const PUBLIC_PROFILES = [
  {anchor:'bupa_11411',id:'public-neghal-kandiyil',name:'Dr Neghal Kandiyil',role:'Consultant Radiologist',specialty:'Clinical radiology',url:'https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157'},
  {anchor:'bupa_14429',id:'public-sanjay-banypersad',name:'Dr Sanjay Banypersad',role:'Consultant Cardiologist',specialty:'Cardiology',url:'https://www.circlehealthgroup.co.uk/consultants/sanjay-banypersad'},
  {anchor:'bupa_12291',id:'public-paul-norris',name:'Dr Paul Norris',role:'Consultant Dermatologist',specialty:'Dermatology',url:'https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/dr-paul-norris-c2720966/'},
  {anchor:'spire_668',id:'public-per-hall',name:'Mr Per Hall',role:'Consultant Plastic Surgeon',specialty:'Plastic surgery',url:'https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/'}
];
const model = 'deepseek/deepseek-v3.2';
const cases = [
  {
    id: 'cardiac-clinical-comparison', kind: 'comparison', sourceIds: ['public-neghal-kandiyil', 'public-sanjay-banypersad'],
    message: 'We are assessing software that analyses cardiac CT scans to support assessment of coronary artery disease in adults. Compare UK clinicians who could help examine the clinical relevance of its outputs and the consequences of incorrect results. Current clinical practice is essential; regulatory experience is optional.',
    reviewFocus: 'Distinguish documented imaging experience without inferring current activity, regulatory competence, or a winner.'
  },
  {
    id: 'dermoscopy-study-evidence', kind: 'explanation', sourceIds: ['public-paul-norris'],
    message: 'We are assessing skin-lesion imaging software using dermoscopy in primary care. Find UK clinical expertise to help us examine the evidence behind diagnostic accuracy and how results could affect referrals. Experience evaluating diagnostic studies is preferred. Regulatory experience is optional.',
    reviewFocus: 'Keep the historical MoleMate trial contribution distinct from current practice or formal regulatory assessment.'
  },
  {
    id: 'outside-specialist-setting-relationship', kind: 'explanation', sourceIds: ['public-per-hall'],
    message: 'We are assessing skin-lesion imaging software for use outside a specialist clinical setting by non-specialist users. We need expertise to examine the consequences of missed lesions and what should prompt referral. Research experience is preferred. Manufacturer: Check 4 Cancer. Home-use validation and current practice must be confirmed.',
    reviewFocus: 'Do not infer home-use validation. Surface the recorded advisory relationship as a review question, not independence or a conflict determination.'
  }
];
const hash = value => createHash('sha256').update(value).digest('hex');
const codeHash = () => hash(['ai.cjs','brief.cjs','search.cjs','data.cjs','enrichments.cjs'].map(file => fs.readFileSync(path.join(root,file),'utf8')).join('\n'));
const loadedCodeHash=codeHash();
function readAnchors() {
  // Names, professional roles and URLs above were freshly checked on the public
  // pages on 2026-10-06. Existing database anchor labels are local mapping keys
  // only; none is placed in the model context. No raw.json or Supabase read.
  const rows=PUBLIC_PROFILES.map(p=>({id:p.id,name:p.name,professional_role:p.role,specialty:p.specialty,profile_urls:{reviewed_public_profile:p.url}}));
  const publicEnrichments=enrichments.filter(e=>e.verified===true&&e.review?.method?.includes('page-review')).map(e=>{
    const profile=PUBLIC_PROFILES.find(p=>p.anchor===e.sourceRecordId);
    if(!profile)throw new Error('Unexpected enrichment identity.');
    return {...e,sourceRecordId:profile.id,registration:undefined,review:{method:e.review.method,limitations:e.review.limitations},identityBasis:'Name, role and profile URL checked on the public source page.'};
  });
  return {rows,enrichments:publicEnrichments,fetchedAt:'2026-10-06'};
}
async function prepareCases() {
  const raw = readAnchors();
  const corpus = buildCorpus(raw.rows, {enrichments:raw.enrichments});
  // Model-bound evidence must be only the freshly reviewed public additions,
  // never even a reconstructed metadata passage from a database projection.
  corpus.passages=corpus.passages.filter(p=>p.attribution==='verified-source'&&p.reviewedParaphrase===true&&p.sourceQuote&&p.sourceRecordId.startsWith('public-'));
  for(const candidate of corpus.candidates)candidate.evidenceIds=corpus.passages.filter(p=>p.candidateId===candidate.id).map(p=>p.id);
  corpus.audit.passages=corpus.passages.length;
  const runtime=await import('@huggingface/transformers');
  runtime.env.allowRemoteModels=false;runtime.env.allowLocalModels=true;
  runtime.env.localModelPath=path.resolve(root,'../demo/.cache/models');runtime.env.cacheDir=runtime.env.localModelPath;
  const embedder=await runtime.pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
  const embedQuery=async texts=>(await embedder(texts,{pooling:'mean',normalize:true,truncation:true})).tolist();
  const engine = new ExpertSearchEngine({cacheDir:path.join(root,'.cache/model-verification-index'),embedQuery});
  await engine.init(corpus);
  const prepared = [];
  for (const scenario of cases) {
    const parsed = parseBrief({message:scenario.message});
    if (parsed.needsClarification) throw new Error(scenario.id + ': brief requires clarification.');
    const retrieval = await engine.search(parsed.brief);
    const candidates = scenario.sourceIds.map(sourceId => retrieval.results.find(c => c.sourceRecordIds.includes(sourceId)));
    if (candidates.some(c => !c)) throw new Error(scenario.id + ': an intended source anchor was not retrieved.');
    const input = {kind:scenario.kind, brief:parsed.brief, candidates};
    if(candidates.some(c=>!PUBLIC_PROFILES.some(p=>p.name===c.name)||c.evidence.some(e=>e.attribution!=='verified-source'||!e.reviewedParaphrase||!e.sourceQuote||!e.sourceRecordId.startsWith('public-'))))throw new Error('Public-only model boundary failed.');
    prepared.push({scenario,input,context:snapshot(input),diagnostics:retrieval.diagnostics});
  }
  return {prepared,corpusVersion:corpus.version,corpusAudit:corpus.audit,fetchedAt:raw.fetchedAt};
}
function trackedClient() {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured privately. No live request made.');
  const OpenAI = require('openai');
  const real = new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:'https://openrouter.ai/api/v1',timeout:15000,maxRetries:0});
  const calls = [];
  const client = {chat:{completions:{create:async (...args) => {
    const request = args[0], started = performance.now();
    const record = {name:request.response_format?.json_schema?.name,model:request.model,startedAt:new Date().toISOString()};
    calls.push(record);
    try {
      const response = await real.chat.completions.create(...args);
      record.durationMs = Math.round(performance.now()-started);
      record.responseModel = response.model;
      record.finishReason = response.choices?.[0]?.finish_reason;
      record.usage = response.usage;
      const content = response.choices?.[0]?.message?.content;
      try { record.structuredOutput = JSON.parse(content); } catch { record.invalidJSON = true; }
      return response;
    } catch (error) {
      record.durationMs = Math.round(performance.now()-started);
      const safeMessage=String(error.message||'').replaceAll(process.env.OPENROUTER_API_KEY,'[redacted]').replace(/(?:Bearer\s+|sk-)[a-zA-Z0-9_-]+/g,'[redacted]').slice(0,400);
      record.error = {name:error.name,status:error.status||null,code:error.code||null,message:safeMessage};
      throw error;
    }
  }}}};
  return {client,calls};
}
async function verifyCase(prepared) {
  const {client,calls} = trackedClient();
  const generate = createExpertAI({client,model});
  const started = performance.now();
  const answer = await generate(prepared.input);
  const durationMs = Math.round(performance.now()-started);
  const context = prepared.context;
  const cited = (answer.sections||[]).flatMap(section => section.evidenceIds.map(id => ({candidateId:section.candidateId,id})));
  const generated=calls.find(call=>call.name==='expert_evidence_explanation')?.structuredOutput;
  // The provider returns request-local short IDs. Rehydrate using the exact
  // selected source snapshot before validating canonical ownership. Prior
  // report entries are immutable observations of their earlier wire format.
  let canonicalGenerated=null;
  if(generated)try{canonicalGenerated=createWireContext(context).decodeDraft(generated);}catch{}
  const checks = {
    realDeepSeek:answer.provider==='deepseek' && answer.model===model,
    generatedSchemaValid:!!canonicalGenerated&&validateDraft(canonicalGenerated,context),
    separateSupportCheck:calls.some(call=>call.name==='expert_support_check'),
    independentSupportCheckPassed:calls.some(call=>call.name==='expert_support_check'&&Array.isArray(call.structuredOutput?.unsupportedClaims)&&call.structuredOutput.unsupportedClaims.length===0),
    sourceOwnership:cited.length>0&&cited.every(citation=>context.candidates.find(c=>c.id===citation.candidateId)?.evidence.some(e=>e.id===citation.id&&e.candidateId===citation.candidateId)),
    finalSchemaAndProhibitedClaimChecks:answer.provider==='deepseek'&&validateDraft({summary:answer.summary,sections:answer.sections},context),
    withinDeadline:durationMs<=15500,
    noModelAuthoredReviewState:prepared.input.candidates.every(c=>c.qualificationStatus==='not-reviewed'&&c.relationshipStatus==='not-reviewed')
  };
  return {id:prepared.scenario.id,kind:prepared.scenario.kind,brief:prepared.scenario.message,requirements:context.brief.requirements,reviewFocus:prepared.scenario.reviewFocus,attemptedAt:new Date().toISOString(),codeHash:loadedCodeHash,wireFormat:'request-local-alias-v1',durationMs,checks,passed:Object.values(checks).every(Boolean),calls,
    provider:answer.provider,model:answer.model||null,retryable:answer.retryable,notice:answer.notice,summary:answer.summary,sections:answer.sections,
    generatedSectionWords:(generated?.sections||[]).map(section=>section.text?.split(/\s+/).length||0),
    candidates:context.candidates.map(c=>({id:c.id,name:c.name,role:c.role,evidence:c.evidence,gaps:c.gaps,requirements:c.requirements})),diagnostics:prepared.diagnostics};
}
function markdown(report) {
  const latest = cases.map(c => report.attempts.filter(a=>a.id===c.id).at(-1)).filter(Boolean);
  const accepted=cases.map(c=>report.attempts.filter(a=>a.id===c.id&&a.passed).at(-1)).filter(Boolean);
  const releasePassed=accepted.length===cases.length;
  const clean = value => String(value||'').replace(/\|/g,'\\|');
  const lines = ['# DeepSeek verification','',`Recorded ${report.updatedAt}. Model: \`${model}\` through OpenRouter.`,
    '', `**Release criterion: ${releasePassed?'met':'not met'} — ${accepted.length}/${cases.length} distinct briefs have a fully verified response within the 15-second pipeline deadline.**`, '', 'This is a live generation-and-grounding check on four source-bound public professional records and three fictional, non-confidential briefs. It is not a full-directory retrieval evaluation or a clinical qualification decision.',
    '', '| Scenario | Outcome | End-to-end time | Generator / independent check |', '| --- | --- | --- | --- |',
    ...latest.map(a=>`| ${a.id} | ${a.passed?'Verified DeepSeek response':a.provider==='deepseek'?'Model response; check failed':'Sourced fallback'} | ${(a.durationMs/1000).toFixed(2)} s | ${a.calls.map(c=>`${c.name}: ${(c.durationMs/1000).toFixed(2)} s${c.error?' ('+c.error.name+')':''}`).join(' / ')} |`),
    '', `Successful latest attempts: ${latest.filter(a=>a.passed).length}/${cases.length}; distinct briefs with an earlier or current verified response: ${accepted.length}/${cases.length}. Total public-only model call attempts recorded: ${report.attempts.reduce((n,a)=>n+a.calls.length,0)}.`,
    '', '## Source boundary and interrupted preliminary check','', 'The first sandbox connection attempts returned connection errors and sourced fallbacks. A subsequent approved escalation was interrupted immediately when a separate automatic-review restriction was received; it produced no received model result, but the first request may already have been transmitted. That configuration is not retried. This report’s subsequent verification uses only fresh public-page evidence and public-profile identity, with a runtime guard against other source passages.', '', '## Method','',
    '- Build a small corpus only from freshly reviewed public profiles and existing manually reviewed public enrichments for Kandiyil, Banypersad, Norris and Hall. No Supabase rows or cache fields are read by this verification script. Local legacy anchor labels are replaced by public-source identifiers before model input.',
    '- Use actual BM25 and the existing local all-MiniLM-L6-v2 embeddings to retrieve evidence and construct requirement matrices. The small-corpus cache is separate from the full index.',
    '- Call the production createExpertAI pipeline: one DeepSeek generation followed by a separate DeepSeek support check, sharing its 15-second deadline. Provider responses, schema checks, source ownership and timings are recorded.',
    '- Distinguish reviewed source summaries from exact quoted passages; current practice, availability, formal assessor approval and independence are not established by a professional profile.',
    '- Keys are loaded privately through dotenv; logs contain no key, authorisation header or confidential dossier information.',
    '', '## Concrete changes and remaining blocker', '', 'The first public run found duplicate sections for one candidate and a verifier timeout. The next version added exact JSON-schema candidate cardinality, shorter paragraphs, lower output budgets and explicit limits on historical coauthorship. A final revision selected latency routing for expert calls and removed redundant checker context while retaining cited passages, their source dates, scope qualifiers, full reviewed-source limitations, requirements and gaps. Independent verification and the shared 15-second deadline were retained throughout.', '', 'OpenRouter documents `sort: latency` as preferring low-latency providers; the expert path now uses it while retaining the existing privacy and maximum-price controls. [Official provider routing documentation](https://openrouter.ai/docs/guides/routing/provider-selection).', '', ...(report.connectivity?[`A separate unauthenticated OpenRouter models request returned HTTP ${report.connectivity.status} in ${report.connectivity.durationMs} ms. This confirms gateway connectivity, not inference speed. The unsuccessful final calls timed out in the generation path; the observations cannot separate provider queues, routing overhead and model execution.`, '']:[]), 'The three-brief release criterion remains blocked unless all three have a verified response. No automatic retry loop, longer deadline, weaker support check or different model is substituted.', '', '## Results'];
  for (const last of latest) {
    const a=accepted.find(item=>item.id===last.id)||last;
    lines.push('',`### ${a.id}`, '', ...(a!==last?['The example below passed in an earlier attempt. The most recent attempt timed out and displayed the sourced fallback.','']:[]), `Fictional brief: ${a.brief}`, '', `Review focus: ${a.reviewFocus}`, '', `Outcome: **${a.passed?'Verified model response':'Fallback / verification did not pass'}**. Provider reported by the application: \`${a.provider}\`.`, '', a.summary);
    for (const section of a.sections||[]) {
      const candidate=a.candidates.find(c=>c.id===section.candidateId);
      lines.push('',`**${candidate?.name||section.candidateId}**`, '', section.text, '', 'Supporting evidence:');
      for(const id of section.evidenceIds||[]) {
        const e=candidate?.evidence.find(e=>e.id===id);
        if(e)lines.push(`- \`${id}\` · ${e.type} · ${e.field} · ${e.reviewedParaphrase?'reviewed source summary':'stored source passage'}${e.sourceUrl?' · [Source]('+e.sourceUrl+')':''}. Source date: ${e.dates?.sourceDate||'not recorded'}.`);
      }
    }
    if (a.notice) lines.push('',`Application notice: ${a.notice}`);
    lines.push('',`Checks: ${Object.entries(a.checks).map(([key,value])=>key+'='+value).join('; ')}.`);
    const failures=a.calls.flatMap(c=>c.structuredOutput?.unsupportedClaims||[]);
    if(failures.length)lines.push('',`Independent checker rejection: ${failures.join(' ')}`);
  }
  lines.push('', '## Complete public-only attempt history', '', '| Brief | Attempt | Outcome | Total | Generator | Independent check | Code fingerprint |', '| --- | --- | --- | --- | --- | --- | --- |');
  const counts={};for(const a of report.attempts){const n=(counts[a.id]||0)+1;counts[a.id]=n;const generation=a.calls.find(c=>c.name==='expert_evidence_explanation'),check=a.calls.find(c=>c.name==='expert_support_check');lines.push(`| ${a.id} | ${n} | ${a.passed?'Verified':generation?.error?'Generation timeout/error':check?.error?'Checker timeout/error':'Validation rejected'} | ${(a.durationMs/1000).toFixed(2)} s | ${generation?(generation.durationMs/1000).toFixed(2)+' s':'—'} | ${check?(check.durationMs/1000).toFixed(2)+' s':'Not reached'} | \`${a.codeHash.slice(0,10)}\` |`);}
  lines.push('', '## Manual grounding review', '', 'The accepted cardiac comparison attributes CT experience to the correct public profile, distinguishes the recorded radiology and cardiology roles, and leaves current practice, population scope, location and regulatory experience unconfirmed. Its optional-regulatory gap is overemphasised in the older wording; the revised prompt now prioritises essential unknowns. The initial Norris draft overstated coauthorship as diagnostic-study evaluation experience, but it never passed the independent pipeline and was not displayed. The initial Hall draft duplicated the candidate section and was rejected locally. No final Norris or Hall model answer was accepted.', '', '## Limits', '', 'Successful support checks are evidence of this small verification run, not a guarantee against all model errors. The separate frozen full-corpus evaluation measures retrieval. Public profile dates are often absent, and historical study contributions do not establish current work or formal regulatory assessment competence. Outreach remains an editable preparation draft and is never sent by this pipeline.', '', 'Raw professional evidence, complete structured responses and per-call timings remain in the ignored local cache at `expert/.cache/model-verification-public.json`.', '');
  return lines.join('\n');
}
function roundMarkdown(report){
  const complete=report.attempts.filter(a=>!a.pending),passed=complete.filter(a=>a.passed),calls=complete.flatMap(a=>a.calls||[]);
  const lines=['# DeepSeek short-alias verification round','',`Round: \`${report.round}\`. Recorded ${report.updatedAt}. Model: \`${model}\` through OpenRouter.`,
    '',`**Outcome: ${passed.length}/3 distinct briefs passed generation, canonical source-ownership validation and the independent support check within the measured deadline.**`,
    '', 'This is one fresh round after replacing long internal identifiers with request-local aliases. It permits exactly one attempt per brief and at most six model calls in total, with no automatic retries. The earlier local result remains **1/3 distinct briefs verified**; its failures, timings and attempt caps are unchanged. See [the earlier report](MODEL_VERIFICATION.md).',
    '', `This round recorded ${calls.length} model-call attempts; ${report.attempts.filter(a=>a.pending).length} pending/interrupted attempt reservations remain. Only four freshly reviewed public professional identities and public-source passages were used. The briefs are fictional. No Supabase cache, project notes or private assessment dossier was read. Local MiniLM preparation forbids remote model downloads.`,
    '', '| Brief | Outcome | Total | Generation | Independent check | Completion tokens: generation / check |', '| --- | --- | ---: | --- | --- | --- |'];
  for(const a of report.attempts){const gen=a.calls?.find(c=>c.name==='expert_evidence_explanation'),check=a.calls?.find(c=>c.name==='expert_support_check'),time=c=>c?`${(c.durationMs/1000).toFixed(2)} s${c.error?' · '+c.error.name:''}`:'Not reached';lines.push(`| ${a.id} | ${a.pending?'Interrupted/pending; do not retry':a.passed?'Verified DeepSeek':'Sourced fallback'} | ${a.durationMs?(a.durationMs/1000).toFixed(2)+' s':'Unknown'} | ${time(gen)} | ${time(check)} | ${gen?.usage?.completion_tokens??'—'} / ${check?.usage?.completion_tokens??'—'} |`);}
  lines.push('', `Received structured generation responses: ${calls.filter(c=>c.name==='expert_evidence_explanation'&&c.structuredOutput).length}. Independent support checks reached: ${calls.filter(c=>c.name==='expert_support_check').length}. Generation aborts: ${calls.filter(c=>c.name==='expert_evidence_explanation'&&c.error?.name==='AbortError').length}. ${passed.length===3?'The three-brief criterion passed in this round.':'The three-brief live criterion remains unmet. This round does not demonstrate a latency improvement; no extra attempts were made.'}`);
  lines.push('', '## What changed and what stayed fixed', '', 'Short candidate/evidence aliases reduce identifier copying in the model wire format. Unknown aliases, duplicate sections, aliases owned by another candidate and full-ID spoofing are rejected. The response is restored to canonical IDs and validated before an independent support check. Both model calls retain the same source text, quotes, dates, qualifiers, full review limitations, current-practice gaps and requested scope. Both calls share the existing 15-second abort signal. Model/provider, paragraph bounds and support standards are unchanged.', '', 'This uncontrolled three-brief round cannot establish the cause of any latency difference. Provider queues, routing and response content can vary; no improvement percentage is claimed. A sourced fallback is an unsuccessful AI verification, even when the underlying search and evidence presentation remain usable.');
  for(const a of complete){lines.push('',`## ${a.id}`, '', `Fictional brief: ${a.brief}`, '', `Outcome: ${a.passed?'verified model response':'sourced fallback; criterion failed'}. ${a.notice||''}`, '', `Checks: ${Object.entries(a.checks).map(([key,value])=>key+'='+value).join('; ')}.`, '', a.summary||'');for(const section of a.sections||[]){const candidate=a.candidates.find(c=>c.id===section.candidateId);lines.push('',`**${candidate?.name||section.candidateId}**`, '',section.text);for(const id of section.evidenceIds||[]){const e=candidate?.evidence.find(e=>e.id===id);if(e)lines.push(`- \`${id}\` · ${e.type} · [${e.sourceLabel||'Supporting record'}](${e.sourceUrl}) · source date ${e.dates?.sourceDate||'not recorded'}.`);}}const rejected=a.calls.flatMap(c=>c.structuredOutput?.unsupportedClaims||[]);if(rejected.length)lines.push('',`Independent checker rejected: ${rejected.join(' ')}`);}
  lines.push('', '## Audit details', '', `Code SHA-256: \`${report.codeHash}\`. Corpus: \`${report.corpusVersion}\`.`, '', 'Canonical citations are returned by the application; aliases are confined to individual model requests. Raw structured responses, source snapshots, checks and per-call timings are retained in the ignored local cache at `expert/.cache/model-verification-public-aliases-v1.json`. This report does not certify clinical competence, current practice, availability, formal assessment approval or independence.', '');
  return lines.join('\n');
}
async function main() {
  require('dotenv').config({path:path.join(root,'../.env.local'),quiet:true});
  require('dotenv').config({path:path.join(root,'.env.local'),quiet:true,override:true});
  const prepared=await prepareCases();
  console.log(JSON.stringify({preparedCases:prepared.prepared.map(p=>({id:p.scenario.id,names:p.context.candidates.map(c=>c.name),evidence:p.context.candidates.map(c=>c.evidence.length),bm25:p.diagnostics.bm25Candidates,semantic:p.diagnostics.semanticCandidates})),corpusVersion:prepared.corpusVersion,passages:prepared.corpusAudit.passages}));
  if(process.argv.includes('--prepare-only'))return;
  const round=process.argv.find(arg=>arg.startsWith('--round='))?.slice(8);
  if(round){
    if(round!=='aliases-v1')throw new Error('Only the explicitly bounded aliases-v1 round is supported.');
    if(process.argv.some(arg=>arg==='--repeat'||arg.startsWith('--case=')))throw new Error('The aliases-v1 round runs all three distinct briefs once, without selective retries.');
    const output=path.join(root,'.cache/model-verification-public-aliases-v1.json'),doc=path.join(root,'docs/MODEL_VERIFICATION_ALIASES.md');
    if(fs.existsSync(output))throw new Error('The aliases-v1 round was already started. Its attempts are immutable; no repeat is permitted.');
    const report={version:1,round,codeHash:loadedCodeHash,attempts:[],corpusVersion:prepared.corpusVersion,sourceFetchedAt:prepared.fetchedAt,updatedAt:new Date().toISOString()};
    fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});
    for(const item of prepared.prepared){
      // Reserve before transmission so an interruption cannot cause a hidden retry.
      report.attempts.push({id:item.scenario.id,pending:true,attemptedAt:new Date().toISOString(),calls:[]});
      report.updatedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2));fs.writeFileSync(doc,roundMarkdown(report));
      const result=await verifyCase(item);report.attempts[report.attempts.length-1]=result;
      report.updatedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2));fs.writeFileSync(doc,roundMarkdown(report));
      console.log(JSON.stringify({round,id:result.id,provider:result.provider,passed:result.passed,durationMs:result.durationMs,checks:result.checks,calls:result.calls.map(c=>({name:c.name,ms:c.durationMs,error:c.error,unsupportedClaims:c.structuredOutput?.unsupportedClaims}))}));
    }
    return;
  }
  const output=path.join(root,'.cache/model-verification-public.json');
  const report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{version:1,attempts:[]};
  const chosen=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
  for(const item of prepared.prepared.filter(p=>!chosen||p.scenario.id===chosen)) {
    const previous=report.attempts.filter(a=>a.id===item.scenario.id);
    if(previous.length>=3)throw new Error('At most three attempts per brief are allowed. Review the recorded failure.');
    if(previous.at(-1)?.passed&&!process.argv.includes('--repeat')){console.log(JSON.stringify({id:item.scenario.id,status:'already-verified'}));continue;}
    const attempt=await verifyCase(item);report.attempts.push(attempt);report.updatedAt=new Date().toISOString();report.corpusVersion=prepared.corpusVersion;report.sourceFetchedAt=prepared.fetchedAt;
    fs.writeFileSync(output,JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'docs/MODEL_VERIFICATION.md'),markdown(report));
    console.log(JSON.stringify({id:attempt.id,provider:attempt.provider,passed:attempt.passed,durationMs:attempt.durationMs,checks:attempt.checks,calls:attempt.calls.map(c=>({name:c.name,ms:c.durationMs,error:c.error,unsupportedClaims:c.structuredOutput?.unsupportedClaims}))}));
  }
}
if(require.main===module)main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
module.exports={cases,readAnchors,prepareCases,verifyCase,markdown,roundMarkdown};
