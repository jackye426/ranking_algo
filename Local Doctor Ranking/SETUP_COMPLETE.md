# ✅ Setup Complete - Ranking Algorithm Ready

## What's Been Done

1. ✅ **Dependencies Installed**
   - Installed all required packages in `parallel-ranking-package/testing/`
   - Installed `openai` and `dotenv` at project root

2. ✅ **Script Created**
   - `apply-ranking.js` - Main script to apply ranking algorithm to your data
   - Transforms merged doctor data into format expected by BM25 algorithm
   - Applies parallel ranking algorithm with two-stage retrieval

3. ✅ **Data Loading Verified**
   - Successfully loaded **11,895 doctor records** from `merged_all_sources_20260124_150256.json`
   - Data transformation working correctly:
     - 95.8% have GMC numbers
     - 99.8% have specialties
     - 72.5% have subspecialties
     - 83.3% have procedures listed
     - 124 unique specialties

4. ✅ **Environment Setup**
   - Created `.env` file template in `parallel-ranking-package/` folder

## Next Step: Add Your OpenAI API Key

To run the ranking algorithm, you need to add your OpenAI API key:

1. Open `parallel-ranking-package/.env` file
2. Replace `your_openai_api_key_here` with your actual OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

You can get an API key from: https://platform.openai.com/api-keys

## Usage

Once your API key is set, run:

```bash
node apply-ranking.js "I need SVT ablation"
```

### Example Queries

```bash
# Specific procedure
node apply-ranking.js "I need SVT ablation"

# Symptom-based
node apply-ranking.js "I have chest pain"

# Specialty-specific
node apply-ranking.js "Looking for a cardiologist for atrial fibrillation"

# General search
node apply-ranking.js "I need a general surgeon for hernia repair"
```

## What the Script Does

1. **Loads Data**: Reads `merged_all_sources_20260124_150256.json` and transforms records
2. **Query Processing**: Uses AI to analyze your query and extract:
   - Patient query (clean version for BM25)
   - Intent terms (expansion terms for rescoring)
   - Anchor phrases (explicit conditions/procedures)
   - Query goal and specificity
   - Negative keywords (when appropriate)
3. **Two-Stage Ranking**:
   - **Stage A**: BM25 retrieval using clean patient query
   - **Stage B**: Rescoring with intent terms, anchor phrases, and negative terms
4. **Results**: Displays top 10 ranked doctors with:
   - Name, title, specialty
   - Ranking scores (BM25 + rescoring)
   - Match information
   - GMC numbers

## Files Created

- `apply-ranking.js` - Main ranking script
- `README_RANKING.md` - Detailed usage guide
- `test-data-loading.js` - Test script (can be deleted)
- `parallel-ranking-package/.env` - Environment configuration (needs API key)

## Troubleshooting

**Error: OPENAI_API_KEY not set**
- Make sure you've updated `.env` file with your actual API key
- Verify the file is at `parallel-ranking-package/.env`

**Error: Cannot find module**
- Run: `npm install` in project root (should already be done)

**No results or poor rankings**
- Try making your query more specific
- Include explicit procedure names or conditions
- Check the intent terms and anchor phrases in the output

## Documentation

- **Quick Start**: `parallel-ranking-package/QUICKSTART.md`
- **Algorithm Details**: `parallel-ranking-package/algorithm/README.md`
- **Architecture**: `parallel-ranking-package/ARCHITECTURE.md`
- **Production Guide**: `parallel-ranking-package/PRODUCTIONALIZATION_GUIDE.md`

---

**Ready to test?** Add your API key and run: `node apply-ranking.js "your query here"`
