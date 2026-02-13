/**
 * Run the ranking algorithm over benchmark test cases and save the baseline score.
 * Uses the "parallel" variant (getSessionContextParallel + getBM25Shortlist).
 * Output: benchmark-baseline-score.json with summary metrics (recall@5, MRR, NDCG, etc.).
 *
 * Optional: node run-baseline-evaluation.js --use-cache
 *   Uses benchmark-session-context-cache.json (built by build-session-context-cache.js)
 *   so no LLM calls are made.
 * Optional: node run-baseline-evaluation.js --session-context-v2 [--use-cache]
 *   Uses session context v2 (merged anchors, safe_lane_terms, lexicons, specialty).
 *   With --use-cache, reads benchmark-session-context-cache-v2.json (build with node build-session-context-cache.js --v2).
 * Optional: node run-baseline-evaluation.js --v4 [--use-cache]
 *   V4: v2 retrieval (BM25 Stage A top 50) + AI ranking → top 12. Uses session context v2; with --use-cache uses benchmark-session-context-cache-v2.json.
 *   V4 now injects intent (anchor_phrases, likely_subspecialties, negative_terms) into the ranker prompt.
 * Optional: node run-baseline-evaluation.js --v4 --v4-desc-chars 1500 [--use-cache] [--output benchmark-baseline-v4-desc-1500.json]
 *   Same as --v4 but profile description max chars = 1500 (experiment; default is 350).
 * Optional: node run-baseline-evaluation.js --v4-multi-stage [--use-cache] [--v4-model gpt-5.1] [--output benchmark-baseline-v4-multistage.json]
 *   V4 multi-stage: Stage 1 shortlist (12–25 relevant IDs) then Stage 2 rank top 12. Same session context v2 and cache as --v4.
 * Optional: node run-baseline-evaluation.js --v4-stage-b [--use-cache] [--v4-model gpt-5.1] [--weights=ranking-weights-stage-a-200.json] [--output benchmark-baseline-v4-stage-b.json]
 *   V4 with Stage B: Stage A BM25 (top N, default 200) → Stage B rescoring (intent-based) → LLM rank top 12. Same session context v2 and cache as --v4.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getSessionContextParallel, getSessionContextParallelV2 } = require('./parallel-ranking-package/algorithm/session-context-variants');
const { getBM25Shortlist, getBM25StageATopN } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { getRankingV4, getRankingV4MultiStage, getRankingV4WithStageB } = require('./parallel-ranking-package/algorithm/ranking-v4-ai');
const { createNameToIdMap, resolveGroundTruthNames } = require('./parallel-ranking-package/testing/utils/name-to-id-mapper');
const {
  evaluateAgainstGroundTruth,
  calculateRecallAtK,
  calculatePrecisionAtK,
} = require('./parallel-ranking-package/testing/utils/measurements');

const BENCHMARK_FILE = path.join(__dirname, '../benchmarks/benchmark-test-cases-all-specialties.json');
const BASELINE_OUTPUT = path.join(__dirname, 'benchmark-baseline-score.json');
const USE_CACHE = process.argv.includes('--use-cache');
const SESSION_CONTEXT_V2 = process.argv.includes('--session-context-v2') || process.env.SESSION_CONTEXT_VARIANT === 'v2';
const SESSION_CONTEXT_V3 = process.argv.includes('--session-context-v3') || process.env.SESSION_CONTEXT_VARIANT === 'v3';
const RANKING_V4 = process.argv.includes('--v4') || process.argv.includes('--v4-multi-stage') || process.argv.includes('--v4-stage-b') || process.env.RANKING_V4 === '1';
const RANKING_V4_MULTI_STAGE = process.argv.includes('--v4-multi-stage') || process.env.RANKING_V4_MULTI_STAGE === '1';
const RANKING_V4_STAGE_B = process.argv.includes('--v4-stage-b') || process.env.RANKING_V4_STAGE_B === '1';
const CACHE_FILE = RANKING_V4 ? path.join(__dirname, '../benchmarks/benchmark-session-context-cache-v2.json') : (SESSION_CONTEXT_V3 ? path.join(__dirname, '../benchmarks/benchmark-session-context-cache.json') : (SESSION_CONTEXT_V2 ? path.join(__dirname, '../benchmarks/benchmark-session-context-cache-v2.json') : path.join(__dirname, '../benchmarks/benchmark-session-context-cache.json')));
const WORKERS = Math.max(1, parseInt(process.env.WORKERS || '4', 10));
function getWeightsPath() {
  for (const arg of process.argv) {
    if (arg === '--weights' && process.argv[process.argv.indexOf(arg) + 1])
      return process.argv[process.argv.indexOf(arg) + 1];
    if (arg.startsWith('--weights=')) return arg.slice(10);
  }
  return null;
}
function getOutputPath() {
  for (const arg of process.argv) {
    if (arg === '--output' && process.argv[process.argv.indexOf(arg) + 1])
      return process.argv[process.argv.indexOf(arg) + 1];
    if (arg.startsWith('--output=')) return arg.slice(9);
  }
  return null;
}
function getCacheFilePath() {
  for (const arg of process.argv) {
    if (arg === '--cache-file' && process.argv[process.argv.indexOf(arg) + 1])
      return process.argv[process.argv.indexOf(arg) + 1];
    if (arg.startsWith('--cache-file=')) return arg.slice(13);
  }
  return null;
}
function getLimitFromArgv() {
  const i = process.argv.indexOf('--limit');
  if (i === -1 || !process.argv[i + 1]) return null;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getV4DescChars() {
  for (const arg of process.argv) {
    if (arg === '--v4-desc-chars' && process.argv[process.argv.indexOf(arg) + 1]) {
      const n = parseInt(process.argv[process.argv.indexOf(arg) + 1], 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (arg.startsWith('--v4-desc-chars=')) {
      const n = parseInt(arg.slice(16), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}
function getV4Model() {
  for (const arg of process.argv) {
    if (arg === '--v4-model' && process.argv[process.argv.indexOf(arg) + 1]) {
      return process.argv[process.argv.indexOf(arg) + 1].trim() || null;
    }
    if (arg.startsWith('--v4-model=')) {
      return arg.slice(11).trim() || null;
    }
  }
  return null;
}
const WEIGHTS_PATH = getWeightsPath();
const V4_DESC_CHARS = getV4DescChars();
const V4_MODEL = getV4Model();
const OUTPUT_OVERRIDE = getOutputPath();
const CACHE_FILE_OVERRIDE = getCacheFilePath();
const LIMIT = getLimitFromArgv();

const SPECIALTY_TO_JSON = {
  'Cardiology': 'cardiology.json',
  'General surgery': 'general-surgery.json',
  'Obstetrics and gynaecology': 'obstetrics-and-gynaecology.json',
  'Ophthalmology': 'ophthalmology.json',
  'Trauma & orthopaedic surgery': 'trauma-and-orthopaedic-surgery.json',
};

function loadSpecialtyPractitioners(specialty) {
  const filename = SPECIALTY_TO_JSON[specialty];
  if (!filename) throw new Error(`Unknown specialty: ${specialty}`);
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) throw new Error(`Specialty file not found: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.practitioners || [];
}

/** V3: Merge v1 shortlist and simple BM25 shortlist. Docs in both get higher rank (reciprocal rank sum). */
function mergeV3Ranking(v1Results, simpleResults, topN = 12) {
  const N = 51; // rank for "not in list"
  const byId = new Map();
  (v1Results || []).forEach((r, i) => {
    const id = r.document?.practitioner_id || r.document?.id;
    if (id) byId.set(id, { document: r.document, rank_v1: i + 1, rank_bm25: N });
  });
  (simpleResults || []).forEach((r, i) => {
    const id = r.document?.practitioner_id || r.document?.id;
    if (id) {
      const existing = byId.get(id);
      if (existing) existing.rank_bm25 = i + 1;
      else byId.set(id, { document: r.document, rank_v1: N, rank_bm25: i + 1 });
    }
  });
  const combined = Array.from(byId.values()).map(o => ({
    ...o,
    score: 1 / o.rank_v1 + 1 / o.rank_bm25
  }));
  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, topN).map(o => ({ document: o.document, score: o.score }));
}

async function main() {
  const benchmarkPath = BENCHMARK_FILE;
  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Benchmark file not found: ${benchmarkPath}`);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  let testCases = benchmarkData.testCases || [];
  if (LIMIT) {
    testCases = testCases.slice(0, LIMIT);
    console.log(`[Baseline] Limited to first ${LIMIT} test cases (${testCases.length} from ${BENCHMARK_FILE})`);
  } else {
    console.log(`[Baseline] Loaded ${testCases.length} test cases from ${BENCHMARK_FILE}`);
  }
  if (SESSION_CONTEXT_V2) {
    console.log('[Baseline] Using session context v2 (merged anchors, safe_lane_terms, lexicons, specialty).');
  }
  if (SESSION_CONTEXT_V3) {
    console.log('[Baseline] Using v3: top 50 from same BM25 logic (Stage A) + top 50 from v1 ranking (Stage A+B), dedupe, rank-in-both higher. V1 cache.');
  }
  if (RANKING_V4) {
    if (RANKING_V4_STAGE_B) {
      console.log('[Baseline] Using v4 with Stage B: v2 retrieval (Stage A BM25) → Stage B rescoring → LLM rank top 12. Session context v2 cache.');
    } else if (RANKING_V4_MULTI_STAGE) {
      console.log('[Baseline] Using v4 multi-stage: v2 retrieval → Stage 1 shortlist (12–25 relevant) → Stage 2 rank top 12. Session context v2 cache.');
    } else {
      console.log('[Baseline] Using v4: v2 retrieval (Stage A top 50) + AI ranking → top 12. Session context v2 cache.');
    }
    if (V4_DESC_CHARS != null) {
      console.log(`[Baseline] V4 profile description max chars: ${V4_DESC_CHARS} (experiment).`);
    }
    if (V4_MODEL) {
      console.log(`[Baseline] V4 ranker model: ${V4_MODEL}`);
    }
  }

  let rankingConfig = null;
  if (WEIGHTS_PATH) {
    const wp = path.isAbsolute(WEIGHTS_PATH) ? WEIGHTS_PATH : path.join(__dirname, WEIGHTS_PATH);
    if (fs.existsSync(wp)) {
      rankingConfig = JSON.parse(fs.readFileSync(wp, 'utf8'));
      console.log(`[Baseline] Using ranking weights from ${WEIGHTS_PATH}`);
    } else {
      console.warn(`[Baseline] --weights file not found: ${wp}`);
    }
  }

  let sessionContextCache = null;
  let testCasesToRun = testCases;
  if (USE_CACHE) {
    const cacheFile = CACHE_FILE_OVERRIDE || CACHE_FILE;
    const cachePath = path.isAbsolute(cacheFile) ? cacheFile : path.join(__dirname, cacheFile);
    if (fs.existsSync(cachePath)) {
      sessionContextCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const cacheIds = new Set(Object.keys(sessionContextCache));
      if (cacheIds.size < testCases.length) {
        testCasesToRun = testCases.filter((tc) => cacheIds.has(tc.id));
        console.log(`[Baseline] Using session context cache: ${cacheFile} (${cacheIds.size} entries). Evaluating ${testCasesToRun.length} test cases present in cache only.`);
      } else {
        console.log(`[Baseline] Using session context cache: ${cacheFile} (${Object.keys(sessionContextCache).length} entries). No LLM calls.`);
      }
    } else {
      console.warn(`[Baseline] --use-cache requested but ${CACHE_FILE_OVERRIDE || CACHE_FILE} not found. Run node build-session-context-cache.js first.`);
    }
  }

  const practitionerCache = new Map();
  // V3 uses v1 ranking for the v1 leg, so filters get 'parallel'; output label is parallel-v3. V4 uses v2 filters for BM25 Stage A.
  const variantName = RANKING_V4 ? 'parallel-v2' : (SESSION_CONTEXT_V3 ? 'parallel' : (SESSION_CONTEXT_V2 ? 'parallel-v2' : 'parallel'));
  const outputVariant = RANKING_V4
    ? (RANKING_V4_STAGE_B
        ? (V4_MODEL ? `v4-ai-ranking-stage-b-${V4_MODEL.replace(/[^a-z0-9_-]/gi, '-')}` : 'v4-ai-ranking-stage-b')
        : (RANKING_V4_MULTI_STAGE
            ? (V4_MODEL ? `v4-ai-ranking-multistage-${V4_MODEL.replace(/[^a-z0-9_-]/gi, '-')}` : 'v4-ai-ranking-multistage')
            : (V4_MODEL ? `v4-ai-ranking-${V4_MODEL.replace(/[^a-z0-9_-]/gi, '-')}` : (V4_DESC_CHARS === 1500 ? 'v4-ai-ranking-desc-1500' : 'v4-ai-ranking'))))
    : (SESSION_CONTEXT_V3 ? 'parallel-v3' : variantName);
  const lexiconsDir = (SESSION_CONTEXT_V2 || RANKING_V4) ? __dirname : null;

  async function runWithConcurrency(tasks, concurrency, processOne) {
    const results = [];
    let index = 0;
    const running = new Set();
    const runNext = async () => {
      if (index >= tasks.length) return;
      const task = tasks[index++];
      const p = processOne(task)
        .then((result) => {
          running.delete(p);
          results.push(result);
          return runNext();
        })
        .catch((err) => {
          running.delete(p);
          throw err;
        });
      running.add(p);
    };
    for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
      runNext();
    }
    while (running.size > 0) {
      await Promise.race(running);
    }
    return results;
  }

  const processOne = async (tc) => {
    const specialty = tc.expectedSpecialty;
    if (!practitionerCache.has(specialty)) {
      practitionerCache.set(specialty, loadSpecialtyPractitioners(specialty));
    }
    const practitioners = practitionerCache.get(specialty);
    const nameToIdMap = createNameToIdMap(practitioners);
    const groundTruthIds = resolveGroundTruthNames(tc.groundTruth || [], nameToIdMap);

    let sessionContext;
    if (sessionContextCache && sessionContextCache[tc.id]) {
      sessionContext = sessionContextCache[tc.id];
    } else {
      const messages = tc.conversation || [{ role: 'user', content: tc.userQuery }];
      if (SESSION_CONTEXT_V2 || RANKING_V4) {
        sessionContext = await getSessionContextParallelV2(tc.userQuery || '', messages, null, {
          lexiconsDir,
          specialty: tc.expectedSpecialty,
        });
      } else {
        sessionContext = await getSessionContextParallel(tc.userQuery || '', messages, null);
      }
    }

    const filters = {
      q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
      safe_lane_terms: sessionContext.safe_lane_terms || [],
      intent_terms: sessionContext.intent_terms || [],
      anchor_phrases: sessionContext.anchor_phrases || sessionContext.intentData?.anchor_phrases || null,
      searchQuery: sessionContext.enrichedQuery,
      intentData: sessionContext.intentData || null,
      variantName,
      ...(rankingConfig && { rankingConfig }),
    };

    let top12;
    if (RANKING_V4) {
      const v4Options = {};
      if (V4_DESC_CHARS != null) v4Options.maxDescriptionChars = V4_DESC_CHARS;
      if (V4_MODEL) v4Options.modelOverride = V4_MODEL;
      let v4Result;
      if (RANKING_V4_STAGE_B) {
        v4Result = await getRankingV4WithStageB(practitioners, filters, sessionContext, 12, v4Options);
      } else if (RANKING_V4_MULTI_STAGE) {
        v4Result = await getRankingV4MultiStage(practitioners, filters, sessionContext, 12, v4Options);
      } else {
        v4Result = await getRankingV4(practitioners, filters, sessionContext, 12, v4Options);
      }
      top12 = v4Result.results;
    } else if (SESSION_CONTEXT_V3) {
      const v1Result = getBM25Shortlist(practitioners, filters, 50);
      const bm25StageATop50 = getBM25StageATopN(practitioners, filters, 50);
      top12 = mergeV3Ranking(v1Result.results, bm25StageATop50, 12);
    } else {
      const bm25Result = getBM25Shortlist(practitioners, filters, 12);
      top12 = bm25Result.results;
    }

    let evaluation = null;
    if (groundTruthIds && groundTruthIds.length > 0) {
      evaluation = evaluateAgainstGroundTruth(top12, groundTruthIds, 12);
      evaluation.recallAt12 = calculateRecallAtK(top12, groundTruthIds, 12);
      evaluation.precisionAt12 = calculatePrecisionAtK(top12, groundTruthIds, 12);
    }

    return {
      id: tc.id,
      userQuery: tc.userQuery,
      expectedSpecialty: specialty,
      groundTruthNames: tc.groundTruth,
      groundTruthIds,
      evaluation,
    };
  };

  console.log(`[Baseline] Running with ${WORKERS} workers.`);
  const results = await runWithConcurrency(testCasesToRun, WORKERS, processOne);
  results.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const withEval = results.filter((r) => r.evaluation != null);
  const recallAt5 = withEval.map((r) => r.evaluation.recallAt5).filter((v) => v != null && !isNaN(v));
  const precisionAt5 = withEval.map((r) => r.evaluation.precisionAt5).filter((v) => v != null && !isNaN(v));
  const recallAt12 = withEval.map((r) => r.evaluation.recallAt12).filter((v) => v != null && !isNaN(v));
  const precisionAt12 = withEval.map((r) => r.evaluation.precisionAt12).filter((v) => v != null && !isNaN(v));
  const recallAt3 = withEval.map((r) => r.evaluation.recallAt3).filter((v) => v != null && !isNaN(v));
  const precisionAt3 = withEval.map((r) => r.evaluation.precisionAt3).filter((v) => v != null && !isNaN(v));
  const mrr = withEval.map((r) => r.evaluation.mrr).filter((v) => v != null && !isNaN(v));
  const ndcg = withEval.map((r) => r.evaluation.ndcg).filter((v) => v != null && !isNaN(v));

  const summary = {
    totalTestCases: testCasesToRun.length,
    testCasesWithGroundTruth: withEval.length,
    averageRecallAt5: recallAt5.length ? recallAt5.reduce((a, b) => a + b, 0) / recallAt5.length : null,
    averagePrecisionAt5: precisionAt5.length ? precisionAt5.reduce((a, b) => a + b, 0) / precisionAt5.length : null,
    averageRecallAt12: recallAt12.length ? recallAt12.reduce((a, b) => a + b, 0) / recallAt12.length : null,
    averagePrecisionAt12: precisionAt12.length ? precisionAt12.reduce((a, b) => a + b, 0) / precisionAt12.length : null,
    averageRecallAt3: recallAt3.length ? recallAt3.reduce((a, b) => a + b, 0) / recallAt3.length : null,
    averagePrecisionAt3: precisionAt3.length ? precisionAt3.reduce((a, b) => a + b, 0) / precisionAt3.length : null,
    averageMRR: mrr.length ? mrr.reduce((a, b) => a + b, 0) / mrr.length : null,
    averageNDCG: ndcg.length ? ndcg.reduce((a, b) => a + b, 0) / ndcg.length : null,
  };

  const outputFilename = OUTPUT_OVERRIDE || (WEIGHTS_PATH ? 'benchmark-best-weights-score.json' : BASELINE_OUTPUT);
  const payload = {
    baseline: !WEIGHTS_PATH,
    variant: outputVariant,
    runAt: new Date().toISOString(),
    weightsSource: WEIGHTS_PATH || null,
    summary,
    results,
  };

  const outputPath = path.join(__dirname, outputFilename);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\n[Baseline] Written to ${outputPath}`);
  console.log('[Baseline] Summary:', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
