/**
 * Compute Stage A recall @N (how many ground-truth picks appear in BM25 top N).
 * Uses V2 cache and rankingConfig from weights file. Prints a single number to stdout for Optuna.
 *
 * Usage:
 *   node evaluate-stage-a-recall.js --weights=ranking-weights.json --n=150
 *   node evaluate-stage-a-recall.js --weights=ranking-weights.json --train --split=benchmark-split.json --n=150
 *
 * Options: --train = use only train IDs from split file. --split=<path> = path to benchmark-split.json.
 * Stdout: Stage A recall (0–1). Stderr: logs.
 */

const util = require('util');
const log = (...args) => process.stderr.write(util.format(...args) + '\n');
// Redirect console.log to stderr so stdout contains only the recall (for Optuna)
console.log = (...args) => process.stderr.write(util.format(...args) + '\n');

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getBM25StageATopN } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { createNameToIdMap, resolveGroundTruthNames } = require('./parallel-ranking-package/testing/utils/name-to-id-mapper');

const BENCHMARK_FILE = 'benchmark-test-cases-all-specialties.json';
const CACHE_FILE = 'benchmark-session-context-cache-v2.json';
const SPLIT_FILE = 'benchmark-split.json';
const WEIGHTS_FILE = 'ranking-weights.json';
const DEFAULT_N = 150;

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
  let weights = path.join(__dirname, WEIGHTS_FILE);
  let cache = path.join(__dirname, CACHE_FILE);
  let splitPath = path.join(__dirname, SPLIT_FILE);
  let trainOnly = false;
  let n = DEFAULT_N;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--train') trainOnly = true;
    else if (arg.startsWith('--weights=')) weights = path.isAbsolute(arg.slice(10)) ? arg.slice(10) : path.join(__dirname, arg.slice(10));
    else if (arg.startsWith('--cache=')) cache = path.isAbsolute(arg.slice(8)) ? arg.slice(8) : path.join(__dirname, arg.slice(8));
    else if (arg.startsWith('--split=')) splitPath = path.isAbsolute(arg.slice(8)) ? arg.slice(8) : path.join(__dirname, arg.slice(8));
    else if (arg.startsWith('--n=')) n = parseInt(arg.slice(4), 10) || DEFAULT_N;
  }
  return { weights, cache, splitPath, trainOnly, n };
}

function main() {
  const args = parseArgs();
  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    log('Benchmark file not found:', benchmarkPath);
    process.exit(1);
  }
  if (!fs.existsSync(args.cache)) {
    log('Cache not found:', args.cache);
    process.exit(1);
  }
  if (!fs.existsSync(args.weights)) {
    log('Weights file not found:', args.weights);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  let testCases = benchmarkData.testCases || [];
  if (args.trainOnly) {
    if (!fs.existsSync(args.splitPath)) {
      log('Split file not found:', args.splitPath);
      process.exit(1);
    }
    const splitData = JSON.parse(fs.readFileSync(args.splitPath, 'utf8'));
    const trainIds = new Set(splitData.trainIds || []);
    testCases = testCases.filter((tc) => trainIds.has(tc.id));
    log('[Stage A Recall] Train only: ' + testCases.length + ' cases from split');
  }
  const sessionContextCache = JSON.parse(fs.readFileSync(args.cache, 'utf8'));
  const rankingConfig = JSON.parse(fs.readFileSync(args.weights, 'utf8'));
  if (rankingConfig.stage_a_top_n == null) rankingConfig.stage_a_top_n = args.n;

  let totalGT = 0;
  let totalFound = 0;

  for (const tc of testCases) {
    const cacheEntry = sessionContextCache[tc.id];
    if (!cacheEntry) continue;

    const practitioners = loadSpecialtyPractitioners(tc.expectedSpecialty);
    const nameToIdMap = createNameToIdMap(practitioners);
    const groundTruthIds = resolveGroundTruthNames(tc.groundTruth || [], nameToIdMap);
    if (!groundTruthIds || groundTruthIds.length === 0) continue;

    const filters = {
      q_patient: cacheEntry.q_patient || cacheEntry.enrichedQuery,
      safe_lane_terms: cacheEntry.safe_lane_terms || [],
      intent_terms: cacheEntry.intent_terms || [],
      anchor_phrases: cacheEntry.anchor_phrases || cacheEntry.intentData?.anchor_phrases || [],
      searchQuery: cacheEntry.enrichedQuery,
      intentData: cacheEntry.intentData || null,
      variantName: 'parallel-v2',
      rankingConfig,
    };

    const stageATopN = getBM25StageATopN(practitioners, filters, args.n);
    const idsInPool = new Set(
      stageATopN.map((r) => r.document?.practitioner_id || r.document?.id).filter(Boolean)
    );
    const found = groundTruthIds.filter((id) => idsInPool.has(id)).length;
    totalGT += groundTruthIds.length;
    totalFound += found;
  }

  const recall = totalGT > 0 ? totalFound / totalGT : 0;
  log('[Stage A Recall @' + args.n + '] Found', totalFound, '/', totalGT, '=', recall.toFixed(4));
  process.stdout.write(String(recall));
}

main();
