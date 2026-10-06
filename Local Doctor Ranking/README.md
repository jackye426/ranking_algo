# Local Doctor Ranking Server

The separate DocMap Expert Discovery preview is documented in [expert/README.md](expert/README.md), with a [three-pathway demonstration guide](expert/docs/DEMO_GUIDE.md). Its routes, project storage and deployment are independent of the patient demo.

A local web server that provides doctor ranking functionality using the parallel ranking algorithm and your merged doctor data.

## Features

- 🚀 **Fast**: Data loaded once at startup, served efficiently
- 🔍 **Smart Ranking**: Uses parallel AI processing and two-stage BM25 retrieval
- ⚡ **Specialty Filtering**: Automatically filters by specialty before ranking (7-30x faster!)
- 📊 **Large Dataset**: Handles 11,895+ doctor records efficiently
- 🌐 **Web UI**: Beautiful, modern interface for searching doctors
- 🔌 **REST API**: Simple API endpoints for integration

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Make sure your `.env` file in `parallel-ranking-package/` folder has your OpenAI API key:

```
OPENAI_API_KEY=sk-your-actual-key-here
```

### 3. Start the Server

```bash
npm start
```

The server will:
- Load all doctor data from `merged_all_sources_20260124_150256.json`
- Start on `http://localhost:3000`
- Display statistics and ready status

### 4. Use the Web Interface

Open your browser and go to:
```
http://localhost:3000
```

You'll see a search interface where you can:
- Enter queries like "I need SVT ablation"
- See ranked results with scores
- View doctor details, specialties, and GMC numbers

## API Endpoints

### GET /api/health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "dataLoaded": true,
  "totalPractitioners": 11895,
  "loadTime": 1234
}
```

### GET /api/stats
Get data statistics

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 11895,
    "withGMC": 11398,
    "uniqueSpecialties": 124,
    ...
  }
}
```

### POST /api/rank
Rank doctors by query

**Request:**
```json
{
  "query": "I need SVT ablation",
  "messages": [],  // optional conversation history
  "location": null,  // optional location filter
  "specialty": null,  // optional manual specialty filter (e.g., "Cardiology")
  "shortlistSize": 10  // optional, default 10
}
```

**Note:** The server automatically filters by specialty/subspecialty based on query intent to optimize performance. You can also manually specify a specialty filter.

**Response:**
```json
{
  "success": true,
  "query": "I need SVT ablation",
  "totalResults": 10,
  "results": [
    {
      "rank": 1,
      "name": "Dr. John Smith",
      "title": "Consultant Cardiologist",
      "specialty": "Cardiology",
      "subspecialties": ["Electrophysiology"],
      "score": 99.52,
      "bm25Score": 63.45,
      "gmc_number": "1234567",
      ...
    }
  ],
  "queryInfo": {
    "q_patient": "I need SVT ablation",
    "intent_terms": ["supraventricular tachycardia", ...],
    "goal": "procedure_intervention",
    "specificity": "named_procedure",
    "confidence": 0.9
  },
  "processingTime": {
    "sessionContext": 1234,
    "ranking": 567,
    "total": 1801
  }
}
```

### GET /api/search?q=query
Simple search endpoint (GET method)

**Example:**
```
GET /api/search?q=I%20need%20SVT%20ablation&limit=10
```

## Example Queries

Try these example queries:

- **Specific Procedure**: "I need SVT ablation"
- **Symptom-based**: "I have chest pain"
- **Specialty-specific**: "Looking for a cardiologist for atrial fibrillation"
- **General**: "I need a general surgeon for hernia repair"

## How It Works

1. **Data Loading**: On startup, the server loads all 11,895 doctor records from your merged data file and transforms them into the format expected by the ranking algorithm.

2. **Query Processing**: When you submit a query:
   - The parallel ranking algorithm analyzes your query using AI
   - Extracts intent terms, anchor phrases, and determines query clarity
   - Classifies goal (diagnostic_workup, procedure_intervention, etc.) and specificity
   - **Infers likely subspecialties** (e.g., "SVT ablation" → "Electrophysiology")

3. **Specialty Filtering** (Performance Optimization):
   - Before ranking, practitioners are filtered by inferred subspecialties
   - This dramatically reduces the dataset size (e.g., from 11,895 to ~200-500 relevant doctors)
   - Speeds up ranking by 5-10x while maintaining accuracy
   - Falls back to full dataset if filtering is too aggressive

4. **Two-Stage Ranking**:
   - **Stage A**: BM25 retrieval using clean patient query (top 50 candidates from filtered set)
   - **Stage B**: Rescoring with intent terms, anchor phrases, and negative keywords

5. **Results**: Top ranked doctors are returned with detailed scoring information and filtering stats

## Performance

- **Initial Load**: ~2-5 seconds (one-time, on startup)
- **Query Processing**: ~1-3 seconds per query
  - **With Specialty Filtering**: Typically searches 200-500 doctors instead of 11,895
  - **Speed Improvement**: 5-10x faster ranking while maintaining accuracy
- **Memory Usage**: ~200-500MB (depending on data size)

### Specialty Filtering Benefits

- **Reduced Search Space**: Instead of ranking all 11,895 doctors, the system filters to relevant specialties first
- **Faster Results**: BM25 ranking on 200-500 doctors is much faster than on 11,895
- **Maintained Accuracy**: AI-inferred subspecialties ensure relevant doctors aren't filtered out
- **Smart Fallback**: If filtering is too aggressive (<10 results), falls back to full dataset

## File Structure

```
.
├── server.js              # Main server file
├── apply-ranking.js       # Ranking logic and data transformation
├── public/
│   └── index.html         # Web UI
├── merged_all_sources_20260124_150256.json  # Doctor data
└── parallel-ranking-package/  # Ranking algorithm package
```

## Troubleshooting

**Server won't start:**
- Check that `merged_all_sources_20260124_150256.json` exists in the project root
- Verify OpenAI API key is set in `parallel-ranking-package/.env`
- Check port 3000 is not already in use

**No results or poor rankings:**
- Try making your query more specific
- Include explicit procedure names or conditions
- Check the query info in the response to see how it was interpreted

**Slow performance:**
- Initial load takes time (one-time cost)
- Query processing uses AI, so it takes 1-3 seconds
- Consider increasing `shortlistSize` for more results (but slower)

## Development

To modify the server:

1. Edit `server.js` for API endpoints
2. Edit `public/index.html` for UI changes
3. Edit `apply-ranking.js` for ranking logic changes

Restart the server after changes:
```bash
# Stop: Ctrl+C
# Start: npm start
```

## License

ISC


## Directory and top-options demo

The same live search is available at `/directory` (also the `/` default) and `/guided`.
The Directory retains the existing cards and conversational criteria and loads six results at a time.
Top options displays the first three from the same ranking. The view switch preserves the active
conversation, draft, selected comparison, profile explanation cache and per-view reading position;
it does not search again or call a model. Conversation state stays in the current tab, not in URLs.

Select two or three consultants to open the live evidence comparison. Facts and source links appear
immediately. “Explain these differences for me” is an explicit, optional DeepSeek request through the
existing OpenRouter configuration. This is independent of the prepared comparison on the homepage.
Missing data is not a negative assessment of a consultant, and the comparison does not choose a
clinically superior doctor or recommend treatment.

The server retains the ranked candidate pool in each bounded, expiring search snapshot. The search
response includes an opaque `nextCursor`; `POST /api/search-results` accepts `sessionId`, `searchId`
and `cursor`, returning the next six results and continuation cursor without reinterpreting or
reranking. Only served consultants can receive explanations. `POST /api/comparison-explanation`
accepts those session/search identifiers and two or three distinct `consultantIds`. Comparison
requests share existing generation limits, deduplicate by search and canonical selected set, and
require local citation-ownership validation plus an independent support check. Fallback leaves
sourced facts available. No database migration or additional model credentials are required.

Requests without a clinical anchor now return `needsClarification: true` with no generic ranked
results. Existing meaningful context is retained for vague follow-ups. Removing the last clinical
criterion clears that context and asks what the patient wants help with; earlier searches remain in History.

Validation: `npm test` covers both views, navigation, snapshot paging, comparison and grounding.
`npm run verify:comparison` checks the real cached corpus with actual BM25 and semantic retrieval,
including preserved running goals after unsuccessful physiotherapy, without paid API calls.
