# Tuning for 100% or very high (90%+) excellent-fit in top 3

Goal: tune **Stage B rescoring weights** (and optionally Stage A) so that the **top 3** returned doctors are almost always **excellent fit** (LLM-verified). Target: **100% or very high 90%** of cases where all top 3 are excellent fit.

---

## Current baseline

- **pct_cases_top3_all_excellent:** 65% (65/100 cases have all top 3 excellent).
- **pct_excellent_fit_at_3_avg:** 84.3% (on average 84.3% of top-3 slots are excellent fit).

So ~35% of cases have at least one non–excellent-fit doctor in the top 3. To reach 90%+ or 100%, we need to **push non–excellent docs down** and **pull excellent-fit docs up** in the ranking.

---

## What to tune

### Stage B (rescoring) – main levers

Stage B reorders the Stage A top N using **intent terms**, **anchor phrases**, **safe_lane terms**, **subspecialty**, and **negative terms**. Tuning these weights changes who lands in the top 3.

| Parameter | Default | Role | Tuning direction for more excellent top 3 |
|-----------|---------|------|------------------------------------------|
| **high_signal_1 / high_signal_2** | 2.0 / 4.0 | Boost docs that match high-signal intent (chest pain, angina, coronary artery disease, etc.) | **Increase** so strong intent matches rank higher. |
| **pathway_1 / pathway_2 / pathway_3** | 1.0 / 2.0 / 3.0 | Boost docs that match other intent terms | **Increase** so docs aligned with query intent rank higher. |
| **anchor_per_match / anchor_cap** | 0.2 / 0.6 (v2: 0.25 / 0.75) | Boost docs that contain anchor phrases (e.g. “interventional cardiology”) | **Increase** so anchor-matched docs win in top 3. |
| **safe_lane_1 / safe_lane_2 / safe_lane_3_or_more** | 1.0 / 2.0 / 3.0 | Boost docs that match safe symptom/condition terms | **Increase** so “right lane” docs rank higher. |
| **subspecialty_factor / subspecialty_cap** | 0.3 / 0.5 | Boost docs whose subspecialty matches inferred subspecialty | **Increase** so right subspecialty is favoured. |
| **procedure_per_match** | 0.5 | Boost docs that match procedure terms | **Increase is fine**; try higher (e.g. 0.6–0.8) and let the metric decide. **Keep modest** only if procedure-heavy docs crowd out better fits for symptom-based queries. |
| **negative_1 / negative_2 / negative_4** | -1 / -2 / -3 | Penalise docs that match “wrong lane” terms | **More negative** (e.g. -2 / -3 / -5) so wrong-subspecialty docs drop out of top 3. |
| **negative_mult_1 / negative_mult_2 / negative_mult_4** | 0.95 / 0.85 / 0.70 | Multiplicative penalty when not using rescoring score as primary | **Lower** (e.g. 0.85 / 0.70 / 0.50) so wrong-lane docs are pushed down more. |

**Idea:** Stronger **boosts** for intent/anchor/safe_lane/subspecialty and stronger **penalties** for negative terms should move “excellent fit” docs into the top 3 and “non–excellent” docs below.

### Stage A (optional)

- **stage_a_top_n:** Keep at 150 so we have enough candidates for rescoring.
- **k1, b, field_weights:** Already tuned for recall; only re-tune if you also want to change who gets into the pool.

---

## How to tune

### 1. Manual experiments

1. Copy `best-stage-a-recall-weights-desc-tuned.json` to a new file (e.g. `ranking-weights-excellent-top3.json`).
2. Add **Stage B** keys (see `DEFAULT_RANKING_CONFIG` in `local-bm25-service.js`):  
   `high_signal_1`, `high_signal_2`, `pathway_1`, `pathway_2`, `pathway_3`, `procedure_per_match`, `anchor_per_match`, `anchor_cap`, `subspecialty_factor`, `subspecialty_cap`, `negative_1`, `negative_2`, `negative_4`, `safe_lane_1`, `safe_lane_2`, `safe_lane_3_or_more`.
3. Increase boosts (e.g. high_signal_2 to 5, anchor_cap to 0.9, safe_lane_3_or_more to 4) and penalties (e.g. negative_4 to -4).
4. Run:
   ```bash
   node evaluate-excellent-fit-llm.js --use-cache --weights=ranking-weights-excellent-top3.json [--limit=20]
   ```
5. Check `summary.success_metrics.pct_cases_top3_all_excellent` and `pct_excellent_fit_at_3_avg`. Iterate.

### 2. Optuna (automated)

Use the script that **maximises** the share of cases where all top 3 are excellent fit:

```bash
cd "Local Doctor Ranking"
python optimization/optimize_excellent_fit_top3.py
```

- **Objective:** Maximise **pct_cases_top3_all_excellent** (percentage of cases with all top 3 excellent fit).
- **Base weights:** `best-stage-a-recall-weights-desc-tuned.json` (Stage A N=150).
- **Tuned:** Stage B rescoring params only.
- **Cost:** Each trial runs `evaluate-excellent-fit-llm.js` with `--limit=N` test cases (~N LLM calls per trial). Use smaller `LIMIT` if you hit timeouts often.

**Env:**

- `N_TRIALS=20` – number of Optuna trials (default 20).
- `LIMIT=20` – test cases per trial (default 20; lower = faster, less timeout risk; higher = noisier metric).
- `METRIC=top3_pct` – metric to maximise: `top3_pct` (default) or `top3_avg`, `top5_pct`, `top5_avg`.
- `TRIAL_TIMEOUT=1200` – seconds per trial (default 1200 = 20 min). Increase (e.g. 1800) if trials often timeout.
- `STUDY_TIMEOUT=7200` – optional: stop study after N seconds and keep best so far (e.g. 7200 = 2 h).
- `OPTUNA_RESUME=1` – use SQLite storage and resume after timeout/crash; progress is saved to `optimization/optuna_excellent_fit.db`.

**If you timeout a lot:** set `LIMIT=15`, `TRIAL_TIMEOUT=1800`, and `OPTUNA_RESUME=1`; re-run the same command to continue from the last run.

After optimisation, run a **full** excellent-fit eval (no `--limit`) with the best weights and optionally save as the new baseline.

### 3. Single-metric stdout (for Optuna / scripts)

To get one number on stdout for automation:

```bash
node evaluate-excellent-fit-llm.js --use-cache --weights=best-stage-a-recall-weights-desc-tuned.json --limit=30 --metric=top3_pct --output=out.json
```

Last line of stdout is the metric value (e.g. `65` for 65% cases with all top 3 excellent).  
Options: `top3_pct`, `top3_avg`, `top5_pct`, `top5_avg`.

---

## Suggested starting point for 90%+ top 3

- **Stronger intent/anchor/safe_lane:** e.g. `high_signal_2: 5`, `pathway_3: 4`, `anchor_per_match: 0.3`, `anchor_cap: 0.9`, `safe_lane_3_or_more: 4`.
- **Stronger negative penalties:** e.g. `negative_1: -1.5`, `negative_2: -2.5`, `negative_4: -4` (additive) or `negative_mult_4: 0.5` (multiplicative).
- **Higher subspecialty and procedure:** e.g. `subspecialty_factor: 0.4`, `subspecialty_cap: 0.6`; `procedure_per_match: 0.6` or higher—let the excellent-fit metric decide.

Then run the excellent-fit evaluator and, if needed, use Optuna to refine further toward 100% or very high 90% excellent pick for top 3.
