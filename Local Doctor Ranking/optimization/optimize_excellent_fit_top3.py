"""
Optuna driver to tune Stage B (rescoring) weights to maximize excellent-fit in top 3.
Stage A is fixed at N=150 (from base weights). Objective: maximize % of cases where
all top 3 are excellent fit (pct_cases_top3_all_excellent).

Run from Local Doctor Ranking: python optimization/optimize_excellent_fit_top3.py

Each trial runs evaluate-excellent-fit-llm.js with --limit=N so cost is ~N LLM
verification calls per trial. Use smaller LIMIT to avoid timeouts.

Env:
  N_TRIALS=20       number of trials (default 20)
  LIMIT=20          test cases per trial (default 20; lower = faster, less timeout risk)
  METRIC=top3_pct   top3_pct (default) | top3_avg | top5_pct | top5_avg
  TRIAL_TIMEOUT=1200   seconds per trial (default 1200 = 20 min; increase if you hit timeouts)
  STUDY_TIMEOUT=7200   optional: stop study after N seconds, keep best so far (e.g. 7200 = 2 h)
  OPTUNA_RESUME=1      use SQLite storage and load_if_exists so you can resume after timeout/crash
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
WEIGHTS_PATH = ROOT_DIR / "ranking-weights-optuna-excellent-top3.json"
BEST_OUT_PATH = ROOT_DIR / "best-excellent-fit-top3-weights.json"
EVAL_OUTPUT = ROOT_DIR / "optimization" / "temp-excellent-fit.json"
OPTUNA_DB = ROOT_DIR / "optimization" / "optuna_excellent_fit.db"

N_TRIALS = int(os.environ.get("N_TRIALS", "20"))
LIMIT = int(os.environ.get("LIMIT", "20"))
METRIC = os.environ.get("METRIC", "top3_pct")
TRIAL_TIMEOUT = int(os.environ.get("TRIAL_TIMEOUT", "1200"))  # 20 min per trial
STUDY_TIMEOUT = int(os.environ.get("STUDY_TIMEOUT", "0")) or None  # 0 = no study-level timeout
OPTUNA_RESUME = os.environ.get("OPTUNA_RESUME", "").strip().lower() in ("1", "true", "yes")

# Stage B rescoring params. Ranges biased toward stronger boosts and penalties for excellent top 3.
RESCORE_RANGES = {
    "high_signal_1": (1.5, 3.5),
    "high_signal_2": (3.0, 6.0),
    "pathway_1": (0.5, 2.0),
    "pathway_2": (1.0, 3.5),
    "pathway_3": (2.0, 5.0),
    "procedure_per_match": (0.2, 0.8),
    "anchor_per_match": (0.15, 0.4),
    "anchor_cap": (0.5, 1.0),
    "subspecialty_factor": (0.2, 0.6),
    "subspecialty_cap": (0.3, 0.8),
    "negative_1": (-2.0, -0.3),
    "negative_2": (-3.5, -1.0),
    "negative_4": (-5.0, -1.5),
    "safe_lane_1": (0.5, 1.5),
    "safe_lane_2": (1.0, 3.0),
    "safe_lane_3_or_more": (2.0, 4.5),
}


def run_evaluator(weights_path: Path) -> float:
    EVAL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "node",
        str(ROOT_DIR / "evaluation" / "evaluate-excellent-fit-llm.js"),
        "--use-cache",
        f"--weights={weights_path}",
        f"--limit={LIMIT}",
        f"--output={EVAL_OUTPUT}",
        f"--metric={METRIC}",
    ]
    env = os.environ.copy()
    env["WORKERS"] = os.environ.get("WORKERS", "2")
    try:
        result = subprocess.run(
            cmd,
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            timeout=TRIAL_TIMEOUT,
        )
    except subprocess.TimeoutExpired as e:
        print(f"\n[Trial timeout after {TRIAL_TIMEOUT}s; try TRIAL_TIMEOUT=1800 or lower LIMIT]", file=sys.stderr)
        raise optuna.TrialPruned from e
    if result.returncode != 0:
        error_output = result.stderr or result.stdout
        # Check for quota/rate limit errors - prune instead of crashing
        if "insufficient_quota" in error_output or "429" in error_output or "RateLimitError" in error_output:
            print(f"\n[API quota/rate limit exceeded; pruning trial. Check OpenAI billing/quota.]", file=sys.stderr)
            raise optuna.TrialPruned("API quota exceeded")
        raise RuntimeError(
            f"evaluate-excellent-fit-llm.js failed: {error_output}"
        )
    lines = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]
    if not lines:
        raise RuntimeError("evaluate-excellent-fit-llm.js produced no stdout")
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
    if not (ROOT_DIR / "benchmarks" / "benchmark-session-context-cache-v2.json").exists():
        print("benchmark-session-context-cache-v2.json not found", file=sys.stderr)
        sys.exit(1)
    if not (ROOT_DIR / "evaluation" / "evaluate-excellent-fit-llm.js").exists():
        print("evaluate-excellent-fit-llm.js not found", file=sys.stderr)
        sys.exit(1)

    print(
        f"Objective: maximize {METRIC} (limit={LIMIT} cases, n_trials={N_TRIALS}, trial_timeout={TRIAL_TIMEOUT}s)"
    )
    if STUDY_TIMEOUT:
        print(f"Study will stop after {STUDY_TIMEOUT}s (best so far kept)")
    storage = None
    if OPTUNA_RESUME:
        OPTUNA_DB.parent.mkdir(parents=True, exist_ok=True)
        storage = "sqlite:///" + str(OPTUNA_DB.resolve()).replace("\\", "/")
        print(f"Resume enabled: storage={storage}")
    create_kw = {"direction": "maximize", "study_name": "excellent_fit_top3"}
    if storage:
        create_kw["storage"] = storage
        create_kw["load_if_exists"] = True
    study = optuna.create_study(**create_kw)
    optimize_kw = {"n_trials": N_TRIALS, "n_jobs": 1, "show_progress_bar": True}
    if STUDY_TIMEOUT:
        optimize_kw["timeout"] = STUDY_TIMEOUT
    study.optimize(objective, **optimize_kw)

    if study.best_trial is None:
        print("No completed trials (all timed out or failed). Increase TRIAL_TIMEOUT or lower LIMIT.", file=sys.stderr)
        sys.exit(1)
    with open(BASE_WEIGHTS) as f:
        out = json.load(f)
    for key in RESCORE_RANGES:
        out[key] = study.best_params[key]
    with open(BEST_OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Best {METRIC} (train subset): {study.best_value:.2f}")
    print(f"Best weights written to {BEST_OUT_PATH}")
    print(
        "Re-run full evaluation: node evaluate-excellent-fit-llm.js --use-cache --weights",
        BEST_OUT_PATH.name,
    )


if __name__ == "__main__":
    main()
