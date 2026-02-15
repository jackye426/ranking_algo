# Repository Cleanup Plan

## Current State
- **Total files**: 5,278
- **Markdown docs**: 320
- **JavaScript files**: 878

## Goal
Keep only what's needed for production:
1. Frontend UI
2. V6 ranking algorithm (best algorithm)
3. Essential dependencies
4. Server code
5. Final optimized weights
6. **Scraping pipeline** (data collection system)

---

## ✅ KEEP (Essential for Production)

### Core Application
- `server.js` - Main server
- `public/index.html` - Frontend UI
- `package.json` - Dependencies
- `.gitignore` - Git config

### Ranking Algorithms
- `ranking-v2-package/progressive-ranking-v6.js` - **V6 (best algorithm)**
- `ranking-v2-package/index.js` - V2 (V6 depends on it)
- `ranking-v2-package/evaluate-fit.js` - LLM evaluation (used by V6)
- `ranking-v2-package/example-v6.js` - V6 usage example

### Core Dependencies
- `parallel-ranking-package/algorithm/session-context-variants.js` - Session context extraction
- `parallel-ranking-package/testing/services/local-bm25-service.js` - BM25 service (V6 uses it)
- `specialty-filter.js` - Specialty filtering
- `location-filter.js` - Location filtering
- `apply-ranking.js` - Data loading/transformation

### Data & Config
- `data/` - Doctor data files (keep latest merged files)
- `optimization/best-*.json` - **Final optimized weights** (keep only best ones)
  - `best-stage-a-recall-weights-desc-tuned.json` (used by V6)
  - Keep 2-3 best weight files max

### Scraping Pipeline (Found in `main` branch)
- **Location**: `pipeline/` folder (in `main` branch)
- **Main script**: `pipeline/run_all.py` - Orchestrates scraping pipeline
- **Hospital + insurance folder**: Contains BUPA scraping scripts and data
- **Scraping scripts** - Data collection from BUPA, Cromwell, HCA, Spire, Reddit
- **Data integration scripts** - Scripts that merge/integrate scraped data
- **Data transformation scripts** - Scripts that transform scraped data to practitioner format
- **Keep**: Production-ready scraping code, main pipeline script
- **Remove**: Archive folders, old scrapers, analysis scripts, temp scripts, excessive documentation

### Documentation (Minimal)
- `README.md` - Main project README
- `Local Doctor Ranking/README.md` - Server setup guide
- `Local Doctor Ranking/README_RANKING.md` - Ranking guide
- `V6_IMPLEMENTATION_COMPLETE.md` - V6 documentation (if helpful)

---

## ❌ REMOVE (Development/Testing Clutter)

### Optimization Scripts
- `optimization/*.py` - All Python optimization scripts (already found best weights)
- `optimization/optuna_*.db` - Optuna database files
- `optimization/temp-*.json` - Temporary files
- Keep only: `optimization/best-*.json` (final weights)

### Evaluation Scripts
- `evaluation/*.js` - All evaluation/benchmarking scripts
- `evaluation/*.json` - Evaluation result files
- `evaluation/*.csv` - Evaluation reports

### Benchmark Results
- `benchmarks/benchmark-baseline-*.json` - Old benchmark results
- `benchmarks/benchmark-session-context-cache-*.json` - Cache files (can regenerate)
- Keep only: `benchmarks/benchmark-test-cases-all-specialties.json` (if needed for testing)

### Utility Scripts
- `scripts/*.js` - All utility/build scripts
- `scripts/*.json` - Script output files

### Old Ranking Versions (if not used)
- Check if V5 is actually used in production
- If frontend defaults to V5, keep V5 code
- If only V6 is used, can remove V5

### Documentation Clutter
- Remove 90% of markdown files
- Keep only essential docs (README files, V6 docs)
- Remove all planning/analysis docs

### Testing Framework
- `parallel-ranking-package/testing/` - Full testing framework
- Keep only: `testing/services/local-bm25-service.js` (move to core)
- Remove: `testing/server.js`, `testing/ui/`, `testing/utils/`, `testing/data/`

---

## 📋 Cleanup Steps

### Step 1: Identify What's Actually Used
1. Check frontend default variant (currently V5)
2. Check if V5 is needed or can remove
3. Verify V6 dependencies

### Step 2: Create Clean Structure
```
Local Doctor Ranking/
├── server.js
├── package.json
├── public/
│   └── index.html
├── ranking-v2-package/
│   ├── progressive-ranking-v6.js
│   ├── index.js (V2)
│   └── evaluate-fit.js
├── parallel-ranking-package/
│   └── algorithm/
│       └── session-context-variants.js
├── services/
│   └── local-bm25-service.js (moved from testing)
├── filters/
│   ├── specialty-filter.js
│   └── location-filter.js
├── data/
│   └── (latest merged files only)
├── config/
│   └── best-stage-a-recall-weights-desc-tuned.json
└── README.md
```

### Step 3: Remove Clutter
- Delete `optimization/` folder (except best weights)
- Delete `evaluation/` folder
- Delete `scripts/` folder
- Delete `benchmarks/` folder (except test cases if needed)
- Delete most markdown files
- Delete testing framework

### Step 4: Update Imports
- Update all require paths after cleanup
- Test server startup
- Test V6 ranking

---

## ⚠️ Considerations

### Dependencies to Keep
- V6 depends on V2 (`rankPractitioners`)
- V6 depends on `local-bm25-service.js`
- Server uses multiple variants (V2, V5, V6)
- Frontend shows all variants
- Scraping pipeline orchestrates multiple sources (Cromwell, HCA, Circle, Spire, BUPA)

### What to Keep
- **V6**: Best algorithm ✅
- **V2**: Required by V6 ✅
- **V5**: Check if frontend uses it (default is V5)
- **Production BM25**: Check if used
- **Scraping Pipeline**: Production-ready scrapers only ✅
  - Keep: `pipeline/run_all.py`, main scraper scripts, configs, requirements.txt
  - Remove: `archive/`, `old_scrapers/`, `temp_scripts/`, excessive documentation

### Recommendation
1. **If only V6 is needed**: Remove V5, keep V2 (dependency)
2. **If frontend uses V5**: Keep V5, but consider making V6 default
3. **Keep V2**: Always needed (V6 dependency)
4. **Scraping Pipeline**: Merge from `main` branch, clean up archive/temp files

---

## 🎯 Final Clean Structure

```
.
├── README.md                    # Main project README
├── benchmarks/                  # Benchmark question banks (if needed)
│   └── (CSV files)
├── pipeline/                     # Scraping pipeline orchestrator (from main branch)
│   ├── run_all.py               # Main pipeline orchestrator (Cromwell, HCA, Circle, Spire, BUPA)
│   └── __init__.py              # Package init
├── Hospital + insurance/         # Scraping scripts for each source (from main branch)
│   ├── BUPA Gynaecologist London Scraping - success/
│   │   ├── run_full_scrape.py   # Main BUPA scraper
│   │   ├── run_smart_scrape.py  # Smart scraping variant
│   │   ├── scrapers/             # Scraper modules (KEEP)
│   │   ├── config.py            # Configuration (KEEP)
│   │   ├── requirements.txt     # Dependencies (KEEP)
│   │   ├── README.md            # Documentation (KEEP)
│   │   └── (REMOVE: archive/, old_scrapers/, temp_scripts/, excessive docs)
│   ├── Cromwell/
│   │   ├── run_full_scrape_workflow.py  # Main Cromwell scraper
│   │   ├── scrape_cromwell_consultants.py
│   │   ├── cromwell_profile_parser.py
│   │   ├── fetch_html_profiles.py
│   │   └── requirements.txt
│   ├── HCA - Gynaecologists/    # HCA scraping scripts
│   ├── Circle Health Group/      # Circle scraping scripts
│   ├── Spire Healthcare/         # Spire scraping scripts
│   └── Practitioner data reconcillation/  # Data reconciliation scripts
├── Local Doctor Ranking/         # Ranking system
│   ├── server.js                # Main server
│   ├── package.json             # Dependencies
│   ├── .env.example            # Environment template
│   ├── public/
│   │   └── index.html          # Frontend UI
│   ├── ranking-v2-package/     # Ranking algorithms
│   │   ├── progressive-ranking-v6.js
│   │   ├── index.js            # V2 (V6 dependency)
│   │   └── evaluate-fit.js
│   ├── parallel-ranking-package/ # Core algorithm
│   │   └── algorithm/
│   │       └── session-context-variants.js
│   ├── services/                # BM25 service
│   │   └── local-bm25-service.js
│   ├── filters/                 # Filtering
│   │   ├── specialty-filter.js
│   │   └── location-filter.js
│   ├── data/                    # Doctor data
│   │   └── (latest files only)
│   ├── config/                  # Optimized weights
│   │   └── best-stage-a-recall-weights-desc-tuned.json
│   ├── apply-ranking.js        # Data loader
│   └── README.md                # Server documentation
```

**Estimated file count after cleanup: ~200-300 files** (down from 5,278+)

**Note**: 
- Scraping pipeline is in `main` branch - needs to be merged into `master`
- After merging, remove archive/, old_scrapers/, temp_scripts/ folders
- Keep only production-ready scraping code
