"""
Optuna driver to maximize Stage A retrieval recall @150 (BM25 top 150).
Tunes k1, b, and optionally field_weights. Uses V2 cache and full benchmark.
Run from Local Doctor Ranking: python optimization/optimize_stage_a_recall.py

Env:
  N_TRIALS=50       number of Optuna trials (default 50)
  TUNE_FIELDS=1    set to 1 to also tune field_weights (slower, more params)
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
WEIGHTS_PATH = ROOT_DIR / "ranking-weights-optuna-stage-a.json"
BEST_WEIGHTS_PATH = ROOT_DIR / "best-stage-a-recall-weights.json"
CACHE_V2 = ROOT_DIR / "benchmark-session-context-cache-v2.json"
SPLIT_FILE = ROOT_DIR / "benchmark-split.json"
STAGE_A_N = 150
N_TRIALS = int(os.environ.get("N_TRIALS", "50"))
TUNE_FIELDS = os.environ.get("TUNE_FIELDS", "0") == "1"
TRAIN_ONLY = True  # Optimize on training data only; no holdout

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


def run_stage_a_recall(weights_path: Path) -> float:
    """Run Node script; return Stage A recall @150 (single float from stdout)."""
    cmd = [
        "node",
        str(ROOT_DIR / "evaluate-stage-a-recall.js"),
        f"--weights={weights_path}",
        f"--cache={CACHE_V2}",
        f"--n={STAGE_A_N}",
    ]
    if TRAIN_ONLY and SPLIT_FILE.exists():
        cmd.append("--train")
        cmd.append(f"--split={SPLIT_FILE}")
    result = subprocess.run(
        cmd,
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(f"evaluate-stage-a-recall.js failed: {result.stderr or result.stdout}")
    lines = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]
    if not lines:
        raise RuntimeError("evaluate-stage-a-recall.js produced no stdout")
    return float(lines[-1])


def objective(trial: optuna.Trial) -> float:
    """Suggest k1, b; optionally field_weights. Write weights, run Stage A recall @150."""
    params = {
        "stage_a_top_n": STAGE_A_N,
        "k1": trial.suggest_float("k1", 1.0, 2.2),
        "b": trial.suggest_float("b", 0.5, 0.95),
    }
    if TUNE_FIELDS:
        params["field_weights"] = {
            key: trial.suggest_float(f"fw_{key}", low, high)
            for key, (low, high) in FIELD_RANGES.items()
        }
    with open(WEIGHTS_PATH, "w") as f:
        json.dump(params, f, indent=2)
    return run_stage_a_recall(WEIGHTS_PATH)


def main():
    if not CACHE_V2.exists():
        print(f"V2 cache not found: {CACHE_V2}. Run node build-session-context-cache.js --v2", file=sys.stderr)
        sys.exit(1)
    if not (ROOT_DIR / "evaluate-stage-a-recall.js").exists():
        print("evaluate-stage-a-recall.js not found in ROOT_DIR", file=sys.stderr)
        sys.exit(1)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=N_TRIALS, n_jobs=1, show_progress_bar=True)

    best_params = study.best_params
    out = {"stage_a_top_n": STAGE_A_N, "k1": best_params["k1"], "b": best_params["b"]}
    if TUNE_FIELDS:
        out["field_weights"] = {
            k.replace("fw_", ""): v for k, v in best_params.items() if k.startswith("fw_")
        }
    with open(BEST_WEIGHTS_PATH, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Best Stage A recall @{STAGE_A_N}: {study.best_value:.4f} (train only)")
    print(f"Best weights written to {BEST_WEIGHTS_PATH}")
    print("Re-run baseline with: node run-baseline-evaluation.js --session-context-v2 --use-cache --weights", BEST_WEIGHTS_PATH.name)


if __name__ == "__main__":
    main()
