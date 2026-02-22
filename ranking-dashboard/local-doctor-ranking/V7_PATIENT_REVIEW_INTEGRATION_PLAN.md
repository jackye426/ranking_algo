# V7 Patient Review Integration Plan

## Overview

V7 extends V6 progressive ranking by integrating **patient review data** (ratings and review counts) into the ranking algorithm. This adds a real-world quality signal that complements LLM-based evaluation.

---

## Core Concept

V7 = V6 Progressive Ranking + Patient Review Data Integration

**Key Enhancement:**
- V6 uses LLM evaluation to determine fit quality (excellent/good/ill-fit)
- V7 adds patient review signals (rating_value, review_count) to:
  1. **Initial ranking boost** (Stage A/B BM25 quality boost)
  2. **LLM evaluation context** (provide review data to LLM for better evaluation)
  3. **Final re-ranking** (boost highly-rated doctors with many reviews)

---

## Integration Points

### 1. Data Layer

**Current State:**
- `apply-ranking.js` sets `rating_value: null` and `review_count: 0` (not available in merged data)
- `bm25Service.js` already has quality boost logic for ratings/reviews (lines 383-391)

**V7 Requirements:**
- [ ] Add patient review data to practitioner records
- [ ] Map review data from source (e.g., external API, database, JSON file)
- [ ] Update `apply-ranking.js` to load and include review data

**Data Structure:**
```javascript
{
  rating_value: number,      // 0-5 scale (e.g., 4.8)
  review_count: number,      // Total number of reviews (e.g., 127)
  review_summary: {           // Optional: aggregated review insights
    recent_rating: number,    // Last 6 months average
    specialty_match_rating: number, // Rating for specific specialty
    verified_reviews: number, // Count of verified reviews
  }
}
```

---

### 2. Stage A/B BM25 Quality Boost (Already Implemented)

**Current Implementation:**
`bm25Service.js` already includes rating/review boost in `calculateQualityBoost()`:

```javascript
// ⭐ Rating boost
if (practitioner.rating_value >= 4.8) boost *= 1.3;
else if (practitioner.rating_value >= 4.5) boost *= 1.2;
else if (practitioner.rating_value >= 4.0) boost *= 1.1;

// 📊 Review count boost
if (practitioner.review_count >= 100) boost *= 1.2;
else if (practitioner.review_count >= 50) boost *= 1.15;
else if (practitioner.review_count >= 20) boost *= 1.1;
```

**V7 Action:**
- ✅ **Already implemented** - Just needs review data to be populated
- [ ] Verify boost weights are optimal (may need tuning)
- [ ] Consider adding recent_rating boost (last 6 months)

---

### 3. LLM Evaluation Enhancement

**Current V6:**
- `evaluateFit()` evaluates practitioners based on query and profile data only
- No patient review context provided to LLM

**V7 Enhancement:**
- Include patient review data in LLM evaluation prompt
- Help LLM make more informed decisions about "excellent fit"

**Implementation:**
```javascript
// In evaluate-fit.js or progressive-ranking-v6.js
const evaluationPrompt = `
Evaluate these practitioners for the query: "${userQuery}"

For each practitioner, consider:
1. Clinical expertise match
2. Specialty alignment
3. Patient review ratings (if available)
4. Review count (more reviews = more reliable signal)

Practitioner data:
${practitioners.map(p => `
- ${p.name} (${p.specialty})
  Rating: ${p.rating_value || 'N/A'} (${p.review_count || 0} reviews)
  Expertise: ${p.clinical_expertise?.substring(0, 200)}...
`).join('\n')}
`;
```

**Benefits:**
- LLM can factor in patient satisfaction when determining fit
- Highly-rated doctors with many reviews get better evaluation
- Low-rated doctors flagged even if clinical match is good

---

### 4. Progressive Ranking Re-ranking Enhancement

**Current V6:**
- Re-ranks by quality category: excellent > good > ill-fit
- Within each category, maintains original score order

**V7 Enhancement:**
- Within each quality category, apply review-based boost
- Highly-rated doctors with many reviews rank higher within their category

**Implementation:**
```javascript
function rerankByQualityWithReviews(results, evaluationMap, scoreMap, reviewBoost = true) {
  // Group by quality category
  const excellent = [];
  const good = [];
  const illFit = [];
  
  results.forEach(result => {
    const fitCategory = evaluationMap.get(result.id)?.fit_category || 'good';
    if (fitCategory === 'excellent') excellent.push(result);
    else if (fitCategory === 'good') good.push(result);
    else illFit.push(result);
  });
  
  // Sort within each category by: (original score + review boost)
  const sortWithReviews = (arr) => {
    return arr.sort((a, b) => {
      const scoreA = scoreMap.get(a.id) || 0;
      const scoreB = scoreMap.get(b.id) || 0;
      
      if (reviewBoost) {
        const reviewBoostA = calculateReviewBoost(a.document);
        const reviewBoostB = calculateReviewBoost(b.document);
        return (scoreB + reviewBoostB) - (scoreA + reviewBoostA);
      }
      return scoreB - scoreA;
    });
  };
  
  return [...sortWithReviews(excellent), ...sortWithReviews(good), ...sortWithReviews(illFit)];
}

function calculateReviewBoost(practitioner) {
  let boost = 0;
  
  // Rating boost (additive, not multiplicative)
  if (practitioner.rating_value >= 4.8) boost += 0.5;
  else if (practitioner.rating_value >= 4.5) boost += 0.3;
  else if (practitioner.rating_value >= 4.0) boost += 0.1;
  
  // Review count boost (reliability signal)
  if (practitioner.review_count >= 100) boost += 0.3;
  else if (practitioner.review_count >= 50) boost += 0.2;
  else if (practitioner.review_count >= 20) boost += 0.1;
  
  return boost;
}
```

---

## Implementation Steps

### Phase 1: Data Integration

1. **Identify Review Data Source**
   - [ ] External API endpoint
   - [ ] Database table
   - [ ] JSON file with review data
   - [ ] Merge into existing practitioner data

2. **Update Data Loading**
   - [ ] Modify `apply-ranking.js` to load review data
   - [ ] Map review data to practitioner records
   - [ ] Handle missing review data gracefully (default to null/0)

3. **Data Validation**
   - [ ] Verify rating_value is 0-5 scale
   - [ ] Verify review_count is non-negative integer
   - [ ] Handle edge cases (null, undefined, invalid values)

### Phase 2: LLM Evaluation Enhancement

1. **Update evaluate-fit.js**
   - [ ] Add review data to evaluation prompt
   - [ ] Include rating_value and review_count in practitioner context
   - [ ] Test that LLM uses review data appropriately

2. **Update progressive-ranking-v6.js**
   - [ ] Pass review data to evaluateFit() calls
   - [ ] Ensure review data is available in practitioner objects

### Phase 3: Re-ranking Enhancement

1. **Update rerankByQuality function**
   - [ ] Add review boost calculation
   - [ ] Apply boost within quality categories
   - [ ] Make review boost optional (configurable)

2. **Testing**
   - [ ] Test with practitioners that have reviews
   - [ ] Test with practitioners without reviews (should fallback to V6 behavior)
   - [ ] Verify highly-rated doctors rank higher

### Phase 4: Server Integration

1. **Update server.js**
   - [ ] Add `variant: 'v7'` option to `/api/rank` endpoint
   - [ ] Pass through review data in responses
   - [ ] Add metadata about review data usage

2. **Update UI**
   - [ ] Add V7 option to algorithm dropdown
   - [ ] Display review ratings in results
   - [ ] Show review count badges

### Phase 5: Benchmarking & Tuning

1. **Benchmark V7 vs V6**
   - [ ] Compare quality metrics (Precision@K, Recall@K)
   - [ ] Measure impact of review data on ranking
   - [ ] Track which queries benefit most from reviews

2. **Tune Boost Weights**
   - [ ] Optimize rating boost thresholds
   - [ ] Optimize review count thresholds
   - [ ] Balance review boost vs clinical match

---

## Configuration Options

```javascript
{
  // V6 options (inherited)
  maxIterations: 5,
  maxProfilesReviewed: 30,
  batchSize: 12,
  fetchStrategy: 'stage-b',
  targetTopK: 3,
  model: 'gpt-5.1',
  
  // V7 specific options
  useReviewData: true,              // Enable review integration
  reviewBoostWeight: 1.0,         // Multiplier for review boost (0.5-2.0)
  includeReviewsInLLM: true,        // Include review data in LLM evaluation
  minReviewCount: 5,               // Minimum reviews to consider (filter out low-sample)
  reviewBoostInReranking: true,     // Apply review boost in re-ranking
}
```

---

## Expected Benefits

1. **Better Quality Signals**
   - Patient reviews provide real-world validation
   - Complements LLM evaluation with actual patient experience

2. **Improved Ranking**
   - Highly-rated doctors rank higher (assuming clinical match)
   - Doctors with many reviews get reliability boost

3. **User Trust**
   - Users see review ratings in results
   - Transparent quality indicators

4. **Fallback Behavior**
   - If review data unavailable, falls back to V6 behavior
   - No breaking changes

---

## Edge Cases & Safeguards

1. **Missing Review Data**
   - Default to V6 behavior (no review boost)
   - Don't penalize doctors without reviews

2. **Low Sample Size**
   - Ignore reviews if `review_count < minReviewCount` (e.g., < 5)
   - Avoid boosting based on unreliable data

3. **Outdated Reviews**
   - Consider `recent_rating` vs overall `rating_value`
   - May want to decay old reviews

4. **Review Manipulation**
   - Consider verified reviews only
   - Filter suspicious patterns (all 5-star, all 1-star)

5. **Clinical Match vs Reviews**
   - Don't let reviews override strong clinical mismatch
   - Reviews should enhance, not replace, clinical evaluation

---

## Testing Strategy

### Unit Tests
- [ ] Test review boost calculation
- [ ] Test re-ranking with reviews
- [ ] Test missing review data handling

### Integration Tests
- [ ] End-to-end V7 ranking with review data
- [ ] Compare V7 vs V6 on same queries
- [ ] Verify review data appears in LLM evaluation

### Benchmark Tests
- [ ] Run on benchmark dataset
- [ ] Measure quality improvement vs V6
- [ ] Track which queries benefit most

---

## Example Usage

```javascript
const { rankPractitionersProgressiveV7 } = require('./ranking-v2-package');

const results = await rankPractitionersProgressiveV7(
  practitioners, // Must include rating_value and review_count
  "I need SVT ablation",
  {
    // V6 options
    maxIterations: 5,
    maxProfilesReviewed: 30,
    batchSize: 12,
    
    // V7 options
    useReviewData: true,
    includeReviewsInLLM: true,
    reviewBoostWeight: 1.0,
    minReviewCount: 5,
  }
);

// Results include review data
results.results.forEach(r => {
  console.log(`${r.document.name}: ${r.fit_category}`);
  console.log(`  Rating: ${r.document.rating_value} (${r.document.review_count} reviews)`);
});
```

---

## Migration Path

1. **Phase 1**: Add review data to practitioner records (non-breaking)
2. **Phase 2**: Enable review boost in BM25 (already implemented, just needs data)
3. **Phase 3**: Add V7 variant to server (optional, V6 still available)
4. **Phase 4**: Enable LLM review integration
5. **Phase 5**: Enable re-ranking review boost
6. **Phase 6**: Make V7 default (after validation)

---

## Questions to Resolve

1. **Review Data Source**: Where will review data come from?
   - External API?
   - Database?
   - JSON file?

2. **Review Boost Weight**: How much should reviews influence ranking?
   - Should highly-rated doctors always rank higher?
   - Or should reviews only break ties?

3. **Review Freshness**: Should recent reviews matter more?
   - Decay old reviews?
   - Use `recent_rating` vs overall `rating_value`?

4. **Minimum Sample Size**: How many reviews needed to trust rating?
   - 5 reviews? 10? 20?

5. **Review Verification**: Should we only use verified reviews?
   - Filter unverified reviews?
   - Weight verified reviews higher?

---

## Next Steps

1. **Identify review data source** and format
2. **Update data loading** to include reviews
3. **Test review boost** in BM25 (already implemented)
4. **Enhance LLM evaluation** with review context
5. **Implement re-ranking** review boost
6. **Add V7 to server** and UI
7. **Benchmark and tune**

---

## Status

**Current**: Plan created, ready for implementation  
**Next**: Identify review data source and begin Phase 1 (Data Integration)
