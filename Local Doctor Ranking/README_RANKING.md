# Applying Ranking Algorithm to Doctor Data

This guide explains how to apply the parallel ranking algorithm to the merged doctor data file.

## Quick Start

### 1. Install Dependencies

```bash
cd parallel-ranking-package/testing
npm install
cd ../..
```

### 2. Set Up Environment Variables

Create a `.env` file in the `parallel-ranking-package/` folder:

```bash
cd parallel-ranking-package
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-actual-api-key-here
```

### 3. Run Ranking on Your Data

```bash
node apply-ranking.js "I need SVT ablation"
```

Or test with other queries:

```bash
node apply-ranking.js "I have chest pain"
node apply-ranking.js "Looking for a cardiologist for atrial fibrillation"
node apply-ranking.js "I need a general surgeon for hernia repair"
```

## How It Works

1. **Data Loading**: The script loads `merged_all_sources_20260124_150256.json` and transforms each doctor record into the format expected by the BM25 ranking algorithm.

2. **Query Processing**: Your query is processed using the parallel ranking algorithm which:
   - Extracts intent and expansion terms using AI
   - Identifies anchor phrases (explicit conditions/procedures)
   - Classifies query goal and specificity
   - Determines if negative keywords should be applied

3. **Two-Stage Ranking**:
   - **Stage A**: BM25 retrieval using the clean patient query
   - **Stage B**: Rescoring with intent terms, anchor phrases, and negative terms

4. **Results**: Top 10 ranked doctors are displayed with scores and match information.

## Output Format

For each ranked doctor, you'll see:
- Name and title
- Specialty and subspecialties
- Ranking score (BM25 + rescoring)
- Match information (high-signal matches, pathway matches, anchor matches)
- GMC number (if available)

## Example Output

```
[Ranking] Query: "I need SVT ablation"
[Ranking] Searching through 11895 practitioners...
[Ranking] Session context generated in 1234ms
[Ranking] Patient Query (q_patient): "I need SVT ablation"
[Ranking] Intent Terms: ablation, electrophysiology, cardiology, ...
[Ranking] Anchor Phrases: SVT ablation
[Ranking] Goal: procedure_intervention, Specificity: named_procedure
[Ranking] Confidence: 0.85

1. Dr. John Smith - Consultant Cardiologist
   Specialty: Cardiology
   Subspecialties: Electrophysiology, Arrhythmia
   Score: 12.3456
   BM25 Score: 8.2345
   Rescoring Score: 4.1111
   Matches: 2 high-signal, 3 pathway, 1 anchor
   GMC: 1234567
```

## Customization

You can modify `apply-ranking.js` to:
- Change the number of results returned (`shortlistSize`)
- Add conversation history (`messages` parameter)
- Filter by location
- Export results to JSON/CSV

## Troubleshooting

**Error: OPENAI_API_KEY not set**
- Make sure you've created `.env` file in `parallel-ranking-package/` folder
- Verify the API key is correct and has credits

**Error: Data file not found**
- Ensure `merged_all_sources_20260124_150256.json` is in the project root directory

**No results or poor rankings**
- Check that your query is clear and specific
- Try rephrasing with explicit procedure names or conditions
- Review the intent terms and anchor phrases in the output

## Next Steps

- Read the algorithm documentation: `parallel-ranking-package/README.md`
- Explore the testing framework: `parallel-ranking-package/testing/`
- Review production integration guide: `parallel-ranking-package/PRODUCTIONALIZATION_GUIDE.md`
