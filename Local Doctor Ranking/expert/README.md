# DocMap Expert Discovery

An independent preview for finding professional evidence relevant to an assessment brief, comparing candidates and preparing qualification work. It does not approve assessors or establish current practice, availability or independence.

The patient application and its API are unchanged. Expert routes, data preparation, project storage and deployment are separate. `synaptic_care_fe` is not a dependency.

## Run

From `Local Doctor Ranking/` with Node 22:

```powershell
npm ci
npm run start:expert
```

Open `http://localhost:3100/expert-discovery`. On the first start the server reads the professional source projection, resolves identities and prepares a passage index. Health remains 503 until both BM25 and semantic retrieval are ready. The initial vector build can take several minutes; later starts reuse content-addressed vectors.

Copy `expert/.env.example` into the ignored `expert/.env.local` and configure secrets privately. The dedicated Supabase reader token is separate from the existing patient reader. DeepSeek runs through OpenRouter; the existing local MiniLM embedding model is retained. `EXPERT_OFFLINE=1` disables remote interpretation and generation while preserving actual hybrid retrieval and sourced fallback explanations.

## Components

| File | Responsibility |
|---|---|
| `reader.cjs`, `supabase/index.ts` | Authenticated, read-only professional projection; source cache; no database rewrite |
| `data.cjs`, `enrichments.cjs` | Identity ledger, attributable source passages, conservative types and reviewed public additions |
| `brief.cjs` | Versioned active requirements; essential/preferred distinctions and explicit removal semantics |
| `search.cjs` | Actual BM25, MiniLM passage retrieval, candidate fusion and requirement–evidence matrix |
| `ai.cjs` | Deliberate-action explanations, independent support validation, 15-second budget and retryable sourced fallback |
| `transport.cjs` | Private stream buffering, completion checks and optional approved Friendli routing; no partial output or SDK content logging |
| `extraction.cjs` | Offline-by-default, bounded source-extraction proposals and explicit review; separate from the live corpus |
| `server.cjs` | Independent `/api/expert/*` contracts, bounded sessions/snapshots and source pages |
| `public/projects.js` | Separate IndexedDB store, user-only decisions/events, JSON backups and printable HTML packs |
| `public/app.js` | Stable results/composer, directory, comparison, profiles and local projects |

The same matrix and evidence identifiers drive cards, comparisons, qualification questions and saved packs. A saved rationale retains its original brief and evidence version. A changed brief marks earlier decisions for review. AI has no decision-writing or recruitment-event API.

## Data boundaries

- Full available professional source rows are audited; ambiguous identities are held out of search. Source counts are not approved-expert counts.
- Alternative biographies remain attributable to their source. Registration formats are typed; names alone never justify a merge.
- Original passages remain searchable alongside extracted attributes. Source dates, database merge dates and retrieval dates remain separate.
- The raw projection, model cache, sampled source excerpts and environment files are ignored by Git and excluded from deployment assets.
- Selected relevant professional excerpts and submitted assessment briefs may be sent to OpenRouter/DeepSeek with the user's authorization. Project notes, review decisions and recruitment event details remain in browser storage and are not sent to the model.
- When **Not contacted in this project** is enabled, the browser sends the contacted candidate IDs to the search server solely to exclude them from that project's result snapshot and pagination. Those IDs are not included in the DeepSeek request; contact dates, event details and review decisions remain local.
- Current practice, commercial terms, willingness and independence generally require direct qualification. Missing evidence is not a negative credential finding.

Start with the [simple-discovery release guide](docs/DISCOVERY_RELEVANCE_RELEASE.md) for specialty and interest searches, optional refinement, the evidence hierarchy and current verification. The [implementation plan](docs/DISCOVERY_RELEVANCE_PLAN.md) explains why search focus is distinct from explicit must-haves. Existing saved priorities are preserved.

The [three-pathway demonstration guide](docs/DEMO_GUIDE.md) covers detailed assessments, sourced limitations, project/export steps and wording that avoids unproven ROI claims.

See [data and evaluation](docs/DATA_AND_EVALUATION.md), the [bounded hybrid-language probe](docs/HYBRID_CONTRIBUTION.md), [model verification](docs/MODEL_VERIFICATION.md), and the [manual-workflow pilot protocol](docs/PILOT_MEASUREMENT.md).

The [Friendli verification report](docs/FRIENDLI_VERIFICATION.md) records the subsequent routing, formatting and grounding investigation, including every failed round. Explanations use DeepSeek v3.2; `EXPERT_OPENROUTER_PROVIDER=friendli` pins only the expert explanation/checking path, with provider fallback disabled. The brief interpreter and patient application are unchanged. The model supplies a cited fact and a literal connection to the brief; the server supplies the neutral summary and essential qualification reminder. The independent checker validates the complete displayed wording. An AI fallback remains a visible, retryable outcome and is not counted as a verified explanation.

The [release audit](docs/RELEASE_AUDIT.md) distinguishes verified functionality, incomplete scope and outstanding release checks. [Hosted verification](docs/DEPLOYMENT_VERIFICATION.md) links the preview and records actual search timings, persistence checks, AI fallbacks and the final deployment status. The [bounded extraction workflow](docs/EXTRACTION_WORKFLOW.md) explains source-content caching, exact-quote proposals and the review required before an accepted enrichment can enter the corpus.

## Verification

```powershell
npm test
npm run test:expert
node expert/evaluation/workbench.cjs --split=development
```

The workbench prepares one full index, serves the local preview and runs actual BM25/semantic/hybrid ablations. Coordinate full-corpus runs to avoid competing copies in memory. Held-out evaluation is run only after development changes are frozen. Reports preserve the first score; corrected reruns do not erase failed independent results.

## Deployment

Deploy only to the independent `docmap-expert-discovery` Railway service. `stage.cjs` creates a new deployment directory from a strict allowlist; it refuses a nonempty destination. It includes no source caches, credentials, project notes, database exports or test evidence samples.

```powershell
node expert/stage.cjs <new-directory-outside-this-app>
```

Upload that directory with Railway's `--path-as-root` option and the explicit expert service/project/environment IDs. The service uses `expert/Dockerfile`, a private `/data/expert` cache volume and `/api/expert/health`. Credentials are service variables. The runtime reads through the dedicated token-protected Supabase reader, and the container drops to the unprivileged Node user before starting.

Source corrections are applied by refreshing the source cache and restarting preparation. Text-content fingerprints invalidate affected evidence/index entries; explanation caches are scoped to exact snapshots and corpus versions. Deletions remove the affected passages from the live index. Old saved projects preserve their historical evidence for review and are marked stale when scope/evidence changes.
