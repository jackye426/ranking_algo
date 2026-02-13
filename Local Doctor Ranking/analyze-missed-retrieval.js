/**
 * Analyze benchmark picks that are MISSED by Stage A retrieval at N=100 and N=150.
 * Uses best-stage-a-recall-weights. Discovers tendencies: rank distribution, query-term overlap,
 * which fields contain matches (high- vs low-weighted).
 *
 * Usage: node analyze-missed-retrieval.js [--weights=best-stage-a-recall-weights.json] [--out=missed-retrieval-report.json]
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getBM25StageATopN, parseClinicalExpertise } = require('./parallel-ranking-package/testing/services/local-bm25-service');
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

const HIGH_WEIGHT_FIELDS = ['expertise_procedures', 'expertise_conditions', 'expertise_interests', 'procedure_groups', 'specialty', 'subspecialties'];
const LOW_WEIGHT_FIELDS = ['description', 'about', 'name'];

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
  let outPath = path.join(__dirname, 'missed-retrieval-report.json');
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--weights=')) weights = path.isAbsolute(arg.slice(10)) ? arg.slice(10) : path.join(__dirname, arg.slice(10));
    else if (arg.startsWith('--out=')) outPath = path.isAbsolute(arg.slice(6)) ? arg.slice(6) : path.join(__dirname, arg.slice(6));
  }
  return { weights, outPath };
}

/** Tokenize for overlap: lowercased, drop short. */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

/** Count how many query terms appear in docText. */
function countOverlap(queryTerms, docText) {
  if (!docText || !queryTerms.length) return 0;
  const docLower = String(docText).toLowerCase();
  return queryTerms.filter((t) => docLower.includes(t)).length;
}

/** Per-field overlap for a doc. Returns { fieldName: count }. Uses parsed expertise (procedures, conditions, clinical_interests). */
function fieldOverlaps(doc, queryTerms) {
  const out = {};
  const parsed = parseClinicalExpertise(doc);
  const fieldTexts = {
    expertise_procedures: parsed.procedures,
    expertise_conditions: parsed.conditions,
    expertise_interests: parsed.clinical_interests,
    procedure_groups: Array.isArray(doc.procedure_groups) ? doc.procedure_groups.map((pg) => pg.procedure_group_name).join(' ') : '',
    specialty: doc.specialty || '',
    subspecialties: Array.isArray(doc.subspecialties) ? doc.subspecialties.join(' ') : (doc.subspecialties || ''),
    description: doc.description || '',
    about: doc.about || '',
    name: doc.name || '',
  };
  for (const [f, text] of Object.entries(fieldTexts)) {
    out[f] = countOverlap(queryTerms, text);
  }
  return out;
}

/** Which field has the most query-term matches? 'high' = one of HIGH_WEIGHT_FIELDS, 'low' = only in LOW_WEIGHT_FIELDS, 'mixed'. */
function dominantMatchField(fieldOverlaps) {
  let highSum = 0;
  let lowSum = 0;
  HIGH_WEIGHT_FIELDS.forEach((f) => { highSum += fieldOverlaps[f] || 0; });
  LOW_WEIGHT_FIELDS.forEach((f) => { lowSum += fieldOverlaps[f] || 0; });
  if (highSum > 0 && lowSum === 0) return 'high_only';
  if (highSum === 0 && lowSum > 0) return 'low_only';
  if (highSum > 0 && lowSum > 0) return 'mixed';
  return 'none';
}

function main() {
  const args = parseArgs();
  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  const cachePath = path.join(__dirname, CACHE_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    console.error('Benchmark file not found:', benchmarkPath);
    process.exit(1);
  }
  if (!fs.existsSync(cachePath)) {
    console.error('Cache not found:', cachePath);
    process.exit(1);
  }
  if (!fs.existsSync(args.weights)) {
    console.error('Weights file not found:', args.weights);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const testCases = benchmarkData.testCases || [];
  const sessionContextCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const rankingConfig = JSON.parse(fs.readFileSync(args.weights, 'utf8'));

  const missedAt100 = [];
  const missedAt150 = [];
  let totalGTPicks = 0;

  for (const tc of testCases) {
    const cacheEntry = sessionContextCache[tc.id];
    if (!cacheEntry) continue;

    const practitioners = loadSpecialtyPractitioners(tc.expectedSpecialty);
    const nameToIdMap = createNameToIdMap(practitioners);
    const groundTruthIds = resolveGroundTruthNames(tc.groundTruth || [], nameToIdMap);
    if (!groundTruthIds || groundTruthIds.length === 0) continue;

    const queryParts = [
      cacheEntry.q_patient || '',
      ...(cacheEntry.safe_lane_terms || []),
      ...(cacheEntry.anchor_phrases || cacheEntry.intentData?.anchor_phrases || []),
    ];
    const queryText = queryParts.join(' ');
    const queryTerms = tokenize(queryText);

    const filters = {
      q_patient: cacheEntry.q_patient || cacheEntry.enrichedQuery,
      safe_lane_terms: cacheEntry.safe_lane_terms || [],
      anchor_phrases: cacheEntry.anchor_phrases || cacheEntry.intentData?.anchor_phrases || [],
      searchQuery: cacheEntry.enrichedQuery,
      intentData: cacheEntry.intentData || null,
      variantName: 'parallel-v2',
      rankingConfig,
    };

    const fullRanking = getBM25StageATopN(practitioners, filters, practitioners.length);
    const scoreAt100 = fullRanking.length >= 100 ? (fullRanking[99] && fullRanking[99].score) : null;
    const scoreAt150 = fullRanking.length >= 150 ? (fullRanking[149] && fullRanking[149].score) : null;

    const idToRank = new Map();
    const idToScore = new Map();
    fullRanking.forEach((r, i) => {
      const id = r.document?.practitioner_id || r.document?.id;
      if (id) {
        idToRank.set(String(id), i + 1);
        idToScore.set(String(id), r.score);
      }
    });

    groundTruthIds.forEach((gtId, idx) => {
      totalGTPicks++;
      const sid = String(gtId);
      const rank = idToRank.get(sid);
      const score = idToScore.get(sid);
      const doc = practitioners.find((p) => String(p.practitioner_id || p.id) === sid);
      const fo = doc ? fieldOverlaps(doc, queryTerms) : {};
      const totalOverlap = Object.values(fo).reduce((s, n) => s + n, 0);
      const dominant = doc ? dominantMatchField(fo) : 'none';
      const gtName = (tc.groundTruth || [])[idx];

      const entry = {
        caseId: tc.id,
        userQuery: (tc.userQuery || '').slice(0, 70),
        gtName,
        gtId: sid,
        rank: rank ?? null,
        score: score ?? null,
        scoreAt100,
        scoreAt150,
        queryTermOverlap: totalOverlap,
        dominantField: dominant,
        fieldOverlaps: fo,
      };

      const missing100 = rank == null || rank > 100;
      const missing150 = rank == null || rank > 150;
      if (missing100) missedAt100.push(entry);
      if (missing150) missedAt150.push(entry);
    });
  }

  // --- Tendencies: missed at 100 ---
  const rankBuckets100 = { rank101_150: 0, rank151_200: 0, rank201_300: 0, rank301_plus: 0, noRank: 0 };
  const overlapBuckets100 = { overlap0_2: 0, overlap3_4: 0, overlap5_plus: 0 };
  const dominantBuckets100 = { high_only: 0, low_only: 0, mixed: 0, none: 0 };
  let scoreGapSum100 = 0;
  let scoreGapCount100 = 0;

  missedAt100.forEach((p) => {
    const r = p.rank;
    if (r == null) rankBuckets100.noRank++;
    else if (r <= 150) rankBuckets100.rank101_150++;
    else if (r <= 200) rankBuckets100.rank151_200++;
    else if (r <= 300) rankBuckets100.rank201_300++;
    else rankBuckets100.rank301_plus++;

    const o = p.queryTermOverlap;
    if (o <= 2) overlapBuckets100.overlap0_2++;
    else if (o <= 4) overlapBuckets100.overlap3_4++;
    else overlapBuckets100.overlap5_plus++;

    dominantBuckets100[p.dominantField] = (dominantBuckets100[p.dominantField] || 0) + 1;

    if (p.scoreAt100 != null && p.score != null) {
      scoreGapSum100 += p.scoreAt100 - p.score;
      scoreGapCount100++;
    }
  });

  // --- Tendencies: missed at 150 ---
  const rankBuckets150 = { rank151_200: 0, rank201_300: 0, rank301_500: 0, rank501_plus: 0, noRank: 0 };
  const overlapBuckets150 = { overlap0_2: 0, overlap3_4: 0, overlap5_plus: 0 };
  const dominantBuckets150 = { high_only: 0, low_only: 0, mixed: 0, none: 0 };
  let scoreGapSum150 = 0;
  let scoreGapCount150 = 0;

  missedAt150.forEach((p) => {
    const r = p.rank;
    if (r == null) rankBuckets150.noRank++;
    else if (r <= 200) rankBuckets150.rank151_200++;
    else if (r <= 300) rankBuckets150.rank201_300++;
    else if (r <= 500) rankBuckets150.rank301_500++;
    else rankBuckets150.rank501_plus++;

    const o = p.queryTermOverlap;
    if (o <= 2) overlapBuckets150.overlap0_2++;
    else if (o <= 4) overlapBuckets150.overlap3_4++;
    else overlapBuckets150.overlap5_plus++;

    dominantBuckets150[p.dominantField] = (dominantBuckets150[p.dominantField] || 0) + 1;

    if (p.scoreAt150 != null && p.score != null) {
      scoreGapSum150 += p.scoreAt150 - p.score;
      scoreGapCount150++;
    }
  });

  const avgGap100 = scoreGapCount100 ? scoreGapSum100 / scoreGapCount100 : null;
  const avgGap150 = scoreGapCount150 ? scoreGapSum150 / scoreGapCount150 : null;

  // --- Low-weight field theme: which weak field has matches most often among missed picks? ---
  const lowFieldStats = (arr, label) => {
    const counts = {}; // field -> number of picks with ≥1 overlap in that field
    const sums = {};   // field -> sum of overlap in that field
    LOW_WEIGHT_FIELDS.forEach((f) => { counts[f] = 0; sums[f] = 0; });
    arr.forEach((p) => {
      const fo = p.fieldOverlaps || {};
      LOW_WEIGHT_FIELDS.forEach((f) => {
        const n = fo[f] || 0;
        if (n >= 1) counts[f]++;
        sums[f] += n;
      });
    });
    return { counts, sums, n: arr.length };
  };
  const low100 = lowFieldStats(missedAt100, 'missed at 100');
  const low150 = lowFieldStats(missedAt150, 'missed at 150');

  // --- Console report ---
  console.log('=== BM25 missed picks: N=100 and N=150 ===\n');
  console.log('Weights:', args.weights);
  console.log('Total ground-truth picks:', totalGTPicks);
  console.log('Missed at N=100:', missedAt100.length);
  console.log('Missed at N=150:', missedAt150.length);
  console.log('');

  console.log('--- Tendency: MISSED AT N=100 ---');
  console.log('Rank distribution (where do missed picks actually rank?):');
  console.log('  Rank 101–150 (would recover at N=150):', rankBuckets100.rank101_150);
  console.log('  Rank 151–200:', rankBuckets100.rank151_200);
  console.log('  Rank 201–300:', rankBuckets100.rank201_300);
  console.log('  Rank >300:', rankBuckets100.rank301_plus);
  console.log('  Not in ranking:', rankBuckets100.noRank);
  console.log('Query-term overlap (terms from query present in doc):');
  console.log('  Low (0–2 terms):', overlapBuckets100.overlap0_2, '— lexical gap: query and doc use different wording');
  console.log('  Medium (3–4):', overlapBuckets100.overlap3_4);
  console.log('  High (5+):', overlapBuckets100.overlap5_plus, '— doc matches query but BM25 ranks others higher (field weights / TF)');
  console.log('Where do query terms appear in the doc?');
  console.log('  Only in high-weight fields (clinical_expertise, procedure_groups, specialty, subspecialties):', dominantBuckets100.high_only);
  console.log('  Only in low-weight fields (description, about, etc.):', dominantBuckets100.low_only);
  console.log('  Mixed:', dominantBuckets100.mixed);
  console.log('  None:', dominantBuckets100.none);
  console.log('  Avg score gap (threshold at rank 100 minus doc score):', avgGap100 != null ? avgGap100.toFixed(4) : 'N/A');
  console.log('');

  console.log('--- Tendency: MISSED AT N=150 ---');
  console.log('Rank distribution:');
  console.log('  Rank 151–200:', rankBuckets150.rank151_200);
  console.log('  Rank 201–300:', rankBuckets150.rank201_300);
  console.log('  Rank 301–500:', rankBuckets150.rank301_500);
  console.log('  Rank >500:', rankBuckets150.rank501_plus);
  console.log('  Not in ranking:', rankBuckets150.noRank);
  console.log('Query-term overlap:');
  console.log('  Low (0–2):', overlapBuckets150.overlap0_2);
  console.log('  Medium (3–4):', overlapBuckets150.overlap3_4);
  console.log('  High (5+):', overlapBuckets150.overlap5_plus);
  console.log('Dominant field: high_only:', dominantBuckets150.high_only, '| low_only:', dominantBuckets150.low_only, '| mixed:', dominantBuckets150.mixed, '| none:', dominantBuckets150.none);
  console.log('  Avg score gap vs rank 150:', avgGap150 != null ? avgGap150.toFixed(4) : 'N/A');
  console.log('');

  console.log('--- Summary tendency ---');
  const lowOverlapPct100 = missedAt100.length ? (100 * overlapBuckets100.overlap0_2 / missedAt100.length).toFixed(0) : 0;
  const highOverlapPct100 = missedAt100.length ? (100 * overlapBuckets100.overlap5_plus / missedAt100.length).toFixed(0) : 0;
  const lowOverlapPct150 = missedAt150.length ? (100 * overlapBuckets150.overlap0_2 / missedAt150.length).toFixed(0) : 0;
  const highOverlapPct150 = missedAt150.length ? (100 * overlapBuckets150.overlap5_plus / missedAt150.length).toFixed(0) : 0;
  console.log('At N=100: ' + lowOverlapPct100 + '% of missed picks have low query-term overlap (wording mismatch); ' + highOverlapPct100 + '% have high overlap (BM25 favours others).');
  console.log('At N=150: ' + lowOverlapPct150 + '% low overlap; ' + highOverlapPct150 + '% high overlap.');
  if (dominantBuckets150.low_only > 0 || dominantBuckets100.low_only > 0) {
    console.log('Many missed picks match the query only in low-weighted fields (description/about) — boosting those fields or expanding query may help.');
  }

  console.log('--- Low-weight field theme (among missed profiles) ---');
  console.log('Among missed at N=100 (' + low100.n + ' picks), how often does each weak field have ≥1 query-term match:');
  LOW_WEIGHT_FIELDS.forEach((f) => {
    const count = low100.counts[f];
    const pct = low100.n ? (100 * count / low100.n).toFixed(0) : 0;
    const avg100 = low100.n ? (low100.sums[f] / low100.n).toFixed(1) : '0';
    console.log('  ' + f + ': ' + count + '/' + low100.n + ' (' + pct + '%) with ≥1 match, avg overlap ' + avg100);
  });
  console.log('Among missed at N=150 (' + low150.n + ' picks):');
  LOW_WEIGHT_FIELDS.forEach((f) => {
    const count = low150.counts[f];
    const pct = low150.n ? (100 * count / low150.n).toFixed(0) : 0;
    const avg150 = low150.n ? (low150.sums[f] / low150.n).toFixed(1) : '0';
    console.log('  ' + f + ': ' + count + '/' + low150.n + ' (' + pct + '%) with ≥1 match, avg overlap ' + avg150);
  });
  const topLow100 = LOW_WEIGHT_FIELDS.slice().sort((a, b) => low100.counts[b] - low100.counts[a])[0];
  const topLow150 = LOW_WEIGHT_FIELDS.slice().sort((a, b) => low150.counts[b] - low150.counts[a])[0];
  console.log('Common theme: among missed at 100 the weak field with most picks having a match is "' + topLow100 + '"; among missed at 150 it is "' + topLow150 + '".');

  const report = {
    totalGTPicks,
    missedAt100: missedAt100.length,
    missedAt150: missedAt150.length,
    tendencyAt100: { rankBuckets: rankBuckets100, overlapBuckets: overlapBuckets100, dominantField: dominantBuckets100, avgScoreGap: avgGap100 },
    tendencyAt150: { rankBuckets: rankBuckets150, overlapBuckets: overlapBuckets150, dominantField: dominantBuckets150, avgScoreGap: avgGap150 },
    lowWeightFieldTheme: {
      missedAt100: { counts: low100.counts, sums: low100.sums, n: low100.n, topField: topLow100 },
      missedAt150: { counts: low150.counts, sums: low150.sums, n: low150.n, topField: topLow150 },
    },
    sampleMissedAt100: missedAt100.slice(0, 20),
    sampleMissedAt150: missedAt150.slice(0, 20),
    allMissedAt100: missedAt100,
    allMissedAt150: missedAt150,
  };
  fs.writeFileSync(args.outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nReport written to', args.outPath);
}

main();
