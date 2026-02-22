"""
Optuna driver for BM25 field weights (document-side weights for searchable text).
Maximizes NDCG@12 on the train set; reports final performance on holdout.
Run from Local Doctor Ranking: python optimization/optimize_field_weights.py
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
WEIGHTS_PATH = ROOT_DIR / "ranking-weights.json"
BEST_FIELD_WEIGHTS_PATH = ROOT_DIR / "best-field-weights.json"
HOLDOUT_METRICS_FIELD_PATH = ROOT_DIR / "holdout-metrics-field-weights.json"
N_TRIALS = int(os.environ.get("N_TRIALS", "30"))
WORKERS = os.environ.get("WORKERS", "4")

# Field keys and search ranges (same as FIELD_WEIGHTS in local-bm25-service.js; clinical_expertise split, specialty_description removed)
FIELD_RANGES = {
    "expertise_procedures": (1.5, 3.0),
    "expertise_conditions": (1.5, 3.0),
    "expertise_interests": (1.0, 2.5),
    "procedure_groups": (1.5, 4.0),
    "specialty": (1.5, 3.5),
    "subspecialties": (1.5, 3.5),
    "description": (1.0, 2.0),
    "about": (0.3, 1.5),
    "name": (0.3, 1.5),
    "memberships": (0.3, 1.5),
    "address_locality": (0.3, 1.5),
    "title": (0.3, 1.5),
}


def run_evaluator(subset: str, weights_path: Path) -> float:
    """Run Node evaluator on train or holdout; return NDCG@12."""
    cmd = [
        "node",
        str(ROOT_DIR / "evaluation" / "evaluate-ranking-subset.js"),
        f"--{subset}",
        "--metric=ndcg12",
        "--use-cache",
        f"--weights={weights_path}",
    ]
    env = os.environ.copy()
    env["WORKERS"] = WORKERS
    result = subprocess.run(
        cmd,
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        env=env,
        timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Evaluator failed: {result.stderr or result.stdout}")
    return float(result.stdout.strip())


def objective(trial: optuna.Trial) -> float:
    """Suggest field_weights only; merge into ranking-weights.json, run evaluator on train."""
    field_weights = {
        key: trial.suggest_float(key, low, high)
        for key, (low, high) in FIELD_RANGES.items()
    }
    with open(WEIGHTS_PATH, "r") as f:
        weights = json.load(f)
    weights["field_weights"] = field_weights
    with open(WEIGHTS_PATH, "w") as f:
        json.dump(weights, f, indent=2)
    return run_evaluator("train", WEIGHTS_PATH)


def main():
    if not WEIGHTS_PATH.exists():
        print(f"Default weights not found: {WEIGHTS_PATH}", file=sys.stderr)
        sys.exit(1)
    split_path = ROOT_DIR / "benchmarks" / "benchmark-split.json"
    if not split_path.exists():
        print(f"Split not found: {split_path}. Run node scripts/create-benchmark-split.js", file=sys.stderr)
        sys.exit(1)
    cache_path = ROOT_DIR / "benchmarks" / "benchmark-session-context-cache.json"
    if not cache_path.exists():
        print(f"Cache not found: {cache_path}. Run node scripts/build-session-context-cache.js", file=sys.stderr)
        sys.exit(1)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=N_TRIALS, n_jobs=1, show_progress_bar=True)

    best_field_weights = study.best_params
    with open(WEIGHTS_PATH, "r") as f:
        weights = json.load(f)
    weights["field_weights"] = best_field_weights
    with open(BEST_FIELD_WEIGHTS_PATH, "w") as f:
        json.dump({"field_weights": best_field_weights}, f, indent=2)
    print(f"Best trial: {study.best_value:.4f} NDCG@12 (train)")
    print(f"Best field_weights written to {BEST_FIELD_WEIGHTS_PATH}")

    with open(WEIGHTS_PATH, "w") as f:
        json.dump(weights, f, indent=2)
    holdout_ndcg = run_evaluator("holdout", WEIGHTS_PATH)
    holdout_metrics = {"ndcg12": holdout_ndcg}
    with open(HOLDOUT_METRICS_FIELD_PATH, "w") as f:
        json.dump(holdout_metrics, f, indent=2)
    print(f"Holdout NDCG@12: {holdout_ndcg:.4f}")
    print(f"Holdout metrics written to {HOLDOUT_METRICS_FIELD_PATH}")


if __name__ == "__main__":
    main()
