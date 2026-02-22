# Benchmark question bank

Question bank CSVs feed the benchmark pipeline: **pre-filter (current ranking, top 30) → LLM picks 5 best** per question.

## Location

- **CSV files**: Project root (`Ranking algo optimisation/`), one file per specialty:
  - `Benchmark question bank - cardiology.csv`
  - `Benchmark question bank - General Surgery.csv`
  - `Benchmark question bank - Obs & Gynae.csv`
  - `Benchmark question bank - ophthalmology.csv`
  - `Benchmark question bank - Trauma & Orthopaedic Surgery patient queries.csv`

## Format

- One **patient query** per line (one question per line).
- Lines may be quoted with `"..."` or `'...'` (or Unicode curly quotes); the loader strips surrounding quotes.
- Up to **20 questions** per file; extra lines are ignored. Short metadata lines (e.g. `"Practical, intent-heavy"`) are skipped.
- Encoding: UTF-8.

## Filename → specialty mapping

| CSV filename | Canonical specialty (for pipeline) |
|--------------|-----------------------------------|
| Benchmark question bank - cardiology.csv | Cardiology |
| Benchmark question bank - General Surgery.csv | General surgery |
| Benchmark question bank - Obs & Gynae.csv | Obstetrics and gynaecology |
| Benchmark question bank - ophthalmology.csv | Ophthalmology |
| Benchmark question bank - Trauma & Orthopaedic Surgery patient queries.csv | Trauma & orthopaedic surgery |

These names must match the specialty JSONs (`cardiology.json`, `general-surgery.json`, etc.) and `expectedSpecialty` in benchmark output.

## Loader script

**File**: `load-question-bank.js`

**Usage**:

```bash
cd "Local Doctor Ranking"
node load-question-bank.js
```

- Prints a summary (specialty → question count).
- Writes `benchmark-questions-loaded.json` with:
  - `bySpecialty`: `{ "Cardiology": [...], "General surgery": [...], ... }`
  - `all`: `[ { specialty, questions }, ... ]`

**API** (for pipeline scripts):

```js
const { getQuestionBank, getQuestionsForSpecialty, writeQuestionBankJson } = require('./load-question-bank');

const bank = getQuestionBank();
// [ { specialty: "Cardiology", questions: [...] }, ... ]

const cardioQuestions = getQuestionsForSpecialty('Cardiology');

writeQuestionBankJson(path.join(__dirname, 'benchmark-questions-loaded.json'));
```

## Benchmark ground-truth generator

**File**: `generate-benchmark-ground-truth.js`

Implements the full pipeline: for each question, pre-filter with current ranking (top 30), then call an advanced LLM to pick 5 best `practitioner_id` in order; output benchmark JSON in the same schema as `benchmark-test-cases.json`.

**Requirements**: `OPENAI_API_KEY` in `parallel-ranking-package/.env`. Optional: `BENCHMARK_LLM_MODEL` (default `gpt-4o`).

**Usage**:

```bash
cd "Local Doctor Ranking"
node generate-benchmark-ground-truth.js
```

- Reads question bank (CSVs) and specialty JSONs (`cardiology.json`, etc.).
- For each question: runs session context + BM25 shortlist (size 30), then calls the LLM with the query and 30 full profiles; LLM returns 5 `practitioner_id` in order; maps to names for `groundTruth`.
- Writes `benchmark-test-cases-all-specialties.json` with all test cases (id, name, userQuery, conversation, groundTruth, expectedSpecialty).
- Validates that every ground-truth name exists in the corresponding specialty corpus.

**Optional**: `--limit N` runs only the first N questions per specialty (e.g. `node generate-benchmark-ground-truth.js --limit 2` for 10 total cases).

**Output**: `benchmark-test-cases-all-specialties.json` — use for batch evaluation against the Local Doctor Ranking server (merged data). To run the existing test harness against this file, point it at this path or merge it into `parallel-ranking-package/testing/data/benchmark-test-cases.json`.
