# Optuna Optimization Results Analysis

**Study:** excellent_fit_top3
**Total Trials:** 42
**Completed Trials:** 39

## Summary

- **Best Value:** 95.00%
- **Best Trial:** #16
- **Baseline Value:** 65.00%
- **Improvement:** +30.00 percentage points

## Value Distribution

- **Min:** 80.00%
- **Max:** 95.00%
- **Mean:** 88.97%
- **Median:** 90.00%
- **Std Dev:** 4.00%
- **Q25:** 85.00%
- **Q75:** 90.00%

## Top 10 Trials

| Rank | Trial # | Value | Key Parameters |
|------|---------|-------|----------------|
| 1 | 16 | 95.00% | proc=0.22, sub=0.26, anchor=0.21 |
| 2 | 28 | 95.00% | proc=0.36, sub=0.29, anchor=0.22 |
| 3 | 32 | 95.00% | proc=0.53, sub=0.33, anchor=0.22 |
| 4 | 36 | 95.00% | proc=0.50, sub=0.29, anchor=0.20 |
| 5 | 38 | 95.00% | proc=0.48, sub=0.30, anchor=0.17 |
| 6 | 39 | 95.00% | proc=0.50, sub=0.30, anchor=0.17 |
| 7 | 0 | 90.00% | proc=0.29, sub=0.32, anchor=0.29 |
| 8 | 2 | 90.00% | proc=0.38, sub=0.37, anchor=0.32 |
| 9 | 5 | 90.00% | proc=0.74, sub=0.28, anchor=0.15 |
| 10 | 6 | 90.00% | proc=0.29, sub=0.40, anchor=0.31 |

## Parameter Analysis: Top 10 vs Bottom 10

| Parameter | Top 10 Avg | Bottom 10 Avg | Difference |
|-----------|------------|---------------|------------|
| safe_lane_2 | 2.325 | 1.541 | +0.784 |
| negative_2 | -1.880 | -2.543 | +0.663 |
| pathway_2 | 1.792 | 2.450 | -0.658 |
| negative_4 | -4.079 | -3.439 | -0.640 |
| pathway_3 | 4.049 | 3.475 | +0.574 |
| safe_lane_3_or_more | 2.613 | 3.066 | -0.453 |
| high_signal_2 | 4.734 | 4.291 | +0.442 |
| negative_1 | -0.613 | -0.880 | +0.267 |
| subspecialty_cap | 0.590 | 0.534 | +0.056 |
| anchor_cap | 0.768 | 0.816 | -0.048 |
| safe_lane_1 | 0.870 | 0.913 | -0.043 |
| anchor_per_match | 0.225 | 0.263 | -0.038 |
| pathway_1 | 1.117 | 1.084 | +0.033 |
| subspecialty_factor | 0.314 | 0.338 | -0.024 |
| procedure_per_match | 0.429 | 0.414 | +0.014 |
| high_signal_1 | 2.544 | 2.541 | +0.003 |

## Top 10 Average Parameters

- **high_signal_1:** 2.544 (median: 2.950)
- **high_signal_2:** 4.734 (median: 4.651)
- **pathway_1:** 1.117 (median: 1.023)
- **pathway_2:** 1.792 (median: 1.466)
- **pathway_3:** 4.049 (median: 4.154)
- **procedure_per_match:** 0.429 (median: 0.432)
- **anchor_per_match:** 0.225 (median: 0.213)
- **anchor_cap:** 0.768 (median: 0.799)
- **subspecialty_factor:** 0.314 (median: 0.300)
- **subspecialty_cap:** 0.590 (median: 0.642)
- **negative_1:** -0.613 (median: -0.444)
- **negative_2:** -1.880 (median: -1.467)
- **negative_4:** -4.079 (median: -4.362)
- **safe_lane_1:** 0.870 (median: 0.904)
- **safe_lane_2:** 2.325 (median: 2.105)
- **safe_lane_3_or_more:** 2.613 (median: 2.374)

## Best Trial Parameters

```json
{
  "high_signal_1": 2.9454245561934416,
  "high_signal_2": 5.060979491112806,
  "pathway_1": 0.5029123385883909,
  "pathway_2": 2.865491748574347,
  "pathway_3": 4.98319752157688,
  "procedure_per_match": 0.22226549296567283,
  "anchor_per_match": 0.20700001956289057,
  "anchor_cap": 0.7820790632084728,
  "subspecialty_factor": 0.25762967357681166,
  "subspecialty_cap": 0.587541010448758,
  "negative_1": -0.6562811728067333,
  "negative_2": -3.4413801873453025,
  "negative_4": -3.933425188975287,
  "safe_lane_1": 0.7564831770141927,
  "safe_lane_2": 2.993198499306386,
  "safe_lane_3_or_more": 2.0938755091398296
}
```
