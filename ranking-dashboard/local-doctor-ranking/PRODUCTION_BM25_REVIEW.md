# Production BM25 Service Review

## Overview

This document reviews the production BM25 service (`bm25Service.js`) and compares it with the local implementation (`local-bm25-service.js`) to identify differences, improvements, and potential integration opportunities.

## Key Differences Summary

| Feature | Production (`bm25Service.js`) | Local (`local-bm25-service.js`) | Status |
|---------|------------------------------|--------------------------------|--------|
| **Gender Filtering** | ✅ Full implementation with pronoun inference | ❌ Not present | **Missing in local** |
| **Insurance Filtering** | ✅ Full implementation | ❌ Not present | **Missing in local** |
| **Proximity Boost** | ✅ Distance-based boost (1.0x - 1.6x) | ❌ Not present | **Missing in local** |
| **Semantic Scoring** | ✅ Integrated with min-max normalization | ❌ Not present | **Missing in local** |
| **Relevant Admission Count** | ✅ Smart matching (filters generic terms) | ⚠️ Simple procedure count | **Production is superior** |
| **Min-Max Normalization** | ✅ Normalizes BM25 + semantic scores | ❌ Not present | **Missing in local** |
| **Two-Stage Retrieval** | ⚠️ Basic (parallel ranking wrapper) | ✅ Full Stage A/B implementation | **Local is superior** |
| **Clinical Expertise Parsing** | ❌ Not present | ✅ Structured parsing (procedures/conditions/interests) | **Missing in production** |
| **Medical Query Normalization** | ⚠️ Basic expansion | ✅ Equivalence-only aliasing | **Local is superior** |
| **V5 Ideal Profile Matching** | ❌ Not present | ✅ Full implementation | **Missing in production** |
| **Configurable Rescoring** | ⚠️ Hardcoded weights | ✅ Tunable via `rankingConfig` | **Local is superior** |
| **IDF Fix** | ⚠️ Not visible (may be present) | ✅ Explicit `Math.max(0, idf)` | **Verify production** |

---

## Detailed Feature Comparison

### 1. Gender Filtering (`filterByGenderPreference`)

**Production:**
- Infers gender from title (Mr/Mrs/Ms/Miss)
- Falls back to pronoun analysis in bio/description
- Includes "unknown" genders (Dr/Prof) by default
- Well-tested logic with confidence thresholds

**Local:**
- Not implemented
- Would need to add for production parity

**Recommendation:** Add gender filtering to local implementation if needed for V6 or other ranking variants.

---

### 2. Insurance Filtering (`filterByInsurance`)

**Production:**
- Filters practitioners by insurance provider acceptance
- Supports multiple insurance name formats (`name`, `insurer_name`, `displayName`)
- Normalizes for case-insensitive matching
- Returns empty results if no matches (hard filter)

**Local:**
- Not implemented
- Would need practitioner data structure with `insuranceProviders` array

**Recommendation:** Add insurance filtering if V6 needs to respect insurance preferences.

---

### 3. Proximity Boost (`calculateProximityBoost`)

**Production:**
- Distance-based boost: 1.0x - 1.6x multiplier
- Only applies for postcode searches (not city searches)
- Tiers: ≤1mi (1.6x), ≤2mi (1.5x), ≤3mi (1.4x), ≤5mi (1.3x), etc.
- Requires `practitioner.distance` field

**Local:**
- Not implemented
- Would require geocoding/distance calculation

**Recommendation:** Consider adding if V6 needs location-aware ranking.

---

### 4. Semantic Scoring Integration

**Production:**
- Integrates semantic scores from external service
- Min-max normalization for both BM25 and semantic scores
- Final score: `normalizedBM25 + (normalizedSemantic * weight)`
- Supports both name-based and ID-based semantic score lookup
- Fuzzy matching for name variations

**Local:**
- Not implemented
- Would require semantic scoring service integration

**Recommendation:** Consider adding if semantic search improves V6 quality.

---

### 5. Relevant Admission Count (`calculateRelevantAdmissionCount`)

**Production:**
- **Smart matching algorithm** that filters generic terms
- Only counts procedures that match meaningful query terms
- Prevents false positives (e.g., gynecologist with 80 procedures ranking high for cardiac query)
- Returns `relevantAdmissions`, `totalAdmissions`, `relevanceRatio`

**Local:**
- Uses simple procedure count
- No relevance filtering

**Example Production Logic:**
```javascript
// Filters out generic terms like "surgical", "treatment", "procedure"
const genericTerms = new Set(['surgical', 'treatment', 'procedure', ...]);
const meaningfulTerms = queryTerms.filter(term => 
  !genericTerms.has(term.toLowerCase()) && term.length > 3
);

// Only counts procedures matching meaningful terms
const isRelevant = hasExactMatch || (matchingTermsCount >= 2 && isSpecificProcedure);
```

**Recommendation:** **CRITICAL** - This is a significant improvement. Consider porting to local implementation to improve quality boost accuracy.

---

### 6. Quality Boost (`calculateQualityBoost`)

**Production:**
- Uses **relevant admission count** (smart matching)
- Granular tiers: 150+ (2.5x), 100-149 (2.2x), 75-99 (2.0x), etc.
- Applies 15% penalty if practitioner has procedures but none are relevant

**Local:**
- Uses simple procedure count (no relevance filtering)
- Simpler boost tiers

**Recommendation:** Port relevant admission count logic to local implementation.

---

### 7. Min-Max Normalization

**Production:**
- Normalizes BM25 scores to 0-1 range
- Normalizes semantic scores to 0-1 range
- Combines: `normalizedBM25 + (normalizedSemantic * weight)`
- Handles edge cases (all same scores)

**Local:**
- No normalization
- Raw BM25 scores used directly

**Recommendation:** Consider adding normalization if combining multiple score types (BM25 + semantic + quality boost).

---

### 8. Two-Stage Retrieval (Stage A/B)

**Production:**
- Basic parallel ranking wrapper (`getBM25ShortlistWithSessionContext`)
- Calls external API for session context
- Rescoring via `rescoreWithParallelContext` (simpler than local)

**Local:**
- **Full two-stage implementation**
- Stage A: BM25 with `q_patient + safe_lane_terms + anchor_phrases`
- Stage B: Rescoring with `intent_terms`, `negative_terms`, `anchor_phrases`, `likely_subspecialties`
- Configurable via `rankingConfig`
- Supports two-query mode (patient query + intent-only query union)
- Supports V5 ideal profile matching

**Recommendation:** Local implementation is more advanced. Consider porting improvements to production.

---

### 9. Clinical Expertise Parsing

**Production:**
- No structured parsing
- Uses raw `clinical_expertise` field directly

**Local:**
- **Structured parsing** (`parseClinicalExpertise`)
- Extracts: `procedures`, `conditions`, `clinical_interests`
- Handles format: `"Procedure: X; Condition: Y; Clinical Interests: Z"`
- Falls back to raw field if parsing fails (handles BDA dietitians)

**Recommendation:** Production should adopt structured parsing for better field weighting.

---

### 10. Medical Query Normalization

**Production:**
- Basic `expandMedicalQuery` function
- Simple keyword-to-related-terms mapping
- No equivalence-only aliasing

**Local:**
- **Equivalence-only aliasing** (`normalizeMedicalQuery`)
- Abbrev ↔ full form (e.g., "svt" ↔ "supraventricular tachycardia")
- Spelling variants (e.g., "ischemic" ↔ "ischaemic")
- Context-dependent aliases (e.g., "echo" only expands with cardiac context)
- Alias cap (max 1-2 aliases to prevent query bloat)

**Recommendation:** Production should adopt equivalence-only normalization to prevent query bloat.

---

### 11. IDF Calculation Fix

**Production:**
- IDF calculation: `Math.log((documents.length - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1)`
- **No explicit clamping** to prevent negative IDF
- May have negative IDF when term appears in all documents

**Local:**
- **Explicit fix**: `idf = Math.max(0, idf);`
- Prevents negative IDF when term appears in all documents (common in filtered specialty searches)

**Recommendation:** **CRITICAL** - Production should add IDF clamping to prevent zero scores for filtered specialties.

---

### 12. Field Weighting

**Production:**
```javascript
const FIELD_WEIGHTS = {
  clinical_expertise: 3.0,
  procedure_groups: 2.8,
  specialty: 2.5,
  specialty_description: 2.0,
  description: 1.5,
  about: 1.0,
  // ...
};
```

**Local:**
```javascript
const FIELD_WEIGHTS = {
  expertise_procedures: 2.0,
  expertise_conditions: 2.0,
  expertise_interests: 1.5,
  clinical_expertise: 2.0, // Raw fallback
  procedure_groups: 2.8,
  specialty: 2.5,
  subspecialties: 2.2, // Additional field
  // ...
};
```

**Differences:**
- Local splits `clinical_expertise` into structured fields
- Local includes `subspecialties` field
- Production includes `specialty_description` (local removed it)

**Recommendation:** Align field weights and consider structured expertise parsing in production.

---

### 13. V5 Ideal Profile Matching

**Production:**
- Not implemented

**Local:**
- Full V5 implementation (`matchProfileAgainstIdeal`)
- Matches subspecialties, procedures, conditions, clinical expertise areas
- Weighted by importance (required/preferred/optional)
- Negative matching (avoid elements)

**Recommendation:** N/A (V5 is local-only feature)

---

### 14. Configurable Rescoring Weights

**Production:**
- Hardcoded weights in `rescoreWithParallelContext`
- `INTENT_TERM_WEIGHT = 0.3`, `ANCHOR_PHRASE_WEIGHT = 0.5`, etc.

**Local:**
- **Tunable via `rankingConfig`**
- `DEFAULT_RANKING_CONFIG` with all weights configurable
- Supports variant-specific overrides (e.g., `parallel-v2` uses stronger anchor weights)

**Recommendation:** Production should adopt configurable weights for easier tuning.

---

## Critical Issues Found

### 1. **IDF Calculation May Cause Zero Scores** ⚠️

**Production:**
```javascript
idfScores[term] = Math.log((documents.length - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1);
```

**Problem:** When a term appears in all documents (common in filtered specialty searches), IDF can become negative, leading to zero BM25 scores.

**Fix:** Add clamping:
```javascript
let idf = Math.log((documents.length - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1);
idf = Math.max(0, idf); // Prevent negative IDF
```

**Impact:** This was causing zero scores for dietitians when filtering by specialty. Production may have the same issue.

---

### 2. **Relevant Admission Count Not Used** ⚠️

**Production:** Uses smart relevant admission count for quality boost.

**Local:** Uses simple procedure count, which can cause false positives (e.g., gynecologist with 80 procedures ranking high for cardiac query).

**Impact:** Local quality boost may be less accurate than production.

---

### 3. **No Zero-Score Profile Handling** ⚠️

**Production:** `getBM25Shortlist` returns top N, but doesn't explicitly handle zero-score profiles.

**Local:** Has explicit handling to return requested count even if many have 0 scores (important for V6 fetching).

**Impact:** Production may return fewer results than requested if many profiles have zero scores.

---

## Recommendations

### High Priority

1. **Add IDF Clamping to Production**
   - Prevents zero scores for filtered specialties
   - Simple fix: `idf = Math.max(0, idf);`

2. **Port Relevant Admission Count Logic to Local**
   - Improves quality boost accuracy
   - Prevents false positives from generic procedure terms

3. **Add Zero-Score Profile Handling to Production**
   - Ensures `getBM25Shortlist` returns requested count
   - Important for progressive ranking scenarios

### Medium Priority

4. **Adopt Structured Clinical Expertise Parsing in Production**
   - Better field weighting
   - Handles both structured and unstructured data

5. **Adopt Equivalence-Only Query Normalization in Production**
   - Prevents query bloat
   - More precise than keyword expansion

6. **Add Configurable Rescoring Weights to Production**
   - Easier tuning without code changes
   - Supports A/B testing

### Low Priority

7. **Consider Adding Gender/Insurance Filtering to Local**
   - If V6 needs these filters
   - Production logic is well-tested

8. **Consider Adding Proximity Boost to Local**
   - If V6 needs location-aware ranking
   - Requires geocoding infrastructure

9. **Consider Adding Semantic Scoring to Local**
   - If semantic search improves V6 quality
   - Requires semantic scoring service

---

## Integration Opportunities

### For V6 Progressive Ranking

**Current State:**
- V6 uses `local-bm25-service.js` via `getBM25Shortlist` and `getBM25StageATopN`
- Works well but may benefit from production improvements

**Potential Improvements:**
1. **Relevant Admission Count**: Port smart matching logic to improve quality boost
2. **IDF Fix**: Already present in local, but verify production has it
3. **Zero-Score Handling**: Already present in local, but verify production has it

**Not Needed for V6:**
- Gender/Insurance filtering (V6 doesn't use these)
- Proximity boost (V6 doesn't use location)
- Semantic scoring (V6 uses LLM evaluation instead)

---

## Code Quality Observations

### Production Strengths
- ✅ Well-documented functions
- ✅ Comprehensive error handling
- ✅ Extensive debug logging (commented out)
- ✅ Production-ready features (filters, boosts)

### Production Weaknesses
- ⚠️ Hardcoded weights (not configurable)
- ⚠️ No IDF clamping (potential bug)
- ⚠️ Basic query expansion (not equivalence-only)
- ⚠️ No structured clinical expertise parsing

### Local Strengths
- ✅ Two-stage retrieval implementation
- ✅ Configurable weights
- ✅ Structured clinical expertise parsing
- ✅ Equivalence-only query normalization
- ✅ IDF fix applied
- ✅ Zero-score profile handling

### Local Weaknesses
- ⚠️ No gender/insurance filtering
- ⚠️ No proximity boost
- ⚠️ No semantic scoring
- ⚠️ Simple procedure count (not relevant admission count)

---

## Conclusion

The production BM25 service has several advanced features (gender/insurance filtering, proximity boost, semantic scoring) that are not present in the local implementation. However, the local implementation has superior two-stage retrieval logic, configurable weights, and better query normalization.

**Key Takeaway:** The production service would benefit from adopting:
1. IDF clamping fix
2. Relevant admission count logic (already present, but verify it's used correctly)
3. Structured clinical expertise parsing
4. Equivalence-only query normalization
5. Configurable rescoring weights

The local implementation would benefit from:
1. Relevant admission count logic (port from production)
2. Potentially gender/insurance filtering if needed for V6

Both implementations are production-ready but serve different use cases. The production service is optimized for user-facing search with filters and location awareness, while the local service is optimized for algorithmic ranking with two-stage retrieval and configurable weights.
