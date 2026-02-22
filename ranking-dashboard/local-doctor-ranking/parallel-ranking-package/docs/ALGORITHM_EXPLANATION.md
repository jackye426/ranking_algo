# Algorithm Explanation - Deep Dive

## Overview

This document provides a detailed walkthrough of how the parallel ranking algorithm works, including all components and their interactions.

---

## High-Level Flow

```
User Query + Conversation
    ↓
Parallel AI Processing (3 calls)
    ├─→ Extract Insights
    ├─→ Classify General Intent
    └─→ Classify Clinical Intent
    ↓
Merge & Process Results
    ├─→ Merge expansion terms
    ├─→ Determine query clarity
    ├─→ Conditionally enable negative terms
    └─→ Extract anchor phrases
    ↓
Two-Stage Retrieval
    ├─→ Stage A: BM25 (clean query)
    └─→ Stage B: Rescoring (intent-based)
    ↓
Ranked Results
```

---

## Component 1: Parallel AI Processing

### Why Parallel?

Three independent AI calls with no dependencies:
- **Insights extraction**: Summarizes conversation
- **General intent**: Classifies goal/specificity
- **Clinical intent**: Routes to subspecialty

**Performance**: ~400ms (parallel) vs ~1100ms (sequential)

### AI Call 1: Extract Insights

**Function**: `extractInsightsWithAI(messages)`

**Purpose**: Extract structured insights from conversation

**Model**: GPT-4o-mini, temperature 0.3

**Output**:
```javascript
{
  symptoms: ["chest pain", "palpitations"],
  preferences: ["private"],
  urgency: "routine" | "urgent" | "emergency",
  specialty: "Cardiology" | null,
  location: "London" | null,
  summary: "brief summary"
}
```

**Use**: Provides context for ranking (urgency, preferences, etc.)

### AI Call 2: Classify General Intent

**Function**: `classifyGeneralIntentParallel(userQuery, conversationText, specialty)`

**Purpose**: Classify query using goal + specificity (specialty-agnostic)

**Model**: GPT-4o-mini, temperature 0.2, JSON format

**Output**:
```javascript
{
  goal: "procedure_intervention" | "diagnostic_workup" | "ongoing_management" | "second_opinion",
  specificity: "named_procedure" | "confirmed_diagnosis" | "symptom_only",
  confidence: 0.0-1.0,
  expansion_terms: ["term1", "term2", ...],  // 6-10 terms
  negative_terms: ["term1", "term2", ...],    // Only if named_procedure + high confidence
  anchor_phrases: ["phrase1", "phrase2"],     // 1-3 explicit conditions/procedures
  likely_subspecialties: [{name: "...", confidence: 0.0-1.0}, ...]  // 0-3 subspecialties
}
```

**Key Rules**:
- Negative terms ONLY if `named_procedure` AND `confidence >= 0.75`
- Anchor phrases are explicit mentions only (no inference)
- Subspecialties filtered to confidence >= 0.4, capped at 3

### AI Call 3: Classify Clinical Intent

**Function**: `classifyClinicalIntent(userQuery, conversationText, specialty)`

**Purpose**: Route query to correct clinical subspecialty

**Model**: GPT-4o-mini, temperature 0.2, JSON format

**Output**:
```javascript
{
  primary_intent: "arrhythmia_rhythm" | "coronary_ischaemic" | ...,
  expansion_terms: ["term1", "term2", ...],  // 8-12 terms
  negative_terms: ["term1", "term2", ...],    // 5-8 terms (wrong subspecialty)
  likely_subspecialties: [{name: "...", confidence: 0.0-1.0}, ...]  // 0-3 subspecialties
}
```

**Cardiology Intents**:
- `coronary_ischaemic`: Chest pain, angina, heart attack
- `arrhythmia_rhythm`: Palpitations, SVT, AF, ablation
- `structural_valve`: Valve problems, murmurs
- `heart_failure`: Heart failure, breathlessness
- `prevention_risk`: Prevention, screening
- `general_cardiology_unclear`: Unclear intent

---

## Component 2: Result Merging

### Merge Expansion Terms

**Strategy**: Clinical intent terms first (more specific), then general intent terms

```javascript
const allExpansionTerms = [...clinicalExpansionTerms];
generalExpansionTerms.forEach(term => {
  if (!allExpansionTerms.includes(term)) {
    allExpansionTerms.push(term); // Deduplicate
  }
});
```

**Result**: `intent_terms` array (used for Stage B rescoring)

### Determine Query Clarity

```javascript
const isQueryClear = 
  generalIntentResult.confidence >= 0.75 && 
  (generalIntentResult.specificity === 'named_procedure' || 
   generalIntentResult.specificity === 'confirmed_diagnosis');
```

**Use**: Determines if negative terms should be enabled

### Merge Negative Terms (Conditional)

```javascript
if (isQueryClear) {
  // Merge from both sources
  mergedNegativeTerms = [
    ...clinicalIntentResult.negative_terms,
    ...generalIntentResult.negative_terms
  ].filter((term, idx, arr) => arr.indexOf(term) === idx); // Deduplicate
} else {
  // Query is ambiguous → disable negative terms
  mergedNegativeTerms = [];
}
```

**Why conditional?** Prevents false penalties on ambiguous queries.

### Merge Subspecialties

```javascript
// Combine both sources, deduplicate by name, keep highest confidence
const subspecialtyMap = new Map();
[...clinicalIntentResult.likely_subspecialties, ...generalIntentResult.likely_subspecialties]
  .forEach(sub => {
    if (sub.confidence >= 0.4) {
      const existing = subspecialtyMap.get(sub.name.toLowerCase());
      if (!existing || sub.confidence > existing.confidence) {
        subspecialtyMap.set(sub.name.toLowerCase(), sub);
      }
    }
  });

// Sort by confidence, cap at 3
const finalSubspecialties = Array.from(subspecialtyMap.values())
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 3);
```

---

## Component 3: Two-Stage Retrieval

### Stage A: BM25 Retrieval

**Input**: `q_patient` (clean query)

**Process**:
1. Tokenize query
2. Calculate BM25 scores
3. Apply quality boosts
4. Sort by score
5. Return top 50

**Key**: No expansion terms - clean query only!

### Stage B: Intent-Based Rescoring

**Input**: BM25 results + intent data

**Process**:
For each practitioner:
1. Count intent term matches → boost
2. Count anchor phrase matches → strong boost
3. Count negative term matches → penalty (if enabled)
4. Match subspecialties → confidence-weighted boost
5. Calculate final score = BM25 + rescoring adjustments
6. Sort by final score

**Output**: Rescored and reranked results

---

## Error Handling

### Fallback Strategy

Each AI call has fallback:

```javascript
classifyGeneralIntentParallel(...)
  .catch(err => {
    console.warn('[Variant] General intent classification failed:', err.message);
    return {
      goal: 'diagnostic_workup',
      specificity: 'symptom_only',
      confidence: 0.3,
      expansion_terms: [],
      negative_terms: [],
      anchor_phrases: [],
      likely_subspecialties: []
    };
  })
```

**Result**: Algorithm still works if one AI call fails (graceful degradation)

---

## Key Design Decisions

### 1. Query Separation

**Decision**: Separate `q_patient` from `intent_terms`

**Why**: 
- BM25 works best with clean queries
- Expansion terms can pollute BM25
- Rescoring allows fine-grained control

### 2. Adaptive Negative Terms

**Decision**: Conditionally enable negative terms

**Why**:
- Prevents false penalties on ambiguous queries
- Safe to penalize when intent is clear
- Better user experience

### 3. Parallel Processing

**Decision**: Run 3 AI calls simultaneously

**Why**:
- Reduces latency significantly
- No dependencies between calls
- Better user experience

### 4. Two-Stage Retrieval

**Decision**: BM25 retrieval + intent-based rescoring

**Why**:
- Better control than single-stage
- Cleaner BM25 retrieval
- Fine-grained rescoring

---

## Performance Characteristics

### Latency

- **Parallel AI Calls**: ~400ms
- **BM25 Retrieval**: ~50ms
- **Rescoring**: ~20ms
- **Total**: ~470ms per query

### Scalability

- **AI Calls**: Rate-limited by OpenAI API
- **BM25**: Scales with corpus size (O(n log n))
- **Rescoring**: Scales with result count (O(n))

---

## Related Documentation

- [algorithm/README.md](../algorithm/README.md) - Algorithm API reference
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [TWO_STAGE_RETRIEVAL.md](TWO_STAGE_RETRIEVAL.md) - Two-stage retrieval details
- [NEGATIVE_KEYWORDS.md](NEGATIVE_KEYWORDS.md) - Negative keyword handling
- [QUERY_FLOW.md](QUERY_FLOW.md) - Query processing flow

---

**Understanding the algorithm helps you optimize and customize!**
