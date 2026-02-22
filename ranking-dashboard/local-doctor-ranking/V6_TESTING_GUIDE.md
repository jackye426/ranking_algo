# V6 Progressive Ranking - Testing Guide

## Quick Start

### 1. Start the Server

```bash
node server.js
```

The server will start on `http://localhost:3000` (or the port specified in `SERVER_PORT` env var).

### 2. Test via UI

1. Open `http://localhost:3000` in your browser
2. Select **"V6 (Progressive Ranking - GPT-5.1)"** from the Algorithm dropdown
3. Enter a query like:
   - "I need SVT ablation"
   - "chest pain cardiologist"
   - "atrial fibrillation treatment"
4. Click **Search**
5. Review the results:
   - Check the **V6 Progressive Ranking** metadata showing iterations, profiles evaluated, etc.
   - Check if **Top 3 All Excellent** is ✅ or ❌
   - Review **fit_category** badges (excellent/good/ill-fit) on each result
   - See **iteration_found** indicator showing which iteration each profile was discovered

### 3. Test via API (cURL)

```bash
# Basic V6 request
curl -X POST http://localhost:3000/api/rank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I need SVT ablation",
    "variant": "v6",
    "shortlistSize": 12
  }'

# V6 with custom options
curl -X POST http://localhost:3000/api/rank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I need SVT ablation",
    "variant": "v6",
    "maxIterations": 5,
    "maxProfilesReviewed": 30,
    "batchSize": 12,
    "fetchStrategy": "stage-b",
    "targetTopK": 3,
    "shortlistSize": 12
  }'

# V6 with filters
curl -X POST http://localhost:3000/api/rank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I need SVT ablation",
    "variant": "v6",
    "specialty": "Cardiology",
    "patient_age_group": "Adult",
    "languages": ["English"]
  }'
```

### 4. Test via JavaScript/Node.js

```javascript
const fetch = require('node-fetch'); // or use native fetch in Node 18+

async function testV6() {
  const response = await fetch('http://localhost:3000/api/rank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'I need SVT ablation',
      variant: 'v6',
      maxIterations: 5,
      maxProfilesReviewed: 30,
      batchSize: 12,
      shortlistSize: 12,
    }),
  });

  const data = await response.json();
  
  console.log('Query:', data.query);
  console.log('Iterations:', data.queryInfo.iterations);
  console.log('Profiles Evaluated:', data.queryInfo.profilesEvaluated);
  console.log('Termination Reason:', data.queryInfo.terminationReason);
  console.log('Top 3 All Excellent:', data.queryInfo.top3AllExcellent);
  console.log('\nQuality Breakdown:');
  console.log('  Excellent:', data.queryInfo.qualityBreakdown.excellent);
  console.log('  Good:', data.queryInfo.qualityBreakdown.good);
  console.log('  Ill-fit:', data.queryInfo.qualityBreakdown.illFit);
  
  console.log('\nTop 3 Results:');
  data.results.slice(0, 3).forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.name} - ${r.fit_category}`);
    console.log(`   Reason: ${r.evaluation_reason || r.fit_reason}`);
    console.log(`   Found in iteration: ${r.iteration_found}`);
  });
}

testV6().catch(console.error);
```

## Expected Behavior

### Successful V6 Run

- **Initial**: V2 ranking returns top 12
- **Evaluation**: LLM evaluates all 12 profiles
- **Check**: If top 3 are all excellent → terminate
- **If not**: Fetch more profiles (batchSize=12), evaluate, re-rank
- **Repeat**: Until top 3 excellent OR 30 profiles reviewed OR max iterations

### Termination Reasons

- `top-k-excellent`: ✅ Success - Top 3 are all excellent fit
- `max-profiles-reviewed`: ⚠️ Cap reached - 30 profiles evaluated
- `max-iterations`: ⚠️ Max iterations reached (default: 5)
- `no-more-profiles`: ⚠️ No more profiles available to fetch
- `evaluation-failed`: ❌ LLM evaluation error (fallback to 'good')

### Response Structure

```json
{
  "success": true,
  "query": "I need SVT ablation",
  "totalResults": 12,
  "results": [
    {
      "rank": 1,
      "name": "Dr. John Smith",
      "fit_category": "excellent",
      "evaluation_reason": "Specializes in SVT ablation...",
      "iteration_found": 0,
      "score": 0.95,
      ...
    }
  ],
  "queryInfo": {
    "variant": "v6",
    "iterations": 2,
    "profilesEvaluated": 24,
    "profilesFetched": 24,
    "terminationReason": "top-k-excellent",
    "qualityBreakdown": {
      "excellent": 5,
      "good": 6,
      "illFit": 1
    },
    "top3AllExcellent": true,
    ...
  },
  "processingTime": {
    "ranking": 3500,
    "evaluation": 0,
    "total": 3500
  }
}
```

## Troubleshooting

### Issue: "LLM evaluation failed"

**Cause**: OpenAI API error or rate limit

**Solution**: 
- Check `.env` file has valid `OPENAI_API_KEY`
- Check API quota/rate limits
- V6 will fallback to 'good' category and continue

### Issue: "No more profiles available"

**Cause**: All profiles in Stage A pool have been evaluated

**Solution**: 
- Increase `stage_a_top_n` in ranking config
- Reduce `batchSize` to fetch smaller batches
- This is expected if query is very specific

### Issue: Slow performance

**Cause**: Multiple LLM calls (one per iteration)

**Solution**:
- Reduce `maxIterations` (default: 5)
- Reduce `maxProfilesReviewed` (default: 30)
- Reduce `batchSize` (default: 12)
- Note: V6 is inherently slower than V2 due to iterative refinement

### Issue: Top 3 never become excellent

**Cause**: Query may not have enough excellent matches in dataset

**Solution**:
- Check if query is too specific
- Try broader queries
- Review quality breakdown to see distribution
- This is expected behavior - V6 returns best available

## Comparison Testing

### Compare V2 vs V6

```bash
# V2
curl -X POST http://localhost:3000/api/rank \
  -H "Content-Type: application/json" \
  -d '{"query": "I need SVT ablation", "variant": "v2"}' > v2-result.json

# V6
curl -X POST http://localhost:3000/api/rank \
  -H "Content-Type: application/json" \
  -d '{"query": "I need SVT ablation", "variant": "v6"}' > v6-result.json

# Compare
diff v2-result.json v6-result.json
```

### Metrics to Compare

- **Top 3 quality**: Are top 3 excellent in V6 vs V2?
- **Iterations**: How many iterations did V6 need?
- **Profiles evaluated**: How many profiles were reviewed?
- **Processing time**: V6 will be slower (expected)
- **Quality breakdown**: Distribution of excellent/good/ill-fit

## Performance Notes

- **V2**: ~100-200ms (single ranking pass)
- **V6**: ~3-12 seconds (multiple iterations + LLM evaluations)
- **LLM calls**: 1 + iterations (e.g., 3 iterations = 4 LLM calls)
- **Cost**: ~$0.01-0.05 per LLM evaluation call

## Next Steps

1. ✅ Test basic V6 functionality
2. ✅ Compare V6 vs V2 results
3. ✅ Test with various queries
4. ✅ Monitor performance and costs
5. ✅ Tune parameters (maxIterations, batchSize, etc.)
