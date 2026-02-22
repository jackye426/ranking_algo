# Negative Terms in Retrieval

## Current behaviour

- **negative_terms** come from session context / clinical intent (e.g. “heart failure”, “coronary” when the user wants an AF specialist).
- They are used **only in Stage B (rescoring)**:
  - Count how many negative terms appear in each doc’s searchable text.
  - Apply a **penalty** (multiplicative: `negative_mult_1` / `negative_mult_2` / `negative_mult_4`, or additive when rescoring score is primary).
- **Stage A (BM25 retrieval)** does **not** use negative terms. The query is built from patient query + safe_lane + anchor_phrases + optional intent_terms only.

So “wrong lane” docs can still land in the top N at retrieval; they only get pushed down at rescoring. If N is small (e.g. 50), some relevant docs may be pushed out of the pool by docs that match the query but are the wrong subspecialty.

## Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Penalty in Stage A** | After BM25 rank, apply the same negative-term penalty (multiply score by `negative_mult_*`), re-sort, then take top N. | Keeps recall; pushes “wrong lane” docs down so more relevant docs can enter top N. | Slightly more work per doc in Stage A; needs config flag. |
| **B. Hard filter in Stage A** | Exclude from the candidate pool any doc that matches ≥ K negative terms. | Simple; strongly reduces wrong-lane docs. | Risk of dropping good docs that mention both wanted and “negative” areas. |
| **C. Analysis first** | Script: for each test case, count how many Stage A top-N docs have negative matches; simulate penalty and measure recall delta. | Informs whether A or B is worth it. | No behaviour change until we implement A or B. |

## Recommendation

- **Implement Option A** as an optional behaviour behind a ranking config flag (e.g. `stage_a_negative_penalty: true`), using the same multiplicative penalties as rescoring. Default off for backward compatibility.
- Optionally run **Option C** (analysis script) to quantify how many wrong-lane docs are in the current top 150 and how much recall changes with the penalty.

## Implementation (Option A)

- In `getBM25StageATopN` (local-bm25-service.js):
  - After `rankPractitionersBM25(...)` we have a full ranking.
  - If `rankingConfig.stage_a_negative_penalty === true` and `filters.intentData?.negative_terms` has length:
    - For each result, build `createWeightedSearchableText(doc)`, count negative term matches, apply `negative_mult_1` / `negative_mult_2` / `negative_mult_4` to the BM25 score.
    - Re-sort by adjusted score (desc), then `slice(0, n)` and assign `rank`.
  - Add `stage_a_negative_penalty: false` to `DEFAULT_RANKING_CONFIG` (and document in this file).

## Benchmark analysis (N=100, N=150)

Run: `node analyze-negative-penalty-retrieval.js --weights=best-stage-a-recall-weights.json --out=negative-penalty-retrieval-report.json`

**Findings:**

- **Recall:** With or without penalty, at N=100 we have 431/500 GT picks (86.2%); at N=150 we have 467/500 (93.4%). No GT pick drops out of top 100 or top 150 when the penalty is turned on.
- **Tendency to negative-penalise benchmark picks:**
  - **169** of the 467 GT picks in top 150 (no penalty) have **≥1 negative_terms match** in their profile (e.g. cardiologist profile mentioning “heart failure” when the query is AF).
  - When `stage_a_negative_penalty=true`, **41** of those GT picks **move down in the list** (rank worsens but they stay in top 150). **All 41** have ≥1 negative match — so we are pushing down some correct picks because their profile contains “wrong lane” vocabulary.
  - So: we do **not** over-penalise to the point of dropping good picks at N=100/150, but we **do** down-rank 41 benchmark picks; if N were smaller (e.g. 50) or the penalty harsher, some could drop out.
  - Takeaway: negative_terms are noisy — good docs often mention related subspecialty terms. Consider softer Stage A penalties or only applying negative penalty in rescoring (Stage B), not in retrieval.
