# Production Integration Plan: Local Ranking → Production

## Overview

This plan outlines how to integrate the local ranking implementation (two-stage retrieval, configurable weights, better query normalization) into the production BM25 service while preserving production features (insurance/gender filtering, proximity boost, semantic scoring).

---

## Goals

1. ✅ **Preserve Production Features**: Insurance/gender filtering, proximity boost, semantic scoring
2. ✅ **Add Local Improvements**: Two-stage retrieval (Stage A/B), configurable weights, equivalence-only query normalization
3. ✅ **Backward Compatibility**: Existing production code continues to work
4. ✅ **Gradual Migration**: Feature flags for gradual rollout
5. ✅ **Performance**: Maintain or improve performance

---

## Architecture Comparison

### Current Production Flow
```
getBM25Shortlist()
├── Filter Pipeline (Insurance → Gender)
├── Query Building (specialty + location + searchQuery)
├── Query Expansion (simple keyword mapping)
└── Single-Stage BM25 Ranking
    ├── BM25 Score
    ├── Quality Boost
    ├── Exact Match Bonus
    ├── Proximity Boost
    ├── Semantic Score
    └── Min-Max Normalization
```

### Local Flow (Target)
```
getBM25Shortlist()
├── Filter Pipeline (Insurance → Gender → Age/Languages)
├── Query Building (q_patient + safe_lane_terms)
├── Query Normalization (equivalence-only aliasing)
├── Stage A: BM25 Retrieval
│   ├── BM25 Score
│   ├── Quality Boost
│   ├── Exact Match Bonus
│   └── Proximity Boost (optional)
├── Stage B: Intent-Based Rescoring
│   ├── Intent Term Matches
│   ├── Anchor Phrase Matches
│   ├── Negative Term Penalties
│   ├── Subspecialty Boost
│   └── Safe-Lane Term Boost
└── Optional: Semantic Score Integration
```

### Integrated Flow (Proposed)
```
getBM25Shortlist()
├── Filter Pipeline (Insurance → Gender → Age/Languages)
├── Query Building (q_patient + safe_lane_terms)
├── Query Normalization (equivalence-only aliasing)
├── Stage A: BM25 Retrieval
│   ├── BM25 Score (with IDF clamping fix)
│   ├── Quality Boost (with relevant admission count)
│   ├── Exact Match Bonus
│   └── Proximity Boost (for postcode searches)
├── Stage B: Intent-Based Rescoring (if intent data available)
│   ├── Intent Term Matches
│   ├── Anchor Phrase Matches
│   ├── Negative Term Penalties
│   ├── Subspecialty Boost
│   └── Safe-Lane Term Boost
├── Semantic Score Integration (optional)
└── Min-Max Normalization (if semantic enabled)
```

---

## Integration Strategy

### Phase 1: Foundation (Week 1-2)

#### 1.1 Add IDF Clamping Fix
**Priority:** 🔴 Critical  
**Impact:** Prevents zero scores for filtered specialties

**Changes:**
```javascript
// In rankPractitionersBM25()
// BEFORE:
idfScores[term] = Math.log((documents.length - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1);

// AFTER:
let idf = Math.log((documents.length - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1);
idf = Math.max(0, idf); // Prevent negative IDF
idfScores[term] = idf;
```

**Files:** `bm25Service.js` (line 560)

---

#### 1.2 Port Relevant Admission Count Logic
**Priority:** 🔴 Critical  
**Impact:** Improves quality boost accuracy, prevents false positives

**Changes:**
- Port `calculateRelevantAdmissionCount()` from production
- Update `calculateQualityBoost()` to use relevant admission count
- Add generic term filtering

**Files:** `bm25Service.js` (lines 225-334)

**Note:** Production already has this, but verify it's being used correctly.

---

#### 1.3 Add Zero-Score Profile Handling
**Priority:** 🟡 Medium  
**Impact:** Ensures requested count is returned (important for progressive ranking)

**Changes:**
```javascript
// In getBM25Shortlist(), after ranking
let topN = ranked.slice(0, shortlistSize);
if (topN.length < shortlistSize && ranked.length > topN.length) {
  const zeroScoreProfiles = ranked.slice(topN.length)
    .filter(r => r.score === 0)
    .slice(0, shortlistSize - topN.length);
  topN = [...topN, ...zeroScoreProfiles];
}
```

**Files:** `bm25Service.js` (line 1036)

---

### Phase 2: Query Normalization (Week 2-3)

#### 2.1 Replace Query Expansion with Equivalence-Only Normalization
**Priority:** 🟡 Medium  
**Impact:** Prevents query bloat, more precise matching

**Changes:**
- Port `normalizeMedicalQuery()` from local
- Replace `expandMedicalQuery()` calls
- Add alias cap (max 1-2 aliases)

**Files:** `bm25Service.js` (lines 818-866)

**Backward Compatibility:**
- Keep `expandMedicalQuery()` as deprecated function
- Add feature flag: `useEquivalenceNormalization` (default: false initially)

---

#### 2.2 Separate Query Building from Filters
**Priority:** 🟡 Medium  
**Impact:** Better control over query construction

**Changes:**
- Don't include specialty/location in BM25 query (they're already filtered)
- Build query from: `q_patient` + `safe_lane_terms` + `name` only
- Add `q_patient` field to filters (if not present, use `searchQuery`)

**Files:** `bm25Service.js` (lines 951-976)

**Backward Compatibility:**
- If `filters.q_patient` not present, fall back to current behavior
- Feature flag: `separateQueryFromFilters` (default: false initially)

---

### Phase 3: Two-Stage Retrieval (Week 3-4)

#### 3.1 Add Stage A/B Structure
**Priority:** 🟢 High  
**Impact:** Better ranking control, adaptive strategy

**Changes:**
- Add `getBM25StageATopN()` function (port from local)
- Modify `getBM25Shortlist()` to support two-stage mode
- Add `rescoreWithIntentTerms()` function (port from local)

**Files:** 
- `bm25Service.js` (new functions)
- Keep existing `rankPractitionersBM25()` for Stage A

**Backward Compatibility:**
- Feature flag: `useTwoStageRetrieval` (default: false initially)
- If disabled, use current single-stage flow
- If enabled but no intent data, fall back to single-stage

---

#### 3.2 Add Configurable Rescoring Weights
**Priority:** 🟡 Medium  
**Impact:** Easier tuning, A/B testing support

**Changes:**
- Port `DEFAULT_RANKING_CONFIG` from local
- Port `getRankingConfig()` function
- Update `rescoreWithIntentTerms()` to use configurable weights

**Files:** `bm25Service.js` (new config object and function)

**Backward Compatibility:**
- If `filters.rankingConfig` not provided, use defaults
- Existing code continues to work

---

#### 3.3 Integrate Intent Data
**Priority:** 🟢 High  
**Impact:** Enables Stage B rescoring

**Changes:**
- Accept `intent_terms`, `anchor_phrases`, `negative_terms`, `likely_subspecialties` in filters
- Accept `safe_lane_terms` for parallel-v2 variant
- Accept `intentData.isQueryAmbiguous` for adaptive ranking

**Files:** `bm25Service.js` (update `getBM25Shortlist()` signature)

**Backward Compatibility:**
- All intent fields optional
- If not provided, skip Stage B rescoring

---

### Phase 4: Production Features Integration (Week 4-5)

#### 4.1 Preserve Insurance/Gender Filtering
**Priority:** 🔴 Critical  
**Impact:** Maintains production functionality

**Changes:**
- Keep existing `filterByInsurance()` and `filterByGenderPreference()`
- Apply BEFORE Stage A BM25 ranking
- Ensure filters work with two-stage flow

**Files:** `bm25Service.js` (lines 895-944)

**No changes needed** - already works correctly.

---

#### 4.2 Integrate Proximity Boost
**Priority:** 🟡 Medium  
**Impact:** Maintains location-aware ranking

**Changes:**
- Keep existing `calculateProximityBoost()`
- Apply in Stage A BM25 ranking (before rescoring)
- Ensure it works with two-stage flow

**Files:** `bm25Service.js` (lines 345-376, 594)

**No changes needed** - already works correctly.

---

#### 4.3 Integrate Semantic Scoring
**Priority:** 🟡 Medium  
**Impact:** Maintains semantic search capability

**Changes:**
- Keep existing `getSemanticScore()` and semantic integration
- Apply semantic score AFTER Stage B rescoring (if enabled)
- Keep min-max normalization for semantic scores

**Files:** `bm25Service.js` (lines 1078-1126, 597-612, 690-712)

**Modification:**
- Apply semantic score after Stage B rescoring (not before)
- Normalize Stage B scores + semantic scores together

---

### Phase 5: Enhanced Features (Week 5-6)

#### 5.1 Add Structured Clinical Expertise Parsing
**Priority:** 🟢 Low  
**Impact:** Better field weighting

**Changes:**
- Port `parseClinicalExpertise()` from local
- Update `createWeightedSearchableText()` to use structured parsing
- Fall back to raw field if parsing fails

**Files:** `bm25Service.js` (update `createWeightedSearchableText()`)

---

#### 5.2 Add Filter Conditions (Age/Languages)
**Priority:** 🟢 Low  
**Impact:** Supports more filter types

**Changes:**
- Port `applyFilterConditions()` from local
- Add to filter pipeline (after gender filter)
- Support `patient_age_group`, `languages` filters

**Files:** `bm25Service.js` (new function)

---

## Implementation Details

### New Function Signatures

```javascript
// Enhanced getBM25Shortlist with two-stage support
export const getBM25Shortlist = (
  practitioners, 
  filters, 
  shortlistSize = 10, 
  geocoded = null, 
  semanticOptions = null,
  options = {}
) => {
  // options.useTwoStageRetrieval = true/false (default: false)
  // options.useEquivalenceNormalization = true/false (default: false)
  // options.separateQueryFromFilters = true/false (default: false)
  
  // ... implementation
};

// New: Stage A only (for progressive ranking)
export const getBM25StageATopN = (
  practitioners,
  filters,
  n = 50,
  geocoded = null
) => {
  // ... implementation
};

// New: Rescoring function
export const rescoreWithIntentTerms = (
  bm25Results,
  intent_terms,
  negative_terms,
  anchor_phrases,
  likely_subspecialties,
  safe_lane_terms,
  useRescoringScoreAsPrimary,
  rankingConfig,
  idealProfile = null
) => {
  // ... implementation
};

// New: Ranking config
export const getRankingConfig = (filters) => {
  // Returns DEFAULT_RANKING_CONFIG merged with filters.rankingConfig
};

// New: Query normalization
export const normalizeMedicalQuery = (query) => {
  // Returns { normalizedQuery, aliasesApplied, skipped }
};
```

---

### Filter Object Structure

```javascript
filters = {
  // Existing production filters
  insurancePreference: string | null,
  genderPreference: string | null,
  specialty: string | null,
  location: string | null,
  name: string | null,
  insurance: array | null,
  searchQuery: string | null,
  
  // New: Two-stage retrieval
  q_patient: string | null,              // Clean patient query (if not provided, use searchQuery)
  safe_lane_terms: array,                 // High-confidence symptom/condition terms
  intent_terms: array,                    // Intent classification terms
  anchor_phrases: array,                  // High-value phrases
  intentData: {
    negative_terms: array,                // Wrong subspecialty terms
    likely_subspecialties: array,         // Inferred subspecialties with confidence
    isQueryAmbiguous: boolean,            // Query clarity flag
    idealProfile: object | null           // V5 ideal profile (optional)
  },
  
  // New: Filter conditions
  patient_age_group: string | null,
  languages: array | null,
  
  // New: Ranking config
  rankingConfig: {
    // Override default weights
    high_signal_1: number,
    high_signal_2: number,
    pathway_1: number,
    pathway_2: number,
    pathway_3: number,
    anchor_per_match: number,
    anchor_cap: number,
    negative_1: number,
    negative_2: number,
    negative_4: number,
    stage_a_top_n: number,
    k1: number,
    b: number,
    // ... etc
  },
  
  // New: Variant name
  variantName: 'parallel' | 'parallel-v2' | 'v5' | null
};
```

---

### Feature Flags

```javascript
const FEATURE_FLAGS = {
  // Phase 1
  USE_IDF_CLAMPING: true,                    // Always enabled (bug fix)
  USE_RELEVANT_ADMISSION_COUNT: true,        // Always enabled (improvement)
  HANDLE_ZERO_SCORE_PROFILES: true,          // Always enabled (bug fix)
  
  // Phase 2
  USE_EQUIVALENCE_NORMALIZATION: false,       // Gradual rollout
  SEPARATE_QUERY_FROM_FILTERS: false,         // Gradual rollout
  
  // Phase 3
  USE_TWO_STAGE_RETRIEVAL: false,            // Gradual rollout
  USE_CONFIGURABLE_WEIGHTS: true,            // Always enabled (no breaking change)
  
  // Phase 4
  PRESERVE_PRODUCTION_FEATURES: true,        // Always enabled
  
  // Phase 5
  USE_STRUCTURED_EXPERTISE_PARSING: false,   // Gradual rollout
  USE_FILTER_CONDITIONS: false               // Gradual rollout
};
```

---

## Migration Path

### Step 1: Add New Functions (Non-Breaking)
- Add `getBM25StageATopN()`, `rescoreWithIntentTerms()`, `normalizeMedicalQuery()`, etc.
- Keep existing functions unchanged
- **No breaking changes**

### Step 2: Enable Bug Fixes (Non-Breaking)
- Enable IDF clamping, relevant admission count, zero-score handling
- **No breaking changes** - improves accuracy

### Step 3: Add Feature Flags (Non-Breaking)
- Add feature flags to `getBM25Shortlist()`
- Default to current behavior (flags = false)
- **No breaking changes**

### Step 4: Gradual Rollout
- Enable features for specific use cases (e.g., V6 progressive ranking)
- Monitor performance and accuracy
- Gradually enable for all use cases

### Step 5: Make Default (Potentially Breaking)
- After validation, make two-stage retrieval default
- Update documentation
- **Breaking change** - but only after validation

---

## Testing Strategy

### Unit Tests
- Test each function independently
- Test backward compatibility
- Test edge cases (empty arrays, missing fields, etc.)

### Integration Tests
- Test full flow with production filters
- Test two-stage retrieval with intent data
- Test semantic scoring integration
- Test progressive ranking (V6) integration

### Performance Tests
- Compare single-stage vs two-stage performance
- Measure query normalization overhead
- Measure rescoring overhead

### A/B Tests
- Compare old vs new ranking for same queries
- Measure quality metrics (click-through rate, conversion, etc.)
- Gradual rollout with monitoring

---

## Rollout Plan

### Week 1-2: Foundation
- ✅ Add IDF clamping fix
- ✅ Port relevant admission count
- ✅ Add zero-score handling
- **Status:** Non-breaking, can deploy immediately

### Week 2-3: Query Normalization
- ⚠️ Add equivalence-only normalization (feature flag: off)
- ⚠️ Separate query from filters (feature flag: off)
- **Status:** Non-breaking, test internally

### Week 3-4: Two-Stage Retrieval
- ⚠️ Add Stage A/B functions (feature flag: off)
- ⚠️ Add configurable weights (always enabled, no breaking change)
- **Status:** Non-breaking, test internally

### Week 4-5: Production Features
- ✅ Verify insurance/gender filtering works
- ✅ Verify proximity boost works
- ✅ Verify semantic scoring works
- **Status:** No changes needed

### Week 5-6: Enhanced Features
- ⚠️ Add structured expertise parsing (feature flag: off)
- ⚠️ Add filter conditions (feature flag: off)
- **Status:** Non-breaking, test internally

### Week 6+: Gradual Rollout
- Enable features for V6 progressive ranking
- Monitor performance and quality
- Gradually enable for all use cases
- Make two-stage retrieval default (after validation)

---

## Backward Compatibility Guarantees

### Guaranteed Compatible
- ✅ Existing `getBM25Shortlist()` calls continue to work
- ✅ Existing filter objects continue to work
- ✅ Insurance/gender filtering continues to work
- ✅ Proximity boost continues to work
- ✅ Semantic scoring continues to work

### New Features (Opt-In)
- ⚠️ Two-stage retrieval: Requires `intent_terms` in filters
- ⚠️ Equivalence normalization: Requires feature flag
- ⚠️ Structured expertise parsing: Requires feature flag

### Breaking Changes (Future)
- ❌ None planned in initial rollout
- ⚠️ Future: May make two-stage retrieval default (after validation)

---

## Code Structure

### Proposed File Structure

```
bm25Service.js (Production)
├── Filter Functions
│   ├── filterByInsurance()
│   ├── filterByGenderPreference()
│   └── applyFilterConditions() [NEW]
│
├── Query Functions
│   ├── normalizeMedicalQuery() [NEW]
│   ├── expandMedicalQuery() [DEPRECATED]
│   └── buildQuery() [NEW]
│
├── BM25 Core Functions
│   ├── rankPractitionersBM25() [MODIFIED: IDF fix]
│   ├── createWeightedSearchableText() [MODIFIED: structured parsing]
│   ├── tokenize()
│   └── calculateRelevantAdmissionCount() [VERIFY EXISTS]
│
├── Boost Functions
│   ├── calculateQualityBoost() [MODIFIED: relevant admission count]
│   ├── calculateExactMatchBonus()
│   ├── calculateProximityBoost()
│   └── getSemanticScore()
│
├── Two-Stage Functions [NEW]
│   ├── getBM25StageATopN()
│   ├── rescoreWithIntentTerms()
│   └── getRankingConfig()
│
├── Main Functions
│   ├── getBM25Shortlist() [MODIFIED: two-stage support]
│   ├── getBM25ShortlistWithSessionContext() [MODIFIED]
│   └── getEnhancedShortlist()
│
└── Config
    └── DEFAULT_RANKING_CONFIG [NEW]
```

---

## Example Usage

### Current Production Usage (Still Works)
```javascript
const results = getBM25Shortlist(
  practitioners,
  {
    specialty: "Cardiologist",
    location: "London",
    searchQuery: "chest pain",
    insurancePreference: "Bupa",
    genderPreference: "male"
  },
  10,
  { searchType: "postcode", postcode: "SW1A 1AA" },
  { enabled: true, weight: 0.3, scores: {...} }
);
```

### New Two-Stage Usage (Opt-In)
```javascript
const results = getBM25Shortlist(
  practitioners,
  {
    q_patient: "chest pain",
    safe_lane_terms: ["chest pain", "angina"],
    intent_terms: ["coronary artery disease", "ischemic heart disease"],
    anchor_phrases: ["chest pain clinic"],
    intentData: {
      negative_terms: ["pediatric", "children"],
      likely_subspecialties: [{ name: "Cardiology", confidence: 0.9 }],
      isQueryAmbiguous: false
    },
    insurancePreference: "Bupa",
    genderPreference: "male",
    rankingConfig: {
      anchor_per_match: 0.25,
      anchor_cap: 0.75
    },
    variantName: "parallel-v2"
  },
  10,
  { searchType: "postcode", postcode: "SW1A 1AA" },
  { enabled: true, weight: 0.3, scores: {...} },
  {
    useTwoStageRetrieval: true,
    useEquivalenceNormalization: true,
    separateQueryFromFilters: true
  }
);
```

---

## Risk Assessment

### Low Risk (Can Deploy Immediately)
- ✅ IDF clamping fix
- ✅ Relevant admission count (verify exists)
- ✅ Zero-score handling
- ✅ Configurable weights (no breaking change)

### Medium Risk (Test First)
- ⚠️ Equivalence-only normalization
- ⚠️ Two-stage retrieval
- ⚠️ Structured expertise parsing

### High Risk (Requires Careful Testing)
- 🔴 Making two-stage retrieval default
- 🔴 Changing query building logic

---

## Success Metrics

### Quality Metrics
- Click-through rate (CTR)
- Conversion rate
- User satisfaction scores
- Relevance ratings

### Performance Metrics
- Query latency (p50, p95, p99)
- Memory usage
- CPU usage

### Accuracy Metrics
- Precision@K (top K results)
- Recall@K
- NDCG (Normalized Discounted Cumulative Gain)

---

## Implementation Status (Completed)

The following has been implemented in `bm25Service.js`:

- **Phase 1:** IDF clamping in `rankPractitionersBM25`; zero-score profile handling in `getBM25Shortlist` return path.
- **Phase 2:** `normalizeMedicalQuery` (equivalence-only aliasing); `getBM25Shortlist(..., options)` with `useEquivalenceNormalization` and `separateQueryFromFilters`; query building from `q_patient` + `safe_lane_terms` when `separateQueryFromFilters` is true.
- **Phase 3:** `DEFAULT_RANKING_CONFIG`, `getRankingConfig`, `getBM25StageATopN`; `rescoreWithParallelContext` updated to use configurable weights via `parallelContext.rankingConfig`.
- **Phase 4:** Two-stage path in `getBM25Shortlist`: when `options.useTwoStageRetrieval === true` and intent data is present, Stage A (`getBM25StageATopN`) → Stage B (`rescoreWithParallelContext`) → return top N with zero-score handling.
- **Phase 5:** `applyFilterConditions` (patient_age_group, languages, gender) in filter pipeline; `parseClinicalExpertise` and structured `createWeightedSearchableText` with fallback to raw `clinical_expertise`.

**Exports added:** `getBM25StageATopN`, `getRankingConfig`, `DEFAULT_RANKING_CONFIG`, `normalizeMedicalQuery`, `applyFilterConditions`.

**Backward compatibility:** Existing calls to `getBM25Shortlist(practitioners, filters, shortlistSize, geocoded, semanticOptions)` behave as before (single-stage, legacy query expansion). Opt-in via sixth argument: `getBM25Shortlist(..., { useEquivalenceNormalization: true, separateQueryFromFilters: true, useTwoStageRetrieval: true })`.

---

## Conclusion

This integration plan provides a **gradual, non-breaking migration path** from production's single-stage ranking to local's two-stage ranking while preserving all production features. The phased approach allows for careful testing and validation before full rollout.

**Key Benefits:**
- ✅ Backward compatible
- ✅ Feature flags for gradual rollout
- ✅ Preserves production features
- ✅ Adds local improvements
- ✅ Clear migration path

**Next Steps:**
1. Review and approve plan
2. Start Phase 1 (Foundation)
3. Test internally
4. Gradual rollout
