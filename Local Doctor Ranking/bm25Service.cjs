/**
 * Enhanced BM25 Ranking Service
 *
 * Includes:
 * 1. Field weighting (important fields get higher weight)
 * 2. Quality boosting (ratings, reviews, experience, relevant procedure volume)
 * 3. Exact phrase matching
 * 4. Procedure volume integration (HEAVY WEIGHT for experience signal)
 * 5. Gender preference filtering (respects user preference)
 * 6. Insurance filtering
 * 7. Proximity boost (postcode searches)
 * 8. Optional semantic scoring + min-max normalization
 *
 * Integration (local → production):
 * - IDF clamping (prevents zero scores for filtered specialties)
 * - Zero-score profile handling (return requested shortlist size)
 * - normalizeMedicalQuery (equivalence-only aliasing)
 * - separateQueryFromFilters + q_patient / safe_lane_terms
 * - Two-stage retrieval: getBM25StageATopN + rescoreWithParallelContext (configurable weights)
 * - applyFilterConditions (patient_age_group, languages, gender)
 * - parseClinicalExpertise + structured createWeightedSearchableText
 * - getBM25Shortlist(..., options): useEquivalenceNormalization, separateQueryFromFilters, useTwoStageRetrieval
 */

/**
 * Infer gender from pronouns in text
 * @param {string} text - Text to analyze for pronouns
 * @returns {string} - 'male', 'female', or 'unknown'
 */
const inferGenderFromPronouns = (text) => {
  if (!text) return 'unknown';
  
  const lowerText = text.toLowerCase();
  
  // Male pronouns
  const malePronouns = ['\\bhe\\b', '\\bhim\\b', '\\bhis\\b', '\\bhimself\\b'];
  const maleRegex = new RegExp(malePronouns.join('|'), 'gi');
  const maleMatches = (lowerText.match(maleRegex) || []).length;
  
  // Female pronouns
  const femalePronouns = ['\\bshe\\b', '\\bher\\b', '\\bhers\\b', '\\bherself\\b'];
  const femaleRegex = new RegExp(femalePronouns.join('|'), 'gi');
  const femaleMatches = (lowerText.match(femaleRegex) || []).length;
  
  // Need at least 2 pronoun occurrences to be confident
  if (maleMatches >= 2 && maleMatches > femaleMatches) {
    return 'male';
  }
  
  if (femaleMatches >= 2 && femaleMatches > maleMatches) {
    return 'female';
  }
  
  return 'unknown';
};

/**
 * Infer gender from practitioner title and bio/description
 * @param {Object} practitioner - Practitioner object with title, description, about, clinical_expertise
 * @returns {string} - 'male', 'female', or 'unknown'
 */
const inferGenderFromTitle = (practitioner) => {
  const title = practitioner.title;
  
  if (!title) {
    // No title, try to infer from text
    const textToAnalyze = [
      practitioner.description,
      practitioner.about,
      practitioner.clinical_expertise,
      practitioner.specialty_description
    ].filter(Boolean).join(' ');
    
    return inferGenderFromPronouns(textToAnalyze);
  }
  
  const normalizedTitle = title.toLowerCase().trim();
  
  // Male titles - definitive
  if (normalizedTitle === 'mr' || normalizedTitle === 'mr.') {
    return 'male';
  }
  
  // Female titles - definitive
  if (normalizedTitle === 'mrs' || normalizedTitle === 'mrs.' ||
      normalizedTitle === 'ms' || normalizedTitle === 'ms.' ||
      normalizedTitle === 'miss') {
    return 'female';
  }
  
  // Dr, Prof, etc. - Try to infer from bio/description using pronouns
  const textToAnalyze = [
    practitioner.description,
    practitioner.about,
    practitioner.clinical_expertise,
    practitioner.specialty_description
  ].filter(Boolean).join(' ');
  
  const genderFromPronouns = inferGenderFromPronouns(textToAnalyze);
  
  if (genderFromPronouns !== 'unknown') {
    // console.log(`[Gender Inference] ${practitioner.name} (${title}) - Inferred ${genderFromPronouns} from pronouns in bio`); // Debug log - commented for production
    return genderFromPronouns;
  }
  
  // Still unknown after checking pronouns
  return 'unknown';
};

/**
 * Filter practitioners by insurance acceptance
 * @param {Array} practitioners - List of practitioners
 * @param {string} insurancePreference - User's insurance provider name
 * @returns {Array} - Filtered list of practitioners who accept this insurance
 */
const filterByInsurance = (practitioners, insurancePreference) => {
  // If no insurance preference specified, return all practitioners
  if (!insurancePreference) {
    // console.log('[BM25 Insurance Filter] No insurance preference specified, including all practitioners'); // Debug log - commented for production
    return practitioners;
  }
  
  // console.log('[BM25 Insurance Filter] 🏥 Filtering for insurance:', insurancePreference); // Debug log - commented for production
  // console.log('[BM25 Insurance Filter] Total practitioners before filtering:', practitioners.length); // Debug log - commented for production
  
  const filteredPractitioners = practitioners.filter(practitioner => {
    // Check if practitioner has insurance providers data
    if (!practitioner.insuranceProviders || practitioner.insuranceProviders.length === 0) {
      // console.log(`[BM25 Insurance Filter] ❌ ${practitioner.name} - No insurance data available`); // Debug log - commented for production
      return false;
    }
    
    // Check if any of the practitioner's insurance providers match the user's preference
    const acceptsInsurance = practitioner.insuranceProviders.some(insurance => {
      const insuranceName = insurance.name || insurance.insurer_name || insurance.displayName || '';
      
      // Normalize both strings for comparison (case-insensitive, trim whitespace)
      const normalizedInsuranceName = insuranceName.toLowerCase().trim();
      const normalizedPreference = insurancePreference.toLowerCase().trim();
      
      // Check for exact match or if preference is contained in insurance name
      // (e.g., "Bupa" matches "Bupa", "BUPA", "Bupa Health", etc.)
      return normalizedInsuranceName === normalizedPreference || 
             normalizedInsuranceName.includes(normalizedPreference) ||
             normalizedPreference.includes(normalizedInsuranceName);
    });
    
    // if (acceptsInsurance) { // Debug log - commented for production
    //   console.log(`[BM25 Insurance Filter] ✅ ${practitioner.name} - Accepts ${insurancePreference}`);
    // } else {
    //   console.log(`[BM25 Insurance Filter] ❌ ${practitioner.name} - Does NOT accept ${insurancePreference}`);
    // }
    
    return acceptsInsurance;
  });
  
  // console.log('[BM25 Insurance Filter] Total practitioners after insurance filtering:', filteredPractitioners.length); // Debug log - commented for production
  // console.log('[BM25 Insurance Filter] ℹ️ Filtered to only those accepting:', insurancePreference); // Debug log - commented for production
  
  if (filteredPractitioners.length === 0) {
    console.warn('[BM25 Insurance Filter] ⚠️ WARNING: No practitioners accept this insurance!'); // Keep warning for production debugging
  }
  
  return filteredPractitioners;
};

/**
 * Filter practitioners by gender preference
 * @param {Array} practitioners - List of practitioners
 * @param {string} genderPreference - User's gender preference ('male', 'female', or null/undefined for no preference)
 * @returns {Array} - Filtered list of practitioners
 */
const filterByGenderPreference = (practitioners, genderPreference) => {
  // If no gender preference specified, return all practitioners
  if (!genderPreference || genderPreference === 'any' || genderPreference === 'no preference') {
    // console.log('[BM25 Gender Filter] No gender preference specified, including all practitioners'); // Debug log - commented for production
    return practitioners;
  }
  
  const normalizedPreference = genderPreference.toLowerCase().trim();
  
  // console.log('[BM25 Gender Filter] 🎯 Filtering for gender preference:', normalizedPreference); // Debug log - commented for production
  // console.log('[BM25 Gender Filter] Total practitioners before filtering:', practitioners.length); // Debug log - commented for production
  
  const filteredPractitioners = practitioners.filter(practitioner => {
    const inferredGender = inferGenderFromTitle(practitioner); // Now passing full practitioner object
    
    // ✅ NEW: Include unknown genders (Dr, Prof) alongside matching preference
    // This is more user-friendly - users get their preference + all qualified doctors
    if (inferredGender === 'unknown') {
      // console.log(`[BM25 Gender Filter] ℹ️ Including ${practitioner.name} (title: ${practitioner.title}) - unknown gender included by default`); // Debug log - commented for production
      return true;
    }
    
    const matches = inferredGender === normalizedPreference;
    
    // if (!matches) { // Debug log - commented for production
    //   console.log(`[BM25 Gender Filter] ❌ Filtered out ${practitioner.name} (${inferredGender} doesn't match preference: ${normalizedPreference})`);
    // } else {
    //   console.log(`[BM25 Gender Filter] ✅ Included ${practitioner.name} (${inferredGender} matches preference)`);
    // }
    
    return matches;
  });
  
  // console.log('[BM25 Gender Filter] Total practitioners after gender filtering:', filteredPractitioners.length); // Debug log - commented for production
  // console.log('[BM25 Gender Filter] ℹ️ Includes both matching titles and Dr/Prof (unknown gender)'); // Debug log - commented for production
  
  if (filteredPractitioners.length === 0) {
    console.warn('[BM25 Gender Filter] ⚠️ WARNING: No practitioners match the gender preference!'); // Keep warning for production debugging
  }
  
  return filteredPractitioners;
};

/**
 * Apply filter conditions (patient_age_group, languages, gender). Optional filters; omitted or empty = no filter.
 * Use after insurance and gender preference filters. Supports age group, languages, and explicit gender field.
 * @param {Object[]} practitioners - List of practitioners
 * @param {Object} filters - May have patient_age_group (string), languages (string[]), gender (string)
 * @returns {Object[]} Filtered list
 */
const applyFilterConditions = (practitioners, filters) => {
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
};

// Field weights: Higher = more important
// (Used for documentation and by createWeightedSearchableText function)
// eslint-disable-next-line no-unused-vars
const FIELD_WEIGHTS = {
  clinical_expertise: 3.0,    // Highest - what they actually do
  procedure_groups: 2.8,      // Very high - procedures performed (experience!)
  specialty: 2.5,             // Very important
  specialty_description: 2.0,
  description: 1.5,
  about: 1.0,
  name: 1.0,
  memberships: 0.8,
  address_locality: 0.5,
  title: 0.3,
  insuranceProviders: 0.3
};

/** Default ranking config for two-stage rescoring (tunable via filters.rankingConfig) */
const DEFAULT_RANKING_CONFIG = {
  intent_term_weight: 0.3,
  anchor_phrase_weight: 0.5,
  negative_1: -1.0,
  negative_2: -2.0,
  negative_4: -3.0,
  subspecialty_factor: 0.3,
  subspecialty_cap: 0.5,
  k1: 1.5,
  b: 0.75,
  stage_a_top_n: 100,
  stage_a_two_query: false,
  stage_a_patient_top_n: 50,
  stage_a_intent_top_n: 30,
  stage_a_union_max: 100,
  stage_a_intent_terms_cap: 10,
  intent_terms_in_bm25: false,
  anchor_per_match_v2: 0.25,
  anchor_cap_v2: 0.75,
  safe_lane_1: 1.0,
  safe_lane_2: 2.0,
  safe_lane_3_or_more: 3.0
};

/**
 * Get ranking config merged with optional filters.rankingConfig (parallel-v2 uses stronger anchor weights).
 * @param {Object} filters - May have rankingConfig, variantName
 * @returns {Object} Merged config
 */
const getRankingConfig = (filters) => {
  const custom = (filters && filters.rankingConfig) || {};
  const rc = { ...DEFAULT_RANKING_CONFIG, ...custom };
  if (filters && filters.variantName === 'parallel-v2') {
    rc.anchor_phrase_weight = rc.anchor_per_match_v2 ?? rc.anchor_phrase_weight;
    rc.anchor_cap = rc.anchor_cap_v2 ?? 0.5;
  }
  return rc;
};

/**
 * Calculate RELEVANT admission count for a practitioner
 * Uses SMART matching to avoid false positives from generic terms
 * Only counts procedures that are truly relevant to the patient's query
 */
const calculateRelevantAdmissionCount = (practitioner, queryTerms) => {
  if (!practitioner.procedure_groups || practitioner.procedure_groups.length === 0) {
    return { relevantAdmissions: 0, totalAdmissions: 0, hasRelevantProcedures: false };
  }
  
  // 🚫 Filter out generic/stop words that cause false positives
  const genericTerms = new Set([
    'surgical', 'treatment', 'procedure', 'surgery', 'operation', 
    'consultation', 'assessment', 'examination', 'diagnostic', 'therapy',
    'care', 'management', 'service', 'clinic', 'hospital', 'patient',
    'medical', 'clinical', 'health', 'doctor', 'specialist', 'practitioner',
    'london', 'want', 'need', 'help', 'find', 'looking', 'require',
    'being', 'referred', 'person', 'visit', 'appointment', 'see'
  ]);
  
  // Extract meaningful medical terms (filtering out generic ones)
  const meaningfulTerms = queryTerms.filter(term => 
    !genericTerms.has(term.toLowerCase()) && term.length > 3
  );
  
  let relevantAdmissions = 0;
  let totalAdmissions = 0;
  
  practitioner.procedure_groups.forEach(pg => {
    const procedureName = (pg.procedure_group_name || '').toLowerCase();
    const admissionCount = pg.admission_count || 0;
    
    totalAdmissions += admissionCount;
    
    // 🎯 SMART MATCHING ALGORITHM
    // Priority 1: Exact condition/procedure match (e.g., "endometriosis" in procedure name)
    const hasExactMatch = meaningfulTerms.some(term => 
      procedureName.includes(term.toLowerCase())
    );
    
    // Priority 2: Multiple meaningful terms present (higher confidence)
    const matchingTermsCount = meaningfulTerms.filter(term =>
      procedureName.includes(term.toLowerCase())
    ).length;
    
    // Priority 3: Procedure name is specific enough (not just generic terms)
    const isSpecificProcedure = procedureName.split(/[\s-]+/).length >= 2; // At least 2 words
    
    // Consider relevant if:
    // - Has exact match with a meaningful term (e.g., "endometriosis")
    // - OR has multiple matching terms AND is a specific procedure name
    const isRelevant = hasExactMatch || (matchingTermsCount >= 2 && isSpecificProcedure);
    
    if (isRelevant) {
      relevantAdmissions += admissionCount;
    }
  });
  
  return {
    relevantAdmissions,
    totalAdmissions,
    hasRelevantProcedures: relevantAdmissions > 0,
    relevanceRatio: totalAdmissions > 0 ? relevantAdmissions / totalAdmissions : 0
  };
};

/**
 * Calculate quality boost based on practitioner signals
 * NOW uses RELEVANT admission count instead of procedure type count - GAME CHANGER!
 */
const calculateQualityBoost = (practitioner, queryTerms) => {
  let boost = 1.0;
  
  // ⭐ Rating boost
  if (practitioner.rating_value >= 4.8) boost *= 1.3;
  else if (practitioner.rating_value >= 4.5) boost *= 1.2;
  else if (practitioner.rating_value >= 4.0) boost *= 1.1;
  
  // 📊 Review count boost
  if (practitioner.review_count >= 100) boost *= 1.2;
  else if (practitioner.review_count >= 50) boost *= 1.15;
  else if (practitioner.review_count >= 20) boost *= 1.1;
  
  // 🎓 Years of experience boost
  if (practitioner.years_experience >= 20) boost *= 1.15;
  else if (practitioner.years_experience >= 10) boost *= 1.1;
  
  // ✓ Verification boost
  if (practitioner.verified) boost *= 1.1;
  
  // 🎯 RELEVANT ADMISSION COUNT BOOST (GAME CHANGER!)
  // Only boosts for procedures that MATCH the query
  // Prevents gynecologists with 80 irrelevant procedures ranking high for cardiac queries!
  const admissionData = calculateRelevantAdmissionCount(practitioner, queryTerms);
  
  if (admissionData.hasRelevantProcedures) {
    // Boost based on RELEVANT admission count
    // 🏆 More granular tiers for high-volume specialists
    // The previous cap at 50+ didn't differentiate between 50 and 150 procedures!
    if (admissionData.relevantAdmissions >= 150) boost *= 2.5;      // 150% boost for 150+ (truly elite)
    else if (admissionData.relevantAdmissions >= 100) boost *= 2.2; // 120% boost for 100-149 (highly experienced)
    else if (admissionData.relevantAdmissions >= 75) boost *= 2.0;  // 100% boost for 75-99
    else if (admissionData.relevantAdmissions >= 50) boost *= 1.7;  // 70% boost for 50-74
    else if (admissionData.relevantAdmissions >= 30) boost *= 1.5;  // 50% boost for 30-49
    else if (admissionData.relevantAdmissions >= 20) boost *= 1.4;  // 40% boost for 20-29
    else if (admissionData.relevantAdmissions >= 10) boost *= 1.3;  // 30% boost for 10-19
    else if (admissionData.relevantAdmissions >= 5) boost *= 1.2;   // 20% boost for 5-9
    else if (admissionData.relevantAdmissions >= 1) boost *= 1.1;   // 10% boost for 1-4
  } else if (admissionData.totalAdmissions > 0) {
    // Has procedures, but NONE are relevant - apply penalty
    boost *= 0.85;  // 15% penalty
  }
  
  return boost;
};

/**
 * Calculate proximity boost for postcode searches
 * Only applies when user searched by specific postcode (not city)
 * Rewards closer practitioners to balance expertise with convenience
 * 
 * @param {Object} practitioner - Practitioner with distance data
 * @param {Object} geocoded - Geocoded location info (contains searchType)
 * @returns {number} - Proximity boost multiplier (1.0 to 1.3)
 */
const calculateProximityBoost = (practitioner, geocoded) => {
  // Skip if no geocoded info (no proximity search active)
  if (!geocoded) {
    return 1.0;
  }
  
  // Only apply for postcode searches (not city searches)
  // City searches = user wants best expertise in general area
  // Postcode searches = user wants someone specifically near their location
  if (geocoded.searchType !== 'postcode') {
    return 1.0;
  }
  
  // Skip if practitioner has no distance data
  if (practitioner.distance === undefined || practitioner.distance === null) {
    return 1.0;
  }
  
  const distance = practitioner.distance;
  
  // 🔥 ENHANCED Distance-based boost tiers (MORE AGGRESSIVE)
  // Proximity is important for patient convenience and follow-up care
  // These boosts help closer practitioners compete with text-heavy profiles
  if (distance <= 1) return 1.6;       // 0-1 mile: Very close, walking distance
  if (distance <= 2) return 1.5;       // 1-2 miles: Very close, short walk/drive
  if (distance <= 3) return 1.4;       // 2-3 miles: Close, short drive/bus
  if (distance <= 5) return 1.3;       // 3-5 miles: Nearby, reasonable commute
  if (distance <= 8) return 1.2;       // 5-8 miles: Moderate distance
  if (distance <= 12) return 1.1;      // 8-12 miles: Acceptable distance
  if (distance <= 18) return 1.05;     // 12-18 miles: Far but within search radius
  return 1.0;                          // 18+ miles: No proximity advantage
};

/**
 * Calculate bonus for exact phrase matches
 */
const calculateExactMatchBonus = (query, text) => {
  const lowerQuery = query.toLowerCase().trim();
  const lowerText = text.toLowerCase();
  
  if (!lowerQuery || !lowerText) return 0;
  
  let bonus = 0;
  
  // Check for exact full query match
  if (lowerText.includes(lowerQuery)) {
    bonus += 2.0; // Significant bonus for exact match
  }
  
  // Check for multi-word phrases (2+ words)
  const phrases = extractMultiWordPhrases(lowerQuery);
  phrases.forEach(phrase => {
    if (lowerText.includes(phrase)) {
      bonus += 1.0; // Bonus for phrase match
    }
  });
  
  return bonus;
};

/**
 * Extract multi-word phrases from query
 */
const extractMultiWordPhrases = (query) => {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const phrases = [];
  
  // Create 2-word and 3-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
    if (i < words.length - 2) {
      phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
  }
  
  return phrases;
};

/**
 * Parse clinical_expertise string into procedures, conditions, clinical_interests.
 * Format: "Procedure: X; Procedure: Y; Condition: Z; Clinical Interests: W"
 * @param {Object} practitioner - Practitioner with clinical_expertise
 * @returns {{ procedures: string, conditions: string, clinical_interests: string }}
 */
const parseClinicalExpertise = (practitioner) => {
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
    clinical_interests: clinical_interests || ''
  };
};

/**
 * Create weighted searchable text (important fields repeated).
 * Uses structured clinical_expertise when parseClinicalExpertise extracts data; otherwise uses raw clinical_expertise (e.g. BDA dietitians).
 */
const createWeightedSearchableText = (practitioner) => {
  const weightedParts = [];
  const parsed = parseClinicalExpertise(practitioner);
  const rawClinicalExpertise = practitioner.clinical_expertise || '';

  if (parsed.procedures) {
    weightedParts.push(parsed.procedures, parsed.procedures, parsed.procedures);
  }
  if (parsed.conditions) {
    weightedParts.push(parsed.conditions, parsed.conditions, parsed.conditions);
  }
  if (parsed.clinical_interests) {
    weightedParts.push(parsed.clinical_interests, parsed.clinical_interests);
  }
  if (rawClinicalExpertise && !parsed.procedures && !parsed.conditions && !parsed.clinical_interests) {
    weightedParts.push(rawClinicalExpertise, rawClinicalExpertise, rawClinicalExpertise);
  }
  
  // procedure_groups (×2.8) - IMPORTANT!
  const procedures = (practitioner.procedure_groups || [])
    .map(pg => pg.procedure_group_name)
    .join(' ');
  if (procedures) {
    weightedParts.push(procedures, procedures, procedures);
  }
  
  // specialty (×2.5)
  const specialty = practitioner.specialty || '';
  if (specialty) {
    weightedParts.push(specialty, specialty, specialty);
  }
  
  // specialty_description (×2)
  const specDesc = practitioner.specialty_description || '';
  if (specDesc) {
    weightedParts.push(specDesc, specDesc);
  }
  
  // description (×1.5)
  const description = practitioner.description || '';
  if (description) {
    weightedParts.push(description, description);
  }
  
  // Single weight fields
  weightedParts.push(
    practitioner.about || '',
    practitioner.name || '',
    practitioner.address_locality || '',
    (practitioner.memberships || []).join(' '),
    (practitioner.insuranceProviders || []).map(i => i.name).join(' '),
    practitioner.title || ''
  );
  
  return weightedParts.filter(Boolean).join(' ');
};

/**
 * Simple tokenizer
 */
const tokenize = (text) => {
  if (!text) return [];
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/) // Split on whitespace
    .filter(token => token.length > 2); // Filter out very short tokens
};

/**
 * Enhanced BM25 implementation with field weighting, quality boosting, and proximity
 * @param {Array} documents - Practitioners to rank
 * @param {string} query - Search query
 * @param {number} k1 - BM25 term frequency saturation parameter
 * @param {number} b - BM25 length normalization parameter
 * @param {Object} geocoded - Geocoded location info for proximity boost (optional)
 * @param {Object} semanticOptions - Optional semantic search configuration
 * @param {boolean} semanticOptions.enabled - Enable semantic scoring (default: false)
 * @param {number} semanticOptions.weight - Weight for semantic score (default: 0.3)
 * @param {Object} semanticOptions.scores - Pre-calculated semantic scores map
 */
const rankPractitionersBM25 = (documents, query, k1 = 1.5, b = 0.75, geocoded = null, semanticOptions = null) => {
  // console.log('\n\n'); // Debug log - commented for production
  // console.log('╔═══════════════════════════════════════════════════════════════╗'); // Debug log - commented for production
  // console.log('║              🎯 BM25 RANKING ENGINE STARTED                   ║'); // Debug log - commented for production
  // console.log('╚═══════════════════════════════════════════════════════════════╝'); // Debug log - commented for production
  // console.log('[BM25 Enhanced] Starting ranking process...'); // Debug log - commented for production
  // console.log('[BM25 Enhanced] 📄 Documents to rank:', documents?.length || 0); // Debug log - commented for production
  // console.log('[BM25 Enhanced] 🔍 Query:', query); // Debug log - commented for production
  // console.log('[BM25 Enhanced] ⚙️  Parameters: k1=' + k1 + ', b=' + b); // Debug log - commented for production
  
  // if (geocoded && geocoded.searchType === 'postcode') { // Debug log - commented for production
  //   console.log('[BM25 Enhanced] 📍 Proximity boost ENABLED for postcode:', geocoded.postcode);
  // } else if (geocoded) {
  //   console.log('[BM25 Enhanced] 📍 Proximity boost DISABLED (city search, not postcode)');
  // } else {
  //   console.log('[BM25 Enhanced] 📍 No proximity data provided');
  // }
  
  // Check if semantic scoring is enabled
  const semanticEnabled = semanticOptions?.enabled || false;
  const semanticWeight = semanticOptions?.weight || 0.3;
  const semanticScores = semanticOptions?.scores || {};
  const semanticScoresById = semanticOptions?.scoresById || {};
  
  // if (semanticEnabled) { // Debug log - commented for production
  //   console.log('[BM25 Enhanced] 🧠 Semantic scoring ENABLED');
  //   console.log('[BM25 Enhanced]    Weight:', semanticWeight);
  //   console.log('[BM25 Enhanced]    Scores available (name):', Object.keys(semanticScores).length);
  //   console.log('[BM25 Enhanced]    Scores available (id):', Object.keys(semanticScoresById).length);
  // } else {
  //   console.log('[BM25 Enhanced] 🧠 Semantic scoring DISABLED');
  // }
  // console.log('─'.repeat(65)); // Debug log - commented for production
  
  if (!documents || documents.length === 0 || !query) {
    return documents.map((doc, index) => ({ document: doc, score: 0, rank: index + 1 }));
  }

  // Tokenize query
  const queryTerms = tokenize(query.toLowerCase());
  
  if (queryTerms.length === 0) {
    return documents.map((doc, index) => ({ document: doc, score: 0, rank: index + 1 }));
  }

  // console.log('[BM25 Enhanced] Query terms:', queryTerms); // Debug log - commented for production

  // Create weighted searchable text for each practitioner
  const searchableTexts = documents.map(doc => createWeightedSearchableText(doc));
  
  // Tokenize all documents
  const tokenizedDocs = searchableTexts.map(text => tokenize(text.toLowerCase()));
  
  // Calculate average document length
  const avgDocLength = tokenizedDocs.reduce((sum, doc) => sum + doc.length, 0) / tokenizedDocs.length;
  
  // Calculate IDF for each query term
  const idfScores = {};
  queryTerms.forEach(term => {
    const docsContainingTerm = tokenizedDocs.filter(doc => doc.includes(term)).length;
    // IDF = log((N - df + 0.5) / (df + 0.5) + 1)
    // Clamp to non-negative: when term appears in all docs, IDF would be negative; use 0 so term doesn't help differentiate
    let idf = Math.log((documents.length - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1);
    idf = Math.max(0, idf);
    idfScores[term] = idf;
  });
  
  // console.log('[BM25 Enhanced] IDF scores:', idfScores); // Debug log - commented for production
  
  // Calculate BM25 score for each document
  const scoredDocuments = documents.map((doc, docIndex) => {
    const docTokens = tokenizedDocs[docIndex];
    const docLength = docTokens.length;
    
    // Base BM25 score
    let bm25Score = 0;
    queryTerms.forEach(term => {
      // Term frequency in document
      const tf = docTokens.filter(token => token === term).length;
      
      // BM25 formula
      const idf = idfScores[term] || 0;
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
      
      bm25Score += idf * (numerator / denominator);
    });
    
    // Apply quality boost (NOW with RELEVANT admission count!)
    const qualityBoost = calculateQualityBoost(doc, queryTerms);
    
    // Apply exact match bonus
    const exactMatchBonus = calculateExactMatchBonus(query, searchableTexts[docIndex]);
    
    // Calculate admission relevance for logging
    const admissionData = calculateRelevantAdmissionCount(doc, queryTerms);
    
    // Calculate proximity boost (only active for postcode searches)
    const proximityBoost = calculateProximityBoost(doc, geocoded);
    
    // Calculate semantic score if enabled
    let semanticScore = 0;
    if (semanticEnabled) {
      semanticScore = getSemanticScore(doc, semanticScores, semanticScoresById);
      
      // Debug logging for semantic scores
      // if (semanticScore > 0) { // Debug log - commented for production
      //   console.log(`[BM25 Enhanced] 🧠 Semantic match found: ${doc.name} = ${semanticScore.toFixed(3)}`);
      // }
    }
    
    // Calculate base BM25 score with boosts
    const baseBM25Score = (bm25Score * qualityBoost * proximityBoost) + exactMatchBonus;
    
    // Final score = BM25 score + (semantic score * weight)
    // This allows semantic scoring to enhance but not override BM25
    const finalScore = baseBM25Score + (semanticScore * semanticWeight);
    
    // Enhanced logging with proximity and semantic info
    const logParts = [
      `${doc.name}:`,
      `BM25=${bm25Score.toFixed(2)}`,
      `Quality=${qualityBoost.toFixed(2)}`,
      `Exact=${exactMatchBonus.toFixed(1)}`,
      `RelevantAdmissions=${admissionData.relevantAdmissions}/${admissionData.totalAdmissions}`
    ];
    
    // Only show proximity if it's active
    if (proximityBoost !== 1.0) {
      logParts.push(`Proximity=${proximityBoost.toFixed(2)} (${doc.distance?.toFixed(1)}mi)`);
    }
    
    // Only show semantic if it's enabled
    if (semanticEnabled) {
      logParts.push(`Semantic=${semanticScore.toFixed(2)}`);
    }
    
    logParts.push(`Final=${finalScore.toFixed(2)}`);
    
    // console.log(`[BM25 Enhanced] ${logParts.join(', ')}`); // Debug log - commented for production
    
    return {
      document: doc,
      score: finalScore,
      bm25Score: bm25Score,
      qualityBoost: qualityBoost,
      exactMatchBonus: exactMatchBonus,
      proximityBoost: proximityBoost,
      semanticScore: semanticScore,
      baseBM25Score: baseBM25Score,
      rank: 0 // Will be assigned after sorting
    };
  });
  
  // ========================================
  // MIN-MAX NORMALIZATION
  // ========================================
  // console.log('\n═══════════════════════════════════════════════════════════════'); // Debug log - commented for production
  // console.log('🔄 [NORMALIZATION] MIN-MAX NORMALIZATION STARTING'); // Debug log - commented for production
  // console.log('═══════════════════════════════════════════════════════════════'); // Debug log - commented for production
  // console.log(`[NORMALIZATION] Total documents to normalize: ${scoredDocuments.length}`); // Debug log - commented for production
  // console.log(`[NORMALIZATION] Semantic scoring enabled: ${semanticEnabled}`); // Debug log - commented for production
  // if (semanticEnabled) { // Debug log - commented for production
  //   console.log(`[NORMALIZATION] Semantic weight: ${semanticWeight}`);
  //   console.log(`[NORMALIZATION] Semantic scores available: ${Object.keys(semanticScores).length}`);
  // }
  // console.log('───────────────────────────────────────────────────────────────'); // Debug log - commented for production
  
  // Extract all base BM25 scores for normalization
  const allBaseBM25Scores = scoredDocuments.map(doc => doc.baseBM25Score);
  const minBM25 = Math.min(...allBaseBM25Scores);
  const maxBM25 = Math.max(...allBaseBM25Scores);
  
  // console.log(`[NORMALIZATION] 📊 BM25 Score Range (RAW):`); // Debug log - commented for production
  // console.log(`[NORMALIZATION]    Min: ${minBM25.toFixed(2)}`); // Debug log - commented for production
  // console.log(`[NORMALIZATION]    Max: ${maxBM25.toFixed(2)}`); // Debug log - commented for production
  // console.log(`[NORMALIZATION]    Spread: ${(maxBM25 - minBM25).toFixed(2)}`); // Debug log - commented for production
  
  // Extract all semantic scores for normalization (if semantic enabled)
  let minSemantic = 0;
  let maxSemantic = 1;
  
  if (semanticEnabled && Object.keys(semanticScores).length > 0) {
    const allSemanticScores = scoredDocuments.map(doc => doc.semanticScore);
    minSemantic = Math.min(...allSemanticScores);
    maxSemantic = Math.max(...allSemanticScores);
    
    // console.log(`[NORMALIZATION] 🧠 Semantic Score Range (RAW):`); // Debug log - commented for production
    // console.log(`[NORMALIZATION]    Min: ${minSemantic.toFixed(3)}`); // Debug log - commented for production
    // console.log(`[NORMALIZATION]    Max: ${maxSemantic.toFixed(3)}`); // Debug log - commented for production
    // console.log(`[NORMALIZATION]    Spread: ${(maxSemantic - minSemantic).toFixed(3)}`); // Debug log - commented for production
  }
  
  // Apply min-max normalization and recalculate final scores
  scoredDocuments.forEach(doc => {
    // Normalize BM25 score (0-1 range)
    const normalizedBM25 = (maxBM25 - minBM25) > 0 
      ? (doc.baseBM25Score - minBM25) / (maxBM25 - minBM25)
      : 1.0;  // Handle edge case of all same scores
    
    // Normalize semantic score (0-1 range)
    let normalizedSemantic = 0;
    if (semanticEnabled) {
      normalizedSemantic = (maxSemantic - minSemantic) > 0
        ? (doc.semanticScore - minSemantic) / (maxSemantic - minSemantic)
        : (doc.semanticScore > 0 ? 1.0 : 0);  // If all same, use 1.0 if non-zero
    }
    
    // Recalculate final score with normalized values
    // Using the same formula: normalizedBM25 + (normalizedSemantic * weight)
    const normalizedFinalScore = normalizedBM25 + (normalizedSemantic * semanticWeight);
    
    // Store normalized values
    doc.normalizedBM25 = normalizedBM25;
    doc.normalizedSemantic = normalizedSemantic;
    doc.score = normalizedFinalScore;  // Override with normalized score
    
    // Log normalized scores for transparency (top 10 only)
    // if (doc.document && scoredDocuments.indexOf(doc) < 10) { // Debug log - commented for production
    //   const logPrefix = semanticEnabled && doc.semanticScore > 0 ? '🧠' : '📊';
    //   console.log(`[NORMALIZATION] ${logPrefix} ${doc.document.name}:`);
    //   console.log(`               BM25: ${doc.baseBM25Score.toFixed(2)} → ${normalizedBM25.toFixed(3)}`);
    //   if (semanticEnabled) {
    //     console.log(`               Semantic: ${doc.semanticScore.toFixed(3)} → ${normalizedSemantic.toFixed(3)}`);
    //   }
    //   console.log(`               Final: ${normalizedFinalScore.toFixed(3)}`);
    // }
  });
  
  // console.log('───────────────────────────────────────────────────────────────'); // Debug log - commented for production
  // console.log(`[NORMALIZATION] ✅ Normalization complete!`); // Debug log - commented for production
  // console.log(`[NORMALIZATION] Final score range: 0.000 to ${(1 + semanticWeight).toFixed(3)}`); // Debug log - commented for production
  // console.log(`[NORMALIZATION] Documents normalized: ${scoredDocuments.length}`); // Debug log - commented for production
  // console.log('═══════════════════════════════════════════════════════════════\n'); // Debug log - commented for production
  
  // Sort by score (descending)
  scoredDocuments.sort((a, b) => b.score - a.score);
  
  // Assign ranks
  scoredDocuments.forEach((item, index) => {
    item.rank = index + 1;
  });
  
  // Enhanced ranking monitor
  // console.log('\n🎯 [RANKING MONITOR] Detailed Score Analysis:'); // Debug log - commented for production
  // console.log('='.repeat(80)); // Debug log - commented for production
  
  // scoredDocuments.slice(0, 10).forEach((item, idx) => { // Debug log - commented for production
  //   const doc = item.document;
  //   const admissionData = calculateRelevantAdmissionCount(doc, queryTerms);
  //   
  //   console.log(`\n📊 Rank ${idx + 1}: ${doc.name}`);
  //   console.log(`   🏥 Specialty: ${doc.specialty || 'Unknown'}`);
  //   console.log(`   📍 Location: ${doc.address_locality || 'Unknown'}`);
  //   console.log(`   ⭐ Rating: ${doc.rating || 'N/A'} (${doc.review_count || 0} reviews)`);
  //   console.log(`   🎯 Final Score (Normalized): ${item.score.toFixed(3)}`);
  //   console.log(`   📈 Raw Score Breakdown:`);
  //   console.log(`      • BM25 Base: ${item.bm25Score.toFixed(3)}`);
  //   console.log(`      • Quality Boost: ${item.qualityBoost.toFixed(3)}x`);
  //   console.log(`      • Exact Match: ${item.exactMatchBonus.toFixed(3)}`);
  //   console.log(`      • Combined BM25: ${item.baseBM25Score.toFixed(3)}`);
  //   console.log(`      • Relevant Procedures: ${admissionData.relevantAdmissions}/${admissionData.totalAdmissions}`);
  //   
  //   if (doc.distance !== undefined) {
  //     console.log(`      • Proximity: ${doc.distance.toFixed(1)} miles (${item.proximityBoost.toFixed(2)}x)`);
  //   }
  //   
  //   if (semanticEnabled) {
  //     console.log(`      • Semantic Score (raw): ${item.semanticScore.toFixed(3)}`);
  //   }
  //   
  //   console.log(`   🔄 Normalized Scores:`);
  //   console.log(`      • BM25 (normalized): ${item.normalizedBM25.toFixed(3)} [contributes: ${item.normalizedBM25.toFixed(3)}]`);
  //   if (semanticEnabled) {
  //     const semanticContribution = item.normalizedSemantic * semanticWeight;
  //     console.log(`      • Semantic (normalized): ${item.normalizedSemantic.toFixed(3)} [contributes: ${semanticContribution.toFixed(3)}]`);
  //   }
  //   
  //   // Show why this practitioner scored well
  //   const reasons = [];
  //   if (item.qualityBoost > 1.1) reasons.push('High Quality (ratings/reviews)');
  //   if (item.exactMatchBonus > 0) reasons.push('Exact Match Bonus');
  //   if (admissionData.relevantAdmissions > 0) reasons.push(`${admissionData.relevantAdmissions} Relevant Procedures`);
  //   if (doc.distance !== undefined && doc.distance < 10) reasons.push('Close Proximity');
  //   if (semanticEnabled && item.normalizedSemantic > 0.7) reasons.push('High Semantic Relevance');
  //   
  //   if (reasons.length > 0) {
  //     console.log(`   🎯 Why Ranked High: ${reasons.join(', ')}`);
  //   }
  // });
  
  // console.log('\n' + '='.repeat(80)); // Debug log - commented for production
  // console.log('╔═══════════════════════════════════════════════════════════════╗'); // Debug log - commented for production
  // console.log('║              ✅ BM25 RANKING COMPLETE                         ║'); // Debug log - commented for production
  // console.log('╚═══════════════════════════════════════════════════════════════╝'); // Debug log - commented for production
  // console.log(`📊 [RANKING SUMMARY] Total practitioners processed: ${scoredDocuments.length}`); // Debug log - commented for production
  // console.log(`🏆 [RANKING SUMMARY] Top score (normalized): ${scoredDocuments[0]?.score.toFixed(3) || 'N/A'}`); // Debug log - commented for production
  // console.log(`📈 [RANKING SUMMARY] Score range: ${scoredDocuments[scoredDocuments.length-1]?.score.toFixed(3) || 'N/A'} → ${scoredDocuments[0]?.score.toFixed(3) || 'N/A'}`); // Debug log - commented for production
  // console.log(`🎯 [RANKING SUMMARY] Winner: ${scoredDocuments[0]?.document?.name || 'Unknown'}`); // Debug log - commented for production
  // if (semanticEnabled) { // Debug log - commented for production
  //   console.log(`🧠 [RANKING SUMMARY] Semantic scoring was enabled (weight: ${semanticWeight})`);
  // }
  // if (geocoded && geocoded.searchType === 'postcode') { // Debug log - commented for production
  //   console.log(`📍 [RANKING SUMMARY] Proximity boost was active`);
  // }
  // console.log('═'.repeat(65)); // Debug log - commented for production
  // console.log('\n'); // Debug log - commented for production
  
  return scoredDocuments;
};

/**
 * Get top N practitioners from ranked results
 */
const getTopNPractitioners = (rankedResults, n = 10) => {
  return rankedResults.slice(0, n).map(result => result.document);
};

/**
 * Normalize medical query with equivalence-only aliasing (abbrev↔full, spelling variants).
 * Prevents query bloat by applying max 1-2 aliases.
 * @param {string} query - Raw query
 * @returns {{ normalizedQuery: string, aliasesApplied: string[], skipped: boolean }}
 */
const normalizeMedicalQuery = (query) => {
  if (!query || !query.trim()) {
    return { normalizedQuery: query || '', aliasesApplied: [], skipped: false };
  }
  const lowerQuery = query.toLowerCase();
  const aliasesApplied = [];
  const equivalenceMap = {
    'svt': ['supraventricular tachycardia'],
    'af': ['atrial fibrillation'],
    'afib': ['atrial fibrillation'],
    'ctca': ['ct coronary angiography'],
    'pci': ['percutaneous coronary intervention'],
    'tavi': ['transcatheter aortic valve implantation'],
    'icd': ['implantable cardioverter defibrillator'],
    'ischaemic': ['ischemic'],
    'ischemic': ['ischaemic'],
    'oesophageal': ['esophageal'],
    'esophageal': ['oesophageal'],
    'anaesthesia': ['anesthesia'],
    'anesthesia': ['anaesthesia'],
    'echo': {
      aliases: ['echocardiogram', 'echocardiography'],
      requiresContext: ['cardiac', 'heart', 'cardiology', 'cardiologist'],
      priority: 'low'
    }
  };
  const normalizeForMatching = (text) =>
    text.toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/-/g, ' ').trim();
  const normalizedQueryForMatching = normalizeForMatching(query);
  const queryWords = normalizedQueryForMatching.split(/\s+/).filter(w => w.length > 0);
  const hasCardiacContext = queryWords.some(word =>
    ['cardiac', 'heart', 'cardiology', 'cardiologist', 'cardio'].includes(word)
  );
  const matchedAliases = [];
  for (const [term, aliasConfig] of Object.entries(equivalenceMap)) {
    if (typeof aliasConfig === 'object' && aliasConfig.aliases) {
      if (aliasConfig.requiresContext && !hasCardiacContext) continue;
      const termRegex = new RegExp(`\\b${term}\\b`, 'i');
      if (termRegex.test(normalizedQueryForMatching)) {
        matchedAliases.push({
          term,
          aliases: aliasConfig.aliases,
          priority: aliasConfig.priority || 'normal'
        });
      }
    } else {
      const aliases = Array.isArray(aliasConfig) ? aliasConfig : [aliasConfig];
      const termRegex = new RegExp(`\\b${term}\\b`, 'i');
      if (termRegex.test(normalizedQueryForMatching)) {
        matchedAliases.push({ term, aliases, priority: 'normal' });
      }
    }
  }
  matchedAliases.sort((a, b) => {
    if (a.priority === 'low' && b.priority !== 'low') return 1;
    if (a.priority !== 'low' && b.priority === 'low') return -1;
    return b.term.length - a.term.length;
  });
  const aliasesToApply = matchedAliases.slice(0, 2);
  for (const match of aliasesToApply) {
    const aliasToAdd = Array.isArray(match.aliases) ? match.aliases[0] : match.aliases;
    aliasesApplied.push(aliasToAdd);
  }
  const normalizedQuery = aliasesApplied.length > 0 ? `${query} ${aliasesApplied.join(' ')}` : query;
  return { normalizedQuery, aliasesApplied, skipped: false };
};

/**
 * Medical query expansion - map searches to related terms (legacy).
 * Prefer normalizeMedicalQuery for equivalence-only aliasing when useEquivalenceNormalization is true.
 */
const expandMedicalQuery = (query) => {
  const lowerQuery = query.toLowerCase();
  const expansions = [];
  
  // Cardiac/Cardiology terms
  const cardiacMap = {
    'svt ablation': ['electrophysiology', 'cardiac ablation', 'arrhythmia', 'supraventricular tachycardia', 'ep study', 'catheter ablation', 'heart rhythm'],
    'afib': ['atrial fibrillation', 'electrophysiology', 'cardiac ablation', 'arrhythmia'],
    'heart rhythm': ['electrophysiology', 'arrhythmia', 'cardiac ablation', 'ep study'],
    'pacemaker': ['electrophysiology', 'cardiac device', 'heart rhythm'],
    'angioplasty': ['interventional cardiology', 'pci', 'coronary intervention', 'stent'],
    'heart attack': ['myocardial infarction', 'coronary artery disease', 'acute coronary syndrome'],
    
    // Gastro terms
    'colonoscopy': ['endoscopy', 'gastroenterology', 'bowel screening', 'colorectal'],
    'endoscopy': ['gastroscopy', 'gastroenterology', 'upper gi', 'digestive'],
    'ibs': ['irritable bowel syndrome', 'gastroenterology', 'digestive', 'bowel'],
    'crohns': ['inflammatory bowel disease', 'ibd', 'gastroenterology'],
    
    // Gynecology terms
    'endometriosis': ['gynecology', 'pelvic pain', 'laparoscopy', 'reproductive'],
    'fibroids': ['uterine fibroids', 'gynecology', 'myomectomy'],
    'fertility': ['ivf', 'reproductive', 'gynecology', 'infertility'],
    
    // Orthopedics
    'knee replacement': ['orthopedics', 'arthroplasty', 'joint replacement'],
    'hip replacement': ['orthopedics', 'arthroplasty', 'joint replacement'],
    'arthroscopy': ['orthopedics', 'joint surgery', 'keyhole surgery'],
    
    // General surgical
    'hernia': ['general surgery', 'laparoscopic surgery'],
    'gallbladder': ['cholecystectomy', 'laparoscopic surgery', 'general surgery'],
  };
  
  // Check if query matches any expansion terms
  for (const [term, relatedTerms] of Object.entries(cardiacMap)) {
    if (lowerQuery.includes(term)) {
      // console.log(`[BM25 Query Expansion] Detected "${term}" - adding related terms:`, relatedTerms); // Debug log - commented for production
      expansions.push(...relatedTerms);
    }
  }
  
  // Return original query + expansions
  if (expansions.length > 0) {
    return `${query} ${expansions.join(' ')}`;
  }
  
  return query;
};

/**
 * Main function to get shortlist with enhanced BM25 ranking
 * @param {Array} practitioners - List of practitioners to rank
 * @param {Object} filters - Search filters
 * @param {number} shortlistSize - Number of top practitioners to return
 * @param {Object} geocoded - Geocoded location info for proximity boost (optional)
 * @param {Object} semanticOptions - Semantic scoring options (optional)
 * @param {Object} options - Feature flags: useEquivalenceNormalization, separateQueryFromFilters, useTwoStageRetrieval (optional)
 */
const getBM25Shortlist = (practitioners, filters, shortlistSize = 10, geocoded = null, semanticOptions = null, options = {}) => {
  const useEquivalenceNormalization = options.useEquivalenceNormalization === true;
  const separateQueryFromFilters = options.separateQueryFromFilters === true;
  const useTwoStageRetrieval = options.useTwoStageRetrieval === true;
  const intent_terms = filters.intent_terms || [];
  const anchor_phrases = filters.anchor_phrases || filters.intentData?.anchor_phrases || [];
  const negative_terms = (filters.intentData && filters.intentData.negative_terms) || [];
  const hasIntentData = intent_terms.length > 0 || anchor_phrases.length > 0 || negative_terms.length > 0;
  // console.log('\n\n'); // Debug log - commented for production
  // console.log('╔═══════════════════════════════════════════════════════════════╗'); // Debug log - commented for production
  // console.log('║           🚀 BM25 SHORTLIST SERVICE CALLED                    ║'); // Debug log - commented for production
  // console.log('╚═══════════════════════════════════════════════════════════════╝'); // Debug log - commented for production
  // console.log('[BM25 Service] 📥 Input practitioners:', practitioners?.length || 0); // Debug log - commented for production
  // console.log('[BM25 Service] 🎯 Target shortlist size:', shortlistSize); // Debug log - commented for production
  // console.log('[BM25 Service] 🔧 Filters received:', JSON.stringify(filters, null, 2)); // Debug log - commented for production
  
  // if (geocoded) { // Debug log - commented for production
  //   console.log('[BM25 Service] 📍 Proximity data provided:', geocoded.searchType, '→', geocoded.city || geocoded.postcode);
  // } else {
  //   console.log('[BM25 Service] 📍 No proximity data');
  // }
  // 
  // if (semanticOptions?.enabled) { // Debug log - commented for production
  //   console.log('[BM25 Service] 🧠 Semantic options:', semanticOptions);
  // }
  // console.log('─'.repeat(65)); // Debug log - commented for production
  
  // 🎯 INSURANCE FILTER - Apply FIRST (most restrictive)
  // Hard filter: Only show practitioners who accept the specified insurance
  // console.log('\n[BM25 Service] 🔄 STARTING FILTER PIPELINE...'); // Debug log - commented for production
  let practitionersToRank = practitioners;
  
  if (filters.insurancePreference) {
    // console.log('[BM25 Service] 🏥 ➤ INSURANCE FILTER ACTIVE'); // Debug log - commented for production
    // console.log('[BM25 Service]    Insurance required:', filters.insurancePreference); // Debug log - commented for production
    // console.log('[BM25 Service]    Practitioners before filter:', practitionersToRank.length); // Debug log - commented for production
    
    practitionersToRank = filterByInsurance(practitionersToRank, filters.insurancePreference);
    
    // If no practitioners accept this insurance, return empty results
    if (practitionersToRank.length === 0) {
      console.warn('[BM25 Service] ⚠️ ❌ NO PRACTITIONERS ACCEPT THIS INSURANCE!');
      console.warn('[BM25 Service] Returning empty results.');
      return [];
    }
    
    // console.log('[BM25 Service] ✅ Insurance filter complete'); // Debug log - commented for production
    // console.log('[BM25 Service]    Practitioners after filter:', practitionersToRank.length); // Debug log - commented for production
    // console.log('[BM25 Service]    Filtered out:', practitioners.length - practitionersToRank.length, 'practitioners'); // Debug log - commented for production
  } else {
    // console.log('[BM25 Service] 🏥 ➤ No insurance filter (all practitioners included)'); // Debug log - commented for production
  }
  
  // 🎯 GENDER PREFERENCE FILTER - Apply SECOND
  // This ensures only practitioners matching the gender preference are ranked
  if (filters.genderPreference) {
    // console.log('\n[BM25 Service] 👤 ➤ GENDER FILTER ACTIVE'); // Debug log - commented for production
    // console.log('[BM25 Service]    Gender required:', filters.genderPreference); // Debug log - commented for production
    // console.log('[BM25 Service]    Practitioners before filter:', practitionersToRank.length); // Debug log - commented for production
    
    // eslint-disable-next-line no-unused-vars
    const beforeGenderFilter = practitionersToRank.length;
    practitionersToRank = filterByGenderPreference(practitionersToRank, filters.genderPreference);
    
    // If no practitioners match the gender preference, return empty results
    if (practitionersToRank.length === 0) {
      console.warn('[BM25 Service] ⚠️ ❌ NO PRACTITIONERS MATCH GENDER PREFERENCE!');
      console.warn('[BM25 Service] Returning empty results.');
      return [];
    }
    
    // console.log('[BM25 Service] ✅ Gender filter complete'); // Debug log - commented for production
    // console.log('[BM25 Service]    Practitioners after filter:', practitionersToRank.length); // Debug log - commented for production
    // console.log('[BM25 Service]    Filtered out:', beforeGenderFilter - practitionersToRank.length, 'practitioners'); // Debug log - commented for production
  } else {
    // console.log('\n[BM25 Service] 👤 ➤ No gender filter (all genders included)'); // Debug log - commented for production
  }

  // Optional filter conditions: patient_age_group, languages, gender (explicit field)
  if (filters.patient_age_group || (Array.isArray(filters.languages) && filters.languages.length > 0) || filters.gender) {
    practitionersToRank = applyFilterConditions(practitionersToRank, filters);
    if (practitionersToRank.length === 0) {
      console.warn('[BM25 Service] ⚠️ No practitioners match filter conditions (age/languages/gender).');
      return [];
    }
  }
  
  // console.log('\n[BM25 Service] ✅ FILTER PIPELINE COMPLETE'); // Debug log - commented for production
  // console.log('[BM25 Service] 📊 Total practitioners after all filters:', practitionersToRank.length); // Debug log - commented for production
  // console.log('[BM25 Service] 📊 Total filtered out:', practitioners.length - practitionersToRank.length); // Debug log - commented for production
  // console.log('─'.repeat(65)); // Debug log - commented for production
  
  // Build query from filters and user context
  let query;
  if (separateQueryFromFilters && (filters.q_patient != null || filters.searchQuery)) {
    // Two-stage style: q_patient + safe_lane_terms + name only (specialty/location already filtered)
    const qPatient = filters.q_patient || filters.searchQuery || '';
    const safeLaneTerms = (filters.safe_lane_terms || []).slice(0, 4);
    const parts = [qPatient, ...safeLaneTerms];
    if (filters.name) parts.push(filters.name);
    query = parts.filter(Boolean).join(' ');
  } else {
    const queryParts = [];
    if (filters.specialty) queryParts.push(filters.specialty);
    if (filters.location) queryParts.push(filters.location);
    if (filters.name) queryParts.push(filters.name);
    if (filters.insurance && filters.insurance.length > 0) {
      queryParts.push(
        filters.insurance.map(ins =>
          typeof ins === 'object' ? ins.displayName : ins
        ).join(' ')
      );
    }
    if (filters.searchQuery) queryParts.push(filters.searchQuery);
    query = queryParts.join(' ');
  }
  
  // Apply query normalization: equivalence-only (new) or legacy expansion
  if (useEquivalenceNormalization) {
    const normResult = normalizeMedicalQuery(query);
    query = normResult.normalizedQuery;
  } else {
    const expandedQuery = expandMedicalQuery(query);
    if (expandedQuery !== query) query = expandedQuery;
  }
  
  // console.log('[BM25 Service] Built query:', query); // Debug log - commented for production
  // console.log('[BM25 Service] Query length:', query.length); // Debug log - commented for production
  
  // Debug: Sample practitioner data to see what we're working with
  // if (practitionersToRank.length > 0) { // Debug log - commented for production
  //   const sample = practitionersToRank[0];
  //   console.log('[BM25 Service] Sample practitioner data:');
  //   console.log('  - Name:', sample.name);
  //   console.log('  - Title:', sample.title);
  //   console.log('  - Specialty:', sample.specialty);
  //   console.log('  - Clinical Expertise:', sample.clinical_expertise?.substring(0, 100) || 'N/A');
  //   console.log('  - Procedure Groups (with admissions):', 
  //     sample.procedure_groups?.slice(0, 3).map(pg => 
  //       `${pg.procedure_group_name} (×${pg.admission_count || 0} admissions)`
  //     ) || []
  //   );
  //   console.log('  - Total Admission Count:', sample.total_admission_count || 0);
  //   console.log('  - Procedure Types:', sample.procedure_count || 0);
  // }
  
  // If no query, return practitioners as-is with default scoring
  if (!query.trim()) {
    // console.log('[BM25 Service] Empty query, returning first', shortlistSize, 'practitioners'); // Debug log - commented for production
    return practitionersToRank.slice(0, shortlistSize).map((doc, index) => ({
      document: doc,
      score: practitionersToRank.length - index, // Simple descending score
      rank: index + 1
    }));
  }

  // Two-stage retrieval: Stage A (BM25 top N) → Stage B (rescoring with intent terms)
  if (useTwoStageRetrieval && hasIntentData) {
    const rc = getRankingConfig(filters);
    const stageATopN = Math.max(Number(rc.stage_a_top_n) || 0, Math.max(shortlistSize * 10, 50));
    const stageAResults = getBM25StageATopN(practitionersToRank, filters, stageATopN, geocoded);
    const parallelContext = {
      intent_terms,
      anchor_phrases,
      intentData: filters.intentData || {},
      rankingConfig: rc
    };
    const rescored = rescoreWithParallelContext(stageAResults, parallelContext);
    let topN = rescored.slice(0, shortlistSize);
    if (topN.length < shortlistSize && rescored.length > topN.length) {
      const zeroScoreProfiles = rescored.slice(topN.length)
        .filter(r => (r.score === 0 || (typeof r.score === 'number' && r.score <= 0)))
        .slice(0, shortlistSize - topN.length);
      topN = [...topN, ...zeroScoreProfiles];
    }
    return topN;
  }
  
  // Single-stage: Rank using enhanced BM25
  // console.log('[BM25 Service] Calling enhanced rankPractitionersBM25...'); // Debug log - commented for production
  const ranked = rankPractitionersBM25(practitionersToRank, query, 1.5, 0.75, geocoded, semanticOptions);
  
  // console.log('[BM25 Service] Ranked results:', ranked.length); // Debug log - commented for production
  
  // For logging, we need to tokenize the query again to calculate relevant admissions
  // const queryTermsForLogging = query.toLowerCase() // Debug log - commented for production
  //   .replace(/[^\w\s]/g, ' ')
  //   .split(/\s+/)
  //   .filter(token => token.length > 2);
  // 
  // console.log('[BM25 Service] Top 5 scores:', // Debug log - commented for production
  //   ranked.slice(0, 5).map(r => {
  //     const admissionData = calculateRelevantAdmissionCount(r.document, queryTermsForLogging);
  //     return {
  //       score: r.score.toFixed(2), 
  //       name: r.document?.name,
  //       specialty: r.document?.specialty,
  //       relevantAdmissions: `${admissionData.relevantAdmissions}/${admissionData.totalAdmissions}`,
  //       topProcedures: (r.document?.procedure_groups || [])
  //         .slice(0, 2)
  //         .map(pg => `${pg.procedure_group_name} (×${pg.admission_count || 0})`)
  //     };
  //   })
  // );
  
  // Return top N; ensure we return at least shortlistSize profiles even if many have 0 scores (important for progressive ranking)
  let topN = ranked.slice(0, shortlistSize);
  if (topN.length < shortlistSize && ranked.length > topN.length) {
    const zeroScoreProfiles = ranked.slice(topN.length)
      .filter(r => (r.score === 0 || (typeof r.score === 'number' && r.score <= 0)))
      .slice(0, shortlistSize - topN.length);
    topN = [...topN, ...zeroScoreProfiles];
  }
  
  // console.log('\n'); // Debug log - commented for production
  // console.log('╔═══════════════════════════════════════════════════════════════╗'); // Debug log - commented for production
  // console.log('║           ✅ BM25 SHORTLIST SERVICE COMPLETE                  ║'); // Debug log - commented for production
  // console.log('╚═══════════════════════════════════════════════════════════════╝'); // Debug log - commented for production
  // console.log('[BM25 Service] 📤 Returning top', topN.length, 'practitioners'); // Debug log - commented for production
  // console.log('[BM25 Service] 🏆 Top 3:'); // Debug log - commented for production
  // topN.slice(0, 3).forEach((item, idx) => { // Debug log - commented for production
  //   console.log(`[BM25 Service]    ${idx + 1}. ${item.document?.name} (score: ${item.score.toFixed(3)})`);
  // });
  // console.log('═'.repeat(65)); // Debug log - commented for production
  // console.log('\n\n'); // Debug log - commented for production
  
  return topN;
};

/**
 * Stage A only: BM25 retrieval with q_patient + safe_lane_terms + anchor_phrases, no rescoring.
 * Use when two-stage retrieval is enabled: Stage A returns top N candidates for Stage B rescoring.
 * @param {Array} practitioners - List of practitioners (already filtered by insurance/gender if needed)
 * @param {Object} filters - q_patient, searchQuery, safe_lane_terms, anchor_phrases, intent_terms, intentData, name, rankingConfig
 * @param {number} n - Number of top results to return (default 50)
 * @param {Object} geocoded - Geocoded location for proximity boost (optional)
 * @returns {Array<{ document, score, rank }>}
 */
const getBM25StageATopN = (practitioners, filters, n = 50, geocoded = null) => {
  const rc = getRankingConfig(filters);
  const q_patient = filters.q_patient || filters.searchQuery || '';
  const safe_lane_terms = (filters.safe_lane_terms || []).slice(0, 4);
  const q_bm25_parts = [q_patient, ...safe_lane_terms];
  if (filters.name) q_bm25_parts.push(filters.name);
  const q_bm25 = q_bm25_parts.filter(Boolean).join(' ');
  const normResult = normalizeMedicalQuery(q_bm25);
  let q_bm25_normalized = normResult.normalizedQuery;
  const anchor_phrases = filters.anchor_phrases || filters.intentData?.anchor_phrases || [];
  if (anchor_phrases.length > 0) {
    q_bm25_normalized = q_bm25_normalized + ' ' + anchor_phrases.join(' ');
  }
  const intent_terms_for_bm25 = filters.intent_terms || [];
  if (rc.intent_terms_in_bm25 && intent_terms_for_bm25.length > 0) {
    const cap = Math.min(rc.stage_a_intent_terms_cap || 10, intent_terms_for_bm25.length, 20);
    q_bm25_normalized = q_bm25_normalized + ' ' + intent_terms_for_bm25.slice(0, cap).join(' ');
  }
  let ranked = rankPractitionersBM25(practitioners, q_bm25_normalized, rc.k1, rc.b, geocoded, null);
  const result = ranked.slice(0, n);
  if (result.length < n && ranked.length > result.length) {
    const zeroScoreProfiles = ranked.slice(result.length)
      .filter(r => (r.score === 0 || (typeof r.score === 'number' && r.score <= 0)))
      .slice(0, n - result.length);
    result.push(...zeroScoreProfiles);
  }
  return result.map((item, idx) => ({ ...item, rank: idx + 1 }));
};

/**
 * Enhanced shortlist with additional context for LLM
 */
const getEnhancedShortlist = (practitioners, filters, shortlistSize = 10) => {
  const rankedResults = getBM25Shortlist(practitioners, filters, shortlistSize);
  
  return {
    shortlist: rankedResults.map(r => r.document),
    rankings: rankedResults.map(r => ({
      practitionerId: r.document.id,
      bm25Score: r.score,
      rank: r.rank
    })),
    filters: filters,
    totalCandidates: practitioners.length,
    shortlistSize: rankedResults.length
  };
};

/**
 * Get semantic score for a practitioner from pre-calculated scores
 * @param {Object} practitioner - Practitioner object
 * @param {Object} semanticScores - Map of practitioner names to semantic scores
 * @returns {number} Semantic relevance score (0-1)
 */
const getSemanticScore = (practitioner, semanticScores, semanticScoresById = {}) => {
  // Prefer exact ID match when available
  const id = practitioner?.practitioner_id;
  if (id && semanticScoresById && semanticScoresById[id] != null) {
    return Math.max(0, Math.min(1, semanticScoresById[id]));
  }
  if (!semanticScores || Object.keys(semanticScores).length === 0) {
    return 0;
  }
  
  // Try exact name match first
  let score = semanticScores[practitioner.name] || 0;
  
  // If no exact match, try fuzzy matching on name (partial matches)
  if (score === 0) {
    const practitionerName = practitioner.name?.toLowerCase() || '';
    for (const [semanticName, semanticScore] of Object.entries(semanticScores)) {
      const semanticNameLower = semanticName.toLowerCase();
      
      // Check for partial name matches (e.g., "Dr Michael Weider" matches "Michael Weider")
      if (practitionerName.includes(semanticNameLower) || semanticNameLower.includes(practitionerName)) {
        score = semanticScore;
        break;
      }
      
      // Check for last name matches (common in medical names)
      const practitionerLastName = practitionerName.split(' ').pop();
      const semanticLastName = semanticNameLower.split(' ').pop();
      if (practitionerLastName && semanticLastName && 
          (practitionerLastName.includes(semanticLastName) || semanticLastName.includes(practitionerLastName))) {
        score = semanticScore;
        break;
      }
    }
  }
  
  // If still no match, try specialty matching
  if (score === 0 && practitioner.specialty) {
    const specialty = practitioner.specialty.toLowerCase();
    for (const [key, value] of Object.entries(semanticScores)) {
      if (key.toLowerCase().includes(specialty) || specialty.includes(key.toLowerCase())) {
        score = value;
        break;
      }
    }
  }
  
  return Math.max(0, Math.min(1, score)); // Clamp to 0-1 range
};

/**
 * Enhanced BM25 with session context integration
 * When REACT_APP_USE_PARALLEL_RANKING=true and sessionId is set: uses parallel ranking
 * (two-stage BM25 with q_patient + rescoring). Otherwise uses legacy enriched-query + boost.
 */
const getBM25ShortlistWithSessionContext = async (
  practitioners,
  filters,
  shortlistSize = 10,
  geocoded = null,
  semanticOptions = null,
  sessionId = null
) => {
  const useParallel = USE_PARALLEL_RANKING && sessionId;

  if (useParallel) {
    try {
      const apiBase = process.env.REACT_APP_API_BASE_URL || '';
      const response = await fetch(`${apiBase}/api/get-parallel-session-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userQuery: filters.searchQuery || '',
          location: filters.location || null
        })
      });

      const data = await response.json();
      if (response.ok && data.success && data.q_patient != null) {
        const filtersWithQPatient = {
          ...filters,
          searchQuery: data.q_patient
        };
        const candidates = getBM25Shortlist(
          practitioners,
          filtersWithQPatient,
          PARALLEL_CANDIDATES,
          geocoded,
          semanticOptions
        );
        const parallelContext = {
          intent_terms: data.intent_terms || [],
          anchor_phrases: data.anchor_phrases || [],
          intentData: data.intentData || { negative_terms: [], likely_subspecialties: [], isQueryAmbiguous: true }
        };
        const rescored = rescoreWithParallelContext(candidates, parallelContext);
        return rescored.slice(0, shortlistSize);
      }
    } catch (error) {
      console.warn('[BM25 Service] Parallel ranking failed, falling back to legacy:', error.message);
    }
  }

  // Legacy path: analyze-session-context + enriched query + session boost
  let sessionContext = null;
  let enrichedQuery = filters.searchQuery || '';

  if (sessionId) {
    try {
      const apiBase = process.env.REACT_APP_API_BASE_URL || '';
      const response = await fetch(`${apiBase}/api/analyze-session-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userQuery: enrichedQuery
        })
      });

      const sessionData = await response.json();
      if (sessionData.success) {
        sessionContext = sessionData.sessionContext;
        enrichedQuery = sessionData.enrichedQuery;
      }
    } catch (error) {
      console.warn('[BM25 Service] Session context failed, using original query:', error.message);
    }
  }

  const enhancedFilters = { ...filters, searchQuery: enrichedQuery };
  const rankedResults = getBM25Shortlist(
    practitioners,
    enhancedFilters,
    shortlistSize,
    geocoded,
    semanticOptions
  );

  if (sessionContext && sessionContext.insights) {
    return rankedResults.map((result) => {
      const practitioner = result.document;
      const sessionBoost = calculateSessionQualityBoost(practitioner, sessionContext);
      const enhancedScore = result.score * sessionBoost;
      return {
        ...result,
        score: enhancedScore,
        sessionBoost,
        sessionContext: {
          urgency: sessionContext.insights.urgency,
          specialty: sessionContext.insights.specialty,
          symptoms: sessionContext.insights.symptoms
        }
      };
    });
  }

  return rankedResults;
};

/**
 * Calculate session-specific quality boost
 * NON-BREAKING: New function that doesn't modify existing code
 */
const calculateSessionQualityBoost = (practitioner, sessionContext) => {
  if (!sessionContext || !sessionContext.insights) {
    return 1.0;
  }

  const insights = sessionContext.insights;
  let boost = 1.0;
  const boostReasons = [];

  // Urgency-based boosts
  if (insights.urgency === 'urgent') {
    // Boost practitioners with high availability
    if (practitioner.availability === 'high') {
      boost *= 1.2;
      boostReasons.push('High Availability (Urgent)');
    }
    // Boost practitioners with emergency experience
    if (practitioner.emergency_experience) {
      boost *= 1.15;
      boostReasons.push('Emergency Experience');
    }
  }

  // Specialty matching boost
  if (insights.specialty && practitioner.specialty) {
    if (practitioner.specialty.toLowerCase().includes(insights.specialty.toLowerCase())) {
      boost *= 1.3;
      boostReasons.push(`Specialty Match: ${insights.specialty}`);
    }
  }

  // Location matching boost
  if (insights.location && practitioner.address_locality) {
    if (practitioner.address_locality.toLowerCase().includes(insights.location.toLowerCase())) {
      boost *= 1.2;
      boostReasons.push(`Location Match: ${insights.location}`);
    }
  }

  // Symptom-based boosts (if practitioner has relevant procedures)
  if (insights.symptoms && insights.symptoms.length > 0) {
    const relevantProcedures = practitioner.procedure_groups?.filter(pg => 
      insights.symptoms.some(symptom => 
        pg.procedure_group_name.toLowerCase().includes(symptom.toLowerCase())
      )
    ) || [];
    
    if (relevantProcedures.length > 0) {
      boost *= 1.15;
      boostReasons.push(`Symptom Match: ${relevantProcedures.length} relevant procedures`);
    }
  }

  // Log session boost details if significant
  if (boost > 1.1 && boostReasons.length > 0) {
      // console.log(`🎯 [SESSION BOOST] ${practitioner.name}: ${boost.toFixed(2)}x (${boostReasons.join(', ')})`); // Debug log - commented for production
  }

  return boost;
};

// ---------------------------------------------------------------------------
// Parallel ranking: two-stage BM25 + rescoring (intent/anchor/negative terms)
// ---------------------------------------------------------------------------

const PARALLEL_CANDIDATES = 50; // Retrieve top N from BM25 before rescoring
const USE_PARALLEL_RANKING = process.env.REACT_APP_USE_PARALLEL_RANKING === 'true';

/**
 * Rescore BM25 candidates using parallel session context (intent terms, anchor phrases, negative terms).
 * Weights are configurable via parallelContext.rankingConfig (defaults from DEFAULT_RANKING_CONFIG).
 * @param {Array<{ document, score }>} bm25Results - Candidates from BM25 (e.g. top 50)
 * @param {Object} parallelContext - { intent_terms, anchor_phrases, intentData: { negative_terms, likely_subspecialties, isQueryAmbiguous }, rankingConfig? }
 * @returns {Array<{ document, score, ... }>} Sorted by final score descending
 */
const rescoreWithParallelContext = (bm25Results, parallelContext) => {
  const intent_terms = parallelContext.intent_terms || [];
  const anchor_phrases = parallelContext.anchor_phrases || [];
  const intentData = parallelContext.intentData || {};
  const negative_terms = intentData.negative_terms || [];
  const likely_subspecialties = intentData.likely_subspecialties || [];
  const useRescoringAsPrimary = intentData.isQueryAmbiguous === true;
  const rc = parallelContext.rankingConfig
    ? { ...DEFAULT_RANKING_CONFIG, ...parallelContext.rankingConfig }
    : DEFAULT_RANKING_CONFIG;

  const hasRescoring = intent_terms.length > 0 || anchor_phrases.length > 0 || negative_terms.length > 0;
  if (!hasRescoring) {
    return bm25Results;
  }

  return bm25Results.map((result) => {
    const doc = result.document;
    const searchableText = createWeightedSearchableText(doc).toLowerCase();
    const bm25Score = result.score;

    let intentMatches = 0;
    intent_terms.forEach((term) => {
      if (searchableText.includes(term.toLowerCase())) intentMatches++;
    });

    let anchorMatches = 0;
    anchor_phrases.forEach((phrase) => {
      if (searchableText.includes(phrase.toLowerCase())) anchorMatches++;
    });

    let negativeMatches = 0;
    if (negative_terms.length > 0) {
      negativeMatches = negative_terms.filter((term) =>
        searchableText.includes(term.toLowerCase())
      ).length;
    }

    let subspecialtyBoost = 0;
    if (likely_subspecialties.length > 0) {
      const docSubspecialties = Array.isArray(doc.subspecialties)
        ? doc.subspecialties.map((s) => (typeof s === 'string' ? s : s.name || '').toLowerCase().trim())
        : [];
      likely_subspecialties.forEach((sub) => {
        if (!sub || !sub.name || typeof sub.confidence !== 'number') return;
        const nameLower = sub.name.toLowerCase().trim();
        const hasMatch = docSubspecialties.some(
          (ds) => ds === nameLower || ds.includes(nameLower) || nameLower.includes(ds)
        );
        if (hasMatch) subspecialtyBoost += sub.confidence * (rc.subspecialty_factor ?? 0.3);
      });
      subspecialtyBoost = Math.min(subspecialtyBoost, rc.subspecialty_cap ?? 0.5);
    }

    const intentDelta = intentMatches * (rc.intent_term_weight ?? 0.3);
    const anchorDelta = anchorMatches * (rc.anchor_phrase_weight ?? 0.5);
    let negativeDelta = 0;
    if (negativeMatches >= 4) negativeDelta = rc.negative_4 ?? -3.0;
    else if (negativeMatches >= 2) negativeDelta = rc.negative_2 ?? -2.0;
    else if (negativeMatches === 1) negativeDelta = rc.negative_1 ?? -1.0;

    const rescoringDelta = intentDelta + anchorDelta + negativeDelta + subspecialtyBoost;
    const finalScore = useRescoringAsPrimary
      ? Math.max(0, rescoringDelta)
      : Math.max(0, bm25Score + rescoringDelta);

    return {
      ...result,
      score: finalScore,
      bm25Score,
      rescoringInfo: {
        intentMatches,
        anchorMatches,
        negativeMatches,
        subspecialtyBoost
      }
    };
  }).sort((a, b) => b.score - a.score);
};

// ---------------------------------------------------------------------------
// V6 Progressive Ranking - Frontend wrapper
// ---------------------------------------------------------------------------

/**
 * Get progressive ranking V6 results
 * Calls the V6 Progressive Ranking API endpoint
 * 
 * @param {Array} practitioners - Array of practitioner objects
 * @param {Object} filters - Search filters
 * @param {string} sessionId - User session ID
 * @param {Object} options - V6 configuration options
 * @returns {Promise<Object>} Progressive ranking results with metadata
 */
const getProgressiveRankingV6 = async (practitioners, filters, sessionId, options = {}) => {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/progressive-ranking-v6`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        userQuery: filters.searchQuery || '',
        location: filters.location,
        practitioners,
        filters: {
          specialty: filters.specialty,
          insurancePreference: filters.insurancePreference,
          genderPreference: filters.genderPreference
        },
        options
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Progressive ranking failed');
    }
    
    return data;
  } catch (error) {
    console.error('[Progressive Ranking V6] Error:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// CommonJS exports for Node.js compatibility (dual export: ES6 + CommonJS)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getBM25Shortlist,
    getBM25StageATopN,
    rankPractitionersBM25,
    getRankingConfig,
    normalizeMedicalQuery,
    applyFilterConditions,
    getTopNPractitioners,
    getEnhancedShortlist,
    getBM25ShortlistWithSessionContext,
    getProgressiveRankingV6,
    DEFAULT_RANKING_CONFIG,
    // Helper functions (not exported in ES6, but available for testing)
    filterByInsurance,
    filterByGenderPreference,
    calculateRelevantAdmissionCount,
    calculateQualityBoost,
    calculateProximityBoost,
    calculateExactMatchBonus,
    createWeightedSearchableText,
    tokenize,
    parseClinicalExpertise,
    rescoreWithParallelContext
  };
}
