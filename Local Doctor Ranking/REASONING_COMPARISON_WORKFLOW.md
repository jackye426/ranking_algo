# Comparing benchmark reasoning to session context and fixing intent / BM25 / ranking

## Goal

Use the **benchmark ground-truth reasons** (why the top 5 were picked) to find gaps between “what the benchmark said mattered” and “what our session context (intent_terms, anchor_phrases) produced”, then fix intent extraction and the rest of the BM25/ranking pipeline.

---

## Step 1: Generate the comparison report

```bash
node compare-reasons-to-session-context.js
# Optional: custom output path and CSV
node compare-reasons-to-session-context.js --output=my-report.json --csv
```

**Inputs:**

- `benchmark-ground-truth-reasons.json` (from `build-benchmark-ground-truth-reasons.js`)
- `benchmark-session-context-cache.json` (from `build-session-context-cache.js`)

**Output:** `benchmark-reasoning-comparison-report.json` (and optionally a `.csv`)

**What it does:**

- For each test case: extracts **benchmark terms** from `match_factors` (e.g. “Electrophysiology in subspecialties”, “Cardiac Ablation in procedures”) and **session terms** from `intent_terms`, `anchor_phrases`, `safe_lane_terms`.
- Computes **missing** = benchmark terms not present in session context.
- Aggregates **missing terms by frequency** (how many questions had that term as “benchmark said mattered but we didn’t have”).

**Use the report for:**

- **Per-question:** `perQuestion[].missingTerms` — concrete terms to consider adding for that query.
- **Aggregate:** `aggregateMissingTerms` — high-frequency missing terms to fix in prompts or parsing first.

---

## Step 2: Interpret the gaps

| Finding | Meaning | Where to fix |
|--------|---------|----------------|
| **High-frequency missing terms** (e.g. “electrophysiology”, “ablation”, “palpitations”) | Session-context LLM often doesn’t output these even though the benchmark says they matter. | **Intent / session-context prompts** (and any parsing that builds `intent_terms` / `anchor_phrases`). |
| **Missing procedure/subspecialty phrases** (e.g. “cardiac ablation”, “catheter ablation”) | Rescoring and BM25 rely on these; if they’re not in intent_terms or anchor_phrases, matches are weaker. | **Session-context**: encourage procedure and subspecialty terms; optionally **query expansion** or synonym lists. |
| **Terms in session but not in benchmark** | Possible noise (generic terms). Not always bad; review a sample. | Optionally tighten prompts or add negative/stop lists. |

---

## Step 3: Fix intent and session context

1. **Prompts (session-context LLM)**  
   - Add few-shot examples where the “ideal” intent_terms and anchor_phrases include the top missing terms (e.g. for AF query: “electrophysiology”, “catheter ablation”, “AF”).  
   - Explicitly ask for: procedures, subspecialties, and condition names that a relevant doctor would have in their profile.

2. **Parsing / structure**  
   - If the LLM returns structured JSON, ensure procedure-like and subspecialty-like phrases are mapped into `intent_terms` or `anchor_phrases` (whichever your ranking uses).

3. **Optional: synonym / expansion list**  
   - For high-frequency missing terms, add a small mapping (e.g. “palpitations” → also emit “heart rhythm”, “arrhythmia”) so BM25 and rescoring see them. Prefer expanding from benchmark reasons so you don’t add noise.

4. **Re-run session context cache**  
   - After prompt/parsing changes, run `build-session-context-cache.js` again so the cache reflects the new intent.  
   - Then re-run `compare-reasons-to-session-context.js` to check that missing-term counts drop.

---

## Step 4: BM25 query and ranking (no structural change needed if intent is fixed)

- **BM25 query:** Today it uses `q_patient` + `safe_lane_terms` + `anchor_phrases`. Optionally `intent_terms` (config: `intent_terms_in_bm25`).  
  - If you **improve intent_terms/anchor_phrases** (Step 3), the same BM25 query will already see better terms; you don’t have to change the query shape.  
  - If you previously turned off `intent_terms_in_bm25` because it hurt: try again after improving intent quality, or add only a **subset** of intent_terms (e.g. procedure/subspecialty terms) to the BM25 query.

- **Rescoring:** Already uses intent_terms, anchor_phrases, procedures, subspecialties. Better session context directly improves rescoring.

- **Field weights / k1, b:** You’ve already tuned these. Only revisit if you see systematic mismatches (e.g. procedure matches still weak after fixing intent).

---

## Step 5: Re-run baseline and compare

1. After updating prompts and rebuilding the cache:  
   `node build-session-context-cache.js`  
2. Run baseline:  
   `node run-baseline-evaluation.js --use-cache`  
3. Compare NDCG@12 / Recall@12 to the previous baseline.  
4. Optionally run `compare-reasons-to-session-context.js` again and confirm that aggregate missing-term counts are lower.

---

## Quick reference

| Task | Command / file |
|------|-----------------|
| Generate reasoning (why top 5) | `node build-benchmark-ground-truth-reasons.js [--workers=4]` |
| Compare reasoning vs session context | `node compare-reasons-to-session-context.js [--csv]` |
| Read aggregate gaps | `benchmark-reasoning-comparison-report.json` → `aggregateMissingTerms` |
| Fix intent | Session-context prompts + parsing (e.g. in `getSessionContextParallel` / session-context LLM). |
| Rebuild cache after intent fix | `node build-session-context-cache.js` |
| Re-run baseline | `node run-baseline-evaluation.js --use-cache` |

Using the comparison report to fix **intent and session context** first, then re-running the benchmark, is the most direct way to improve the BM25 query and ranking algorithm without changing its structure.
