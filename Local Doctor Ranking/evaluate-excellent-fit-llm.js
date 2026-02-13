/**
 * Evaluate ranking by LLM three-tier fit verification (GPT 5.1).
 *
 * 1. Run the ranking pipeline (V2: session context v2 + BM25 shortlist) to get top 12 per test case.
 * 2. Send top 12 with profiles to the LLM to categorize each doctor as:
 *    - "excellent": Excellent match for the patient's need
 *    - "good": Reasonable match but with some limitations
 *    - "ill-fit": Not a good match for the patient's need
 * 3. Success metrics: % excellent/good/ill-fit at 3 / 5 / 12; % of cases where top 3 all excellent;
 *    % of cases where top 5 all excellent.
 *
 * Usage:
 *   node evaluate-excellent-fit-llm.js [--use-cache] [--limit=N] [--workers=2] [--model=gpt-5.1] [--output=excellent-fit-evaluation.json]
 *   --weights=path   Optional ranking weights JSON (e.g. best-stage-a-recall-weights-desc-tuned.json)
 *
 * Requires: OPENAI_API_KEY (parallel-ranking-package/.env). With --use-cache, uses benchmark-session-context-cache-v2.json.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const path = require('path');
const fs = require('fs');

const { getSessionContextParallelV2 } = require('./parallel-ranking-package/algorithm/session-context-variants');
const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BENCHMARK_FILE = 'benchmark-test-cases-all-specialties.json';
const CACHE_FILE = 'benchmark-session-context-cache-v2.json';
const DEFAULT_OUTPUT = 'excellent-fit-evaluation.json';
const DEFAULT_MODEL = 'gpt-5.1';
const WORKERS = Math.max(1, parseInt(process.env.WORKERS || '2', 10));

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

/** Build a short practitioner summary for the LLM (same style as verify-benchmark-picks-llm). */
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

const SYSTEM_VERIFY = `You are a medical search quality evaluator. You will receive a patient query and a list of recommended practitioners (our ranking algorithm's top 12 results), each with a short profile: name, specialty, subspecialties, procedures, clinical expertise, description snippet.

Your task: For each practitioner, categorize them into one of three fit levels for this patient query. Base your judgment only on the profile fields provided; do not invent facts.

Return ONLY a JSON object with this exact structure:
{
  "overall_reason": "One sentence on how well the top results match the query overall.",
  "per_doctor": [
    {
      "practitioner_name": "exact name as given",
      "fit_category": "excellent" | "good" | "ill-fit",
      "brief_reason": "One sentence: why this doctor is excellent fit, good fit, or ill-fit for the query."
    }
  ]
}

Fit Categories:
- "excellent": This doctor is an excellent match for the patient's stated need - right specialty/subspecialty, relevant procedures/expertise, and clearly addresses the query.
- "good": This doctor is a reasonable match but may have some limitations - correct specialty but perhaps not the ideal subspecialty focus, or relevant but not perfectly aligned expertise.
- "ill-fit": This doctor is not a good match - wrong specialty, wrong subspecialty focus, or clearly not relevant to the patient's needs.

Rules:
- Include exactly one entry in per_doctor for each of the 12 practitioners, in the same order as the list provided.
- Each doctor must be assigned exactly one of: "excellent", "good", or "ill-fit".
- Use the exact practitioner names as given.`;

/**
 * Call LLM to categorize the top 12 returned picks into excellent/good/ill-fit for the query.
 * @returns {Promise<{ overall_reason: string, per_doctor: Array<{ practitioner_name, fit_category: 'excellent'|'good'|'ill-fit', brief_reason }> }>}
 */
async function llmVerifyTop12(userQuery, practitioners, model) {
  const summaries = practitioners.map((p) => buildPractitionerSummary(p));
  const summariesJson = JSON.stringify(summaries, null, 2);

  const userContent = `Patient query:\n"${userQuery}"\n\nRecommended practitioners (our ranking's top 12; in order, with profiles):\n${summariesJson}\n\nFor each doctor, categorize them as "excellent", "good", or "ill-fit" for this query.`;

  const response = await openai.chat.completions.create({
    model: model || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_VERIFY },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_completion_tokens: 2500,
  });

  let content = (response.choices[0].message.content || '').trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    const parsed = JSON.parse(content);
    // Normalize per_doctor entries: convert old format (excellent_fit boolean) to new format (fit_category)
    const normalizedPerDoctor = (Array.isArray(parsed.per_doctor) ? parsed.per_doctor : []).map((d) => {
      if (d.fit_category) {
        return d; // Already in new format
      }
      // Backward compatibility: convert excellent_fit boolean to fit_category
      if (typeof d.excellent_fit === 'boolean') {
        return {
          ...d,
          fit_category: d.excellent_fit ? 'excellent' : 'ill-fit',
        };
      }
      // Default to 'good' if neither format is present
      return {
        ...d,
        fit_category: d.fit_category || 'good',
      };
    });
    return {
      overall_reason: parsed.overall_reason || '',
      per_doctor: normalizedPerDoctor,
    };
  } catch (e) {
    console.warn('[LLM] Failed to parse verification JSON:', content.slice(0, 200));
    return {
      overall_reason: '(parse error)',
      per_doctor: [],
    };
  }
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

/**
 * Compute fit metrics from LLM per_doctor (order = top 12).
 * - pct_excellent/good/ill-fit_at_3/5/12: fraction of top K in each category
 * - top3_all_excellent, top5_all_excellent: true iff all in top 3 / top 5 are excellent fit
 * - fit_labels: list of { rank, name, fit_category, reason } for all doctors
 */
function computeMetrics(perDoctor) {
  const upTo12 = perDoctor.slice(0, 12);
  
  // Categorize each doctor
  const categories = upTo12.map((d) => {
    const cat = d.fit_category || (d.excellent_fit === true ? 'excellent' : d.excellent_fit === false ? 'ill-fit' : 'good');
    return cat.toLowerCase();
  });
  
  const excellent = categories.map((c) => c === 'excellent');
  const good = categories.map((c) => c === 'good');
  const illFit = categories.map((c) => c === 'ill-fit');

  // Top 3, 5, 12 slices
  const at3 = { excellent: excellent.slice(0, 3), good: good.slice(0, 3), illFit: illFit.slice(0, 3) };
  const at5 = { excellent: excellent.slice(0, 5), good: good.slice(0, 5), illFit: illFit.slice(0, 5) };
  const at12 = { excellent, good, illFit };

  // Counts
  const count3 = {
    excellent: at3.excellent.filter(Boolean).length,
    good: at3.good.filter(Boolean).length,
    illFit: at3.illFit.filter(Boolean).length,
  };
  const count5 = {
    excellent: at5.excellent.filter(Boolean).length,
    good: at5.good.filter(Boolean).length,
    illFit: at5.illFit.filter(Boolean).length,
  };
  const count12 = {
    excellent: at12.excellent.filter(Boolean).length,
    good: at12.good.filter(Boolean).length,
    illFit: at12.illFit.filter(Boolean).length,
  };

  // Labels for all doctors
  const fitLabels = upTo12.map((d, i) => ({
    rank: i + 1,
    name: d.practitioner_name,
    fit_category: d.fit_category || (d.excellent_fit === true ? 'excellent' : d.excellent_fit === false ? 'ill-fit' : 'good'),
    reason: d.brief_reason || '',
  }));

  return {
    // Excellent fit metrics (for backward compatibility)
    pct_excellent_fit_at_3: at3.excellent.length ? count3.excellent / at3.excellent.length : 0,
    pct_excellent_fit_at_5: at5.excellent.length ? count5.excellent / at5.excellent.length : 0,
    pct_excellent_fit_at_12: at12.excellent.length ? count12.excellent / at12.excellent.length : 0,
    top3_all_excellent: at3.excellent.length === 3 && count3.excellent === 3,
    top5_all_excellent: at5.excellent.length === 5 && count5.excellent === 5,
    
    // Three-tier metrics
    pct_excellent_at_3: at3.excellent.length ? count3.excellent / at3.excellent.length : 0,
    pct_good_at_3: at3.good.length ? count3.good / at3.good.length : 0,
    pct_ill_fit_at_3: at3.illFit.length ? count3.illFit / at3.illFit.length : 0,
    pct_excellent_at_5: at5.excellent.length ? count5.excellent / at5.excellent.length : 0,
    pct_good_at_5: at5.good.length ? count5.good / at5.good.length : 0,
    pct_ill_fit_at_5: at5.illFit.length ? count5.illFit / at5.illFit.length : 0,
    pct_excellent_at_12: at12.excellent.length ? count12.excellent / at12.excellent.length : 0,
    pct_good_at_12: at12.good.length ? count12.good / at12.good.length : 0,
    pct_ill_fit_at_12: at12.illFit.length ? count12.illFit / at12.illFit.length : 0,
    
    // Counts
    count_excellent_at_3: count3.excellent,
    count_good_at_3: count3.good,
    count_ill_fit_at_3: count3.illFit,
    count_excellent_at_5: count5.excellent,
    count_good_at_5: count5.good,
    count_ill_fit_at_5: count5.illFit,
    count_excellent_at_12: count12.excellent,
    count_good_at_12: count12.good,
    count_ill_fit_at_12: count12.illFit,
    
    // Labels
    fit_labels: fitLabels,
    // Backward compatibility
    non_excellent_fit_labels: fitLabels.filter((d) => d.fit_category !== 'excellent'),
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required. Set it in parallel-ranking-package/.env');
    process.exit(1);
  }

  const useCache = process.argv.includes('--use-cache');
  const limit = getLimit();
  const workers = Math.max(1, parseInt(getArg('workers', String(WORKERS)), 10));
  const model = getArg('model', DEFAULT_MODEL);
  const outputFile = getArg('output', DEFAULT_OUTPUT);
  const weightsPath = getArg('weights', null);

  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Benchmark not found: ${benchmarkPath}`);
    process.exit(1);
  }

  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  let testCases = benchmarkData.testCases || [];
  if (limit) testCases = testCases.slice(0, limit);
  console.log(`[Excellent-fit] Loaded ${testCases.length} test cases; model=${model}, workers=${workers}`);

  let sessionContextCache = null;
  if (useCache) {
    const cachePath = path.join(__dirname, CACHE_FILE);
    if (fs.existsSync(cachePath)) {
      sessionContextCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const cacheIds = new Set(Object.keys(sessionContextCache));
      testCases = testCases.filter((tc) => cacheIds.has(tc.id));
      console.log(`[Excellent-fit] Using session context cache: ${CACHE_FILE} (${Object.keys(sessionContextCache).length} entries). Running ${testCases.length} cases.`);
    } else {
      console.warn(`[Excellent-fit] --use-cache requested but ${CACHE_FILE} not found. Proceeding without cache.`);
    }
  }

  let rankingConfig = null;
  if (weightsPath) {
    const wp = path.isAbsolute(weightsPath) ? weightsPath : path.join(__dirname, weightsPath);
    if (fs.existsSync(wp)) {
      rankingConfig = JSON.parse(fs.readFileSync(wp, 'utf8'));
      console.log(`[Excellent-fit] Using ranking weights: ${weightsPath}`);
    }
  }

  const practitionerCache = new Map();
  const lexiconsDir = __dirname;

  const processOne = async (tc) => {
    const specialty = tc.expectedSpecialty;
    if (!practitionerCache.has(specialty)) {
      practitionerCache.set(specialty, loadSpecialtyPractitioners(specialty));
    }
    const practitioners = practitionerCache.get(specialty);

    let sessionContext;
    if (sessionContextCache && sessionContextCache[tc.id]) {
      sessionContext = sessionContextCache[tc.id];
    } else {
      const messages = tc.conversation || [{ role: 'user', content: tc.userQuery }];
      sessionContext = await getSessionContextParallelV2(tc.userQuery || '', messages, null, {
        lexiconsDir,
        specialty: tc.expectedSpecialty,
      });
    }

    const filters = {
      q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
      safe_lane_terms: sessionContext.safe_lane_terms || [],
      intent_terms: sessionContext.intent_terms || [],
      anchor_phrases: sessionContext.anchor_phrases || sessionContext.intentData?.anchor_phrases || null,
      searchQuery: sessionContext.enrichedQuery,
      intentData: sessionContext.intentData || null,
      variantName: 'parallel-v2',
      ...(rankingConfig && { rankingConfig }),
    };

    const bm25Result = getBM25Shortlist(practitioners, filters, 12);
    const top12 = (bm25Result.results || []).map((r) => r.document).filter(Boolean);
    if (top12.length === 0) {
      return {
        id: tc.id,
        userQuery: tc.userQuery,
        expectedSpecialty: specialty,
        top12_names: [],
        verification: { overall_reason: 'No results from ranking.', per_doctor: [] },
        metrics: {
          pct_excellent_fit_at_3: 0,
          pct_excellent_fit_at_5: 0,
          pct_excellent_fit_at_12: 0,
          top3_all_excellent: false,
          top5_all_excellent: false,
          pct_excellent_at_3: 0,
          pct_good_at_3: 0,
          pct_ill_fit_at_3: 0,
          fit_labels: [],
          non_excellent_fit_labels: [],
        },
      };
    }

    const verification = await llmVerifyTop12(tc.userQuery || '', top12, model);
    const metrics = computeMetrics(verification.per_doctor);

    return {
      id: tc.id,
      userQuery: tc.userQuery,
      expectedSpecialty: specialty,
      top12_names: top12.map((d) => d.name || d.practitioner_id),
      verification,
      metrics,
    };
  };

  const results = await runWithConcurrency(testCases, workers, processOne);
  results.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const n = results.length;
  const pct3 = results.map((r) => r.metrics.pct_excellent_fit_at_3).filter((v) => v != null && !isNaN(v));
  const pct5 = results.map((r) => r.metrics.pct_excellent_fit_at_5).filter((v) => v != null && !isNaN(v));
  const pct12 = results.map((r) => r.metrics.pct_excellent_fit_at_12).filter((v) => v != null && !isNaN(v));
  const top3Correct = results.filter((r) => r.metrics.top3_all_excellent === true).length;
  const top5Correct = results.filter((r) => r.metrics.top5_all_excellent === true).length;

  // Three-tier metrics
  const pctExcellent3 = results.map((r) => r.metrics.pct_excellent_at_3).filter((v) => v != null && !isNaN(v));
  const pctGood3 = results.map((r) => r.metrics.pct_good_at_3).filter((v) => v != null && !isNaN(v));
  const pctIllFit3 = results.map((r) => r.metrics.pct_ill_fit_at_3).filter((v) => v != null && !isNaN(v));
  const pctExcellent5 = results.map((r) => r.metrics.pct_excellent_at_5).filter((v) => v != null && !isNaN(v));
  const pctGood5 = results.map((r) => r.metrics.pct_good_at_5).filter((v) => v != null && !isNaN(v));
  const pctIllFit5 = results.map((r) => r.metrics.pct_ill_fit_at_5).filter((v) => v != null && !isNaN(v));
  const pctExcellent12 = results.map((r) => r.metrics.pct_excellent_at_12).filter((v) => v != null && !isNaN(v));
  const pctGood12 = results.map((r) => r.metrics.pct_good_at_12).filter((v) => v != null && !isNaN(v));
  const pctIllFit12 = results.map((r) => r.metrics.pct_ill_fit_at_12).filter((v) => v != null && !isNaN(v));

  const summary = {
    totalTestCases: n,
    model,
    runAt: new Date().toISOString(),
    success_metrics: {
      // Backward compatibility (excellent fit only)
      pct_excellent_fit_at_3_avg: pct3.length ? pct3.reduce((a, b) => a + b, 0) / pct3.length : null,
      pct_excellent_fit_at_5_avg: pct5.length ? pct5.reduce((a, b) => a + b, 0) / pct5.length : null,
      pct_excellent_fit_at_12_avg: pct12.length ? pct12.reduce((a, b) => a + b, 0) / pct12.length : null,
      pct_cases_top3_all_excellent: n ? (top3Correct / n) * 100 : null,
      pct_cases_top5_all_excellent: n ? (top5Correct / n) * 100 : null,
      count_top3_all_excellent: top3Correct,
      count_top5_all_excellent: top5Correct,
      
      // Three-tier metrics
      pct_excellent_at_3_avg: pctExcellent3.length ? pctExcellent3.reduce((a, b) => a + b, 0) / pctExcellent3.length : null,
      pct_good_at_3_avg: pctGood3.length ? pctGood3.reduce((a, b) => a + b, 0) / pctGood3.length : null,
      pct_ill_fit_at_3_avg: pctIllFit3.length ? pctIllFit3.reduce((a, b) => a + b, 0) / pctIllFit3.length : null,
      pct_excellent_at_5_avg: pctExcellent5.length ? pctExcellent5.reduce((a, b) => a + b, 0) / pctExcellent5.length : null,
      pct_good_at_5_avg: pctGood5.length ? pctGood5.reduce((a, b) => a + b, 0) / pctGood5.length : null,
      pct_ill_fit_at_5_avg: pctIllFit5.length ? pctIllFit5.reduce((a, b) => a + b, 0) / pctIllFit5.length : null,
      pct_excellent_at_12_avg: pctExcellent12.length ? pctExcellent12.reduce((a, b) => a + b, 0) / pctExcellent12.length : null,
      pct_good_at_12_avg: pctGood12.length ? pctGood12.reduce((a, b) => a + b, 0) / pctGood12.length : null,
      pct_ill_fit_at_12_avg: pctIllFit12.length ? pctIllFit12.reduce((a, b) => a + b, 0) / pctIllFit12.length : null,
    },
  };

  const byId = {};
  results.forEach((r) => {
    byId[r.id] = {
      userQuery: r.userQuery,
      expectedSpecialty: r.expectedSpecialty,
      top12_names: r.top12_names,
      verification: r.verification,
      metrics: r.metrics,
    };
  });

  const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(__dirname, outputFile);
  fs.writeFileSync(outPath, JSON.stringify({ summary, byId }, null, 2), 'utf8');
  const metricArg = getArg('metric', '');
  if (metricArg) {
    // For Optuna: print single metric to stdout (last line only)
    const sm = summary.success_metrics || {};
    const v = metricArg === 'top3_pct' ? sm.pct_cases_top3_all_excellent
      : metricArg === 'top3_avg' ? (sm.pct_excellent_fit_at_3_avg != null ? sm.pct_excellent_fit_at_3_avg * 100 : null)
      : metricArg === 'top5_pct' ? sm.pct_cases_top5_all_excellent
      : metricArg === 'top5_avg' ? (sm.pct_excellent_fit_at_5_avg != null ? sm.pct_excellent_fit_at_5_avg * 100 : null)
      : null;
    if (v != null && !isNaN(v)) console.log(v);
  } else {
    console.log(`[Excellent-fit] Written to ${outPath}`);
    console.log('[Excellent-fit] Summary:', JSON.stringify(summary, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
