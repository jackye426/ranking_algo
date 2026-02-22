/**
 * V7 Checklist Matcher
 *
 * Matches checklist filter_values against practitioner checklist_profile (procedures_set, conditions_set)
 * and computes a boost multiplier for rescoring.
 */

/**
 * Get checklist_profile from practitioner (may be on practitioner or practitioner.checklist_profile)
 * @param {Object} practitioner - Practitioner object (may include checklist_profile)
 * @returns {Object|null} checklist_profile or null
 */
function getChecklistProfile(practitioner) {
  if (!practitioner) return null;
  return practitioner.checklist_profile || null;
}

/**
 * Match a single filter_value against a concatenated set string (e.g. procedures_set).
 * procedures_set / conditions_set are typically space-separated or delimited strings of procedure/condition names.
 *
 * @param {string} filterValue - One checklist filter_value
 * @param {string} setString - practitioner checklist_profile.procedures_set or conditions_set
 * @returns {'exact'|'partial'|null} Match type or null
 */
function matchFilterValue(filterValue, setString) {
  if (!filterValue || typeof filterValue !== 'string') return null;
  const fv = filterValue.trim();
  if (!fv) return null;
  const set = (setString || '').trim();
  if (!set) return null;

  const fvLower = fv.toLowerCase();
  const setLower = set.toLowerCase();

  if (setLower.includes(fvLower)) {
    const asWord = ` ${setLower} `;
    const fvAsWord = ` ${fvLower} `;
    if (asWord.includes(fvAsWord) || setLower === fvLower) return 'exact';
    return 'partial';
  }
  if (fvLower.includes(setLower)) return 'partial';
  return null;
}

/**
 * Calculate checklist match score for one practitioner.
 * Exact match: +1.0 per match, partial: +0.5 per match. Score is normalized by total checklist size.
 *
 * @param {Object} practitioner - Practitioner with optional checklist_profile
 * @param {Object} checklist - { filter_values: string[] }
 * @param {Object} options - Options
 * @param {number} options.exactWeight - Score for exact match (default 1.0)
 * @param {number} options.partialWeight - Score for partial match (default 0.5)
 * @returns {{ score: number, exactMatches: number, partialMatches: number, matchRatio: number }}
 */
function calculateChecklistScore(practitioner, checklist, options = {}) {
  const { exactWeight = 1.0, partialWeight = 0.5 } = options;
  const profile = getChecklistProfile(practitioner);
  const filterValues = Array.isArray(checklist.filter_values) ? checklist.filter_values : [];

  if (!profile || filterValues.length === 0) {
    return { score: 0, exactMatches: 0, partialMatches: 0, matchRatio: 0 };
  }

  const proceduresSet = (profile.procedures_set || '').trim();
  const conditionsSet = (profile.conditions_set || '').trim();
  const specialtiesSet = (profile.specialties || profile.specialty_primary || '').trim();
  const combinedSet = [proceduresSet, conditionsSet, specialtiesSet].filter(Boolean).join(' ');

  let exactMatches = 0;
  let partialMatches = 0;

  for (const fv of filterValues) {
    const inProcedures = matchFilterValue(fv, proceduresSet);
    const inConditions = matchFilterValue(fv, conditionsSet);
    const inSpecialties = matchFilterValue(fv, specialtiesSet);
    const inCombined = matchFilterValue(fv, combinedSet);

    const match = inProcedures || inConditions || inSpecialties || inCombined;
    if (match === 'exact') exactMatches += 1;
    else if (match === 'partial') partialMatches += 1;
  }

  const rawScore = exactMatches * exactWeight + partialMatches * partialWeight;
  const maxPossible = filterValues.length * exactWeight;
  const matchRatio = maxPossible > 0 ? rawScore / maxPossible : 0;
  const score = rawScore;

  return {
    score,
    exactMatches,
    partialMatches,
    matchRatio,
  };
}

/**
 * Calculate boost multiplier for rescoring (e.g. 1.0 to 1.5).
 * If match ratio is below threshold, return 1.0 (no boost).
 *
 * @param {Object} practitioner - Practitioner with optional checklist_profile
 * @param {Object} checklist - { filter_values: string[] }
 * @param {Object} options - Options
 * @param {number} options.checklistBoostWeight - Max multiplier when fully matched (default 1.2)
 * @param {number} options.checklistMatchThreshold - Min match ratio to apply any boost (default 0.3)
 * @param {number} options.exactWeight - Score for exact match (default 1.0)
 * @param {number} options.partialWeight - Score for partial match (default 0.5)
 * @returns {number} Boost multiplier (1.0 to checklistBoostWeight)
 */
function calculateChecklistBoost(practitioner, checklist, options = {}) {
  const {
    checklistBoostWeight = 1.2,
    checklistMatchThreshold = 0.3,
    exactWeight = 1.0,
    partialWeight = 0.5,
  } = options;

  const { matchRatio } = calculateChecklistScore(practitioner, checklist, {
    exactWeight,
    partialWeight,
  });

  if (matchRatio < checklistMatchThreshold) return 1.0;

  const boost = 1.0 + (checklistBoostWeight - 1.0) * matchRatio;
  return Math.min(boost, checklistBoostWeight);
}

module.exports = {
  calculateChecklistBoost,
  calculateChecklistScore,
  getChecklistProfile,
  matchFilterValue,
};
