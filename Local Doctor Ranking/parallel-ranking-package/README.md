# Parallel Ranking Algorithm Package

**Version**: 1.0.0  
**Date**: January 2026  
**Status**: Production-Ready

## What's Inside

This package contains everything developers need to understand, test, and productionalize the **Parallel Ranking Algorithm** - an advanced two-stage retrieval system with intent-aware query expansion.

### ✅ Core Components

- **Production-ready parallel ranking algorithm** (`algorithm/session-context-variants.js`)
- **Complete testing framework** with UI (`testing/`)
- **Benchmark test cases** with ground truth (`testing/data/`)
- **Evaluation metrics** (Precision@K, Recall@K, MRR, NDCG)
- **Step-by-step productionalization guide**
- **Comprehensive documentation**

### 🎯 Key Features

- **Parallel AI Processing**: 3 AI calls run simultaneously for speed
- **Two-Stage Retrieval**: BM25 retrieval + intent-based rescoring
- **Adaptive Negative Keywords**: Conditionally enabled based on query clarity
- **Intent Classification**: Dual classification (general + clinical intent)
- **Anchor Phrase Extraction**: Explicit conditions/procedures boosting
- **Error Handling**: Graceful fallbacks for each AI call

---

## Quick Start

### 1. Test the Algorithm (5 minutes)

```bash
cd testing
npm install
cp ../.env.example .env  # Add your OPENAI_API_KEY
npm start
```

Open `http://localhost:3001/test` in your browser and test queries!

### 2. Understand How It Works (15 minutes)

Read these in order:
1. [ARCHITECTURE.md](ARCHITECTURE.md) - High-level overview
2. [algorithm/README.md](algorithm/README.md) - Algorithm details
3. [docs/NEGATIVE_KEYWORDS.md](docs/NEGATIVE_KEYWORDS.md) - Negative keyword handling

### 3. Productionalize It (varies)

Follow the step-by-step guide: [PRODUCTIONALIZATION_GUIDE.md](PRODUCTIONALIZATION_GUIDE.md)

---

## Package Structure

```
parallel-ranking-package/
├── README.md                          # You are here
├── QUICKSTART.md                      # 5-minute setup guide
├── ARCHITECTURE.md                    # Technical architecture
├── PRODUCTIONALIZATION_GUIDE.md       # Step-by-step production guide
│
├── algorithm/                         # Core ranking algorithm
│   ├── session-context-variants.js   # Main algorithm implementation
│   └── README.md                      # Algorithm documentation
│
├── testing/                           # Testing framework
│   ├── README.md                      # Testing guide
│   ├── server.js                      # Test server
│   ├── ui/index.html                  # Test UI
│   ├── services/                      # BM25 service
│   ├── utils/                         # Evaluation utilities
│   ├── data/                          # Benchmark test cases
│   └── package.json                   # Test dependencies
│
├── docs/                               # Detailed documentation
│   ├── ALGORITHM_EXPLANATION.md       # Deep dive into algorithm
│   ├── NEGATIVE_KEYWORDS.md           # Negative keyword handling ⭐
│   ├── TESTING_METRICS.md             # Evaluation metrics explained
│   ├── QUERY_FLOW.md                  # Query processing flow
│   └── TWO_STAGE_RETRIEVAL.md         # Two-stage retrieval explained
│
└── examples/                           # Code examples
    ├── basic-usage.js                  # Basic integration
    ├── production-integration.js       # Production integration
    └── testing-example.js              # Testing example
```

---

## Documentation Index

### Getting Started
- [QUICKSTART.md](QUICKSTART.md) - Get running in 5 minutes
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture overview

### Algorithm Documentation
- [algorithm/README.md](algorithm/README.md) - Algorithm overview and API
- [docs/ALGORITHM_EXPLANATION.md](docs/ALGORITHM_EXPLANATION.md) - Deep dive into how it works
- [docs/NEGATIVE_KEYWORDS.md](docs/NEGATIVE_KEYWORDS.md) - **Negative keyword handling** ⭐
- [docs/QUERY_FLOW.md](docs/QUERY_FLOW.md) - Query processing flow
- [docs/TWO_STAGE_RETRIEVAL.md](docs/TWO_STAGE_RETRIEVAL.md) - Two-stage retrieval explained

### Testing
- [testing/README.md](testing/README.md) - Testing framework guide
- [docs/TESTING_METRICS.md](docs/TESTING_METRICS.md) - Evaluation metrics explained

### Productionalization
- [PRODUCTIONALIZATION_GUIDE.md](PRODUCTIONALIZATION_GUIDE.md) - Step-by-step production guide
- [examples/production-integration.js](examples/production-integration.js) - Integration example

---

## Key Concepts

### Two-Stage Retrieval

1. **Stage A: BM25 Retrieval**
   - Uses clean patient query (`q_patient`) only
   - Retrieves top 50 candidates
   - No query expansion at this stage

2. **Stage B: Intent-Based Rescoring**
   - Uses expansion terms (`intent_terms`) for boosting
   - Uses anchor phrases for explicit condition boosting
   - Uses negative terms for wrong subspecialty penalties (when enabled)
   - Adapts ranking strategy based on query clarity

### Adaptive Negative Keywords

Negative keywords are **conditionally enabled** based on query clarity:

- **Clear Query** (high confidence + named procedure/diagnosis):
  - Negative terms enabled → Penalizes wrong subspecialties
  - Example: "I need SVT ablation" → Penalizes coronary specialists

- **Ambiguous Query** (low confidence or symptom-only):
  - Negative terms disabled → No penalties applied
  - Example: "I have chest pain" → No penalties (query is unclear)

See [docs/NEGATIVE_KEYWORDS.md](docs/NEGATIVE_KEYWORDS.md) for detailed explanation.

### Parallel Processing

Three AI calls run simultaneously:
1. **Insights Extraction** - Summarizes conversation
2. **General Intent Classification** - Goal/specificity (specialty-agnostic)
3. **Clinical Intent Classification** - Subspecialty routing (specialty-specific)

This reduces latency compared to sequential processing.

---

## Prerequisites

- Node.js 14+ 
- OpenAI API key (for algorithm)
- Express (for testing framework)

---

## Next Steps

1. **Quick Test**: Run the testing framework → [QUICKSTART.md](QUICKSTART.md)
2. **Understand**: Read architecture → [ARCHITECTURE.md](ARCHITECTURE.md)
3. **Learn Algorithm**: Read algorithm docs → [algorithm/README.md](algorithm/README.md)
4. **Productionalize**: Follow guide → [PRODUCTIONALIZATION_GUIDE.md](PRODUCTIONALIZATION_GUIDE.md)

---

## Support

For questions or issues:
1. Check documentation in `docs/` folder
2. Review examples in `examples/` folder
3. Check testing framework for usage patterns

---

## License

[Your license here]

---

**Ready to get started?** → [QUICKSTART.md](QUICKSTART.md)
