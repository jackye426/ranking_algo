/**
 * V6 Progressive Ranking
 * 
 * Iteratively refines ranking until top 3 are all "excellent fit" or 30 profiles reviewed
 * 
 * Usage:
 *   const { rankPractitionersProgressive } = require('./ranking-v2-package');
 *   const results = await rankPractitionersProgressive(practitioners, userQuery, options);
 */

const path = require('path');
const fs = require('fs');
const { evaluateFit } = require('./evaluate-fit');

// Lazy load rankPractitioners to avoid circular dependency
function getRankPractitioners() {
  // Import at function level to avoid circular dependency
  const { rankPractitioners } = require('./index');
  return rankPractitioners;
}

// Resolve paths relative to parent directory
const parentDir = path.resolve(__dirname, '..');
const { getBM25Shortlist, getBM25StageATopN } = require(path.join(parentDir, 'parallel-ranking-package/testing/services/local-bm25-service'));

/**
 * Get practitioner ID from practitioner object
 */
function getPractitionerId(practitioner) {
  return practitioner.practitioner_id || practitioner.id || null;
}

/**
 * Map LLM evaluation results to practitioner objects
 * 
 * @param {Object[]} practitioners - Array of practitioner objects
 * @param {Object} evaluation - LLM evaluation result with per_doctor array
 * @param {number} iteration - Current iteration number
 * @returns {Map<string, Object>} Map of practitioner_id -> evaluation data
 */
function mapEvaluationToPractitioners(practitioners, evaluation, iteration) {
  const evaluationMap = new Map();
  const perDoctor = evaluation.per_doctor || [];
  
  // Create name -> practitioner map for lookup
  const nameToPractitioner = new Map();
  practitioners.forEach(p => {
    const name = p.name || '';
    if (name) {
      nameToPractitioner.set(name.toLowerCase().trim(), p);
    }
  });
  
  // Map evaluation results
  perDoctor.forEach(evalItem => {
    const name = (evalItem.practitioner_name || '').toLowerCase().trim();
    const practitioner = nameToPractitioner.get(name);
    
    if (practitioner) {
      const id = getPractitionerId(practitioner);
      if (id) {
        evaluationMap.set(id, {
          fit_category: evalItem.fit_category || 'good',
          brief_reason: evalItem.brief_reason || '',
          iteration_found: iteration,
        });
      }
    }
  });
  
  return evaluationMap;
}

/**
 * Check termination conditions
 * 
 * @param {Object[]} results - Current ranked results with fit_category
 * @param {number} targetTopK - Number of top results that must be excellent
 * @param {number} currentIteration - Current iteration number
 * @param {number} maxIterations - Maximum iterations allowed
 * @param {number} profilesReviewed - Total profiles evaluated so far
 * @param {number} maxProfilesReviewed - Maximum profiles to evaluate
 * @returns {Object} { shouldTerminate: boolean, reason: string }
 */
function checkTerminationCondition(results, targetTopK, currentIteration, maxIterations, profilesReviewed, maxProfilesReviewed) {
  // Check if top K are all excellent
  const topK = results.slice(0, targetTopK);
  const allTopKExcellent = topK.length === targetTopK && 
    topK.every(r => r.fit_category === 'excellent');
  
  if (allTopKExcellent) {
    return { shouldTerminate: true, reason: 'top-k-excellent' };
  }
  
  // Check max iterations
  if (currentIteration >= maxIterations) {
    return { shouldTerminate: true, reason: 'max-iterations' };
  }
  
  // Check max profiles reviewed
  if (profilesReviewed >= maxProfilesReviewed) {
    return { shouldTerminate: true, reason: 'max-profiles-reviewed' };
  }
  
  return { shouldTerminate: false, reason: null };
}

/**
 * Fetch additional profiles from Stage A or Stage B
 * 
 * @param {Object[]} practitioners - Full practitioner list
 * @param {Object} filters - BM25 filters (from session context)
 * @param {Set<string>} alreadyFetchedIds - Set of practitioner IDs already fetched
 * @param {number} batchSize - Number of profiles to fetch
 * @param {string} fetchStrategy - 'stage-b' or 'stage-a'
 * @param {number} currentFetchedCount - Current number of profiles fetched
 * @returns {Object[]} Array of new practitioner objects
 */
function fetchAdditionalProfiles(practitioners, filters, alreadyFetchedIds, batchSize, fetchStrategy, currentFetchedCount) {
  // Fetch more profiles than needed to account for already-evaluated ones
  // Request at least 2x batchSize to ensure we get enough new profiles
  // Also ensure we request at least enough to cover all practitioners if the pool is small
  const minFetchCount = Math.max(
    currentFetchedCount + batchSize * 2, 
    batchSize * 3,
    Math.min(practitioners.length, currentFetchedCount + batchSize * 5) // Request up to 5x batchSize more if pool allows
  );
  
  console.log(`[V6 fetchAdditionalProfiles] Requesting ${minFetchCount} profiles (currentFetchedCount: ${currentFetchedCount}, batchSize: ${batchSize}, total practitioners: ${practitioners.length}, already evaluated: ${alreadyFetchedIds.size})`);
  
  if (fetchStrategy === 'stage-a') {
    // Fetch from Stage A (BM25 only, no rescoring)
    const stageAResults = getBM25StageATopN(practitioners, filters, minFetchCount);
    console.log(`[V6 fetchAdditionalProfiles] Stage A returned ${stageAResults.length} results`);
    
    // Filter out already fetched profiles
    const newProfiles = stageAResults
      .map(r => r.document)
      .filter(doc => {
        const id = getPractitionerId(doc);
        return id && !alreadyFetchedIds.has(id);
      })
      .slice(0, batchSize);
    
    console.log(`[V6 fetchAdditionalProfiles] After filtering, ${newProfiles.length} new profiles`);
    return newProfiles;
  } else {
    // Fetch from Stage B (with rescoring) - preferred strategy
    const bm25Result = getBM25Shortlist(practitioners, filters, minFetchCount);
    console.log(`[V6 fetchAdditionalProfiles] Stage B returned ${bm25Result.results?.length || 0} results`);
    
    // Filter out already fetched profiles
    const newProfiles = (bm25Result.results || [])
      .map(r => r.document)
      .filter(doc => {
        const id = getPractitionerId(doc);
        return id && !alreadyFetchedIds.has(id);
      })
      .slice(0, batchSize);
    
    console.log(`[V6 fetchAdditionalProfiles] After filtering, ${newProfiles.length} new profiles`);
    return newProfiles;
  }
}

/**
 * Merge and deduplicate practitioner arrays
 * 
 * @param {Object[]} existing - Existing practitioners
 * @param {Object[]} newProfiles - New practitioners to add
 * @returns {Object[]} Merged and deduplicated array
 */
function mergeAndDeduplicate(existing, newProfiles) {
  const idSet = new Set();
  const merged = [];
  
  // Add existing profiles
  existing.forEach(p => {
    const id = getPractitionerId(p);
    if (id && !idSet.has(id)) {
      idSet.add(id);
      merged.push(p);
    }
  });
  
  // Add new profiles
  newProfiles.forEach(p => {
    const id = getPractitionerId(p);
    if (id && !idSet.has(id)) {
      idSet.add(id);
      merged.push(p);
    }
  });
  
  return merged;
}

/**
 * Re-rank practitioners by quality category
 * 
 * @param {Object[]} practitioners - All practitioners to rank
 * @param {Map<string, Object>} evaluationMap - Map of practitioner_id -> evaluation data
 * @param {Map<string, number>} scoreMap - Map of practitioner_id -> original V2 score
 * @param {Map<string, number>} iterationFoundMap - Map of practitioner_id -> iteration when first discovered
 * @param {number} shortlistSize - Number of results to return
 * @returns {Object[]} Re-ranked results with fit_category and other metadata
 */
function rerankByQuality(practitioners, evaluationMap, scoreMap, iterationFoundMap, shortlistSize) {
  // Categorize practitioners
  const excellent = [];
  const good = [];
  const illFit = [];
  
  practitioners.forEach(p => {
    const id = getPractitionerId(p);
    if (!id) return;
    
    const evalData = evaluationMap.get(id);
    const fitCategory = evalData ? evalData.fit_category : 'good';
    const score = scoreMap.get(id) || 0;
    
    const iterationFound = iterationFoundMap.get(id) ?? (evalData ? evalData.iteration_found : -1);
    const result = {
      document: p,
      score: score,
      fit_category: fitCategory,
      evaluation_reason: evalData ? evalData.brief_reason : '',
      iteration_found: iterationFound,
    };
    
    if (fitCategory === 'excellent') {
      excellent.push(result);
    } else if (fitCategory === 'good') {
      good.push(result);
    } else {
      illFit.push(result);
    }
  });
  
  // Sort within each category by original score (descending)
  excellent.sort((a, b) => b.score - a.score);
  good.sort((a, b) => b.score - a.score);
  illFit.sort((a, b) => b.score - a.score);
  
  // Combine: excellent first, then good, then ill-fit
  const reranked = [...excellent, ...good, ...illFit];
  
  // Assign ranks
  return reranked.slice(0, shortlistSize).map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));
}

/**
 * Progressive ranking with iterative refinement
 * 
 * @param {Object[]} practitioners - Full practitioner list
 * @param {string} userQuery - Patient query
 * @param {Object} options - Configuration options
 * @param {number} options.maxIterations - Max refinement cycles (default: 5)
 * @param {number} options.maxProfilesReviewed - Max total profiles evaluated by LLM (default: 30)
 * @param {number} options.batchSize - Profiles to fetch per iteration (default: 12)
 * @param {string} options.fetchStrategy - 'stage-b' | 'stage-a' (default: 'stage-b')
 * @param {number} options.targetTopK - Number of top results that must be excellent (default: 3)
 * @param {string} options.model - LLM model for evaluation (default: 'gpt-5.1')
 * @param {number} options.shortlistSize - Initial shortlist size (default: 12)
 * @param {...} options - All other options from rankPractitioners (messages, location, rankingConfig, etc.)
 * 
 * @returns {Promise<Object>} Results with progressive ranking metadata
 */
async function rankPractitionersProgressive(practitioners, userQuery, options = {}) {
  const {
    maxIterations = 5,
    maxProfilesReviewed = 30,
    batchSize = 12,
    fetchStrategy = 'stage-a', // Use stage-a for better coverage when many profiles have low scores
    targetTopK = 3,
    model = 'gpt-5.1',
    shortlistSize = 12,
    // Pass through other V2 options
    messages = [],
    location = null,
    rankingConfig = null,
    lexiconsDir = null,
    specialty = null,
    sessionContextCache = null,
    sessionContextCacheId = null,
    patient_age_group = null,
    languages = null,
    gender = null,
    manualSpecialty = null,
    locationFilter = null,
    insurancePreference = null,
  } = options;

  // 🚫 BLACKLIST FILTER - Apply FIRST (exclude blacklisted doctors)
  // Never surface blacklisted practitioners
  const beforeBlacklist = practitioners.length;
  practitioners = practitioners.filter(p => !(p.blacklisted === true));
  const blacklistedCount = beforeBlacklist - practitioners.length;
  if (blacklistedCount > 0) {
    console.log(`[V6 Progressive] 🚫 Filtered out ${blacklistedCount} blacklisted practitioner(s)`);
  }

  // Track state
  let currentResults = [];
  let allEvaluatedProfiles = [];
  let evaluatedIds = new Set();
  let evaluationMap = new Map(); // practitioner_id -> { fit_category, brief_reason, iteration_found }
  let scoreMap = new Map(); // practitioner_id -> original V2 score
  let iterationFoundMap = new Map(); // practitioner_id -> iteration when first discovered
  let sessionContext = null;
  let filters = null;
  let iteration = 0;
  let profilesReviewed = 0;
  let profilesFetched = 0;
  const iterationDetails = [];
  let terminationReason = 'unknown';
  let totalPractitioners = practitioners.length;
  let filteredPractitioners = practitioners.length;
  let filteredPractitionersList = practitioners; // Track filtered practitioners for fetching

  try {
    // Phase 1: Initial V2 Ranking
    const v2Options = {
      messages,
      location,
      rankingConfig,
      shortlistSize,
      lexiconsDir,
      specialty,
      sessionContextCache,
      sessionContextCacheId,
      patient_age_group,
      languages,
      gender,
      manualSpecialty,
      locationFilter,
      insurancePreference,
    };

    const rankPractitioners = getRankPractitioners();
    const v2Result = await rankPractitioners(practitioners, userQuery, v2Options);
    sessionContext = v2Result.sessionContext;
    totalPractitioners = v2Result.metadata?.totalPractitioners || practitioners.length;
    filteredPractitioners = v2Result.metadata?.filteredPractitioners || practitioners.length;
    
    // If specialty filter was applied, we need to filter the practitioners list for future fetches
    if (manualSpecialty && String(manualSpecialty).trim()) {
      const { filterBySpecialty } = require(path.join(parentDir, 'specialty-filter'));
      filteredPractitionersList = filterBySpecialty(practitioners, { manualSpecialty: String(manualSpecialty).trim() });
      console.log(`[V6] Specialty filter applied: ${filteredPractitionersList.length} practitioners (from ${practitioners.length})`);
    }

    // If location filter was applied, also filter the practitioners list for future fetches
    if (locationFilter && typeof locationFilter === 'object') {
      const { filterByLocation } = require(path.join(parentDir, 'location-filter'));
      filteredPractitionersList = filterByLocation(filteredPractitionersList, locationFilter);
      console.log(`[V6] Location filter applied: ${filteredPractitionersList.length} practitioners`);
    }
    
    // Load ranking config if needed
    let config = rankingConfig;
    if (typeof rankingConfig === 'string') {
      const configPath = path.isAbsolute(rankingConfig) 
        ? rankingConfig 
        : path.join(parentDir, 'optimization', rankingConfig);
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } else {
        console.warn(`[V6] Ranking config file not found: ${configPath}, using defaults`);
        config = null;
      }
    }

    // Build filters for future fetches
    filters = {
      q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
      safe_lane_terms: sessionContext.safe_lane_terms || [],
      intent_terms: sessionContext.intent_terms || [],
      anchor_phrases: sessionContext.anchor_phrases || sessionContext.intentData?.anchor_phrases || null,
      searchQuery: sessionContext.enrichedQuery,
      intentData: sessionContext.intentData || null,
      variantName: 'parallel-v2',
      patient_age_group: patient_age_group || null,
      languages: Array.isArray(languages) ? languages : (languages ? [languages] : null),
      gender: gender || null,
      ...(config && { rankingConfig: config }),
    };

    // Store initial results and scores
    currentResults = v2Result.results || [];
    currentResults.forEach(r => {
      const id = getPractitionerId(r.document);
      if (id) {
        scoreMap.set(id, r.score);
        evaluatedIds.add(id);
        iterationFoundMap.set(id, 0); // Initial profiles found in iteration 0
      }
    });
    allEvaluatedProfiles = currentResults.map(r => r.document);
    profilesFetched = currentResults.length;

    // Phase 2: Initial LLM Evaluation
    if (currentResults.length === 0) {
      // Empty results - return immediately
      return {
        results: [],
        sessionContext,
        metadata: {
          totalPractitioners,
          filteredPractitioners,
          iterations: 0,
          profilesEvaluated: 0,
          profilesFetched: 0,
          terminationReason: 'empty-results',
          qualityBreakdown: { excellent: 0, good: 0, illFit: 0 },
          iterationDetails: [],
        },
      };
    }

    try {
      const evaluation = await evaluateFit(userQuery, allEvaluatedProfiles, { model, maxPractitioners: currentResults.length });
      const newEvaluationMap = mapEvaluationToPractitioners(allEvaluatedProfiles, evaluation, iteration);
      
      // Merge evaluation data
      newEvaluationMap.forEach((evalData, id) => {
        evaluationMap.set(id, evalData);
      });
      
      profilesReviewed += allEvaluatedProfiles.length;
      
      // Add evaluation data to current results
      currentResults = currentResults.map(r => {
        const id = getPractitionerId(r.document);
        const evalData = evaluationMap.get(id);
        const iterationFound = iterationFoundMap.get(id) ?? 0;
        return {
          ...r,
          fit_category: evalData ? evalData.fit_category : 'good',
          evaluation_reason: evalData ? evalData.brief_reason : '',
          iteration_found: iterationFound,
        };
      });
    } catch (error) {
      console.error('[V6] LLM evaluation failed:', error.message);
      // Fallback: assign 'good' to all
      currentResults = currentResults.map(r => ({
        ...r,
        fit_category: 'good',
        evaluation_reason: 'Evaluation failed',
        iteration_found: 0,
      }));
      terminationReason = 'evaluation-failed';
    }

    // Check initial termination
    const initialTermination = checkTerminationCondition(
      currentResults,
      targetTopK,
      iteration,
      maxIterations,
      profilesReviewed,
      maxProfilesReviewed
    );

    if (initialTermination.shouldTerminate) {
      terminationReason = initialTermination.reason;
      const qualityBreakdown = {
        excellent: currentResults.filter(r => r.fit_category === 'excellent').length,
        good: currentResults.filter(r => r.fit_category === 'good').length,
        illFit: currentResults.filter(r => r.fit_category === 'ill-fit').length,
      };
      
      return {
        results: rerankByQuality(allEvaluatedProfiles, evaluationMap, scoreMap, iterationFoundMap, shortlistSize),
        sessionContext,
        metadata: {
          totalPractitioners,
          filteredPractitioners,
          iterations: iteration + 1,
          profilesEvaluated: profilesReviewed,
          profilesFetched: profilesFetched,
          terminationReason,
          qualityBreakdown,
          iterationDetails: [{
            iteration: iteration,
            profilesFetched: profilesFetched,
            profilesEvaluated: profilesReviewed,
            top3AllExcellent: currentResults.slice(0, 3).every(r => r.fit_category === 'excellent'),
            qualityBreakdown,
          }],
        },
      };
    }

    // Phase 3-8: Iterative Refinement
    while (iteration < maxIterations && profilesReviewed < maxProfilesReviewed) {
      iteration++;
      
      // Phase 4: Fetch Additional Profiles (use filtered practitioners if specialty filter was applied)
      console.log(`[V6] Iteration ${iteration}: Fetching additional profiles (already evaluated: ${evaluatedIds.size}, profilesFetched: ${profilesFetched})`);
      const newProfiles = fetchAdditionalProfiles(
        filteredPractitionersList, // Use filtered list instead of full practitioners
        filters,
        evaluatedIds,
        batchSize,
        fetchStrategy,
        profilesFetched
      );

      console.log(`[V6] Iteration ${iteration}: Fetched ${newProfiles.length} new profiles from ${filteredPractitionersList.length} total practitioners`);

      if (newProfiles.length === 0) {
        // No more profiles available
        console.log(`[V6] Iteration ${iteration}: No new profiles found. Evaluated: ${evaluatedIds.size}, Total filtered: ${filteredPractitionersList.length}`);
        terminationReason = 'no-more-profiles';
        break;
      }

      // Phase 5: Merge and Deduplicate
      allEvaluatedProfiles = mergeAndDeduplicate(allEvaluatedProfiles, newProfiles);
      const newProfileIds = [];
      newProfiles.forEach(p => {
        const id = getPractitionerId(p);
        if (id) {
          evaluatedIds.add(id);
          // Track which iteration this profile was first discovered in
          if (!iterationFoundMap.has(id)) {
            iterationFoundMap.set(id, iteration);
            newProfileIds.push(id);
          }
        }
      });
      profilesFetched += newProfiles.length;
      console.log(`[V6] Iteration ${iteration}: Fetched ${newProfiles.length} new profiles, ${newProfileIds.length} were newly discovered`);

      // Phase 6: Re-evaluate (only new profiles if under cap)
      const remainingCap = maxProfilesReviewed - profilesReviewed;
      const profilesToEvaluate = remainingCap > 0 ? newProfiles.slice(0, remainingCap) : [];
      
      if (profilesToEvaluate.length > 0) {
        try {
          const evaluation = await evaluateFit(userQuery, profilesToEvaluate, { model, maxPractitioners: profilesToEvaluate.length });
          const newEvaluationMap = mapEvaluationToPractitioners(profilesToEvaluate, evaluation, iteration);
          
          // Merge evaluation data
          newEvaluationMap.forEach((evalData, id) => {
            evaluationMap.set(id, evalData);
          });
          
          profilesReviewed += profilesToEvaluate.length;
        } catch (error) {
          console.error(`[V6] LLM evaluation failed at iteration ${iteration}:`, error.message);
          // Assign 'good' to new profiles if evaluation fails
          profilesToEvaluate.forEach(p => {
            const id = getPractitionerId(p);
            if (id && !evaluationMap.has(id)) {
              evaluationMap.set(id, {
                fit_category: 'good',
                brief_reason: 'Evaluation failed',
                iteration_found: iteration,
              });
            }
          });
        }
      }

      // Phase 7: Re-rank by Quality
      currentResults = rerankByQuality(allEvaluatedProfiles, evaluationMap, scoreMap, iterationFoundMap, shortlistSize);

      // Track iteration details
      const qualityBreakdown = {
        excellent: currentResults.filter(r => r.fit_category === 'excellent').length,
        good: currentResults.filter(r => r.fit_category === 'good').length,
        illFit: currentResults.filter(r => r.fit_category === 'ill-fit').length,
      };
      
      iterationDetails.push({
        iteration,
        profilesFetched: newProfiles.length,
        profilesEvaluated: profilesToEvaluate.length,
        top3AllExcellent: currentResults.slice(0, targetTopK).every(r => r.fit_category === 'excellent'),
        qualityBreakdown,
      });

      // Phase 8: Check Termination
      const termination = checkTerminationCondition(
        currentResults,
        targetTopK,
        iteration,
        maxIterations,
        profilesReviewed,
        maxProfilesReviewed
      );

      if (termination.shouldTerminate) {
        terminationReason = termination.reason;
        break;
      }
    }

    // Final termination check
    if (!terminationReason || terminationReason === 'unknown') {
      terminationReason = iteration >= maxIterations ? 'max-iterations' : 
                          profilesReviewed >= maxProfilesReviewed ? 'max-profiles-reviewed' : 
                          'no-more-profiles';
    }

    // Final quality breakdown
    const qualityBreakdown = {
      excellent: currentResults.filter(r => r.fit_category === 'excellent').length,
      good: currentResults.filter(r => r.fit_category === 'good').length,
      illFit: currentResults.filter(r => r.fit_category === 'ill-fit').length,
    };

    return {
      results: currentResults,
      sessionContext,
      metadata: {
        totalPractitioners,
        filteredPractitioners,
        iterations: iteration + 1,
        profilesEvaluated: profilesReviewed,
        profilesFetched: profilesFetched,
        terminationReason,
        qualityBreakdown,
        iterationDetails,
      },
    };

  } catch (error) {
    console.error('[V6] Progressive ranking failed:', error);
    throw error;
  }
}

module.exports = {
  rankPractitionersProgressive,
};
