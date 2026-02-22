# Production BM25 Service - Complete Flow Rundown

## Overview

The production BM25 service (`bm25Service.js`) implements a **single-stage ranking** system with hard filters, query expansion, BM25 scoring, multiple boosts, and optional semantic scoring integration.

**Main Entry Point:** `getBM25Shortlist(practitioners, filters, shortlistSize, geocoded, semanticOptions)`

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ENTRY POINT: getBM25Shortlist()                           │
│    Input: practitioners[], filters{}, shortlistSize,         │
│           geocoded{}, semanticOptions{}                      │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. FILTER PIPELINE (Hard Filters - Applied BEFORE ranking) │
│                                                              │
│    ┌──────────────────────────────────────────┐             │
│    │ 2a. Insurance Filter (FIRST)            │             │
│    │     filterByInsurance()                 │             │
│    │     • Hard filter: removes non-matching │             │
│    │     • Returns [] if no matches          │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 2b. Gender Filter (SECOND)               │             │
│    │     filterByGenderPreference()           │             │
│    │     • Infers gender from title/bio       │             │
│    │     • Includes "unknown" (Dr/Prof)       │             │
│    │     • Returns [] if no matches           │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    Result: practitionersToRank[] (filtered list)            │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. QUERY BUILDING                                            │
│                                                              │
│    queryParts = []                                           │
│    • filters.specialty                                       │
│    • filters.location                                        │
│    • filters.name                                            │
│    • filters.insurance (displayName)                         │
│    • filters.searchQuery                                     │
│                                                              │
│    query = queryParts.join(' ')                              │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. QUERY EXPANSION                                           │
│                                                              │
│    expandMedicalQuery(query)                                 │
│    • Maps medical terms to related terms                     │
│    • Examples:                                               │
│      - "svt ablation" → + "electrophysiology", "arrhythmia" │
│      - "afib" → + "atrial fibrillation", "cardiac ablation" │
│      - "colonoscopy" → + "endoscopy", "gastroenterology"     │
│                                                              │
│    Result: expandedQuery                                     │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. BM25 RANKING: rankPractitionersBM25()                    │
│                                                              │
│    ┌──────────────────────────────────────────┐             │
│    │ 5a. PREPROCESSING                        │             │
│    │     • Tokenize query → queryTerms[]       │             │
│    │     • Create weighted searchable text    │             │
│    │       for each practitioner               │             │
│    │     • Tokenize all documents              │             │
│    │     • Calculate avgDocLength              │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5b. IDF CALCULATION                     │             │
│    │     For each query term:                 │             │
│    │     • Count docs containing term         │             │
│    │     • IDF = log((N - df + 0.5) /        │             │
│    │                 (df + 0.5) + 1)          │             │
│    │     ⚠️ NO CLAMPING (potential bug)       │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5c. BM25 SCORE CALCULATION               │             │
│    │     For each document:                   │             │
│    │     • Calculate TF (term frequency)      │             │
│    │     • BM25 = Σ IDF × (TF × (k1+1)) /    │             │
│    │               (TF + k1 × (1-b + b×       │             │
│    │               (docLength/avgDocLength)))  │             │
│    │     • k1 = 1.5, b = 0.75 (defaults)     │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5d. QUALITY BOOST                        │             │
│    │     calculateQualityBoost(doc,           │             │
│    │                           queryTerms)     │             │
│    │     • Rating boost: 4.8+ (1.3x),         │             │
│    │       4.5+ (1.2x), 4.0+ (1.1x)           │             │
│    │     • Review count boost: 100+ (1.2x),   │             │
│    │       50+ (1.15x), 20+ (1.1x)            │             │
│    │     • Experience boost: 20yr+ (1.15x),   │             │
│    │       10yr+ (1.1x)                        │             │
│    │     • Verification boost: 1.1x            │             │
│    │     • RELEVANT admission count boost:    │             │
│    │       - Uses calculateRelevantAdmission   │             │
│    │         Count() for smart matching        │             │
│    │       - Tiers: 150+ (2.5x), 100+ (2.2x), │             │
│    │         75+ (2.0x), 50+ (1.7x), etc.     │             │
│    │       - Penalty: 0.85x if has procedures │             │
│    │         but none are relevant             │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5e. EXACT MATCH BONUS                    │             │
│    │     calculateExactMatchBonus(query,      │             │
│    │                               text)       │             │
│    │     • Full query match: +2.0             │             │
│    │     • Multi-word phrases: +1.0 each       │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5f. PROXIMITY BOOST (Optional)           │             │
│    │     calculateProximityBoost(doc,         │             │
│    │                             geocoded)     │             │
│    │     • Only for postcode searches         │             │
│    │     • Distance tiers:                    │             │
│    │       ≤1mi: 1.6x, ≤2mi: 1.5x,           │             │
│    │       ≤3mi: 1.4x, ≤5mi: 1.3x, etc.      │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5g. SEMANTIC SCORE (Optional)           │             │
│    │     getSemanticScore(doc,                │             │
│    │                      semanticScores,      │             │
│    │                      semanticScoresById) │             │
│    │     • Looks up pre-calculated scores     │             │
│    │     • Fuzzy name matching                │             │
│    │     • Returns 0-1 score                  │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5h. COMBINE SCORES                        │             │
│    │     baseBM25Score = (bm25Score ×         │             │
│    │                       qualityBoost ×      │             │
│    │                       proximityBoost) +   │             │
│    │                      exactMatchBonus      │             │
│    │     finalScore = baseBM25Score +          │             │
│    │                  (semanticScore ×        │             │
│    │                   semanticWeight)         │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5i. MIN-MAX NORMALIZATION                │             │
│    │     • Normalize baseBM25Score to 0-1     │             │
│    │     • Normalize semanticScore to 0-1     │             │
│    │     • Recalculate:                      │             │
│    │       normalizedFinalScore =             │             │
│    │         normalizedBM25 +                 │             │
│    │         (normalizedSemantic × weight)    │             │
│    │     • Override doc.score                 │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    ┌──────────────────────────────────────────┐             │
│    │ 5j. SORT & RANK                          │             │
│    │     • Sort by score (descending)         │             │
│    │     • Assign rank (1, 2, 3, ...)        │             │
│    └──────────────┬──────────────────────────┘             │
│                   │                                          │
│                   ▼                                          │
│    Result: scoredDocuments[] (ranked list)                  │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. RETURN TOP N                                             │
│                                                              │
│    topN = ranked.slice(0, shortlistSize)                    │
│    Return: topN[]                                           │
└──────────────────────────────────────────────────────────────┘
```

---

## Detailed Step-by-Step Flow

### Step 1: Entry Point
**Function:** `getBM25Shortlist(practitioners, filters, shortlistSize, geocoded, semanticOptions)`

**Parameters:**
- `practitioners`: Array of practitioner objects
- `filters`: Object with `insurancePreference`, `genderPreference`, `specialty`, `location`, `name`, `insurance`, `searchQuery`
- `shortlistSize`: Number of results to return (default: 10)
- `geocoded`: Optional object with `searchType` ('postcode' or 'city'), `postcode`, `city`
- `semanticOptions`: Optional object with `enabled`, `weight`, `scores`, `scoresById`

---

### Step 2: Filter Pipeline

#### 2a. Insurance Filter (FIRST)
**Function:** `filterByInsurance(practitioners, insurancePreference)`

**Logic:**
- If no `insurancePreference`, return all practitioners
- Filter practitioners where `insuranceProviders` array contains matching insurance
- Matching: case-insensitive, supports `name`, `insurer_name`, `displayName`
- **Hard filter**: Returns empty array if no matches

**Returns:** Filtered practitioner array or `[]` if no matches

---

#### 2b. Gender Filter (SECOND)
**Function:** `filterByGenderPreference(practitioners, genderPreference)`

**Logic:**
- If no `genderPreference` or 'any', return all practitioners
- For each practitioner:
  1. Infer gender from title (Mr → male, Mrs/Ms/Miss → female)
  2. If title is Dr/Prof, infer from pronouns in bio/description
  3. Include "unknown" genders (Dr/Prof) by default
- **Hard filter**: Returns empty array if no matches

**Returns:** Filtered practitioner array or `[]` if no matches

---

### Step 3: Query Building

**Logic:**
```javascript
queryParts = []
if (filters.specialty) queryParts.push(filters.specialty)
if (filters.location) queryParts.push(filters.location)
if (filters.name) queryParts.push(filters.name)
if (filters.insurance) queryParts.push(insurance.displayName)
if (filters.searchQuery) queryParts.push(filters.searchQuery)

query = queryParts.join(' ')
```

**Note:** Specialty and location are included in the query (not just filters). This means they're weighted in BM25 scoring.

---

### Step 4: Query Expansion

**Function:** `expandMedicalQuery(query)`

**Logic:**
- Maps medical terms to related terms
- Examples:
  - "svt ablation" → adds "electrophysiology", "arrhythmia", "cardiac ablation", etc.
  - "afib" → adds "atrial fibrillation", "electrophysiology", "cardiac ablation"
  - "colonoscopy" → adds "endoscopy", "gastroenterology", "bowel screening"
- Returns original query + expansions

**Note:** This is simple keyword expansion, not equivalence-only aliasing (local has better `normalizeMedicalQuery`).

---

### Step 5: BM25 Ranking

**Function:** `rankPractitionersBM25(documents, query, k1, b, geocoded, semanticOptions)`

#### 5a. Preprocessing
- Tokenize query: `queryTerms = tokenize(query.toLowerCase())`
- Create weighted searchable text for each practitioner:
  - `clinical_expertise` × 3
  - `procedure_groups` × 3
  - `specialty` × 3
  - `specialty_description` × 2
  - `description` × 2
  - `about`, `name`, `address_locality`, `memberships`, `title`, `insuranceProviders` × 1
- Tokenize all documents
- Calculate average document length

#### 5b. IDF Calculation
```javascript
For each query term:
  docsContainingTerm = count of documents containing term
  idf = log((documents.length - docsContainingTerm + 0.5) / 
            (docsContainingTerm + 0.5) + 1)
  idfScores[term] = idf
```

**⚠️ Issue:** No clamping to prevent negative IDF when term appears in all documents.

#### 5c. BM25 Score Calculation
```javascript
For each document:
  bm25Score = 0
  For each query term:
    tf = term frequency in document
    idf = idfScores[term]
    numerator = tf × (k1 + 1)
    denominator = tf + k1 × (1 - b + b × (docLength / avgDocLength))
    bm25Score += idf × (numerator / denominator)
```

**Parameters:** `k1 = 1.5`, `b = 0.75` (defaults)

#### 5d. Quality Boost
**Function:** `calculateQualityBoost(practitioner, queryTerms)`

**Multipliers:**
- Rating: 4.8+ (1.3x), 4.5+ (1.2x), 4.0+ (1.1x)
- Reviews: 100+ (1.2x), 50+ (1.15x), 20+ (1.1x)
- Experience: 20yr+ (1.15x), 10yr+ (1.1x)
- Verified: 1.1x

**Relevant Admission Count Boost:**
- Uses `calculateRelevantAdmissionCount()` for smart matching
- Filters generic terms (surgical, treatment, procedure, etc.)
- Only counts procedures matching meaningful query terms
- Tiers:
  - 150+ admissions: 2.5x
  - 100-149: 2.2x
  - 75-99: 2.0x
  - 50-74: 1.7x
  - 30-49: 1.5x
  - 20-29: 1.4x
  - 10-19: 1.3x
  - 5-9: 1.2x
  - 1-4: 1.1x
- Penalty: 0.85x if has procedures but none are relevant

**Final:** `boost = ratingBoost × reviewBoost × experienceBoost × verifiedBoost × admissionBoost`

#### 5e. Exact Match Bonus
**Function:** `calculateExactMatchBonus(query, text)`

**Bonuses:**
- Full query match: +2.0
- Multi-word phrases (2-3 words): +1.0 each

**Additive** (not multiplicative)

#### 5f. Proximity Boost
**Function:** `calculateProximityBoost(practitioner, geocoded)`

**Conditions:**
- Only applies if `geocoded.searchType === 'postcode'`
- Requires `practitioner.distance` (number in miles)

**Tiers:**
- ≤1mi: 1.6x
- ≤2mi: 1.5x
- ≤3mi: 1.4x
- ≤5mi: 1.3x
- ≤8mi: 1.2x
- ≤12mi: 1.1x
- ≤18mi: 1.05x
- >18mi: 1.0x (no boost)

**Multiplicative** (applied to BM25 score)

#### 5g. Semantic Score
**Function:** `getSemanticScore(practitioner, semanticScores, semanticScoresById)`

**Logic:**
- Prefers ID match (`semanticScoresById[practitioner.practitioner_id]`)
- Falls back to name match (`semanticScores[practitioner.name]`)
- Fuzzy matching for name variations
- Returns 0-1 score

**Additive** (after normalization)

#### 5h. Combine Scores
```javascript
baseBM25Score = (bm25Score × qualityBoost × proximityBoost) + exactMatchBonus
finalScore = baseBM25Score + (semanticScore × semanticWeight)
```

**Note:** Semantic score is added after base BM25 calculation, but before normalization.

#### 5i. Min-Max Normalization
**Logic:**
```javascript
// Normalize BM25 scores
minBM25 = min(all baseBM25Scores)
maxBM25 = max(all baseBM25Scores)
normalizedBM25 = (baseBM25Score - minBM25) / (maxBM25 - minBM25)

// Normalize semantic scores (if enabled)
minSemantic = min(all semanticScores)
maxSemantic = max(all semanticScores)
normalizedSemantic = (semanticScore - minSemantic) / (maxSemantic - minSemantic)

// Recalculate final score
normalizedFinalScore = normalizedBM25 + (normalizedSemantic × semanticWeight)
doc.score = normalizedFinalScore
```

**Purpose:** Prevents score scale mismatches when combining BM25 and semantic scores.

#### 5j. Sort & Rank
- Sort by `score` (descending)
- Assign `rank` (1, 2, 3, ...)

---

### Step 6: Return Top N

```javascript
topN = ranked.slice(0, shortlistSize)
return topN
```

**Returns:** Array of `{ document, score, rank, bm25Score, qualityBoost, exactMatchBonus, proximityBoost, semanticScore, baseBM25Score, normalizedBM25, normalizedSemantic }`

---

## Key Differences from Local Implementation

| Aspect | Production | Local |
|--------|-----------|-------|
| **Filtering** | Hard filters (insurance, gender) BEFORE ranking | Filter conditions (age, languages, gender) BEFORE ranking |
| **Query Building** | Includes specialty/location in query | Separates specialty filter from query |
| **Query Expansion** | Simple keyword expansion | Equivalence-only aliasing (better) |
| **BM25** | Single-stage BM25 | Two-stage (Stage A/B) |
| **Quality Boost** | Uses relevant admission count (smart) | Uses simple procedure count |
| **Normalization** | Min-max normalization | No normalization |
| **Semantic Scoring** | Integrated with normalization | Not present |
| **Proximity Boost** | Distance-based for postcode searches | Not present |
| **IDF Fix** | ⚠️ No clamping (potential bug) | ✅ Explicit clamping |

---

## Score Calculation Formula

### Production Formula:
```
1. BM25 Score = Σ IDF × (TF × (k1+1)) / (TF + k1 × (1-b + b × (docLength/avgDocLength)))

2. Base BM25 Score = (BM25 Score × Quality Boost × Proximity Boost) + Exact Match Bonus

3. Raw Final Score = Base BM25 Score + (Semantic Score × Semantic Weight)

4. Normalized BM25 = (Base BM25 Score - minBM25) / (maxBM25 - minBM25)

5. Normalized Semantic = (Semantic Score - minSemantic) / (maxSemantic - minSemantic)

6. Final Score = Normalized BM25 + (Normalized Semantic × Semantic Weight)
```

### Quality Boost Components:
```
Quality Boost = Rating Boost × Review Boost × Experience Boost × Verified Boost × Admission Boost

Admission Boost = f(relevantAdmissions)
  - Uses calculateRelevantAdmissionCount() for smart matching
  - Filters generic terms
  - Only counts procedures matching meaningful query terms
```

---

## Example Flow

### Input:
```javascript
practitioners = [/* 1000 practitioners */]
filters = {
  specialty: "Cardiologist",
  location: "London",
  searchQuery: "chest pain",
  insurancePreference: "Bupa",
  genderPreference: "male"
}
shortlistSize = 10
geocoded = { searchType: "postcode", postcode: "SW1A 1AA" }
semanticOptions = { enabled: true, weight: 0.3, scores: {...}, scoresById: {...} }
```

### Flow:
1. **Insurance Filter**: 1000 → 450 (only Bupa-accepting practitioners)
2. **Gender Filter**: 450 → 280 (male + unknown genders)
3. **Query Building**: "Cardiologist London chest pain"
4. **Query Expansion**: "Cardiologist London chest pain" (no expansion for this query)
5. **BM25 Ranking**:
   - Calculate BM25 scores for 280 practitioners
   - Apply quality boost (using relevant admission count)
   - Apply exact match bonus
   - Apply proximity boost (for postcode search)
   - Add semantic scores
   - Normalize scores
   - Sort and rank
6. **Return Top 10**: Top 10 ranked practitioners

---

## Performance Characteristics

- **Filtering**: O(n) where n = number of practitioners
- **Query Building**: O(1)
- **Query Expansion**: O(1) (lookup)
- **BM25 Ranking**: O(n × m) where n = practitioners, m = query terms
- **Normalization**: O(n)
- **Sorting**: O(n log n)

**Total Complexity:** O(n log n) dominated by sorting

---

## Edge Cases Handled

1. **Empty query**: Returns first N practitioners with simple descending scores
2. **No insurance matches**: Returns empty array
3. **No gender matches**: Returns empty array
4. **All same scores**: Normalization handles edge case (returns 1.0)
5. **No semantic scores**: Semantic contribution is 0
6. **No proximity data**: Proximity boost is 1.0x
7. **Empty practitioners array**: Returns empty array

---

## Potential Issues

1. **IDF Clamping**: No explicit clamping to prevent negative IDF (may cause zero scores for filtered specialties)
2. **Query Bloat**: Query expansion adds many terms (may dilute relevance)
3. **No Zero-Score Handling**: Doesn't explicitly handle zero-score profiles (may return fewer than requested)
4. **Hard Filters**: Insurance/gender filters are hard (no fallback if no matches)

---

## Integration Points

### For V6 Progressive Ranking:
- V6 could use `getBM25Shortlist` but would need to handle:
  - Hard filters (insurance/gender) - may need to relax for progressive ranking
  - No two-stage retrieval - V6 may benefit from Stage A/B separation
  - Query expansion - may need equivalence-only aliasing instead

### For Session Context:
- Production has `getBM25ShortlistWithSessionContext` wrapper
- Integrates with external API for session context
- Falls back to legacy enriched query + session boost

---

## Summary

The production BM25 service is a **single-stage ranking system** with:
- ✅ Hard filters (insurance, gender) applied before ranking
- ✅ Query expansion for medical terms
- ✅ BM25 scoring with multiple boosts (quality, proximity, exact match)
- ✅ Optional semantic scoring integration
- ✅ Min-max normalization for score combination
- ⚠️ Potential IDF bug (no clamping)
- ⚠️ No two-stage retrieval (local has better Stage A/B)

**Best for:** User-facing search with filters and location awareness  
**Not ideal for:** Progressive ranking, two-stage retrieval, configurable weights
