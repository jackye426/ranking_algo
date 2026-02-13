"""
Optuna driver to tune description and about weights (same value for both) for Stage A recall @150.
Uses best-stage-a-recall-weights.json as base; only description and about are tuned.
Run from Local Doctor Ranking: python optimization/optimize_description_weight.py

Env:
  N_TRIALS=30   number of trials (default 30)
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
BASE_WEIGHTS = ROOT_DIR / "best-stage-a-recall-weights.json"
WEIGHTS_PATH = ROOT_DIR / "ranking-weights-optuna-desc.json"
BEST_OUT_PATH = ROOT_DIR / "best-stage-a-recall-weights-desc-tuned.json"
CACHE_V2 = ROOT_DIR / "benchmark-session-context-cache-v2.json"
SPLIT_FILE = ROOT_DIR / "benchmark-split.json"
STAGE_A_N = 150
N_TRIALS = int(os.environ.get("N_TRIALS", "30"))


def run_stage_a_recall(weights_path: Path) -> float:
    cmd = [
        "node",
        str(ROOT_DIR / "evaluate-stage-a-recall.js"),
        f"--weights={weights_path}",
        f"--cache={CACHE_V2}",
        f"--n={STAGE_A_N}",
    ]
    if SPLIT_FILE.exists():
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
    desc_about = trial.suggest_float("desc_about", 1.0, 3.5)
    with open(BASE_WEIGHTS) as f:
        params = json.load(f)
    if "field_weights" not in params:
        params["field_weights"] = {}
    params["field_weights"]["description"] = desc_about
    params["field_weights"]["about"] = desc_about
    with open(WEIGHTS_PATH, "w") as f:
        json.dump(params, f, indent=2)
    return run_stage_a_recall(WEIGHTS_PATH)


def main():
    if not BASE_WEIGHTS.exists():
        print(f"Base weights not found: {BASE_WEIGHTS}", file=sys.stderr)
        sys.exit(1)
    if not CACHE_V2.exists():
        print(f"V2 cache not found: {CACHE_V2}", file=sys.stderr)
        sys.exit(1)
    if not (ROOT_DIR / "evaluate-stage-a-recall.js").exists():
        print("evaluate-stage-a-recall.js not found", file=sys.stderr)
        sys.exit(1)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=N_TRIALS, n_jobs=1, show_progress_bar=True)

    best_val = study.best_params["desc_about"]
    with open(BASE_WEIGHTS) as f:
        out = json.load(f)
    if "field_weights" not in out:
        out["field_weights"] = {}
    out["field_weights"]["description"] = best_val
    out["field_weights"]["about"] = best_val
    with open(BEST_OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Best Stage A recall @{STAGE_A_N}: {study.best_value:.4f} (train)")
    print(f"Best description=about weight: {best_val:.4f}")
    print(f"Best weights written to {BEST_OUT_PATH}")


if __name__ == "__main__":
    main()
