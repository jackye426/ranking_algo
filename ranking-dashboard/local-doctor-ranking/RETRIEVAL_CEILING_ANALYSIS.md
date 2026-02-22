# Retrieval ceiling: why Recall@12 doesn’t improve much with better ranking

## What we measured

**Stage A recall @50** (same setup as V4: v2 session context, BM25 Stage A top 50):

- **362 / 500** ground-truth picks are in the top 50 → **72.4%**
- **138 / 500** ground-truth picks (**27.6%**) are **not in the top 50 at all**

So for V4 (and any ranker that only sees Stage A top 50), **more than a quarter of the “top 5” doctors per query are never in the candidate set**. The LLM (or v2 rescoring) can only reorder what’s in the pool; it cannot promote docs that weren’t retrieved.

## What that implies

- **Ceiling on Recall@12:** Even with perfect ranking, we can’t show ground-truth docs that aren’t in the top 50. So average Recall@12 is capped by **how many of the 5 ground-truth per query** we get into the pool. With 72.4% of picks in the pool, the theoretical max is already below 1.0.
- **Why LLM ranking didn’t move recall much:** We improved **ordering** (better MRR/NDCG) but the **pool** is unchanged. The missing 27.6% are lost at retrieval, not at ranking.
- **Conclusion:** Yes — we are **missing the majority of the “top 5” doctors in retrieval** for a large fraction of queries (whenever one or more of the 5 rank below 50 in Stage A). The bottleneck is **Stage A (retrieval)**, not the ranker.

## Existing Stage A recall (from `stage-a-recall-report.json`)

| N   | Ground-truth in top N | Stage A recall |
|-----|------------------------|----------------|
| 50  | 362 / 500              | **72.4%**      |
| 100 | 419 / 500              | **83.8%**      |
| 150 | 459 / 500              | **91.8%**      |
| 200 | 465 / 500              | **93.0%**      |

So increasing N from 50 to 100 adds ~57 ground-truth picks into the pool; 50→150 adds ~97. That directly raises the ceiling for Recall@12.

## Recommendations

1. **Use a larger Stage A N for V4**  
   Run V4 (and multi-stage) with **Stage A top 100 or 150** so more ground-truth enter the pool, e.g.  
   `--weights ranking-weights-stage-a-150.json`  
   Then re-run the benchmark: you should see Recall@12 improve because the ranker has more relevant docs to choose from.

2. **Improve retrieval quality (Stage A)**  
   From [STAGE_A_IMPROVEMENT_PROPOSALS.md](STAGE_A_IMPROVEMENT_PROPOSALS.md):  
   - **Intent terms in BM25:** `intent_terms_in_bm25: true` (with a cap) so Stage A query is more intent-aligned.  
   - **Two-query Stage A:** Union of patient-query top N and intent-only top M to recover docs that match intent but not verbatim query.  
   - **Field weights / k1, b:** Optional tuning once N and query are in place.

3. **Interpret metrics**  
   - **Recall@12** is bounded above by Stage A recall (how many of the 5 ground-truth are in the pool).  
   - **MRR / NDCG** can still improve with better ranking **within** the pool; that’s what we saw with the LLM and multi-stage.  
   - To improve Recall@12 further, retrieval (Stage A) must pull in more of the missing ground-truth (higher N and/or better query/strategy).
