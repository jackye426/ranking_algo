/**
 * Build benchmark ground-truth reasoning: for each test case, call LLM to explain
 * why each of the top 5 ground-truth practitioners is a good match for the query.
 * Output: benchmark-ground-truth-reasons.json (keyed by test case id).
 * Uses existing benchmark-test-cases-all-specialties.json and specialty JSONs.
 *
 * Usage: node build-benchmark-ground-truth-reasons.js [--workers=4] [--limit=N]
 * Env: WORKERS=4 (concurrency for LLM calls). OPENAI_API_KEY required.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { createNameToIdMap, findPractitionerByName } = require('./parallel-ranking-package/testing/utils/name-to-id-mapper');

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BENCHMARK_FILE = path.join(__dirname, '../benchmarks/benchmark-test-cases-all-specialties.json');
const REASONS_OUTPUT = path.join(__dirname, '../benchmarks/benchmark-ground-truth-reasons.json');
const WORKERS = Math.max(1, parseInt(process.env.WORKERS || '4', 10));
const REASONING_MODEL = process.env.BENCHMARK_REASONING_MODEL || 'gpt-4o-mini';

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

/** Build a short practitioner summary for the LLM (name, specialty, procedures, expertise snippet). */
function buildPractitionerSummary(p) {
  const procedures = (p.procedure_groups || [])
    .map((pg) => (typeof pg === 'object' ? pg.procedure_group_name : pg))
    .filter(Boolean);
  const subspecialties = Array.isArray(p.subspecialties) ? p.subspecialties : [];
  const expertise = (p.clinical_expertise || '').slice(0, 500);
  const description = (p.description || p.about || '').slice(0, 300);
  return {
    name: p.name || 'Unknown',
    specialty: p.specialty || '',
    subspecialties,
    procedures: procedures.slice(0, 20),
    clinical_expertise: expertise || null,
    description_snippet: description || null,
  };
}

const SYSTEM_REASONS = `You are a medical search evaluator. You will receive a patient query and exactly 5 recommended practitioners, each with a short profile (name, specialty, subspecialties, procedures, clinical expertise).

Your task: For each of the 5 practitioners, explain why they are a good match for this query. List the main match factors (e.g. specific procedures, conditions, subspecialty, clinical expertise) that justify the recommendation. Base your reasoning only on the profile fields provided; do not invent facts.

Return ONLY a JSON object with this exact structure:
{
  "reasons": [
    {
      "practitioner_name": "exact name as given",
      "match_factors": ["factor1", "factor2", "..."],
      "summary": "One sentence explaining why this practitioner is a good match."
    }
  ]
}

Rules:
- Include exactly one entry per practitioner, in the same order as the list provided.
- match_factors: array of short strings (e.g. "TAVI in procedures", "AF in clinical expertise", "subspecialty: interventional cardiology").
- summary: one clear sentence.`;

/**
 * Call LLM to get reasoning for the 5 ground-truth picks.
 * @param {string} userQuery - Patient query
 * @param {Array<object>} practitioners - Exactly 5 practitioner objects (in ground-truth order)
 * @returns {Promise<{ reasons: Array<{ practitioner_name, match_factors, summary }> }>}
 */
async function llmGetReasons(userQuery, practitioners) {
  const summaries = practitioners.map((p) => buildPractitionerSummary(p));
  const summariesJson = JSON.stringify(summaries, null, 2);

  const userContent = `Patient query:\n"${userQuery}"\n\nRecommended practitioners (in order, with profiles):\n${summariesJson}`;

  const response = await openai.chat.completions.create({
    model: REASONING_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_REASONS },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_completion_tokens: 1500,
  });

  let content = (response.choices[0].message.content || '').trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    const parsed = JSON.parse(content);
    return { reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [] };
  } catch (e) {
    console.warn('[LLM] Failed to parse reasons JSON:', content.slice(0, 200));
    return { reasons: [] };
  }
}

/** Get the 5 practitioner objects for a test case (in ground-truth order). */
function getGroundTruthPractitioners(tc, practitioners) {
  const names = tc.groundTruth || [];
  const result = [];
  for (const name of names) {
    const p = findPractitionerByName(name, practitioners);
    if (p) result.push(p);
  }
  return result;
}

/** Run async tasks with concurrency limit. */
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
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required. Set it in parallel-ranking-package/.env');
    process.exit(1);
  }

  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  const workersArg = process.argv.find((a) => a.startsWith('--workers='));
  const workers = workersArg ? parseInt(workersArg.split('=')[1], 10) : WORKERS;

  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Benchmark not found: ${benchmarkPath}`);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const testCases = benchmarkData.testCases || [];
  const tasks = limit ? testCases.slice(0, limit) : testCases;

  console.log(`[Reasons] Loaded ${testCases.length} test cases; processing ${tasks.length} with ${workers} workers.`);
  console.log(`[Reasons] Model: ${REASONING_MODEL}`);

  const practitionerCache = new Map();
  const processOne = async (tc) => {
    const specialty = tc.expectedSpecialty;
    if (!practitionerCache.has(specialty)) {
      practitionerCache.set(specialty, loadSpecialtyPractitioners(specialty));
    }
    const practitioners = practitionerCache.get(specialty);
    const picked = getGroundTruthPractitioners(tc, practitioners);
    if (picked.length === 0) {
      console.warn(`  [${tc.id}] No practitioners resolved; skipping.`);
      return { id: tc.id, reasons: [] };
    }
    if (picked.length < 5) {
      console.warn(`  [${tc.id}] Only ${picked.length}/5 practitioners resolved.`);
    }
    const { reasons } = await llmGetReasons(tc.userQuery || '', picked);
    return { id: tc.id, reasons };
  };

  const results = await runWithConcurrency(tasks, workers, processOne);

  const byId = {};
  results.forEach((r) => {
    byId[r.id] = { reasons: r.reasons };
  });

  const outputPath = path.join(__dirname, REASONS_OUTPUT);
  fs.writeFileSync(outputPath, JSON.stringify(byId, null, 2), 'utf8');
  console.log(`\n[Reasons] Written ${Object.keys(byId).length} entries to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
