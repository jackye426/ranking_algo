"""
Optuna driver for BM25 parameters (k1, b) only.
Maximizes NDCG@12 on the train set; reports final performance on holdout.
Run from Local Doctor Ranking: python optimization/optimize_bm25_params.py
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
BEST_BM25_PARAMS_PATH = ROOT_DIR / "best-bm25-params.json"
HOLDOUT_METRICS_BM25_PATH = ROOT_DIR / "holdout-metrics-bm25.json"
N_TRIALS = int(os.environ.get("N_TRIALS", "30"))
WORKERS = os.environ.get("WORKERS", "4")


def run_evaluator(subset: str, weights_path: Path) -> float:
    """Run Node evaluator on train or holdout; return NDCG@12."""
    cmd = [
        "node",
        str(ROOT_DIR / "evaluate-ranking-subset.js"),
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
    """Suggest k1, b only; merge into ranking-weights.json, run evaluator on train."""
    params = {
        "k1": trial.suggest_float("k1", 1.0, 2.0),
        "b": trial.suggest_float("b", 0.5, 0.9),
    }
    with open(WEIGHTS_PATH, "r") as f:
        weights = json.load(f)
    weights.update(params)
    with open(WEIGHTS_PATH, "w") as f:
        json.dump(weights, f, indent=2)
    return run_evaluator("train", WEIGHTS_PATH)


def main():
    if not WEIGHTS_PATH.exists():
        print(f"Default weights not found: {WEIGHTS_PATH}", file=sys.stderr)
        sys.exit(1)
    split_path = ROOT_DIR / "benchmark-split.json"
    if not split_path.exists():
        print(f"Split not found: {split_path}. Run node create-benchmark-split.js", file=sys.stderr)
        sys.exit(1)
    cache_path = ROOT_DIR / "benchmark-session-context-cache.json"
    if not cache_path.exists():
        print(f"Cache not found: {cache_path}. Run node build-session-context-cache.js", file=sys.stderr)
        sys.exit(1)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=N_TRIALS, n_jobs=1, show_progress_bar=True)

    best = study.best_params
    with open(WEIGHTS_PATH, "r") as f:
        weights = json.load(f)
    weights.update(best)
    with open(BEST_BM25_PARAMS_PATH, "w") as f:
        json.dump(weights, f, indent=2)
    print(f"Best trial: {study.best_value:.4f} NDCG@12 (train)")
    print(f"Best k1/b written to {BEST_BM25_PARAMS_PATH}")

    with open(WEIGHTS_PATH, "w") as f:
        json.dump(weights, f, indent=2)
    holdout_ndcg = run_evaluator("holdout", WEIGHTS_PATH)
    holdout_metrics = {"ndcg12": holdout_ndcg}
    with open(HOLDOUT_METRICS_BM25_PATH, "w") as f:
        json.dump(holdout_metrics, f, indent=2)
    print(f"Holdout NDCG@12: {holdout_ndcg:.4f}")
    print(f"Holdout metrics written to {HOLDOUT_METRICS_BM25_PATH}")


if __name__ == "__main__":
    main()
