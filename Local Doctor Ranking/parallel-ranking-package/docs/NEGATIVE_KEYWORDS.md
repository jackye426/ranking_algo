# Negative Keywords Handling - Detailed Explanation

## Overview

The parallel ranking algorithm uses **adaptive negative keywords** - a sophisticated system that conditionally enables negative term penalties based on query clarity. This prevents false penalties when query intent is uncertain.

---

## Key Principle

**Negative keywords are NOT always active.** They are only enabled when:
1. Query is **clear** (high confidence + specific)
2. Intent is **certain** (named procedure or confirmed diagnosis)

When query is **ambiguous** (symptom-only or low confidence), negative keywords are **disabled** to avoid penalizing potentially relevant practitioners.

---

## Generation Rules

### 1. General Intent Classification

Negative terms are generated **ONLY** if:
- `specificity === "named_procedure"` AND
- `confidence >= 0.75`

**Code Reference** (lines 146-149 in `session-context-variants.js`):
```javascript
// Enforce negative_terms rules: ONLY apply when named_procedure AND high confidence
if (intentData.specificity !== 'named_procedure' || intentData.confidence < 0.75) {
  intentData.negative_terms = []; // Empty array - no negative terms
}
```

**Examples**:
- ✅ "I need SVT ablation" → `named_procedure`, confidence 0.9 → Negative terms generated
- ❌ "I have chest pain" → `symptom_only`, confidence 0.4 → No negative terms

**Negative Term Types** (from general intent):
- `procedure_intervention` → `["counselling", "therapy", "coaching", "conservative management"]`
- `diagnostic_workup` → `["surgery", "operation", "procedure package"]`
- `second_opinion` → `["routine follow-up", "ongoing care plan", "long-term management"]`
- `ongoing_management` → `["one-off second opinion", "single consultation only"]`

### 2. Clinical Intent Classification

**Always generates** negative terms (5-8 terms) representing wrong subspecialties:

**Examples**:
- `coronary_ischaemic` → `["electrophysiology", "ablation", "atrial fibrillation", "pacemaker", "ICD", "arrhythmia"]`
- `arrhythmia_rhythm` → `["coronary angiography", "interventional cardiology", "stent", "bypass"]`

---

## Adaptive Merging Logic

The algorithm determines if query is **clear** or **ambiguous**:

### Query Clarity Check

```javascript
const isQueryClear = generalIntentResult.confidence >= 0.75 && 
                     (generalIntentResult.specificity === 'named_procedure' || 
                      generalIntentResult.specificity === 'confirmed_diagnosis');
```

**Clear Query**:
- High confidence (>= 0.75) AND
- Named procedure OR confirmed diagnosis

**Ambiguous Query**:
- Low confidence (< 0.75) OR
- Symptom-only specificity

### Merging Strategy

#### If Query is CLEAR (lines 697-709):

```javascript
if (isQueryClear) {
  // Merge negative terms from BOTH sources
  if (clinicalIntentResult.negative_terms && clinicalIntentResult.negative_terms.length > 0) {
    mergedNegativeTerms.push(...clinicalIntentResult.negative_terms);
  }
  if (generalIntentResult.negative_terms && generalIntentResult.negative_terms.length > 0) {
    generalIntentResult.negative_terms.forEach(term => {
      if (!mergedNegativeTerms.includes(term)) {
        mergedNegativeTerms.push(term); // Deduplicate
      }
    });
  }
}
```

**Result**: Negative terms from both general intent and clinical intent are merged and deduplicated.

#### If Query is AMBIGUOUS (line 710):

```javascript
// When query is ambiguous, negative terms remain empty (disabled)
const mergedNegativeTerms = []; // Empty array
```

**Result**: No negative terms → No penalties applied.

---

## Why Adaptive?

### Problem Without Adaptation

If negative keywords were always enabled:

**Example**: Query "I have chest pain"
- Could be coronary issue → Should see interventional cardiologist
- Could be arrhythmia → Should see electrophysiologist
- Could be anxiety → Should see general cardiologist

If we penalize "electrophysiology" terms:
- ❌ Might miss relevant EP doctor if it's actually arrhythmia-related chest pain
- ❌ Penalizes practitioners before we know what user actually needs

### Solution: Adaptive Enabling

**Clear Query**: "I need SVT ablation"
- Intent is certain → EP doctor needed
- Safe to penalize wrong subspecialties (coronary, structural, etc.)
- ✅ Negative terms enabled

**Ambiguous Query**: "I have chest pain"
- Intent is uncertain → Could be multiple subspecialties
- Not safe to penalize → Might miss relevant practitioners
- ✅ Negative terms disabled

---

## Application in Ranking

### Stage A: BM25 Retrieval

**No negative terms applied**:
```javascript
rankPractitionersBM25(
  practitioners, 
  q_bm25_normalized, 
  1.5, 
  0.75, 
  null // No negative terms in BM25 stage
);
```

### Stage B: Rescoring

**Negative terms applied** (if enabled):

```javascript
// Negative matches: -1.0 per match, capped at -3.0 for 4+ matches
if (negative_terms && negative_terms.length > 0) {
  negativeMatches = negative_terms.filter(term => 
    searchableText.includes(term.toLowerCase())
  ).length;
  
  if (negativeMatches >= 4) rescoringScore -= 3.0;
  else if (negativeMatches >= 2) rescoringScore -= 2.0;
  else if (negativeMatches === 1) rescoringScore -= 1.0;
}
```

**Penalty Structure**:
- **1 match**: -1.0 penalty
- **2-3 matches**: -2.0 penalty  
- **4+ matches**: -3.0 penalty (capped)

---

## Example Flows

### Example 1: Clear Query - Negative Terms Enabled

**Query**: "I need SVT ablation"

**Step 1: General Intent**
```javascript
{
  specificity: "named_procedure",
  confidence: 0.9,
  negative_terms: ["counselling", "therapy", "coaching"] // Generated
}
```

**Step 2: Clinical Intent**
```javascript
{
  primary_intent: "arrhythmia_rhythm",
  negative_terms: ["coronary angiography", "interventional cardiology", "stent"] // Generated
}
```

**Step 3: Query Clarity**
```javascript
isQueryClear = (0.9 >= 0.75) && ("named_procedure" === "named_procedure") 
             = true ✅
```

**Step 4: Merge Negative Terms**
```javascript
mergedNegativeTerms = [
  "coronary angiography",
  "interventional cardiology", 
  "stent",
  "counselling",
  "therapy",
  "coaching"
]
```

**Step 5: Apply in Rescoring**
- Practitioner with "coronary angiography" + "stent" → -2.0 penalty
- Practitioner with "electrophysiology" → No penalty ✅

---

### Example 2: Ambiguous Query - Negative Terms Disabled

**Query**: "I have chest pain"

**Step 1: General Intent**
```javascript
{
  specificity: "symptom_only",
  confidence: 0.4,
  negative_terms: [] // Empty - rule prevents generation
}
```

**Step 2: Clinical Intent**
```javascript
{
  primary_intent: "coronary_ischaemic",
  negative_terms: ["electrophysiology", "ablation", "pacemaker"] // Generated
}
```

**Step 3: Query Clarity**
```javascript
isQueryClear = (0.4 >= 0.75) && ("symptom_only" === "named_procedure")
             = false ❌ // Query is ambiguous
```

**Step 4: Merge Negative Terms**
```javascript
mergedNegativeTerms = [] // Empty - disabled because query is ambiguous
```

**Step 5: Apply in Rescoring**
- No penalties applied → All practitioners ranked normally ✅
- EP doctor won't be penalized even if they mention "ablation" (might be relevant!)

---

## Comparison: Two Parallel Variants

### `getSessionContextParallel` (Adaptive)

- ✅ **Adaptive negative terms** (enabled only when clear)
- ✅ **Safer** for ambiguous queries
- ✅ **Recommended** for production

**Code**: Lines 624-754 in `session-context-variants.js`

### `getSessionContextParallelGeneralGoalSpecificity` (Always On)

- ⚠️ **Always merges** negative terms (if generated)
- ⚠️ **More aggressive** filtering
- ⚠️ **Use with caution** - may penalize relevant practitioners on ambiguous queries

**Code**: Lines 759-877 in `session-context-variants.js`

---

## Best Practices

### 1. Use Adaptive Variant

Prefer `getSessionContextParallel` over `getSessionContextParallelGeneralGoalSpecificity` for production use.

### 2. Monitor Query Clarity

Track `intentData.isQueryAmbiguous` flag to understand when negative terms are disabled.

### 3. Test Both Scenarios

Test with:
- Clear queries (named procedures) → Verify negative terms work
- Ambiguous queries (symptoms) → Verify no false penalties

### 4. Adjust Thresholds (if needed)

If you find negative terms are too aggressive or not aggressive enough:
- Adjust confidence threshold (currently 0.75)
- Adjust specificity requirements
- Modify penalty amounts in rescoring

---

## Summary

**Negative keywords are**:
- ✅ Conditionally generated (only for high-confidence named procedures)
- ✅ Adaptively enabled (only when query is clear)
- ✅ Applied in rescoring (Stage B, not BM25)
- ✅ Penalty-based (subtracts from score, doesn't filter out)

**Key insight**: When query intent is uncertain, it's safer to **not penalize** wrong subspecialties than to risk missing relevant practitioners.

---

## Related Documentation

- [ALGORITHM_EXPLANATION.md](ALGORITHM_EXPLANATION.md) - Full algorithm walkthrough
- [TWO_STAGE_RETRIEVAL.md](TWO_STAGE_RETRIEVAL.md) - Two-stage retrieval details
- [algorithm/README.md](../algorithm/README.md) - Algorithm API reference
