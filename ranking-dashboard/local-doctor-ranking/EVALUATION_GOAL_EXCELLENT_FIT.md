# Evaluation Goal: Excellent Fit (LLM-Verified)

We **no longer** use benchmark score (Recall@12, NDCG@12, etc. vs ground-truth picks) as the primary way to judge if returned results are good. Instead we use **LLM verification** of the final ranking output.

---

## How We Gauge Success

1. **Run the ranking pipeline** (V2: session context v2 + BM25 shortlist) to get the **top 12** per test case.
2. **Send the top 12** (with profile information) to an LLM (**GPT 5.1**) to verify, for each returned doctor, whether they are an **excellent fit** for the patient query.
3. **Label** doctors that are **not** excellent fit (with a brief reason).
4. **Success metrics:**
   - **% excellent fit** at top 3, top 5, and top 12 (averaged over test cases).
   - **Top 3 correct:** fraction of test cases where **all** of the top 3 are excellent fit.
   - **Top 5 correct:** fraction of test cases where **all** of the top 5 are excellent fit.

So we gauge success based on:
- **% excellent fit** (at 3, 5, 12), and  
- **Whether the top 3 and top 5 are “correct”** (i.e. all excellent fit in that slice).

---

## Script: `evaluate-excellent-fit-llm.js`

- **Input:** Benchmark test cases (and optional session-context cache).
- **Flow:**
  1. For each test case: get session context (from cache or LLM), run V2 ranking (BM25 shortlist) → top 12.
  2. Call GPT 5.1 with patient query + top 12 practitioners (with profile summaries).
  3. LLM returns `per_doctor`: `practitioner_name`, `excellent_fit` (true/false), `brief_reason`.
  4. Compute per-case: `pct_excellent_fit_at_3/5/12`, `top3_all_excellent`, `top5_all_excellent`, and list of **non–excellent-fit** doctors (labels).
  5. Aggregate: average % excellent fit at 3/5/12; % of cases where top 3 all excellent; % where top 5 all excellent.
- **Output:** `excellent-fit-evaluation.json` (or `--output=...`) with:
  - `summary`: `success_metrics` (averages and % top3/top5 correct), `model`, `runAt`.
  - `byId`: per test case — `top12_names`, `verification` (LLM response), `metrics`, and **non_excellent_fit_labels**.

**Usage:**

```bash
node evaluate-excellent-fit-llm.js [--use-cache] [--limit=N] [--workers=2] [--model=gpt-5.1] [--output=excellent-fit-evaluation.json]
```

Optional: `--weights=path` to pass ranking weights (e.g. `best-stage-a-recall-weights-desc-tuned.json`).  
With `--use-cache`, session context is read from `benchmark-session-context-cache-v2.json` (no LLM for session context; ranking and verification still run).

---

## Relation to Benchmark Metrics

- **Benchmark (Recall@12, NDCG@12, MRR)** remains useful for ablation and for checking that retrieval/ranking still surface ground-truth–style picks when they exist.
- **Primary success criteria** for “are the returned results good?” are now:
  - **% excellent fit** at 3, 5, 12.
  - **% of cases where top 3 are all excellent fit.**
  - **% of cases where top 5 are all excellent fit.**

Optimisation (e.g. Stage 2 tuning) can target these excellent-fit metrics; benchmark metrics can be reported alongside for context.

---

## Baseline snapshot

The **current baseline** is saved in **`excellent-fit-baseline.json`** (V2 pipeline, Stage A N=150, weights: `best-stage-a-recall-weights-desc-tuned.json`). Compare future runs (e.g. `excellent-fit-evaluation.json`) against this file for success_metrics and per-case results.
