# Reducing selection bias in the benchmark candidate pool

## The problem

If the LLM only sees **the top 30 from the current ranking** for each question, then:

- Practitioners who **never** appear in the top 30 under the current algorithm are never seen by the LLM.
- Ground truth is then **biased toward practitioners the current ranking already favors**.
- When you optimize the ranking to match this ground truth, you partly reinforce the existing ranking instead of getting an independent judgment of who is truly best for the query.

So the bias is **selection bias in the candidate pool**: the LLM’s choices are restricted to whoever the current ranking surfaced.

## How we address it

The benchmark generator uses a **configurable candidate pool strategy** so the LLM sees a broader or more diverse set of practitioners, not only “top 30 by current ranking.”

Set **`CANDIDATE_POOL_STRATEGY`** in the environment (or in `parallel-ranking-package/.env`):

| Strategy | Behavior | Use when |
|----------|----------|----------|
| **`ranking_only`** | Top 30 from **full current ranking** (session context + BM25 + rescoring). Same as original behavior. | You want to keep the original, ranking-only pool. |
| **`hybrid_bm25`** (default) | **Top 20** from full ranking + **top 40** from **BM25-only** (no intent rescoring). Union by practitioner, deduplicated, cap **50**. | You want to reduce bias while staying query-relevant. |
| **`hybrid_random`** | **Top 20** from full ranking + **20 random** from those **not** in the full-ranking top 30. Union, cap **45**. | You want practitioners the current ranking never surfaces (stronger diversity, more noise). |
| **`multi_source`** | **Top 15** full ranking + **top 20** BM25-only + **top 15** **keyword-overlap** + **10 random**. Union deduplicated, cap **55**. Mixes several matching processes to minimize bias. | You want maximum diversity of retrieval: full ranking, BM25-only, simple term-overlap, and random. |

### What each source in `multi_source` does

- **Full ranking**: Same as production (session context + BM25 + intent rescoring). Surfaces who the current system favors.
- **BM25-only**: Same query, but no rescoring. Surfaces who matches on text/BM25 but might be demoted by intent.
- **Keyword-overlap**: Simple count of how many query terms (tokenized) appear in each practitioner’s profile (specialty, subspecialties, clinical expertise, description, procedures). No IDF, no length norm. Surfaces who mentions the right words but may rank poorly on BM25.
- **Random**: Practitioners not yet in the pool, sampled at random. Surfaces people who would never appear in top-30 or BM25-only or keyword top-15.

### Recommended for lowest bias: `multi_source`

- **Four different matching processes**: Full ranking, BM25-only, keyword-overlap, and random. Practitioners who appear in only one of these (e.g. strong keyword match but weak BM25) can still get into the pool.
- **Keyword-overlap** is a different signal from BM25 (no IDF, no length normalization), so it can surface different practitioners.
- **Random** ensures some practitioners who would never appear in any retrieval top-N are still seen by the LLM.
- Pool cap is 55 to keep context manageable.

### Optional: `hybrid_random`

- Use if you want only ranking + random (no BM25-only or keyword-overlap). The random slice can include less relevant practitioners, so the benchmark may be noisier.

## Configuration

In `parallel-ranking-package/.env` (or environment):

```bash
# Candidate pool strategy: ranking_only | hybrid_bm25 | hybrid_random | multi_source
CANDIDATE_POOL_STRATEGY=multi_source
```

If unset, the script uses **`hybrid_bm25`**. Use **`multi_source`** to mix full ranking, BM25-only, keyword-overlap, and random for the lowest bias.

## Implementation details

- **hybrid_bm25**: Same BM25 query as the full pipeline (q_patient + anchor phrases, normalized), but we call `rankPractitionersBM25` only (no rescoring). Top 40 from BM25-only + top 20 from full ranking (deduplicated), cap 50.
- **hybrid_random**: Full-ranking top 30 defines “excluded.” Top 20 from full ranking + 20 random from the rest (deduplicated), cap 45.
- **multi_source**: Top 15 full ranking + top 20 BM25-only + top 15 from keyword-overlap (simple term count in practitioner text) + 10 random. Union deduplicated, cap 55. Keyword-overlap uses the same searchable fields (specialty, subspecialties, clinical_expertise, description, procedures) and tokenizes the query with a simple split; no IDF or length norm.

The LLM prompt and “pick 5” step are unchanged; only the set of candidates passed to the LLM changes.
