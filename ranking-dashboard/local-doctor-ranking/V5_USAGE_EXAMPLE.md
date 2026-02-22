# V5 Usage Example

## Overview

V5 uses GPT-4o (or GPT-5.1 when available) to generate an "ideal doctor profile" that describes what the perfect matching practitioner would look like, then matches actual profiles against this ideal.

## Basic Usage

```javascript
const { getSessionContextV5 } = require('./parallel-ranking-package/algorithm/session-context-variants');
const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');

// 1. Generate session context with ideal profile
const sessionContext = await getSessionContextV5(
  "I need SVT ablation",
  [
    { role: 'user', content: 'I need SVT ablation' }
  ],
  null, // location
  {
    specialty: 'Cardiology', // Optional: known specialty
    lexiconsDir: './lexicons', // Optional: path to lexicons directory
    model: 'gpt-4o' // Optional: defaults to 'gpt-4o'
  }
);

// 2. Use session context for ranking
const filters = {
  q_patient: sessionContext.q_patient, // Ideal profile query
  intent_terms: sessionContext.intent_terms, // For backward compatibility
  anchor_phrases: sessionContext.anchor_phrases,
  intentData: sessionContext.intentData,
  idealProfile: sessionContext.idealProfile, // Full ideal profile for Stage B
  variantName: 'v5', // Important: set variant name
  rankingConfig: {
    // Optional: override default weights
  }
};

const results = getBM25Shortlist(practitioners, filters, 12);
```

## What V5 Does Differently

### 1. Ideal Profile Generation

Instead of extracting terms, V5 generates a structured ideal profile:

```javascript
{
  subspecialties: [
    { name: "Electrophysiology", importance: "required", confidence: 0.95 }
  ],
  procedures: [
    { name: "Catheter Ablation", importance: "required", confidence: 0.9 }
  ],
  conditions: [
    { name: "Supraventricular Tachycardia", importance: "required", confidence: 0.9 }
  ],
  clinical_expertise_areas: [
    "Cardiac rhythm disorders",
    "Electrophysiology"
  ],
  avoid_subspecialties: ["Interventional Cardiology"],
  // ... more fields
}
```

### 2. Stage A: BM25 with Ideal Profile Query

The ideal profile is converted to a natural language query:

```
"Electrophysiology specialist who performs catheter ablation and SVT ablation procedures, 
specializes in cardiac rhythm disorders and arrhythmia management, 
with expertise in supraventricular tachycardia. 
Electrophysiology Catheter Ablation SVT Ablation..."
```

This query is used for BM25 retrieval instead of the raw patient query.

### 3. Stage B: Profile-to-Profile Matching

Instead of counting term matches, V5 matches actual profiles against the ideal profile:

- **Subspecialty matching**: Required subspecialties get +5.0, preferred get +3.0
- **Procedure matching**: Required procedures get +4.0, preferred get +2.0
- **Condition matching**: Required conditions get +3.0
- **Clinical expertise matching**: +2.0 per matching area
- **Negative matching**: Avoid subspecialties/procedures get -3.0/-2.0
- **Optional preferences**: Qualifications, age group, languages, gender get +1.0-1.5

## Integration with Existing Code

V5 is backward compatible. The session context returns:
- `q_patient`: Ideal profile query (for BM25)
- `q_patient_original`: Original clean query (for reference)
- `intent_terms`: Extracted from ideal profile (for backward compatibility)
- `anchor_phrases`: Extracted from ideal profile
- `idealProfile`: Full ideal profile structure (for Stage B matching)

## Example: Full Ranking Flow

```javascript
const { getSessionContextV5 } = require('./parallel-ranking-package/algorithm/session-context-variants');
const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');

async function rankWithV5(practitioners, userQuery, messages, options = {}) {
  // Generate ideal profile
  const sessionContext = await getSessionContextV5(
    userQuery,
    messages,
    options.location || null,
    {
      specialty: options.specialty || null,
      lexiconsDir: options.lexiconsDir || null,
      model: options.model || 'gpt-4o'
    }
  );
  
  // Build filters
  const filters = {
    q_patient: sessionContext.q_patient,
    intent_terms: sessionContext.intent_terms,
    anchor_phrases: sessionContext.anchor_phrases,
    intentData: sessionContext.intentData,
    idealProfile: sessionContext.idealProfile,
    variantName: 'v5',
    rankingConfig: options.rankingConfig || null
  };
  
  // Rank
  const result = getBM25Shortlist(practitioners, filters, options.shortlistSize || 12);
  
  return {
    results: result.results,
    sessionContext,
    queryInfo: result.queryInfo
  };
}

// Usage
const ranking = await rankWithV5(
  practitioners,
  "I need SVT ablation",
  [{ role: 'user', content: 'I need SVT ablation' }],
  {
    specialty: 'Cardiology',
    lexiconsDir: './lexicons',
    shortlistSize: 12
  }
);

console.log('Top results:', ranking.results.map(r => ({
  name: r.document.name,
  score: r.score,
  profileMatchScore: r.rescoringInfo?.profileMatchScore
})));
```

## Configuration

### Model Selection

```javascript
// Use GPT-4o (default, recommended)
model: 'gpt-4o'

// Use GPT-4o-mini (faster, cheaper, less accurate)
model: 'gpt-4o-mini'

// Use GPT-5.1 when available
model: 'gpt-5.1'
```

### Lexicons

Provide lexicons directory for data-aligned outputs:

```javascript
lexiconsDir: './lexicons'
```

Should contain:
- `subspecialties-from-data.json`
- `procedures-from-data.json`
- `conditions-from-data.json`

### Ranking Config

Override default matching weights:

```javascript
rankingConfig: {
  // Profile matching weights are currently fixed
  // Future: may add configurable weights
}
```

## Advantages of V5

1. **Holistic Understanding**: Model reasons about "what makes a good fit"
2. **Structured Matching**: Matches against profile structure (subspecialties, procedures, conditions)
3. **Importance Weighting**: Required vs preferred vs optional elements
4. **Better Negative Matching**: Explicit "avoid" elements
5. **Captures Nuanced Requirements**: Qualifications, age group, languages, gender

## Performance

- **Latency**: ~1-2 seconds (single GPT-4o call vs 3 parallel GPT-4o-mini calls in V2)
- **Cost**: Higher per query (GPT-4o vs GPT-4o-mini)
- **Accuracy**: Expected to be higher due to better reasoning

## Next Steps

1. Test V5 on benchmark dataset
2. Compare metrics (NDCG@12, Recall@12, MRR) vs V2/V4
3. Tune matching weights if needed
4. Consider hybrid approach (V5 for complex queries, V2 for simple ones)
