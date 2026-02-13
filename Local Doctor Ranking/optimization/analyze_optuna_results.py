"""Analyze Optuna study results for excellent-fit optimization."""
import optuna
import json
from pathlib import Path
from collections import defaultdict
from statistics import mean, median, stdev

ROOT_DIR = Path(__file__).resolve().parent.parent
OPTUNA_DB = ROOT_DIR / "optimization" / "optuna_excellent_fit.db"
BASELINE_FILE = ROOT_DIR / "excellent-fit-baseline.json"
OUTPUT_FILE = ROOT_DIR / "optimization" / "optuna_analysis.json"
REPORT_FILE = ROOT_DIR / "optimization" / "OPTUNA_RESULTS_ANALYSIS.md"

storage = "sqlite:///" + str(OPTUNA_DB.resolve()).replace("\\", "/")
study = optuna.load_study(study_name="excellent_fit_top3", storage=storage)

# Load baseline for comparison
baseline_value = None
if BASELINE_FILE.exists():
    try:
        with open(BASELINE_FILE, encoding='utf-8') as f:
            baseline_data = json.load(f)
            baseline_value = baseline_data.get("pct_cases_top3_all_excellent", None)
    except (UnicodeDecodeError, json.JSONDecodeError):
        # Try to extract just the metric we need
        import re
        with open(BASELINE_FILE, 'rb') as f:
            content = f.read().decode('utf-8', errors='ignore')
            match = re.search(r'"pct_cases_top3_all_excellent"\s*:\s*(\d+)', content)
            if match:
                baseline_value = float(match.group(1))
# Fallback: known baseline value
if baseline_value is None:
    baseline_value = 65.0  # From baseline file

# Extract trial data
trials_data = []
for trial in study.trials:
    if trial.state == optuna.trial.TrialState.COMPLETE:
        trial_dict = {
            "number": trial.number,
            "value": trial.value,
            "params": trial.params.copy(),
        }
        trials_data.append(trial_dict)

# Sort by value (descending)
trials_data.sort(key=lambda x: x["value"], reverse=True)

# Analysis
analysis = {
    "summary": {
        "total_trials": len(study.trials),
        "completed_trials": len(trials_data),
        "best_value": study.best_value if study.best_trial else None,
        "best_trial_number": study.best_trial.number if study.best_trial else None,
        "baseline_value": baseline_value,
        "improvement_over_baseline": (
            (study.best_value - baseline_value) if (study.best_value and baseline_value) else None
        ),
    },
    "top_10_trials": trials_data[:10],
    "parameter_statistics": {},
    "correlation_analysis": {},
}

# Parameter statistics
param_names = list(trials_data[0]["params"].keys()) if trials_data else []
for param in param_names:
    values = [t["params"][param] for t in trials_data]
    analysis["parameter_statistics"][param] = {
        "mean": float(mean(values)),
        "median": float(median(values)),
        "std": float(stdev(values)) if len(values) > 1 else 0.0,
        "min": float(min(values)),
        "max": float(max(values)),
    }

# Top 10 parameter averages
top_10_params = defaultdict(list)
for trial in trials_data[:10]:
    for param, value in trial["params"].items():
        top_10_params[param].append(value)

analysis["top_10_average_params"] = {
    param: {
        "mean": float(mean(values)),
        "median": float(median(values)),
    }
    for param, values in top_10_params.items()
}

# Correlation with performance (top 10 vs bottom 10)
if len(trials_data) >= 20:
    top_10_values = [t["params"] for t in trials_data[:10]]
    bottom_10_values = [t["params"] for t in trials_data[-10:]]
    
    for param in param_names:
        top_vals = [t[param] for t in top_10_values]
        bottom_vals = [t[param] for t in bottom_10_values]
        analysis["correlation_analysis"][param] = {
            "top_10_mean": float(mean(top_vals)),
            "bottom_10_mean": float(mean(bottom_vals)),
            "difference": float(mean(top_vals) - mean(bottom_vals)),
        }

# Value distribution
values = [t["value"] for t in trials_data]
sorted_values = sorted(values)
n = len(values)
analysis["value_distribution"] = {
    "min": float(min(values)),
    "max": float(max(values)),
    "mean": float(mean(values)),
    "median": float(median(values)),
    "std": float(stdev(values)) if n > 1 else 0.0,
    "q25": float(sorted_values[n // 4]) if n > 0 else None,
    "q75": float(sorted_values[3 * n // 4]) if n > 0 else None,
}

# Save JSON
with open(OUTPUT_FILE, "w") as f:
    json.dump(analysis, f, indent=2)

# Generate markdown report
with open(REPORT_FILE, "w") as f:
    f.write("# Optuna Optimization Results Analysis\n\n")
    f.write(f"**Study:** excellent_fit_top3\n")
    f.write(f"**Total Trials:** {analysis['summary']['total_trials']}\n")
    f.write(f"**Completed Trials:** {analysis['summary']['completed_trials']}\n\n")
    
    f.write("## Summary\n\n")
    f.write(f"- **Best Value:** {analysis['summary']['best_value']:.2f}%\n")
    f.write(f"- **Best Trial:** #{analysis['summary']['best_trial_number']}\n")
    if baseline_value:
        f.write(f"- **Baseline Value:** {baseline_value:.2f}%\n")
        if analysis['summary']['improvement_over_baseline']:
            improvement = analysis['summary']['improvement_over_baseline']
            f.write(f"- **Improvement:** {improvement:+.2f} percentage points\n")
    f.write("\n")
    
    f.write("## Value Distribution\n\n")
    dist = analysis['value_distribution']
    f.write(f"- **Min:** {dist['min']:.2f}%\n")
    f.write(f"- **Max:** {dist['max']:.2f}%\n")
    f.write(f"- **Mean:** {dist['mean']:.2f}%\n")
    f.write(f"- **Median:** {dist['median']:.2f}%\n")
    f.write(f"- **Std Dev:** {dist['std']:.2f}%\n")
    if dist['q25'] is not None:
        f.write(f"- **Q25:** {dist['q25']:.2f}%\n")
        f.write(f"- **Q75:** {dist['q75']:.2f}%\n")
    f.write("\n")
    
    f.write("## Top 10 Trials\n\n")
    f.write("| Rank | Trial # | Value | Key Parameters |\n")
    f.write("|------|---------|-------|----------------|\n")
    for i, trial in enumerate(analysis['top_10_trials'][:10], 1):
        params = trial['params']
        key_params = f"proc={params['procedure_per_match']:.2f}, sub={params['subspecialty_factor']:.2f}, anchor={params['anchor_per_match']:.2f}"
        f.write(f"| {i} | {trial['number']} | {trial['value']:.2f}% | {key_params} |\n")
    f.write("\n")
    
    if analysis.get('correlation_analysis'):
        f.write("## Parameter Analysis: Top 10 vs Bottom 10\n\n")
        f.write("| Parameter | Top 10 Avg | Bottom 10 Avg | Difference |\n")
        f.write("|-----------|------------|---------------|------------|\n")
        for param, data in sorted(analysis['correlation_analysis'].items(), 
                                  key=lambda x: abs(x[1]['difference']), reverse=True):
            f.write(f"| {param} | {data['top_10_mean']:.3f} | {data['bottom_10_mean']:.3f} | {data['difference']:+.3f} |\n")
        f.write("\n")
    
    f.write("## Top 10 Average Parameters\n\n")
    for param, data in analysis['top_10_average_params'].items():
        f.write(f"- **{param}:** {data['mean']:.3f} (median: {data['median']:.3f})\n")
    f.write("\n")
    
    f.write("## Best Trial Parameters\n\n")
    best_trial = next(t for t in trials_data if t['number'] == analysis['summary']['best_trial_number'])
    f.write("```json\n")
    f.write(json.dumps(best_trial['params'], indent=2))
    f.write("\n```\n")

print(f"Analysis complete!")
print(f"JSON saved to: {OUTPUT_FILE}")
print(f"Report saved to: {REPORT_FILE}")
print(f"\nBest value: {analysis['summary']['best_value']:.2f}%")
if baseline_value:
    print(f"Baseline: {baseline_value:.2f}%")
    if analysis['summary']['improvement_over_baseline']:
        print(f"Improvement: {analysis['summary']['improvement_over_baseline']:+.2f} pp")
