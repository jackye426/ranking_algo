# Parallel Ranking Algorithm

## Overview

The parallel ranking algorithm implements a **two-stage retrieval system** with intent-aware query expansion. It uses parallel AI calls for speed and adaptively enables negative keywords based on query clarity.

---

## Main Function

### `getSessionContextParallel(userQuery, messages, location)`

**Purpose**: Analyze user query and conversation to generate ranking context

**Parameters**:
- `userQuery` (string): Current user query
- `messages` (array): Conversation history `[{role: 'user', content: '...'}, ...]`
- `location` (string|null): User location (optional)

**Returns**:
```javascript
{
  q_patient: "I need SVT ablation",           // Clean query for BM25 Stage A
  intent_terms: ["arrhythmia", "electrophysiology", ...], // Expansion terms for Stage B
  anchor_phrases: ["SVT ablation"],           // Explicit conditions/procedures
  intentData: {
    goal: "procedure_intervention",
    specificity: "named_procedure",
    confidence: 0.85,
    primary_intent: "arrhythmia_rhythm",
    negative_terms: [], // Conditionally enabled
    anchor_phrases: ["SVT ablation"],
    likely_subspecialties: [...],
    isQueryAmbiguous: false
  },
  insights: {
    symptoms: [...],
    preferences: [...],
    urgency: "routine",
    ...
  },
  processingTime: 1234 // milliseconds
}
```

---

## How It Works

### 1. Parallel AI Processing

Three AI calls run **simultaneously**:

```javascript
const [insights, generalIntentResult, clinicalIntentResult] = await Promise.all([
  extractInsightsWithAI(messages),                    // Call 1: Summarize conversation
  classifyGeneralIntentParallel(...),                  // Call 2: Goal/specificity classification
  classifyClinicalIntent(...)                          // Call 3: Clinical subspecialty routing
]);
```

**Why parallel?** Reduces latency from ~3 seconds (sequential) to ~1 second (parallel).

### 2. Intent Classification

#### General Intent (Goal/Specificity)
- **Goal**: `diagnostic_workup` | `procedure_intervention` | `ongoing_management` | `second_opinion`
- **Specificity**: `symptom_only` | `confirmed_diagnosis` | `named_procedure`
- **Confidence**: 0.0-1.0
- **Expansion Terms**: 6-10 terms based on intent
- **Negative Terms**: Only if `named_procedure` AND `confidence >= 0.75`
- **Anchor Phrases**: Explicit conditions/procedures (1-3)

#### Clinical Intent (Subspecialty Routing)
- **Primary Intent**: Specialty-specific intent lanes (e.g., `arrhythmia_rhythm`, `coronary_ischaemic`)
- **Expansion Terms**: 8-12 intent-specific terms
- **Negative Terms**: 5-8 terms indicating wrong subspecialty
- **Likely Subspecialties**: 0-3 inferred subspecialties with confidence scores

### 3. Adaptive Negative Keywords

Negative terms are **conditionally enabled**:

```javascript
const isQueryClear = generalIntentResult.confidence >= 0.75 && 
                     (generalIntentResult.specificity === 'named_procedure' || 
                      generalIntentResult.specificity === 'confirmed_diagnosis');

if (isQueryClear) {
  // Merge negative terms from both sources
  mergedNegativeTerms = [...clinicalIntentResult.negative_terms, ...generalIntentResult.negative_terms];
} else {
  // Query is ambiguous → disable negative terms
  mergedNegativeTerms = [];
}
```

**See**: [docs/NEGATIVE_KEYWORDS.md](../docs/NEGATIVE_KEYWORDS.md) for detailed explanation.

### 4. Query Separation

The algorithm separates queries for two-stage retrieval:

- **`q_patient`**: Clean patient query (verbatim, trimmed)
  - Used for **Stage A: BM25 retrieval**
  - No expansion terms added
  
- **`intent_terms`**: Expansion terms from intent classification
  - Used for **Stage B: Rescoring**
  - Boosts practitioners matching intent terms

- **`anchor_phrases`**: Explicit conditions/procedures
  - Used for **Stage B: Rescoring**
  - Additive boost for explicit mentions

---

## Key Functions

### `classifyGeneralIntentParallel(userQuery, conversationText, specialty)`

Classifies query using goal + specificity (specialty-agnostic).

**Returns**:
```javascript
{
  goal: "procedure_intervention",
  specificity: "named_procedure",
  confidence: 0.85,
  expansion_terms: ["arrhythmia", "electrophysiology", ...],
  negative_terms: ["counselling", "therapy"], // Only if named_procedure + high confidence
  anchor_phrases: ["SVT ablation"],
  likely_subspecialties: [{name: "Electrophysiology", confidence: 0.9}]
}
```

### `classifyClinicalIntent(userQuery, conversationText, specialty)`

Routes query to correct clinical subspecialty.

**Returns**:
```javascript
{
  primary_intent: "arrhythmia_rhythm",
  expansion_terms: ["arrhythmia", "electrophysiology", "cardiac ablation", ...],
  negative_terms: ["coronary angiography", "interventional cardiology", ...],
  likely_subspecialties: [{name: "Electrophysiology", confidence: 0.8}]
}
```

### `extractInsightsWithAI(messages)`

Extracts structured insights from conversation.

**Returns**:
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

---

## Usage Example

```javascript
const { getSessionContextParallel } = require('./session-context-variants');

async function example() {
  const userQuery = "I need SVT ablation";
  const messages = [
    { role: 'user', content: 'I need SVT ablation' },
    { role: 'assistant', content: 'I can help you find a specialist...' }
  ];
  
  const result = await getSessionContextParallel(userQuery, messages, null);
  
  console.log('Patient Query:', result.q_patient);
  // Output: "I need SVT ablation"
  
  console.log('Intent Terms:', result.intent_terms);
  // Output: ["arrhythmia", "electrophysiology", "cardiac ablation", ...]
  
  console.log('Anchor Phrases:', result.anchor_phrases);
  // Output: ["SVT ablation"]
  
  console.log('Intent Data:', result.intentData);
  // Output: { goal: "procedure_intervention", specificity: "named_procedure", ... }
  
  // Use with BM25 ranking
  // Stage A: BM25 with result.q_patient
  // Stage B: Rescore with result.intent_terms, result.anchor_phrases, result.intentData.negative_terms
}

example();
```

---

## Error Handling

Each AI call has fallback handling:

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

**Graceful degradation**: If one AI call fails, others continue. Algorithm still works, just with reduced functionality.

---

## Performance

- **Parallel Processing**: ~1 second (vs ~3 seconds sequential)
- **AI Model**: GPT-4o-mini (fast, cost-effective)
- **Temperature**: 0.2 (low, consistent results)
- **Max Tokens**: 200 (intent classification), 300 (insights)

---

## Configuration

### Environment Variables

- `OPENAI_API_KEY` (required): OpenAI API key

### Model Settings

- **Model**: `gpt-4o-mini`
- **Temperature**: 0.2 (intent), 0.3 (insights)
- **Response Format**: JSON object (for intent classification)

---

## Related Documentation

- [NEGATIVE_KEYWORDS.md](../docs/NEGATIVE_KEYWORDS.md) - Negative keyword handling
- [ALGORITHM_EXPLANATION.md](../docs/ALGORITHM_EXPLANATION.md) - Detailed algorithm walkthrough
- [TWO_STAGE_RETRIEVAL.md](../docs/TWO_STAGE_RETRIEVAL.md) - Two-stage retrieval explained

---

## Exported Functions

```javascript
module.exports = {
  getSessionContextAlgorithmic,              // Variant 1: Algorithmic only
  getSessionContextSequential,               // Variant 2: Sequential AI expansion
  getSessionContextParallel,                 // Variant 3: Parallel (adaptive negative terms) ⭐ RECOMMENDED
  getSessionContextParallelGeneralGoalSpecificity // Variant 4: Parallel (always-on negative terms)
};
```

**Recommended**: Use `getSessionContextParallel` for production (adaptive negative terms).
