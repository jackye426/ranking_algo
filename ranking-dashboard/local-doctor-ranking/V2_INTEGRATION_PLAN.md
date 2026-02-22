# V2 Ranking Integration Plan

## Overview
Integrate the V2 ranking algorithm (`ranking-v2-package`) into the local doctor ranking UI/server, with support for filters (age group, gender, language, specialty).

## Current State Analysis

### Current Server (`server.js`)
- ✅ Uses `getSessionContextParallel` (old version)
- ✅ Uses `getBM25Shortlist` directly
- ✅ Supports manual specialty filter
- ❌ Does NOT support age group, gender, or language filters in API
- ❌ Uses old `parallel` variant instead of `parallel-v2`

### Current UI (`public/index.html`)
- ✅ Has specialty filter input
- ❌ Missing age group filter
- ❌ Missing gender filter
- ❌ Missing language filter

### BM25 Service (`local-bm25-service.js`)
- ✅ Already supports `applyFilterConditions` for:
  - `patient_age_group` (string)
  - `languages` (string[])
  - `gender` (string)
- ✅ Filters are applied BEFORE ranking (pre-filtering)

### V2 Ranking Package (`ranking-v2-package/index.js`)
- ✅ Uses `getSessionContextParallelV2` (correct version)
- ✅ Uses `getBM25Shortlist` (which internally applies filters)
- ❌ Does NOT expose filter options in its API
- ❌ Does NOT support custom ranking weights config

## Integration Steps

### Step 1: Update V2 Ranking Package to Support Filters

**File:** `ranking-v2-package/index.js`

**Changes needed:**
1. Add filter parameters to `rankPractitioners()` options:
   - `patient_age_group` (string, optional)
   - `languages` (string[], optional)
   - `gender` (string, optional)
   - `specialty` (string, optional) - manual specialty filter
2. Pass filters to `getBM25Shortlist` via the `filters` object
3. The BM25 service will automatically apply filters via `applyFilterConditions`

**API Update:**
```javascript
async function rankPractitioners(practitioners, userQuery, options = {}) {
  const {
    // ... existing options ...
    patient_age_group = null,
    languages = null,
    gender = null,
    specialty = null,  // Manual specialty filter
  } = options;
  
  // ... session context generation ...
  
  const filters = {
    q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
    safe_lane_terms: sessionContext.safe_lane_terms || [],
    intent_terms: sessionContext.intent_terms || [],
    anchor_phrases: sessionContext.anchor_phrases || sessionContext.intentData?.anchor_phrases || null,
    searchQuery: sessionContext.enrichedQuery,
    intentData: sessionContext.intentData || null,
    variantName: 'parallel-v2',
    // Add filter conditions
    patient_age_group,
    languages,
    gender,
    ...(config && { rankingConfig: config }),
  };
  
  // Apply manual specialty filter BEFORE ranking if provided
  let filteredPractitioners = practitioners;
  if (specialty) {
    filteredPractitioners = practitioners.filter(p => 
      p.specialty && p.specialty.toLowerCase().includes(specialty.toLowerCase())
    );
  }
  
  const bm25Result = getBM25Shortlist(filteredPractitioners, filters, shortlistSize);
  // ...
}
```

### Step 2: Update Server to Use V2 Ranking Package

**File:** `server.js`

**Changes needed:**
1. Replace imports:
   ```javascript
   // OLD:
   const { getSessionContextParallel } = require('./parallel-ranking-package/algorithm/session-context-variants');
   const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');
   
   // NEW:
   const { rankPractitioners } = require('./ranking-v2-package');
   ```

2. Update `/api/rank` endpoint:
   ```javascript
   app.post('/api/rank', async (req, res) => {
     const { 
       query, 
       messages = [], 
       location = null, 
       shortlistSize = 10,
       specialty = null,
       patient_age_group = null,
       languages = null,
       gender = null,
       rankingConfig = null  // Optional: path to weights file
     } = req.body;
     
     // Use V2 ranking package
     const rankingResult = await rankPractitioners(practitioners, query, {
       messages,
       location,
       shortlistSize,
       specialty,
       patient_age_group,
       languages,
       gender,
       rankingConfig: rankingConfig || 'best-stage-a-recall-weights-desc-tuned.json',
     });
     
     // Format response (similar to current format)
     res.json({
       success: true,
       query: query,
       totalResults: rankingResult.results.length,
       results: rankingResult.results.map((result, index) => ({
         rank: index + 1,
         id: result.document.id,
         name: result.document.name,
         // ... other fields
       })),
       queryInfo: {
         ...rankingResult.sessionContext,
         filteredCount: rankingResult.metadata.totalPractitioners,
         totalCount: practitioners.length,
       },
     });
   });
   ```

### Step 3: Update UI to Include Filter Controls

**File:** `public/index.html`

**Changes needed:**
1. Add filter inputs in the search form:
   - Age group dropdown/input
   - Gender dropdown (Male/Female/Any)
   - Language multi-select or input
   - Keep existing specialty filter

2. Update JavaScript to send filters in API request:
   ```javascript
   const requestBody = {
     query: query,
     shortlistSize: 10,
     specialty: specialtyFilter || null,
     patient_age_group: ageGroupFilter || null,
     gender: genderFilter || null,
     languages: languageFilter ? [languageFilter] : null,
   };
   ```

3. Display active filters in query info section

### Step 4: Handle Filter Application Order

**Important:** Filters are applied in this order:
1. **Manual specialty filter** (if provided) - applied BEFORE ranking
2. **Age group, gender, languages** - applied by BM25 service BEFORE ranking
3. **Ranking** - Stage A (BM25) → Stage B (rescoring)

This ensures efficient filtering (smaller candidate pool = faster ranking).

### Step 5: Update Response Format

**Considerations:**
- V2 ranking returns `sessionContext` with `safe_lane_terms` (new in V2)
- Response should include filter information (what was applied)
- Response should include ranking metadata (Stage A top N, etc.)

## Filter Options Reference

### Age Group Filter
- **Values:** "Adult", "Paediatric", "Child", etc.
- **Type:** String
- **Applied:** Before ranking (pre-filter)

### Gender Filter
- **Values:** "Male", "Female"
- **Type:** String
- **Applied:** Before ranking (pre-filter)

### Language Filter
- **Values:** Array of language strings (e.g., ["English", "Spanish"])
- **Type:** String[]
- **Applied:** Before ranking (pre-filter)

### Specialty Filter
- **Values:** Specialty name string (e.g., "Cardiology")
- **Type:** String
- **Applied:** Before ranking (pre-filter, manual)

## Testing Checklist

- [ ] V2 ranking package accepts filter parameters
- [ ] Filters are applied correctly before ranking
- [ ] Server endpoint accepts and passes filters
- [ ] UI displays filter controls
- [ ] UI sends filters in API request
- [ ] Results are filtered correctly
- [ ] Response includes filter information
- [ ] Backward compatibility maintained (no filters = all practitioners)
- [ ] Performance is acceptable with filters applied

## Migration Notes

- **Backward Compatible:** Existing API calls without filters will continue to work
- **Default Behavior:** No filters = search all practitioners (same as before)
- **V2 Benefits:** Better session context extraction, safe lane terms, improved ranking

## Files to Modify

1. `ranking-v2-package/index.js` - Add filter support
2. `server.js` - Use V2 ranking package, add filter parameters
3. `public/index.html` - Add filter UI controls
4. `ranking-v2-package/README.md` - Update documentation

## Estimated Effort

- **Step 1:** 30 minutes (update V2 package)
- **Step 2:** 45 minutes (update server)
- **Step 3:** 1 hour (update UI)
- **Step 4:** 15 minutes (testing)
- **Total:** ~2.5 hours
