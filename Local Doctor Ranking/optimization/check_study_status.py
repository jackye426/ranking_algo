import optuna
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
OPTUNA_DB = ROOT_DIR / "optimization" / "optuna_excellent_fit.db"

storage = "sqlite:///" + str(OPTUNA_DB.resolve()).replace("\\", "/")
study = optuna.load_study(study_name="excellent_fit_top3", storage=storage)

total_trials = len(study.trials)
completed = [t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE]
pruned = [t for t in study.trials if t.state == optuna.trial.TrialState.PRUNED]
failed = [t for t in study.trials if t.state == optuna.trial.TrialState.FAIL]

print(f"Total trials in study: {total_trials}")
print(f"Completed: {len(completed)}")
print(f"Pruned: {len(pruned)}")
print(f"Failed: {len(failed)}")
print(f"\nBest value: {study.best_value if study.best_trial else 'N/A'}")
if study.best_trial:
    print(f"Best trial number: {study.best_trial.number}")

# Check what N_TRIALS was set to (we'll assume 20 based on previous runs)
N_TRIALS = 20
remaining = max(0, N_TRIALS - total_trials)
print(f"\nAssuming N_TRIALS={N_TRIALS}:")
print(f"Remaining trials to run: {remaining}")
