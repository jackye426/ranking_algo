# V2 Ranking Algorithm - Packaged Module

A clean, reusable module for the V2 ranking algorithm that combines session context extraction with two-stage BM25 retrieval and rescoring.

## Overview

The V2 ranking algorithm uses:
- **Session Context Extraction**: Extracts intent terms, anchor phrases, safe lane terms, and clinical intent from patient queries
- **Two-Stage BM25 Retrieval**: 
  - Stage A: Broad retrieval using clean query + safe lane terms + anchor phrases
  - Stage B: Rescoring using intent terms, negative terms, subspecialties, and safe lane matches
- **Configurable Weights**: Supports custom ranking weights for fine-tuning

## Installation

The module is self-contained and requires the following dependencies (located in the parent directory):
- `../parallel-ranking-package/algorithm/session-context-variants.js`
- `../parallel-ranking-package/testing/services/local-bm25-service.js`

## Usage

### Basic Usage

```javascript
const { rankPractitioners } = require('./ranking-v2-package');

const results = await rankPractitioners(practitioners, userQuery, {
  shortlistSize: 12,
});

// Access results
results.results.forEach((result) => {
  console.log(`${result.rank}. ${result.document.name}`);
  console.log(`   Score: ${result.score}`);
});
```

### With Custom Ranking Weights

```javascript
const results = await rankPractitioners(practitioners, userQuery, {
  rankingConfig: '../best-stage-a-recall-weights-desc-tuned.json', // Path to weights file
  shortlistSize: 12,
});

// Or pass weights object directly
const results = await rankPractitioners(practitioners, userQuery, {
  rankingConfig: {
    stage_a_top_n: 150,
    high_signal_1: 2.0,
    high_signal_2: 4.0,
    // ... other weights
  },
  shortlistSize: 12,
});
```

### With Conversation History

```javascript
const messages = [
  { role: 'user', content: 'I need to see a doctor for chest pain' },
  { role: 'assistant', content: 'I can help you find a cardiologist.' },
  { role: 'user', content: userQuery },
];

const results = await rankPractitioners(practitioners, userQuery, {
  messages,
  shortlistSize: 12,
});
```

### With Filters

```javascript
const results = await rankPractitioners(practitioners, userQuery, {
  shortlistSize: 12,
  manualSpecialty: 'Cardiology',  // Filter by specialty before ranking
  patient_age_group: 'Adult',     // Filter by age group
  gender: 'Female',               // Filter by gender
  languages: ['English', 'Spanish'], // Filter by languages
});
```

### With Cached Session Context (for batch processing)

```javascript
// First query - generates session context
const results1 = await rankPractitioners(practitioners, query1, {
  shortlistSize: 12,
});

// Cache the session context
const sessionContextCache = {
  'query-1': results1.sessionContext,
};

// Subsequent queries - reuse cached context
const results2 = await rankPractitioners(practitioners, query2, {
  sessionContextCache,
  sessionContextCacheId: 'query-1',
  shortlistSize: 12,
});
```

### Synchronous Ranking (with pre-computed session context)

```javascript
const { rankPractitionersSync } = require('./ranking-v2-package');

// If you already have session context
const { getSessionContextParallelV2 } = require('../parallel-ranking-package/algorithm/session-context-variants');
const sessionContext = await getSessionContextParallelV2(userQuery, messages, location);

const results = rankPractitionersSync(practitioners, sessionContext, {
  rankingConfig: '../best-stage-a-recall-weights-desc-tuned.json',
  shortlistSize: 12,
});
```

### V6 Progressive Ranking (Iterative Refinement)

V6 extends V2 with iterative refinement until the top 3 results are all "excellent fit" or 30 profiles reviewed:

```javascript
const { rankPractitionersProgressive } = require('./ranking-v2-package');

const results = await rankPractitionersProgressive(practitioners, userQuery, {
  maxIterations: 5,              // Max refinement cycles (default: 5)
  maxProfilesReviewed: 30,       // Max profiles evaluated by LLM (default: 30)
  batchSize: 12,                 // Profiles to fetch per iteration (default: 12)
  fetchStrategy: 'stage-b',      // 'stage-b' (preferred) or 'stage-a' (default: 'stage-b')
  targetTopK: 3,                 // Number of top results that must be excellent (default: 3)
  model: 'gpt-5.1',              // LLM model for evaluation (default: 'gpt-5.1')
  shortlistSize: 12,             // Initial shortlist size (default: 12)
  // All V2 options also supported:
  // rankingConfig, messages, location, filters, etc.
});

// Check results
console.log(`Iterations: ${results.metadata.iterations}`);
console.log(`Profiles Evaluated: ${results.metadata.profilesEvaluated}`);
console.log(`Termination Reason: ${results.metadata.terminationReason}`);
console.log(`Top 3 All Excellent: ${results.results.slice(0, 3).every(r => r.fit_category === 'excellent')}`);

// Each result includes fit_category and evaluation_reason
results.results.forEach((r, idx) => {
  console.log(`${idx + 1}. ${r.document.name} - ${r.fit_category}`);
  console.log(`   ${r.evaluation_reason}`);
});
```

**V6 Features:**
- Iteratively refines ranking until top 3 are all "excellent fit"
- Caps total profiles reviewed at 30 (configurable)
- Uses LLM evaluation to categorize profiles as excellent/good/ill-fit
- Re-ranks by quality category (excellent > good > ill-fit)
- Provides detailed iteration metadata

See `example-v6.js` for complete V6 usage examples.

## API Reference

### `rankPractitioners(practitioners, userQuery, options)`

Main async function to rank practitioners.

**Parameters:**
- `practitioners` (Array): Array of practitioner objects
- `userQuery` (string): The patient's search query
- `options` (Object): Configuration options
  - `messages` (Array, optional): Conversation history, defaults to `[]`
  - `location` (string|null, optional): Location filter
  - `rankingConfig` (Object|string|null, optional): Ranking weights config object or path to JSON file
  - `shortlistSize` (number, optional): Number of results to return, defaults to `12`
  - `lexiconsDir` (string, optional): Directory path for lexicons, defaults to parent directory
  - `specialty` (string, optional): Expected specialty for context
  - `sessionContextCache` (Object, optional): Pre-computed session context cache
  - `sessionContextCacheId` (string, optional): ID to lookup in sessionContextCache

**Returns:** Promise resolving to:
```javascript
{
  results: [
    {
      document: Object,      // Full practitioner object
      score: number,         // Final ranking score
      rank: number,          // Position (1-indexed)
      bm25Score: number,      // Stage A BM25 score
      rescoringInfo: Object  // Stage B rescoring details
    }
  ],
  sessionContext: {
    q_patient: string,
    enrichedQuery: string,
    intent_terms: Array,
    anchor_phrases: Array,
    safe_lane_terms: Array,
    intentData: Object,
    queryClarity: string,
  },
  metadata: {
    totalPractitioners: number,
    stageATopN: number,
    shortlistSize: number,
    query: string,
  }
}
```

### `rankPractitionersSync(practitioners, sessionContext, options)`

Synchronous ranking function (requires pre-computed session context).

**Parameters:**
- `practitioners` (Array): Array of practitioner objects
- `sessionContext` (Object): Pre-computed session context object
- `options` (Object): Configuration options
  - `rankingConfig` (Object|string|null, optional): Ranking weights config
  - `shortlistSize` (number, optional): Number of results to return, defaults to `12`

**Returns:** Same structure as `rankPractitioners`

### `rankPractitionersProgressive(practitioners, userQuery, options)`

V6 Progressive ranking with iterative refinement.

**Parameters:**
- `practitioners` (Array): Array of practitioner objects
- `userQuery` (string): The patient's search query
- `options` (Object): Configuration options
  - `maxIterations` (number, optional): Max refinement cycles, defaults to `5`
  - `maxProfilesReviewed` (number, optional): Max total profiles evaluated by LLM, defaults to `30`
  - `batchSize` (number, optional): Profiles to fetch per iteration, defaults to `12`
  - `fetchStrategy` (string, optional): `'stage-b'` (preferred) or `'stage-a'`, defaults to `'stage-b'`
  - `targetTopK` (number, optional): Number of top results that must be excellent, defaults to `3`
  - `model` (string, optional): LLM model for evaluation, defaults to `'gpt-5.1'`
  - `shortlistSize` (number, optional): Initial shortlist size, defaults to `12`
  - All V2 options also supported (messages, location, rankingConfig, filters, etc.)

**Returns:** Promise resolving to:
```javascript
{
  results: [
    {
      document: Object,              // Full practitioner object
      score: number,                 // V2 ranking score
      rank: number,                 // Position (1-indexed)
      fit_category: 'excellent' | 'good' | 'ill-fit',  // LLM evaluation
      evaluation_reason: string,     // Brief reason from LLM
      iteration_found: number,      // Which iteration this profile was first seen
    }
  ],
  sessionContext: Object,            // Session context from V2
  metadata: {
    totalPractitioners: number,
    filteredPractitioners: number,
    iterations: number,              // Number of refinement cycles
    profilesEvaluated: number,       // Total profiles evaluated by LLM
    profilesFetched: number,         // Total profiles fetched across iterations
    terminationReason: string,       // 'top-k-excellent' | 'max-iterations' | 'max-profiles-reviewed' | 'no-more-profiles'
    qualityBreakdown: {
      excellent: number,             // Count of excellent fits in top 12
      good: number,                  // Count of good fits in top 12
      illFit: number,                // Count of ill-fits in top 12
    },
    iterationDetails: [             // Per-iteration metadata
      {
        iteration: number,
        profilesFetched: number,
        profilesEvaluated: number,
        top3AllExcellent: boolean,
        qualityBreakdown: { excellent, good, illFit },
      }
    ],
  },
}
```

## Ranking Weights Configuration

The ranking algorithm supports custom weights via `rankingConfig`. Default weights are used if not provided.

Example weights file structure:
```json
{
  "stage_a_top_n": 150,
  "k1": 1.2,
  "b": 0.75,
  "field_weights": {
    "clinical_expertise": 3.0,
    "procedure_groups": 2.8,
    "specialty": 2.5,
    "subspecialties": 2.2
  },
  "high_signal_1": 2.0,
  "high_signal_2": 4.0,
  "pathway_1": 1.0,
  "pathway_2": 2.0,
  "pathway_3": 3.0,
  "procedure_per_match": 0.5,
  "anchor_per_match": 0.2,
  "anchor_cap": 0.6,
  "subspecialty_factor": 0.3,
  "subspecialty_cap": 0.5,
  "negative_1": -1.0,
  "negative_2": -2.0,
  "negative_4": -3.0,
  "safe_lane_1": 1.0,
  "safe_lane_2": 2.0,
  "safe_lane_3_or_more": 3.0
}
```

## Examples

See `example.js` for V2 usage examples and `example-v6.js` for V6 progressive ranking examples.

Run the examples:
```bash
# V2 example
node ranking-v2-package/example.js

# V6 example
node ranking-v2-package/example-v6.js
```

## Dependencies

- Node.js
- `parallel-ranking-package` modules (located in parent directory)
- OpenAI API key (for session context extraction, set in `../parallel-ranking-package/.env`)

## File Structure

```
ranking-v2-package/
├── index.js                    # Main module exports
├── progressive-ranking-v6.js    # V6 progressive ranking implementation
├── evaluate-fit.js              # LLM evaluation module
├── example.js                   # V2 usage examples
├── example-v6.js                # V6 usage examples
└── README.md                    # This file
```

## Notes

- The algorithm uses the `parallel-v2` variant by default
- Session context extraction requires OpenAI API access
- For batch processing, consider caching session contexts to avoid redundant API calls
- The module maintains backward compatibility with existing evaluation scripts
- All paths are resolved relative to the parent directory where `parallel-ranking-package` is located
