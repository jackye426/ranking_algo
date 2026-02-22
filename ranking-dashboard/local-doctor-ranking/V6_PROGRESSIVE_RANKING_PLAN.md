# V6 Progressive Ranking Plan

## Overview

V6 implements **progressive ranking** that iteratively improves results until the top 3 profiles are all deemed "excellent fit" by LLM evaluation. It uses the V2 flow as the base, then adds iterative refinement cycles.

---

## Core Concept

1. **Run V2 flow** → Get initial top 12 results
2. **LLM evaluates** top 12 → Assigns quality indicators: `excellent`, `good`, `ill-fit`
3. **Check termination condition**: Are top 3 all `excellent`?
4. **If not**: Fetch more profiles from Stage A or Stage B, merge with existing, re-evaluate, and re-rank
5. **Repeat** until top 3 are all `excellent` OR max iterations reached OR **30 profiles reviewed** OR no more profiles available

---

## Detailed Flow

### Phase 1: Initial V2 Ranking

```
User Query → Session Context V2 → BM25 (Stage A + Stage B) → Top 12 Results
```

- Uses existing `rankPractitioners` from `ranking-v2-package/index.js`
- Returns top 12 ranked practitioners

### Phase 2: LLM Evaluation

```
Top 12 Results → LLM Evaluation → Quality Indicators per Doctor
```

- Uses `evaluateFit` from `ranking-v2-package/evaluate-fit.js`
- Returns `per_doctor` array with `fit_category`: `'excellent' | 'good' | 'ill-fit'`
- Maps evaluation results back to practitioner objects

### Phase 3: Termination Check

```
Check: Are top 3 all 'excellent'?
```

- If **YES**: Return current top 12 (or top 3) as final results
- If **NO**: Proceed to Phase 4

### Phase 4: Fetch Additional Profiles

Two strategies for fetching more profiles:

#### Strategy A: Fetch from Stage A (BM25 only)
- Use `getBM25StageATopN(practitioners, filters, n)` with increased `n`
- Fetch next batch (e.g., profiles ranked 13-24, or 13-36)
- **Pros**: Fast, broad retrieval
- **Cons**: No rescoring benefits

#### Strategy B: Fetch from Stage B (with rescoring)
- Use `getBM25Shortlist(practitioners, filters, shortlistSize)` with increased `shortlistSize`
- Fetch more profiles with full Stage B rescoring
- **Pros**: Better quality, uses intent terms/anchor phrases
- **Cons**: More computation

**Recommendation**: Start with Strategy B (Stage B), fallback to Strategy A if needed.

### Phase 5: Merge and Deduplicate

```
New Profiles + Existing Profiles → Deduplicate by practitioner_id → Combined Pool
```

- Track already-evaluated practitioner IDs
- Only add new profiles that haven't been evaluated yet
- Maintain evaluation history for all profiles seen so far

### Phase 6: Re-evaluate Combined Pool

```
Combined Pool → LLM Evaluation → Updated Quality Indicators
```

- Re-evaluate all profiles in the combined pool (or just new ones + top 12)
- Update quality indicators
- **Note**: Could optimize by only evaluating new profiles, but re-evaluating ensures consistency

### Phase 7: Re-rank Based on Quality

```
Combined Pool + Quality Indicators → Re-rank → New Top 12
```

**Ranking Strategy**:
1. **Excellent fit** profiles ranked first (by original score)
2. **Good fit** profiles ranked next (by original score)
3. **Ill-fit** profiles ranked last (by original score)

Within each category, maintain original ranking order.

### Phase 8: Iterate

Repeat Phases 3-7 until:
- ✅ Top 3 are all `excellent` **OR**
- ❌ Max iterations reached (e.g., 3-5 cycles) **OR**
- ❌ **30 profiles reviewed** (total LLM evaluations) **OR**
- ❌ No more profiles available (exhausted Stage A pool)

**Profile Review Cap**: Total profiles evaluated by LLM is capped at **30**. Once 30 profiles have been reviewed, return current best results regardless of other termination conditions.

---

## Implementation Structure

### New File: `ranking-v2-package/progressive-ranking-v6.js`

```javascript
/**
 * V6 Progressive Ranking
 * 
 * Iteratively refines ranking until top 3 are all "excellent fit"
 */

const { rankPractitioners } = require('./index');
const { evaluateFit } = require('./evaluate-fit');
const { getBM25Shortlist, getBM25StageATopN } = require('../parallel-ranking-package/testing/services/local-bm25-service');

/**
 * Progressive ranking with iterative refinement
 * 
 * @param {Object[]} practitioners - Full practitioner list
 * @param {string} userQuery - Patient query
 * @param {Object} options - Configuration options
 * @param {number} options.maxIterations - Max refinement cycles (default: 5)
 * @param {number} options.maxProfilesReviewed - Max total profiles evaluated by LLM (default: 30)
 * @param {number} options.batchSize - Profiles to fetch per iteration (default: 12)
 * @param {string} options.fetchStrategy - 'stage-b' | 'stage-a' (default: 'stage-b')
 * @param {number} options.targetTopK - Number of top results that must be excellent (default: 3)
 * @param {string} options.model - LLM model for evaluation (default: 'gpt-5.1')
 * @param {...} options - All other options from rankPractitioners (messages, location, rankingConfig, etc.)
 * 
 * @returns {Promise<Object>} Results with progressive ranking metadata
 */
async function rankPractitionersProgressive(practitioners, userQuery, options = {}) {
  // Implementation here
}
```

### Key Functions

1. **`rankPractitionersProgressive`** - Main entry point
2. **`evaluateTopResults`** - Wrapper around `evaluateFit` that maps results to practitioners
3. **`checkTerminationCondition`** - Checks if top K are all excellent, max iterations reached, or 30 profiles reviewed
4. **`fetchAdditionalProfiles`** - Fetches next batch from Stage A or Stage B
5. **`mergeAndDeduplicate`** - Combines new profiles with existing, removes duplicates
6. **`rerankByQuality`** - Re-ranks combined pool based on quality indicators

---

## Configuration Options

### Required Options
- `userQuery` - Patient query string
- `practitioners` - Full practitioner array

### Optional Options
- `maxIterations` - Maximum refinement cycles (default: 5)
- `maxProfilesReviewed` - Maximum total profiles evaluated by LLM (default: 30)
- `batchSize` - Number of additional profiles to fetch per iteration (default: 12)
- `fetchStrategy` - `'stage-b'` (recommended) or `'stage-a'` (default: `'stage-b'`)
- `targetTopK` - Number of top results that must be excellent (default: 3)
- `model` - LLM model for evaluation (default: `'gpt-5.1'`)
- `shortlistSize` - Initial shortlist size (default: 12)
- `stageATopN` - Stage A pool size (default: 150)
- All other V2 options (messages, location, rankingConfig, filters, etc.)

---

## Output Structure

```javascript
{
  results: [
    {
      document: Object,           // Practitioner object
      score: number,              // Final ranking score
      rank: number,               // Position (1-indexed)
      fit_category: 'excellent' | 'good' | 'ill-fit',  // LLM evaluation
      evaluation_reason: string,  // Brief reason from LLM
      iteration_found: number,    // Which iteration this profile was first seen
    }
  ],
  sessionContext: Object,         // Session context from V2
  metadata: {
    totalPractitioners: number,
    filteredPractitioners: number,
    iterations: number,            // Number of refinement cycles
    profilesEvaluated: number,    // Total profiles evaluated by LLM
    profilesFetched: number,       // Total profiles fetched across iterations
    terminationReason: string,    // 'top-k-excellent' | 'max-iterations' | 'max-profiles-reviewed' | 'no-more-profiles'
    qualityBreakdown: {
      excellent: number,          // Count of excellent fits in top 12
      good: number,              // Count of good fits in top 12
      illFit: number,            // Count of ill-fits in top 12
    },
    iterationDetails: [           // Per-iteration metadata
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

---

## Edge Cases & Safeguards

### 1. No More Profiles Available
- If Stage A pool is exhausted (e.g., only 50 profiles total, already fetched 48)
- **Action**: Terminate with current best results

### 2. LLM Evaluation Failure
- If `evaluateFit` throws an error
- **Action**: Fallback to original ranking, log warning, terminate

### 3. All Profiles Are Ill-Fit
- If even after multiple iterations, no excellent fits found
- **Action**: Return best available (good > ill-fit), log warning

### 4. Duplicate Profiles
- Ensure practitioner IDs are tracked to avoid re-evaluating same profile
- **Action**: Deduplicate by `practitioner_id` or `id` field

### 5. Max Iterations Reached
- If termination condition not met after `maxIterations`
- **Action**: Return current best results with `terminationReason: 'max-iterations'`

### 6. Max Profiles Reviewed (30 Cap)
- If total profiles evaluated by LLM reaches `maxProfilesReviewed` (default: 30)
- **Action**: Return current best results with `terminationReason: 'max-profiles-reviewed'`
- **Note**: This cap applies regardless of other termination conditions to control cost and latency

### 7. Empty Results
- If initial V2 ranking returns no results
- **Action**: Return empty results immediately, skip evaluation

---

## Performance Considerations

### LLM Call Optimization
- **Option A**: Re-evaluate entire pool each iteration (more consistent, more expensive)
- **Option B**: Only evaluate new profiles (faster, but may have inconsistencies)
- **Recommendation**: Start with Option B, add Option A as config flag

### Batch Size Tuning
- Smaller batches (6-8): More iterations, more LLM calls, finer control
- Larger batches (18-24): Fewer iterations, fewer LLM calls, faster convergence
- **Default**: 12 profiles per batch
- **Note**: With 30 profile cap, batchSize=12 allows max 3 iterations (12 + 12 + 6 = 30)

### Stage A Pool Size
- Increase `stage_a_top_n` to ensure enough candidates for progressive fetching
- **Default**: 150 (from V2), consider 200-300 for V6

---

## Integration Points

### 1. Use Existing V2 Infrastructure
- Reuse `rankPractitioners` for initial ranking
- Reuse `getSessionContextParallelV2` for session context
- Reuse `getBM25Shortlist` / `getBM25StageATopN` for fetching

### 2. Use Existing Evaluation Module
- Reuse `evaluateFit` from `ranking-v2-package/evaluate-fit.js`
- No changes needed to evaluation logic

### 3. Server Integration
- Add new endpoint `/api/rank-v6` in `server.js`
- Or add `variant: 'v6'` option to existing `/api/rank` endpoint

### 4. Benchmark Integration
- Create `run-baseline-evaluation-v6.js` similar to existing baseline scripts
- Track metrics: iterations, profiles evaluated, quality breakdown

---

## Testing Strategy

### Unit Tests
1. Test termination condition logic
2. Test merge and deduplication
3. Test re-ranking by quality
4. Test edge cases (empty results, no more profiles, etc.)

### Integration Tests
1. End-to-end progressive ranking with mock LLM
2. Verify iteration stops when top 3 are excellent
3. Verify fallback behavior when max iterations reached

### Benchmark Tests
1. Compare V6 vs V2 on benchmark dataset
2. Measure: iterations per query, profiles evaluated, quality improvement
3. Track cost: LLM calls per query

---

## Implementation Checklist

### Phase 1: Core Implementation
- [ ] Create `ranking-v2-package/progressive-ranking-v6.js`
- [ ] Implement `rankPractitionersProgressive` function
- [ ] Implement `evaluateTopResults` helper
- [ ] Implement `checkTerminationCondition` helper
- [ ] Implement `fetchAdditionalProfiles` helper
- [ ] Implement `mergeAndDeduplicate` helper
- [ ] Implement `rerankByQuality` helper

### Phase 2: Integration
- [ ] Export from `ranking-v2-package/index.js`
- [ ] Add to `server.js` endpoint (optional)
- [ ] Update `ranking-v2-package/README.md`

### Phase 3: Testing
- [ ] Unit tests for core functions
- [ ] Integration test with mock LLM
- [ ] Test on sample queries

### Phase 4: Benchmarking
- [ ] Create `run-baseline-evaluation-v6.js`
- [ ] Run on benchmark dataset
- [ ] Compare metrics vs V2

### Phase 5: Documentation
- [ ] Update main README with V6 usage
- [ ] Add examples to `ranking-v2-package/README.md`
- [ ] Document configuration options

---

## Example Usage

```javascript
const { rankPractitionersProgressive } = require('./ranking-v2-package');

const results = await rankPractitionersProgressive(
  practitioners,
  "I need SVT ablation",
  {
    maxIterations: 5,
    maxProfilesReviewed: 30,
    batchSize: 12,
    fetchStrategy: 'stage-b',
    targetTopK: 3,
    model: 'gpt-5.1',
    rankingConfig: './ranking-weights.json',
    shortlistSize: 12,
  }
);

console.log(`Iterations: ${results.metadata.iterations}`);
console.log(`Top 3 all excellent: ${results.results.slice(0, 3).every(r => r.fit_category === 'excellent')}`);
results.results.forEach((r, idx) => {
  console.log(`${idx + 1}. ${r.document.name} - ${r.fit_category}`);
});
```

---

## Future Enhancements

1. **Adaptive Batch Size**: Increase batch size if many ill-fits found
2. **Quality-Based Fetching**: Fetch profiles similar to excellent fits (embedding-based)
3. **Early Termination**: Stop if top 5 are excellent (configurable threshold)
4. **Caching**: Cache LLM evaluations to avoid re-evaluating same profiles
5. **Parallel Evaluation**: Evaluate multiple batches in parallel (if cost allows)

---

## Questions to Resolve

1. **Re-evaluation Strategy**: Re-evaluate entire pool or only new profiles?
   - **Recommendation**: Start with "only new profiles" for cost efficiency

2. **Fetch Strategy Priority**: Always use Stage B, or try Stage A first?
   - **Recommendation**: Always use Stage B (better quality), Stage A as fallback

3. **Ranking Within Categories**: How to rank within excellent/good/ill-fit?
   - **Recommendation**: Use original V2 score (maintains quality ordering)

4. **Max Iterations**: What's a reasonable default?
   - **Recommendation**: 5 iterations (60 profiles max evaluated)

5. **Stage A Pool Size**: Should V6 use larger default?
   - **Recommendation**: Yes, increase to 200-300 for more candidates
