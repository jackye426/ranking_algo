# V5 Implementation Summary

## What Was Implemented

### 1. Ideal Profile Generation (`session-context-variants.js`)

**New Functions:**
- `buildIdealProfileSystemMessage(specialty, lexicons)` - Builds system prompt for ideal profile generation
- `generateIdealDoctorProfile(userQuery, messages, specialty, options)` - Generates ideal profile using GPT-4o
- `idealProfileToBM25Query(idealProfile)` - Converts ideal profile to BM25 query (hybrid: natural language + structured terms)
- `idealProfileToIntentTerms(idealProfile)` - Extracts intent terms for backward compatibility
- `idealProfileToAnchorPhrases(idealProfile)` - Extracts anchor phrases
- `getSessionContextV5(userQuery, messages, location, options)` - Main V5 session context function

**Key Features:**
- Uses GPT-4o (configurable, defaults to 'gpt-4o')
- Supports lexicons for data-aligned outputs
- Generates structured ideal profile with importance levels (required/preferred/optional)
- Includes subspecialties, procedures, conditions, clinical expertise areas
- Supports optional preferences (qualifications, age group, languages, gender)
- Includes "avoid" elements for negative matching

### 2. Profile Matching (`local-bm25-service.js`)

**New Functions:**
- `extractProcedures(practitioner)` - Extracts procedures from profile
- `extractConditions(practitioner)` - Extracts conditions from profile
- `fuzzyMatch(str1, str2)` - Simple fuzzy matching for terms
- `matchProfileAgainstIdeal(actualProfile, idealProfile)` - Matches actual profile against ideal profile

**Matching Logic:**
- Subspecialty matching: +5.0 (required), +3.0 (preferred), +1.0 (optional)
- Procedure matching: +4.0 (required), +2.0 (preferred), +0.5 (optional)
- Condition matching: +3.0 (required), +1.5 (preferred)
- Clinical expertise matching: +2.0 per area
- Description keyword matching: +1.0 per keyword
- Negative matching: -3.0 (avoid subspecialties), -2.0 (avoid procedures)
- Optional preferences: +1.0-1.5 (qualifications, age group, languages, gender)

### 3. Stage A Integration (`local-bm25-service.js`)

**Modified:**
- `getBM25Shortlist()` - Now accepts `idealProfile` in filters
- Uses ideal profile query (`q_patient` from V5) for BM25 retrieval
- Detects V5 variant (`variantName === 'v5'`)

### 4. Stage B Integration (`local-bm25-service.js`)

**Modified:**
- `rescoreWithIntentTerms()` - Now accepts `idealProfile` parameter
- When ideal profile is provided, uses profile-to-profile matching instead of term counting
- V5 always uses rescoring score as primary (profile match score)

## File Changes

### `session-context-variants.js`
- Added V5 functions (~400 lines)
- Exported new functions: `getSessionContextV5`, `generateIdealDoctorProfile`, `idealProfileToBM25Query`, etc.

### `local-bm25-service.js`
- Added profile matching functions (~150 lines)
- Modified `rescoreWithIntentTerms()` to support ideal profiles
- Modified `getBM25Shortlist()` to detect V5 and pass ideal profile
- Exported new functions: `matchProfileAgainstIdeal`, `extractProcedures`, `extractConditions`, `fuzzyMatch`

## Usage

```javascript
// 1. Generate session context
const sessionContext = await getSessionContextV5(
  userQuery,
  messages,
  location,
  {
    specialty: 'Cardiology',
    lexiconsDir: './lexicons',
    model: 'gpt-4o' // or 'gpt-5.1' when available
  }
);

// 2. Build filters
const filters = {
  q_patient: sessionContext.q_patient, // Ideal profile query
  idealProfile: sessionContext.idealProfile,
  variantName: 'v5',
  // ... other filters
};

// 3. Rank
const results = getBM25Shortlist(practitioners, filters, 12);
```

## Backward Compatibility

V5 is fully backward compatible:
- Returns `intent_terms` and `anchor_phrases` for existing code
- Uses same filter structure
- Can coexist with V1-V4 variants

## Next Steps

1. **Testing**: Test V5 on benchmark dataset
2. **Evaluation**: Compare metrics vs V2/V4
3. **Tuning**: Adjust matching weights if needed
4. **Documentation**: Add to main README

## Model Configuration

Currently configured to use `gpt-4o` by default. To use GPT-5.1 when available:

```javascript
model: 'gpt-5.1' // Will use when OpenAI releases it
```

The implementation is model-agnostic and will work with any OpenAI-compatible model.
