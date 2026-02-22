# Optimising Stage 2 (rescoring) for recall@12 and precision@12

With **Stage A fixed at N=150** (using `best-stage-a-recall-weights-desc-tuned.json`), Stage 2 is the rescoring step that reorders the top 150 and returns the top 12. This doc describes how to tune Stage 2 to improve **recall@12** and **precision@12**.

## Pipeline

1. **Stage A:** BM25 retrieval → top 150 (fixed; uses k1, b, field_weights, stage_a_top_n from base weights).
2. **Stage 2:** Rescoring with intent terms, anchor phrases, subspecialty boost, negative penalties, safe_lane terms → reorder 150 → take **top 12**.

Tunable Stage 2 params (in `rankingConfig`): `anchor_per_match`, `anchor_cap`, `pathway_1/2/3`, `high_signal_1/2`, `procedure_per_match`, `subspecialty_factor`, `subspecialty_cap`, `negative_1/2/4`, `safe_lane_1/2/3_or_more`.

## Run Optuna for Stage 2

From **Local Doctor Ranking**:

```bash
python optimization/optimize_stage2_rescoring.py
```

- **Base weights:** `best-stage-a-recall-weights-desc-tuned.json` (stage_a_top_n=150, desc/about tuned).
- **Objective:** Maximise `(recall@12 + precision@12) / 2` on the **train** split (default).
- **Variant:** `parallel-v2` (V2 cache, safe_lane, merged anchors).
- **Env:** `N_TRIALS=40` (default), `METRIC=recall_precision` | `recall12` | `precision12`.

Output: **best-stage2-rescoring-weights.json** (base weights + best rescoring params).

## Evaluate ranking subset (single metric)

To compute recall@12 or precision@12 on train/holdout with a given weights file:

```bash
node evaluate-ranking-subset.js --train --use-cache --cache=benchmark-session-context-cache-v2.json --weights=best-stage2-rescoring-weights.json --variant=parallel-v2 --metric=recall_precision
```

Metrics: `recall12`, `precision12`, `recall_precision` (average), `ndcg12`.

## Full baseline evaluation

After tuning, run the full benchmark (100 cases) with the best Stage 2 weights:

```bash
node run-baseline-evaluation.js --session-context-v2 --use-cache --weights best-stage2-rescoring-weights.json
```

This uses Stage A N=150 and the tuned rescoring; report Recall@12, Precision@12, NDCG@12, MRR from the summary.
