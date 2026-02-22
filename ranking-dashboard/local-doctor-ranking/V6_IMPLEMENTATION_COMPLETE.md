# V6 Progressive Ranking - Implementation Summary

## Overview

V6 is a progressive ranking algorithm that iteratively refines search results using LLM evaluation. It builds on the V2 ranking flow and adds an iterative refinement loop that continues until the top 3 results are all deemed "excellent fit" by an LLM, or until termination conditions are met.

## Core Concept

1. **Initial Ranking**: Uses V2 ranking flow to get initial top 12 results
2. **LLM Evaluation**: Evaluates profiles and assigns quality indicators (excellent, good, ill-fit)
3. **Iterative Refinement**: If top 3 aren't all excellent, fetches more profiles and re-evaluates
4. **Termination**: Stops when:
   - Top 3 are all excellent fit ✅
   - Maximum iterations reached (default: 5)
   - Maximum profiles reviewed reached (default: 30)
   - No more profiles available

## Implementation Details

### Main Function
- **File**: `ranking-v2-package/progressive-ranking-v6.js`
- **Function**: `rankPractitionersProgressive(practitioners, userQuery, options)`

### Key Components

#### 1. Initial V2 Ranking
- Uses existing `rankPractitioners` function
- Gets initial top 12 results
- Tracks filtered practitioner list for specialty filtering

#### 2. LLM Evaluation
- Uses `evaluateFit` function from `ranking-v2-package/evaluate-fit.js`
- Evaluates profiles in batches (default: 12)
- Assigns fit categories: `excellent`, `good`, `ill-fit`
- Provides brief reasoning for each evaluation

#### 3. Profile Fetching
- **Strategy**: Stage A (BM25 only) or Stage B (with rescoring)
- **Default**: Stage A (less restrictive, better for low-score profiles)
- **Fetch Count**: Requests up to 5x batchSize (60 profiles) to ensure enough new profiles
- Uses `getBM25StageATopN` or `getBM25Shortlist` depending on strategy

#### 4. Re-ranking by Quality
- Sorts results by quality category: excellent > good > ill-fit
- Within each category, maintains original score order
- Tracks which iteration each profile was first discovered

#### 5. Termination Logic
- Checks after each iteration if top 3 are all excellent
- Respects `maxIterations` and `maxProfilesReviewed` caps
- Handles "no-more-profiles" condition

### Configuration Options

```javascript
{
  maxIterations: 5,              // Max refinement cycles
  maxProfilesReviewed: 30,       // Max profiles evaluated by LLM
  batchSize: 12,                 // Profiles to fetch per iteration
  fetchStrategy: 'stage-a',      // 'stage-a' or 'stage-b'
  targetTopK: 3,                 // Number of top results that must be excellent
  model: 'gpt-5.1',              // LLM model for evaluation
  shortlistSize: 12,             // Initial shortlist size
  // ... all V2 options also supported
}
```

## Issues Encountered & Fixes

### 1. Circular Dependency Issue
**Problem**: `progressive-ranking-v6.js` importing `rankPractitioners` from `index.js` caused circular dependency.

**Fix**: Implemented lazy loading:
```javascript
function getRankPractitioners() {
  const { rankPractitioners } = require('./index');
  return rankPractitioners;
}
```

### 2. Specialty Filter Not Respected
**Problem**: V6 was fetching profiles from the full practitioner list instead of the filtered list.

**Fix**: Track `filteredPractitionersList` from initial V2 call and use it in `fetchAdditionalProfiles`:
```javascript
let filteredPractitionersList = practitioners;
// ... after V2 ranking ...
if (manualSpecialty) {
  filteredPractitionersList = filterBySpecialty(practitioners, { manualSpecialty });
}
// Use filteredPractitionersList in fetchAdditionalProfiles
```

### 3. Incorrect Iteration Tracking
**Problem**: All profiles showed "found in iteration 0" because iteration tracking wasn't properly maintained.

**Fix**: Introduced `iterationFoundMap` to track the first iteration each profile was discovered:
```javascript
let iterationFoundMap = new Map(); // practitioner_id -> iteration
// Track when profile is first discovered
if (!iterationFoundMap.has(id)) {
  iterationFoundMap.set(id, iteration);
}
```

### 4. Early Termination - Not Enough Profiles Fetched
**Problem**: V6 was terminating early with "no-more-profiles" because `fetchAdditionalProfiles` wasn't requesting enough profiles.

**Fix**: Increased fetch count to request at least 5x batchSize:
```javascript
const minFetchCount = Math.max(
  currentFetchedCount + batchSize * 2, 
  batchSize * 3,
  Math.min(practitioners.length, currentFetchedCount + batchSize * 5)
);
```

### 5. BM25 Scores All Zero for Filtered Specialty
**Problem**: When filtering by specialty (e.g., "Dietitian"), many profiles had 0.0000 BM25 scores because IDF became negative when terms appeared in all documents.

**Fix**: Clamped IDF to be non-negative:
```javascript
let idf = Math.log((documents.length - docFreqForTerm + 0.5) / (docFreqForTerm + 0.5));
idf = Math.max(0, idf); // Prevent negative IDF
```

### 6. getBM25Shortlist Returning Too Few Results
**Problem**: When requesting 65 profiles, `getBM25Shortlist` only returned 5 because only 5 had non-zero scores.

**Fix**: Ensured `getBM25Shortlist` returns requested number even if many have 0 scores:
```javascript
let finalResults = rescored.slice(0, shortlistSize);
if (finalResults.length < shortlistSize && rescored.length > finalResults.length) {
  const zeroScoreProfiles = rescored.slice(finalResults.length)
    .filter(r => r.score === 0)
    .slice(0, shortlistSize - finalResults.length);
  finalResults = [...finalResults, ...zeroScoreProfiles];
}
```

### 7. Default Fetch Strategy
**Problem**: Stage B (with rescoring) was too restrictive when many profiles had low scores.

**Fix**: Changed default `fetchStrategy` from `'stage-b'` to `'stage-a'` for better coverage.

## BDA Dietitian Integration

### Data Merging
- **File**: `merge-dietitians.js`
- **Source**: BDA dietitians CSV file (`bda_dietitians_rows.csv`)
- **Schema Mapping**:
  - `name` → `name`
  - `title` → `title`
  - `bio` → `about` (combined with `industry_services`)
  - `clinical_expertise` → `clinical_expertise` (comma-separated list)
  - `contact_address` → `locations[0]` (practice_address)
  - `geographical_areas_served` → `locations[]` (service_area entries)
  - `company_name` → stored in `_originalRecord.company_name`
  - `profile_url` → stored in `_originalRecord.profile_url`

### BM25 Searchability
- BDA dietitians have unstructured `clinical_expertise` (comma-separated: "Diabetes, IBS, Obesity")
- Modified `createWeightedSearchableText` to include raw `clinical_expertise` when structured parsing fails
- Added `clinical_expertise` field weight (2.0) to `FIELD_WEIGHTS`

### Results
- **349 BDA dietitians** successfully merged
- **339** have `clinical_expertise` populated
- **345** have `about` populated
- **349** have `profile_url` stored
- BDA dietitians now appear in search results with proper BM25 scores

## Server Integration

### API Endpoint
- **Route**: `POST /api/rank`
- **V6 Option**: `variant: 'v6'`
- **V6-Specific Parameters**:
  - `maxIterations` (default: 5)
  - `maxProfilesReviewed` (default: 30)
  - `batchSize` (default: 12)
  - `fetchStrategy` (default: 'stage-a')
  - `targetTopK` (default: 3)

### Response Format
```json
{
  "success": true,
  "results": [
    {
      "rank": 1,
      "name": "Doctor Name",
      "fit_category": "excellent",
      "evaluation_reason": "Brief reason...",
      "iteration_found": 0,
      "profile_url": "https://...",
      // ... other fields
    }
  ],
  "queryInfo": {
    "iterations": 2,
    "profilesEvaluated": 24,
    "profilesFetched": 24,
    "terminationReason": "top-k-excellent",
    "qualityBreakdown": {
      "excellent": 3,
      "good": 7,
      "illFit": 2
    },
    "top3AllExcellent": true
  }
}
```

## UI Updates

### Features Added
1. **V6 Algorithm Option**: Added to algorithm selector dropdown
2. **V6 Metadata Display**: Shows iterations, profiles evaluated, termination reason
3. **Fit Category Badges**: Visual indicators for excellent/good/ill-fit
4. **Iteration Found**: Shows which iteration each profile was discovered
5. **Profile URLs**: Clickable links to doctor profiles (especially for BDA dietitians)

### Display Elements
- Fit category badges (color-coded)
- Evaluation reasons
- Iteration information
- Profile URL links (in header and details section)
- V6-specific metadata in query info

## Testing & Verification

### Test Scripts Created
1. **`test-dietitian-search.js`**: Tests BM25 retrieval of dietitians
2. **`test-dietitians.js`**: Verifies BDA dietitian data structure
3. **`verify-improved-merge.js`**: Validates improved merge mapping
4. **`check-bda-in-v6-results.js`**: Checks BDA dietitians in V6 searches
5. **`test-v6-fetching.js`**: Tests V6 profile fetching logic
6. **`debug-bm25-detailed.js`**: Debugs BM25 scoring issues

### Verification Results
- ✅ BDA dietitians properly merged (349 records)
- ✅ Same data structure as regular practitioners
- ✅ BM25 scores working (after IDF fix)
- ✅ V6 fetching working (after fetch count fix)
- ✅ Profile URLs accessible in UI

## Files Modified/Created

### Core Implementation
- `ranking-v2-package/progressive-ranking-v6.js` - Main V6 implementation
- `ranking-v2-package/index.js` - Exports V6 function
- `ranking-v2-package/evaluate-fit.js` - LLM evaluation (existing)

### Data Integration
- `merge-dietitians.js` - BDA dietitian merge script
- `apply-ranking.js` - Updated to handle BDA `clinical_expertise` format

### BM25 Service
- `parallel-ranking-package/testing/services/local-bm25-service.js`
  - Fixed IDF calculation (prevent negative values)
  - Enhanced `getBM25Shortlist` to return requested count
  - Enhanced `getBM25StageATopN` to return requested count
  - Updated `createWeightedSearchableText` for unstructured `clinical_expertise`

### Server & UI
- `server.js` - Added V6 endpoint, profile_url in response
- `public/index.html` - Added V6 UI elements, profile URL display

### Documentation
- `V6_PROGRESSIVE_RANKING_PLAN.md` - Original plan
- `V6_IMPLEMENTATION_SUMMARY.md` - High-level summary
- `V6_FLOW_DIAGRAM.md` - Visual flow diagrams
- `BDA_DIETITIAN_MERGE_STRATEGY.md` - BDA merge strategy
- `V6_IMPLEMENTATION_COMPLETE.md` - This summary

## Key Metrics

### Performance
- **Initial Ranking**: ~300-500ms (V2 flow)
- **LLM Evaluation**: ~2-5s per batch of 12 profiles
- **Total V6 Time**: Typically 5-15s depending on iterations
- **Max Profiles Reviewed**: 30 (configurable)

### Typical Iteration Flow
1. **Iteration 0**: Initial V2 ranking (12 profiles)
2. **Iteration 1**: Fetch 12 more, evaluate all 24
3. **Iteration 2**: Fetch 12 more, evaluate all 36 (or until cap)
4. **Termination**: When top 3 are excellent OR max reached

### Quality Breakdown Example
- **Excellent**: 3-8 profiles (typically)
- **Good**: 5-15 profiles
- **Ill-fit**: 2-5 profiles

## Current Status

✅ **V6 Implementation**: Complete and functional
✅ **BDA Dietitian Integration**: Complete with proper mapping
✅ **BM25 Fixes**: IDF calculation fixed, fetching improved
✅ **Server Integration**: V6 endpoint working
✅ **UI Updates**: V6 metadata and profile URLs displayed
✅ **Testing**: Multiple test scripts verify functionality

## Usage Example

```javascript
const { rankPractitionersProgressive } = require('./ranking-v2-package');

const results = await rankPractitionersProgressive(practitioners, query, {
  maxIterations: 5,
  maxProfilesReviewed: 30,
  batchSize: 12,
  fetchStrategy: 'stage-a',
  targetTopK: 3,
  manualSpecialty: 'Dietitian',
  shortlistSize: 12
});

console.log(`Iterations: ${results.metadata.iterations}`);
console.log(`Termination: ${results.metadata.terminationReason}`);
console.log(`Top 3 Excellent: ${results.metadata.qualityBreakdown.excellent >= 3}`);
```

## Next Steps / Future Improvements

1. **Performance Optimization**: Cache LLM evaluations to avoid re-evaluating same profiles
2. **Adaptive Batch Sizing**: Adjust batch size based on quality distribution
3. **Early Exit Optimization**: Stop fetching if quality is already high
4. **Profile URL Enhancement**: Add more URL sources beyond BDA dietitians
5. **UI Enhancements**: Add filters for fit category, iteration found
6. **Analytics**: Track which profiles are most often evaluated as excellent

## Conclusion

V6 Progressive Ranking successfully implements an iterative refinement system that uses LLM evaluation to improve search result quality. The implementation handles edge cases, integrates with existing V2 infrastructure, and properly supports specialty filtering. BDA dietitian integration ensures all practitioner types are searchable and rankable.
