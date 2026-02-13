/**
 * One-time build of session context cache for the benchmark.
 * Calls getSessionContextParallel (or getSessionContextParallelV2 with --v2) once per test case
 * and saves results to benchmark-session-context-cache.json (or -v2.json).
 * Baseline evaluation: use --use-cache (and --session-context-v2 for v2 cache).
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getSessionContextParallel, getSessionContextParallelV2 } = require('./parallel-ranking-package/algorithm/session-context-variants');

const BENCHMARK_FILE = 'benchmark-test-cases-all-specialties.json';
const USE_V2 = process.argv.includes('--v2');

function getModelFromArgv() {
  const i = process.argv.indexOf('--model');
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1];
}
function getCacheFileFromArgv() {
  const i = process.argv.indexOf('--cache-file');
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1];
}
function getSampleSizeFromArgv() {
  const i = process.argv.indexOf('--sample');
  if (i === -1 || !process.argv[i + 1]) return null;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getDefaultCacheFile() {
  const override = getCacheFileFromArgv();
  if (override) return override;
  const model = getModelFromArgv();
  if (USE_V2 && model) {
    const safe = (model || '').replace(/[/.]/g, '-');
    return `benchmark-session-context-cache-v2-${safe}.json`;
  }
  return USE_V2 ? 'benchmark-session-context-cache-v2.json' : 'benchmark-session-context-cache.json';
}
const CACHE_FILE = getDefaultCacheFile();
const MODEL_OVERRIDE = getModelFromArgv();
const SAMPLE_SIZE = getSampleSizeFromArgv();

function loadBenchmark() {
  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    throw new Error(`Benchmark file not found: ${benchmarkPath}`);
  }
  const data = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  return data.testCases || [];
}

function loadExistingCache() {
  const cachePath = path.join(__dirname, CACHE_FILE);
  if (!fs.existsSync(cachePath)) return {};
  return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
}

function saveCache(cache) {
  const cachePath = path.join(__dirname, CACHE_FILE);
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * Serialize session context for cache (drop processingTime to avoid drift).
 */
function serializeSessionContext(sc) {
  return {
    q_patient: sc.q_patient,
    safe_lane_terms: sc.safe_lane_terms || [],
    intent_terms: sc.intent_terms || [],
    enrichedQuery: sc.enrichedQuery,
    intentData: sc.intentData || null,
    anchor_phrases: sc.anchor_phrases || sc.intentData?.anchor_phrases || [],
  };
}

async function main() {
  let testCases = loadBenchmark();
  if (SAMPLE_SIZE) {
    testCases = testCases.slice(0, SAMPLE_SIZE);
    console.log(`[Cache] Sample mode: using first ${SAMPLE_SIZE} test cases`);
  }
  console.log(`[Cache] Loaded ${testCases.length} test cases from ${BENCHMARK_FILE}`);
  console.log(`[Cache] Output: ${CACHE_FILE}`);
  if (MODEL_OVERRIDE) console.log(`[Cache] Model: ${MODEL_OVERRIDE}`);

  let cache = loadExistingCache();
  const existingIds = new Set(Object.keys(cache));
  const toProcess = testCases.filter((tc) => !existingIds.has(tc.id));
  if (toProcess.length === 0 && existingIds.size === testCases.length) {
    console.log('[Cache] All test cases already cached. Nothing to do.');
    return;
  }
  if (existingIds.size > 0) {
    console.log(`[Cache] Resuming: ${existingIds.size} already cached, ${toProcess.length} to process`);
  }

  const lexiconsDir = USE_V2 ? __dirname : null;
  const sessionContextOptions = USE_V2
    ? { lexiconsDir, specialty: undefined, model: MODEL_OVERRIDE || undefined }
    : null;
  for (let i = 0; i < toProcess.length; i++) {
    const tc = toProcess[i];
    const messages = tc.conversation || [{ role: 'user', content: tc.userQuery }];
    if (sessionContextOptions) sessionContextOptions.specialty = tc.expectedSpecialty;
    const sessionContext = USE_V2
      ? await getSessionContextParallelV2(tc.userQuery || '', messages, null, sessionContextOptions)
      : await getSessionContextParallel(tc.userQuery || '', messages, null);
    cache[tc.id] = serializeSessionContext(sessionContext);

    if ((i + 1) % 10 === 0 || i === toProcess.length - 1) {
      saveCache(cache);
      console.log(`  [Cache] Processed ${i + 1}/${toProcess.length} (total cached: ${Object.keys(cache).length})`);
    }
  }

  saveCache(cache);
  console.log(`[Cache] Done. Written to ${CACHE_FILE} (${Object.keys(cache).length} entries).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
