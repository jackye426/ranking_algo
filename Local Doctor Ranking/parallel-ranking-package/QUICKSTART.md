# Quick Start Guide

Get the parallel ranking algorithm running in **5 minutes**.

---

## Prerequisites

- ✅ Node.js 14+ installed
- ✅ OpenAI API key (get from https://platform.openai.com/api-keys)
- ⚠️ **Corpus file**: The test server expects a corpus file at `../consultant_profiles_with_gmc_20260122.json` (project root). If you don't have this file, you can:
  - Use your own practitioner data (update path in `server.js`)
  - Test with the algorithm directly using examples (no corpus needed)

---

## Step 1: Install Dependencies (2 minutes)

```bash
cd testing
npm install
```

This installs:
- `express` - Test server
- `cors` - CORS support
- `openai` - OpenAI API client
- `dotenv` - Environment variables

---

## Step 2: Configure Environment (1 minute)

Create `.env` file in `testing/` folder:

```bash
cd testing
cp ../.env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
TEST_PORT=3001
```

---

## Step 3: Start Test Server (30 seconds)

```bash
npm start
```

You should see:
```
[Test Server] Server running on http://localhost:3001
[Test Server] Test UI: http://localhost:3001/test
[Test Server] Corpus: 545 practitioners loaded
```

---

## Step 4: Open Test UI (30 seconds)

Open your browser:
```
http://localhost:3001/test
```

---

## Step 5: Test a Query (1 minute)

1. **Enter a test query** in the chat interface:
   - Example: "I need SVT ablation"
   - Or: "I have chest pain"

2. **Click "Run All Variants"**

3. **View results**:
   - Three columns show different ranking variants
   - Each shows enriched query, processing time, and top 3 results
   - Results include BM25 scores and practitioner details

---

## What You'll See

### Three Variants Compared:

1. **Algorithmic Expansion** - Simple concatenation (baseline)
2. **Parallel (No Negatives)** - Parallel AI calls, adaptive negative terms
3. **Parallel (Goal/Specificity)** - Parallel AI calls, always-on negative terms

### For Each Variant:

- **Patient Query (q_patient)**: Clean query used for BM25
- **Intent Terms**: Expansion terms for rescoring
- **Anchor Phrases**: Explicit conditions/procedures
- **Top 3 Results**: Ranked practitioners with scores

---

## Next Steps

- **Understand the algorithm**: Read [algorithm/README.md](algorithm/README.md)
- **Learn about negative keywords**: Read [docs/NEGATIVE_KEYWORDS.md](docs/NEGATIVE_KEYWORDS.md)
- **Productionalize**: Follow [PRODUCTIONALIZATION_GUIDE.md](PRODUCTIONALIZATION_GUIDE.md)

---

## Troubleshooting

**Server won't start:**
- Check Node.js version: `node --version` (should be 14+)
- Check port 3001 is not in use
- Verify `.env` file exists and has `OPENAI_API_KEY`

**No results appear:**
- Check browser console for errors
- Verify OpenAI API key is valid
- Check server logs for errors

**OpenAI API errors:**
- Verify API key is correct
- Check API quota/billing
- Ensure API key has access to `gpt-4o-mini` model

---

**Ready?** → [ARCHITECTURE.md](ARCHITECTURE.md) to understand how it works!
