/**
 * Verify benchmark ground-truth picks with an LLM: for each test case, ask
 * "For this patient query, are these doctors (our benchmark picks) top tier / excellent fit?"
 * Uses gpt-5.1 by default. Output: benchmark-pick-verification.json
 *
 * Usage: node verify-benchmark-picks-llm.js [--workers=2] [--limit=N] [--model=gpt-5.1] [--output=benchmark-pick-verification.json]
 * Env: OPENAI_API_KEY required.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { findPractitionerByName } = require('./parallel-ranking-package/testing/utils/name-to-id-mapper');

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BENCHMARK_FILE = path.join(__dirname, '../benchmarks/benchmark-test-cases-all-specialties.json');
const DEFAULT_OUTPUT = 'benchmark-pick-verification.json';
const WORKERS = Math.max(1, parseInt(process.env.WORKERS || '2', 10));
const DEFAULT_MODEL = 'gpt-5.1';

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

/** Build a short practitioner summary for the LLM (name, specialty, procedures, expertise). */
function buildPractitionerSummary(p) {
  const procedures = (p.procedure_groups || [])
    .map((pg) => (typeof pg === 'object' ? pg.procedure_group_name : pg))
    .filter(Boolean);
  const subspecialties = Array.isArray(p.subspecialties) ? p.subspecialties : [];
  const expertise = (p.clinical_expertise || '').slice(0, 600);
  const description = (p.description || p.about || '').slice(0, 400);
  return {
    name: p.name || 'Unknown',
    specialty: p.specialty || '',
    subspecialties,
    procedures: procedures.slice(0, 25),
    clinical_expertise: expertise || null,
    description_snippet: description || null,
  };
}

const SYSTEM_VERIFY = `You are a medical search quality evaluator. You will receive a patient query and a list of exactly 5 recommended practitioners (our benchmark "ground truth" picks), each with a short profile: name, specialty, subspecialties, procedures, clinical expertise, description snippet.

Your task: Decide whether these doctors are **top tier / excellent fit** for this patient query. Base your judgment only on the profile fields provided; do not invent facts.

Return ONLY a JSON object with this exact structure:
{
  "overall_verdict": "yes" | "partial" | "no",
  "overall_reason": "One sentence explaining whether the set as a whole is top tier / excellent fit for the query.",
  "per_doctor": [
    {
      "practitioner_name": "exact name as given",
      "excellent_fit": true | false,
      "brief_reason": "One sentence: why this doctor is or isn't an excellent fit for the query."
    }
  ]
}

Rules:
- overall_verdict: "yes" = all 5 are excellent fits; "partial" = most are good but some are marginal or one is weak; "no" = several are poor fits or the set is not well aligned.
- Include exactly one entry in per_doctor for each of the 5 practitioners, in the same order as the list provided.
- Use the exact practitioner names as given.`;

/**
 * Call LLM to verify whether the 5 ground-truth picks are top tier / excellent fit for the query.
 * @param {string} userQuery - Patient query
 * @param {object[]} practitioners - Exactly 5 practitioner objects (ground-truth order)
 * @param {string} model - Model name (e.g. gpt-5.1)
 * @returns {Promise<{ overall_verdict, overall_reason, per_doctor }>}
 */
async function llmVerifyPicks(userQuery, practitioners, model) {
  const summaries = practitioners.map((p) => buildPractitionerSummary(p));
  const summariesJson = JSON.stringify(summaries, null, 2);

  const userContent = `Patient query:\n"${userQuery}"\n\nRecommended practitioners (our benchmark picks; in order, with profiles):\n${summariesJson}\n\nAre these doctors top tier / excellent fit for this query?`;

  const response = await openai.chat.completions.create({
    model: model || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_VERIFY },
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
    return {
      overall_verdict: parsed.overall_verdict || 'partial',
      overall_reason: parsed.overall_reason || '',
      per_doctor: Array.isArray(parsed.per_doctor) ? parsed.per_doctor : [],
    };
  } catch (e) {
    console.warn('[LLM] Failed to parse verification JSON:', content.slice(0, 200));
    return {
      overall_verdict: 'partial',
      overall_reason: '(parse error)',
      per_doctor: [],
    };
  }
}

function getGroundTruthPractitioners(tc, practitioners) {
  const names = tc.groundTruth || [];
  const result = [];
  for (const name of names) {
    const p = findPractitionerByName(name, practitioners);
    if (p) result.push(p);
  }
  return result;
}

function getArg(name, defaultValue) {
  for (const arg of process.argv) {
    if (arg === `--${name}` && process.argv[process.argv.indexOf(arg) + 1])
      return process.argv[process.argv.indexOf(arg) + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return defaultValue;
}

function getLimit() {
  const n = parseInt(getArg('limit', ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required. Set it in parallel-ranking-package/.env');
    process.exit(1);
  }

  const workers = Math.max(1, parseInt(getArg('workers', String(WORKERS)), 10));
  const limit = getLimit();
  const model = getArg('model', DEFAULT_MODEL);
  const outputFile = getArg('output', DEFAULT_OUTPUT);

  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Benchmark not found: ${benchmarkPath}`);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const testCases = benchmarkData.testCases || [];
  const tasks = limit ? testCases.slice(0, limit) : testCases;

  console.log(`[Verify] Loaded ${testCases.length} test cases; verifying ${tasks.length} with ${workers} workers.`);
  console.log(`[Verify] Model: ${model}`);

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
      return {
        id: tc.id,
        userQuery: tc.userQuery,
        groundTruthNames: tc.groundTruth,
        verification: { overall_verdict: 'no', overall_reason: 'No practitioners resolved.', per_doctor: [] },
      };
    }
    if (picked.length < 5) {
      console.warn(`  [${tc.id}] Only ${picked.length}/5 practitioners resolved.`);
    }
    const verification = await llmVerifyPicks(tc.userQuery || '', picked, model);
    return {
      id: tc.id,
      userQuery: tc.userQuery,
      expectedSpecialty: specialty,
      groundTruthNames: tc.groundTruth,
      verification,
    };
  };

  const results = await runWithConcurrency(tasks, workers, processOne);

  const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(__dirname, outputFile);
  const byId = {};
  results.forEach((r) => {
    byId[r.id] = {
      userQuery: r.userQuery,
      expectedSpecialty: r.expectedSpecialty,
      groundTruthNames: r.groundTruthNames,
      verification: r.verification,
    };
  });

  const summary = {
    total: results.length,
    overall_verdict_counts: { yes: 0, partial: 0, no: 0 },
    model,
  };
  results.forEach((r) => {
    const v = r.verification?.overall_verdict || 'partial';
    if (summary.overall_verdict_counts[v] !== undefined) summary.overall_verdict_counts[v]++;
  });

  fs.writeFileSync(outPath, JSON.stringify({ summary, byId }, null, 2), 'utf8');
  console.log(`[Verify] Written to ${outPath}`);
  console.log('[Verify] Summary:', summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
