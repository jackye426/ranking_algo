# V6 Progressive Ranking - Implementation Summary

## Quick Overview

V6 extends V2 with **iterative refinement** until the top 3 results are all deemed "excellent fit" by LLM evaluation.

**Key Difference from V2:**
- V2: Run ranking once → return top 12
- V6: Run ranking → evaluate → if top 3 not all excellent → fetch more → re-evaluate → repeat

---

## Core Algorithm

```
1. Run V2 flow → Get top 12
2. LLM evaluates → Assigns excellent/good/ill-fit
3. Check termination:
   ├─ Top 3 all excellent? → Return results
   ├─ 30 profiles reviewed? → Return results
   ├─ Max iterations? → Return results
   └─ NO → Continue
4. Fetch more profiles (Stage B preferred, Stage A fallback)
5. Merge & deduplicate
6. Re-evaluate new profiles (only if under 30 cap)
7. Re-rank by quality (excellent > good > ill-fit)
8. Repeat from step 3
```

---

## Key Components

### 1. Main Function
**File**: `ranking-v2-package/progressive-ranking-v6.js`
**Function**: `rankPractitionersProgressive(practitioners, userQuery, options)`

### 2. Dependencies
- `rankPractitioners` (V2) - Initial ranking
- `evaluateFit` - LLM evaluation
- `getBM25Shortlist` - Fetch with Stage B rescoring
- `getBM25StageATopN` - Fetch Stage A only (fallback)

### 3. Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `maxIterations` | 5 | Maximum refinement cycles |
| `maxProfilesReviewed` | 30 | Maximum total profiles evaluated by LLM |
| `batchSize` | 12 | Profiles to fetch per iteration |
| `fetchStrategy` | `'stage-b'` | `'stage-b'` or `'stage-a'` |
| `targetTopK` | 3 | Number of top results that must be excellent |
| `model` | `'gpt-5.1'` | LLM model for evaluation |
| `shortlistSize` | 12 | Initial shortlist size |
| `stageATopN` | 200 | Stage A pool size (increased for V6) |

---

## Implementation Steps

### Step 1: Create Core Module
- [ ] Create `ranking-v2-package/progressive-ranking-v6.js`
- [ ] Implement main function `rankPractitionersProgressive`
- [ ] Implement helper functions:
  - `evaluateTopResults` - Map LLM evaluation to practitioners
  - `checkTerminationCondition` - Check if top K are all excellent, max iterations reached, or 30 profiles reviewed
  - `fetchAdditionalProfiles` - Fetch next batch
  - `mergeAndDeduplicate` - Combine pools, remove duplicates
  - `rerankByQuality` - Re-rank by quality category

### Step 2: Integration
- [ ] Export from `ranking-v2-package/index.js`
- [ ] Add to `server.js` (optional new endpoint)
- [ ] Update documentation

### Step 3: Testing
- [ ] Unit tests for helpers
- [ ] Integration test with mock LLM
- [ ] Test on sample queries

### Step 4: Benchmarking
- [ ] Create `run-baseline-evaluation-v6.js`
- [ ] Compare vs V2 metrics

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
  }
);

// Check results
console.log(`Iterations: ${results.metadata.iterations}`);
console.log(`Top 3 all excellent: ${results.results.slice(0, 3).every(r => r.fit_category === 'excellent')}`);
```

---

## Expected Output Structure

```javascript
{
  results: [
    {
      document: Object,              // Practitioner object
      score: number,                 // V2 ranking score
      rank: number,                 // Position (1-indexed)
      fit_category: 'excellent',    // LLM evaluation
      evaluation_reason: string,    // Brief reason
      iteration_found: number,      // Which iteration first seen
    }
  ],
  metadata: {
    iterations: number,              // Number of refinement cycles
    profilesEvaluated: number,       // Total profiles evaluated
    terminationReason: string,       // 'top-k-excellent' | 'max-iterations' | 'max-profiles-reviewed' | 'no-more-profiles'
    qualityBreakdown: {
      excellent: number,
      good: number,
      illFit: number,
    },
  },
}
```

---

## Performance Considerations

### LLM Call Count & Profile Cap
- **Initial**: 1 evaluation call (top 12 profiles)
- **Per iteration**: 1 evaluation call (new batch, up to batchSize profiles)
- **Max total profiles evaluated**: 30 (hard cap)
- **Max iterations**: 5 (default)
- **Example**: With batchSize=12, max 3 iterations (12 + 12 + 6 = 30 profiles)

### Cost Estimation
- Each evaluation call: ~$0.01-0.05 (depends on model, profile count)
- 5 iterations: ~$0.05-0.30 per query
- **Optimization**: Only evaluate new profiles (not entire pool)

### Latency
- Initial ranking: ~100-200ms (V2)
- LLM evaluation: ~500-2000ms per call
- Fetch additional: ~50-100ms
- **Total per iteration**: ~600-2300ms
- **Max total (5 iterations)**: ~3-12 seconds

---

## Edge Cases Handled

1. ✅ No more profiles available → Terminate gracefully
2. ✅ LLM evaluation failure → Fallback to original ranking
3. ✅ All profiles ill-fit → Return best available
4. ✅ Duplicate profiles → Deduplicate by practitioner_id
5. ✅ Max iterations reached → Return current best
6. ✅ 30 profiles reviewed (cap reached) → Return current best
7. ✅ Empty initial results → Return immediately

---

## Success Metrics

### Primary Metrics
- **% Top 3 All Excellent**: Fraction of queries where top 3 are all excellent
- **Average Iterations**: How many cycles needed per query
- **Profiles Evaluated**: Total LLM evaluations per query

### Secondary Metrics
- **Quality Improvement**: % excellent at top 3/5/12 vs V2
- **Cost**: LLM calls per query
- **Latency**: Time to final results

---

## Files to Create/Modify

### New Files
1. `ranking-v2-package/progressive-ranking-v6.js` - Core implementation
2. `run-baseline-evaluation-v6.js` - Benchmark script
3. `V6_PROGRESSIVE_RANKING_PLAN.md` - Detailed plan (✅ Created)
4. `V6_FLOW_DIAGRAM.md` - Flow diagrams (✅ Created)
5. `V6_IMPLEMENTATION_SUMMARY.md` - This file (✅ Created)

### Modified Files
1. `ranking-v2-package/index.js` - Export new function
2. `ranking-v2-package/README.md` - Add V6 documentation
3. `server.js` - Add V6 endpoint (optional)

---

## Next Steps

1. **Review Plan**: Review `V6_PROGRESSIVE_RANKING_PLAN.md` for detailed design
2. **Implement Core**: Create `progressive-ranking-v6.js` with main function
3. **Test**: Test on sample queries with mock LLM
4. **Integrate**: Add to server and benchmark scripts
5. **Benchmark**: Compare vs V2 on benchmark dataset

---

## Questions & Decisions

### Resolved ✅
- Use V2 flow as base → ✅ Yes
- LLM evaluation categories → ✅ excellent/good/ill-fit
- Fetch strategy → ✅ Stage B preferred, Stage A fallback
- Re-evaluation strategy → ✅ Only evaluate new profiles (cost-efficient)
- Max iterations → ✅ Default 5

### To Decide 🤔
- Should we cache LLM evaluations? (Avoid re-evaluating same profiles)
- Should we increase Stage A pool size by default? (Recommend: Yes, 200-300)
- Should we add parallel evaluation? (Evaluate multiple batches simultaneously)

---

## References

- **V2 Plan**: `V2_RANKING_AND_CLINICAL_INTENT_PLAN.md`
- **V2 Implementation**: `ranking-v2-package/index.js`
- **Evaluation Module**: `ranking-v2-package/evaluate-fit.js`
- **BM25 Service**: `parallel-ranking-package/testing/services/local-bm25-service.js`
