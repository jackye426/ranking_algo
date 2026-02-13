/**
 * V4 ranking: use v2 retrieval (session context + BM25 Stage A top 50), then AI to rank
 * those 50 by relevance to the patient query and return top 12.
 *
 * - buildProfileCardsForRanking: package practitioner docs into compact cards for the LLM
 * - rankWithAI: single LLM call with structured output, closed set of IDs, validate & backfill
 * - getRankingV4: entry point (top 50 → cards → AI rank → top 12)
 */

const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_DESCRIPTION_CHARS = 350;
const DEFAULT_TOP_K = 12;

/**
 * Parse clinical_expertise string into structured lists (semicolon-separated).
 * Format: "Procedure: X; Condition: Y; Clinical Interests: Z"
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
 * Build profile cards for the LLM: one card per practitioner with truncated description.
 * Each card gets rank_index 1..N for optional index-based response. Reuses buildCandidateCard-style
 * structure from generate-benchmark-ground-truth.js.
 *
 * @param {Object[]} practitioners - Full practitioner documents
 * @param {{ maxDescriptionChars?: number }} options - maxDescriptionChars (default 350)
 * @returns {Object[]} Array of { rank_index, practitioner_id, name, specialty, subspecialties, procedures, conditions, clinical_interests, description, qualifications, memberships }
 */
function buildProfileCardsForRanking(practitioners, options = {}) {
  const maxDesc = options.maxDescriptionChars ?? DEFAULT_MAX_DESCRIPTION_CHARS;
  return (practitioners || []).map((p, idx) => {
    const id = p.practitioner_id || p.id;
    const proceduresFromGroups = (p.procedure_groups || []).map((pg) =>
      typeof pg === 'object' ? (pg.procedure_group_name || '').trim() : String(pg).trim()
    ).filter(Boolean);
    const parsed = parseClinicalExpertise(p.clinical_expertise || '');
    const procedures = [...new Set([...proceduresFromGroups, ...parsed.procedures])];
    let description = (p.description || p.about || '').trim();
    if (description.length > maxDesc) {
      description = description.slice(0, maxDesc).trim() + '…';
    }
    return {
      rank_index: idx + 1,
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
  });
}

/** System prompt for the ranker: rank by relevance, use only provided IDs, return JSON. */
const SYSTEM_PROMPT_RANK = `You are a medical search evaluator. You will receive a patient query and a list of candidate profile cards (JSON array). Each card has practitioner_id (use this exact value in your response) and rank_index (1-based position in the list).

Your task: Rank the candidates by relevance to the patient query and return exactly the top 12 practitioner_ids in order (best match first). Use ONLY practitioner_id values that appear in the provided list. Do not invent or modify any ID. Base relevance only on the fields in each card: specialty, subspecialties, procedures, conditions, clinical_interests, description. Do not invent facts. Strongly prefer practitioners whose procedures, conditions, or subspecialties directly match the patient's concern. Down-rank those whose main focus does not align with the query.`;

/**
 * Build ranking hints from intentData (anchor_phrases, likely_subspecialties, negative_terms) for the prompt.
 * @param {{ anchor_phrases?: string[], likely_subspecialties?: { name: string, confidence?: number }[], negative_terms?: string[] }|null} intentData
 * @returns {string} Empty string if no intent, otherwise a "Ranking hints" section for the user message.
 */
function buildIntentHints(intentData) {
  if (!intentData) return '';
  const parts = [];
  const anchorPhrases = intentData.anchor_phrases || [];
  if (anchorPhrases.length > 0) {
    parts.push(`Prefer practitioners whose profile contains these phrases: ${anchorPhrases.join(', ')}.`);
  }
  const subs = intentData.likely_subspecialties || [];
  if (subs.length > 0) {
    const names = subs.map((s) => (s && s.name) ? s.name : '').filter(Boolean);
    if (names.length > 0) {
      parts.push(`Prefer these subspecialties when they match the practitioner's subspecialties: ${names.join(', ')}.`);
    }
  }
  const negativeTerms = intentData.negative_terms || [];
  if (negativeTerms.length > 0) {
    parts.push(`Down-rank practitioners whose profile strongly emphasizes these areas (patient is not seeking these): ${negativeTerms.join(', ')}.`);
  }
  if (parts.length === 0) return '';
  return `\nRanking hints (use these to prefer or down-rank):\n${parts.join('\n')}`;
}

/** JSON schema for structured output: ranked_practitioner_ids array of exactly 12 strings. */
const RANKING_RESPONSE_SCHEMA = {
  name: 'ranking_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      ranked_practitioner_ids: {
        type: 'array',
        description: 'Exactly 12 practitioner_id values in order of relevance (best first)',
        items: { type: 'string' },
        minItems: 12,
        maxItems: 12,
      },
    },
    required: ['ranked_practitioner_ids'],
    additionalProperties: false,
  },
};

/** Multi-stage: Stage 1 – shortlist relevant practitioners (recall-focused). */
const SYSTEM_PROMPT_SHORTLIST = `You are a medical search evaluator. You will receive a patient query and a list of candidate profile cards (JSON array). Each card has practitioner_id (use this exact value in your response).

Your task: Identify which practitioners are RELEVANT to the patient query. Return between 12 and 25 practitioner_ids that are relevant (do not order them; order does not matter). Include anyone who could reasonably help with the patient's concern based on specialty, subspecialties, procedures, conditions, and clinical expertise. When in doubt, include rather than exclude. Use ONLY practitioner_id values from the provided list. Do not invent or modify any ID.`;

/** Schema for stage 1: relevant_practitioner_ids, 12–25 items (at least 12 so stage 2 has enough). */
const SHORTLIST_RESPONSE_SCHEMA = {
  name: 'shortlist_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      relevant_practitioner_ids: {
        type: 'array',
        description: 'Between 12 and 25 practitioner_id values that are relevant to the query (order does not matter)',
        items: { type: 'string' },
        minItems: 12,
        maxItems: 25,
      },
    },
    required: ['relevant_practitioner_ids'],
    additionalProperties: false,
  },
};

/**
 * Call the LLM to rank profile cards by relevance to the patient query. Uses structured output,
 * closed set of valid IDs in the prompt, and validates/backfills the response. When intentData
 * is provided, injects ranking hints (anchor_phrases, likely_subspecialties, negative_terms) into the prompt.
 *
 * @param {string} userQuery - Patient query
 * @param {Object[]} profileCards - From buildProfileCardsForRanking (must include practitioner_id)
 * @param {number} topK - Number of top IDs to return (default 12)
 * @param {string|null} modelOverride - Optional model override
 * @param {string[]} bm25OrderIds - Ordered list of practitioner_id from BM25 Stage A (for backfill)
 * @param {{ anchor_phrases?: string[], likely_subspecialties?: { name: string }[], negative_terms?: string[] }|null} intentData - Optional; when set, ranking hints are added to the prompt
 * @returns {Promise<string[]>} Ordered list of topK practitioner_ids (valid only from cards, backfilled if needed)
 */
async function rankWithAI(userQuery, profileCards, topK = DEFAULT_TOP_K, modelOverride = null, bm25OrderIds = [], intentData = null) {
  if (!profileCards || profileCards.length === 0) {
    return bm25OrderIds.slice(0, topK);
  }
  const validIds = new Set(profileCards.map((c) => c.practitioner_id).filter(Boolean));
  const validIdsList = Array.from(validIds);
  const model = modelOverride || DEFAULT_MODEL;

  const validIdsLine = `Valid practitioner_ids (you must use only these, in your chosen order): ${JSON.stringify(validIdsList)}`;
  const intentHints = buildIntentHints(intentData || null);
  const cardsJson = JSON.stringify(profileCards, null, 0);
  const userContent = `${validIdsLine}\n\nPatient query:\n"${userQuery}"${intentHints}\n\nCandidate profile cards:\n${cardsJson}`;

  let parsed;
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_RANK },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_completion_tokens: 500,
      response_format: {
        type: 'json_schema',
        json_schema: RANKING_RESPONSE_SCHEMA,
      },
    });
    const raw = response.choices[0].message.content || '';
    let content = raw.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    parsed = JSON.parse(content);
  } catch (e) {
    console.warn('[V4 rankWithAI] LLM call or parse failed:', e.message);
    return bm25OrderIds.slice(0, topK);
  }

  let ids = Array.isArray(parsed.ranked_practitioner_ids) ? parsed.ranked_practitioner_ids : [];
  ids = ids.filter((id) => validIds.has(id));
  const seen = new Set();
  const deduped = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }

  if (deduped.length < topK && bm25OrderIds.length > 0) {
    for (const id of bm25OrderIds) {
      if (deduped.length >= topK) break;
      if (validIds.has(id) && !seen.has(id)) {
        seen.add(id);
        deduped.push(id);
      }
    }
  }
  return deduped.slice(0, topK);
}

/**
 * Multi-stage Stage 1: shortlist relevant practitioner_ids (15–25) from the full candidate set.
 * Task is recall-focused (include relevant); order does not matter.
 *
 * @param {string} userQuery - Patient query
 * @param {Object[]} profileCards - Full set of cards (e.g. 50)
 * @param {{ anchor_phrases?: string[], likely_subspecialties?: { name: string }[], negative_terms?: string[] }|null} intentData
 * @param {string|null} modelOverride
 * @param {string[]} bm25OrderIds - For backfill if shortlist fails or returns too few
 * @returns {Promise<string[]>} 15–25 practitioner_ids (valid only from cards; backfilled to at least 12 if needed)
 */
async function shortlistWithAI(userQuery, profileCards, intentData, modelOverride, bm25OrderIds) {
  if (!profileCards || profileCards.length === 0) return bm25OrderIds.slice(0, 25);
  const validIds = new Set(profileCards.map((c) => c.practitioner_id).filter(Boolean));
  const validIdsList = Array.from(validIds);
  const model = modelOverride || DEFAULT_MODEL;
  const intentHints = buildIntentHints(intentData || null);
  const validIdsLine = `Valid practitioner_ids (you must use only these): ${JSON.stringify(validIdsList)}`;
  const cardsJson = JSON.stringify(profileCards, null, 0);
  const userContent = `${validIdsLine}\n\nPatient query:\n"${userQuery}"${intentHints}\n\nCandidate profile cards:\n${cardsJson}`;

  let parsed;
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_SHORTLIST },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_completion_tokens: 800,
      response_format: { type: 'json_schema', json_schema: SHORTLIST_RESPONSE_SCHEMA },
    });
    const raw = response.choices[0].message.content || '';
    let content = raw.trim();
    if (content.startsWith('```')) content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(content);
  } catch (e) {
    console.warn('[V4 shortlistWithAI] LLM call or parse failed:', e.message);
    return bm25OrderIds.slice(0, 25);
  }
  let ids = Array.isArray(parsed.relevant_practitioner_ids) ? parsed.relevant_practitioner_ids : [];
  ids = ids.filter((id) => validIds.has(id));
  const seen = new Set();
  const deduped = [];
  for (const id of ids) {
    if (!seen.has(id)) { seen.add(id); deduped.push(id); }
  }
  if (deduped.length < 12 && bm25OrderIds.length > 0) {
    for (const id of bm25OrderIds) {
      if (deduped.length >= 25) break;
      if (validIds.has(id) && !seen.has(id)) { seen.add(id); deduped.push(id); }
    }
  }
  return deduped.slice(0, 25);
}

/**
 * V4 entry point: get top 50 from BM25 Stage A, build profile cards, rank with AI, return top shortlistSize.
 *
 * @param {Object[]} practitioners - Full specialty practitioner list
 * @param {Object} filters - Same shape as for getBM25Shortlist (q_patient, safe_lane_terms, anchor_phrases, intent_terms, intentData, variantName, etc.)
 * @param {Object} sessionContext - From getSessionContextParallelV2 (q_patient, etc.)
 * @param {number} shortlistSize - Number of results to return (default 12)
 * @param {{ modelOverride?: string, maxDescriptionChars?: number, stageATopN?: number }} options - Optional model, card, and Stage A N (default from filters.rankingConfig.stage_a_top_n or 50)
 * @returns {Promise<{ results: Array<{ document: Object, score: number }>, queryInfo?: Object }>} Same shape as getBM25Shortlist results
 */
async function getRankingV4(practitioners, filters, sessionContext, shortlistSize = 12, options = {}) {
  const { getBM25StageATopN } = require('../testing/services/local-bm25-service');
  const stageATopN = options.stageATopN ?? filters.rankingConfig?.stage_a_top_n ?? 50;
  const stageAResults = getBM25StageATopN(practitioners, filters, stageATopN);
  const topDocs = stageAResults.map((r) => r.document);
  const bm25OrderIds = topDocs.map((d) => d.practitioner_id || d.id).filter(Boolean);

  const maxDesc = options.maxDescriptionChars ?? DEFAULT_MAX_DESCRIPTION_CHARS;
  const cards = buildProfileCardsForRanking(topDocs, { maxDescriptionChars: maxDesc });
  const modelOverride = options.modelOverride || null;
  const intentData = sessionContext.intentData || null;
  const rankedIds = await rankWithAI(
    sessionContext.q_patient || sessionContext.enrichedQuery || '',
    cards,
    shortlistSize,
    modelOverride,
    bm25OrderIds,
    intentData
  );

  const byId = new Map();
  topDocs.forEach((doc) => {
    const id = doc.practitioner_id || doc.id;
    if (id) byId.set(id, doc);
  });
  const results = [];
  rankedIds.forEach((id, idx) => {
    const doc = byId.get(id);
    if (doc) results.push({ document: doc, score: 1 / (idx + 1) });
  });
  return {
    results,
    queryInfo: {
      q_patient: sessionContext.q_patient || null,
      intentData: sessionContext.intentData || null,
      variant: 'v4-ai-ranking',
    },
  };
}

/**
 * V4 multi-stage: Stage 1 shortlist (15–25 relevant IDs) then Stage 2 rank (top 12).
 * Most impactful multi-stage design: Stage 1 focuses on recall; Stage 2 focuses on order with smaller context.
 *
 * @param {Object[]} practitioners - Full specialty practitioner list
 * @param {Object} filters - Same as getRankingV4
 * @param {Object} sessionContext - From getSessionContextParallelV2
 * @param {number} shortlistSize - Number to return (default 12)
 * @param {{ modelOverride?: string, maxDescriptionChars?: number, stageATopN?: number }} options
 * @returns {Promise<{ results: Array<{ document: Object, score: number }>, queryInfo?: Object }>}
 */
async function getRankingV4MultiStage(practitioners, filters, sessionContext, shortlistSize = 12, options = {}) {
  const { getBM25StageATopN } = require('../testing/services/local-bm25-service');
  const stageATopN = options.stageATopN ?? filters.rankingConfig?.stage_a_top_n ?? 50;
  const stageAResults = getBM25StageATopN(practitioners, filters, stageATopN);
  const topDocs = stageAResults.map((r) => r.document);
  const bm25OrderIds = topDocs.map((d) => d.practitioner_id || d.id).filter(Boolean);

  const maxDesc = options.maxDescriptionChars ?? DEFAULT_MAX_DESCRIPTION_CHARS;
  const cards = buildProfileCardsForRanking(topDocs, { maxDescriptionChars: maxDesc });
  const modelOverride = options.modelOverride || null;
  const intentData = sessionContext.intentData || null;
  const q = sessionContext.q_patient || sessionContext.enrichedQuery || '';

  const shortlistIds = await shortlistWithAI(q, cards, intentData, modelOverride, bm25OrderIds);
  const shortlistIdSet = new Set(shortlistIds);
  const shortlistCards = shortlistIds.map((id) => cards.find((c) => c.practitioner_id === id)).filter(Boolean);
  if (shortlistCards.length === 0) {
    const byId = new Map(topDocs.map((d) => [(d.practitioner_id || d.id), d]));
    const results = bm25OrderIds.slice(0, shortlistSize).map((id, idx) => {
      const doc = byId.get(id);
      return doc ? { document: doc, score: 1 / (idx + 1) } : null;
    }).filter(Boolean);
    return { results, queryInfo: { q_patient: q, intentData, variant: 'v4-ai-ranking-multistage' } };
  }

  const rankedIds = await rankWithAI(q, shortlistCards, shortlistSize, modelOverride, shortlistIds, intentData);
  const byId = new Map(topDocs.map((d) => [(d.practitioner_id || d.id), d]));
  const results = rankedIds.map((id, idx) => {
    const doc = byId.get(id);
    return doc ? { document: doc, score: 1 / (idx + 1) } : null;
  }).filter(Boolean);
  return {
    results,
    queryInfo: {
      q_patient: q,
      intentData,
      variant: 'v4-ai-ranking-multistage',
    },
  };
}

/**
 * V4 with Stage B rescoring: Stage A (BM25 top N) → Stage B (rescore with intent) → Stage B top M → LLM rank top 12.
 * This leverages Stage B's deterministic intent-based ranking before the LLM, giving the LLM a better pre-ranked set.
 *
 * @param {Object[]} practitioners - Full specialty practitioner list
 * @param {Object} filters - Same as getRankingV4
 * @param {Object} sessionContext - From getSessionContextParallelV2
 * @param {number} shortlistSize - Number to return (default 12)
 * @param {{ modelOverride?: string, maxDescriptionChars?: number, stageATopN?: number, stageBTopN?: number }} options
 *   - stageATopN: How many from Stage A BM25 (default 200)
 *   - stageBTopN: How many top results from Stage B rescoring to pass to LLM (default 50)
 * @returns {Promise<{ results: Array<{ document: Object, score: number }>, queryInfo?: Object }>}
 */
async function getRankingV4WithStageB(practitioners, filters, sessionContext, shortlistSize = 12, options = {}) {
  const { getBM25StageATopN } = require('../testing/services/local-bm25-service');
  const { rescoreWithIntentTerms } = require('../testing/services/local-bm25-service');
  const { getRankingConfig } = require('../testing/services/local-bm25-service');
  
  const stageATopN = options.stageATopN ?? filters.rankingConfig?.stage_a_top_n ?? 200;
  const stageBTopN = options.stageBTopN ?? 50; // How many from Stage B to pass to LLM
  
  // Stage A: BM25 retrieval
  const stageAResults = getBM25StageATopN(practitioners, filters, stageATopN);
  
  // Stage B: Rescore Stage A results with intent terms
  const rc = getRankingConfig(filters);
  const intent_terms = filters.intent_terms || [];
  const negative_terms = filters.intentData?.negative_terms || null;
  const anchor_phrases = filters.anchor_phrases || filters.intentData?.anchor_phrases || null;
  const likely_subspecialties = filters.intentData?.likely_subspecialties || null;
  const safe_lane_terms = filters.safe_lane_terms || [];
  const safe_lane_terms_for_rescoring = (filters.variantName === 'parallel-v2' && safe_lane_terms.length > 0) ? safe_lane_terms : null;
  const isParallelVariant = filters.variantName === 'parallel' || filters.variantName === 'parallel-v2';
  const isQueryAmbiguous = filters.intentData?.isQueryAmbiguous ?? true;
  const useRescoringScoreAsPrimary = isParallelVariant && isQueryAmbiguous;
  
  const stageBResults = rescoreWithIntentTerms(
    stageAResults,
    intent_terms,
    negative_terms,
    anchor_phrases,
    likely_subspecialties,
    safe_lane_terms_for_rescoring,
    useRescoringScoreAsPrimary,
    rc
  );
  
  // Take top M from Stage B for LLM
  const stageBTopDocs = stageBResults.slice(0, stageBTopN).map((r) => r.document);
  const stageBOrderIds = stageBTopDocs.map((d) => d.practitioner_id || d.id).filter(Boolean);
  
  // LLM: Rank Stage B top M → top 12
  const maxDesc = options.maxDescriptionChars ?? DEFAULT_MAX_DESCRIPTION_CHARS;
  const cards = buildProfileCardsForRanking(stageBTopDocs, { maxDescriptionChars: maxDesc });
  const modelOverride = options.modelOverride || null;
  const intentData = sessionContext.intentData || null;
  const rankedIds = await rankWithAI(
    sessionContext.q_patient || sessionContext.enrichedQuery || '',
    cards,
    shortlistSize,
    modelOverride,
    stageBOrderIds,
    intentData
  );
  
  const byId = new Map();
  stageBTopDocs.forEach((doc) => {
    const id = doc.practitioner_id || doc.id;
    if (id) byId.set(id, doc);
  });
  const results = [];
  rankedIds.forEach((id, idx) => {
    const doc = byId.get(id);
    if (doc) results.push({ document: doc, score: 1 / (idx + 1) });
  });
  return {
    results,
    queryInfo: {
      q_patient: sessionContext.q_patient || null,
      intentData: sessionContext.intentData || null,
      variant: 'v4-ai-ranking-stage-b',
    },
  };
}

module.exports = {
  parseClinicalExpertise,
  buildProfileCardsForRanking,
  buildIntentHints,
  rankWithAI,
  shortlistWithAI,
  getRankingV4,
  getRankingV4MultiStage,
  getRankingV4WithStageB,
  DEFAULT_MODEL,
  DEFAULT_MAX_DESCRIPTION_CHARS,
  DEFAULT_TOP_K,
};
