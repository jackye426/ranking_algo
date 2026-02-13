# V6 Progressive Ranking Flow Diagram

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    V6 Progressive Ranking                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  Phase 1: Initial V2 Ranking       │
        │  - Session Context V2               │
        │  - BM25 Stage A + Stage B           │
        │  - Top 12 Results                    │
        └─────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  Phase 2: LLM Evaluation            │
        │  - Evaluate top 12                   │
        │  - Assign: excellent/good/ill-fit    │
        └─────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  Phase 3: Check Termination         │
        │  - Top 3 all 'excellent'?            │
        │  - 30 profiles reviewed?            │
        └─────────────────────────────────────┘
                    │                    │
            ┌───────┘                    └───────┐
            │ YES                                │ NO
            ▼                                    ▼
    ┌───────────────┐              ┌──────────────────────────┐
    │   RETURN      │              │  Phase 4: Fetch More     │
    │   Results     │              │  - Stage B (preferred)    │
    │               │              │  - Stage A (fallback)     │
    │               │              │  - Next batch (e.g. 12)   │
    └───────────────┘              └──────────────────────────┘
                                            │
                                            ▼
                            ┌───────────────────────────────┐
                            │  Phase 5: Merge & Deduplicate│
                            │  - Combine new + existing     │
                            │  - Remove duplicates          │
                            │  - Track evaluated IDs         │
                            └───────────────────────────────┘
                                            │
                                            ▼
                            ┌───────────────────────────────┐
                            │  Phase 6: Re-evaluate         │
                            │  - Evaluate new profiles      │
                            │  - Update quality indicators  │
                            └───────────────────────────────┘
                                            │
                                            ▼
                            ┌───────────────────────────────┐
                            │  Phase 7: Re-rank by Quality  │
                            │  - Excellent first            │
                            │  - Good next                  │
                            │  - Ill-fit last               │
                            │  - Within category: V2 score  │
                            └───────────────────────────────┘
                                            │
                                            ▼
                            ┌───────────────────────────────┐
                            │  Phase 8: Check Termination   │
                            │  - Top 3 excellent?           │
                            │  - Max iterations?             │
                            │  - 30 profiles reviewed?      │
                            │  - No more profiles?          │
                            └───────────────────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    │                                               │
            ┌───────┘                                               └───────┐
            │ YES                                                           │ NO
            ▼                                                               ▼
    ┌───────────────┐                                          ┌──────────────────┐
    │   RETURN      │                                          │  Loop Back to    │
    │   Results     │                                          │  Phase 4         │
    │               │                                          │  (if allowed)    │
    └───────────────┘                                          └──────────────────┘
```

## Detailed Iteration Flow

```
Iteration 0 (Initial):
┌─────────────────────────────────────────────────────────────┐
│ V2 Ranking → Top 12                                          │
│ [P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12]        │
│                                                               │
│ LLM Evaluation:                                               │
│ P1: excellent  │  P2: excellent  │  P3: good                 │
│ P4: good       │  P5: excellent  │  P6: ill-fit              │
│ ...                                                           │
│                                                               │
│ Check: Top 3 = [P1: excellent, P2: excellent, P3: good]     │
│ Profiles reviewed: 12 (under 30 cap)                          │
│ ❌ Not all excellent → Continue                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
Iteration 1:
┌─────────────────────────────────────────────────────────────┐
│ Fetch Next Batch (Stage B, profiles 13-24)                 │
│ [P13, P14, P15, P16, P17, P18, P19, P20, P21, P22, P23, P24]│
│                                                               │
│ Merge with existing (deduplicate):                            │
│ Combined Pool: [P1-P12, P13-P24]                            │
│                                                               │
│ Re-evaluate (new profiles only):                             │
│ P13: excellent  │  P14: good  │  P15: excellent              │
│ ...                                                           │
│                                                               │
│ Re-rank by Quality:                                           │
│ Excellent: [P1, P2, P5, P13, P15, ...]                       │
│ Good: [P3, P4, P14, ...]                                     │
│ Ill-fit: [P6, ...]                                           │
│                                                               │
│ New Top 12: [P1, P2, P5, P13, P15, P3, P4, P14, ...]        │
│                                                               │
│ Check: Top 3 = [P1: excellent, P2: excellent, P5: excellent]│
│ Profiles reviewed: 24 (under 30 cap)                          │
│ ✅ All excellent → TERMINATE                                  │
└─────────────────────────────────────────────────────────────┘
```

## Data Structures

### Evaluation Result Mapping

```javascript
// After LLM evaluation
evaluationMap = {
  "practitioner_id_123": {
    fit_category: 'excellent',
    brief_reason: 'Specializes in SVT ablation...',
    iteration_found: 0,
  },
  "practitioner_id_456": {
    fit_category: 'good',
    brief_reason: 'General cardiologist...',
    iteration_found: 0,
  },
  // ...
}

// Combined with ranking results
results = [
  {
    document: { practitioner_id: "123", name: "Dr. Smith", ... },
    score: 0.95,
    rank: 1,
    fit_category: 'excellent',  // From evaluationMap
    evaluation_reason: 'Specializes in SVT ablation...',
    iteration_found: 0,
  },
  // ...
]
```

### Tracking State

```javascript
state = {
  evaluatedIds: Set(['id1', 'id2', ...]),  // Already evaluated
  currentResults: [...],                     // Current top 12
  allEvaluatedProfiles: [...],              // All profiles seen
  iteration: 0,
  sessionContext: {...},                     // Reused across iterations
  filters: {...},                            // Reused across iterations
}
```

## Termination Conditions

```
┌─────────────────────────────────────────┐
│         Termination Check               │
└─────────────────────────────────────────┘
              │
              ├─→ Top 3 all 'excellent'? ──→ ✅ TERMINATE (success)
              │
              ├─→ Iteration >= maxIterations? ──→ ✅ TERMINATE (max reached)
              │
              ├─→ 30 profiles reviewed? ──→ ✅ TERMINATE (cap reached)
              │
              ├─→ No more profiles available? ──→ ✅ TERMINATE (exhausted)
              │
              └─→ LLM evaluation failed? ──→ ✅ TERMINATE (error)
```

## Fetch Strategy Decision

```
┌─────────────────────────────────────────┐
│      Fetch Additional Profiles          │
└─────────────────────────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ fetchStrategy = ?   │
    └─────────────────────┘
              │
      ┌───────┴───────┐
      │               │
   'stage-b'      'stage-a'
      │               │
      ▼               ▼
┌──────────┐    ┌──────────┐
│ getBM25  │    │ getBM25  │
│ Shortlist│    │ StageA   │
│ (with    │    │ TopN     │
│ rescoring│    │ (BM25    │
│          │    │  only)   │
└──────────┘    └──────────┘
      │               │
      └───────┬───────┘
              │
              ▼
    ┌─────────────────────┐
    │ Next Batch (e.g.    │
    │ profiles 13-24)      │
    └─────────────────────┘
```
