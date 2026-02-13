# Ranking Algorithm Optimization Plan

**Primary evaluation goal (see [EVALUATION_GOAL_EXCELLENT_FIT.md](EVALUATION_GOAL_EXCELLENT_FIT.md)):** We now gauge success by LLM-verified "excellent fit" at top 3, 5, 12 (GPT 5.1), and by % of cases where top 3 and top 5 are all excellent fit. Benchmark metrics (Recall@12, NDCG@12) remain useful for ablation and context.

Goal (for weight tuning): iteratively tune ranking weights to improve retrieval at **top 12** (Recall@12, NDCG@12 on benchmark, and/or excellent-fit metrics from `evaluate-excellent-fit-llm.js`), while avoiding overfitting via a train/holdout split.

---

## 1. Session context cache (no LLM during optimization)

**Why:** For each benchmark question, the LLM is asked the same 3 things every time (intent, query expansion, etc.). Outputs are deterministic per question, so we compute them once and reuse.

**Implemented:**

- **Build cache (one-time):**  
  `node build-session-context-cache.js`  
  Runs `getSessionContextParallel` once per benchmark test case and saves to `benchmark-session-context-cache.json`. ~100 questions × 3 LLM calls = one-time cost.

- **Use cache (all evaluation/optimization runs):**  
  `node run-baseline-evaluation.js --use-cache`  
  Loads cached session context per question; **no LLM calls**. Same flag will be used by the optimization evaluator.

**Implication:** Optimization trials run **entirely locally** and quickly: only BM25 + rescoring with varying weights; no API cost or latency after the cache is built.

---

## 2. Baseline and data split

- **Save baseline at 12:** One-time snapshot → `benchmark-baseline-at-12.json` with `runAt`, `variant`, `averageRecallAt12`, `averagePrecisionAt12`, `averageNDCG@12` (NDCG@12), and optional `averageMRR`. Source: [benchmark-baseline-score.json](benchmark-baseline-score.json) or re-run. No code change to the ranking algo; this is a snapshot of current numbers (e.g. Recall@12 ≈ 0.524, Precision@12 ≈ 0.218, NDCG@12 ≈ 0.439).

- **Train/holdout split (explicit rule):** Hold out **5 questions per specialty**; use the rest for tuning. Deterministic and reproducible.
  - **Rule:** Sort test cases by **id** within each specialty, then take the **last 5** by that order. Handle id gaps (e.g. benchmark has no `benchmark-cardio-018`): use deterministic sort (e.g. by id string) so the same 5 are chosen every time.
  - **Holdout:** 25 cases (5 per specialty). **Train:** 75 cases.
  - **Split config:** `benchmark-split.json` with `trainIds` (array of 75 ids) and `holdoutIds` (array of 25 ids).
  - **Script:** `create-benchmark-split.js` reads [benchmark-test-cases-all-specialties.json](benchmark-test-cases-all-specialties.json), groups by `expectedSpecialty`, sorts by id within each group, takes last 5 per group as holdout, writes `benchmark-split.json`.

---

## 3. Configurable ranking weights

- **Config source:** Single JSON file (e.g. `ranking-weights.json`) so Optuna can write one file per trial and the Node evaluator reads it. If missing, use current defaults.

- **Where:** [parallel-ranking-package/testing/services/local-bm25-service.js](parallel-ranking-package/testing/services/local-bm25-service.js). Introduce an optional **ranking config** object (e.g. `filters.rankingConfig` or load from file). Default to current hardcoded values. In `rescoreWithIntentTerms` and `getBM25Shortlist` / `rankPractitionersBM25`, use config for numeric weights; keep the same logic, replace literals with config keys.

- **Tunable parameters (full list for config wiring):**
  - **High-signal:** +2.0 (1 match), +4.0 (2+ matches)
  - **Pathway:** +1.0 / +2.0 / +3.0 (1 / 2 / 3+ matches)
  - **Procedure:** +0.5 per match
  - **Anchor:** +0.2 per match, cap +0.6
  - **Subspecialty:** confidence×0.3, cap 0.5
  - **Negative (additive branch):** -3.0 / -2.0 / -1.0 (4+ / 2+ / 1 matches). Multiplicative branch (if tuned): 0.70 / 0.85 / 0.95
  - **BM25:** k1 (1.5), b (0.75) in `rankPractitionersBM25` / `getBM25Shortlist`

- **Implementation note (config wiring):** When making weights configurable, **audit every hardcoded rescoring and BM25 literal** in `local-bm25-service.js` and replace with config. Document the full list (e.g. in a short "Tunable parameters" section with code references) so no literal is missed; missing one means that parameter has no effect during tuning.

---

## 4. Node evaluator script

**Purpose:** Run ranking on a **subset** of benchmark test cases (train or holdout) with **configurable weights**, using **cached session context**, and output a single metric (e.g. NDCG@12) to stdout for Optuna.

**Inputs:**

- Path to **benchmark** (default: `benchmark-test-cases-all-specialties.json`).
- Path to **split** (default: `benchmark-split.json`) or explicit `--train` / `--holdout` / `--ids=id1,id2,...`.
- Path to **ranking weights** JSON (e.g. `ranking-weights.json`). If missing, use current defaults.
- **Metric:** `--metric=ndcg12` or `recall12` (default: NDCG@12).
- **WORKERS** (e.g. 4): run the subset with N concurrent ranking evaluations (same pattern as [generate-benchmark-ground-truth.js](generate-benchmark-ground-truth.js)).
- **`--use-cache`** and path to session-context cache (default: `benchmark-session-context-cache.json`).

**Flow:**

1. Load benchmark, split, weights, and cache.
2. Filter test cases to the requested id set (train or holdout).
3. For each case: **use cached session context** (no LLM); build filters from cache; call `getBM25Shortlist` with the **loaded weights**; evaluate vs ground truth; compute Recall@12, Precision@12, NDCG@12 (reuse logic from [run-baseline-evaluation.js](run-baseline-evaluation.js)).
4. Aggregate (e.g. average NDCG@12 over the subset).
5. Print **only** the metric value (e.g. `0.439`) to stdout; optional stderr for progress.

**Output:** Single number to stdout so Python can `float(stdout.strip())`. Exit code 0 on success.

**Requirements:** Must support `--use-cache` so no LLM calls are made during optimization. Weights must be injectable via the weights JSON path.

---

## 5. Python Optuna driver

- **Goal:** Maximize metric (e.g. NDCG@12) on the **train** set; report final performance on **holdout** once.
- **Setup:** Python 3 with `optuna` (and optionally `joblib` for parallel trials). Venv or requirements in e.g. `optimization/requirements.txt`.
- **Search space (start small):** e.g. `anchor_per_match` [0.1, 0.4], `anchor_cap` [0.4, 0.8], `subspecialty_cap` [0.3, 0.7], `high_signal_2` [2.0, 6.0], `pathway_3` [2.0, 4.0]. Expand later to more weights (pathway_2/1, procedure, negative, k1/b).
- **Execution:** n_trials=50 (or similar), n_jobs=1 initially. Each trial: write suggested weights to `ranking-weights.json` (or per-trial file e.g. `ranking-weights-trial-{n}.json` if n_jobs>1), run Node evaluator (e.g. `node evaluate-ranking-subset.js --train --metric=ndcg12 --use-cache`) with WORKERS=4, parse stdout to get metric, return it (Optuna maximizes). If n_jobs>1, use distinct weights file per trial to avoid races.
- **Final step:** After optimization, take best params, write to `ranking-weights.json`, run Node evaluator **on holdout** (e.g. `node evaluate-ranking-subset.js --holdout --metric=ndcg12 --use-cache`), and log/save holdout Recall@12, Precision@12, NDCG@12. Optionally run on **full 100** for a final report.
- **Artifacts:** Best params saved (e.g. `best-ranking-weights.json`), holdout metrics (e.g. `holdout-metrics.json`), and a short log of train vs holdout to detect overfitting.

---

## 6. Multiple workers

- **Node evaluator:** WORKERS=4 (or configurable) for concurrent ranking over the subset (e.g. 75 train questions in parallel batches). Same concurrency pattern as [generate-benchmark-ground-truth.js](generate-benchmark-ground-truth.js).
- **Optuna:** Start with n_jobs=1 (one trial at a time). Each trial runs one Node process; that process uses 4 workers internally. If you later use n_jobs=2, run two trials in parallel and use per-trial weights files to avoid overwriting.

---

## 7. Tunable parameters (summary)

| Parameter type       | Current / example                    | Notes                    |
|----------------------|--------------------------------------|--------------------------|
| High-signal rescore  | +2.0 / +4.0                          | Per-match additive       |
| Pathway rescore      | +1.0 / +2.0 / +3.0                   | Tiered by match count    |
| Procedure rescore    | +0.5 per match                       | Additive                 |
| Anchor rescore       | +0.2 per match, cap 0.6              | Additive                 |
| Subspecialty rescore | confidence×0.3, cap 0.5               | Optional tunable         |
| Negative match       | -3.0 / -2.0 / -1.0 (4+ / 2+ / 1)     | Additive; or 0.70/0.85/0.95 multiplicative |
| BM25 k1, b           | 1.5, 0.75                            | Standard BM25 params     |

---

## 8. Overfitting check

- Compare **train** vs **holdout** metric (e.g. NDCG@12) after optimization. If train is much higher than holdout, reduce model complexity (fewer tuned params), shorten Optuna runs, or add regularization (e.g. penalize large deviations from baseline weights in the objective). Optionally track holdout every N trials without using it for search to monitor drift.

---

## 9. Process overview

```mermaid
flowchart LR
  subgraph OneTime["One-time"]
    A[Benchmark test cases] --> B[build-session-context-cache.js]
    B --> C[benchmark-session-context-cache.json]
  end

  subgraph Opt["Optimization loop (no LLM)"]
    C --> D[Node evaluator --use-cache]
    W[Weight params] --> D
    D --> E[NDCG@12 on train]
    E --> F[Optuna trial]
    F --> G[Next params / best]
    G --> D
  end

  subgraph Final["Final check"]
    G --> H[Evaluate on holdout]
    H --> I[Holdout NDCG@12]
  end
```

---

## 10. Files to add or modify

| Action   | File / component |
|----------|-------------------|
| Exists   | `build-session-context-cache.js` |
| Exists   | `run-baseline-evaluation.js` (--use-cache) |
| Add      | `benchmark-baseline-at-12.json` – one-time snapshot of Recall@12, Precision@12, NDCG@12 (and optional MRR). |
| Add      | `benchmark-split.json` – trainIds (75), holdoutIds (25). |
| Add      | `create-benchmark-split.js` – optional script that reads benchmark, outputs split by “last 5 per specialty” (sort by id within specialty, take last 5). |
| Modify   | `local-bm25-service.js` – add optional `rankingConfig` (or load from file); use it in `rescoreWithIntentTerms` and in `rankPractitionersBM25` for k1/b. |
| Add      | `evaluate-ranking-subset.js` – subset (train/holdout/ids), load weights, run ranking with workers, print single metric; **always use cache** when available. |
| Add      | `ranking-weights.json` – default/current weights; overwritten by Optuna per trial (or per-trial copy). |
| Add      | `optimization/` – `requirements.txt`, `optimize_ranking.py` (Optuna loop, calls Node, holdout eval). |
| Output   | `best-ranking-weights.json` – best params from Optuna. |
| Output   | `holdout-metrics.json` – Recall@12, Precision@12, NDCG@12 on holdout for best weights. |

---

## 11. Quick start (after cache is built)

1. Build session context cache (once):  
   `node build-session-context-cache.js`
2. Create train/holdout split (once):  
   `node create-benchmark-split.js`
3. Run baseline with cache (verify no LLM):  
   `node run-baseline-evaluation.js --use-cache`
4. Run Optuna optimization (all trials use cache):  
   `cd optimization && pip install -r requirements.txt && python optimize_ranking.py`  
   Evaluator will be invoked with `--use-cache` and trial parameters; no LLM calls during optimization.
5. After optimization: run evaluator on holdout with best weights and save `holdout-metrics.json`.
