# WhatsApp Triage - Doctor Ranking Algorithm Optimization

This repository contains the optimization and evaluation framework for a doctor ranking algorithm used in a WhatsApp-based medical triage system. The project focuses on improving search and ranking accuracy for matching patients with appropriate medical specialists.

## 📋 Project Overview

This project includes:
- **Benchmark Question Banks**: Medical specialty-specific query datasets for evaluation
- **Ranking Algorithm Package**: Production-ready parallel ranking algorithm with two-stage BM25 retrieval
- **Optimization Scripts**: Optuna-based hyperparameter optimization tools
- **Evaluation Framework**: Comprehensive testing and benchmarking tools

## 🗂️ Repository Structure

```
.
├── benchmarks/                             # Benchmark question bank CSV files
│   ├── Benchmark question bank - cardiology.csv
│   ├── Benchmark question bank - General Surgery.csv
│   ├── Benchmark question bank - Obs & Gynae.csv
│   ├── Benchmark question bank - ophthalmology.csv
│   └── Benchmark question bank - Trauma & Orthopaedic Surgery patient queries.csv
├── data/                                   # Data files and datasets
│   ├── bda_dietitians_rows.csv
│   └── test_sw5.json
├── Local Doctor Ranking/                    # Main ranking system
│   ├── README.md                           # Server setup and API documentation
│   ├── README_RANKING.md                   # Ranking algorithm guide
│   ├── server.js                           # Main server file
│   ├── apply-ranking.js                    # Ranking application script
│   ├── evaluation/                         # Evaluation scripts and results
│   │   ├── run-baseline-evaluation.js      # Main evaluation runner
│   │   ├── evaluate-*.js                  # Evaluation scripts
│   │   ├── analyze-*.js                   # Analysis scripts
│   │   ├── compare-*.js                   # Comparison scripts
│   │   └── *.json, *.csv                  # Evaluation results and reports
│   ├── benchmarks/                         # Benchmark test cases and results
│   │   ├── benchmark-test-cases-*.json    # Test case definitions
│   │   └── benchmark-baseline-*.json      # Evaluation results
│   ├── data/                               # Doctor data files
│   │   ├── merged_*.json                  # Merged doctor datasets
│   │   ├── integrated_*.json              # Integrated datasets
│   │   └── *from-data.json                # Extracted lexicons and data
│   ├── scripts/                            # Utility and build scripts
│   │   ├── build-*.js                     # Build and cache scripts
│   │   ├── debug-*.js                     # Debugging scripts
│   │   └── create-*.js                    # Data creation scripts
│   ├── optimization/                       # Hyperparameter optimization
│   │   ├── optimize_bm25_params.py        # BM25 parameter tuning
│   │   ├── optimize_field_weights.py      # Field weight optimization
│   │   ├── optimize_ranking.py            # General ranking optimization
│   │   ├── best-*.json                    # Optimized parameter sets
│   │   ├── ranking-weights-*.json         # Weight configurations
│   │   └── requirements.txt                # Python dependencies
│   ├── parallel-ranking-package/          # Core ranking algorithm package
│   │   ├── README.md                       # Algorithm overview and quickstart
│   │   ├── algorithm/                      # Core ranking algorithm code
│   │   ├── testing/                        # Testing framework and UI
│   │   └── docs/                           # Detailed documentation
│   └── ranking-v2-package/                # Alternative ranking package
└── README.md                               # This file
```

## 🚀 Quick Start

### For Ranking Algorithm Development

See the main ranking package documentation:
- **[Local Doctor Ranking/README.md](Local%20Doctor%20Ranking/README.md)** - Server setup and API usage
- **[Local Doctor Ranking/parallel-ranking-package/README.md](Local%20Doctor%20Ranking/parallel-ranking-package/README.md)** - Algorithm package overview

### For Evaluation

Run evaluation scripts:
```bash
cd "Local Doctor Ranking/evaluation"
node run-baseline-evaluation.js
```

### For Optimization

1. Install Python dependencies:
```bash
cd "Local Doctor Ranking/optimization"
pip install -r requirements.txt
```

2. Run optimization scripts:
```bash
python optimize_bm25_params.py
python optimize_field_weights.py
```

Optimized parameters are saved in `Local Doctor Ranking/optimization/` as JSON files.

## 📊 Benchmark Question Banks

The repository includes benchmark question banks for evaluating ranking performance across different medical specialties. These are located in the `benchmarks/` directory:

- **Cardiology** (`benchmarks/Benchmark question bank - cardiology.csv`)
- **General Surgery** (`benchmarks/Benchmark question bank - General Surgery.csv`)
- **Ophthalmology** (`benchmarks/Benchmark question bank - ophthalmology.csv`)
- **Obs & Gynae** (`benchmarks/Benchmark question bank - Obs & Gynae.csv`)
- **Trauma & Orthopaedic Surgery** (`benchmarks/Benchmark question bank - Trauma & Orthopaedic Surgery patient queries.csv`)

These CSV files contain patient queries and expected results for algorithm evaluation. Evaluation scripts are located in `Local Doctor Ranking/evaluation/` and benchmark results are stored in `Local Doctor Ranking/benchmarks/`.

## 🔧 Key Features

### Ranking Algorithm
- **Parallel AI Processing**: 3 simultaneous AI calls for faster query processing
- **Two-Stage Retrieval**: BM25 retrieval + intent-based rescoring
- **Specialty Filtering**: Automatic filtering by inferred subspecialties (5-10x faster)
- **Intent Classification**: Dual classification (general + clinical intent)
- **Adaptive Negative Keywords**: Conditionally enabled based on query clarity

### Optimization Tools
- **BM25 Parameter Tuning**: Optimize k1, b, and field weights
- **Field Weight Optimization**: Fine-tune importance of different doctor data fields
- **Stage 2 Rescoring Optimization**: Optimize rescoring parameters
- **Optuna Integration**: Automated hyperparameter search with pruning

## 📈 Evaluation Metrics

The evaluation framework supports:
- **Precision@K**: Accuracy of top K results
- **Recall@K**: Coverage of relevant results in top K
- **MRR (Mean Reciprocal Rank)**: Average position of first relevant result
- **NDCG (Normalized Discounted Cumulative Gain)**: Ranking quality metric

## 🔍 Documentation

- **[Local Doctor Ranking/README.md](Local%20Doctor%20Ranking/README.md)** - Server setup, API endpoints, and usage
- **[Local Doctor Ranking/README_RANKING.md](Local%20Doctor%20Ranking/README_RANKING.md)** - How to apply ranking to doctor data
- **[Local Doctor Ranking/parallel-ranking-package/README.md](Local%20Doctor%20Ranking/parallel-ranking-package/README.md)** - Algorithm package documentation
- **[Local Doctor Ranking/parallel-ranking-package/ARCHITECTURE.md](Local%20Doctor%20Ranking/parallel-ranking-package/ARCHITECTURE.md)** - Technical architecture

## 🛠️ Development

### Prerequisites
- Node.js (for ranking server)
- Python 3.x (for optimization scripts)
- OpenAI API key (for AI-powered query processing)

### Environment Setup

1. **For Ranking Server**:
```bash
cd "Local Doctor Ranking"
npm install
cd parallel-ranking-package
cp .env.example .env
# Add your OPENAI_API_KEY to .env
```

2. **For Optimization**:
```bash
cd "Local Doctor Ranking/optimization"
pip install -r requirements.txt
```

## 📝 License

ISC

## 🤝 Contributing

This repository is part of the Synaptic DocMap WhatsApp Triage project. For questions or contributions, please refer to the main project repository.

## 🔗 Related Resources

- Main project: [synaptic-docmap/whatsapp_triage](https://github.com/synaptic-docmap/whatsapp_triage)
- Algorithm package: `Local Doctor Ranking/parallel-ranking-package/`
- Optimization scripts: `Local Doctor Ranking/optimization/`
