/**
 * Local BM25 Service - Adapted from production for in-memory use
 * No database dependencies - works with practitioner arrays
 *
 * Filter conditions (not weights): filters.patient_age_group, filters.languages, filters.gender
 * narrow the practitioner list before BM25. Omitted or empty = no filter on that dimension.
 */

/**
 * Parse clinical_expertise string into procedures, conditions, clinical_interests.
 * Format: "Procedure: X; Procedure: Y; Condition: Z; Clinical Interests: W"
 * @returns {{ procedures: string, conditions: string, clinical_interests: string }}
 */
function parseClinicalExpertise(practitioner) {
  const raw = practitioner.clinical_expertise || '';
  const procedures = [];
  const conditions = [];
  let clinical_interests = '';
  const segments = raw.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (seg.startsWith('Procedure:')) {
      procedures.push(seg.replace(/^Procedure:\s*/i, '').trim());
    } else if (seg.startsWith('Condition:')) {
      conditions.push(seg.replace(/^Condition:\s*/i, '').trim());
    } else if (seg.startsWith('Clinical Interests:')) {
      clinical_interests = seg.replace(/^Clinical Interests:\s*/i, '').trim();
    }
  }
  return {
    procedures: procedures.join(' '),
    conditions: conditions.join(' '),
    clinical_interests: clinical_interests || '',
  };
}

/**
 * Extract procedures from practitioner profile
 */
function extractProcedures(practitioner) {
  const procedures = [];
  // From procedure_groups
  if (Array.isArray(practitioner.procedure_groups)) {
    practitioner.procedure_groups.forEach(pg => {
      const name = typeof pg === 'object' ? (pg.procedure_group_name || '') : String(pg);
      if (name.trim()) procedures.push(name.trim());
    });
  }
  // From clinical_expertise
  const parsed = parseClinicalExpertise(practitioner);
  if (parsed.procedures) {
    const procList = parsed.procedures.split(/\s+/).filter(p => p.length > 2);
    procedures.push(...procList);
  }
  return [...new Set(procedures.map(p => p.toLowerCase()))];
}

/**
 * Extract conditions from practitioner profile
 */
function extractConditions(practitioner) {
  const conditions = [];
  const parsed = parseClinicalExpertise(practitioner);
  if (parsed.conditions) {
    const condList = parsed.conditions.split(/\s+/).filter(c => c.length > 2);
    conditions.push(...condList);
  }
  return [...new Set(conditions.map(c => c.toLowerCase()))];
}

/**
 * Fuzzy match two strings (simple substring/contains check)
 */
function fuzzyMatch(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  return s1 === s2 || s1.includes(s2) || s2.includes(s1);
}

/**
 * Match actual practitioner profile against ideal profile (V5)
 * @param {Object} actualProfile - Practitioner document
 * @param {Object} idealProfile - Ideal profile from V5
 * @returns {number} Match score
 */
function matchProfileAgainstIdeal(actualProfile, idealProfile) {
  if (!idealProfile || !actualProfile) return 0;
  
  let score = 0;
  
  // 1. Subspecialty matching (weighted by importance)
  const actualSubs = (actualProfile.subspecialties || []).map(s => s.toLowerCase());
  if (idealProfile.subspecialties && Array.isArray(idealProfile.subspecialties)) {
    for (const idealSub of idealProfile.subspecialties) {
      if (!idealSub || !idealSub.name) continue;
      const match = actualSubs.some(sub => fuzzyMatch(sub, idealSub.name));
      if (match) {
        if (idealSub.importance === 'required') score += 5.0;
        else if (idealSub.importance === 'preferred') score += 3.0;
        else score += 1.0;
      } else if (idealSub.importance === 'required') {
        score -= 2.0; // Penalty for missing required
      }
    }
  }
  
  // 2. Procedure matching (weighted by importance)
  const actualProcedures = extractProcedures(actualProfile);
  if (idealProfile.procedures && Array.isArray(idealProfile.procedures)) {
    for (const idealProc of idealProfile.procedures) {
      if (!idealProc || !idealProc.name) continue;
      const match = actualProcedures.some(proc => fuzzyMatch(proc, idealProc.name));
      if (match) {
        if (idealProc.importance === 'required') score += 4.0;
        else if (idealProc.importance === 'preferred') score += 2.0;
        else score += 0.5;
      }
    }
  }
  
  // 3. Condition matching
  const actualConditions = extractConditions(actualProfile);
  if (idealProfile.conditions && Array.isArray(idealProfile.conditions)) {
    for (const idealCond of idealProfile.conditions) {
      if (!idealCond || !idealCond.name) continue;
      const match = actualConditions.some(cond => fuzzyMatch(cond, idealCond.name));
      if (match) {
        score += idealCond.importance === 'required' ? 3.0 : 1.5;
      }
    }
  }
  
  // 4. Clinical expertise area matching (semantic)
  const actualExpertise = (actualProfile.clinical_expertise || '').toLowerCase();
  if (idealProfile.clinical_expertise_areas && Array.isArray(idealProfile.clinical_expertise_areas)) {
    for (const area of idealProfile.clinical_expertise_areas) {
      if (actualExpertise.includes(area.toLowerCase())) {
        score += 2.0;
      }
    }
  }
  
  // 5. Description keyword matching
  const description = ((actualProfile.description || '') + ' ' + (actualProfile.about || '')).toLowerCase();
  if (idealProfile.description_keywords && Array.isArray(idealProfile.description_keywords)) {
    for (const keyword of idealProfile.description_keywords) {
      if (description.includes(keyword.toLowerCase())) {
        score += 1.0;
      }
    }
  }
  
  // 6. Negative matching (avoid elements)
  if (idealProfile.avoid_subspecialties && Array.isArray(idealProfile.avoid_subspecialties)) {
    for (const avoidSub of idealProfile.avoid_subspecialties) {
      if (actualSubs.some(s => fuzzyMatch(s, avoidSub))) {
        score -= 3.0;
      }
    }
  }
  
  if (idealProfile.avoid_procedures && Array.isArray(idealProfile.avoid_procedures)) {
    for (const avoidProc of idealProfile.avoid_procedures) {
      if (actualProcedures.some(p => fuzzyMatch(p, avoidProc))) {
        score -= 2.0;
      }
    }
  }
  
  // 7. Optional preferences (qualifications, age group, languages, gender)
  if (idealProfile.preferred_qualifications && Array.isArray(idealProfile.preferred_qualifications) && idealProfile.preferred_qualifications.length > 0) {
    const actualQuals = (actualProfile.qualifications || []).map(q => String(q).toUpperCase());
    const hasQual = idealProfile.preferred_qualifications.some(q => 
      actualQuals.includes(String(q).toUpperCase())
    );
    if (hasQual) score += 1.0;
  }
  
  if (idealProfile.patient_age_group && Array.isArray(idealProfile.patient_age_group) && idealProfile.patient_age_group.length > 0) {
    const actualAgeGroups = (actualProfile.patient_age_group || []).map(a => String(a));
    const matchesAge = idealProfile.patient_age_group.some(age =>
      actualAgeGroups.includes(String(age))
    );
    if (matchesAge) score += 1.5;
  }
  
  if (idealProfile.languages && Array.isArray(idealProfile.languages) && idealProfile.languages.length > 0) {
    const actualLangs = (actualProfile.languages || []).map(l => String(l).toLowerCase());
    const matchesLang = idealProfile.languages.some(lang =>
      actualLangs.includes(String(lang).toLowerCase())
    );
    if (matchesLang) score += 1.0;
  }
  
  if (idealProfile.gender_preference && actualProfile.gender) {
    if (String(idealProfile.gender_preference).toLowerCase() === String(actualProfile.gender).toLowerCase()) {
      score += 1.0;
    }
  }
  
  return Math.max(0, score); // Don't go negative
}

/**
 * Apply filter conditions (patient_age_group, languages, gender). These are filters, not weights.
 * @param {Object[]} practitioners
 * @param {Object} filters - may have patient_age_group (string), languages (string[]), gender (string)
 * @returns {Object[]} filtered list
 */
function applyFilterConditions(practitioners, filters) {
  if (!filters || !Array.isArray(practitioners) || practitioners.length === 0) return practitioners;
  const wantAge = filters.patient_age_group && String(filters.patient_age_group).trim();
  const wantLangs = Array.isArray(filters.languages) ? filters.languages.filter((l) => l && String(l).trim()) : [];
  const wantGender = filters.gender && String(filters.gender).trim();
  if (!wantAge && wantLangs.length === 0 && !wantGender) return practitioners;

  return practitioners.filter((p) => {
    if (wantAge) {
      const ageGroups = Array.isArray(p.patient_age_group) ? p.patient_age_group.map((a) => String(a).toLowerCase()) : [];
      const wantLower = wantAge.toLowerCase();
      let matchAge = ageGroups.some((a) => a === wantLower || a.includes(wantLower) || wantLower.includes(a));
      if (!matchAge && (wantLower.includes('paediatric') || wantLower.includes('child') || wantLower.includes('pediatric'))) {
        matchAge = ageGroups.some((a) => a.includes('child') || a.includes('paediatric') || a.includes('pediatric'));
      }
      if (!matchAge) return false;
    }
    if (wantLangs.length > 0) {
      const langs = Array.isArray(p.languages) ? p.languages.map((l) => String(l).toLowerCase()) : [];
      const hasOne = wantLangs.some((w) => langs.some((l) => l === w.toLowerCase() || l.includes(w) || w.includes(l)));
      if (!hasOne) return false;
    }
    if (wantGender) {
      const g = (p.gender && String(p.gender).trim().toLowerCase()) || '';
      if (g !== wantGender.toLowerCase()) return false;
    }
    return true;
  });
}

// Field weights (specialty_description removed; clinical_expertise split into expertise_procedures, expertise_conditions, expertise_interests)
const FIELD_WEIGHTS = {
  expertise_procedures: 2.0,
  expertise_conditions: 2.0,
  expertise_interests: 1.5,
  clinical_expertise: 2.0, // Raw clinical_expertise field (for unstructured data)
  procedure_groups: 2.8,
  specialty: 2.5,
  subspecialties: 2.2,
  description: 1.5,
  about: 1.0,
  name: 1.0,
  memberships: 0.8,
  address_locality: 0.5,
  title: 0.3
};

/** Default ranking config for rescoring and BM25 (tunable via filters.rankingConfig or ranking-weights.json) */
const DEFAULT_RANKING_CONFIG = {
  high_signal_1: 2.0,
  high_signal_2: 4.0,
  pathway_1: 1.0,
  pathway_2: 2.0,
  pathway_3: 3.0,
  procedure_per_match: 0.5,
  anchor_per_match: 0.2,
  anchor_cap: 0.6,
  subspecialty_factor: 0.3,
  subspecialty_cap: 0.5,
  negative_1: -1.0,
  negative_2: -2.0,
  negative_4: -3.0,
  negative_mult_1: 0.95,
  negative_mult_2: 0.85,
  negative_mult_4: 0.70,
  k1: 1.5,
  b: 0.75,
  intent_terms_in_bm25: false,
  intent_terms_in_bm25_max: 12,
  // Stage A: how many BM25 candidates to pass to rescoring (higher = more recall, more rescoring cost)
  stage_a_top_n: 100,
  // Stage A two-query: union of patient-query top N + intent-only-query top M, then rescore
  stage_a_two_query: false,
  stage_a_patient_top_n: 50,
  stage_a_intent_top_n: 30,
  stage_a_union_max: 100,
  stage_a_intent_terms_cap: 10,
  // Stage A: apply negative_terms penalty before taking top N (down-rank "wrong lane" docs in retrieval)
  stage_a_negative_penalty: false,
  // V2-only: stronger anchor boost (merged general + clinical) and safe_lane rescoring
  anchor_per_match_v2: 0.25,
  anchor_cap_v2: 0.75,
  safe_lane_1: 1.0,
  safe_lane_2: 2.0,
  safe_lane_3_or_more: 3.0
};

function getRankingConfig(filters) {
  const custom = (filters && filters.rankingConfig) || {};
  const rc = { ...DEFAULT_RANKING_CONFIG, ...custom };
  // When parallel-v2, use v2 anchor weights for rescoring (merged anchors are higher quality)
  if (filters && (filters.variantName === 'parallel-v2')) {
    rc.anchor_per_match = rc.anchor_per_match_v2 ?? rc.anchor_per_match;
    rc.anchor_cap = rc.anchor_cap_v2 ?? rc.anchor_cap;
  }
  return rc;
}

/**
 * Normalize medical query with equivalence-only aliasing (abbrev↔full, spelling variants)
 * Returns object with normalized query and metadata for logging
 */
const normalizeMedicalQuery = (query) => {
  if (!query || !query.trim()) {
    return {
      normalizedQuery: query,
      aliasesApplied: [],
      skipped: false
    };
  }
  
  const lowerQuery = query.toLowerCase();
  const aliasesApplied = [];
  
  // High-intent procedure keywords (gate allows abbrev↔full only, prevents non-equivalence concepts)
  const highIntentKeywords = [
    'ablation', 'tavi', 'pci', 'angiography', 'stent', 
    'icd', 'pacemaker', 'angioplasty'
  ];
  
  const hasHighIntentKeyword = highIntentKeywords.some(keyword => 
    lowerQuery.includes(keyword)
  );
  
  // Equivalence mappings (abbrev ↔ full form, spelling variants)
  // Bidirectional: both directions supported
  const equivalenceMap = {
    // Cardiac abbreviations
    'svt': ['supraventricular tachycardia'],
    'af': ['atrial fibrillation'],
    'afib': ['atrial fibrillation'],
    'ctca': ['ct coronary angiography'],
    'pci': ['percutaneous coronary intervention'],
    'tavi': ['transcatheter aortic valve implantation'],
    'icd': ['implantable cardioverter defibrillator'],
    
    // Spelling variants (bidirectional)
    'ischaemic': ['ischemic'],
    'ischemic': ['ischaemic'],
    'oesophageal': ['esophageal'],
    'esophageal': ['oesophageal'],
    'anaesthesia': ['anesthesia'],
    'anesthesia': ['anaesthesia'],
    
    // Context-dependent (low priority) - only expand with cardiac context
    'echo': {
      aliases: ['echocardiogram', 'echocardiography'],
      requiresContext: ['cardiac', 'heart', 'cardiology', 'cardiologist'],
      priority: 'low'
    }
  };
  
  // Normalize query for matching (handle punctuation, hyphens, case)
  const normalizeForMatching = (text) => {
    return text.toLowerCase()
      .replace(/[^\w\s-]/g, ' ') // Remove punctuation except hyphens
      .replace(/-/g, ' ') // Replace hyphens with spaces
      .trim();
  };
  
  const normalizedQueryForMatching = normalizeForMatching(query);
  const queryWords = normalizedQueryForMatching.split(/\s+/).filter(w => w.length > 0);
  
  // Check for cardiac context (for ambiguous aliases like "echo")
  const hasCardiacContext = queryWords.some(word => 
    ['cardiac', 'heart', 'cardiology', 'cardiologist', 'cardio'].includes(word)
  );
  
  // Match equivalence terms (case-insensitive, word boundary aware)
  const matchedAliases = [];
  
  for (const [term, aliasConfig] of Object.entries(equivalenceMap)) {
    // Handle context-dependent aliases
    if (typeof aliasConfig === 'object' && aliasConfig.aliases) {
      // Check if context is required
      if (aliasConfig.requiresContext && !hasCardiacContext) {
        continue; // Skip if context required but not present
      }
      
      // Check if term matches (word boundary)
      const termRegex = new RegExp(`\\b${term}\\b`, 'i');
      if (termRegex.test(normalizedQueryForMatching)) {
        matchedAliases.push({
          term,
          aliases: aliasConfig.aliases,
          priority: aliasConfig.priority || 'normal'
        });
      }
    } else {
      // Simple alias (array of strings)
      const aliases = Array.isArray(aliasConfig) ? aliasConfig : [aliasConfig];
      const termRegex = new RegExp(`\\b${term}\\b`, 'i');
      
      if (termRegex.test(normalizedQueryForMatching)) {
        matchedAliases.push({
          term,
          aliases,
          priority: 'normal'
        });
      }
    }
  }
  
  // Apply alias cap: max 1-2 aliases (prioritize most specific, then normal priority)
  // Sort by priority (normal first, then low), then by term length (longer = more specific)
  matchedAliases.sort((a, b) => {
    if (a.priority === 'low' && b.priority !== 'low') return 1;
    if (a.priority !== 'low' && b.priority === 'low') return -1;
    return b.term.length - a.term.length; // Longer terms first (more specific)
  });
  
  // Apply max 1-2 aliases
  const aliasesToApply = matchedAliases.slice(0, 2);
  
  // Collect all alias strings (treat multi-word as single alias)
  for (const match of aliasesToApply) {
    // Use first alias if multiple provided (or join if needed)
    const aliasToAdd = Array.isArray(match.aliases) ? match.aliases[0] : match.aliases;
    aliasesApplied.push(aliasToAdd);
  }
  
  // Build normalized query
  let normalizedQuery = query;
  if (aliasesApplied.length > 0) {
    normalizedQuery = `${query} ${aliasesApplied.join(' ')}`;
  }
  
  return {
    normalizedQuery,
    aliasesApplied,
    skipped: false
  };
};

/**
 * Legacy function name for backward compatibility
 * @deprecated Use normalizeMedicalQuery instead
 */
const expandMedicalQuery = (query) => {
  const result = normalizeMedicalQuery(query);
  return result.normalizedQuery;
};

/**
 * Tokenize text
 */
const tokenize = (text) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2);
};

/**
 * Create weighted searchable text.
 * clinical_expertise is split into expertise_procedures, expertise_conditions, expertise_interests.
 * specialty_description is no longer used (removed).
 * @param {Object} practitioner - Practitioner document
 * @param {Object} [fieldWeights] - Optional weights per field (same keys as FIELD_WEIGHTS). If omitted, uses FIELD_WEIGHTS. Repetition = Math.max(1, Math.round(weight)).
 */
const createWeightedSearchableText = (practitioner, fieldWeights) => {
  const w = fieldWeights && typeof fieldWeights === 'object' ? { ...FIELD_WEIGHTS, ...fieldWeights } : FIELD_WEIGHTS;
  const repeat = (key) => Math.max(1, Math.round(w[key] ?? 1));

  const weightedParts = [];

  const parsed = parseClinicalExpertise(practitioner);
  if (parsed.procedures) {
    for (let i = 0; i < repeat('expertise_procedures'); i++) weightedParts.push(parsed.procedures);
  }
  if (parsed.conditions) {
    for (let i = 0; i < repeat('expertise_conditions'); i++) weightedParts.push(parsed.conditions);
  }
  if (parsed.clinical_interests) {
    for (let i = 0; i < repeat('expertise_interests'); i++) weightedParts.push(parsed.clinical_interests);
  }
  
  // If parsing didn't extract structured data, include raw clinical_expertise for BM25 search
  // This handles cases where clinical_expertise is a plain comma-separated list or free text
  // (e.g., BDA dietitians with format "Diabetes, Diverticulosis, ..." instead of "Procedure: X; Condition: Y")
  const rawClinicalExpertise = practitioner.clinical_expertise || '';
  if (rawClinicalExpertise && !parsed.procedures && !parsed.conditions && !parsed.clinical_interests) {
    // No structured data extracted, use raw field so BM25 can still search it
    for (let i = 0; i < repeat('clinical_expertise'); i++) weightedParts.push(rawClinicalExpertise);
  }

  const procedures = (practitioner.procedure_groups || [])
    .map(pg => pg.procedure_group_name)
    .join(' ');
  if (procedures) {
    for (let i = 0; i < repeat('procedure_groups'); i++) weightedParts.push(procedures);
  }

  const specialty = practitioner.specialty || '';
  if (specialty) {
    for (let i = 0; i < repeat('specialty'); i++) weightedParts.push(specialty);
  }

  const subspecialties = Array.isArray(practitioner.subspecialties)
    ? practitioner.subspecialties.join(' ')
    : (practitioner.subspecialties || '');
  if (subspecialties) {
    for (let i = 0; i < repeat('subspecialties'); i++) weightedParts.push(subspecialties);
  }

  const description = practitioner.description || '';
  if (description) {
    for (let i = 0; i < repeat('description'); i++) weightedParts.push(description);
  }

  if (practitioner.about && repeat('about') >= 1) weightedParts.push(practitioner.about);
  if (practitioner.name && repeat('name') >= 1) weightedParts.push(practitioner.name);
  if (practitioner.address_locality && repeat('address_locality') >= 1) weightedParts.push(practitioner.address_locality);
  const memberships = (practitioner.memberships || []).join(' ');
  if (memberships && repeat('memberships') >= 1) weightedParts.push(memberships);
  if (practitioner.title && repeat('title') >= 1) weightedParts.push(practitioner.title);

  return weightedParts.filter(Boolean).join(' ');
};

/**
 * Calculate quality boost
 */
const calculateQualityBoost = (practitioner) => {
  let boost = 1.0;
  
  if (practitioner.rating_value >= 4.8) boost *= 1.3;
  else if (practitioner.rating_value >= 4.5) boost *= 1.2;
  else if (practitioner.rating_value >= 4.0) boost *= 1.1;
  
  if (practitioner.review_count >= 100) boost *= 1.2;
  else if (practitioner.review_count >= 50) boost *= 1.15;
  else if (practitioner.review_count >= 20) boost *= 1.1;
  
  // Years of experience boost (matching production)
  if (practitioner.years_experience >= 20) boost *= 1.15;
  else if (practitioner.years_experience >= 10) boost *= 1.1;
  
  if (practitioner.verified) boost *= 1.1;
  
  return boost;
};

/**
 * Calculate exact match bonus
 */
const calculateExactMatchBonus = (query, text) => {
  const lowerQuery = query.toLowerCase().trim();
  const lowerText = text.toLowerCase();
  
  if (!lowerQuery || !lowerText) return 0;
  
  let bonus = 0;
  
  if (lowerText.includes(lowerQuery)) {
    bonus += 2.0;
  }
  
  // Multi-word phrases
  const words = lowerQuery.split(/\s+/).filter(w => w.length > 2);
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (lowerText.includes(phrase)) {
      bonus += 1.0;
    }
  }
  
  return bonus;
};

/**
 * Calculate negative term penalty
 * Applies soft score penalty if profile contains many negative terms
 */
const calculateNegativeTermPenalty = (practitioner, negativeTerms, searchableText) => {
  if (!negativeTerms || negativeTerms.length === 0) {
    return 1.0; // No penalty
  }
  
  const lowerText = searchableText.toLowerCase();
  const negativeMatches = negativeTerms.filter(term => 
    lowerText.includes(term.toLowerCase())
  ).length;
  
  // Apply penalty if 2+ negative terms found (indicates wrong subspecialty)
  if (negativeMatches >= 2) {
    // Soft penalty: 0.85 multiplier (15% reduction)
    return 0.85;
  } else if (negativeMatches === 1) {
    // Light penalty: 0.95 multiplier (5% reduction)
    return 0.95;
  }
  
  return 1.0; // No penalty
};

/**
 * Rescore BM25 results with intent terms (post-retrieval)
 * Applies boosts for intent term matches and penalties for negative terms
 * Also applies additive boost for anchor phrase matches
 *
 * @param {string[]|null} safe_lane_terms - V2: high-confidence symptom/condition terms (optional; used for parallel-v2)
 * @param {boolean} useRescoringScoreAsPrimary - If true, calculate separate rescoring score and rank by it (BM25 as fallback)
 * @param {object} rankingConfig - Optional config (defaults to DEFAULT_RANKING_CONFIG)
 */
const rescoreWithIntentTerms = (bm25Results, intent_terms, negative_terms, anchor_phrases = null, likely_subspecialties = null, safe_lane_terms = null, useRescoringScoreAsPrimary = false, rankingConfig = null, idealProfile = null) => {
  const rc = rankingConfig || DEFAULT_RANKING_CONFIG;
  
  // V5: Use ideal profile matching if available
  if (idealProfile) {
    console.log('[V5 Rescoring] Ideal profile found, matching against', bm25Results.length, 'results');
    const scored = bm25Results.map((result, idx) => {
      const doc = result.document;
      const bm25Score = result.score;
      
      // Match profile against ideal
      const profileMatchScore = matchProfileAgainstIdeal(doc, idealProfile);
      
      if (idx < 3) {
        console.log(`[V5 Rescoring] Doc ${idx + 1} "${doc.name}": BM25=${bm25Score.toFixed(2)}, ProfileMatch=${profileMatchScore.toFixed(2)}`);
      }
      
      let newScore;
      let rescoringScore = null;
      
      // V5: Always use additive scoring (BM25 + profile match)
      // Profile match boosts good matches but doesn't replace BM25
      rescoringScore = profileMatchScore;
      newScore = bm25Score + profileMatchScore;
      
      // If both are 0, something went wrong - log warning
      if (bm25Score === 0 && profileMatchScore === 0 && idx < 3) {
        console.warn(`[V5 Rescoring] Both BM25 and profile match are 0 for "${doc.name}"`);
      }
      
      return {
        ...result,
        score: Math.max(0, newScore),
        bm25Score,
        rescoringScore,
        rescoringInfo: {
          profileMatchScore,
          idealProfileUsed: true,
          highSignalMatches: 0,
          pathwayMatches: 0,
          procedureMatches: 0,
          negativeMatches: 0,
          anchorMatches: 0
        }
      };
    }).sort((a, b) => {
      // V5: Sort by total score (BM25 + profile match)
      // Profile match is the primary differentiator, but BM25 provides baseline
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Tiebreaker: prefer higher profile match, then higher BM25
      if (b.rescoringScore !== a.rescoringScore) {
        return b.rescoringScore - a.rescoringScore;
      }
      return b.bm25Score - a.bm25Score;
    });
    
    console.log('[V5 Rescoring] Top 3 after rescoring:', scored.slice(0, 3).map((r, i) => ({
      rank: i + 1,
      name: r.document.name,
      score: r.score.toFixed(2),
      bm25Score: r.bm25Score.toFixed(2),
      rescoringScore: r.rescoringScore?.toFixed(2),
      profileMatchScore: r.rescoringInfo?.profileMatchScore?.toFixed(2)
    })));
    
    return scored;
  }
  
  // Original V1-V4 logic (term-based matching)
  if (!intent_terms || intent_terms.length === 0) {
    // Still apply negative term penalties even if no intent terms
    if (negative_terms && negative_terms.length > 0) {
      return bm25Results.map(result => {
        const searchableText = createWeightedSearchableText(result.document).toLowerCase();
        const negativeMatches = negative_terms.filter(term => 
          searchableText.includes(term.toLowerCase())
        ).length;
        
        let newScore = result.score;
        if (negativeMatches >= 4) newScore *= rc.negative_mult_4;
        else if (negativeMatches >= 2) newScore *= rc.negative_mult_2;
        else if (negativeMatches === 1) newScore *= rc.negative_mult_1;
        
        return {
          ...result,
          score: Math.max(0, newScore),
          rescoringInfo: {
            highSignalMatches: 0,
            pathwayMatches: 0,
            procedureMatches: 0,
            negativeMatches,
            anchorMatches: 0
          }
        };
      }).sort((a, b) => b.score - a.score);
    }
    return bm25Results; // No rescoring if no intent terms and no negative terms
  }
  
  // Define high-signal pathway terms (boost these more)
  const highSignalTerms = new Set([
    'chest pain', 'angina', 'coronary artery disease', 'ischaemic heart disease',
    'ct coronary angiography', 'stress echo', 'chest pain clinic'
  ]);
  
  // Define procedure-heavy terms (small boost only, not query terms)
  const procedureTerms = new Set([
    'interventional cardiology', 'coronary angiography', 'pci', 'stent',
    'percutaneous coronary intervention'
  ]);
  
  return bm25Results.map(result => {
    const doc = result.document;
    const searchableText = createWeightedSearchableText(doc).toLowerCase();
    const bm25Score = result.score; // Store original BM25 score
    
    // Count intent term matches
    let highSignalMatches = 0;
    let pathwayMatches = 0;
    let procedureMatches = 0;
    
    intent_terms.forEach(term => {
      const termLower = term.toLowerCase();
      if (searchableText.includes(termLower)) {
        if (highSignalTerms.has(termLower)) {
          highSignalMatches++;
        } else if (procedureTerms.has(termLower)) {
          procedureMatches++;
        } else {
          pathwayMatches++;
        }
      }
    });
    
    let newScore;
    let rescoringScore = null;
    let anchorMatches = 0;
    let subspecialtyMatches = 0;
    let subspecialtyBoost = 0;
    let safeLaneMatches = 0;
    let negativeMatches = 0;
    
    if (useRescoringScoreAsPrimary) {
      // Calculate separate rescoring score (not multiplied with BM25)
      rescoringScore = 0;
      
      // High signal matches: configurable per match and cap for 2+
      if (highSignalMatches >= 2) rescoringScore += rc.high_signal_2;
      else if (highSignalMatches === 1) rescoringScore += rc.high_signal_1;
      
      // Pathway matches: configurable tiered
      if (pathwayMatches >= 3) rescoringScore += rc.pathway_3;
      else if (pathwayMatches >= 2) rescoringScore += rc.pathway_2;
      else if (pathwayMatches === 1) rescoringScore += rc.pathway_1;
      
      // Procedure matches: configurable per match
      rescoringScore += procedureMatches * rc.procedure_per_match;
      
      // Anchor phrase matches: configurable per match and cap (v2 uses stronger anchor_per_match/anchor_cap)
      if (anchor_phrases && anchor_phrases.length > 0) {
        anchor_phrases.forEach(phrase => {
          const phraseLower = phrase.toLowerCase();
          if (searchableText.includes(phraseLower)) {
            anchorMatches++;
          }
        });
        if (anchorMatches > 0) {
          const anchorBoost = Math.min(anchorMatches * rc.anchor_per_match, rc.anchor_cap);
          rescoringScore += anchorBoost;
          console.log(`[Rescoring Score] Doc "${doc.name}": ${anchorMatches} anchor matches, +${anchorBoost.toFixed(2)}`);
        }
      }
      
      // V2: Safe-lane term matches (high-confidence symptom/condition terms from session context)
      if (safe_lane_terms && safe_lane_terms.length > 0) {
        safe_lane_terms.forEach(term => {
          const termLower = (term && typeof term === 'string' ? term : '').toLowerCase();
          if (termLower && searchableText.includes(termLower)) safeLaneMatches++;
        });
        if (safeLaneMatches > 0) {
          const safeLaneBoost = safeLaneMatches >= 3 ? (rc.safe_lane_3_or_more ?? 3.0) : safeLaneMatches === 2 ? (rc.safe_lane_2 ?? 2.0) : (rc.safe_lane_1 ?? 1.0);
          rescoringScore += safeLaneBoost;
          console.log(`[Rescoring Score V2] Doc "${doc.name}": ${safeLaneMatches} safe_lane matches, +${safeLaneBoost.toFixed(2)}`);
        }
      }
      
      // Subspecialty boost: confidence-weighted, capped at 0.5
      if (likely_subspecialties && Array.isArray(likely_subspecialties) && likely_subspecialties.length > 0) {
        const docSubspecialties = Array.isArray(doc.subspecialties) 
          ? doc.subspecialties.map(s => s.toLowerCase().trim())
          : [];
        
        likely_subspecialties.forEach(inferredSub => {
          if (!inferredSub || !inferredSub.name || typeof inferredSub.confidence !== 'number') return;
          
          const inferredNameLower = inferredSub.name.toLowerCase().trim();
          
          const hasMatch = docSubspecialties.some(docSub => {
            if (docSub === inferredNameLower) return true;
            if (docSub.includes(inferredNameLower) || inferredNameLower.includes(docSub)) return true;
            const inferredWords = inferredNameLower.split(/\s+/);
            const docWords = docSub.split(/\s+/);
            return inferredWords.some(word => word.length > 3 && docWords.includes(word));
          });
          
          if (hasMatch) {
            subspecialtyMatches++;
            const subBoost = inferredSub.confidence * rc.subspecialty_factor;
            subspecialtyBoost += subBoost;
          }
        });
        
        if (subspecialtyBoost > 0) {
          const cappedBoost = Math.min(subspecialtyBoost, rc.subspecialty_cap);
          rescoringScore += cappedBoost;
          console.log(`[Rescoring Score] Doc "${doc.name}": ${subspecialtyMatches} subspecialty matches, +${cappedBoost.toFixed(2)}`);
        }
      }
      
      // Negative matches: configurable additive penalties
      if (negative_terms && negative_terms.length > 0) {
        negativeMatches = negative_terms.filter(term => 
          searchableText.includes(term.toLowerCase())
        ).length;
        
        if (negativeMatches >= 4) rescoringScore += rc.negative_4;
        else if (negativeMatches >= 2) rescoringScore += rc.negative_2;
        else if (negativeMatches === 1) rescoringScore += rc.negative_1;
      }
      
      // Use rescoring score as primary, BM25 as fallback
      newScore = rescoringScore;
    } else {
      // Original behavior: multiply BM25 score with boosts
      newScore = bm25Score;
      
      // Apply boosts (multiplicative) - keep literals for now; can add to config later
      if (highSignalMatches >= 2) newScore *= 1.4;
      else if (highSignalMatches === 1) newScore *= 1.2;
      
      if (pathwayMatches >= 3) newScore *= 1.3;
      else if (pathwayMatches >= 2) newScore *= 1.15;
      else if (pathwayMatches === 1) newScore *= 1.05;
      
      if (procedureMatches >= 1) newScore *= 1.05;
      
      // Apply anchor phrase additive boost (configurable)
      if (anchor_phrases && anchor_phrases.length > 0) {
        anchor_phrases.forEach(phrase => {
          const phraseLower = phrase.toLowerCase();
          if (searchableText.includes(phraseLower)) {
            anchorMatches++;
          }
        });
        if (anchorMatches > 0) {
          const anchorBoost = Math.min(anchorMatches * rc.anchor_per_match, rc.anchor_cap);
          newScore += anchorBoost;
          console.log(`[BM25 Anchor Boost] Doc "${doc.name}": ${anchorMatches} anchor matches, +${anchorBoost.toFixed(2)} boost`);
        }
      }
      
      // V2: Safe-lane term additive boost (when safe_lane_terms provided)
      if (safe_lane_terms && safe_lane_terms.length > 0) {
        safe_lane_terms.forEach(term => {
          const termLower = (term && typeof term === 'string' ? term : '').toLowerCase();
          if (termLower && searchableText.includes(termLower)) safeLaneMatches++;
        });
        if (safeLaneMatches > 0) {
          const safeLaneBoost = safeLaneMatches >= 3 ? (rc.safe_lane_3_or_more ?? 3.0) : safeLaneMatches === 2 ? (rc.safe_lane_2 ?? 2.0) : (rc.safe_lane_1 ?? 1.0);
          newScore += safeLaneBoost;
          console.log(`[BM25 Safe Lane Boost V2] Doc "${doc.name}": ${safeLaneMatches} safe_lane matches, +${safeLaneBoost.toFixed(2)}`);
        }
      }
      
      // Apply subspecialty boost (multiplicative, configurable)
      if (likely_subspecialties && Array.isArray(likely_subspecialties) && likely_subspecialties.length > 0) {
        const docSubspecialties = Array.isArray(doc.subspecialties) 
          ? doc.subspecialties.map(s => s.toLowerCase().trim())
          : [];
        
        likely_subspecialties.forEach(inferredSub => {
          if (!inferredSub || !inferredSub.name || typeof inferredSub.confidence !== 'number') return;
          
          const inferredNameLower = inferredSub.name.toLowerCase().trim();
          
          const hasMatch = docSubspecialties.some(docSub => {
            if (docSub === inferredNameLower) return true;
            if (docSub.includes(inferredNameLower) || inferredNameLower.includes(docSub)) return true;
            const inferredWords = inferredNameLower.split(/\s+/);
            const docWords = docSub.split(/\s+/);
            return inferredWords.some(word => word.length > 3 && docWords.includes(word));
          });
          
          if (hasMatch) {
            subspecialtyMatches++;
            const subBoost = inferredSub.confidence * rc.subspecialty_factor;
            subspecialtyBoost += subBoost;
          }
        });
        
        if (subspecialtyBoost > 0) {
          const cappedBoost = Math.min(subspecialtyBoost, rc.subspecialty_cap);
          newScore *= (1.0 + cappedBoost);
          console.log(`[BM25 Subspecialty Boost] Doc "${doc.name}": ${subspecialtyMatches} subspecialty matches, +${(cappedBoost * 100).toFixed(1)}% boost`);
        }
      }
      
      // Apply negative term penalties (configurable)
      if (negative_terms && negative_terms.length > 0) {
        negativeMatches = negative_terms.filter(term => 
          searchableText.includes(term.toLowerCase())
        ).length;
        
        if (negativeMatches >= 4) newScore *= rc.negative_mult_4;
        else if (negativeMatches >= 2) newScore *= rc.negative_mult_2;
        else if (negativeMatches === 1) newScore *= rc.negative_mult_1;
      }
    }
    
    return {
      ...result,
      score: Math.max(0, newScore),
      bm25Score: bm25Score, // Store original BM25 score
      rescoringScore: rescoringScore, // Store rescoring score if calculated
      rescoringInfo: {
        highSignalMatches,
        pathwayMatches,
        procedureMatches,
        negativeMatches: negativeMatches || 0,
        anchorMatches: anchorMatches || 0,
        subspecialtyMatches: subspecialtyMatches || 0,
        subspecialtyBoost: subspecialtyBoost || 0,
        safeLaneMatches: safeLaneMatches || 0
      }
    };
  }).sort((a, b) => {
    // If using rescoring score as primary, sort by rescoring score first, then BM25 as fallback
    if (useRescoringScoreAsPrimary) {
      if (b.rescoringScore !== a.rescoringScore) {
        return b.rescoringScore - a.rescoringScore;
      }
      // Fallback to BM25 score if rescoring scores are equal
      return b.bm25Score - a.bm25Score;
    }
    // Original behavior: sort by modified score
    return b.score - a.score;
  });
};

/**
 * BM25 ranking with negative term penalty support
 */
const rankPractitionersBM25 = (practitioners, query, k1 = 1.5, b = 0.75, negativeTerms = null, fieldWeights = null) => {
  if (!query || !query.trim()) {
    return practitioners.map((doc, idx) => ({
      document: doc,
      score: practitioners.length - idx,
      rank: idx + 1
    }));
  }
  
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return practitioners.map((doc, idx) => ({
      document: doc,
      score: practitioners.length - idx,
      rank: idx + 1
    }));
  }
  
  // Build document corpus (optional fieldWeights for createWeightedSearchableText)
  const documents = practitioners.map(p => ({
    practitioner: p,
    text: createWeightedSearchableText(p, fieldWeights),
    tokens: null // Will be computed
  }));
  
  // Tokenize all documents
  documents.forEach(doc => {
    doc.tokens = tokenize(doc.text);
  });
  
  // Calculate document frequencies
  const docFreq = {};
  queryTerms.forEach(term => {
    docFreq[term] = documents.filter(doc => doc.tokens.includes(term)).length;
  });
  
  // Calculate average document length
  const avgDocLength = documents.reduce((sum, doc) => sum + doc.tokens.length, 0) / documents.length;
  
  // Score each document
  const scored = documents.map(doc => {
    let score = 0;
    const docLength = doc.tokens.length;
    
    queryTerms.forEach(term => {
      const termFreq = doc.tokens.filter(t => t === term).length;
      const docFreqForTerm = docFreq[term] || 1;
      
      // Calculate IDF with smoothing to prevent negative values
      // When a term appears in all documents (common in filtered specialty searches),
      // the standard IDF becomes negative. We use max(0, idf) to ensure non-negative IDF.
      // This allows terms that appear in all documents to contribute 0 to the score
      // (they don't help differentiate), while still allowing other terms to contribute.
      let idf = Math.log((documents.length - docFreqForTerm + 0.5) / (docFreqForTerm + 0.5));
      // Clamp IDF to be non-negative (terms in all documents don't help differentiate)
      idf = Math.max(0, idf);
      
      const numerator = termFreq * (k1 + 1);
      const denominator = termFreq + k1 * (1 - b + b * (docLength / avgDocLength));
      
      score += idf * (numerator / denominator);
    });
    
    // Quality boost
    const qualityBoost = calculateQualityBoost(doc.practitioner);
    score *= qualityBoost;
    
    // Exact match bonus
    const exactBonus = calculateExactMatchBonus(query, doc.text);
    score += exactBonus;
    
    // Negative term penalty (if provided)
    if (negativeTerms && negativeTerms.length > 0) {
      const negativePenalty = calculateNegativeTermPenalty(
        doc.practitioner,
        negativeTerms,
        doc.text
      );
      score *= negativePenalty;
    }
    
    return {
      document: doc.practitioner,
      score: Math.max(0, score),
      rank: 0 // Will be set after sorting
    };
  });
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Assign ranks
  scored.forEach((item, idx) => {
    item.rank = idx + 1;
  });
  
  return scored;
};

/**
 * Get BM25 shortlist with two-stage retrieval
 * Stage A: BM25 with q_patient + safe_lane_terms
 * Stage B: Post-retrieval rescoring with intent_terms
 */
const getBM25Shortlist = (practitioners, filters, shortlistSize = 10) => {
  practitioners = applyFilterConditions(practitioners, filters);
  const rc = getRankingConfig(filters);
  // Stage A: Build clean BM25 query (q_patient only, or q_patient + safe terms)
  const q_patient = filters.q_patient || filters.searchQuery || '';
  const safe_lane_terms = filters.safe_lane_terms || [];
  const isV5 = filters.variantName === 'v5';
  
  if (isV5) {
    console.log('[V5 Stage A] q_patient (ideal profile query):', q_patient.substring(0, 200));
  }
  
  // Combine: q_patient + safe_lane_terms (max 4 safe terms)
  const q_bm25_parts = [q_patient];
  if (safe_lane_terms.length > 0) {
    q_bm25_parts.push(...safe_lane_terms.slice(0, 4));
  }
  
  // NOTE: specialty and location are NOT added to BM25 query because they are already
  // filtered in production infrastructure before ranking. Adding them would double-weight
  // these factors and distort ranking.
  
  // Add name filter only (if provided)
  if (filters.name) q_bm25_parts.push(filters.name);
  
  const q_bm25 = q_bm25_parts.join(' ');
  
  // Normalize query (equivalence-only aliasing)
  const normalizationResult = normalizeMedicalQuery(q_bm25);
  let q_bm25_normalized = normalizationResult.normalizedQuery;
  
  if (isV5) {
    console.log('[V5 Stage A] Normalized BM25 query:', q_bm25_normalized.substring(0, 200));
  }
  
  // Append anchor phrases for parallel_general_goal_specificity variant (repetition helps BM25)
  const anchor_phrases = filters.anchor_phrases || filters.intentData?.anchor_phrases || [];
  if (anchor_phrases.length > 0) {
    // Append anchors to the end of the query (BM25 naturally weights repeated terms)
    q_bm25_normalized = q_bm25_normalized + ' ' + anchor_phrases.join(' ');
    console.log('[BM25 Anchor Boosting] Anchor phrases appended:', anchor_phrases);
  }

  // Patient-only query (for two-query mode: no intent terms)
  const q_patient_only_normalized = q_bm25_normalized;

  // Optionally append intent_terms to BM25 query (config: intent_terms_in_bm25, intent_terms_in_bm25_max)
  const intent_terms_for_bm25 = filters.intent_terms || [];
  if (!rc.stage_a_two_query && rc.intent_terms_in_bm25 && intent_terms_for_bm25.length > 0) {
    const cap = Math.max(1, Math.min(rc.intent_terms_in_bm25_max || 12, 20));
    const termsToAdd = intent_terms_for_bm25.slice(0, cap);
    q_bm25_normalized = q_bm25_normalized + ' ' + termsToAdd.join(' ');
    console.log('[BM25 Intent Terms] Appended to query (cap ' + cap + '):', termsToAdd.length);
  }

  // Logging normalization details
  console.log('[BM25 Normalization] q_bm25 before:', q_bm25);
  console.log('[BM25 Normalization] q_bm25 after:', q_bm25_normalized);
  console.log('[BM25 Normalization] aliases applied:', normalizationResult.aliasesApplied);
  if (normalizationResult.skipped) {
    console.log('[BM25 Normalization] skipped:', normalizationResult.reason);
  }
  
  // Stage A: BM25 retrieval (single-query or two-query union)
  const topN = Math.max(
    Number(rc.stage_a_top_n) || 0,
    Math.max(shortlistSize * 10, 50)
  );
  let bm25Ranked;
  if (rc.stage_a_two_query && intent_terms_for_bm25.length > 0) {
    const patientTopN = rc.stage_a_patient_top_n || 50;
    const intentTopN = rc.stage_a_intent_top_n || 30;
    const unionMax = rc.stage_a_union_max || 100;
    const intentCap = Math.min(rc.stage_a_intent_terms_cap || 10, intent_terms_for_bm25.length);
    const q_intent_only = intent_terms_for_bm25.slice(0, intentCap).join(' ');
    console.log('[BM25 Two-Query Stage A] Patient query top', patientTopN, '; Intent-only query top', intentTopN, '; union max', unionMax);
    const patientRanked = rankPractitionersBM25(practitioners, q_patient_only_normalized, rc.k1, rc.b, null, rc.field_weights || null);
    const intentRanked = rankPractitionersBM25(practitioners, q_intent_only, rc.k1, rc.b, null, rc.field_weights || null);
    const byId = new Map();
    patientRanked.slice(0, patientTopN).forEach((r) => {
      const id = r.document?.practitioner_id || r.document?.id;
      if (id) byId.set(id, { document: r.document, patientScore: r.score, intentScore: 0 });
    });
    intentRanked.slice(0, intentTopN).forEach((r) => {
      const id = r.document?.practitioner_id || r.document?.id;
      if (id) {
        const existing = byId.get(id);
        if (existing) existing.intentScore = r.score;
        else byId.set(id, { document: r.document, patientScore: -1, intentScore: r.score });
      }
    });
    bm25Ranked = Array.from(byId.values())
      .sort((a, b) => {
        if (b.patientScore !== a.patientScore) return (b.patientScore - a.patientScore);
        return (b.intentScore - a.intentScore);
      })
      .slice(0, unionMax)
      .map((o) => ({ document: o.document, score: o.patientScore >= 0 ? o.patientScore : o.intentScore }));
  } else {
    bm25Ranked = rankPractitionersBM25(
      practitioners,
      q_bm25_normalized,
      rc.k1,
      rc.b,
      null,
      rc.field_weights || null
    );
  }
  
  // Logging
  console.log('[BM25 Two-Stage] q_patient:', q_patient);
  console.log('[BM25 Two-Stage] safe_lane_terms:', safe_lane_terms);
  console.log('[BM25 Two-Stage] q_bm25:', q_bm25_normalized);
  if (isV5) {
    console.log('[V5 Stage A] BM25 top5 scores:', bm25Ranked.slice(0, 5).map(r => ({
      name: r.document.name,
      score: r.score.toFixed(4)
    })));
  }
  console.log('[BM25 Two-Stage] intent_terms:', filters.intent_terms || []);
  console.log('[BM25 Two-Stage] BM25 top5 before rescoring:', bm25Ranked.slice(0, 5).map(r => ({
    name: r.document.name,
    score: (r.score != null && typeof r.score === 'number') ? r.score.toFixed(4) : r.score
  })));
  
  // Stage B: Post-retrieval rescoring
  const intent_terms = filters.intent_terms || [];
  const negative_terms = filters.intentData?.negative_terms || null;
  // anchor_phrases already declared above (line 539) - reuse it
  // Pass null if empty array (for rescoring function)
  const anchor_phrases_for_rescoring = anchor_phrases.length > 0 ? anchor_phrases : null;
  const likely_subspecialties = filters.intentData?.likely_subspecialties || null;
  
  // Check if this is the "parallel" or "parallel-v2" variant and if query is ambiguous
  // For parallel variants: if AMBIGUOUS, use rescoring score as primary (helps disambiguate)
  const isParallelVariant = filters.variantName === 'parallel' || filters.variantName === 'parallel-v2';
  const isV5Variant = filters.variantName === 'v5';
  const isQueryAmbiguous = filters.intentData?.isQueryAmbiguous ?? true; // Default to ambiguous if not specified
  const useRescoringScoreAsPrimary = (isParallelVariant && isQueryAmbiguous) || isV5Variant; // V5 always uses profile matching as primary

  if (isParallelVariant || isV5Variant) {
    console.log(`[${isV5Variant ? 'V5' : 'Parallel'} Variant] Query clarity: ${isQueryAmbiguous ? 'AMBIGUOUS' : 'CLEAR'}, Using rescoring score as primary: ${useRescoringScoreAsPrimary}`);
  }
  
  // V2: pass safe_lane_terms for rescoring boost (only parallel-v2 has non-empty safe_lane_terms)
  const safe_lane_terms_for_rescoring = (filters.variantName === 'parallel-v2' && safe_lane_terms.length > 0) ? safe_lane_terms : null;
  
  // V5: Extract ideal profile if available
  const idealProfile = filters.idealProfile || filters.intentData?.idealProfile || null;
  if (idealProfile && isV5Variant) {
    console.log('[V5] Using ideal profile matching for Stage B');
    console.log('[V5] Ideal profile:', JSON.stringify(idealProfile, null, 2).substring(0, 500));
  } else if (isV5Variant) {
    console.warn('[V5] WARNING: Ideal profile not found in filters!');
    console.log('[V5] Filters keys:', Object.keys(filters));
    console.log('[V5] filters.idealProfile:', filters.idealProfile);
    console.log('[V5] filters.intentData?.idealProfile:', filters.intentData?.idealProfile);
  }
  
  // All variants rescore top 50 BM25 results (pass ranking config for tunable weights)
  const rescored = rescoreWithIntentTerms(
    bm25Ranked.slice(0, topN),
    intent_terms,
    negative_terms,
    anchor_phrases_for_rescoring,
    likely_subspecialties,
    safe_lane_terms_for_rescoring,
    useRescoringScoreAsPrimary,
    rc,
    idealProfile // V5: Pass ideal profile for profile-to-profile matching
  );
  
  
  console.log('[BM25 Two-Stage] Rescored top3:', rescored.slice(0, 3).map(r => ({
    name: r.document.name,
    bm25Score: r.score.toFixed(4),
    rescoringInfo: r.rescoringInfo
  })));
  
  // Return top N with query information
  // Ensure we return at least shortlistSize profiles even if many have 0 scores
  // This is important for V6 progressive ranking which needs to fetch more profiles
  let finalResults = rescored.slice(0, shortlistSize);
  // If we got fewer than requested and there are more rescored profiles, include zero-score ones
  if (finalResults.length < shortlistSize && rescored.length > finalResults.length) {
    const zeroScoreProfiles = rescored.slice(finalResults.length)
      .filter(r => r.score === 0)
      .slice(0, shortlistSize - finalResults.length);
    finalResults = [...finalResults, ...zeroScoreProfiles];
  }
  
  return {
    results: finalResults,
    queryInfo: {
      q_patient: q_patient,
      q_bm25_before: q_bm25, // Before normalization
      q_bm25: q_bm25_normalized, // After normalization
      safe_lane_terms: safe_lane_terms,
      intent_terms: intent_terms,
      anchor_phrases: anchor_phrases || [], // Anchor phrases used for boosting
      preBM25Query: filters.searchQuery || q_patient, // For display
      finalQuery: q_bm25_normalized,
      normalizationAliases: normalizationResult.aliasesApplied,
      normalizationSkipped: normalizationResult.skipped || false,
      normalizationReason: normalizationResult.reason || null,
      medicalExpansionApplied: q_bm25_normalized !== q_bm25, // Legacy field name
      intentData: filters.intentData || null
    }
  };
};

/**
 * Stage A only: same BM25 query logic as getBM25Shortlist (q_patient + safe_lane_terms + anchor_phrases, normalize),
 * no rescoring. Returns top N as { document, score, rank } for use in v3 merge (same logic that sends top 50 to LLM).
 */
const getBM25StageATopN = (practitioners, filters, n = 50) => {
  practitioners = applyFilterConditions(practitioners, filters);
  const rc = getRankingConfig(filters);
  const q_patient = filters.q_patient || filters.searchQuery || '';
  const safe_lane_terms = filters.safe_lane_terms || [];
  const q_bm25_parts = [q_patient];
  if (safe_lane_terms.length > 0) q_bm25_parts.push(...safe_lane_terms.slice(0, 4));
  if (filters.name) q_bm25_parts.push(filters.name);
  const q_bm25 = q_bm25_parts.join(' ');
  const normalizationResult = normalizeMedicalQuery(q_bm25);
  let q_bm25_normalized = normalizationResult.normalizedQuery;
  const anchor_phrases = filters.anchor_phrases || filters.intentData?.anchor_phrases || [];
  if (anchor_phrases.length > 0) q_bm25_normalized = q_bm25_normalized + ' ' + anchor_phrases.join(' ');
  const intent_terms_for_bm25 = filters.intent_terms || [];
  if (rc.intent_terms_in_bm25 && intent_terms_for_bm25.length > 0) {
    const cap = Math.max(1, Math.min(rc.intent_terms_in_bm25_max || 12, 20));
    q_bm25_normalized = q_bm25_normalized + ' ' + intent_terms_for_bm25.slice(0, cap).join(' ');
  }
  let ranked = rankPractitionersBM25(practitioners, q_bm25_normalized, rc.k1, rc.b, null, rc.field_weights || null);

  // Optional: apply negative_terms penalty in Stage A (same multiplicative penalty as rescoring)
  const negative_terms = filters.intentData?.negative_terms || [];
  if (rc.stage_a_negative_penalty && negative_terms.length > 0) {
    ranked = ranked.map(result => {
      const searchableText = createWeightedSearchableText(result.document, rc.field_weights || null).toLowerCase();
      const negativeMatches = negative_terms.filter(term => searchableText.includes(term.toLowerCase())).length;
      let score = result.score;
      if (negativeMatches >= 4) score *= rc.negative_mult_4;
      else if (negativeMatches >= 2) score *= rc.negative_mult_2;
      else if (negativeMatches === 1) score *= rc.negative_mult_1;
      return { ...result, score: Math.max(0, score) };
    }).sort((a, b) => b.score - a.score);
  }

  // Return top N, but ensure we return at least N profiles even if some have 0 scores
  // This is important for V6 progressive ranking which needs to fetch more profiles
  const result = ranked.slice(0, n);
  // If we got fewer than requested and there are more practitioners, include zero-score ones
  if (result.length < n && ranked.length > result.length) {
    const zeroScoreProfiles = ranked.slice(result.length)
      .filter(r => r.score === 0)
      .slice(0, n - result.length);
    result.push(...zeroScoreProfiles);
  }
  return result.map((item, idx) => ({ ...item, rank: idx + 1 }));
};

module.exports = {
  getBM25Shortlist,
  getBM25StageATopN,
  rankPractitionersBM25,
  createWeightedSearchableText,
  parseClinicalExpertise,
  applyFilterConditions,
  expandMedicalQuery, // Legacy function name
  normalizeMedicalQuery, // New function
  rescoreWithIntentTerms,
  getRankingConfig,
  DEFAULT_RANKING_CONFIG,
  // V5 functions
  matchProfileAgainstIdeal,
  extractProcedures,
  extractConditions,
  fuzzyMatch
};
