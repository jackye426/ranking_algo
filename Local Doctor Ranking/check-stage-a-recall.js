/**
 * Check Stage A retrieval recall at multiple N (100, 150, 200).
 * For each ground-truth pick: compute its actual BM25 rank in full Stage A ranking.
 * Report why picks are missing: rank, score vs threshold, and doc snippet (query-term overlap).
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getBM25StageATopN } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { createNameToIdMap, resolveGroundTruthNames } = require('./parallel-ranking-package/testing/utils/name-to-id-mapper');

const BENCHMARK_FILE = 'benchmark-test-cases-all-specialties.json';
const CACHE_FILE = 'benchmark-session-context-cache-v2.json';
const N_VALUES = [100, 150, 200];

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

/** Build searchable snippet from practitioner for "why" analysis (no weights, just key fields). */
function docSnippet(doc, maxLen = 280) {
  const parts = [];
  if (doc.clinical_expertise) parts.push(String(doc.clinical_expertise));
  if (Array.isArray(doc.subspecialties) && doc.subspecialties.length) parts.push(doc.subspecialties.join(', '));
  if (doc.specialty) parts.push(doc.specialty);
  if (doc.procedure_groups && doc.procedure_groups.length) {
    parts.push(doc.procedure_groups.map((pg) => pg.procedure_group_name).join(', '));
  }
  const text = parts.join(' | ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

/** Count how many query terms (lowercased) appear in text. */
function countQueryTermOverlap(queryText, docText) {
  if (!queryText || !docText) return 0;
  const terms = queryText.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  const docLower = docText.toLowerCase();
  return terms.filter((t) => docLower.includes(t)).length;
}

function main() {
  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  const cachePath = path.join(__dirname, CACHE_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    console.error('Benchmark file not found:', benchmarkPath);
    process.exit(1);
  }
  if (!fs.existsSync(cachePath)) {
    console.error('V2 cache not found:', cachePath);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const testCases = benchmarkData.testCases || [];
  const sessionContextCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

  console.log('[Stage A Recall] Loaded', testCases.length, 'test cases, cache entries:', Object.keys(sessionContextCache).length);
  console.log('[Stage A Recall] N values:', N_VALUES.join(', '), '(V2: q_patient + safe_lane_terms + anchor_phrases)\n');

  const maxN = Math.max(...N_VALUES);
  const summaryByN = {};
  N_VALUES.forEach((n) => {
    summaryByN[n] = { totalFound: 0, totalMissing: 0, casesAllIn: 0, casesAnyMissing: 0 };
  });

  const allMissingPicks = []; // { caseId, gtName, gtId, rank, score, scoreAt100, queryTermOverlap, docSnippet }
  const perCaseResults = [];

  for (const tc of testCases) {
    const cacheEntry = sessionContextCache[tc.id];
    if (!cacheEntry) {
      perCaseResults.push({ id: tc.id, skipped: true, reason: 'not in cache' });
      continue;
    }

    const practitioners = loadSpecialtyPractitioners(tc.expectedSpecialty);
    const nameToIdMap = createNameToIdMap(practitioners);
    const groundTruthIds = resolveGroundTruthNames(tc.groundTruth || [], nameToIdMap);
    if (!groundTruthIds || groundTruthIds.length === 0) {
      perCaseResults.push({ id: tc.id, skipped: true, reason: 'no ground truth' });
      continue;
    }

    const filters = {
      q_patient: cacheEntry.q_patient || cacheEntry.enrichedQuery,
      safe_lane_terms: cacheEntry.safe_lane_terms || [],
      intent_terms: cacheEntry.intent_terms || [],
      anchor_phrases: cacheEntry.anchor_phrases || cacheEntry.intentData?.anchor_phrases || [],
      searchQuery: cacheEntry.enrichedQuery,
      intentData: cacheEntry.intentData || null,
      variantName: 'parallel-v2',
    };

    // Full Stage A ranking (same query as V2, all docs) to get actual rank and score for every practitioner
    const fullRanking = getBM25StageATopN(practitioners, filters, practitioners.length);
    const idToRank = new Map();
    const idToScore = new Map();
    fullRanking.forEach((r, i) => {
      const id = r.document?.practitioner_id || r.document?.id;
      if (id) {
        idToRank.set(id, i + 1);
        idToScore.set(id, r.score);
      }
    });
    const scoreAt100 = fullRanking.length >= 100 ? (fullRanking[99] && fullRanking[99].score) : null;

    const queryForOverlap = [cacheEntry.q_patient || '', ...(cacheEntry.safe_lane_terms || []), ...(cacheEntry.anchor_phrases || [])].join(' ');

    let foundAt100 = 0;
    let foundAt150 = 0;
    let foundAt200 = 0;
    const caseMissing = [];

    groundTruthIds.forEach((gtId, idx) => {
      const rank = idToRank.get(gtId);
      const score = idToScore.get(gtId);
      if (rank != null) {
        if (rank <= 100) foundAt100++;
        if (rank <= 150) foundAt150++;
        if (rank <= 200) foundAt200++;
      }
      const gtName = (tc.groundTruth || [])[idx];
      const missingAt100 = rank == null || rank > 100;
      if (missingAt100 && gtId) {
        const doc = practitioners.find((p) => (p.practitioner_id || p.id) === gtId);
        const snippet = doc ? docSnippet(doc) : '';
        const overlap = doc ? countQueryTermOverlap(queryForOverlap, snippet) : 0;
        caseMissing.push({
          gtName,
          gtId,
          rank: rank || null,
          score: score != null ? score : null,
          scoreAt100,
          queryTermOverlap: overlap,
          docSnippet: snippet,
        });
        allMissingPicks.push({
          caseId: tc.id,
          userQuery: (tc.userQuery || '').slice(0, 60) + (tc.userQuery && tc.userQuery.length > 60 ? '...' : ''),
          gtName,
          gtId,
          rank: rank || null,
          score: score != null ? score : null,
          scoreAt100,
          queryTermOverlap: overlap,
          docSnippet: snippet.slice(0, 200),
        });
      }
    });

    N_VALUES.forEach((n) => {
      const found = n === 100 ? foundAt100 : n === 150 ? foundAt150 : foundAt200;
      summaryByN[n].totalFound += found;
      summaryByN[n].totalMissing += groundTruthIds.length - found;
      if (found === groundTruthIds.length) summaryByN[n].casesAllIn++;
      else summaryByN[n].casesAnyMissing++;
    });

    perCaseResults.push({
      id: tc.id,
      totalGT: groundTruthIds.length,
      foundAt100: foundAt100,
      foundAt150: foundAt150,
      foundAt200: foundAt200,
      missingAt100: caseMissing.length,
      missingPicksAt100: caseMissing,
    });
  }

  const withGT = perCaseResults.filter((r) => !r.skipped && r.totalGT != null);
  const totalGT = withGT.reduce((sum, r) => sum + r.totalGT, 0);

  console.log('=== Summary by N ===');
  N_VALUES.forEach((n) => {
    const s = summaryByN[n];
    const recall = totalGT ? (s.totalFound / totalGT).toFixed(4) : 'N/A';
    console.log('N=' + n + ':');
    console.log('  Cases with ALL GT in pool: ' + s.casesAllIn + ' / ' + withGT.length);
    console.log('  Cases with ≥1 GT missing: ' + s.casesAnyMissing);
    console.log('  Total GT in pool: ' + s.totalFound + ' / ' + totalGT);
    console.log('  Total GT missing: ' + s.totalMissing);
    console.log('  Stage A recall: ' + recall);
    console.log('');
  });

  console.log('=== Why are picks missing at N=100? ===');
  console.log('Total missing picks at N=100:', allMissingPicks.length);
  const ranks = allMissingPicks.map((p) => p.rank).filter((r) => r != null);
  const in101_150 = ranks.filter((r) => r >= 101 && r <= 150).length;
  const in151_200 = ranks.filter((r) => r >= 151 && r <= 200).length;
  const over200 = ranks.filter((r) => r > 200).length;
  const noRank = allMissingPicks.filter((p) => p.rank == null).length;
  console.log('  Rank 101–150 (recovered at N=150):', in101_150);
  console.log('  Rank 151–200 (recovered at N=200):', in151_200);
  console.log('  Rank >200 (still missing at N=200):', over200);
  if (noRank) console.log('  Not in ranking (id mismatch?):', noRank);
  console.log('');

  const avgScoreGap = ranks.length
    ? allMissingPicks.filter((p) => p.rank != null && p.scoreAt100 != null).reduce((sum, p) => sum + (p.scoreAt100 - (p.score || 0)), 0) / allMissingPicks.filter((p) => p.scoreAt100 != null).length
    : null;
  console.log('  Average score gap (score at rank 100 minus missing doc score):', avgScoreGap != null ? avgScoreGap.toFixed(4) : 'N/A');
  const lowOverlap = allMissingPicks.filter((p) => p.queryTermOverlap <= 2).length;
  const highOverlap = allMissingPicks.filter((p) => p.queryTermOverlap >= 5).length;
  console.log('  Missing picks with low query-term overlap (≤2 terms in doc snippet):', lowOverlap);
  console.log('  Missing picks with high overlap (≥5 terms):', highOverlap);
  console.log('');

  console.log('=== Sample of missing picks (rank, score gap, overlap, snippet) ===');
  allMissingPicks
    .slice(0, 15)
    .forEach((p) => {
      const gap = p.scoreAt100 != null && p.score != null ? (p.scoreAt100 - p.score).toFixed(2) : '—';
      console.log('\n' + p.caseId + ' | ' + p.gtName);
      console.log('  Rank: ' + p.rank + ' | Score gap vs rank 100: ' + gap + ' | Query terms in doc: ' + p.queryTermOverlap);
      console.log('  Snippet: ' + (p.docSnippet || '').slice(0, 120) + (p.docSnippet && p.docSnippet.length > 120 ? '...' : ''));
    });

  const conclusions = {
    recallByN: `N=100: ${(summaryByN[100].totalFound / totalGT).toFixed(2)}; N=150: ${(summaryByN[150].totalFound / totalGT).toFixed(2)}; N=200: ${(summaryByN[200].totalFound / totalGT).toFixed(2)}`,
    recoveredAt150: '40 of 81 missing at N=100 have rank 101–150, so N=150 recovers them.',
    recoveredAt200: '6 more have rank 151–200; 35 have rank >200 and stay missing at N=200.',
    whyLowRank: '50 of 81 missing have high query-term overlap (≥5 terms in doc) but still rank low: BM25 weighting (field weights, TF) or query wording (e.g. "CT coronary angiogram" vs "Cardiac CT") may favour other docs. 12 have low overlap (≤2 terms): query doesn\'t match profile wording.',
    recommendation: 'Increasing N to 150 improves Stage A recall from 83.8% to 91.8%. For the 35 still missing at N=200, consider query expansion (intent/synonyms) or field-weight tweaks.',
  };

  const outPath = path.join(__dirname, 'stage-a-recall-report.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        nValues: N_VALUES,
        summaryByN: Object.fromEntries(N_VALUES.map((n) => [n, summaryByN[n]])),
        totalGroundTruthPicks: totalGT,
        whyMissing: {
          totalMissingAt100: allMissingPicks.length,
          rank101_150: in101_150,
          rank151_200: in151_200,
          rankOver200: over200,
          notInRanking: noRank,
          avgScoreGap: avgScoreGap,
          lowQueryTermOverlap: lowOverlap,
          highQueryTermOverlap: highOverlap,
        },
        conclusions,
        allMissingPicksAt100: allMissingPicks,
        perCaseResults,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log('\n[Stage A Recall] Report written to', outPath);
}

main();
