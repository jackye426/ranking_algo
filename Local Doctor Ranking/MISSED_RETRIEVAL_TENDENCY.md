# Why BM25 Misses Some Benchmark Picks at N=100 and N=150

Analysis script: `node analyze-missed-retrieval.js --weights=best-stage-a-recall-weights.json --out=missed-retrieval-report.json`

## Counts (with best-stage-a-recall-weights)

- **Missed at N=100:** 69 ground-truth picks (500 total → 86.2% recall).
- **Missed at N=150:** 33 ground-truth picks (93.4% recall).

## Main tendency: competition, not wording gap

**All missed picks (at both N=100 and N=150) have high query-term overlap (5+ query terms present in the doc).**

- **0%** of missed picks have low overlap (0–2 terms) — so we are **not** missing them because of a lexical/wording gap (e.g. query “AF” vs doc “atrial fibrillation” is already covered by normalization or term overlap).
- **100%** have high overlap — the doc clearly matches the query text, but BM25 ranks **other** documents higher. So the tendency is: **BM25 misses these picks because of scoring/ranking competition**, not because the doc doesn’t match the query.

Implications:

- Query expansion or synonym expansion is unlikely to fix these misses; the terms are already there.
- Improving recall for these picks likely requires: **retrieving more candidates (larger N)**, **tweaking field weights / BM25 params** so these docs score higher relative to others, or **two-phase retrieval** (e.g. fetch more, then rerank with a model that better separates these from the rest).

## Rank distribution (where missed picks actually rank)

**Missed at N=100:**

| Rank band      | Count | Note                          |
|----------------|-------|-------------------------------|
| 101–150        | 36    | Recovered if we use N=150     |
| 151–200        | 6     | Recovered at N=200           |
| 201–300        | 3     |                               |
| >300           | 24    | Far down the list             |

**Missed at N=150:**

| Rank band | Count |
|-----------|-------|
| 151–200   | 6     |
| 201–300   | 3     |
| 301–500   | 10    |
| >500      | 14    |

So 36 of the 69 missed at N=100 sit just below the cut (101–150); the rest are spread deeper. The 33 missed at N=150 are mostly rank 151+ (many in 301–500 and >500).

## Where do query terms appear in missed docs?

- **Mixed (high- and low-weight fields):** 68 of 69 missed at N=100; 32 of 33 at N=150. So the relevant terms appear in both strong fields (e.g. clinical_expertise, procedure_groups) and weaker ones (e.g. description). BM25 still ranks other docs above these — likely due to **term frequency / length** in those other docs, or how the weighted sum over fields combines.
- **High-weight fields only:** 1 in each group.
- **Low-weight only / none:** 0. So we are not missing them because the only match is in description/about; matches are in key fields too.

## Score gap

- **Avg score gap at N=100:** threshold (score at rank 100) minus missed doc score ≈ **0.097**. So on average missed docs sit just below the top-100 cutoff; small score gains could bring many in.
- **Avg score gap at N=150:** ≈ **0.084**. Same idea: many are close to the boundary.

## Low-weight field theme (common across missed profiles)

Among **missed** picks, which weak-weighted field has query-term matches most often?

| Field | Missed at N=100 | Missed at N=150 |
|-------|-----------------|-----------------|
| **description** | **68/69 (99%)** with ≥1 match, avg overlap **10.7** | **32/33 (97%)**, avg **11.5** |
| **about** | **68/69 (99%)**, avg 10.7 | **32/33 (97%)**, avg 11.5 |
| specialty_description | 0/69 (0%) | 0/33 (0%) |
| name | 2/69 (3%) | 1/33 (3%) |

**Common theme:** **description** and **about** — almost every missed profile has query-term matches in both (~99% at N=100, ~97% at N=150), with high average overlap (~10–11 terms). specialty_description and name rarely contribute. Boosting **description** (and/or **about**) in BM25 field weights could help these profiles score higher.

## Summary

| Question | Answer |
|----------|--------|
| Why does BM25 miss these picks? | **Not** wording mismatch — all have high query-term overlap. They are missed because **other docs get higher BM25 scores** (competition). |
| Where do missed picks rank? | At N=100: 36 in 101–150, rest 151–300+; at N=150: spread from 151 to 500+. |
| Do they match in strong or weak fields? | Almost all have **mixed** (both high- and low-weight fields); none are “low_only” or “none”. |
| **One weak field that is a common theme?** | **description** (and **about**): ~99% of missed picks have matches there with high overlap. Boosting these fields may help. |
| What might help? | Larger N (already helps 101–150), **field-weight / k1/b tuning** (e.g. boost description/about) so these docs score higher, or **reranking** over a larger pool. |
