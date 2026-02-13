/**
 * V2 Ranking Algorithm - Packaged Module
 * 
 * This module provides a clean interface to the V2 ranking algorithm which uses:
 * - Session context extraction (intent terms, anchor phrases, safe lane terms)
 * - Two-stage BM25 retrieval (Stage A: broad retrieval, Stage B: rescoring)
 * - Configurable ranking weights
 * 
 * Usage:
 *   const { rankPractitioners } = require('./ranking-v2-package');
 *   const results = await rankPractitioners(practitioners, userQuery, {
 *     messages: [],
 *     location: null,
 *     rankingConfig: null, // Optional: custom weights JSON
 *     shortlistSize: 12,
 *     lexiconsDir: __dirname
 *   });
 */

const path = require('path');
const fs = require('fs');

// Resolve paths relative to parent directory (where parallel-ranking-package is located)
const parentDir = path.resolve(__dirname, '..');
const { getSessionContextParallelV2 } = require(path.join(parentDir, 'parallel-ranking-package/algorithm/session-context-variants'));
const { getBM25Shortlist } = require(path.join(parentDir, 'parallel-ranking-package/testing/services/local-bm25-service'));

/**
 * Rank practitioners using V2 ranking algorithm
 * 
 * @param {Object[]} practitioners - Array of practitioner objects
 * @param {string} userQuery - The patient's search query
 * @param {Object} options - Configuration options
 * @param {Array} options.messages - Conversation history (optional, defaults to [])
 * @param {string|null} options.location - Location filter (optional)
 * @param {Object|string|null} options.rankingConfig - Ranking weights config object or path to JSON file (optional)
 * @param {number} options.shortlistSize - Number of results to return (default: 12)
 * @param {string} options.lexiconsDir - Directory path for lexicons (default: parent directory)
 * @param {string} options.specialty - Expected specialty for context (optional)
 * @param {Object} options.sessionContextCache - Pre-computed session context cache (optional)
 * @param {string} options.sessionContextCacheId - ID to lookup in sessionContextCache (optional)
 * @param {string|null} options.patient_age_group - Age group filter: "Adult", "Paediatric", "Child", etc. (optional)
 * @param {string[]|null} options.languages - Language filter: array of language strings (optional)
 * @param {string|null} options.gender - Gender filter: "Male", "Female" (optional)
 * @param {string|null} options.manualSpecialty - Manual specialty filter applied before ranking (optional)
 * 
 * @returns {Promise<Object>} Ranking results with the following structure:
 *   {
 *     results: [
 *       {
 *         document: Object,      // Full practitioner object
 *         score: number,         // Final ranking score
 *         rank: number,          // Position (1-indexed)
 *         bm25Score: number,      // Stage A BM25 score
 *         rescoringInfo: Object  // Stage B rescoring details
 *       }
 *     ],
 *     sessionContext: Object,    // Extracted session context
 *     metadata: {
 *       totalPractitioners: number,
 *       stageATopN: number,
 *       shortlistSize: number,
 *       query: string
 *     }
 *   }
 */
async function rankPractitioners(practitioners, userQuery, options = {}) {
  const {
    messages = [],
    location = null,
    rankingConfig = null,
    shortlistSize = 12,
    lexiconsDir = parentDir,
    specialty = null,
    sessionContextCache = null,
    sessionContextCacheId = null,
    patient_age_group = null,
    languages = null,
    gender = null,
    manualSpecialty = null,
    locationFilter = null,
  } = options;

  // Load ranking config if provided as a file path
  let config = rankingConfig;
  if (typeof rankingConfig === 'string') {
    const configPath = path.isAbsolute(rankingConfig) 
      ? rankingConfig 
      : path.join(parentDir, 'optimization', rankingConfig);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      console.warn(`[Ranking] Ranking config file not found: ${configPath}, using defaults`);
      config = null;
    }
  }

  // Step 1: Get session context
  let sessionContext;
  if (sessionContextCache && sessionContextCacheId && sessionContextCache[sessionContextCacheId]) {
    // Use cached session context
    sessionContext = sessionContextCache[sessionContextCacheId];
  } else {
    // Generate session context
    sessionContext = await getSessionContextParallelV2(
      userQuery || '',
      messages.length > 0 ? messages : [{ role: 'user', content: userQuery }],
      location,
      {
        lexiconsDir,
        specialty: specialty || undefined,
      }
    );
  }

  // Step 2: Apply manual specialty filter BEFORE ranking (if provided)
  let filteredPractitioners = practitioners;
  const initialCount = practitioners.length;
  if (manualSpecialty && String(manualSpecialty).trim()) {
    const { filterBySpecialty } = require(path.join(parentDir, 'specialty-filter'));
    filteredPractitioners = filterBySpecialty(practitioners, { manualSpecialty: String(manualSpecialty).trim() });
  }

  // Step 2b: Apply location filter BEFORE ranking (if provided)
  if (locationFilter && typeof locationFilter === 'object') {
    const { filterByLocation } = require(path.join(parentDir, 'location-filter'));
    filteredPractitioners = filterByLocation(filteredPractitioners, locationFilter);
  }

  // Step 3: Prepare filters for BM25 ranking (includes age group, gender, languages)
  const filters = {
    q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
    safe_lane_terms: sessionContext.safe_lane_terms || [],
    intent_terms: sessionContext.intent_terms || [],
    anchor_phrases: sessionContext.anchor_phrases || sessionContext.intentData?.anchor_phrases || null,
    searchQuery: sessionContext.enrichedQuery,
    intentData: sessionContext.intentData || null,
    variantName: 'parallel-v2',
    // Add filter conditions (BM25 service will apply these before ranking)
    patient_age_group: patient_age_group || null,
    languages: Array.isArray(languages) ? languages : (languages ? [languages] : null),
    gender: gender || null,
    ...(config && { rankingConfig: config }),
  };

  // Step 4: Run BM25 ranking with two-stage retrieval (filters applied internally)
  const bm25Result = getBM25Shortlist(filteredPractitioners, filters, shortlistSize);

  // Step 5: Format results
  const results = (bm25Result.results || []).map((r, index) => ({
    document: r.document,
    score: parseFloat(r.score) || 0,
    rank: index + 1,
    bm25Score: parseFloat(r.bm25Score) || 0,
    rescoringInfo: r.rescoringInfo || null,
  }));

  return {
    results,
    sessionContext: {
      q_patient: sessionContext.q_patient,
      enrichedQuery: sessionContext.enrichedQuery,
      intent_terms: sessionContext.intent_terms,
      anchor_phrases: sessionContext.anchor_phrases,
      safe_lane_terms: sessionContext.safe_lane_terms,
      intentData: sessionContext.intentData,
      queryClarity: sessionContext.queryClarity,
    },
    metadata: {
      totalPractitioners: initialCount,
      filteredPractitioners: filteredPractitioners.length,
      stageATopN: config?.stage_a_top_n || 150,
      shortlistSize: results.length,
      query: userQuery,
      filtersApplied: {
        manualSpecialty: manualSpecialty || null,
        locationFilter: locationFilter || null,
        patient_age_group: patient_age_group || null,
        languages: languages || null,
        gender: gender || null,
      },
    },
  };
}

/**
 * Rank practitioners synchronously (if session context is pre-computed)
 * 
 * @param {Object[]} practitioners - Array of practitioner objects
 * @param {Object} sessionContext - Pre-computed session context object
 * @param {Object} options - Configuration options
 * @param {Object|string|null} options.rankingConfig - Ranking weights config object or path to JSON file (optional)
 * @param {number} options.shortlistSize - Number of results to return (default: 12)
 * 
 * @returns {Object} Ranking results (same structure as rankPractitioners)
 */
function rankPractitionersSync(practitioners, sessionContext, options = {}) {
  const {
    rankingConfig = null,
    shortlistSize = 12,
    patient_age_group = null,
    languages = null,
    gender = null,
    manualSpecialty = null,
    locationFilter = null,
  } = options;

  // Load ranking config if provided as a file path
  let config = rankingConfig;
  if (typeof rankingConfig === 'string') {
    const configPath = path.isAbsolute(rankingConfig) 
      ? rankingConfig 
      : path.join(parentDir, 'optimization', rankingConfig);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      console.warn(`[Ranking] Ranking config file not found: ${configPath}, using defaults`);
      config = null;
    }
  }

  // Apply manual specialty filter BEFORE ranking (if provided)
  let filteredPractitioners = practitioners;
  const initialCount = practitioners.length;
  if (manualSpecialty && String(manualSpecialty).trim()) {
    const { filterBySpecialty } = require(path.join(parentDir, 'specialty-filter'));
    filteredPractitioners = filterBySpecialty(practitioners, { manualSpecialty: String(manualSpecialty).trim() });
  }

  // Apply location filter BEFORE ranking (if provided)
  if (locationFilter && typeof locationFilter === 'object') {
    const { filterByLocation } = require(path.join(parentDir, 'location-filter'));
    filteredPractitioners = filterByLocation(filteredPractitioners, locationFilter);
  }

  // Prepare filters (includes age group, gender, languages)
  const filters = {
    q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
    safe_lane_terms: sessionContext.safe_lane_terms || [],
    intent_terms: sessionContext.intent_terms || [],
    anchor_phrases: sessionContext.anchor_phrases || sessionContext.intentData?.anchor_phrases || null,
    searchQuery: sessionContext.enrichedQuery,
    intentData: sessionContext.intentData || null,
    variantName: 'parallel-v2',
    // Add filter conditions
    patient_age_group: patient_age_group || null,
    languages: Array.isArray(languages) ? languages : (languages ? [languages] : null),
    gender: gender || null,
    ...(config && { rankingConfig: config }),
  };

  // Run BM25 ranking (filters applied internally)
  const bm25Result = getBM25Shortlist(filteredPractitioners, filters, shortlistSize);

  // Format results
  const results = (bm25Result.results || []).map((r, index) => ({
    document: r.document,
    score: parseFloat(r.score) || 0,
    rank: index + 1,
    bm25Score: parseFloat(r.bm25Score) || 0,
    rescoringInfo: r.rescoringInfo || null,
  }));

  return {
    results,
    sessionContext,
    metadata: {
      totalPractitioners: initialCount,
      filteredPractitioners: filteredPractitioners.length,
      stageATopN: config?.stage_a_top_n || 150,
      shortlistSize: results.length,
      query: sessionContext.q_patient || sessionContext.enrichedQuery,
      filtersApplied: {
        manualSpecialty: manualSpecialty || null,
        locationFilter: locationFilter || null,
        patient_age_group: patient_age_group || null,
        languages: languages || null,
        gender: gender || null,
      },
    },
  };
}

module.exports = {
  rankPractitioners,
  rankPractitionersSync,
  rankPractitionersProgressive: require('./progressive-ranking-v6').rankPractitionersProgressive,
};
