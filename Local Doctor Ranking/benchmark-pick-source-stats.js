/**
 * Compute benchmark pick source statistics: for each ground-truth pick, determine
 * whether they came from full ranking, BM25-only, keyword-overlap, or random when
 * building the candidate pool. Uses session context cache (no LLM calls).
 * Replicates the pool logic from generate-benchmark-ground-truth.js with source tagging.
 *
 * Usage: node benchmark-pick-source-stats.js [--strategy=hybrid_bm25]
 * Env: CANDIDATE_POOL_STRATEGY (default hybrid_bm25). Use same as when benchmark was generated.
 * Output: benchmark-pick-source-stats.json
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getBM25Shortlist, rankPractitionersBM25, normalizeMedicalQuery } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { createNameToIdMap, resolveGroundTruthNames, findPractitionerByName } = require('./parallel-ranking-package/testing/utils/name-to-id-mapper');

const BENCHMARK_FILE = 'benchmark-test-cases-all-specialties.json';
const CACHE_FILE = 'benchmark-session-context-cache.json';
const OUTPUT_FILE = 'benchmark-pick-source-stats.json';

const CANDIDATE_POOL_STRATEGY = process.env.CANDIDATE_POOL_STRATEGY || 'hybrid_bm25';
const HYBRID_RANKING_TOP = 18;
const HYBRID_BM25_TOP = 35;
const CANDIDATE_POOL_CAP = 50;
const MULTI_SOURCE = {
  RANKING_TOP: 15,
  BM25_TOP: 18,
  KEYWORD_TOP: 12,
  RANDOM_COUNT: 10,
  CAP: 50,
};

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

function buildBm25OnlyQuery(sessionContext) {
  const q_patient = sessionContext.q_patient || '';
  const anchor_phrases = sessionContext.anchor_phrases || [];
  const q_bm25_parts = [q_patient];
  const q_bm25 = q_bm25_parts.join(' ').trim();
  const norm = normalizeMedicalQuery(q_bm25);
  let q = norm.normalizedQuery;
  if (anchor_phrases.length > 0) q = q + ' ' + anchor_phrases.join(' ');
  return q;
}

function simpleTokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((t) => t.length >= 2);
}

function buildSearchableText(p) {
  const parts = [
    p.specialty,
    Array.isArray(p.subspecialties) ? p.subspecialties.join(' ') : '',
    p.clinical_expertise || '',
    p.description || p.about || '',
    (p.procedure_groups || []).map((pg) => (typeof pg === 'object' ? pg.procedure_group_name : pg)).join(' '),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function rankByKeywordOverlap(practitioners, queryText, topN) {
  const queryTerms = [...new Set(simpleTokenize(queryText))];
  if (queryTerms.length === 0) return practitioners.slice(0, topN).map((p) => ({ document: p, score: 0 }));
  const scored = practitioners.map((p) => {
    const text = buildSearchableText(p);
    const count = queryTerms.filter((term) => text.includes(term)).length;
    return { document: p, score: count };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/**
 * Build candidate pool and return { poolDocuments, sourceById }.
 * sourceById: practitioner_id -> 'ranking' | 'bm25_only' | 'keyword' | 'random'
 */
function buildPoolWithSources(practitioners, sessionContext, strategy) {
  const sourceById = new Map();
  const filters = {
    q_patient: sessionContext.q_patient,
    intent_terms: sessionContext.intent_terms,
    anchor_phrases: sessionContext.anchor_phrases,
    intentData: sessionContext.intentData,
    variantName: 'parallel',
  };

  if (strategy === 'ranking_only') {
    const rankingResult = getBM25Shortlist(practitioners, filters, 30);
    rankingResult.results.forEach((r) => {
      const id = r.document.practitioner_id || r.document.id;
      sourceById.set(id, 'ranking');
    });
    return { poolDocuments: rankingResult.results.map((r) => r.document), sourceById };
  }

  if (strategy === 'multi_source') {
    const rankingResult = getBM25Shortlist(practitioners, filters, MULTI_SOURCE.RANKING_TOP);
    const fromRanking = rankingResult.results.map((r) => r.document);
    const seenIds = new Set();
    const combined = [];
    fromRanking.forEach((p) => {
      const id = p.practitioner_id || p.id;
      if (!seenIds.has(id)) { seenIds.add(id); combined.push(p); sourceById.set(id, 'ranking'); }
    });

    const qBm25 = buildBm25OnlyQuery(sessionContext);
    const bm25Only = rankPractitionersBM25(practitioners, qBm25, 1.5, 0.75, null);
    for (const item of bm25Only) {
      if (combined.length >= MULTI_SOURCE.CAP) break;
      const id = item.document.practitioner_id || item.document.id;
      if (!seenIds.has(id)) { seenIds.add(id); combined.push(item.document); sourceById.set(id, 'bm25_only'); }
    }

    const qPatient = sessionContext.q_patient || '';
    const keywordRanked = rankByKeywordOverlap(practitioners, qPatient, MULTI_SOURCE.KEYWORD_TOP * 3);
    for (const item of keywordRanked) {
      if (combined.length >= MULTI_SOURCE.CAP) break;
      const id = item.document.practitioner_id || item.document.id;
      if (!seenIds.has(id)) { seenIds.add(id); combined.push(item.document); sourceById.set(id, 'keyword'); }
    }

    const rest = practitioners.filter((p) => !seenIds.has(p.practitioner_id || p.id));
    const shuffled = rest.slice().sort(() => Math.random() - 0.5);
    let added = 0;
    for (const p of shuffled) {
      if (added >= MULTI_SOURCE.RANDOM_COUNT || combined.length >= MULTI_SOURCE.CAP) break;
      const id = p.practitioner_id || p.id;
      if (!seenIds.has(id)) { seenIds.add(id); combined.push(p); sourceById.set(id, 'random'); added++; }
    }
    return { poolDocuments: combined.slice(0, MULTI_SOURCE.CAP), sourceById };
  }

  // hybrid_bm25 or hybrid_random
  const rankingResult = getBM25Shortlist(practitioners, filters, strategy === 'hybrid_random' ? 30 : HYBRID_RANKING_TOP);
  const fromRankingAll = rankingResult.results.map((r) => r.document);
  const fromRanking = fromRankingAll.slice(0, HYBRID_RANKING_TOP);
  const seenIds = new Set();
  const combined = [];
  fromRanking.forEach((p) => {
    const id = p.practitioner_id || p.id;
    if (!seenIds.has(id)) { seenIds.add(id); combined.push(p); sourceById.set(id, 'ranking'); }
  });

  if (strategy === 'hybrid_bm25') {
    const qBm25 = buildBm25OnlyQuery(sessionContext);
    const bm25Only = rankPractitionersBM25(practitioners, qBm25, 1.5, 0.75, null);
    for (const item of bm25Only) {
      if (combined.length >= CANDIDATE_POOL_CAP) break;
      const id = item.document.practitioner_id || item.document.id;
      if (!seenIds.has(id)) { seenIds.add(id); combined.push(item.document); sourceById.set(id, 'bm25_only'); }
    }
  } else if (strategy === 'hybrid_random') {
    const excludedIds = new Set(fromRankingAll.map((p) => p.practitioner_id || p.id));
    const rest = practitioners.filter((p) => !excludedIds.has(p.practitioner_id || p.id));
    const shuffled = rest.slice().sort(() => Math.random() - 0.5);
    let added = 0;
    for (const p of shuffled) {
      if (added >= 18 || combined.length >= CANDIDATE_POOL_CAP) break;
      const id = p.practitioner_id || p.id;
      if (!seenIds.has(id)) { seenIds.add(id); combined.push(p); sourceById.set(id, 'random'); added++; }
    }
  }

  return { poolDocuments: combined.slice(0, CANDIDATE_POOL_CAP), sourceById };
}

function main() {
  const strategyArg = process.argv.find((a) => a.startsWith('--strategy='));
  const strategy = strategyArg ? strategyArg.slice(11) : CANDIDATE_POOL_STRATEGY;

  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  const cachePath = path.join(__dirname, CACHE_FILE);
  if (!fs.existsSync(benchmarkPath)) { console.error('Benchmark file not found.'); process.exit(1); }
  if (!fs.existsSync(cachePath)) { console.error('Session context cache not found. Run build-session-context-cache.js'); process.exit(1); }

  const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const testCases = benchmark.testCases || [];

  const practitionerCache = new Map();
  const perQuestion = [];
  const counts = { ranking: 0, bm25_only: 0, keyword: 0, random: 0, not_in_pool: 0 };

  for (const tc of testCases) {
    const specialty = tc.expectedSpecialty;
    if (!practitionerCache.has(specialty)) practitionerCache.set(specialty, loadSpecialtyPractitioners(specialty));
    const practitioners = practitionerCache.get(specialty);
    const sessionContext = cache[tc.id];
    if (!sessionContext) {
      console.warn(`No cache for ${tc.id}, skipping.`);
      continue;
    }

    const { sourceById } = buildPoolWithSources(practitioners, sessionContext, strategy);
    const groundTruthNames = tc.groundTruth || [];
    const pickSources = [];
    for (const name of groundTruthNames) {
      const p = findPractitionerByName(name, practitioners);
      const id = p ? (p.practitioner_id || p.id) : null;
      const source = id ? (sourceById.get(id) || 'not_in_pool') : 'not_in_pool';
      pickSources.push({ name, id, source });
      counts[source] = (counts[source] || 0) + 1;
    }
    perQuestion.push({ id: tc.id, pickSources });
  }

  const totalPicks = perQuestion.length * 5;
  const summary = {
    strategy,
    totalQuestions: perQuestion.length,
    totalPicks,
    bySource: {
      ranking: { count: counts.ranking, pct: totalPicks ? (100 * counts.ranking / totalPicks).toFixed(1) + '%' : '0%' },
      bm25_only: { count: counts.bm25_only, pct: totalPicks ? (100 * counts.bm25_only / totalPicks).toFixed(1) + '%' : '0%' },
      keyword: { count: counts.keyword || 0, pct: totalPicks ? (100 * (counts.keyword || 0) / totalPicks).toFixed(1) + '%' : '0%' },
      random: { count: counts.random || 0, pct: totalPicks ? (100 * (counts.random || 0) / totalPicks).toFixed(1) + '%' : '0%' },
      not_in_pool: { count: counts.not_in_pool || 0, pct: totalPicks ? (100 * (counts.not_in_pool || 0) / totalPicks).toFixed(1) + '%' : '0%' },
    },
  };

  const output = { generatedAt: new Date().toISOString(), summary, perQuestion };
  const outPath = path.join(__dirname, OUTPUT_FILE);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

  console.log('[Pick sources] Strategy:', strategy);
  console.log('[Pick sources] Total picks:', totalPicks);
  console.log('[Pick sources] By source:', summary.bySource);
  console.log('[Pick sources] Written to', OUTPUT_FILE);
}

main();
