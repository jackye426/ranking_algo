/**
 * Run ranking on a subset of benchmark test cases (train or holdout) with
 * configurable weights and cached session context. Output a single metric
 * (e.g. NDCG@12) to stdout for Optuna.
 *
 * Usage:
 *   node evaluate-ranking-subset.js --train --metric=ndcg12 --use-cache
 *   node evaluate-ranking-subset.js --holdout --metric=recall12 --use-cache
 *   node evaluate-ranking-subset.js --ids=id1,id2,... --weights=ranking-weights.json --use-cache
 *
 * Env: WORKERS=4 for concurrent ranking evaluations.
 */

// Redirect console.log to stderr so stdout contains only the metric (for Optuna)
const util = require('util');
console.log = (...args) => process.stderr.write(util.format(...args) + '\n');

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getBM25Shortlist, getRankingConfig, DEFAULT_RANKING_CONFIG } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { createNameToIdMap, resolveGroundTruthNames } = require('./parallel-ranking-package/testing/utils/name-to-id-mapper');
const {
  evaluateAgainstGroundTruth,
  calculateRecallAtK,
  calculatePrecisionAtK,
  calculateNDCG,
} = require('./parallel-ranking-package/testing/utils/measurements');

const BENCHMARK_FILE = 'benchmark-test-cases-all-specialties.json';
const SPLIT_FILE = 'benchmark-split.json';
const CACHE_FILE = 'benchmark-session-context-cache.json';
const WEIGHTS_FILE = 'ranking-weights.json';
const WORKERS = Math.max(1, parseInt(process.env.WORKERS || '4', 10));
const SHORTLIST_SIZE = 12;

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

function parseArgs() {
  const args = { train: false, holdout: false, ids: null, metric: 'ndcg12', useCache: false, benchmark: null, split: null, weights: null, cache: null, variant: 'parallel' };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--train') args.train = true;
    else if (arg === '--holdout') args.holdout = true;
    else if (arg === '--use-cache') args.useCache = true;
    else if (arg.startsWith('--ids=')) args.ids = arg.slice(6).split(',').map(s => s.trim()).filter(Boolean);
    else if (arg.startsWith('--metric=')) args.metric = arg.slice(9).toLowerCase();
    else if (arg.startsWith('--benchmark=')) args.benchmark = arg.slice(12);
    else if (arg.startsWith('--split=')) args.split = arg.slice(8);
    else if (arg.startsWith('--weights=')) args.weights = arg.slice(10);
    else if (arg.startsWith('--cache=')) args.cache = arg.slice(8);
    else if (arg.startsWith('--variant=')) args.variant = arg.slice(10) || 'parallel';
  }
  args.benchmark = args.benchmark || path.join(__dirname, BENCHMARK_FILE);
  args.split = args.split || path.join(__dirname, SPLIT_FILE);
  args.weights = args.weights || path.join(__dirname, WEIGHTS_FILE);
  args.cache = args.cache || path.join(__dirname, CACHE_FILE);
  return args;
}

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

async function main() {
  const args = parseArgs();

  if (!args.train && !args.holdout && !(args.ids && args.ids.length > 0)) {
    console.error('Specify --train, --holdout, or --ids=id1,id2,...');
    process.exit(1);
  }

  if (args.useCache && !fs.existsSync(args.cache)) {
    console.error(`--use-cache requested but cache not found: ${args.cache}. Run node build-session-context-cache.js first.`);
    process.exit(1);
  }

  const benchmarkPath = path.resolve(args.benchmark);
  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Benchmark not found: ${benchmarkPath}`);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const allCases = benchmarkData.testCases || [];
  const byId = new Map(allCases.map(tc => [tc.id, tc]));

  let subsetIds;
  if (args.ids && args.ids.length > 0) {
    subsetIds = args.ids;
  } else {
    const splitPath = path.resolve(args.split);
    if (!fs.existsSync(splitPath)) {
      console.error(`Split file not found: ${splitPath}. Run node create-benchmark-split.js first.`);
      process.exit(1);
    }
    const splitData = JSON.parse(fs.readFileSync(splitPath, 'utf8'));
    subsetIds = args.train ? splitData.trainIds : splitData.holdoutIds;
  }

  const testCases = subsetIds.map(id => byId.get(id)).filter(Boolean);
  if (testCases.length === 0) {
    console.error('No test cases in subset.');
    process.exit(1);
  }

  let rankingConfig = { ...DEFAULT_RANKING_CONFIG };
  if (fs.existsSync(path.resolve(args.weights))) {
    rankingConfig = { ...DEFAULT_RANKING_CONFIG, ...JSON.parse(fs.readFileSync(path.resolve(args.weights), 'utf8')) };
  }

  let sessionContextCache = null;
  if (args.useCache) {
    sessionContextCache = JSON.parse(fs.readFileSync(path.resolve(args.cache), 'utf8'));
  }

  const practitionerCache = new Map();
  const variantName = args.variant || 'parallel';

  const processOne = async (tc) => {
    const specialty = tc.expectedSpecialty;
    if (!practitionerCache.has(specialty)) {
      practitionerCache.set(specialty, loadSpecialtyPractitioners(specialty));
    }
    const practitioners = practitionerCache.get(specialty);
    const nameToIdMap = createNameToIdMap(practitioners);
    const groundTruthIds = resolveGroundTruthNames(tc.groundTruth || [], nameToIdMap);

    const sessionContext = sessionContextCache ? sessionContextCache[tc.id] : null;
    if (!sessionContext && args.useCache) {
      throw new Error(`Missing cache entry for ${tc.id}. Re-run build-session-context-cache.js.`);
    }
    if (!sessionContext && !args.useCache) {
      throw new Error('Session context required; use --use-cache and build the cache first.');
    }

    const filters = {
      q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
      safe_lane_terms: sessionContext.safe_lane_terms || [],
      intent_terms: sessionContext.intent_terms || [],
      anchor_phrases: sessionContext.anchor_phrases || sessionContext.intentData?.anchor_phrases || null,
      searchQuery: sessionContext.enrichedQuery,
      intentData: sessionContext.intentData || null,
      variantName,
      rankingConfig,
    };

    const bm25Result = getBM25Shortlist(practitioners, filters, SHORTLIST_SIZE);
    const top12 = bm25Result.results;

    let ndcg12 = null;
    let recall12 = null;
    let precision12 = null;
    if (groundTruthIds && groundTruthIds.length > 0) {
      const evaluation = evaluateAgainstGroundTruth(top12, groundTruthIds, SHORTLIST_SIZE);
      ndcg12 = evaluation.ndcg;
      recall12 = calculateRecallAtK(top12, groundTruthIds, SHORTLIST_SIZE);
      precision12 = calculatePrecisionAtK(top12, groundTruthIds, SHORTLIST_SIZE);
    }

    return { ndcg12, recall12, precision12 };
  };

  const results = await runWithConcurrency(testCases, WORKERS, processOne);

  const withMetric = results.filter(r => r.ndcg12 != null && !isNaN(r.ndcg12));
  if (withMetric.length === 0) {
    console.error('No valid evaluations (missing ground truth).');
    process.exit(1);
  }

  let value;
  if (args.metric === 'recall12') {
    value = withMetric.reduce((s, r) => s + (r.recall12 ?? 0), 0) / withMetric.length;
  } else if (args.metric === 'precision12') {
    value = withMetric.reduce((s, r) => s + (r.precision12 ?? 0), 0) / withMetric.length;
  } else if (args.metric === 'recall_precision' || args.metric === 'recall_precision12') {
    const avgR = withMetric.reduce((s, r) => s + (r.recall12 ?? 0), 0) / withMetric.length;
    const avgP = withMetric.reduce((s, r) => s + (r.precision12 ?? 0), 0) / withMetric.length;
    value = (avgR + avgP) / 2;
  } else {
    value = withMetric.reduce((s, r) => s + (r.ndcg12 ?? 0), 0) / withMetric.length;
  }

  process.stdout.write(String(value));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
