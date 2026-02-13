# Testing Framework Guide

## Overview

The testing framework provides a complete environment to test the parallel ranking algorithm with real queries, compare variants, and evaluate results against ground truth.

---

## Quick Start

```bash
cd testing
npm install
cp ../.env.example .env  # Add OPENAI_API_KEY
npm start
```

Open `http://localhost:3001/test` in your browser.

---

## Features

### 1. Interactive Test UI

- **Chat Interface**: Enter test queries and conversation history
- **Side-by-Side Comparison**: Compare three ranking variants simultaneously
- **Result Visualization**: View top 3 results with scores and practitioner details
- **Manual Evaluation**: Flag issues, add notes, mark booking proxies

### 2. Benchmark Test Cases

Pre-loaded test cases with ground truth:
- Load from dropdown menu
- Auto-run evaluation
- View metrics (Precision@K, Recall@K, MRR, NDCG)

### 3. Batch Evaluation

Run all benchmark tests at once:
- Click "Run All Benchmark Tests"
- View summary statistics
- Compare variants across all test cases

### 4. Export Results

Export test results:
- **JSON**: Full results with metadata
- **CSV**: Tabular format for analysis

---

## Using the Test UI

### Step 1: Enter Query

Type your query in the chat interface:
- Example: "I need SVT ablation"
- Add follow-up messages as needed

### Step 2: Run Variants

Click "Run All Variants" button.

### Step 3: Review Results

Three columns show results from each variant:
- **Algorithmic**: Simple concatenation (baseline)
- **Parallel (No Negatives)**: Parallel AI calls, adaptive negative terms
- **Parallel (Goal/Specificity)**: Parallel AI calls, always-on negative terms

### Step 4: Evaluate

For each result:
- **Flag Issue**: Click "Flag Issue" if result seems irrelevant
- **Add Notes**: Enter explanation in text area
- **Would Choose**: Click "Would Choose" to mark which doctor you'd select

### Step 5: Export

Click "Export JSON" or "Export CSV" to download results.

---

## Benchmark Test Cases

### Loading a Test Case

1. Select from dropdown: "Benchmark Test Cases"
2. Test case loads automatically
3. Results run automatically
4. View evaluation metrics

### Test Case Structure

Each test case includes:
- **ID**: Unique identifier
- **Name**: Descriptive name
- **User Query**: Test query
- **Conversation**: Full conversation history
- **Ground Truth**: Expected doctor names (in order)
- **Expected Specialty**: Expected specialty

### Evaluation Metrics

When ground truth is available, metrics are calculated:
- **Precision@3**: Fraction of top 3 that are ground truth
- **Precision@5**: Fraction of top 5 that are ground truth
- **Recall@5**: Fraction of ground truth found in top 5
- **MRR**: Mean Reciprocal Rank (position of first correct result)
- **NDCG**: Normalized Discounted Cumulative Gain

---

## API Endpoints

### GET `/test/corpus`
Returns corpus statistics.

### POST `/test/run-all-variants`
Runs all variants and returns ranked results.

**Body**:
```json
{
  "userQuery": "I need SVT ablation",
  "messages": [
    {"role": "user", "content": "I need SVT ablation"}
  ],
  "location": null,
  "filters": {},
  "groundTruthNames": ["Dr Neil Srinivasan", "Dr Jonathan Behar"] // Optional
}
```

**Response**:
```json
{
  "success": true,
  "variants": [
    {
      "name": "algorithmic",
      "q_patient": "...",
      "intent_terms": [...],
      "top3Results": [...],
      "processingTime": 1234
    },
    ...
  ],
  "evaluation": {
    "algorithmic": {
      "precisionAt3": 0.67,
      "precisionAt5": 0.60,
      "recallAt5": 0.60,
      "mrr": 0.5,
      "ndcg": 0.65
    },
    ...
  }
}
```

### GET `/test/benchmark-cases`
Returns all benchmark test cases.

### POST `/test/evaluate-benchmark`
Evaluate a single benchmark test case.

**Body**:
```json
{
  "testCaseId": "benchmark-001"
}
```

### POST `/test/batch-evaluate-benchmark`
Evaluate all benchmark test cases.

**Response**:
```json
{
  "success": true,
  "summary": {
    "totalTestCases": 10,
    "averagePrecisionAt3": {
      "algorithmic": 0.65,
      "parallel": 0.72,
      "parallel_general_goal_specificity": 0.75
    },
    ...
  },
  "results": [...]
}
```

---

## Understanding Results

### Query Information

Each variant shows:
- **Patient Query (q_patient)**: Clean query used for BM25 Stage A
- **Safe Lane Terms**: High-signal terms added to BM25 (if any)
- **BM25 Query (q_bm25)**: Final query used for BM25 retrieval
- **Intent Terms**: Expansion terms used for Stage B rescoring
- **Anchor Phrases**: Explicit conditions/procedures (boosted)
- **Clinical Intent**: Intent classification result

### Result Cards

Each result shows:
- **Rank**: Position in ranking (#1, #2, #3)
- **Practitioner Name**: Doctor name
- **Specialty**: Practitioner specialty
- **Final Score**: Combined BM25 + rescoring score
- **Rescoring Info**: Breakdown of rescoring boosts/penalties
- **Ground Truth Match**: ✓ if in expected results

### Evaluation Metrics

When ground truth is available:
- **Precision@K**: Are top results relevant?
- **Recall@K**: Are relevant results found?
- **MRR**: How high is first relevant result?
- **NDCG**: Position-weighted relevance score

---

## Troubleshooting

### Server Won't Start

- Check Node.js version: `node --version` (should be 14+)
- Check port 3001 is not in use
- Verify `.env` file exists with `OPENAI_API_KEY`

### No Results Appear

- Check browser console for errors
- Verify OpenAI API key is valid
- Check server logs for errors
- Ensure corpus file exists (if using local data)

### Results Look Wrong

- Verify corpus loaded correctly (check server startup logs)
- Check that messages array is properly formatted
- Review BM25 scores - they should be positive numbers
- Check intent classification results in query info

### OpenAI API Errors

- Verify API key is correct
- Check API quota/billing
- Ensure API key has access to `gpt-4o-mini` model
- Check rate limits

---

## Data Requirements

### Corpus File

The test server expects a corpus file at:
- `../consultant_profiles_with_gmc_20260122.json` (project root)

Or configure your own corpus file path in `server.js`.

### Benchmark Test Cases

Pre-loaded in `data/benchmark-test-cases.json`:
- 10+ test cases
- Ground truth for each case
- Various query types (procedures, symptoms, diagnoses)

---

## Customization

### Add Test Cases

Edit `data/benchmark-test-cases.json`:

```json
{
  "testCases": [
    {
      "id": "custom-001",
      "name": "My Test Case",
      "userQuery": "My query",
      "conversation": [...],
      "groundTruth": ["Dr Name1", "Dr Name2"],
      "expectedSpecialty": "Cardiology"
    }
  ]
}
```

### Modify Evaluation Metrics

Edit `utils/measurements.js` to add custom metrics.

### Change Test Server Port

Set `TEST_PORT` in `.env` file or environment variable.

---

## Next Steps

- **Understand Metrics**: Read [docs/TESTING_METRICS.md](../docs/TESTING_METRICS.md)
- **Productionalize**: Follow [PRODUCTIONALIZATION_GUIDE.md](../PRODUCTIONALIZATION_GUIDE.md)
- **Learn Algorithm**: Read [algorithm/README.md](../algorithm/README.md)

---

## File Structure

```
testing/
├── server.js                      # Express test server
├── ui/
│   └── index.html                 # Test UI (standalone HTML)
├── services/
│   └── local-bm25-service.js      # BM25 ranking service
├── utils/
│   ├── measurements.js             # Evaluation metrics
│   ├── name-to-id-mapper.js       # Ground truth mapping
│   └── transform-cromwell-data.js  # Data transformation
├── data/
│   └── benchmark-test-cases.json   # Test cases with ground truth
└── package.json                    # Dependencies
```

---

**Ready to test?** → Follow [QUICKSTART.md](../QUICKSTART.md)
