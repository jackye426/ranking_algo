"""
Optuna driver to tune Stage 2 (rescoring) weights for best recall@12 and precision@12.
Stage A is fixed at N=150 (from base weights). Only rescoring params are tuned.
Uses V2 cache and parallel-v2 variant. Maximizes (recall@12 + precision@12) / 2 on train.

Run from Local Doctor Ranking: python optimization/optimize_stage2_rescoring.py

Env:
  N_TRIALS=40     number of trials (default 40)
  METRIC=recall_precision   recall12 | precision12 | recall_precision (default)
"""

import json
import os
import subprocess
import sys
from pathlib import Path

try:
    import optuna
except ImportError:
    print("Install optuna: pip install -r optimization/requirements.txt", file=sys.stderr)
    sys.exit(1)

ROOT_DIR = Path(__file__).resolve().parent.parent
BASE_WEIGHTS = ROOT_DIR / "best-stage-a-recall-weights-desc-tuned.json"
WEIGHTS_PATH = ROOT_DIR / "ranking-weights-optuna-stage2.json"
BEST_OUT_PATH = ROOT_DIR / "best-stage2-rescoring-weights.json"
CACHE_V2 = ROOT_DIR / "benchmarks" / "benchmark-session-context-cache-v2.json"
SPLIT_FILE = ROOT_DIR / "benchmarks" / "benchmark-split.json"

N_TRIALS = int(os.environ.get("N_TRIALS", "40"))
METRIC = os.environ.get("METRIC", "recall_precision")

# Rescoring-only params (Stage 2). Stage A params (k1, b, field_weights, stage_a_top_n) come from base.
RESCORE_RANGES = {
    "anchor_per_match": (0.1, 0.5),
    "anchor_cap": (0.4, 1.2),
    "pathway_1": (0.5, 2.0),
    "pathway_2": (1.0, 3.0),
    "pathway_3": (2.0, 4.0),
    "high_signal_1": (1.0, 3.0),
    "high_signal_2": (2.0, 5.0),
    "procedure_per_match": (0.2, 1.0),
    "subspecialty_factor": (0.2, 0.6),
    "subspecialty_cap": (0.3, 0.8),
    "negative_1": (-2.0, 0),
    "negative_2": (-3.0, -0.5),
    "negative_4": (-4.0, -1.0),
    "safe_lane_1": (0.5, 1.5),
    "safe_lane_2": (1.0, 2.5),
    "safe_lane_3_or_more": (2.0, 4.0),
}


def run_evaluator(weights_path: Path) -> float:
    cmd = [
        "node",
        str(ROOT_DIR / "evaluation" / "evaluate-ranking-subset.js"),
        "--train",
        f"--metric={METRIC}",
        "--use-cache",
        f"--cache={CACHE_V2}",
        f"--weights={weights_path}",
        "--variant=parallel-v2",
    ]
    env = os.environ.copy()
    env["WORKERS"] = os.environ.get("WORKERS", "4")
    result = subprocess.run(
        cmd,
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"evaluate-ranking-subset.js failed: {result.stderr or result.stdout}")
    lines = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]
    if not lines:
        raise RuntimeError("evaluate-ranking-subset.js produced no stdout")
    return float(lines[-1])


def objective(trial: optuna.Trial) -> float:
    with open(BASE_WEIGHTS) as f:
        params = json.load(f)
    for key, (low, high) in RESCORE_RANGES.items():
        params[key] = trial.suggest_float(key, low, high)
    with open(WEIGHTS_PATH, "w") as f:
        json.dump(params, f, indent=2)
    return run_evaluator(WEIGHTS_PATH)


def main():
    if not BASE_WEIGHTS.exists():
        print(f"Base weights not found: {BASE_WEIGHTS}", file=sys.stderr)
        sys.exit(1)
    if not CACHE_V2.exists():
        print(f"V2 cache not found: {CACHE_V2}", file=sys.stderr)
        sys.exit(1)
    if not SPLIT_FILE.exists():
        print(f"Split not found: {SPLIT_FILE}", file=sys.stderr)
        sys.exit(1)
    if not (ROOT_DIR / "evaluate-ranking-subset.js").exists():
        print("evaluate-ranking-subset.js not found", file=sys.stderr)
        sys.exit(1)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=N_TRIALS, n_jobs=1, show_progress_bar=True)

    with open(BASE_WEIGHTS) as f:
        out = json.load(f)
    for key in RESCORE_RANGES:
        out[key] = study.best_params[key]
    with open(BEST_OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Best {METRIC} (train): {study.best_value:.4f}")
    print(f"Best Stage 2 rescoring weights written to {BEST_OUT_PATH}")
    print("Re-run full evaluation: node run-baseline-evaluation.js --session-context-v2 --use-cache --weights", BEST_OUT_PATH.name)


if __name__ == "__main__":
    main()
