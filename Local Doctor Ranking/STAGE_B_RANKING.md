# Stage B ranking (rescoring)

Stage B is **post-retrieval rescoring**: it takes the **Stage A BM25 top N** (e.g. 150) and **re-scores** each document using intent terms, anchor phrases, safe-lane terms, subspecialties, and negative terms, then **re-sorts** and returns the top 12.

**Where:** `parallel-ranking-package/testing/services/local-bm25-service.js`  
**Function:** `rescoreWithIntentTerms`  
**Called from:** `getBM25Shortlist` after Stage A BM25 retrieval (see “Stage B: Post-retrieval rescoring” ~line 930).

---

## Inputs to Stage B

| Input | Source | Description |
|-------|--------|-------------|
| `bm25Results` | Stage A | Top N documents + BM25 score (e.g. N=150). |
| `intent_terms` | Session context (v2) | Terms from clinical intent (symptoms, conditions, procedures, etc.). |
| `negative_terms` | `intentData.negative_terms` | Terms that indicate “wrong lane” (e.g. wrong subspecialty). |
| `anchor_phrases` | Session context | High-value phrases (e.g. “chest pain”, “interventional cardiology”). |
| `likely_subspecialties` | `intentData.likely_subspecialties` | Inferred subspecialties with confidence. |
| `safe_lane_terms` | Session context (v2) | High-confidence symptom/condition terms (parallel-v2 only). |
| `useRescoringScoreAsPrimary` | Derived | True when variant is parallel/parallel-v2 and query is AMBIGUOUS. |
| `rankingConfig` | `filters.rankingConfig` | Tunable weights (defaults below). |

For each document, **searchable text** is built via `createWeightedSearchableText(doc)` (same field weights as BM25: expertise_procedures, procedure_groups, specialty, subspecialties, description, about, etc.). All term/phrase matching in Stage B is done against this **lowercased** searchable text.

---

## How the score is built

Stage B splits **intent_terms** into three buckets and applies **additive** rescoring (when `useRescoringScoreAsPrimary` is true) or **multiplicative** boosts (when false). Negative terms always apply (additive penalty or multiplicative).

### 1. Intent term buckets (hardcoded in rescoreWithIntentTerms)

- **High-signal terms** (strongest boost):  
  `chest pain`, `angina`, `coronary artery disease`, `ischaemic heart disease`, `ct coronary angiography`, `stress echo`, `chest pain clinic`
- **Procedure terms** (smaller boost):  
  `interventional cardiology`, `coronary angiography`, `pci`, `stent`, `percutaneous coronary intervention`
- **Pathway terms**:  
  Any other intent term that appears in the doc (not in the two sets above).

Counts: `highSignalMatches`, `pathwayMatches`, `procedureMatches` (each term counted at most once per doc).

### 2. Rescoring score (when `useRescoringScoreAsPrimary` = true, e.g. parallel-v2 + AMBIGUOUS)

Score is **additive**; BM25 is **not** multiplied in. Default config:

| Component | Rule | Default weight |
|----------|------|------------------|
| **High-signal** | 1 match | +2.0 (`high_signal_1`) |
| | 2+ matches | +4.0 (`high_signal_2`) |
| **Pathway** | 1 match | +1.0 (`pathway_1`) |
| | 2 matches | +2.0 (`pathway_2`) |
| | 3+ matches | +3.0 (`pathway_3`) |
| **Procedure** | Per match | +0.5 (`procedure_per_match`) |
| **Anchor phrases** | Per phrase match, cap | +0.2 per match, cap 0.6 (`anchor_per_match`, `anchor_cap`); v2: 0.25 / 0.75 |
| **Safe-lane (v2)** | 1 / 2 / 3+ matches | +1.0 / +2.0 / +3.0 (`safe_lane_1`, `safe_lane_2`, `safe_lane_3_or_more`) |
| **Subspecialty** | Confidence-weighted match, cap | +confidence×0.3, cap 0.5 (`subspecialty_factor`, `subspecialty_cap`) |
| **Negative terms** | 1 / 2 / 4+ matches | -1.0 / -2.0 / -3.0 (`negative_1`, `negative_2`, `negative_4`) |

Final **newScore = rescoringScore** (BM25 is only used as tiebreaker when rescoring scores are equal).

### 3. Multiplicative path (when `useRescoringScoreAsPrimary` = false)

Starts from **BM25 score**, then:

- High-signal: 1 match ×1.2, 2+ ×1.4  
- Pathway: 1 ×1.05, 2 ×1.15, 3+ ×1.3  
- Procedure: any match ×1.05  
- Anchor: same additive boost as above (then added to score)  
- Safe-lane: same additive boost as above  
- Subspecialty: multiplicative `(1 + cappedBoost)`  
- Negative: multiplicative penalty `negative_mult_1` / `negative_mult_2` / `negative_mult_4` (e.g. 0.95, 0.85, 0.70).

Sort by this modified score.

---

## Default ranking config (DEFAULT_RANKING_CONFIG)

```text
high_signal_1: 2.0,    high_signal_2: 4.0
pathway_1: 1.0,        pathway_2: 2.0,        pathway_3: 3.0
procedure_per_match: 0.5
anchor_per_match: 0.2, anchor_cap: 0.6       (v2: 0.25, 0.75)
subspecialty_factor: 0.3, subspecialty_cap: 0.5
negative_1: -1.0,      negative_2: -2.0,     negative_4: -3.0
negative_mult_1: 0.95,  negative_mult_2: 0.85, negative_mult_4: 0.70
safe_lane_1: 1.0,      safe_lane_2: 2.0,     safe_lane_3_or_more: 3.0
```

(Plus Stage A settings: `stage_a_top_n`, `k1`, `b`, `field_weights`, etc. – see top of file.)

---

## Flow in getBM25Shortlist

1. **Stage A:** BM25 retrieval with normalized query (+ safe_lane + anchor), take **top N** (`stage_a_top_n`, e.g. 150).
2. **Stage B:**  
   - Slice `bm25Ranked.slice(0, topN)`.  
   - Call `rescoreWithIntentTerms(..., intent_terms, negative_terms, anchor_phrases, likely_subspecialties, safe_lane_terms_for_rescoring, useRescoringScoreAsPrimary, rc)`.  
   - For parallel-v2, `useRescoringScoreAsPrimary = isQueryAmbiguous` (default true).  
   - Sort by rescoring score (or by modified BM25), then take **top shortlistSize** (e.g. 12).

So **ranking in Stage B** = one rescoring pass over the Stage A top N, then sort by that score and return the top 12.
