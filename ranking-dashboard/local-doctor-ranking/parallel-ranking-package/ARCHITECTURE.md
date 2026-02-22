# Architecture Overview

## System Architecture

```
User Query + Conversation
    ↓
Parallel Ranking Algorithm
    ├─→ Parallel AI Calls (3 simultaneous)
    │   ├─→ Extract Insights (conversation summarization)
    │   ├─→ Classify General Intent (goal/specificity)
    │   └─→ Classify Clinical Intent (subspecialty routing)
    ↓
Session Context Result
    ├─→ q_patient (clean query)
    ├─→ intent_terms (expansion terms)
    ├─→ anchor_phrases (explicit conditions)
    └─→ intentData (negative terms, subspecialties, flags)
    ↓
Two-Stage Retrieval
    ├─→ Stage A: BM25 Retrieval
    │   └─→ Query: q_patient only
    │   └─→ Retrieve: Top 50 candidates
    │
    └─→ Stage B: Intent-Based Rescoring
        ├─→ Boost: intent_terms matches
        ├─→ Boost: anchor_phrases matches
        ├─→ Penalty: negative_terms matches (if enabled)
        └─→ Adaptive ranking strategy
    ↓
Ranked Results (Top N)
```

---

## Component Breakdown

### 1. Parallel Ranking Algorithm

**Location**: `algorithm/session-context-variants.js`

**Main Function**: `getSessionContextParallel()`

**Responsibilities**:
- Run 3 AI calls in parallel
- Classify intent (general + clinical)
- Extract insights from conversation
- Generate expansion terms
- Extract anchor phrases
- Conditionally enable negative terms
- Return structured context for ranking

**Key Features**:
- Parallel processing (fast)
- Adaptive negative keywords
- Error handling with fallbacks
- Query clarity detection

---

### 2. Two-Stage Retrieval System

#### Stage A: BM25 Retrieval

**Purpose**: Broad retrieval using clean query

**Input**:
- `q_patient`: Clean patient query (verbatim)
- Practitioners corpus

**Process**:
- Standard BM25 ranking
- Field weighting (clinical_expertise: 3.0x, etc.)
- Quality boosts (ratings, reviews, experience)
- No query expansion

**Output**: Top 50 candidates

#### Stage B: Intent-Based Rescoring

**Purpose**: Refine ranking using intent classification

**Input**:
- BM25 results (top 50)
- `intent_terms`: Expansion terms
- `anchor_phrases`: Explicit conditions/procedures
- `negative_terms`: Wrong subspecialty terms (if enabled)
- `likely_subspecialties`: Inferred subspecialties

**Process**:
- Count intent term matches → boost score
- Count anchor phrase matches → additive boost
- Count negative term matches → penalty (if enabled)
- Subspecialty matching → confidence-weighted boost
- Adaptive ranking strategy (clear vs ambiguous queries)

**Output**: Rescored and reranked results

---

## Data Flow

### Input

```javascript
{
  userQuery: "I need SVT ablation",
  messages: [
    { role: 'user', content: 'I need SVT ablation' },
    { role: 'assistant', content: '...' }
  ],
  location: null,
  filters: {
    specialty: 'Cardiology',
    insurance: null,
    genderPreference: null
  }
}
```

### Processing

1. **Parallel AI Calls**:
   ```javascript
   [
     extractInsightsWithAI(messages),           // ~300ms
     classifyGeneralIntentParallel(...),         // ~400ms
     classifyClinicalIntent(...)                 // ~400ms
   ]
   // Total: ~400ms (parallel) vs ~1100ms (sequential)
   ```

2. **Intent Merging**:
   - Merge expansion terms (clinical intent first)
   - Merge negative terms (if query is clear)
   - Merge subspecialties (deduplicate, prioritize confidence)

3. **Query Separation**:
   - `q_patient`: "I need SVT ablation" (clean)
   - `intent_terms`: ["arrhythmia", "electrophysiology", ...]
   - `anchor_phrases`: ["SVT ablation"]

### Output

```javascript
{
  q_patient: "I need SVT ablation",
  intent_terms: ["arrhythmia", "electrophysiology", ...],
  anchor_phrases: ["SVT ablation"],
  intentData: {
    goal: "procedure_intervention",
    specificity: "named_procedure",
    confidence: 0.85,
    primary_intent: "arrhythmia_rhythm",
    negative_terms: [], // Conditionally enabled
    isQueryAmbiguous: false
  },
  processingTime: 450
}
```

---

## Key Concepts

### 1. Query Separation

**Why separate?**
- BM25 works best with clean, focused queries
- Expansion terms can pollute BM25 retrieval
- Rescoring allows fine-grained control

**How it works**:
- Stage A: Use `q_patient` only (no expansion)
- Stage B: Use `intent_terms` for boosting (not query terms)

### 2. Adaptive Negative Keywords

**Problem**: Negative terms can penalize relevant practitioners on ambiguous queries.

**Solution**: Conditionally enable based on query clarity.

**Logic**:
```javascript
if (confidence >= 0.75 && (named_procedure || confirmed_diagnosis)) {
  // Query is clear → enable negative terms
  negative_terms = merge(clinicalIntent.negative_terms, generalIntent.negative_terms);
} else {
  // Query is ambiguous → disable negative terms
  negative_terms = [];
}
```

### 3. Parallel Processing

**Why parallel?**
- 3 independent AI calls
- No dependencies between calls
- Reduces latency significantly

**Performance**:
- Sequential: ~1100ms (300 + 400 + 400)
- Parallel: ~400ms (max of all three)

### 4. Error Handling

**Strategy**: Graceful degradation

Each AI call has fallback:
```javascript
classifyGeneralIntentParallel(...)
  .catch(err => {
    // Return safe fallback values
    return {
      goal: 'diagnostic_workup',
      specificity: 'symptom_only',
      confidence: 0.3,
      expansion_terms: [],
      negative_terms: []
    };
  })
```

**Result**: Algorithm still works if one AI call fails.

---

## Integration Points

### With Production Ranking

1. **Call Algorithm**:
   ```javascript
   const sessionContext = await getSessionContextParallel(userQuery, messages, location);
   ```

2. **BM25 Stage A**:
   ```javascript
   const bm25Results = await bm25Service.rank(
     practitioners,
     sessionContext.q_patient,  // Clean query
     filters,
     50  // Top 50 for rescoring
   );
   ```

3. **Rescoring Stage B**:
   ```javascript
   const finalResults = await rescoringService.rescore(
     bm25Results,
     {
       intent_terms: sessionContext.intent_terms,
       anchor_phrases: sessionContext.anchor_phrases,
       negative_terms: sessionContext.intentData.negative_terms,
       isQueryAmbiguous: sessionContext.intentData.isQueryAmbiguous
     }
   );
   ```

---

## Performance Characteristics

### Latency

- **Parallel AI Calls**: ~400ms
- **BM25 Retrieval**: ~50ms (depends on corpus size)
- **Rescoring**: ~20ms (depends on result count)
- **Total**: ~470ms per query

### Scalability

- **AI Calls**: Rate-limited by OpenAI API
- **BM25**: Scales with corpus size (O(n log n))
- **Rescoring**: Scales with result count (O(n))

### Optimization Opportunities

- Cache intent classification results
- Batch AI calls for multiple queries
- Pre-compute BM25 indexes
- Parallelize rescoring

---

## Related Documentation

- [algorithm/README.md](algorithm/README.md) - Algorithm API reference
- [docs/ALGORITHM_EXPLANATION.md](docs/ALGORITHM_EXPLANATION.md) - Detailed algorithm walkthrough
- [docs/TWO_STAGE_RETRIEVAL.md](docs/TWO_STAGE_RETRIEVAL.md) - Two-stage retrieval details
- [docs/NEGATIVE_KEYWORDS.md](docs/NEGATIVE_KEYWORDS.md) - Negative keyword handling

---

**Understanding the architecture helps you integrate effectively!**
