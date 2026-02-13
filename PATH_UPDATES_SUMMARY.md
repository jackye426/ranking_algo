# Path Updates Summary

This document tracks which files had their paths updated after the project reorganization.

## ✅ Critical Files That Were Fixed

### 1. **run-baseline-evaluation.js** (MOST CRITICAL)
**Location:** `Local Doctor Ranking/evaluation/run-baseline-evaluation.js`
- ✅ `BENCHMARK_FILE`: Updated to `../benchmarks/benchmark-test-cases-all-specialties.json`
- ✅ `CACHE_FILE`: Updated to `../benchmarks/benchmark-session-context-cache-v2.json` (with variants)
- ✅ `BASELINE_OUTPUT`: Updated to save in `evaluation/` folder
- **Status:** ✅ FIXED - This is the main evaluation runner

### 2. **build-session-context-cache.js** (CRITICAL)
**Location:** `Local Doctor Ranking/scripts/build-session-context-cache.js`
- ✅ `BENCHMARK_FILE`: Updated to `../benchmarks/benchmark-test-cases-all-specialties.json`
- ✅ `CACHE_FILE`: Updated to save in `../benchmarks/` folder (with model-specific variants)
- **Status:** ✅ FIXED - This builds the cache files used by evaluation scripts

### 3. **check-stage-a-recall.js** (CRITICAL)
**Location:** `Local Doctor Ranking/evaluation/check-stage-a-recall.js`
- ✅ `BENCHMARK_FILE`: Updated to `../benchmarks/benchmark-test-cases-all-specialties.json`
- ✅ `CACHE_FILE`: Updated to `../benchmarks/benchmark-session-context-cache-v2.json`
- **Status:** ✅ FIXED

---

## ⚠️ Files That Still Need Path Updates

### Evaluation Scripts (Need Benchmark Path Updates)

#### 1. **analyze-negative-penalty-retrieval.js**
**Location:** `Local Doctor Ranking/evaluation/analyze-negative-penalty-retrieval.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- ❌ `CACHE_FILE`: Still `'benchmark-session-context-cache-v2.json'` (needs `../benchmarks/`)
- **Impact:** MEDIUM - Used for analysis

#### 2. **evaluate-stage-a-recall.js**
**Location:** `Local Doctor Ranking/evaluation/evaluate-stage-a-recall.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- ❌ `CACHE_FILE`: Still `'benchmark-session-context-cache-v2.json'` (needs `../benchmarks/`)
- ❌ `SPLIT_FILE`: Still `'benchmark-split.json'` (needs `../benchmarks/`)
- **Impact:** HIGH - Used for recall evaluation

#### 3. **verify-benchmark-picks-llm.js**
**Location:** `Local Doctor Ranking/evaluation/verify-benchmark-picks-llm.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- **Impact:** MEDIUM - Used for verification

#### 4. **evaluate-ranking-subset.js**
**Location:** `Local Doctor Ranking/evaluation/evaluate-ranking-subset.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- ❌ `CACHE_FILE`: Still `'benchmark-session-context-cache.json'` (needs `../benchmarks/`)
- ❌ `SPLIT_FILE`: Still `'benchmark-split.json'` (needs `../benchmarks/`)
- **Impact:** HIGH - Used for subset evaluation

#### 5. **compare-reasons-to-session-context.js**
**Location:** `Local Doctor Ranking/evaluation/compare-reasons-to-session-context.js`
- ❌ `CACHE_FILE`: Still `'benchmark-session-context-cache.json'` (needs `../benchmarks/`)
- ❌ `REASONS_FILE`: Still `'benchmark-ground-truth-reasons.json'` (needs `../benchmarks/`)
- ❌ `REPORT_FILE`: Still `'benchmark-reasoning-comparison-report.json'` (should stay in `evaluation/`)
- **Impact:** MEDIUM - Used for comparison

#### 6. **analyze-missed-retrieval.js**
**Location:** `Local Doctor Ranking/evaluation/analyze-missed-retrieval.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- ❌ `CACHE_FILE`: Still `'benchmark-session-context-cache-v2.json'` (needs `../benchmarks/`)
- **Impact:** MEDIUM - Used for analysis

#### 7. **evaluate-excellent-fit-llm.js**
**Location:** `Local Doctor Ranking/evaluation/evaluate-excellent-fit-llm.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- ❌ `CACHE_FILE`: Still `'benchmark-session-context-cache-v2.json'` (needs `../benchmarks/`)
- **Impact:** HIGH - Used for excellent fit evaluation

#### 8. **analyze-contact-coverage.js**
**Location:** `Local Doctor Ranking/evaluation/analyze-contact-coverage.js`
- ❌ `DATA_FILE`: Still `'merged_all_sources_latest.json'` (needs `../data/`)
- **Impact:** LOW - Uses data file, not benchmark

### Scripts Folder (Need Benchmark Path Updates)

#### 9. **create-benchmark-split.js**
**Location:** `Local Doctor Ranking/scripts/create-benchmark-split.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- ❌ `SPLIT_FILE`: Should save to `../benchmarks/benchmark-split.json`
- **Impact:** MEDIUM - Creates split file

#### 10. **build-benchmark-ground-truth-reasons.js**
**Location:** `Local Doctor Ranking/scripts/build-benchmark-ground-truth-reasons.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- ❌ `REASONS_OUTPUT`: Should save to `../benchmarks/benchmark-ground-truth-reasons.json`
- **Impact:** MEDIUM - Builds ground truth

#### 11. **benchmark-pick-source-stats.js**
**Location:** `Local Doctor Ranking/scripts/benchmark-pick-source-stats.js`
- ❌ `BENCHMARK_FILE`: Still `'benchmark-test-cases-all-specialties.json'` (needs `../benchmarks/`)
- ❌ `CACHE_FILE`: Still `'benchmark-session-context-cache.json'` (needs `../benchmarks/`)
- ❌ `OUTPUT_FILE`: Should save to `../benchmarks/benchmark-pick-source-stats.json`
- **Impact:** LOW - Statistics script

#### 12. **load-question-bank.js**
**Location:** `Local Doctor Ranking/scripts/load-question-bank.js`
- ❌ Output: Still saves to `benchmark-questions-loaded.json` (should save to `../benchmarks/`)
- **Impact:** LOW

#### 13. **generate-benchmark-ground-truth.js**
**Location:** `Local Doctor Ranking/scripts/generate-benchmark-ground-truth.js`
- ❌ Output: Still saves to current directory (should save to `../benchmarks/`)
- **Impact:** MEDIUM - Generates benchmark test cases

### Data File References

#### 14. **merge-dietitians.js**
**Location:** `Local Doctor Ranking/scripts/merge-dietitians.js`
- ❌ `DIETITIANS_FILE`: May need update if referencing root `data/` folder
- ❌ `EXISTING_MERGED_FILE`: May need update if referencing `data/` folder
- **Impact:** MEDIUM - Merges dietitian data

---

## 📋 Summary

### Fixed (3 files):
1. ✅ `run-baseline-evaluation.js` - **MOST CRITICAL**
2. ✅ `build-session-context-cache.js` - **CRITICAL**
3. ✅ `check-stage-a-recall.js` - **CRITICAL**

### Need Updates (14 files):
- **High Priority:** `evaluate-stage-a-recall.js`, `evaluate-ranking-subset.js`, `evaluate-excellent-fit-llm.js`
- **Medium Priority:** `analyze-negative-penalty-retrieval.js`, `verify-benchmark-picks-llm.js`, `compare-reasons-to-session-context.js`, `analyze-missed-retrieval.js`, `create-benchmark-split.js`, `build-benchmark-ground-truth-reasons.js`, `generate-benchmark-ground-truth.js`, `merge-dietitians.js`
- **Low Priority:** `analyze-contact-coverage.js`, `benchmark-pick-source-stats.js`, `load-question-bank.js`

---

## 🔧 Pattern for Updates

For files in `evaluation/` folder:
- `BENCHMARK_FILE`: Change from `'benchmark-test-cases-all-specialties.json'` to `path.join(__dirname, '../benchmarks/benchmark-test-cases-all-specialties.json')`
- `CACHE_FILE`: Change from `'benchmark-session-context-cache-v2.json'` to `path.join(__dirname, '../benchmarks/benchmark-session-context-cache-v2.json')`
- Output files: Keep in `evaluation/` folder (use `path.join(__dirname, 'filename.json')`)

For files in `scripts/` folder:
- `BENCHMARK_FILE`: Change to `path.join(__dirname, '../benchmarks/benchmark-test-cases-all-specialties.json')`
- Output files that are benchmarks: Save to `../benchmarks/`
- Output files that are results: Can stay in `scripts/` or move to appropriate folder

For data file references:
- Files in `data/` folder: Use `path.join(__dirname, '../data/filename.json')`
