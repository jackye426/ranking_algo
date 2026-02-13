# Productionalization Guide

## Overview

This guide walks you through integrating the parallel ranking algorithm into your production system step-by-step.

---

## Prerequisites

- ✅ Understanding of current production ranking system
- ✅ Access to production codebase
- ✅ Ability to deploy and test changes
- ✅ OpenAI API key configured

---

## Step 1: Understand Current System

### Review Production Ranking Flow

1. **Identify entry point**: Where does ranking happen?
   - Example: `frontend/src/pages/SearchLanding.jsx`
   - Example: `api/rank-practitioners.js`

2. **Understand current flow**:
   - How are queries processed?
   - Where is BM25 ranking called?
   - What data format is used?

3. **Identify integration points**:
   - Where to call parallel algorithm?
   - Where to integrate two-stage retrieval?
   - Where to add rescoring?

---

## Step 2: Extract Algorithm Code

### Copy Algorithm File

```bash
# Copy algorithm to your codebase
cp parallel-ranking-package/algorithm/session-context-variants.js \
   your-codebase/src/services/session-context-variants.js
```

### Install Dependencies

```bash
npm install openai
```

### Update Imports

If your codebase uses ES modules:
```javascript
import { getSessionContextParallel } from './services/session-context-variants.js';
```

If your codebase uses CommonJS:
```javascript
const { getSessionContextParallel } = require('./services/session-context-variants');
```

---

## Step 3: Integrate with Production API

### Example Integration

```javascript
// In your ranking service file
const { getSessionContextParallel } = require('./services/session-context-variants');

async function getRankedPractitioners(practitioners, userQuery, messages, filters) {
  // Step 1: Get session context
  const sessionContext = await getSessionContextParallel(
    userQuery,
    messages,
    filters.location
  );
  
  // Step 2: Stage A - BM25 Retrieval
  const bm25Results = await bm25Service.rank(
    practitioners,
    sessionContext.q_patient,  // Use clean query
    filters,
    50  // Retrieve top 50 for rescoring
  );
  
  // Step 3: Stage B - Rescoring
  const finalResults = await rescoringService.rescore(
    bm25Results,
    {
      intent_terms: sessionContext.intent_terms,
      anchor_phrases: sessionContext.anchor_phrases,
      negative_terms: sessionContext.intentData.negative_terms,
      likely_subspecialties: sessionContext.intentData.likely_subspecialties,
      isQueryAmbiguous: sessionContext.intentData.isQueryAmbiguous
    }
  );
  
  return finalResults.slice(0, filters.shortlistSize || 15);
}
```

---

## Step 4: Update BM25 Service

### Modify BM25 Service for Two-Stage Retrieval

**Before** (single-stage):
```javascript
function rankPractitioners(practitioners, query, filters) {
  // Single BM25 ranking with expanded query
  const expandedQuery = expandQuery(query);
  return bm25Rank(expractitioners, expandedQuery);
}
```

**After** (two-stage):
```javascript
async function rankPractitioners(practitioners, userQuery, messages, filters) {
  // Stage A: BM25 with clean query
  const bm25Results = bm25Rank(practitioners, userQuery, filters, 50);
  
  // Stage B: Rescoring (if session context available)
  if (messages && messages.length > 0) {
    const sessionContext = await getSessionContextParallel(userQuery, messages, filters.location);
    return rescoreResults(bm25Results, sessionContext);
  }
  
  return bm25Results;
}
```

---

## Step 5: Implement Rescoring

### Create Rescoring Function

```javascript
function rescoreResults(bm25Results, sessionContext) {
  return bm25Results.map(result => {
    const searchableText = createSearchableText(result.document).toLowerCase();
    
    // Count matches
    const intentMatches = sessionContext.intent_terms.filter(term =>
      searchableText.includes(term.toLowerCase())
    ).length;
    
    const anchorMatches = sessionContext.anchor_phrases.filter(phrase =>
      searchableText.includes(phrase.toLowerCase())
    ).length;
    
    // Negative term penalty (if enabled)
    let negativePenalty = 0;
    if (sessionContext.intentData.negative_terms.length > 0) {
      const negativeMatches = sessionContext.intentData.negative_terms.filter(term =>
        searchableText.includes(term.toLowerCase())
      ).length;
      
      if (negativeMatches >= 4) negativePenalty = -3.0;
      else if (negativeMatches >= 2) negativePenalty = -2.0;
      else if (negativeMatches === 1) negativePenalty = -1.0;
    }
    
    // Calculate rescoring score
    const rescoringScore = 
      (intentMatches * 0.3) +           // Intent term boost
      (anchorMatches * 0.5) +            // Anchor phrase boost
      negativePenalty;                    // Negative term penalty
    
    // Final score
    const finalScore = result.score + rescoringScore;
    
    return {
      ...result,
      score: Math.max(0, finalScore),
      rescoringInfo: {
        intentMatches,
        anchorMatches,
        negativeMatches: sessionContext.intentData.negative_terms.length > 0 
          ? sessionContext.intentData.negative_terms.filter(term =>
              searchableText.includes(term.toLowerCase())
            ).length
          : 0
      }
    };
  }).sort((a, b) => b.score - a.score);
}
```

---

## Step 6: Testing

### Unit Tests

Test algorithm in isolation:
```javascript
const { getSessionContextParallel } = require('./session-context-variants');

test('should classify SVT ablation query correctly', async () => {
  const result = await getSessionContextParallel(
    "I need SVT ablation",
    [{ role: 'user', content: 'I need SVT ablation' }],
    null
  );
  
  expect(result.intentData.goal).toBe('procedure_intervention');
  expect(result.intentData.specificity).toBe('named_procedure');
  expect(result.anchor_phrases).toContain('SVT ablation');
});
```

### Integration Tests

Test with production data:
```javascript
test('should rank practitioners correctly', async () => {
  const results = await getRankedPractitioners(
    mockPractitioners,
    "I need SVT ablation",
    mockMessages,
    { specialty: 'Cardiology' }
  );
  
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].score).toBeGreaterThan(0);
});
```

### Use Testing Framework

Run benchmark tests:
```bash
cd parallel-ranking-package/testing
npm start
# Open http://localhost:3001/test
# Run benchmark test cases
```

---

## Step 7: Deployment Strategy

### Feature Flag Approach

```javascript
const USE_PARALLEL_RANKING = process.env.USE_PARALLEL_RANKING === 'true';

async function getRankedPractitioners(...) {
  if (USE_PARALLEL_RANKING) {
    return getRankedPractitionersParallel(...);
  } else {
    return getRankedPractitionersLegacy(...);
  }
}
```

### Gradual Rollout

1. **Phase 1**: Enable for 10% of queries
2. **Phase 2**: Monitor metrics, increase to 50%
3. **Phase 3**: Full rollout if metrics are good

### Monitoring

Track these metrics:
- Latency (should be ~400-500ms)
- Error rate (should be < 1%)
- Ranking quality (Precision@K, Recall@K)
- User engagement (click-through rate, booking rate)

---

## Step 8: Error Handling

### Handle API Failures

```javascript
async function getSessionContextParallel(...) {
  try {
    return await getSessionContextParallel(...);
  } catch (error) {
    console.error('[Ranking] Parallel algorithm failed:', error);
    // Fallback to legacy ranking
    return getRankedPractitionersLegacy(...);
  }
}
```

### Handle Timeouts

```javascript
const sessionContext = await Promise.race([
  getSessionContextParallel(...),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 2000)
  )
]).catch(() => {
  // Fallback to simple ranking
  return { q_patient: userQuery, intent_terms: [], ... };
});
```

---

## Common Issues & Solutions

### Issue: Slow Performance

**Problem**: Algorithm takes too long (>1 second)

**Solutions**:
- Cache intent classification results
- Use faster OpenAI model (gpt-4o-mini is already fast)
- Parallelize BM25 and session context calls
- Reduce retrieval pool size

### Issue: Wrong Results

**Problem**: Ranking quality is worse than baseline

**Solutions**:
- Check intent classification accuracy
- Verify negative terms are working correctly
- Adjust rescoring weights
- Review query clarity detection

### Issue: API Errors

**Problem**: OpenAI API failures

**Solutions**:
- Implement retry logic
- Add fallback to legacy ranking
- Monitor API quota/rate limits
- Cache results for common queries

### Issue: Integration Complexity

**Problem**: Hard to integrate with existing code

**Solutions**:
- Start with simple integration (just get session context)
- Gradually add two-stage retrieval
- Use adapter pattern to wrap existing BM25 service
- Create wrapper functions for your codebase

---

## Configuration

### Environment Variables

```bash
OPENAI_API_KEY=your_key_here
USE_PARALLEL_RANKING=true
PARALLEL_RANKING_TIMEOUT=2000
```

### Tuning Parameters

Adjust these based on your needs:

```javascript
// Rescoring weights
const INTENT_TERM_WEIGHT = 0.3;      // Boost per intent term match
const ANCHOR_PHRASE_WEIGHT = 0.5;    // Boost per anchor phrase match
const NEGATIVE_PENALTY_1 = -1.0;      // Penalty for 1 negative match
const NEGATIVE_PENALTY_2 = -2.0;      // Penalty for 2-3 negative matches
const NEGATIVE_PENALTY_4 = -3.0;      // Penalty for 4+ negative matches

// Query clarity threshold
const CONFIDENCE_THRESHOLD = 0.75;    // Threshold for "clear" query
```

---

## Checklist

- [ ] Algorithm code copied to codebase
- [ ] Dependencies installed
- [ ] Integration code written
- [ ] BM25 service updated for two-stage retrieval
- [ ] Rescoring function implemented
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Benchmark tests run
- [ ] Error handling implemented
- [ ] Feature flag added
- [ ] Monitoring set up
- [ ] Gradual rollout planned
- [ ] Documentation updated

---

## Next Steps

1. **Test thoroughly**: Use testing framework to validate
2. **Monitor closely**: Track metrics during rollout
3. **Iterate**: Adjust parameters based on results
4. **Document**: Update team documentation

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [algorithm/README.md](algorithm/README.md) - Algorithm API
- [examples/production-integration.js](examples/production-integration.js) - Integration example
- [docs/NEGATIVE_KEYWORDS.md](docs/NEGATIVE_KEYWORDS.md) - Negative keyword handling

---

**Ready to productionalize?** Start with Step 1 and work through systematically!
