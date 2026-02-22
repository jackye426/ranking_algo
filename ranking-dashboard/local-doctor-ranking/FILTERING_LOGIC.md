# Specialty Filtering Logic

## Overview

The system uses **two types of specialty filtering**:

1. **AI-Based Automatic Filtering** (default)
2. **Manual Specialty Filtering** (optional override)

## How It Works

### Scenario 1: No Manual Filter (AI-Based Filtering)

When you **don't** provide a manual specialty filter:

```javascript
// Query: "I need SVT ablation"
// Manual specialty: null

1. AI analyzes the query using parallel ranking algorithm
2. AI infers likely subspecialties:
   - "Electrophysiology" (confidence: 0.9)
   - "Cardiology" (confidence: 0.85)
3. System filters practitioners to only those matching inferred subspecialties
4. BM25 ranking runs on filtered dataset
```

**Example:**
- Query: "I need SVT ablation"
- AI infers: `["Electrophysiology (90%)", "Cardiology (85%)"]`
- Result: Only electrophysiologists and cardiologists are ranked

### Scenario 2: Manual Filter Provided

When you **do** provide a manual specialty filter:

```javascript
// Query: "I need a consultation"
// Manual specialty: "Gynaecology"

1. Manual filter takes precedence
2. AI-based filtering is DISABLED
3. System searches for "Gynaecology" in:
   - Specialty field
   - Subspecialties array
   - Clinical expertise text
   - Professional title
4. BM25 ranking runs on manually filtered dataset
```

**Example:**
- Query: "I need a consultation"
- Manual filter: "Gynaecology"
- Result: Only gynaecologists are ranked (AI filtering ignored)

## Code Flow

### Server Logic (`server.js`)

```javascript
// Step 1: Get AI intent classification
const sessionContext = await getSessionContextParallel(query, messages, location);

// Step 2: Filter practitioners
const filteredPractitioners = filterBySpecialty(
  practitioners, 
  specialty ? null : sessionContext.intentData, // ← AI data only if no manual filter
  {
    minConfidence: 0.4,
    manualSpecialty: specialty // ← Manual filter if provided
  }
);
```

**Key Point:** When `specialty` is provided, `sessionContext.intentData` is set to `null`, disabling AI filtering.

### Filter Logic (`specialty-filter.js`)

```javascript
function filterBySpecialty(practitioners, intentData, options) {
  const { manualSpecialty } = options;
  
  // Manual filter takes precedence
  if (manualSpecialty) {
    // Search across all profile fields
    return practitioners.filter(p => matchesManualFilter(p, manualSpecialty));
  }
  
  // Otherwise use AI-inferred subspecialties
  const inferredSubspecialties = intentData?.likely_subspecialties || [];
  if (inferredSubspecialties.length === 0) {
    return practitioners; // No filtering if AI can't infer
  }
  
  return practitioners.filter(p => matchesSubspecialty(p, inferredSubspecialties));
}
```

## AI Subspecialty Inference

The AI uses **two parallel classifications**:

### 1. General Intent Classification
- Analyzes query goal (diagnostic_workup, procedure_intervention, etc.)
- Infers likely subspecialties based on query content
- Example: "SVT ablation" → "Electrophysiology" (0.9 confidence)

### 2. Clinical Intent Classification
- Specialty-specific intent classification
- For cardiology: coronary_ischaemic, arrhythmia_rhythm, etc.
- Also infers likely subspecialties
- Example: "chest pain" → "Interventional cardiology" (0.65 confidence)

### Merged Result
Both classifications contribute to `likely_subspecialties`:
- Combined and deduplicated
- Sorted by confidence
- Capped at top 3 subspecialties
- Minimum confidence threshold: 0.4

## Examples

### Example 1: AI Filtering (No Manual Filter)

**Request:**
```json
{
  "query": "I need SVT ablation"
}
```

**AI Analysis:**
- Infers: `["Electrophysiology (90%)", "Cardiology (85%)"]`
- Filters: ~500 cardiologists/electrophysiologists from 11,895 total
- Performance: ~200ms (vs ~1,500ms without filter)

### Example 2: Manual Filter

**Request:**
```json
{
  "query": "I need a consultation",
  "specialty": "Gynaecology"
}
```

**Filtering:**
- AI filtering: **DISABLED**
- Manual filter: Searches for "Gynaecology" in all profile fields
- Filters: ~200-300 gynaecologists from 11,895 total
- Performance: ~150ms

### Example 3: Ambiguous Query (No Filter)

**Request:**
```json
{
  "query": "I feel unwell"
}
```

**AI Analysis:**
- Infers: `[]` (no subspecialties with confidence >= 0.4)
- Filtering: **DISABLED** - returns all practitioners
- Performance: ~1,500ms (full dataset)

## Performance Comparison

| Scenario | Dataset Size | Filtering Method | Time |
|----------|--------------|------------------|------|
| No filter | 11,895 | None | ~1,500ms |
| AI filter | ~500 | AI-inferred subspecialties | ~200ms |
| Manual filter | ~200-300 | Manual specialty search | ~150ms |

## When to Use Each

### Use AI Filtering (Default)
- ✅ Query is specific enough for AI to infer specialty
- ✅ You want automatic specialty detection
- ✅ Query mentions procedures/conditions (e.g., "SVT ablation", "chest pain")

### Use Manual Filter
- ✅ You know the exact specialty needed
- ✅ Query is too vague for AI inference
- ✅ You want to override AI's inference
- ✅ You want maximum performance

## Current Status

✅ **AI-based filtering**: **ACTIVE** (when no manual filter provided)
✅ **Manual filtering**: **ACTIVE** (when manual filter provided)
✅ **Both systems**: Work independently, manual takes precedence
