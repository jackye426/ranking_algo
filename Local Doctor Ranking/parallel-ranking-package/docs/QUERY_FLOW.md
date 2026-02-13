# Query Flow Explanation

## Overview

The parallel ranking algorithm processes queries through multiple stages, transforming user input into ranked practitioner results.

---

## Complete Flow

```
User Query: "I need SVT ablation"
    ↓
Parallel AI Processing (3 calls simultaneously)
    ├─→ Extract Insights
    │   └─→ { symptoms: [], specialty: "Cardiology", urgency: "routine", ... }
    │
    ├─→ Classify General Intent
    │   └─→ { goal: "procedure_intervention", specificity: "named_procedure", 
    │         confidence: 0.9, expansion_terms: [...], negative_terms: [...],
    │         anchor_phrases: ["SVT ablation"] }
    │
    └─→ Classify Clinical Intent
        └─→ { primary_intent: "arrhythmia_rhythm", expansion_terms: [...],
              negative_terms: [...], likely_subspecialties: [...] }
    ↓
Merge Results
    ├─→ q_patient: "I need SVT ablation" (clean query)
    ├─→ intent_terms: ["arrhythmia", "electrophysiology", ...] (merged)
    ├─→ anchor_phrases: ["SVT ablation"]
    └─→ negative_terms: [] (conditionally enabled)
    ↓
Two-Stage Retrieval
    ├─→ Stage A: BM25 Retrieval
    │   └─→ Query: "I need SVT ablation"
    │   └─→ Retrieve: Top 50 practitioners
    │
    └─→ Stage B: Intent-Based Rescoring
        ├─→ Boost: +0.3 per intent term match
        ├─→ Boost: +0.5 per anchor phrase match
        ├─→ Penalty: -1.0 to -3.0 per negative term match (if enabled)
        └─→ Final ranked results
```

---

## Stage-by-Stage Breakdown

### Stage 1: Query Input

**Input**:
```javascript
{
  userQuery: "I need SVT ablation",
  messages: [
    { role: 'user', content: 'I need SVT ablation' },
    { role: 'assistant', content: 'I can help...' }
  ],
  location: null
}
```

### Stage 2: Parallel AI Processing

Three AI calls run simultaneously:

#### 2a. Extract Insights

**Purpose**: Summarize conversation

**Output**:
```javascript
{
  symptoms: [],
  preferences: [],
  urgency: "routine",
  specialty: "Cardiology",
  location: null,
  summary: "Patient needs SVT ablation"
}
```

#### 2b. Classify General Intent

**Purpose**: Determine goal and specificity

**Output**:
```javascript
{
  goal: "procedure_intervention",
  specificity: "named_procedure",
  confidence: 0.9,
  expansion_terms: ["arrhythmia", "electrophysiology", "cardiac ablation", ...],
  negative_terms: ["counselling", "therapy"], // Only if named_procedure + high confidence
  anchor_phrases: ["SVT ablation"],
  likely_subspecialties: [{name: "Electrophysiology", confidence: 0.9}]
}
```

#### 2c. Classify Clinical Intent

**Purpose**: Route to correct subspecialty

**Output**:
```javascript
{
  primary_intent: "arrhythmia_rhythm",
  expansion_terms: ["arrhythmia", "electrophysiology", "cardiac ablation", ...],
  negative_terms: ["coronary angiography", "interventional cardiology", ...],
  likely_subspecialties: [{name: "Electrophysiology", confidence: 0.8}]
}
```

### Stage 3: Merge Results

#### 3a. Merge Expansion Terms

```javascript
// Clinical intent terms first (more specific)
const intent_terms = [
  ...clinicalIntent.expansion_terms,  // ["arrhythmia", "electrophysiology", ...]
  ...generalIntent.expansion_terms   // ["cardiac ablation", ...]
].filter((term, idx, arr) => arr.indexOf(term) === idx); // Deduplicate
```

#### 3b. Determine Query Clarity

```javascript
const isQueryClear = 
  generalIntent.confidence >= 0.75 && 
  (generalIntent.specificity === 'named_procedure' || 
   generalIntent.specificity === 'confirmed_diagnosis');
```

#### 3c. Merge Negative Terms (if clear)

```javascript
if (isQueryClear) {
  negative_terms = [
    ...clinicalIntent.negative_terms,
    ...generalIntent.negative_terms
  ].filter((term, idx, arr) => arr.indexOf(term) === idx);
} else {
  negative_terms = []; // Disabled for ambiguous queries
}
```

### Stage 4: Two-Stage Retrieval

#### Stage A: BM25 Retrieval

**Input**: `q_patient` = "I need SVT ablation"

**Process**:
1. Tokenize query
2. Calculate BM25 scores for all practitioners
3. Apply quality boosts (ratings, reviews, experience)
4. Sort by score
5. Return top 50

**Output**: Top 50 practitioners with BM25 scores

#### Stage B: Intent-Based Rescoring

**Input**: 
- BM25 results (top 50)
- `intent_terms`: ["arrhythmia", "electrophysiology", ...]
- `anchor_phrases`: ["SVT ablation"]
- `negative_terms`: [] (if enabled)

**Process**:
For each practitioner:
1. Count intent term matches → boost score
2. Count anchor phrase matches → additive boost
3. Count negative term matches → penalty (if enabled)
4. Calculate final score = BM25 score + rescoring adjustments
5. Sort by final score

**Output**: Rescored and reranked results (top 15)

---

## Query Transformation Examples

### Example 1: Clear Query

**Input**: "I need SVT ablation"

**After Parallel Processing**:
- `q_patient`: "I need SVT ablation" (unchanged)
- `intent_terms`: ["arrhythmia", "electrophysiology", "cardiac ablation", ...]
- `anchor_phrases`: ["SVT ablation"]
- `negative_terms`: ["coronary angiography", "interventional cardiology"] (enabled)

**BM25 Stage A**: Uses "I need SVT ablation" only

**Rescoring Stage B**: 
- Boosts practitioners with "arrhythmia", "electrophysiology"
- Strong boost for "SVT ablation" match
- Penalizes practitioners with "coronary angiography"

### Example 2: Ambiguous Query

**Input**: "I have chest pain"

**After Parallel Processing**:
- `q_patient`: "I have chest pain" (unchanged)
- `intent_terms`: ["chest pain clinic", "angina", "coronary artery disease", ...]
- `anchor_phrases`: ["chest pain"]
- `negative_terms`: [] (disabled - query is ambiguous)

**BM25 Stage A**: Uses "I have chest pain" only

**Rescoring Stage B**:
- Boosts practitioners with intent terms
- Boosts "chest pain" matches
- No negative term penalties (query is unclear)

---

## Key Principles

### 1. Query Separation

- **BM25 uses clean query**: No expansion terms in BM25 stage
- **Rescoring uses expansion**: Intent terms used for boosting, not query terms

**Why?** Prevents query pollution and allows fine-grained control.

### 2. Adaptive Behavior

- **Clear queries**: Negative terms enabled, aggressive filtering
- **Ambiguous queries**: Negative terms disabled, broader results

**Why?** Prevents false penalties when intent is uncertain.

### 3. Parallel Processing

- **3 AI calls simultaneously**: Reduces latency
- **Independent calls**: No dependencies between calls

**Why?** Faster response times.

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [TWO_STAGE_RETRIEVAL.md](TWO_STAGE_RETRIEVAL.md) - Two-stage retrieval details
- [NEGATIVE_KEYWORDS.md](NEGATIVE_KEYWORDS.md) - Negative keyword handling
- [algorithm/README.md](../algorithm/README.md) - Algorithm API

---

**Understanding query flow helps you debug and optimize!**
