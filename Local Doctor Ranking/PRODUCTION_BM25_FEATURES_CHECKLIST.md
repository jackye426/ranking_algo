# Production BM25 Service - Feature Checklist

Use this checklist to cherry-pick features from `bm25Service.js` to integrate into your local implementation.

---

## 🔍 Filtering Features

### 1. Gender Filtering (`filterByGenderPreference`)
**Location:** Lines 160-201  
**What it does:** Filters practitioners by gender preference (male/female/any)
- Infers gender from title (Mr/Mrs/Ms/Miss)
- Falls back to pronoun analysis in bio/description
- Includes "unknown" genders (Dr/Prof) by default
- **Dependencies:** `inferGenderFromPronouns`, `inferGenderFromTitle`

**Functions needed:**
- `inferGenderFromPronouns(text)` - Lines 17-42
- `inferGenderFromTitle(practitioner)` - Lines 49-95
- `filterByGenderPreference(practitioners, genderPreference)` - Lines 160-201

**Data requirements:** Practitioner objects with `title`, `description`, `about`, `clinical_expertise`, `specialty_description`

---

### 2. Insurance Filtering (`filterByInsurance`)
**Location:** Lines 103-152  
**What it does:** Filters practitioners who accept a specific insurance provider
- Hard filter: returns empty if no matches
- Supports multiple insurance name formats
- Case-insensitive matching with normalization

**Function:** `filterByInsurance(practitioners, insurancePreference)` - Lines 103-152

**Data requirements:** Practitioner objects with `insuranceProviders` array containing objects with `name`, `insurer_name`, or `displayName`

---

## 📊 Scoring & Boosting Features

### 3. Relevant Admission Count (`calculateRelevantAdmissionCount`)
**Location:** Lines 225-284  
**What it does:** Smart matching for procedure relevance (prevents false positives)
- Filters out generic terms (surgical, treatment, procedure, etc.)
- Only counts procedures matching meaningful query terms
- Returns `relevantAdmissions`, `totalAdmissions`, `hasRelevantProcedures`, `relevanceRatio`

**Function:** `calculateRelevantAdmissionCount(practitioner, queryTerms)` - Lines 225-284

**Key logic:**
- Filters generic terms: `['surgical', 'treatment', 'procedure', 'surgery', ...]`
- Only counts procedures with exact match OR (multiple terms + specific procedure name)
- Prevents gynecologist with 80 procedures ranking high for cardiac query

**Dependencies:** None (standalone function)

---

### 4. Enhanced Quality Boost (`calculateQualityBoost`)
**Location:** Lines 290-334  
**What it does:** Quality boost using **relevant admission count** (not total count)
- Uses `calculateRelevantAdmissionCount` for smart matching
- Granular tiers: 150+ (2.5x), 100-149 (2.2x), 75-99 (2.0x), 50-74 (1.7x), etc.
- Applies 15% penalty if practitioner has procedures but none are relevant

**Function:** `calculateQualityBoost(practitioner, queryTerms)` - Lines 290-334

**Dependencies:** `calculateRelevantAdmissionCount`

**Differences from local:**
- Local uses simple procedure count
- Production uses relevant admission count (smarter)

---

### 5. Proximity Boost (`calculateProximityBoost`)
**Location:** Lines 345-376  
**What it does:** Distance-based boost for postcode searches
- Only applies for postcode searches (not city searches)
- Tiers: ≤1mi (1.6x), ≤2mi (1.5x), ≤3mi (1.4x), ≤5mi (1.3x), ≤8mi (1.2x), etc.
- Requires `practitioner.distance` field

**Function:** `calculateProximityBoost(practitioner, geocoded)` - Lines 345-376

**Data requirements:**
- `practitioner.distance` (number in miles)
- `geocoded` object with `searchType: 'postcode'`

**Dependencies:** None (standalone function)

---

### 6. Exact Match Bonus (`calculateExactMatchBonus`)
**Location:** Lines 381-403  
**What it does:** Bonus for exact phrase matches
- Full query match: +2.0
- Multi-word phrases: +1.0 per phrase

**Function:** `calculateExactMatchBonus(query, text)` - Lines 381-403

**Dependencies:** `extractMultiWordPhrases` (Lines 408-421)

**Note:** Local implementation has similar logic, but production version is slightly different.

---

## 🧠 Advanced Features

### 7. Semantic Scoring Integration
**Location:** Lines 518-612, 1078-1126  
**What it does:** Integrates semantic scores with BM25 scores
- Min-max normalization for both BM25 and semantic scores
- Final score: `normalizedBM25 + (normalizedSemantic * weight)`
- Supports name-based and ID-based lookup
- Fuzzy matching for name variations

**Functions:**
- `getSemanticScore(practitioner, semanticScores, semanticScoresById)` - Lines 1078-1126
- Integration in `rankPractitionersBM25` - Lines 597-612, 690-712

**Dependencies:** External semantic scoring service

**Data requirements:**
- `semanticOptions.enabled` (boolean)
- `semanticOptions.weight` (number, default 0.3)
- `semanticOptions.scores` (object: name -> score)
- `semanticOptions.scoresById` (object: id -> score)

---

### 8. Min-Max Normalization
**Location:** Lines 651-729  
**What it does:** Normalizes BM25 and semantic scores to 0-1 range
- Prevents score scale mismatches
- Handles edge cases (all same scores)
- Combines normalized scores: `normalizedBM25 + (normalizedSemantic * weight)`

**Implementation:** Lines 690-712 in `rankPractitionersBM25`

**Dependencies:** Semantic scoring (optional)

**Note:** Only needed if combining multiple score types (BM25 + semantic + quality boost)

---

## 🔧 Query Processing Features

### 9. Medical Query Expansion (`expandMedicalQuery`)
**Location:** Lines 818-866  
**What it does:** Expands medical queries with related terms
- Maps procedures to related terms (e.g., "svt ablation" → "electrophysiology", "arrhythmia")
- Covers cardiac, gastro, gynecology, orthopedics, general surgical terms

**Function:** `expandMedicalQuery(query)` - Lines 818-866

**Dependencies:** None (standalone function)

**Note:** Local has `normalizeMedicalQuery` which is more sophisticated (equivalence-only aliasing). Production version is simpler keyword expansion.

---

## 📦 Integration Features

### 10. Session Context Integration (`getBM25ShortlistWithSessionContext`)
**Location:** Lines 1133-1236  
**What it does:** Integrates BM25 with session context analysis
- Supports parallel ranking (two-stage BM25 + rescoring)
- Falls back to legacy enriched query + session boost
- Calls external API for session context

**Function:** `getBM25ShortlistWithSessionContext(...)` - Lines 1133-1236

**Dependencies:** 
- External API endpoints
- `rescoreWithParallelContext` (Lines 1323-1398)
- `calculateSessionQualityBoost` (Lines 1242-1301)

**Note:** Local has better two-stage implementation. This is production's wrapper.

---

### 11. Parallel Ranking Rescoring (`rescoreWithParallelContext`)
**Location:** Lines 1323-1398  
**What it does:** Rescores BM25 results using parallel session context
- Intent term matches: +0.3 per match
- Anchor phrase matches: +0.5 per match
- Negative term penalties: -1.0, -2.0, -3.0 (1, 2, 4+ matches)
- Subspecialty boost: confidence-weighted, capped at 0.5

**Function:** `rescoreWithParallelContext(bm25Results, parallelContext)` - Lines 1323-1398

**Dependencies:** `createWeightedSearchableText`

**Note:** Local has `rescoreWithIntentTerms` which is more configurable.

---

### 12. Session Quality Boost (`calculateSessionQualityBoost`)
**Location:** Lines 1242-1301  
**What it does:** Session-specific quality boost based on urgency, specialty, location, symptoms
- Urgency-based boosts (high availability, emergency experience)
- Specialty matching boost: 1.3x
- Location matching boost: 1.2x
- Symptom-based boosts (relevant procedures)

**Function:** `calculateSessionQualityBoost(practitioner, sessionContext)` - Lines 1242-1301

**Dependencies:** None (standalone function)

**Data requirements:** `sessionContext.insights` with `urgency`, `specialty`, `location`, `symptoms`

---

### 13. V6 Progressive Ranking Wrapper (`getProgressiveRankingV6`)
**Location:** Lines 1414-1451  
**What it does:** Frontend wrapper for V6 Progressive Ranking API
- Calls `/api/progressive-ranking-v6` endpoint
- Handles errors and response parsing

**Function:** `getProgressiveRankingV6(practitioners, filters, sessionId, options)` - Lines 1414-1451

**Dependencies:** External API endpoint

**Note:** You already have V6 implementation locally. This is just a frontend wrapper.

---

## 🐛 Bug Fixes

### 14. IDF Clamping Fix
**Location:** Not present in production (potential bug)  
**What it does:** Prevents negative IDF when term appears in all documents

**Current production code (Line 560):**
```javascript
idfScores[term] = Math.log((documents.length - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1);
```

**Recommended fix:**
```javascript
let idf = Math.log((documents.length - docsContainingTerm + 0.5) / (docsContainingTerm + 0.5) + 1);
idf = Math.max(0, idf); // Prevent negative IDF
idfScores[term] = idf;
```

**Impact:** Prevents zero scores for filtered specialties (e.g., dietitians when filtering by specialty)

**Status:** ⚠️ **VERIFY** if production has this fix or needs it

---

## 📋 Quick Reference: What to Port

### High Value Features (Recommended)
- ✅ **Relevant Admission Count** (#3) - Prevents false positives
- ✅ **Enhanced Quality Boost** (#4) - Uses relevant admission count
- ✅ **IDF Clamping Fix** (#14) - Prevents zero scores

### Medium Value Features (Consider)
- ⚠️ **Gender Filtering** (#1) - If V6 needs gender preference
- ⚠️ **Insurance Filtering** (#2) - If V6 needs insurance filtering
- ⚠️ **Proximity Boost** (#5) - If V6 needs location-aware ranking
- ⚠️ **Semantic Scoring** (#7) - If semantic search improves quality

### Low Value Features (Skip)
- ❌ **Medical Query Expansion** (#9) - Local has better `normalizeMedicalQuery`
- ❌ **Session Context Integration** (#10) - Local has better two-stage implementation
- ❌ **V6 Wrapper** (#13) - You already have V6 locally

---

## 🎯 Recommended Porting Order

1. **IDF Clamping Fix** (#14) - Critical bug fix
2. **Relevant Admission Count** (#3) - Improves quality boost accuracy
3. **Enhanced Quality Boost** (#4) - Uses relevant admission count
4. **Gender/Insurance Filtering** (#1, #2) - If needed for V6
5. **Proximity Boost** (#5) - If needed for location-aware ranking
6. **Semantic Scoring** (#7) - If semantic search improves quality

---

## 📝 Integration Notes

### For Each Feature:
1. **Check dependencies** - Some features depend on others
2. **Verify data structure** - Ensure practitioners have required fields
3. **Test edge cases** - Empty arrays, missing fields, etc.
4. **Update field weights** - If adding new fields to `createWeightedSearchableText`

### Common Dependencies:
- `createWeightedSearchableText` - Used by most scoring functions
- `tokenize` - Used by BM25 ranking
- Practitioner data structure - Must have required fields

---

## 🔗 Function Dependencies Graph

```
rankPractitionersBM25
├── createWeightedSearchableText
├── tokenize
├── calculateQualityBoost
│   └── calculateRelevantAdmissionCount
├── calculateExactMatchBonus
│   └── extractMultiWordPhrases
├── calculateProximityBoost (optional)
└── getSemanticScore (optional)

getBM25Shortlist
├── filterByInsurance (optional)
├── filterByGenderPreference (optional)
│   ├── inferGenderFromTitle
│   └── inferGenderFromPronouns
├── expandMedicalQuery
└── rankPractitionersBM25
    └── (see above)

getBM25ShortlistWithSessionContext
├── getBM25Shortlist
└── rescoreWithParallelContext
    └── createWeightedSearchableText
```

---

## ✅ Checklist Template

Copy this to track what you want to port:

```markdown
## Features to Port

- [ ] 1. Gender Filtering (`filterByGenderPreference`)
- [ ] 2. Insurance Filtering (`filterByInsurance`)
- [ ] 3. Relevant Admission Count (`calculateRelevantAdmissionCount`)
- [ ] 4. Enhanced Quality Boost (`calculateQualityBoost`)
- [ ] 5. Proximity Boost (`calculateProximityBoost`)
- [ ] 6. Exact Match Bonus (`calculateExactMatchBonus`)
- [ ] 7. Semantic Scoring Integration
- [ ] 8. Min-Max Normalization
- [ ] 9. Medical Query Expansion (`expandMedicalQuery`)
- [ ] 10. Session Context Integration
- [ ] 11. Parallel Ranking Rescoring
- [ ] 12. Session Quality Boost
- [ ] 13. V6 Progressive Ranking Wrapper
- [ ] 14. IDF Clamping Fix
```

---

## 📚 Code Locations Reference

| Feature | Start Line | End Line | File |
|---------|-----------|----------|------|
| Gender Filtering | 17 | 201 | `bm25Service.js` |
| Insurance Filtering | 103 | 152 | `bm25Service.js` |
| Relevant Admission Count | 225 | 284 | `bm25Service.js` |
| Enhanced Quality Boost | 290 | 334 | `bm25Service.js` |
| Proximity Boost | 345 | 376 | `bm25Service.js` |
| Exact Match Bonus | 381 | 421 | `bm25Service.js` |
| Semantic Scoring | 518-612, 1078-1126 | - | `bm25Service.js` |
| Min-Max Normalization | 651 | 729 | `bm25Service.js` |
| Medical Query Expansion | 818 | 866 | `bm25Service.js` |
| Session Context Integration | 1133 | 1236 | `bm25Service.js` |
| Parallel Rescoring | 1323 | 1398 | `bm25Service.js` |
| Session Quality Boost | 1242 | 1301 | `bm25Service.js` |
| V6 Wrapper | 1414 | 1451 | `bm25Service.js` |
