'use strict';

// Reproduce the public comparison using the existing cached consultant corpus.
// No credentials, live data requests, remote models or paid generation are used.
// From the application directory: npm run verify:comparison
// Add --write-public-data only when deliberately refreshing the reviewed fixture.
// Requires existing demo/.cache source rows, matching vectors and local model
// files. These caches are private build inputs and are intentionally not fetched.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');
const app = path.resolve(__dirname, '../..');
const req = createRequire(path.join(app, 'package.json'));
const MODEL = 'Xenova/all-MiniLM-L6-v2';
let blockedNetworkAttempts = 0;
const denyNetwork = () => { blockedNetworkAttempts++; throw new Error('Comparison verification is offline.'); };
globalThis.fetch = denyNetwork;
for (const name of ['node:http', 'node:https']) {
  const transport = require(name);
  transport.request = denyNetwork;
  transport.get = denyNetwork;
}
const {mapSupabaseRows} = req('./demo/supabase-mapper.cjs');
const {normalizeRecord} = req('./demo/data-source.cjs');
const {SearchEngine, mapToRanking, clinicalText, matchesFilters, explanationFacts} = req('./demo/search.cjs');
const {createQueryInterpreter} = req('./demo/query-interpreter.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const protectedFiles = ['supabase-raw.json', 'embedding-index.json', 'geocodes.json']
  .map(file => path.join(app, 'demo', '.cache', file));
const initialHashes = protectedFiles.map(file => hash(fs.readFileSync(file)));
const records = mapSupabaseRows(JSON.parse(fs.readFileSync(protectedFiles[0], 'utf8')))
  .records.map(normalizeRecord).filter(Boolean);
const cached = JSON.parse(fs.readFileSync(protectedFiles[1], 'utf8'));
const fingerprint = hash(JSON.stringify([MODEL, records.map(clinicalText)]));
assert.equal(records.length, 4031, 'Review the comparison after a corpus change.');
assert.equal(cached.fingerprint, fingerprint, 'The cached vectors must match the current clinical fields.');
assert.equal(cached.vectors.length, records.length);

const prompts = {
  baseline: 'I have knee pain',
  goal: 'I’m a runner with knee pain and want to get back to running',
  history: 'Physiotherapy hasn’t helped',
};
const expectedTop = {
  baseline: ['7015944', '6078138', '3575473'],
  goal: ['4749002', '6058091', '3351259'],
  history: ['3116968', '3351259', '4749002'],
};
// Reviewed copy uses only the exact clinical/specialty fields checked below.
// It does not claim a diagnosis, outcome, or expertise in failed physiotherapy.
const editorial = {
  '7015944': {excerpts: ['knee pain, over 18 years, joint replacement'], reason: 'Knee pain is listed in his recorded clinical interests.'},
  '6078138': {specialtyOnly: true, excerpts: ['Consultant Orthopaedic Surgeon'], reason: 'His recorded specialty is orthopaedic surgery. The fit for this symptom needs confirmation.'},
  '3575473': {excerpts: ['knee pain'], reason: 'Knee pain is listed in his recorded clinical interests.'},
  '4749002': {excerpts: ["Runner's knee", 'Knee pain'], reason: 'You want to get back to running. His record lists runner’s knee and knee pain, giving you a specific reason to explore his profile.'},
  '6058091': {excerpts: ['Running injuries', 'Anterior knee pain'], reason: 'His record lists running injuries alongside anterior knee pain. Those interests connect with your knee concern and your goal of returning to running.'},
  '3351259': {excerpts: ['Investigation of painful knee'], reason: 'Investigation of a painful knee relates to your knee concern. A running-specific connection would need confirming.'},
  '3116968': {excerpts: ['Running injuries', 'Knee pain'], reason: 'You want to return to running. His recorded interests include running injuries and knee pain, giving you a reason to explore his sports medicine practice.'},
};

function publicResult(record) {
  const copy = editorial[record.gmc];
  assert.ok(copy, `No reviewed copy for ${record.id}`);
  const availableFacts = explanationFacts(record);
  const supportingEvidence = copy.excerpts.map(text => {
    if (copy.specialtyOnly) {
      assert.equal(record.specialty, text);
      return {text, sourceField: 'specialty', sourceUrl: record.fieldProvenance.specialty.find(item => item.sourceUrl)?.sourceUrl || record.evidenceUrl};
    }
    assert.ok(record.clinicalInterests.includes(text), `Excerpt no longer present: ${record.name}: ${text}`);
    const fact = availableFacts.find(item => item.value === text);
    assert.ok(fact?.sourceUrl);
    const provenance = record.fieldProvenance.clinicalInterests.find(item => item.values?.includes(text));
    assert.ok(provenance, `Missing field provenance: ${record.id}`);
    return {text, sourceField: provenance.field, sourceUrl: fact.sourceUrl};
  });
  assert.ok(record.locations[0]?.name);
  return {
    id: record.id,
    name: record.name,
    specialty: record.specialty,
    location: record.locations[0].name,
    reason: copy.reason,
    evidenceText: supportingEvidence[0].text,
    evidenceUrl: supportingEvidence[0].sourceUrl,
    profileUrl: record.profileUrl,
    sourceField: supportingEvidence[0].sourceField,
    supportingEvidence,
  };
}

async function run() {
  const transformers = req('@huggingface/transformers');
  transformers.env.allowRemoteModels = false;
  transformers.env.allowLocalModels = true;
  transformers.env.localModelPath = path.join(app, 'demo', '.cache', 'models');
  transformers.env.cacheDir = path.join(app, 'demo', '.cache', 'models');
  const embedder = await transformers.pipeline('feature-extraction', MODEL, {
    dtype: 'q8', device: 'cpu', local_files_only: true,
    session_options: {intraOpNumThreads: 2, interOpNumThreads: 1},
  });
  try {
    const engine = new SearchEngine({
      embedQuery: async values => (await embedder(values, {pooling: 'mean', normalize: true, truncation: true})).tolist(),
      // Generation cannot affect ranking. This audit verifies retrieval and
      // separately checks reviewed card excerpts against source fields.
      personalize: async () => ({selected: [], personalizedMatch: {}, generationMode: 'verification-no-generation'}),
    });
    Object.assign(engine, {ready: true, records, documents: records.map(mapToRanking), vectors: cached.vectors, source: 'supabase'});
    const interpret = createQueryInterpreter({client: null});
    const states = {}, proof = [];
    let baselineEligible;
    for (const state of ['baseline', 'goal', 'history']) {
      const parsed = await interpret({message: prompts[state], previous: state === 'history' ? states.goal.criteria : undefined});
      assert.notEqual(parsed.mode, 'clarification');
      assert.equal(parsed.criteria.topic, 'knee pain');
      assert.deepEqual(parsed.criteria.procedures, []);
      for (const key of ['specialty', 'location', 'insurance', 'radiusMiles', 'gender', 'language']) assert.equal(parsed.criteria[key], null);
      assert.equal(parsed.criteria.sortByDistance, false);
      if (state === 'baseline') assert.equal(parsed.criteria.clinicalContext, null);
      if (state === 'goal') assert.equal(parsed.criteria.clinicalContext, prompts.goal);
      if (state === 'history') assert.equal(parsed.criteria.clinicalContext, `${prompts.goal}; ${prompts.history}`);
      const eligible = records.filter(record => matchesFilters(record, parsed.criteria)).map(record => record.id).sort();
      assert.equal(eligible.length, 433);
      if (!baselineEligible) baselineEligible = eligible;
      assert.deepEqual(eligible, baselineEligible, 'Context must not silently exclude consultants.');
      const found = await engine.search(parsed.criteria);
      assert.equal(found.total, 433);
      assert.ok(found.diagnostics.bm25Candidates.length > 0);
      assert.ok(found.diagnostics.semanticCandidates.length > 0);
      assert.deepEqual(found.results.slice(0, 3).map(record => record.gmc), expectedTop[state], 'Actual order changed: review rather than fabricating the comparison.');
      states[state] = {
        prompt: state === 'baseline' ? prompts.baseline : prompts.goal,
        followup: state === 'history' ? prompts.history : null,
        criteria: parsed.criteria,
        total: found.total,
        results: found.results.slice(0, 3).map(publicResult),
      };
      proof.push({state, message: prompts[state], criteria: parsed.criteria, total: found.total,
        eligibleCount: eligible.length, eligibleIdsHash: hash(JSON.stringify(eligible)),
        bm25Candidates: found.diagnostics.bm25Candidates.length, semanticCandidates: found.diagnostics.semanticCandidates.length,
        topSix: found.results.map(record => ({id: record.id, name: record.name, score: found.diagnostics.ranking.find(item => item.id === record.id)}))});
    }
    assert.equal(blockedNetworkAttempts, 0);
    assert.deepEqual(protectedFiles.map(file => hash(fs.readFileSync(file))), initialHashes, 'Source/model/geocoder caches must not be changed.');
    const verifiedAt = new Date().toISOString();
    const data = {
      verifiedAt, corpusCount: records.length, eligibleCount: baselineEligible.length,
      scopeNote: 'A prepared comparison of real search results from recorded Spire consultant profiles. First recorded hospital shown; no location filter is applied.',
      verificationNote: 'The search was checked on this date using cached records. This is not a fresh verification of each consultant’s profile or availability.',
      contextNote: 'Goals and previous care change relevance, not eligibility. Failed physiotherapy does not imply that surgery is appropriate or establish a consultant’s expertise in that history.',
      verification: {sameEligibleIds: true, noProcedureRequirement: true, noExclusion: true, actualBm25: true, actualEmbeddings: true, paidApiCalls: 0},
      ...states,
    };
    const publicFile = path.join(app, 'public', 'comparison-data.js');
    if (process.argv.includes('--write-public-data')) {
      const encoded = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
      fs.writeFileSync(publicFile, `/* Prepared from actual offline search results. Recheck with npm run verify:comparison. */\n(function (root) {\n  'use strict';\n  const data = ${encoded};\n  if (root) root.DocMapComparisonData = data;\n  if (typeof module === 'object' && module.exports) module.exports = data;\n})(typeof window === 'object' ? window : null);\n`);
    } else {
      assert.ok(fs.existsSync(publicFile), 'Generate the reviewed public dataset with --write-public-data first.');
      const current = require(publicFile);
      for (const state of ['baseline', 'goal', 'history']) assert.deepEqual(current[state], data[state], `Public ${state} comparison differs from real results.`);
    }
    const report = {verifiedAt, mode: 'Offline cached corpus and local query embeddings; no generation', embeddingModel: MODEL, fingerprint,
      corpusCount: records.length, sameEligibleIds: true, cacheUnchanged: true, blockedNetworkAttempts,
      methods: {lexical: 'BM25 k1=1.5 b=0.75', semantic: 'MiniLM cosine', fusion: 'RRF k=60'}, states: proof,
      sourceExcerptsChecked: true, publicFieldsWhitelisted: true};
    const reportFile = path.join(app, 'demo', '.cache', 'comparison-verification.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({passed: true, corpusCount: records.length, eligibleCount: baselineEligible.length,
      states: proof.map(state => ({state: state.state, bm25: state.bm25Candidates, semantic: state.semanticCandidates, topThree: state.topSix.slice(0, 3).map(record => record.name)})),
      sameEligibleIds: true, cacheUnchanged: true, blockedNetworkAttempts, publicFile, reportFile}, null, 2));
  } finally { await embedder.dispose(); }
}
run().catch(error => {console.error(error); process.exitCode = 1;});
