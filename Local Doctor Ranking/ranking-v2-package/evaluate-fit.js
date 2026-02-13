/**
 * LLM Fit Evaluation Module
 * 
 * Evaluates ranking results using LLM to categorize doctors as excellent/good/ill-fit
 * and provide brief reasons for each categorization.
 * 
 * Usage:
 *   const { evaluateFit } = require('./ranking-v2-package/evaluate-fit');
 *   const evaluation = await evaluateFit(userQuery, top12Practitioners, { model: 'gpt-5.1' });
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'parallel-ranking-package', '.env') });
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_MODEL = 'gpt-5.1';

/**
 * Build a short practitioner summary for the LLM
 */
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
- Use the exact practitioner names as given.
- If two surgeons are both capable, rank higher (prefer "excellent" over "good") the one who can complete the entire operation without referral if unexpected complexity appears.`;

/**
 * Evaluate fit quality of practitioners using LLM
 * 
 * @param {string} userQuery - The patient's search query
 * @param {Object[]} practitioners - Array of practitioner objects (typically top 12 from ranking)
 * @param {Object} options - Configuration options
 * @param {string} options.model - LLM model to use (default: 'gpt-5.1')
 * @param {number} options.maxPractitioners - Maximum number of practitioners to evaluate (default: 12)
 * 
 * @returns {Promise<Object>} Evaluation results:
 *   {
 *     overall_reason: string,
 *     per_doctor: [
 *       {
 *         practitioner_name: string,
 *         fit_category: 'excellent' | 'good' | 'ill-fit',
 *         brief_reason: string
 *       }
 *     ]
 *   }
 */
async function evaluateFit(userQuery, practitioners, options = {}) {
  const {
    model = DEFAULT_MODEL,
    maxPractitioners = 12,
  } = options;

  if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
    throw new Error('userQuery is required');
  }

  if (!Array.isArray(practitioners) || practitioners.length === 0) {
    throw new Error('practitioners array is required and must not be empty');
  }

  // Limit to maxPractitioners
  const practitionersToEvaluate = practitioners.slice(0, maxPractitioners);
  
  // Build summaries
  const summaries = practitionersToEvaluate.map((p) => buildPractitionerSummary(p));
  const summariesJson = JSON.stringify(summaries, null, 2);

  const userContent = `Patient query:\n"${userQuery}"\n\nRecommended practitioners (our ranking's top ${practitionersToEvaluate.length}; in order, with profiles):\n${summariesJson}\n\nFor each doctor, categorize them as "excellent", "good", or "ill-fit" for this query.`;

  try {
    const response = await openai.chat.completions.create({
      model: model,
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
  } catch (error) {
    console.error('[LLM Evaluation] Error:', error.message);
    throw new Error(`LLM evaluation failed: ${error.message}`);
  }
}

module.exports = {
  evaluateFit,
  buildPractitionerSummary,
};
