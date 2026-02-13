/**
 * Cross-examine Stage A retrieval at N=100 and N=150 with benchmark ground-truth picks.
 * Compares ranking WITH vs WITHOUT stage_a_negative_penalty to discover whether we
 * tend to over-penalise some ground-truth picks (good docs that match negative_terms).
 *
 * Usage:
 *   node analyze-negative-penalty-retrieval.js [--weights=best-stage-a-recall-weights.json] [--cache=benchmark-session-context-cache-v2.json] [--out=negative-penalty-retrieval-report.json]
 * Output: stdout summary + optional JSON report.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const {
  getBM25StageATopN,
  createWeightedSearchableText,
} = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { createNameToIdMap, resolveGroundTruthNames } = require('./parallel-ranking-package/testing/utils/name-to-id-mapper');

const BENCHMARK_FILE = 'benchmark-test-cases-all-specialties.json';
const CACHE_FILE = 'benchmark-session-context-cache-v2.json';
const WEIGHTS_FILE = 'best-stage-a-recall-weights.json';

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
  let outPath = null;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--weights=')) weights = path.isAbsolute(arg.slice(10)) ? arg.slice(10) : path.join(__dirname, arg.slice(10));
    else if (arg.startsWith('--cache=')) cache = path.isAbsolute(arg.slice(8)) ? arg.slice(8) : path.join(__dirname, arg.slice(8));
    else if (arg.startsWith('--out=')) outPath = path.isAbsolute(arg.slice(6)) ? arg.slice(6) : path.join(__dirname, arg.slice(6));
  }
  return { weights, cache, outPath };
}

function countNegativeMatches(doc, negativeTerms, fieldWeights) {
  if (!negativeTerms || negativeTerms.length === 0) return 0;
  const searchableText = createWeightedSearchableText(doc, fieldWeights || null).toLowerCase();
  return negativeTerms.filter((term) => searchableText.includes(term.toLowerCase())).length;
}

function main() {
  const args = parseArgs();
  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    console.error('Benchmark file not found:', benchmarkPath);
    process.exit(1);
  }
  if (!fs.existsSync(args.cache)) {
    console.error('Cache not found:', args.cache);
    process.exit(1);
  }
  if (!fs.existsSync(args.weights)) {
    console.error('Weights file not found:', args.weights);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const testCases = benchmarkData.testCases || [];
  const sessionContextCache = JSON.parse(fs.readFileSync(args.cache, 'utf8'));
  const rankingConfig = JSON.parse(fs.readFileSync(args.weights, 'utf8'));
  const configNoPenalty = { ...rankingConfig, stage_a_negative_penalty: false };
  const configWithPenalty = { ...rankingConfig, stage_a_negative_penalty: true };

  const N100 = 100;
  const N150 = 150;

  const stats = {
    testCasesProcessed: 0,
    testCasesSkipped: 0,
    totalGTPicks: 0,
    inTop100NoPenalty: 0,
    inTop150NoPenalty: 0,
    inTop100WithPenalty: 0,
    inTop150WithPenalty: 0,
    droppedFromTop100: 0,
    droppedFromTop150: 0,
    droppedFromTop100WithNegativeMatch: 0,
    droppedFromTop150WithNegativeMatch: 0,
    inTop150NoPenaltyWithNegativeMatch1: 0,
    inTop150NoPenaltyWithNegativeMatch2: 0,
    inTop150NoPenaltyWithNegativeMatch4: 0,
    rankWorsenedInTop150: 0,
    rankWorsenedWithNegativeMatch: 0,
    casesWithNegativeTerms: 0,
  };

  const droppedExamples = [];
  const perCaseDetails = [];

  for (const tc of testCases) {
    const cacheEntry = sessionContextCache[tc.id];
    if (!cacheEntry) {
      stats.testCasesSkipped++;
      continue;
    }

    const practitioners = loadSpecialtyPractitioners(tc.expectedSpecialty);
    const nameToIdMap = createNameToIdMap(practitioners);
    const groundTruthIds = resolveGroundTruthNames(tc.groundTruth || [], nameToIdMap);
    if (!groundTruthIds || groundTruthIds.length === 0) {
      stats.testCasesSkipped++;
      continue;
    }

    const idToDoc = new Map();
    practitioners.forEach((p) => {
      const id = p.practitioner_id || p.id;
      if (id) idToDoc.set(String(id), p);
    });

    const negativeTerms = cacheEntry.intentData?.negative_terms || [];
    if (negativeTerms.length > 0) stats.casesWithNegativeTerms++;

    const filters = {
      q_patient: cacheEntry.q_patient || cacheEntry.enrichedQuery,
      safe_lane_terms: cacheEntry.safe_lane_terms || [],
      intent_terms: cacheEntry.intent_terms || [],
      anchor_phrases: cacheEntry.anchor_phrases || cacheEntry.intentData?.anchor_phrases || [],
      searchQuery: cacheEntry.enrichedQuery,
      intentData: cacheEntry.intentData || null,
      variantName: 'parallel-v2',
      rankingConfig: configNoPenalty,
    };

    const rankingNoPenalty = getBM25StageATopN(practitioners, { ...filters, rankingConfig: configNoPenalty }, N150);
    const rankingWithPenalty = getBM25StageATopN(practitioners, { ...filters, rankingConfig: configWithPenalty }, N150);

    const rankNoPenaltyById = new Map();
    rankingNoPenalty.forEach((r, idx) => {
      const id = r.document?.practitioner_id || r.document?.id;
      if (id) rankNoPenaltyById.set(String(id), idx + 1);
    });
    const rankWithPenaltyById = new Map();
    rankingWithPenalty.forEach((r, idx) => {
      const id = r.document?.practitioner_id || r.document?.id;
      if (id) rankWithPenaltyById.set(String(id), idx + 1);
    });

    const caseDropped = [];

    for (const gtId of groundTruthIds) {
      const sid = String(gtId);
      stats.totalGTPicks++;

      const doc = idToDoc.get(sid);
      const negMatches = doc ? countNegativeMatches(doc, negativeTerms, rankingConfig.field_weights) : 0;

      const rNo100 = rankNoPenaltyById.get(sid) <= N100;
      const rNo150 = rankNoPenaltyById.get(sid) <= N150;
      const rWith100 = rankWithPenaltyById.get(sid) <= N100;
      const rWith150 = rankWithPenaltyById.get(sid) <= N150;

      if (rNo100) stats.inTop100NoPenalty++;
      if (rNo150) stats.inTop150NoPenalty++;
      if (rWith100) stats.inTop100WithPenalty++;
      if (rWith150) stats.inTop150WithPenalty++;

      const dropped100 = rNo100 && !rWith100;
      const dropped150 = rNo150 && !rWith150;
      if (dropped100) {
        stats.droppedFromTop100++;
        if (negMatches >= 1) stats.droppedFromTop100WithNegativeMatch++;
        caseDropped.push({ gtId: sid, from: 'top100', rankNo: rankNoPenaltyById.get(sid), rankWith: rankWithPenaltyById.get(sid), negMatches });
      }
      if (dropped150) {
        stats.droppedFromTop150++;
        if (negMatches >= 1) stats.droppedFromTop150WithNegativeMatch++;
        caseDropped.push({ gtId: sid, from: 'top150', rankNo: rankNoPenaltyById.get(sid), rankWith: rankWithPenaltyById.get(sid), negMatches });
      }

      if (rNo150 && negMatches >= 1) stats.inTop150NoPenaltyWithNegativeMatch1++;
      if (rNo150 && negMatches >= 2) stats.inTop150NoPenaltyWithNegativeMatch2++;
      if (rNo150 && negMatches >= 4) stats.inTop150NoPenaltyWithNegativeMatch4++;

      // Rank change when penalty is applied (among those in top 150 without penalty)
      if (rNo150) {
        const rankNo = rankNoPenaltyById.get(sid);
        const rankWith = rankWithPenaltyById.get(sid);
        if (rankWith != null && rankNo != null && rankWith > rankNo) {
          stats.rankWorsenedInTop150 = (stats.rankWorsenedInTop150 || 0) + 1;
          if (negMatches >= 1) stats.rankWorsenedWithNegativeMatch = (stats.rankWorsenedWithNegativeMatch || 0) + 1;
        }
      }
    }

    stats.testCasesProcessed++;

    if (caseDropped.length > 0) {
      droppedExamples.push({
        testCaseId: tc.id,
        userQuery: (tc.userQuery || '').slice(0, 80),
        negativeTerms: negativeTerms.slice(0, 8),
        picks: caseDropped,
      });
    }

    perCaseDetails.push({
      testCaseId: tc.id,
      gtCount: groundTruthIds.length,
      negativeTermCount: negativeTerms.length,
      inTop100No: groundTruthIds.filter((id) => rankNoPenaltyById.get(String(id)) <= N100).length,
      inTop150No: groundTruthIds.filter((id) => rankNoPenaltyById.get(String(id)) <= N150).length,
      inTop100With: groundTruthIds.filter((id) => rankWithPenaltyById.get(String(id)) <= N100).length,
      inTop150With: groundTruthIds.filter((id) => rankWithPenaltyById.get(String(id)) <= N150).length,
    });
  }

  // Summary to stdout
  console.log('=== Negative penalty in retrieval: N=100 and N=150 ===\n');
  console.log('Test cases processed:', stats.testCasesProcessed, '(skipped:', stats.testCasesSkipped + ')');
  console.log('Test cases with negative_terms in cache:', stats.casesWithNegativeTerms);
  console.log('Total ground-truth picks:', stats.totalGTPicks);
  console.log('');
  console.log('Without penalty (Stage A):');
  console.log('  GT picks in top 100:', stats.inTop100NoPenalty, '(' + (stats.totalGTPicks ? (100 * stats.inTop100NoPenalty / stats.totalGTPicks).toFixed(1) : 0) + '%)');
  console.log('  GT picks in top 150:', stats.inTop150NoPenalty, '(' + (stats.totalGTPicks ? (100 * stats.inTop150NoPenalty / stats.totalGTPicks).toFixed(1) : 0) + '%)');
  console.log('');
  console.log('With penalty (stage_a_negative_penalty=true):');
  console.log('  GT picks in top 100:', stats.inTop100WithPenalty);
  console.log('  GT picks in top 150:', stats.inTop150WithPenalty);
  console.log('');
  console.log('Ground-truth picks DROPPED by applying negative penalty:');
  console.log('  Dropped out of top 100:', stats.droppedFromTop100, '(of these, with ≥1 neg match:', stats.droppedFromTop100WithNegativeMatch + ')');
  console.log('  Dropped out of top 150:', stats.droppedFromTop150, '(of these, with ≥1 neg match:', stats.droppedFromTop150WithNegativeMatch + ')');
  console.log('');
  console.log('Among GT picks in top 150 (no penalty), how many have negative_terms in their profile:');
  console.log('  ≥1 negative match:', stats.inTop150NoPenaltyWithNegativeMatch1);
  console.log('  ≥2 negative matches:', stats.inTop150NoPenaltyWithNegativeMatch2);
  console.log('  ≥4 negative matches:', stats.inTop150NoPenaltyWithNegativeMatch4);
  console.log('');
  console.log('Tendency: GT picks whose rank WORSENED when penalty is applied (still in top 150):');
  console.log('  Rank worsened (moved down in list):', stats.rankWorsenedInTop150 || 0);
  console.log('  Of those, with ≥1 negative match:', stats.rankWorsenedWithNegativeMatch || 0);
  console.log('');
  if (droppedExamples.length > 0) {
    console.log('Example cases where a GT pick dropped (first 10):');
    droppedExamples.slice(0, 10).forEach((ex, i) => {
      console.log('  ', i + 1, 'TC', ex.testCaseId, '| neg_terms:', ex.negativeTerms.length, '| drops:', ex.picks.map((p) => `rank ${p.rankNo}→${p.rankWith} neg=${p.negMatches}`).join('; '));
    });
  }

  const report = {
    stats,
    droppedExamples: droppedExamples.slice(0, 30),
    perCaseDetails,
  };
  if (args.outPath) {
    fs.writeFileSync(args.outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('\nReport written to', args.outPath);
  }
}

main();
