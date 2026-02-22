# Stage A Improvement Proposals

Goal: pull in **more relevant candidates** into Stage A so Stage B rescoring has a better pool. Current Stage A retrieves `topN` (default 50) via BM25; if relevant docs rank 51–100, they never get rescored.

---

## 1. Increase Stage A pool size (N) — **implemented**

- **Current:** `topN = Math.max(shortlistSize * 10, 50)` → 50 for shortlistSize=12.
- **Change:** Make N configurable via `stage_a_top_n` in ranking config; set a higher default (e.g. **100**).
- **Pros:** Simple, one-line change in behaviour; no query change; Stage B sees more candidates.
- **Cons:** Slightly more rescoring work (linear in N); if BM25 is weak, extra slots may be mostly noise.
- **Recommendation:** Try 100 first; if metrics improve, try 150. Use `ranking-weights.json` or `filters.rankingConfig` to override.

---

## 2. Add intent terms to Stage A query — **config-ready**

- **Current:** `intent_terms_in_bm25: false` → BM25 query is only `q_patient` + safe_lane_terms + anchor_phrases.
- **Change:** Set `intent_terms_in_bm25: true` (e.g. in a weights file or default for v2). Cap with `intent_terms_in_bm25_max` (e.g. 8–12) so the query doesn’t become huge.
- **Pros:** Stage A retrieval becomes intent-aligned; docs that match “ablation”, “electrophysiology” etc. but not the exact patient phrasing can enter the pool.
- **Cons:** Query can get long; BM25 may over-weight intent terms if they’re very common; need to cap to avoid noise.
- **Recommendation:** Enable with cap 8–10 for v2, measure Recall@12 / NDCG. Compare with N-only increase.

---

## 3. Two-query Stage A (union of two rankings)

- **Idea:** Run Stage A twice: (1) current query `q_patient + safe_lane + anchors`; (2) intent-only query (e.g. first 8 intent_terms). Take **union** of top-40 from each (or top-50 + top-30), dedupe by practitioner id, then pass to Stage B (e.g. rank by primary query score or take top 100 by max of the two scores).
- **Pros:** Recovers docs that rank poorly on patient wording but well on intent (e.g. procedure/subspecialty terms).
- **Cons:** Two BM25 passes per request; need a merge strategy (union size, how to order before rescoring).
- **Recommendation:** Implement only if (1) + (2) don’t yield enough gain; adds complexity.

---

## 4. BM25 parameter tweaks (k1, b)

- **Current:** `k1: 1.5`, `b: 0.75`.
- **Ideas:** Slightly **lower k1** (e.g. 1.2) → less term-frequency saturation, more weight to IDF. Slightly **higher b** (e.g. 0.8) → stronger length normalization, can favour shorter, more focused fields.
- **Pros:** No change to query or pipeline; easy to A/B via config.
- **Cons:** Past tuning showed limited gain; may be worth revisiting after (1) and (2).
- **Recommendation:** Secondary lever after pool size and intent terms.

---

## 5. Field-weight rebalance

- **Current:** Strong weights on `clinical_expertise`, `procedure_groups`, `specialty`, `subspecialties`.
- **Idea:** Slightly lower the highest weights or boost `specialty_description` / `description` so Stage A doesn’t over-concentrate on a few fields; more variety in top-N.
- **Pros:** Can surface docs that match on description rather than only expertise tags.
- **Cons:** Risk of diluting signal; needs careful tuning.
- **Recommendation:** Optional; try after (1) and (2).

---

## Implementation status

| Option | Status | Config / code |
|--------|--------|----------------|
| 1. Increase N | Done | `stage_a_top_n` in `DEFAULT_RANKING_CONFIG` (default 100); used in `getBM25Shortlist`. |
| 2. Intent terms in BM25 | Ready | `intent_terms_in_bm25`, `intent_terms_in_bm25_max`; set `true` in weights or config to enable. |
| 3. Two-query Stage A | Done | `stage_a_two_query`, `stage_a_patient_top_n`, `stage_a_intent_top_n`, `stage_a_union_max`, `stage_a_intent_terms_cap` in config; union of patient-query top N + intent-only top M, sorted by patient score then intent score. |
| 4. k1/b | Ready | `k1`, `b` in ranking config. |
| 5. Field weights | Ready | `field_weights` in ranking config. |

---

## Evaluation results (100 test cases, cache)

| Run | Recall@12 | NDCG@12 | MRR |
|-----|-----------|---------|-----|
| **Step 1a: V1, stage_a_top_n=100** | 0.510 | 0.423 | 0.565 |
| **Step 1b: V2, stage_a_top_n=100** | 0.510 | 0.445 | 0.613 |
| **Step 2: V2, intent_terms_in_bm25=true, max=8** | 0.488 | 0.409 | 0.554 |
| **Step 3a: V1, stage_a_top_n=150** | **0.524** | **0.430** | 0.558 |
| **Step 3b: V2, stage_a_top_n=150** | 0.510 | 0.445 | 0.606 |

**Findings:**
- **Step 1 (N=100):** Solid baseline; V2 leads on NDCG and MRR.
- **Step 2 (intent terms in BM25):** Recall@12 and NDCG drop vs V2 N=100; not recommended with current cap (8).
- **Step 3 (N=150):** V1 gains +0.014 Recall@12 and +0.007 NDCG; V2 Recall@12 unchanged, NDCG flat, MRR slightly lower. **Recommendation:** Use **stage_a_top_n=150** for V1; for V2, 100 or 150 are similar—150 is safe if you want a larger pool.

---

## Options 3, 4, 5 evaluation (V2, cache, 100 cases)

Baseline (V2, stage_a_top_n=100): **Recall@12 0.510, NDCG 0.445, MRR 0.613**.

| Run | Recall@12 | NDCG@12 | MRR |
|-----|-----------|---------|-----|
| **V2 two-query Stage A** (patient 50 + intent 30, union 100) | 0.392 | 0.342 | 0.500 |
| **V2 k1=1.2, b=0.8** | 0.506 | 0.441 | 0.607 |
| **V2 rebalanced field_weights** | **0.512** | **0.443** | 0.603 |

**Findings:**
- **Two-query Stage A:** Large drop vs baseline; intent-only leg pulls in different docs and ordering by patient score pushes intent-only docs down, so rescoring sees a noisier pool. **Not recommended** with current merge strategy.
- **k1/b (1.2, 0.8):** Slightly lower Recall@12 and NDCG; MRR similar. **Neutral**; default k1/b remains reasonable.
- **Field weights (rebalanced):** Small gain: +0.002 Recall@12, +0.002 NDCG vs baseline. **Recommended** to try in production; weights: slightly lower clinical_expertise/procedure_groups, slightly higher subspecialties/specialty_description/description.
