# Two-Stage Retrieval Explained

## Overview

The parallel ranking algorithm uses a **two-stage retrieval system** that separates broad retrieval from fine-grained ranking. This approach provides better control and accuracy than single-stage ranking.

---

## Why Two Stages?

### Problem with Single-Stage Ranking

Traditional approach:
```
Query → Expand Query → BM25 Ranking → Results
```

**Issues**:
- Expansion terms pollute BM25 query
- Hard to control expansion term impact
- Can't adapt ranking strategy based on query clarity
- Negative terms can't be applied selectively

### Solution: Two-Stage Retrieval

```
Query → Stage A: BM25 (clean query) → Stage B: Rescoring (intent-based) → Results
```

**Benefits**:
- Clean BM25 retrieval (no pollution)
- Fine-grained control in rescoring
- Adaptive ranking strategy
- Selective negative term application

---

## Stage A: BM25 Retrieval

### Purpose

**Broad retrieval** using clean patient query.

### Process

1. **Input**: `q_patient` (clean query, verbatim)
   - Example: "I need SVT ablation"
   - No expansion terms added

2. **BM25 Ranking**:
   - Standard BM25 algorithm
   - Field weighting (clinical_expertise: 3.0x, etc.)
   - Quality boosts (ratings, reviews, experience)
   - Exact match bonuses

3. **Output**: Top 50 practitioners
   - Ranked by BM25 score
   - Broad coverage (not too restrictive)

### Why Top 50?

- Provides enough candidates for rescoring
- Not too many (performance)
- Not too few (coverage)

---

## Stage B: Intent-Based Rescoring

### Purpose

**Refine ranking** using intent classification results.

### Process

1. **Input**: 
   - BM25 results (top 50)
   - `intent_terms`: Expansion terms
   - `anchor_phrases`: Explicit conditions/procedures
   - `negative_terms`: Wrong subspecialty terms (if enabled)
   - `likely_subspecialties`: Inferred subspecialties

2. **Rescoring**:
   For each practitioner:
   ```javascript
   // Count matches
   const intentMatches = countIntentTermMatches(practitioner, intent_terms);
   const anchorMatches = countAnchorPhraseMatches(practitioner, anchor_phrases);
   const negativeMatches = countNegativeTermMatches(practitioner, negative_terms);
   
   // Calculate rescoring score
   const rescoringScore = 
     (intentMatches * 0.3) +           // Intent term boost
     (anchorMatches * 0.5) +            // Anchor phrase boost
     (negativeMatches * -1.0 to -3.0);  // Negative term penalty
   
   // Final score
   const finalScore = bm25Score + rescoringScore;
   ```

3. **Output**: Rescored and reranked results (top 15)

---

## Rescoring Components

### 1. Intent Term Boosting

**Purpose**: Boost practitioners matching expansion terms

**Example**:
- Intent terms: `["arrhythmia", "electrophysiology", "cardiac ablation"]`
- Practitioner mentions "arrhythmia" and "electrophysiology"
- Boost: `2 matches × 0.3 = +0.6`

**Weight**: 0.3 per match (configurable)

### 2. Anchor Phrase Boosting

**Purpose**: Strong boost for explicit conditions/procedures

**Example**:
- Anchor phrases: `["SVT ablation"]`
- Practitioner mentions "SVT ablation"
- Boost: `1 match × 0.5 = +0.5`

**Weight**: 0.5 per match (configurable)

**Why stronger?** Anchor phrases are explicit mentions - very high signal.

### 3. Negative Term Penalties

**Purpose**: Penalize wrong subspecialties (when enabled)

**Example**:
- Negative terms: `["coronary angiography", "interventional cardiology"]`
- Practitioner mentions both
- Penalty: `-2.0` (2-3 matches)

**Penalty Structure**:
- 1 match: -1.0
- 2-3 matches: -2.0
- 4+ matches: -3.0 (capped)

**When enabled?** Only when query is clear (high confidence + named procedure/diagnosis)

### 4. Subspecialty Boosting

**Purpose**: Boost practitioners matching inferred subspecialties

**Example**:
- Likely subspecialties: `[{name: "Electrophysiology", confidence: 0.9}]`
- Practitioner has subspecialty "Electrophysiology"
- Boost: `0.9 × 0.3 = +0.27` (capped at 0.5 total)

**Weight**: Confidence × 0.3 per match (capped at 0.5 total)

---

## Adaptive Ranking Strategy

### Clear Queries

**Condition**: High confidence (>= 0.75) + named procedure/diagnosis

**Strategy**:
- Use rescoring score as primary
- Negative terms enabled
- Aggressive filtering

**Example**: "I need SVT ablation"
- Clear intent → EP doctor needed
- Safe to penalize wrong subspecialties

### Ambiguous Queries

**Condition**: Low confidence OR symptom-only

**Strategy**:
- Use modified BM25 score
- Negative terms disabled
- Broader results

**Example**: "I have chest pain"
- Unclear intent → Could be multiple subspecialties
- Not safe to penalize → Keep options open

---

## Performance

### Latency

- **Stage A (BM25)**: ~50ms (depends on corpus size)
- **Stage B (Rescoring)**: ~20ms (depends on result count)
- **Total**: ~70ms (excluding AI calls)

### Scalability

- **Stage A**: Scales with corpus size (O(n log n))
- **Stage B**: Scales with result count (O(n))
- **Total**: Efficient for large corpora

---

## Comparison: Single vs Two-Stage

### Single-Stage (Traditional)

```
Query: "I need SVT ablation"
Expanded Query: "I need SVT ablation arrhythmia electrophysiology cardiac ablation ..."
BM25 Ranking → Results
```

**Issues**:
- Expansion terms dilute query
- Hard to control term impact
- Can't adapt strategy

### Two-Stage (Parallel Algorithm)

```
Query: "I need SVT ablation"
Stage A: BM25("I need SVT ablation") → Top 50
Stage B: Rescore with intent terms → Top 15
```

**Benefits**:
- Clean BM25 retrieval
- Fine-grained control
- Adaptive strategy

---

## Example Flow

### Query: "I need SVT ablation"

#### Stage A: BM25 Retrieval

**Input**: `q_patient` = "I need SVT ablation"

**Process**:
1. Tokenize: ["I", "need", "SVT", "ablation"]
2. Calculate BM25 scores
3. Apply quality boosts
4. Sort by score

**Output**: Top 50 practitioners
```
1. Dr A (EP specialist) - BM25: 8.5
2. Dr B (General cardiologist) - BM25: 7.2
3. Dr C (EP specialist) - BM25: 6.8
...
```

#### Stage B: Rescoring

**Input**: 
- Top 50 from Stage A
- `intent_terms`: ["arrhythmia", "electrophysiology", ...]
- `anchor_phrases`: ["SVT ablation"]
- `negative_terms`: [] (query is clear, but not needed for this intent)

**Process**:
For each practitioner:
- Count intent term matches
- Count anchor phrase matches
- Calculate rescoring score
- Add to BM25 score

**Output**: Rescored results
```
1. Dr A (EP specialist) - Final: 9.3 (BM25: 8.5 + Rescoring: +0.8)
   - Intent matches: 2 → +0.6
   - Anchor matches: 1 → +0.5
   - Total rescoring: +0.8

2. Dr C (EP specialist) - Final: 8.1 (BM25: 6.8 + Rescoring: +1.3)
   - Intent matches: 3 → +0.9
   - Anchor matches: 1 → +0.5
   - Total rescoring: +1.3

3. Dr B (General cardiologist) - Final: 7.2 (BM25: 7.2 + Rescoring: +0.0)
   - Intent matches: 0 → +0.0
   - Anchor matches: 0 → +0.0
   - Total rescoring: +0.0
```

**Result**: EP specialists rank higher after rescoring!

---

## Tuning Parameters

### Rescoring Weights

Adjust based on your needs:

```javascript
const INTENT_TERM_WEIGHT = 0.3;      // Boost per intent term match
const ANCHOR_PHRASE_WEIGHT = 0.5;    // Boost per anchor phrase match
const NEGATIVE_PENALTY_1 = -1.0;      // Penalty for 1 negative match
const NEGATIVE_PENALTY_2 = -2.0;      // Penalty for 2-3 negative matches
const NEGATIVE_PENALTY_4 = -3.0;      // Penalty for 4+ negative matches
```

### Retrieval Pool Size

Adjust based on corpus size:

```javascript
const STAGE_A_TOP_N = 50;  // Retrieve top 50 for rescoring
const STAGE_B_TOP_N = 15;  // Return top 15 final results
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [QUERY_FLOW.md](QUERY_FLOW.md) - Complete query flow
- [NEGATIVE_KEYWORDS.md](NEGATIVE_KEYWORDS.md) - Negative keyword details
- [algorithm/README.md](../algorithm/README.md) - Algorithm API

---

**Two-stage retrieval provides better control and accuracy!**
