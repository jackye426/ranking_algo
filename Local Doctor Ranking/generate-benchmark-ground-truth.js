/**
 * Generate benchmark ground truth: for each question, pre-filter with current
 * ranking (top 30), then call advanced LLM to pick 5 best practitioner_id in order.
 * Output: benchmark JSON in same schema as benchmark-test-cases.json.
 *
 * Plan: Option C – human questions (from question bank), LLM picks 5 from 30 candidates.
 * Requires: OPENAI_API_KEY, question bank CSVs, specialty JSONs.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getQuestionBank } = require('./load-question-bank');
const { getSessionContextParallel } = require('./parallel-ranking-package/algorithm/session-context-variants');
const {
  getBM25Shortlist,
  rankPractitionersBM25,
  normalizeMedicalQuery,
} = require('./parallel-ranking-package/testing/services/local-bm25-service');

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SHORTLIST_SIZE = 30;
const NUM_PICKS = 5;
/** Benchmark LLM: forced to gpt-5.1 (higher TPM). */
const BENCHMARK_LLM_MODEL = 'gpt-5.1';

/**
 * Candidate pool strategy to reduce selection bias:
 * - ranking_only: top 30 from current full ranking (original).
 * - hybrid_bm25: top 20 from full ranking + top 40 from BM25-only; union dedupe, cap 50.
 * - hybrid_random: top 20 from full ranking + 20 random from practitioners not in top 30; union, cap 45.
 * - multi_source: top 15 full ranking + top 20 BM25-only + top 15 keyword-overlap + 10 random; union dedupe, cap 55. Mixes several matching processes to minimize bias.
 */
const CANDIDATE_POOL_STRATEGY = process.env.CANDIDATE_POOL_STRATEGY || 'hybrid_bm25';
const HYBRID_RANKING_TOP = 18;
const HYBRID_BM25_TOP = 35;
const HYBRID_RANDOM_COUNT = 18;
const CANDIDATE_POOL_CAP = 50;
const MULTI_SOURCE = {
  RANKING_TOP: 15,
  BM25_TOP: 18,
  KEYWORD_TOP: 12,
  RANDOM_COUNT: 10,
  CAP: 50,
};
/* Redistributed for cap 50: 15 ranking + 18 BM25 + 12 keyword + 10 random; union dedupe, cap 50. */

/** Specialty name (from question bank) -> specialty JSON filename (no path). */
const SPECIALTY_TO_JSON = {
  'Cardiology': 'cardiology.json',
  'General surgery': 'general-surgery.json',
  'Obstetrics and gynaecology': 'obstetrics-and-gynaecology.json',
  'Ophthalmology': 'ophthalmology.json',
  'Trauma & orthopaedic surgery': 'trauma-and-orthopaedic-surgery.json',
};

function slugForId(specialty) {
  const m = {
    'Cardiology': 'cardio',
    'General surgery': 'general',
    'Obstetrics and gynaecology': 'obsgynae',
    'Ophthalmology': 'ophthal',
    'Trauma & orthopaedic surgery': 'ortho',
  };
  return m[specialty] || specialty.toLowerCase().replace(/\s*&\s*/g, '-and-').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 10);
}

/**
 * Load practitioners for a specialty from the pre-built specialty JSON.
 */
function loadSpecialtyPractitioners(specialty) {
  const filename = SPECIALTY_TO_JSON[specialty];
  if (!filename) throw new Error(`Unknown specialty: ${specialty}`);
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) throw new Error(`Specialty file not found: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.practitioners || [];
}

/**
 * Build BM25-only query string (q_patient + anchor phrases, normalized). Used for hybrid_bm25 to surface practitioners who score on BM25 but get demoted by rescoring.
 */
function buildBm25OnlyQuery(sessionContext) {
  const q_patient = sessionContext.q_patient || '';
  const anchor_phrases = sessionContext.anchor_phrases || [];
  const q_bm25_parts = [q_patient];
  const q_bm25 = q_bm25_parts.join(' ').trim();
  const norm = normalizeMedicalQuery(q_bm25);
  let q = norm.normalizedQuery;
  if (anchor_phrases.length > 0) {
    q = q + ' ' + anchor_phrases.join(' ');
  }
  return q;
}

/** Simple tokenize for keyword-overlap: lowercase, split on non-alphanumeric, keep terms length >= 2. */
function simpleTokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Build minimal searchable text from practitioner for keyword-overlap (no BM25 dependency). */
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

/**
 * Rank practitioners by simple keyword-overlap: count of query terms that appear in practitioner text. Different from BM25 (no IDF, no length norm).
 */
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
 * Get candidate pool for LLM to reduce selection bias. Strategy is set by CANDIDATE_POOL_STRATEGY.
 * - ranking_only: top 30 from full ranking (original).
 * - hybrid_bm25: top 20 from full ranking + top 40 from BM25-only; union dedupe, cap 50.
 * - hybrid_random: top 20 from full ranking + 20 random from practitioners not in top 30; union, cap 45.
 */
async function getCandidatePool(practitioners, userQuery) {
  const messages = [{ role: 'user', content: userQuery }];
  const sessionContext = await getSessionContextParallel(userQuery, messages, null);
  const filters = {
    q_patient: sessionContext.q_patient,
    intent_terms: sessionContext.intent_terms,
    anchor_phrases: sessionContext.anchor_phrases,
    intentData: sessionContext.intentData,
    variantName: 'parallel',
  };

  if (CANDIDATE_POOL_STRATEGY === 'ranking_only') {
    const rankingResult = getBM25Shortlist(practitioners, filters, SHORTLIST_SIZE);
    return rankingResult.results.map((r) => r.document);
  }

  if (CANDIDATE_POOL_STRATEGY === 'multi_source') {
    const rankingResult = getBM25Shortlist(practitioners, filters, MULTI_SOURCE.RANKING_TOP);
    const fromRanking = rankingResult.results.map((r) => r.document);
    const seenIds = new Set(fromRanking.map((p) => p.practitioner_id || p.id));
    const combined = [...fromRanking];

    const qBm25 = buildBm25OnlyQuery(sessionContext);
    const bm25Only = rankPractitionersBM25(practitioners, qBm25, 1.5, 0.75, null);
    for (const item of bm25Only) {
      if (combined.length >= MULTI_SOURCE.CAP) break;
      const id = item.document.practitioner_id || item.document.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combined.push(item.document);
      }
    }

    const qPatient = sessionContext.q_patient || '';
    const keywordRanked = rankByKeywordOverlap(practitioners, qPatient, MULTI_SOURCE.KEYWORD_TOP * 3);
    for (const item of keywordRanked) {
      if (combined.length >= MULTI_SOURCE.CAP) break;
      const id = item.document.practitioner_id || item.document.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combined.push(item.document);
      }
    }

    const rest = practitioners.filter((p) => !seenIds.has(p.practitioner_id || p.id));
    const shuffled = rest.slice().sort(() => Math.random() - 0.5);
    let added = 0;
    for (const p of shuffled) {
      if (added >= MULTI_SOURCE.RANDOM_COUNT || combined.length >= MULTI_SOURCE.CAP) break;
      const id = p.practitioner_id || p.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combined.push(p);
        added++;
      }
    }
    return combined.slice(0, MULTI_SOURCE.CAP);
  }

  const rankingResult = getBM25Shortlist(
    practitioners,
    filters,
    CANDIDATE_POOL_STRATEGY === 'hybrid_random' ? SHORTLIST_SIZE : HYBRID_RANKING_TOP
  );
  const fromRankingAll = rankingResult.results.map((r) => r.document);
  const fromRanking = fromRankingAll.slice(0, HYBRID_RANKING_TOP);
  const seenIds = new Set(fromRanking.map((p) => p.practitioner_id || p.id));
  const combined = [...fromRanking];

  if (CANDIDATE_POOL_STRATEGY === 'hybrid_bm25') {
    const qBm25 = buildBm25OnlyQuery(sessionContext);
    const bm25Only = rankPractitionersBM25(practitioners, qBm25, 1.5, 0.75, null);
    for (const item of bm25Only) {
      if (combined.length >= CANDIDATE_POOL_CAP) break;
      const id = item.document.practitioner_id || item.document.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combined.push(item.document);
      }
    }
  } else if (CANDIDATE_POOL_STRATEGY === 'hybrid_random') {
    const excludedIds = new Set(fromRankingAll.map((p) => p.practitioner_id || p.id));
    const rest = practitioners.filter((p) => !excludedIds.has(p.practitioner_id || p.id));
    const shuffled = rest.slice().sort(() => Math.random() - 0.5);
    let added = 0;
    for (const p of shuffled) {
      if (added >= HYBRID_RANDOM_COUNT || combined.length >= CANDIDATE_POOL_CAP) break;
      const id = p.practitioner_id || p.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combined.push(p);
        added++;
      }
    }
  }

  return combined.slice(0, CANDIDATE_POOL_CAP);
}

/** Max characters for bio/description in candidate card; no cap (no truncation). */
const MAX_BIO_CHARS = 1e7;

/** Number of questions to process in parallel (LLM calls). Respects TPM; 2–4 is usually safe. */
const CONCURRENCY = Math.max(1, parseInt(process.env.WORKERS || '3', 10));

const OUTPUT_FILENAME = 'benchmark-test-cases-all-specialties.json';

const SYSTEM_PICK_5 = `You are a medical search evaluator. You will receive a patient query and a list of candidate cards (JSON array). Each card has a single identifier you must use in your answer: practitioner_id.

Your task: Choose exactly 5 practitioners who are the best matches for the query, in order of relevance (best first).

Return ONLY a JSON object with this exact structure:
{"practitioner_ids": ["id1", "id2", "id3", "id4", "id5"]}

Rules:
- Use ONLY the practitioner_id value from each candidate card. Copy it exactly; do not use name or any other field as the identifier. Do not invent or modify IDs.
- Order matters: first is best match, fifth is fifth-best.
- Base your choice only on the fields present in each card: specialty, subspecialties, procedures, conditions, clinical_interests, description, qualifications, memberships.
- If fewer than 5 candidates are provided, return as many as possible in the same format.`;

/**
 * Parse clinical_expertise string into structured lists to reduce ambiguity and hallucination.
 * Format is "Procedure: X; Condition: Y; Clinical Interests: Z" (semicolon-separated).
 */
function parseClinicalExpertise(clinical_expertise) {
  const result = { procedures: [], conditions: [], clinical_interests: '' };
  if (!clinical_expertise || typeof clinical_expertise !== 'string') return result;
  const parts = clinical_expertise.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (!value) continue;
    if (key === 'procedure') result.procedures.push(value);
    else if (key === 'condition') result.conditions.push(value);
    else if (key === 'clinical interests') result.clinical_interests = value;
  }
  return result;
}

/**
 * Build a single candidate card for the LLM: strict schema, practitioner_id first, structured lists only.
 * No location data. Free text kept in clearly labeled fields. Parsed expertise reduces long blobs.
 */
function buildCandidateCard(p) {
  const id = p.practitioner_id || p.id;
  const proceduresFromGroups = (p.procedure_groups || []).map((pg) =>
    typeof pg === 'object' ? (pg.procedure_group_name || '').trim() : String(pg).trim()
  ).filter(Boolean);
  const parsed = parseClinicalExpertise(p.clinical_expertise || '');
  const procedures = [...new Set([...proceduresFromGroups, ...parsed.procedures])];
  let description = (p.description || p.about || '').trim();
  if (description.length > MAX_BIO_CHARS) {
    description = description.slice(0, MAX_BIO_CHARS).trim() + '…';
  }

  return {
    practitioner_id: id,
    name: p.name || null,
    specialty: p.specialty || null,
    subspecialties: Array.isArray(p.subspecialties) ? p.subspecialties : [],
    procedures,
    conditions: parsed.conditions,
    clinical_interests: parsed.clinical_interests || null,
    description: description || null,
    qualifications: Array.isArray(p.qualifications) ? p.qualifications : [],
    memberships: Array.isArray(p.professional_memberships) ? p.professional_memberships : (Array.isArray(p.memberships) ? p.memberships : []),
  };
}

/**
 * Call LLM to pick 5 best practitioner_id from the candidates. Returns array of 5 ids (or fewer if LLM returns less).
 * Uses candidate cards: strict schema, practitioner_id first, structured procedures/conditions, no location, to minimize hallucination.
 */
async function llmPickFive(userQuery, candidates) {
  const cards = candidates.map((p) => buildCandidateCard(p));
  const cardsJson = JSON.stringify(cards, null, 0);

  const userContent = `Patient query:\n"${userQuery}"\n\nCandidate cards (use practitioner_id from each card in your response):\n${cardsJson}`;

  const response = await openai.chat.completions.create({
    model: BENCHMARK_LLM_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PICK_5 },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_completion_tokens: 500,
  });

  const raw = response.choices[0].message.content || '';
  let content = raw.trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.warn('[LLM] Failed to parse response as JSON:', content.slice(0, 200));
    return [];
  }
  const ids = Array.isArray(parsed.practitioner_ids) ? parsed.practitioner_ids : [];
  return ids.slice(0, NUM_PICKS);
}

/**
 * Map practitioner_id to name from candidate list.
 */
function idsToNames(candidates, ids) {
  const byId = new Map();
  candidates.forEach((p) => {
    const id = p.practitioner_id || p.id;
    if (id) byId.set(id, p.name || id);
  });
  return ids.map((id) => byId.get(id) || id).filter(Boolean);
}

/**
 * Validate that every ground-truth id/name exists in the specialty practitioner list.
 */
function validateGroundTruth(cases, specialtyPractitioners) {
  const byName = new Map();
  specialtyPractitioners.forEach((p) => {
    const n = (p.name || '').trim();
    if (n) byName.set(n.toLowerCase(), p);
  });
  const errors = [];
  cases.forEach((tc) => {
    (tc.groundTruth || []).forEach((name) => {
      if (!byName.get((name || '').toLowerCase())) {
        errors.push(`Unknown ground truth name: "${name}" in case ${tc.id}`);
      }
    });
  });
  return errors;
}

/** Load existing output file if present; return { testCases, doneSet } where doneSet keys are specialty|userQuery. */
function loadExistingOutput(outputPath) {
  const allCases = [];
  const doneSet = new Set();
  if (!fs.existsSync(outputPath)) return { allCases, doneSet };
  try {
    const raw = fs.readFileSync(outputPath, 'utf8');
    const data = JSON.parse(raw);
    const cases = data.testCases || [];
    cases.forEach((c) => {
      allCases.push(c);
      doneSet.add(`${c.expectedSpecialty}|${c.userQuery}`);
    });
  } catch (e) {
    console.warn('[Resume] Could not load existing output:', e.message);
  }
  return { allCases, doneSet };
}

/** Sort test cases by id (benchmark-{slug}-{idx}) for stable output. */
function sortCasesById(cases) {
  cases.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
}

/** Run async tasks with a concurrency limit; for each result call onComplete(result). */
async function runWithConcurrency(tasks, concurrency, processOne, onComplete) {
  let index = 0;
  const running = new Set();
  const runNext = async () => {
    if (index >= tasks.length) return;
    const task = tasks[index++];
    const p = processOne(task)
      .then((result) => {
        running.delete(p);
        onComplete(result);
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
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required. Set it in parallel-ranking-package/.env');
    process.exit(1);
  }
  if (BENCHMARK_LLM_MODEL !== 'gpt-5.1') {
    throw new Error(`Benchmark must use gpt-5.1; got ${BENCHMARK_LLM_MODEL}. Check generate-benchmark-ground-truth.js.`);
  }
  console.log('[Benchmark] Using LLM model: gpt-5.1');

  const outputArgEarly = process.argv.indexOf('--output');
  const outputFilenameEarly = outputArgEarly >= 0 && process.argv[outputArgEarly + 1]
    ? process.argv[outputArgEarly + 1]
    : OUTPUT_FILENAME;
  const outputPath = path.join(__dirname, outputFilenameEarly);
  const { allCases, doneSet } = loadExistingOutput(outputPath);
  if (allCases.length) {
    console.log(`[Resume] Loaded ${allCases.length} existing test cases from ${outputPath}`);
  }

  const limitArg = process.argv.indexOf('--limit');
  const questionLimit = limitArg >= 0 && process.argv[limitArg + 1]
    ? parseInt(process.argv[limitArg + 1], 10)
    : null;

  const bank = getQuestionBank();
  const practitionerCache = new Map();

  /** Max index per slug from existing cases so new tasks get non-overlapping ids (e.g. 016, 017...). */
  const maxIndexBySlug = {};
  allCases.forEach((c) => {
    const m = (c.id || '').match(/^benchmark-(.+)-(\d+)$/);
    if (m) {
      const slug = m[1];
      const n = parseInt(m[2], 10);
      if (!(slug in maxIndexBySlug) || maxIndexBySlug[slug] < n) maxIndexBySlug[slug] = n;
    }
  });

  /** Build flat list of tasks (specialty, userQuery, id, name) with ids in order; skip already done. */
  const tasks = [];
  for (const { specialty, questions } of bank) {
    if (!questions.length) continue;
    const baseSlug = slugForId(specialty);
    const questionsToRun = questionLimit ? questions.slice(0, questionLimit) : questions;
    for (let i = 0; i < questionsToRun.length; i++) {
      const userQuery = questionsToRun[i];
      const key = `${specialty}|${userQuery}`;
      if (doneSet.has(key)) continue;
      const prevMax = maxIndexBySlug[baseSlug] || 0;
      const idx = prevMax + 1;
      maxIndexBySlug[baseSlug] = idx;
      const id = `benchmark-${baseSlug}-${String(idx).padStart(3, '0')}`;
      const name = userQuery.slice(0, 60) + (userQuery.length > 60 ? '...' : '');
      tasks.push({ specialty, userQuery, id, name });
    }
  }

  if (tasks.length === 0) {
    console.log('No new questions to process. Output is up to date.');
    sortCasesById(allCases);
    fs.writeFileSync(outputPath, JSON.stringify({ testCases: allCases }, null, 2), 'utf8');
    return;
  }

  console.log(`\nProcessing ${tasks.length} questions with concurrency ${CONCURRENCY}...`);

  const processTask = async (task) => {
    const { specialty, userQuery, id, name } = task;
    let practitioners = practitionerCache.get(specialty);
    if (!practitioners) {
      practitioners = loadSpecialtyPractitioners(specialty);
      practitionerCache.set(specialty, practitioners);
    }
    console.log(`  [${id}] Candidate pool (${CANDIDATE_POOL_STRATEGY})...`);
    const candidates = await getCandidatePool(practitioners, userQuery);
    if (candidates.length < NUM_PICKS) {
      console.warn(`  [${id}] Only ${candidates.length} candidates; need at least ${NUM_PICKS}`);
    }
    console.log(`  [${id}] LLM picking 5...`);
    const pickedIds = await llmPickFive(userQuery, candidates);
    const groundTruthNames = idsToNames(candidates, pickedIds);
    return {
      id,
      name,
      userQuery,
      conversation: [{ role: 'user', content: userQuery }],
      groundTruth: groundTruthNames,
      expectedSpecialty: specialty,
    };
  };

  const onComplete = (newCase) => {
    allCases.push(newCase);
    sortCasesById(allCases);
    fs.writeFileSync(outputPath, JSON.stringify({ testCases: allCases }, null, 2), 'utf8');
    console.log(`  [${newCase.id}] Saved (${allCases.length} total).`);
  };

  await runWithConcurrency(tasks, CONCURRENCY, processTask, onComplete);

  console.log(`\nWritten ${allCases.length} test cases to ${outputPath}`);

  const validateAll = allCases.every((tc) => {
    const practitioners = practitionerCache.get(tc.expectedSpecialty) || loadSpecialtyPractitioners(tc.expectedSpecialty);
    return validateGroundTruth([tc], practitioners).length === 0;
  });
  if (!validateAll) console.warn('Some ground truth names could not be resolved in specialty corpus.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
