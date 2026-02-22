# What if we got rid of Stage A and just ranked everything?

This note evaluates removing Stage A (BM25 retrieval) entirely and passing the **full specialty pool** to the LLM ranker.

---

## 1. What “no Stage A” means

- **Current flow:** BM25 Stage A → top N (e.g. 50–200) → LLM shortlist/rank → top 12.
- **“No Stage A”:** Skip the cutoff; pass **all** practitioners in the specialty to the LLM, then shortlist/rank → top 12.

So “rank everything” = rank over the full pool (no BM25-based truncation). We still need *some* ordering for backfill; in practice that could be BM25 order over the full list, or arbitrary order.

---

## 2. Recall ceiling

| Setup | Pool size per query | Ceiling for Recall@12 |
|-------|----------------------|------------------------|
| Stage A top 50 | 50 | ~72% (from [RETRIEVAL_CEILING_ANALYSIS.md](RETRIEVAL_CEILING_ANALYSIS.md)) |
| Stage A top 200 | 200 | ~93% |
| **No Stage A (full pool)** | **786–2050** | **100%** |

If we could truly rank the full pool, **every** ground-truth pick is in the candidate set, so the theoretical maximum Recall@12 is 1.0. So from a **ceiling** perspective, getting rid of Stage A would remove the retrieval cap on recall.

---

## 3. Why we can’t literally “rank everything” in one LLM call

**Pool sizes (practitioners per specialty):**

| Specialty | Practitioners |
|-----------|----------------|
| Cardiology | 786 |
| General surgery | 1,184 |
| Obstetrics and gynaecology | 842 |
| Ophthalmology | 791 |
| Trauma & orthopaedic surgery | 2,050 |

**Rough prompt size for “rank everything” (single call):**

- Profile cards: ~500–800 chars each (with 350–1500 char descriptions).
- 786 cards × 600 chars ≈ **470k chars** (~120k tokens) for Cardiology alone.
- Trauma: 2,050 × 600 ≈ **1.2M chars** (~300k tokens).

So:

1. **Context limit:** One request with 786–2050 cards would exceed normal context windows (e.g. 128k tokens). Even 500 cards is marginal (~75k tokens for cards alone).
2. **Cost/latency:** One call per query with 100k+ input tokens would be expensive and slow.
3. **Quality:** Models do not reliably attend over hundreds of items in one list; relevance and consistency would likely drop.

So **literally** “get rid of Stage A and rank the full pool in one go” is **infeasible** with current single-call LLM ranking.

---

## 4. What we can do instead

### A. Use a “no Stage A” proxy: very large N (e.g. 400–500)

- Set `stage_a_top_n` to a **large but context-safe** value (e.g. 400 or 500).
- We still run BM25 to get an ordered list and to stay within token limits; we just **don’t truncate** until we hit that cap.
- For Cardiology (786), “Stage A 500” means the LLM sees 500 candidates instead of 50 or 200 → higher ceiling than Stage A 200, at the cost of a bigger prompt.
- For Trauma (2050), 500 is still a cap; we’re not truly “no Stage A,” but we’re testing “what if we pass a much larger pool?”

**How to run:** Use a weights file with a large `stage_a_top_n`, e.g. `ranking-weights-stage-a-400.json`, and run multi-stage V4 as usual:

```bash
node run-baseline-evaluation.js --v4-multi-stage --use-cache --v4-model gpt-5.1 --weights=ranking-weights-stage-a-400.json --output benchmark-baseline-v4-multistage-stage-a-400.json
```

Interpretation: if Recall@12 and NDCG go up vs Stage A 200, then “more pool” helps until we hit context/cost limits. If they flatten or drop, the model is struggling with the larger list.

### B. Chunked / multi-call “no Stage A”

- Split the full pool into chunks (e.g. 200 per chunk).
- Run shortlist (or score) per chunk, then merge (e.g. take union of “relevant” IDs), then run a final rank over the merged shortlist.
- This could approach “rank everything” in spirit but adds complexity, multiple LLM calls per query, and merge logic. Not implemented here; left as a design option.

### C. Keep Stage A but increase N where acceptable

- Keep BM25 Stage A as the retrieval layer.
- Increase N (e.g. 200 → 400) when latency and cost are acceptable.
- Improves recall ceiling without changing the architecture.

---

## 5. Summary

| Question | Answer |
|----------|--------|
| **Would recall ceiling improve if we got rid of Stage A?** | Yes. With the full pool, ceiling is 100%; with Stage A 200 it’s ~93%. |
| **Can we actually “rank everything” in one LLM call?** | No. Full pools are 786–2050 practitioners; one-call ranking would exceed context and degrade quality. |
| **What’s a practical “no Stage A” experiment?** | Use a very large Stage A (e.g. N=400 or 500) as a proxy: same pipeline, larger pool, within context. Run multi-stage V4 with `--weights=ranking-weights-stage-a-400.json` and compare to N=200. |
| **Recommendation** | Keep Stage A for feasibility; raise N (e.g. 400) where cost/latency allow. True “no Stage A” would require chunked/multi-call design. |
