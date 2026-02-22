/**
 * V7 Progressive Ranking
 *
 * Extends V6 with: LLM-generated medical competency checklist and checklist-based score boosting.
 * Uses normalized data for BM25 and canonical checklist_profile for matching.
 *
 * Usage:
 *   const { rankPractitionersProgressiveV7 } = require('./ranking-v2-package');
 *   const results = await rankPractitionersProgressiveV7(practitioners, userQuery, options);
 */

const path = require('path');
const fs = require('fs');
const { evaluateFit } = require('./evaluate-fit');
const { generateMedicalCompetencyChecklist } = require('./generate-checklist-v7');
const { calculateChecklistBoost } = require('./checklist-matcher-v7');

function getRankPractitioners() {
  const { rankPractitioners } = require('./index');
  return rankPractitioners;
}

const parentDir = path.resolve(__dirname, '..');
const { getBM25Shortlist, getBM25StageATopN } = require(path.join(parentDir, 'parallel-ranking-package/testing/services/local-bm25-service'));

function getPractitionerId(practitioner) {
  return practitioner.practitioner_id || practitioner.id || null;
}

function mapEvaluationToPractitioners(practitioners, evaluation, iteration) {
  const evaluationMap = new Map();
  const perDoctor = evaluation.per_doctor || [];
  const nameToPractitioner = new Map();
  practitioners.forEach(p => {
    const name = p.name || '';
    if (name) nameToPractitioner.set(name.toLowerCase().trim(), p);
  });
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

function checkTerminationCondition(results, targetTopK, currentIteration, maxIterations, profilesReviewed, maxProfilesReviewed) {
  const topK = results.slice(0, targetTopK);
  if (topK.length === targetTopK && topK.every(r => r.fit_category === 'excellent')) {
    return { shouldTerminate: true, reason: 'top-k-excellent' };
  }
  if (currentIteration >= maxIterations) return { shouldTerminate: true, reason: 'max-iterations' };
  if (profilesReviewed >= maxProfilesReviewed) return { shouldTerminate: true, reason: 'max-profiles-reviewed' };
  return { shouldTerminate: false, reason: null };
}

function fetchAdditionalProfiles(practitioners, filters, alreadyFetchedIds, batchSize, fetchStrategy, currentFetchedCount) {
  const minFetchCount = Math.max(
    currentFetchedCount + batchSize * 2,
    batchSize * 3,
    Math.min(practitioners.length, currentFetchedCount + batchSize * 5)
  );
  console.log(`[V7 fetchAdditionalProfiles] Requesting ${minFetchCount} profiles`);
  if (fetchStrategy === 'stage-a') {
    const stageAResults = getBM25StageATopN(practitioners, filters, minFetchCount);
    return stageAResults
      .map(r => r.document)
      .filter(doc => { const id = getPractitionerId(doc); return id && !alreadyFetchedIds.has(id); })
      .slice(0, batchSize);
  }
  const bm25Result = getBM25Shortlist(practitioners, filters, minFetchCount);
  return (bm25Result.results || [])
    .map(r => r.document)
    .filter(doc => { const id = getPractitionerId(doc); return id && !alreadyFetchedIds.has(id); })
    .slice(0, batchSize);
}

function mergeAndDeduplicate(existing, newProfiles) {
  const idSet = new Set();
  const merged = [];
  existing.forEach(p => {
    const id = getPractitionerId(p);
    if (id && !idSet.has(id)) { idSet.add(id); merged.push(p); }
  });
  newProfiles.forEach(p => {
    const id = getPractitionerId(p);
    if (id && !idSet.has(id)) { idSet.add(id); merged.push(p); }
  });
  return merged;
}

function rerankByQuality(practitioners, evaluationMap, scoreMap, iterationFoundMap, shortlistSize) {
  const excellent = [], good = [], illFit = [];
  practitioners.forEach(p => {
    const id = getPractitionerId(p);
    if (!id) return;
    const evalData = evaluationMap.get(id);
    const fitCategory = evalData ? evalData.fit_category : 'good';
    const score = scoreMap.get(id) || 0;
    const iterationFound = iterationFoundMap.get(id) ?? (evalData ? evalData.iteration_found : -1);
    const result = {
      document: p,
      score,
      fit_category: fitCategory,
      evaluation_reason: evalData ? evalData.brief_reason : '',
      iteration_found: iterationFound,
    };
    if (fitCategory === 'excellent') excellent.push(result);
    else if (fitCategory === 'good') good.push(result);
    else illFit.push(result);
  });
  excellent.sort((a, b) => b.score - a.score);
  good.sort((a, b) => b.score - a.score);
  illFit.sort((a, b) => b.score - a.score);
  return [...excellent, ...good, ...illFit].slice(0, shortlistSize).map((r, idx) => ({ ...r, rank: idx + 1 }));
}

/**
 * V7 Progressive ranking with checklist generation and checklist boost
 *
 * @param {Object[]} practitioners - Full practitioner list (normalized + checklist_profile merged)
 * @param {string} userQuery - Patient query
 * @param {Object} options - V6 options plus useChecklist, checklistBoostWeight, checklistMatchThreshold, medicalTaxonomyPath, includeChecklistInLLM
 */
async function rankPractitionersProgressiveV7(practitioners, userQuery, options = {}) {
  const {
    maxIterations = 5,
    maxProfilesReviewed = 30,
    batchSize = 12,
    fetchStrategy = 'stage-a',
    targetTopK = 3,
    model = 'gpt-5.1',
    shortlistSize = 12,
    useChecklist = true,
    checklistBoostWeight = 1.2,
    checklistMatchThreshold = 0.3,
    medicalTaxonomyPath = path.join(parentDir, 'V7 dataset', 'medical_taxonomy.json'),
    includeChecklistInLLM = true,
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
    console.log(`[V7 Progressive] 🚫 Filtered out ${blacklistedCount} blacklisted practitioner(s)`);
  }

  let checklist = { filter_values: [], matched_taxonomy_entries: [], reasoning: '' };
  if (useChecklist) {
    try {
      checklist = await generateMedicalCompetencyChecklist(userQuery, null, {
        model,
        medicalTaxonomyPath,
      });
      console.log(`[V7] Checklist generated: ${(checklist.filter_values || []).length} filter_values`);
    } catch (err) {
      console.warn('[V7] Checklist generation failed:', err.message);
    }
  }

  const checklistBoostOptions = {
    checklistBoostWeight,
    checklistMatchThreshold,
  };
  const hasChecklistBoost = useChecklist && (checklist.filter_values || []).length > 0;

  let currentResults = [];
  let allEvaluatedProfiles = [];
  let evaluatedIds = new Set();
  let evaluationMap = new Map();
  let scoreMap = new Map();
  let iterationFoundMap = new Map();
  let sessionContext = null;
  let filters = null;
  let iteration = 0;
  let profilesReviewed = 0;
  let profilesFetched = 0;
  const iterationDetails = [];
  let terminationReason = 'unknown';
  let totalPractitioners = practitioners.length;
  let filteredPractitioners = practitioners.length;
  let filteredPractitionersList = practitioners;

  try {
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

    if (manualSpecialty && String(manualSpecialty).trim()) {
      const { filterBySpecialty } = require(path.join(parentDir, 'specialty-filter'));
      filteredPractitionersList = filterBySpecialty(practitioners, { manualSpecialty: String(manualSpecialty).trim() });
      console.log(`[V7] Specialty filter applied: ${filteredPractitionersList.length} practitioners`);
    }
    if (locationFilter && typeof locationFilter === 'object') {
      const { filterByLocation } = require(path.join(parentDir, 'location-filter'));
      filteredPractitionersList = filterByLocation(filteredPractitionersList, locationFilter);
      console.log(`[V7] Location filter applied: ${filteredPractitionersList.length} practitioners`);
    }

    let config = rankingConfig;
    if (typeof rankingConfig === 'string') {
      const configPath = path.isAbsolute(rankingConfig) ? rankingConfig : path.join(parentDir, 'optimization', rankingConfig);
      if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      else config = null;
    }

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

    currentResults = v2Result.results || [];
    currentResults.forEach(r => {
      const id = getPractitionerId(r.document);
      if (id) {
        let score = r.score;
        if (hasChecklistBoost) {
          const boost = calculateChecklistBoost(r.document, checklist, checklistBoostOptions);
          score = score * boost;
        }
        scoreMap.set(id, score);
        evaluatedIds.add(id);
        iterationFoundMap.set(id, 0);
      }
    });
    allEvaluatedProfiles = currentResults.map(r => r.document);
    profilesFetched = currentResults.length;

    if (currentResults.length === 0) {
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
          checklist: { filter_values: checklist.filter_values || [], matched_taxonomy_entries: checklist.matched_taxonomy_entries || [] },
          checklist_boost_applied: hasChecklistBoost,
        },
      };
    }

    const evalOptions = { model, maxPractitioners: currentResults.length };
    if (includeChecklistInLLM && (checklist.filter_values || []).length > 0) {
      evalOptions.checklistContext = { filter_values: checklist.filter_values, reasoning: checklist.reasoning };
    }
    try {
      const evaluation = await evaluateFit(userQuery, allEvaluatedProfiles, evalOptions);
      const newEvaluationMap = mapEvaluationToPractitioners(allEvaluatedProfiles, evaluation, iteration);
      newEvaluationMap.forEach((evalData, id) => evaluationMap.set(id, evalData));
      profilesReviewed += allEvaluatedProfiles.length;
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
      console.error('[V7] LLM evaluation failed:', error.message);
      currentResults = currentResults.map(r => ({
        ...r,
        fit_category: 'good',
        evaluation_reason: 'Evaluation failed',
        iteration_found: 0,
      }));
      terminationReason = 'evaluation-failed';
    }

    const initialTermination = checkTerminationCondition(
      currentResults, targetTopK, iteration, maxIterations, profilesReviewed, maxProfilesReviewed
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
            iteration,
            profilesFetched: profilesFetched,
            profilesEvaluated: profilesReviewed,
            top3AllExcellent: currentResults.slice(0, 3).every(r => r.fit_category === 'excellent'),
            qualityBreakdown,
          }],
          checklist: { filter_values: checklist.filter_values || [], matched_taxonomy_entries: checklist.matched_taxonomy_entries || [] },
          checklist_boost_applied: hasChecklistBoost,
        },
      };
    }

    while (iteration < maxIterations && profilesReviewed < maxProfilesReviewed) {
      iteration++;
      console.log(`[V7] Iteration ${iteration}: Fetching additional profiles`);
      const newProfiles = fetchAdditionalProfiles(
        filteredPractitionersList, filters, evaluatedIds, batchSize, fetchStrategy, profilesFetched
      );
      if (newProfiles.length === 0) {
        terminationReason = 'no-more-profiles';
        break;
      }
      allEvaluatedProfiles = mergeAndDeduplicate(allEvaluatedProfiles, newProfiles);
      newProfiles.forEach(p => {
        const id = getPractitionerId(p);
        if (id) {
          evaluatedIds.add(id);
          if (!iterationFoundMap.has(id)) {
            iterationFoundMap.set(id, iteration);
          }
        }
      });
      profilesFetched += newProfiles.length;

      const remainingCap = maxProfilesReviewed - profilesReviewed;
      const profilesToEvaluate = remainingCap > 0 ? newProfiles.slice(0, remainingCap) : [];
      if (profilesToEvaluate.length > 0) {
        const nextEvalOptions = { model, maxPractitioners: profilesToEvaluate.length };
        if (includeChecklistInLLM && (checklist.filter_values || []).length > 0) {
          nextEvalOptions.checklistContext = { filter_values: checklist.filter_values, reasoning: checklist.reasoning };
        }
        try {
          const evaluation = await evaluateFit(userQuery, profilesToEvaluate, nextEvalOptions);
          const newEvaluationMap = mapEvaluationToPractitioners(profilesToEvaluate, evaluation, iteration);
          newEvaluationMap.forEach((evalData, id) => evaluationMap.set(id, evalData));
          profilesReviewed += profilesToEvaluate.length;
        } catch (error) {
          console.error(`[V7] LLM evaluation failed at iteration ${iteration}:`, error.message);
          profilesToEvaluate.forEach(p => {
            const id = getPractitionerId(p);
            if (id && !evaluationMap.has(id)) {
              evaluationMap.set(id, { fit_category: 'good', brief_reason: 'Evaluation failed', iteration_found: iteration });
            }
          });
        }
      }

      currentResults = rerankByQuality(allEvaluatedProfiles, evaluationMap, scoreMap, iterationFoundMap, shortlistSize);
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

      const termination = checkTerminationCondition(
        currentResults, targetTopK, iteration, maxIterations, profilesReviewed, maxProfilesReviewed
      );
      if (termination.shouldTerminate) {
        terminationReason = termination.reason;
        break;
      }
    }

    if (!terminationReason || terminationReason === 'unknown') {
      terminationReason = iteration >= maxIterations ? 'max-iterations' : profilesReviewed >= maxProfilesReviewed ? 'max-profiles-reviewed' : 'no-more-profiles';
    }
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
        checklist: { filter_values: checklist.filter_values || [], matched_taxonomy_entries: checklist.matched_taxonomy_entries || [] },
        checklist_boost_applied: hasChecklistBoost,
      },
    };
  } catch (error) {
    console.error('[V7] Progressive ranking failed:', error);
    throw error;
  }
}

module.exports = {
  rankPractitionersProgressiveV7,
};
