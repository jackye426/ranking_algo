"""Check sample sizes for Optuna trials."""
import json
import optuna
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
OPTUNA_DB = ROOT_DIR / "optimization" / "optuna_excellent_fit.db"
BENCHMARK_FILE = ROOT_DIR / "benchmark-ground-truth-reasons.json"

# Check benchmark size
try:
    with open(BENCHMARK_FILE, encoding='utf-8') as f:
        benchmark_data = json.load(f)
        total_cases = len(benchmark_data.get("testCases", []))
        print(f"Total benchmark cases available: {total_cases}")
except Exception as e:
    print(f"Could not read benchmark file: {e}")
    total_cases = None

# Check Optuna study
storage = "sqlite:///" + str(OPTUNA_DB.resolve()).replace("\\", "/")
study = optuna.load_study(study_name="excellent_fit_top3", storage=storage)

completed_trials = [t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE]
print(f"\nOptuna Study Statistics:")
print(f"- Total trials: {len(study.trials)}")
print(f"- Completed trials: {len(completed_trials)}")

# Default LIMIT is 20 (from optimize_excellent_fit_top3.py)
LIMIT_PER_TRIAL = 20
print(f"\nSample Size Per Trial:")
print(f"- Cases evaluated per trial: {LIMIT_PER_TRIAL} (default LIMIT)")
print(f"- Total cases evaluated: {len(completed_trials) * LIMIT_PER_TRIAL} cases")
print(f"- Unique test cases: {LIMIT_PER_TRIAL} (same subset used for all trials)")

if total_cases:
    percentage = (LIMIT_PER_TRIAL / total_cases) * 100
    print(f"\nCoverage:")
    print(f"- Using {percentage:.1f}% of total benchmark ({LIMIT_PER_TRIAL}/{total_cases})")
    print(f"- Each trial evaluates the same {LIMIT_PER_TRIAL} test cases")
