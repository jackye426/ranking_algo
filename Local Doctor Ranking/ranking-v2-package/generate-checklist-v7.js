/**
 * V7 LLM Checklist Generation
 *
 * Generates a medical competency checklist from the user query using the medical taxonomy.
 * Output filter_values are matched against practitioner checklist_profile (procedures_set, conditions_set).
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'parallel-ranking-package', '.env') });
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_MODEL = 'gpt-5.1';

/**
 * Load medical taxonomy from JSON
 * @param {string} taxonomyPath - Path to medical_taxonomy.json
 * @returns {Object} { procedures, conditions, subspecialties }
 */
function loadMedicalTaxonomy(taxonomyPath) {
  const resolved = path.isAbsolute(taxonomyPath) ? taxonomyPath : path.resolve(__dirname, '..', taxonomyPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Medical taxonomy not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const data = JSON.parse(raw);
  return {
    procedures: data.procedures || [],
    conditions: data.conditions || [],
    subspecialties: data.subspecialties || [],
    stats: data.stats || {},
  };
}

/**
 * Find taxonomy entries whose canonical_name or aliases match the query (case-insensitive)
 * @param {string} query - User search query
 * @param {Object} taxonomy - Loaded taxonomy
 * @returns {{ procedures: Array, conditions: Array, subspecialties: Array }}
 */
function findRelevantTaxonomyEntries(query, taxonomy) {
  const q = (query || '').toLowerCase().trim();
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return { procedures: [], conditions: [], subspecialties: [] };
  }

  function matches(entry) {
    const name = (entry.canonical_name || '').toLowerCase();
    const aliases = (entry.aliases || []).map((a) => String(a).toLowerCase());
    const all = [name, ...aliases].filter(Boolean);
    for (const t of terms) {
      if (t.length < 2) continue;
      const match = all.some((s) => s.includes(t) || t.includes(s));
      if (match) return true;
    }
    return all.some((s) => s.includes(q) || q.includes(s));
  }

  return {
    procedures: (taxonomy.procedures || []).filter(matches),
    conditions: (taxonomy.conditions || []).filter(matches),
    subspecialties: (taxonomy.subspecialties || []).filter(matches),
  };
}

const SYSTEM_CHECKLIST = `You are a medical search system that generates a checklist of medical competencies (procedures, conditions, specialties) that an ideal practitioner should have for a given patient query.

You will receive:
1. The patient's search query
2. A set of relevant taxonomy entries (procedures, conditions, subspecialties) that were matched to the query. Each entry has canonical_name, aliases, and filter_values. The filter_values are exact strings used to match against practitioner profiles.

Your task: Choose the filter_values that best represent the ideal competencies for this query. You may select from the provided filter_values across the matched entries. Prefer the most specific and relevant ones; do not select every possible value.

Return ONLY a JSON object with this exact structure:
{
  "filter_values": ["exact string from taxonomy filter_values", "another exact string", ...],
  "reasoning": "One or two sentences explaining which competencies you selected and why."
}

Rules:
- filter_values must be exact strings copied from the taxonomy filter_values provided. Do not modify or paraphrase.
- Include only values that are clearly relevant to the patient query (typically 2–12 values).
- If no taxonomy entries are relevant, return an empty filter_values array and explain in reasoning.`;

/**
 * Generate medical competency checklist from user query using taxonomy and LLM
 *
 * @param {string} userQuery - Patient search query
 * @param {Object} medicalTaxonomy - Loaded taxonomy (procedures, conditions, subspecialties) or path to JSON
 * @param {Object} options - Options
 * @param {string} options.model - LLM model (default: gpt-5.1)
 * @param {string} options.medicalTaxonomyPath - Path to medical_taxonomy.json if medicalTaxonomy not provided
 * @param {number} options.maxFilterValues - Max filter_values to return (default: 20)
 * @returns {Promise<Object>} { filter_values: string[], matched_taxonomy_entries: Array, reasoning: string }
 */
async function generateMedicalCompetencyChecklist(userQuery, medicalTaxonomy, options = {}) {
  const {
    model = DEFAULT_MODEL,
    medicalTaxonomyPath = path.join(__dirname, '..', '..', 'V7 dataset', 'medical_taxonomy.json'),
    maxFilterValues = 20,
  } = options;

  let taxonomy = medicalTaxonomy;
  if (!taxonomy || !taxonomy.procedures) {
    taxonomy = loadMedicalTaxonomy(medicalTaxonomyPath);
  }

  const relevant = findRelevantTaxonomyEntries(userQuery, taxonomy);
  const matchedEntries = [
    ...relevant.procedures.map((e) => ({ ...e, category: 'procedures' })),
    ...relevant.conditions.map((e) => ({ ...e, category: 'conditions' })),
    ...relevant.subspecialties.map((e) => ({ ...e, category: 'subspecialties' })),
  ];

  if (matchedEntries.length === 0) {
    return {
      filter_values: [],
      matched_taxonomy_entries: [],
      reasoning: 'No taxonomy entries matched the query; checklist is empty.',
    };
  }

  const taxonomyContext = matchedEntries.map((entry) => ({
    canonical_name: entry.canonical_name,
    category: entry.category,
    filter_values: (entry.filter_values || []).slice(0, 30),
  }));

  const userContent = `Patient query:\n"${userQuery}"\n\nRelevant taxonomy entries (use only filter_values from these):\n${JSON.stringify(taxonomyContext, null, 2)}\n\nSelect the filter_values that represent the ideal medical competencies for this query. Return JSON with "filter_values" (array of exact strings from above) and "reasoning".`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_CHECKLIST },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_completion_tokens: 2000,
    });

    let content = (response.choices[0].message.content || '').trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    const parsed = JSON.parse(content);
    const filterValues = Array.isArray(parsed.filter_values) ? parsed.filter_values : [];
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';

    const matched_taxonomy_entries = matchedEntries.map((e) => ({
      canonical_name: e.canonical_name,
      category: e.category,
    }));

    return {
      filter_values: filterValues.slice(0, maxFilterValues),
      matched_taxonomy_entries,
      reasoning: reasoning || 'Checklist generated from matched taxonomy.',
    };
  } catch (error) {
    console.error('[V7 Checklist] LLM error:', error.message);
    return {
      filter_values: [],
      matched_taxonomy_entries: matchedEntries.map((e) => ({ canonical_name: e.canonical_name, category: e.category })),
      reasoning: `Checklist generation failed: ${error.message}. Using empty checklist.`,
    };
  }
}

module.exports = {
  generateMedicalCompetencyChecklist,
  loadMedicalTaxonomy,
  findRelevantTaxonomyEntries,
};
