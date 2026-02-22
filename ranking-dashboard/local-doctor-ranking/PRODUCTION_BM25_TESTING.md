# Production BM25 Service - Testing Guide

## Setup Complete ✅

The production BM25 service has been integrated and is ready for testing!

### Files Created/Modified

1. **`bm25Service.js`** - Production service with ES6 exports (for production use)
2. **`bm25Service.cjs`** - CommonJS version (for Node.js testing) - auto-generated
3. **`server.js`** - Added `/api/rank-production` endpoint
4. **`public/index.html`** - Added "Production BM25" option with feature toggles

---

## How to Test

### 1. Start the Server

```bash
cd "d:\Coding\Ranking algo optimisation\Local Doctor Ranking"
node server.js
```

The server will:
- Load practitioner data
- Load production BM25 service (CommonJS version)
- Start on http://localhost:3000

### 2. Open the Frontend

Navigate to: **http://localhost:3000**

### 3. Test Production BM25

1. **Select Algorithm**: Choose "Production BM25 (New Features)" from the dropdown
2. **Enable Features** (checkboxes appear):
   - ✅ **Equivalence Normalization**: Uses `normalizeMedicalQuery` (svt → supraventricular tachycardia)
   - ✅ **Separate Query from Filters**: Builds query from `q_patient` + `safe_lane_terms` only
   - ✅ **Two-Stage Retrieval**: Uses Stage A (BM25) → Stage B (rescoring with intent terms)

3. **Enter Query**: e.g., "I need SVT ablation" or "chest pain"

4. **Add Filters** (optional):
   - Specialty: e.g., "Cardiology"
   - Gender: Male/Female
   - Age Group: Adult/Paediatric
   - Language: e.g., "English"

5. **Click Search**

---

## Test Scenarios

### Scenario 1: Basic Production BM25 (Legacy Mode)
- **Algorithm**: Production BM25
- **Options**: All unchecked (legacy mode)
- **Query**: "chest pain"
- **Expected**: Single-stage BM25 ranking (same as before)

### Scenario 2: Equivalence Normalization
- **Algorithm**: Production BM25
- **Options**: ✅ Equivalence Normalization
- **Query**: "svt ablation" or "afib"
- **Expected**: Query expanded with full terms (supraventricular tachycardia, atrial fibrillation)

### Scenario 3: Separate Query from Filters
- **Algorithm**: Production BM25
- **Options**: ✅ Separate Query from Filters
- **Query**: "chest pain"
- **Specialty**: "Cardiology"
- **Expected**: Query doesn't include "Cardiology" (it's already filtered), only "chest pain" is in BM25 query

### Scenario 4: Two-Stage Retrieval
- **Algorithm**: Production BM25
- **Options**: ✅ Two-Stage Retrieval
- **Query**: "I need SVT ablation"
- **Note**: Two-stage requires intent data. For full testing, you'd need to provide `intent_terms`, `anchor_phrases`, etc. in the API call.

### Scenario 5: All Features Enabled
- **Algorithm**: Production BM25
- **Options**: ✅ All three checkboxes
- **Query**: "svt ablation"
- **Expected**: Equivalence normalization + separate query + two-stage retrieval (if intent data available)

---

## API Endpoint

### POST `/api/rank-production`

**Request Body:**
```json
{
  "query": "I need SVT ablation",
  "specialty": "Cardiology",
  "location": "London",
  "shortlistSize": 10,
  "insurancePreference": "Bupa",
  "genderPreference": "male",
  "patient_age_group": "Adult",
  "languages": ["English"],
  "useEquivalenceNormalization": true,
  "separateQueryFromFilters": true,
  "useTwoStageRetrieval": false,
  "q_patient": "I need SVT ablation",
  "safe_lane_terms": ["chest pain"],
  "intent_terms": ["electrophysiology", "arrhythmia"],
  "anchor_phrases": ["SVT ablation"],
  "intentData": {
    "negative_terms": ["pediatric"],
    "likely_subspecialties": [{"name": "Cardiology", "confidence": 0.9}],
    "isQueryAmbiguous": false
  },
  "rankingConfig": {
    "intent_term_weight": 0.3,
    "anchor_phrase_weight": 0.5
  }
}
```

**Response:**
```json
{
  "success": true,
  "query": "I need SVT ablation",
  "results": [
    {
      "rank": 1,
      "name": "Dr. John Smith",
      "title": "Dr",
      "specialty": "Cardiology",
      "score": 0.85,
      "bm25Score": 0.72,
      "qualityBoost": 1.3,
      "exactMatchBonus": 2.0,
      "proximityBoost": null,
      "rescoringInfo": null,
      "profile_url": "https://..."
    }
  ],
  "metadata": {
    "totalPractitioners": 150,
    "shortlistSize": 10,
    "duration": "45ms",
    "options": {
      "useEquivalenceNormalization": true,
      "separateQueryFromFilters": true,
      "useTwoStageRetrieval": false
    },
    "filters": {
      "specialty": "Cardiology",
      "location": "London",
      "insurancePreference": "Bupa",
      "genderPreference": "male"
    },
    "twoStageUsed": false,
    "equivalenceNormalizationUsed": true,
    "separateQueryUsed": true
  }
}
```

---

## What to Look For

### ✅ Success Indicators

1. **Results Return**: Should get 10 results (or requested shortlistSize)
2. **Scores**: Should see BM25 scores, quality boost, exact match bonus
3. **Metadata**: Should show which features were used
4. **Performance**: Should be fast (< 100ms for single-stage, < 200ms for two-stage)

### 🔍 Things to Test

1. **IDF Clamping**: Search for "Dietitian" with specialty filter - should NOT get all zero scores
2. **Zero-Score Handling**: Should always return requested shortlistSize even if many have 0 scores
3. **Equivalence Normalization**: "svt" query should match "supraventricular tachycardia" in profiles
4. **Separate Query**: When enabled, specialty filter shouldn't appear in BM25 query
5. **Two-Stage**: When enabled with intent data, should see rescoringInfo in results

### ⚠️ Known Limitations

- Two-stage retrieval requires `intent_terms` or `anchor_phrases` to be provided (not auto-generated from query)
- For full two-stage testing, you'd need to call the API directly with intent data
- Frontend doesn't yet support providing intent data (can be added later)

---

## Troubleshooting

### Error: "Production BM25 service not available"
- Check that `bm25Service.cjs` exists
- Check server logs for import errors
- Verify CommonJS exports are correct

### Error: "Unexpected token 'export'"
- Make sure you're using `bm25Service.cjs` (not `.js`)
- The `.js` file has ES6 exports which Node.js can't parse

### No Results Returned
- Check filters aren't too restrictive (e.g., insurance + gender might filter out all)
- Check query isn't empty
- Check server logs for errors

---

## Next Steps

1. ✅ Test basic functionality (legacy mode)
2. ✅ Test equivalence normalization
3. ✅ Test separate query from filters
4. ⚠️ Test two-stage retrieval (requires intent data - can test via API directly)
5. ⚠️ Compare results with V2/V5/V6 algorithms
6. ⚠️ Performance testing (latency, memory)

---

## Files Reference

- **Production Service**: `bm25Service.js` (ES6 exports - for production)
- **Test Version**: `bm25Service.cjs` (CommonJS - for Node.js testing)
- **Server Endpoint**: `server.js` → `/api/rank-production`
- **Frontend**: `public/index.html` → "Production BM25" option
