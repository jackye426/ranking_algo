# DocMap conversational consultant search

A working demonstration for Vires at DoctorCall: a spacious search page becomes a conversation with sourced consultant cards, visible criteria and follow-up searches that filter and rerank real records.

**This workspace connects to the active DocMap Supabase project.** The audited `public.integrated_practitioners` table contains 40,876 practitioner rows, of which 4,868 link a Spire profile. Strict identity checks and deduplication produce **4,031 consultants**. See [the schema and quality audit](demo/data/SUPABASE-AUDIT.md).

Lovable was checked: its connected Pro workspace had four existing projects but no data connectors. The implementation stays in this repository with the real Node search backend. No separate Lovable project was created.

## Preview and startup

The hosted demo is live at [docmap-search-production.up.railway.app](https://docmap-search-production.up.railway.app), connected to the 4,031-consultant Supabase corpus with OpenRouter explanations available on demand. This Railway address is the chosen demo destination; no DNS change is required.

For a local preview, open [http://localhost:3000](http://localhost:3000). From `Local Doctor Ranking/`, use Node.js 20.9 or newer:

```sh
npm ci
npm start
```

The current workspace has an ignored, server-only `.env.local` configured for Supabase. Do not overwrite it with the example file. A fresh checkout without that file deliberately uses the clearly labelled 12-person public-profile snapshot; it does not claim to be connected.

Startup reads the restricted Spire projection from Supabase and builds the local retrieval index. The first run downloads quantized MiniLM and FLAN-T5 models and embeds the corpus; allow several minutes. Subsequent runs reuse the fingerprinted embedding/model caches. The cache and postcode lookups are under `demo/.cache/`, outside the public static root and excluded from Git. Live-data failures stop startup visibly; no public-snapshot fallback is substituted.

The listener defaults to `127.0.0.1:3000`. The launcher at `outputs/Start-DocMap.ps1` also starts the demo. Models, uncached postcodes and live Supabase reads require network access. Portraits, where independently verified, load from public Spire image URLs.

The original dashboard is preserved at `public/legacy.html`. Use `npm run start:legacy` to run its original backend, with its original dataset/configuration requirements.

## Present the conversation

1. **Find a knee specialist in London**
2. **Only those accepting Bupa**
3. **Closer to SW5**
4. Remove the Bupa chip, try **Any insurer**, or request **Within 20 miles**.

The interface shows one evolving shortlist, with earlier messages and result snapshots available in **History**. Earlier results are read-only; **Back to current search** restores the current criteria and refinement input. Results scroll inside a viewport-height workspace above a separate composer. Submitted text clears immediately; a compact acknowledgement appears beside the composer. Drafts typed during a request survive its completion, without changing focus. The visible consultant and its offset are retained where possible; **View updated matches** deliberately returns to the top. Pending or failed refinements retain the last successful shortlist. **Search** returns home without discarding the conversation; **Resume your search** restores it. **New search** explicitly clears the conversation and invalidates pending work. Browser Back/Forward follows the same view hierarchy, and profile close restores the originating card's focus and results-region position.

The whole consultant card delegates to one keyboard-accessible **View consultant** action. Deliberate opening shows **Why this could be a match** first with sourced text, then requests personalisation if uncached. Independent **About**, **Clinical focus**, **Practice locations** and **Sources & evidence** disclosures start collapsed; their state and reading position survive AI updates and reopening within that search. The explanation replaces only its own text, without duplicating the profile summary. A short patient-facing paragraph connects recorded practice to the preferences that produced that card; clinical terms use cited NHS definitions and material insurance qualifications remain visible. Hover and browser Forward never request AI. Reopening a completed explanation reuses its answer for that exact search and consultant. Motion uses 160ms feedback, 220ms content and 280ms panels; reduced motion is immediate.

**For healthcare teams** opens a separate shareable presentation at `/for-healthcare-teams`. Its prepared, source-linked excision example reveals specific expertise behind a broad specialty without making search or AI requests. The optional **Pilot approach** contains prospective profile-exploration, enquiry/booking-start and abandonment measures, with no claimed ROI. **Return to search** restores the conversation and draft. A direct server route marks the shell before rendering to avoid a patient-homepage flash.

The landing page uses the supplied DocMap heart-and-dot logo, its sampled indigo (`#3231e4`), pale periwinkle surfaces, generous search-box spacing and softly typed example queries. The animated examples are decorative, never entered as a user's query, and pause during input, offscreen states and reduced motion. Results use white reading surfaces, informative cards and a persistent follow-up input. Typography uses the native Apple system font where available, with self-hosted Inter elsewhere. Inter's SIL Open Font License is included under `public/fonts/`; no external font service is required.

Each turn reruns both retrieval methods. Earlier criteria persist until explicitly changed, including an explicit radius when the location changes. London means an explicitly disclosed 35-mile catchment around the city centre; postcode searches default to 50 miles. Distances use the nearest recorded Spire practice and approximate straight-line distance, not travel time. SW5 resolves to a postcode-district centre. Other towns use an exact-name lookup against Postcodes.io place records: an ambiguous name or unresolved location is not silently replaced by a prefix match. Unresolved locations with a distance constraint return no matches and an explanation.

For a deeper demonstration, start a new conversation and use **Find a knee specialist in London → Only orthopaedic surgeons → Those who perform knee replacement → Also arthroscopy → Only those accepting Bupa**. Specialty is a separate filter. Procedure requirements accumulate with **AND** semantics, so this example requires evidence for both knee replacement and knee arthroscopy; it does not replace one procedure with the other.

Continue with **Closer to SW5 → Within 5 miles → Closer to Bushey** to demonstrate that the five-mile radius, specialty, both procedures and insurer are preserved when the location changes. **Any distance** removes the explicit radius and nearest-first preference while retaining the location and its default catchment. **Search anywhere** removes the location constraint. **Any insurer**, **Remove procedures**, **Remove specialty**, or the corresponding criterion chips remove only the named preference; the combined procedures chip clears all procedure requirements. **Reset clinical search to dermatology** explicitly changes the clinical search while retaining the location. Conflicting clinical refinements produce a notice and preserve the existing criteria rather than quietly discarding them.

Bupa evidence is intentionally conservative: only **four** exact-identity consultant matches have separately verified, linked Bupa Finder evidence in this demo. Database source tags alone do not establish current acceptance. Missing evidence means unknown, not that a consultant rejects insurance. Tim Waters is recorded as **not fee assured**; Yegappan Kalairajah is **not in the Open Referral network**. Those qualifications remain in the cards and source details.

For a patient-language demonstration, enter **I have stage 3 endometriosis and I want a specialist who knows how to perform excision surgery**, then **In London** and **Closer to SW5**. The interpreted topic is endometriosis and the required procedure is **Endometriosis excision**. Stage 3 appears separately as **You shared** context, never as a verified consultant qualification. The audited corpus contains 105 consultants with explicit positive excision evidence (87 also have recorded Gynaecology); none of the available endometriosis fields confirms stage 3 experience. General endometriosis, ablation, unrelated excision and training mentions do not satisfy the excision requirement. A procedure that cannot be mapped confidently asks for clarification and leaves the last successful search intact.

## Search and grounded explanations

- **BM25:** the existing `bm25Service.cjs` implementation, with k1=1.5 and b=0.75. Only positive raw BM25 scores qualify. No ordinary keyword substitute.
- **Embeddings:** real quantized CPU inference using `Xenova/all-MiniLM-L6-v2`. Mean-pooled, normalized 384-dimensional vectors are compared using cosine similarity.
- **Fusion and reranking:** reciprocal rank fusion with k=60 combines the independently retrieved lists; a relevance reranker combines fusion and cosine scores. The retrieval query includes the clinical topic, specialty and accumulated procedures. Explicit specialty and procedure filters require corresponding recorded evidence. Adding these hard criteria narrows the eligible set, and every requested procedure must be supported. The entire eligible retrieval union is retained, so nearest ordering is not restricted to a hidden top-60 shortlist.
- **AI query interpretation:** OpenRouter's `deepseek/deepseek-v3.2` translates explicit clinical intent into a validated criteria patch. Every change must be grounded in the current request, use supported procedure/specialty labels and preserve earlier preferences unless changed. Disease staging is patient context. Known location/insurance refinements and chip removal bypass paid interpretation. Unsupported or conflicting procedures require clarification; provider failures use supported deterministic terms with a visible notice rather than invented criteria.
- **Local evidence preparation:** retrieved consultant fields become numbered facts. Local `Xenova/flan-t5-small` receives the accumulated criteria and selects relevant evidence; selections are checked against the consultant's exact fact text and source URL. Retrieval, embeddings, filtering and evidence selection remain local; clinical-language interpretation can make a paid AI call.
- **On-demand personalised RAG:** deliberately opening a consultant card sends only the session, search and consultant IDs to `POST /api/match-explanation`. The server retrieves the immutable search snapshot and supplies its limited criteria, consultant name/specialty, selected evidence and mandatory caveats to the configured model provider. The model writes a short paragraph (normally 60–100 words, maximum 800 characters) and up to four reasons linked to evidence IDs. NHS terminology facts can explain medical wording but cannot establish consultant experience. Material insurance exceptions and unverified stage context must appear in the paragraph. Schema, length, citation, numerical and prohibited-claim validation is followed by a separate model support check; an unverifiable answer is replaced with readable, labelled profile evidence. Duplicate source facts are removed.
- **Explanation consistency:** local evidence selection is cached by consultant ID and the complete criteria object. Each search response also receives a separate `searchId`, and the server binds its visible consultants to immutable criteria/evidence snapshots. Opening an older card therefore explains that older search, even after subsequent refinements. Pending reveal requests are deduplicated and successful explanations are cached per consultant within that snapshot. The most recent ten search snapshots per session are retained.
- **Truthful presentation:** validated OpenRouter or OpenAI output is labelled **AI-generated explanation**. Missing configuration, insufficient evidence, provider failures or failed support checks produce **Profile evidence** with an explicit notice. Transient or validation failures offer a retry while keeping the fallback evidence visible; missing-key fallbacks do not suggest that an AI answer was generated. All returned source citations and mandatory caveats remain available in the expanded panel.
- **Source evidence:** external field links are used where known. Aggregated facts lacking original URLs link to a readable `/sources/:id` page containing the stored facts and record provenance. A Spire identity URL is not presented as the original source of every merged field.

Procedure evidence describes the recorded practice, not a guarantee that a procedure is currently available at every listed Spire site. That qualification is visible on procedure-specific matches. Insurance qualifications, including fee-assurance and referral-network limitations, remain visible alongside the personalised summary.

The mapper reuses the legacy ranking document fields, and distances reuse the repository's Haversine utility. No internal scores or algorithm controls appear in the main demo.

The conversation combines conservative deterministic filters with validated AI clinical interpretation. It supports clinical topics, specialty, cumulative procedures, insurer, UK postcode/city/town, radius, nearest ordering, consultant gender and language criteria. Unsupported price, appointment availability and exclusion requests produce a notice or clarification. It is a consultant search interface, not an unrestricted medical advice chatbot.

## Supabase connection and security

Project: **DocMap**, `oewczjseteyvyvikxxaz`. The live reader is the additive Edge Function `docmap-spire-demo-read`; its source is in `demo/supabase/docmap-spire-demo-read/index.ts`.

The function accepts **GET only** with a dedicated random 256-bit read token. Its deployed code contains only the token's SHA-256 hash. Missing or incorrect tokens are rejected before querying the database. Supabase gateway JWT checking is disabled specifically because the function implements and verifies this custom authentication itself.

Inside the function, Supabase's built-in service credential reads a fixed projection from `integrated_practitioners`. It never leaves that server runtime. The projection excludes emails, phone numbers, raw ingestion payloads and internal operational data. Nested location objects are also projected explicitly. Pages use a stable ID cursor and a maximum 500 rows. No arbitrary table or column input is accepted.

The Node server holds only the restricted reader token in ignored `.env.local`:

```dotenv
DEMO_DATA_SOURCE=supabase
SUPABASE_URL=https://oewczjseteyvyvikxxaz.supabase.co
SUPABASE_READER_FUNCTION=docmap-spire-demo-read
SUPABASE_READER_TOKEN=<dedicated-server-only-token>
```

No existing database rows, schemas, grants or RLS policies were modified. The existing tables remain protected by their authenticated-role policies. Only the new function was deployed. Cortex was identified as unrelated and was not used.

For a new environment, transfer the restricted token securely or rotate it and redeploy the matching hash. `demo/scripts/configure-reader.cjs` generates a fresh local token only when no `.env.local` exists and outputs its hash; deployment must use that same hash. Do not deploy the checked-in hash while using a different newly generated token.

The application serves only `public/` and explicit evidence routes. It never exposes repository files, credentials, raw caches or ranking diagnostics through static routing. Same-origin checks, request-size/rate limits and random server-side conversation IDs protect the local demo surface.

## AI explanation provider

The current workspace has a server-side OpenRouter key configured. Both query interpretation and explanations default to `deepseek/deepseek-v3.2`, with reasoning disabled, structured output required and provider data collection disallowed. Configure credentials only in ignored `.env.local` or the hosting service's secret variables:

```dotenv
OPENROUTER_API_KEY=<server-only-key>
OPENROUTER_QUERY_MODEL=deepseek/deepseek-v3.2
OPENROUTER_EXPLANATION_MODEL=deepseek/deepseek-v3.2
```

OpenRouter takes precedence when its key is present. To use OpenAI directly instead, omit the OpenRouter key and set:

```dotenv
OPENAI_API_KEY=<server-only-key>
OPENAI_EXPLANATION_MODEL=gpt-4.1-mini
```

This is a configuration fallback, not an automatic switch to another paid provider after an outage: provider errors show labelled source evidence. Without either key, local retrieval and conversational refinement still work, and the reveal panel explains that AI generation is not configured.

Each clinical interpretation can make one paid model request containing the current message and previous clinical criteria; routine recognised preference refinements bypass it. Each uncached reveal normally makes two paid model requests: one to draft the explanation and one to check its source support. A rejected draft receives at most one rewrite and the same checks, for a maximum of four model requests within the overall deadline. Only an exact empty list of unsupported claims passes the source check. Unsupported benefits, quality claims, distance qualifiers and stage-specific expertise also face deterministic checks. The browser receives no credentials and sends no full consultant record or conversation history to the model provider. The server supplies only bounded search preferences, selected evidence excerpts and caveats; excerpts can contain public consultant or hospital names. The About panel discloses AI interpretation and explanations. No search messages are logged by the application.

The server limits simultaneous generations, deduplicates pending requests, caps retries at three attempts per card, and applies per-session, per-IP and global generation budgets. Query interpretation has separate budgets (40 per session, 120 per IP/hour, 400 globally/hour); filter removal remains available when the AI budget is exhausted. Responses that reach a limit use HTTP 429 with `Retry-After`. Unresolved clinical requests use HTTP 422 without committing criteria. Expired or evicted search snapshots use HTTP 410 and require an explicit new search.

## Docker and Railway deployment

The hosted demo runs in Railway project **docmap-search**, ID `0a83f08c-2a8e-487d-a648-22360a1193b6`. The latest interface deployment, `f77c5d6c-e617-4bc2-8c46-0d3ba3084a32`, succeeded with all **4,031** consultants. It was uploaded from the verified 33-file `outputs/docmap-deployment-v15` staging manifest; all eleven hosted public assets match its SHA-256 hashes. Public health confirms DeepSeek v3.2 for both clinical query interpretation and explanations. The interface uses the supplied DocMap logo and 500-weight wordmark, a stable result workspace, Why-first consultant profiles, whole-card opening and a separate [healthcare-team presentation](https://docmap-search-production.up.railway.app/for-healthcare-teams). Animated examples, the three-story patient walkthrough, Apple/Inter typography, focus restoration and reduced-motion support are retained. [The Railway preview](https://docmap-search-production.up.railway.app) is the chosen demo address. The optional custom domain **search.docmap.co.uk** has not been moved.

### Optional custom-domain DNS

The user chose to retain the Railway address. If a custom domain is requested later, these were the Railway-provided records; recheck them before changing the `docmap.co.uk` DNS zone:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `search` | `4fry02lb.up.railway.app` |
| TXT | `_railway-verify.search` | `railway-verify=e0be3e97812b3ed05b7abd7a56ceb0796e1084c0642c91bce2f02f735cc7c49d` |

After the records propagate, verify Railway's domain status, HTTPS and `/api/health` on `search.docmap.co.uk` before using the custom domain for the presentation. The Railway preview remains available meanwhile.

### Rebuild and configuration

Create a fresh deployment staging directory from `Local Doctor Ranking/`:

```sh
node demo/scripts/stage-deployment.cjs "../../../work/docmap-stage"
docker build -t docmap-search "../../../work/docmap-stage"
```

The staging script accepts an empty directory outside the application source and copies an explicit allowlist of runtime files. It refuses a nonempty destination and writes `deployment-manifest.json` with file sizes and SHA-256 hashes. It excludes `.env` files, dependencies, raw data/model caches and unrelated repository content. Do not upload the entire research repository or an existing local cache. The checked-in `.dockerignore` provides a second allowlist for the Docker build context.

Use that staged folder as the Railway upload root (`--path-as-root`), or configure `Local Doctor Ranking/` as the service root for a repository-based build. `railway.toml` selects the Dockerfile and `/api/health` readiness check with a 900-second startup allowance. Set Supabase reader and AI credentials as Railway service variables, never build arguments or committed files.

The Dockerfile uses Node.js 22, installs production dependencies, downloads and smoke-tests only the two public CPU models during the build, and runs the service as the unprivileged `node` user. Live Supabase records and their fingerprint-checked embedding index are obtained/generated at runtime. The application files are root-owned; the runtime cache is writable by the service. `HOST=0.0.0.0` is set for the container, and Railway can supply `PORT`. Health returns HTTP 503 while the search index is preparing and HTTP 200 only once it is ready.

For a deployed service behind Railway's reverse proxy, configure:

```dotenv
HOST=0.0.0.0
TRUST_PROXY=1
PUBLIC_ORIGIN=https://search.docmap.co.uk
PUBLIC_ORIGINS=https://docmap-search-production.up.railway.app
```

`PUBLIC_ORIGIN` sets the primary exact browser origin, including HTTPS. `PUBLIC_ORIGINS` adds explicitly allowed origins as a comma-separated list; the configuration above keeps the custom domain primary and permits the Railway preview without a wildcard. Other browser origins are rejected. Use the verified Railway preview while custom DNS is pending. `TRUST_PROXY=1` trusts one reverse-proxy hop for the request scheme and client IP; leave it disabled and both origin variables unset for a direct local listener. Keep one application replica for this presentation build because conversations and explanation caches are in process memory.

## Verification

The soft-blue interface release passes **156 tests**, including a new frontend state regression covering request ownership, asynchronous dialog-close races, reset/refinement cancellation, cache, History, evidence fallback, source-disclosure focus and independent removal of identically worded topic/procedure criteria. Only the three public frontend runtime files changed from the prior release; the backend and data connection are unchanged. Hosted hashes match those files exactly.

Browser QA covered desktop, 390px and 320px layouts, the real knee/London -> Bupa -> SW5 sequence (104 -> 4 -> 4), a one-mile empty result and criterion removal restoring four. Actual DeepSeek explanations were checked in the new sheet, including full sources, visible insurer qualifications, cached reopening, Escape and mobile handle-drag dismissal with focus restoration. Screenshots are saved as `outputs/docmap-blue-desktop.jpg`, `outputs/docmap-blue-desktop-sheet.jpg` and `outputs/docmap-blue-mobile-sheet.jpg` in the task workspace. See [the implementation plan and verification notes](UI-REFINEMENT-PLAN.md). Native Safari/iPhone hardware has not been tested; responsive checks use Chromium viewport emulation.

```sh
npm test
npm run verify:demo
npm run verify:refinements
```

To verify a real paid explanation against a ready Supabase-backed server configured for OpenRouter, run:

```sh
node demo/scripts/verify-explanation-live.cjs
```

This deliberately requests one uncached explanation, which includes the generation and support-check model calls. It defaults to `http://localhost:3000`; set `DOCMAP_VERIFY_URL` to test another ready deployment. The result is saved in [the live explanation report](demo/.cache/explanation-live-verification.json).

The unit suite covers criteria accumulation and conflict handling, specialty and AND procedure filters, radius preservation, real BM25 scoring, independent candidate fusion, proximity beyond the former shortlist, bounded/deduplicated geocoding and exact town matching, identity conflicts, duplicate merging, insurance proof, field-level provenance, personalised explanation validation and criteria-sensitive caching. Reveal-endpoint tests also cover immutable search snapshots, request validation, source-support rejection, missing-key/transient fallbacks, caching, deduplication, expiry and generation limits. Origin checks allow only explicitly configured production and preview origins.

The patient-language update adds mocked-provider tests for the exact stage-3/excision narrative, contextual follow-ups, disease-stage preservation, surgical-removal aliases, patient-versus-consultant gender, condition-versus-place ambiguity, explicit filter removal, unsupported techniques/procedures and hostile or malformed model patches. Explanation tests cover plain-English definitions, duplicate sources, stage limitations, supported identity, medical-benefit rejection and bounded rewrites. `demo/scripts/verify-patient-search-live.cjs` exercises generic endometriosis directory queries, location and insurance refinement, clarification, source-backed procedure results and paid explanations; it does not transmit first-person or stage-specific patient context.

The final patient-search build passed **155 unit tests** and the hosted six-check explanation verification. The live four-turn search remained **104 → 4 → 4 → 3**, and an earlier Timothy Waters card retained Bupa/SW5 after another refinement. DeepSeek generated its validated paragraph in **5.73 seconds**; the identical cached response took **60 ms**. Mobile explanation text was checked at 390 × 844 with no horizontal overflow or browser errors. The exact stage-3 request was verified with local/mock providers. A generic excision search was also verified against real records (105 matches; 31 in the London catchment), but the final endometriosis-specific paid explanation probe remains pending explicit user approval after automatic approval review blocked its diagnostic transmission to OpenRouter. It has not been silently marked as passed.

The integration script runs the actual models and live data, then exercises the three-turn sequence both directly and through HTTP. It asserts both retrieval paths are active, insurance narrows candidates, distance changes their order, source links exist, known incorrect merges are excluded, and credentials/debug information are absent from responses. It also checks empty results, expired sessions, cross-origin rejection and private-file protection.

`verify:refinements` exercises a separate **18-step HTTP verification** against the live data and actual models. It checks that added clinical filters admit no candidates outside the preceding set, both procedures remain active, every returned consultant has sourced personalised evidence, insurance recognition is verified, distances obey the radius, location changes refresh the explanation, removal preserves unrelated criteria, a clinical reset works, and an unresolved town fails transparently when distance is required. It also asserts that real AI evidence selection executes during the sequence; individual extractive fallbacks remain permitted and labelled.

The regenerated `demo/.cache/verification.json` and `demo/.cache/refinement-verification.json` record exact candidate counts, ordering, criteria and model modes for the current data. The standard report also includes retrieval diagnostics. Current counts and source coverage should be read from these reports rather than treated as permanent constants.

The reports regenerated on **1 October 2026** verify the live three-turn sequence at **104 → 4 → 4** matches. SW5 reordered the Bupa results to Ravi Popat, Timothy Waters, Sunil Kumar and Yegappan Kalairajah (approximately 11.5, 11.5, 12.1 and 24.3 miles). The independent **arthroplasty** probe yielded **69 BM25 candidates and 135 embedding candidates**; **78 embedding candidates were absent from the BM25 list**, producing 147 candidates in the combined ranking.

The deeper sequence returned **104 → 87 → 67 → 55 → 3** as orthopaedic specialty, knee replacement, knee arthroscopy and Bupa requirements accumulated. Moving to SW5 kept 3 matches; adding a five-mile radius returned **0**, and moving to Bushey with that same radius returned **2**. All 18 steps passed, including criterion removals, an insurer replacement, a dermatology reset, an unresolved location, and a combined procedure-plus-postcode follow-up in a new conversation. Both actual local-model selection and validated extractive fallback appear in the reports.

The live explanation HTTP check passed all six assertions against [the hosted Railway service](https://docmap-search-production.up.railway.app) after the premium-interface deployment on **1 October 2026**, using actual OpenRouter generation. Its four-turn scenario, **knee specialist in London → Bupa → closer to SW5 → orthopaedic consultants who perform knee replacement**, returned **104 → 4 → 4 → 3** matches. After the conversation changed again to **Any insurer, closer to Bushey**, opening the earlier Timothy Waters card retained its original Bupa and SW5 preferences. [The hosted report](demo/.cache/explanation-live-verification.json) verifies valid evidence IDs, insurance caveats, an identical cached response and rejection of client-supplied criteria. Generation took **3.52 seconds** and the cached response **26 milliseconds** in this run; these are observed timings, not latency guarantees.

The expanded **107-test unit suite passed** after the premium interface update. Local browser QA verified **knee search in London → Bupa → SW5 → orthopaedics and knee replacement**, with **104 → 4 → 4 → 3** matches. A one-mile radius produced zero results; removing just that chip restored three while preserving all other preferences. An explanation started before a refinement remained attached to its original result snapshot in History. Actual OpenRouter explanations showed concise summaries, citations and material insurer qualifications.

The desktop layout and **390 × 844** mobile viewport were verified, including the compact header, cards and empty state; mobile content width was **375 pixels**, with no horizontal overflow. Mocked DOM interaction checks passed for initial search without paid generation, pending and failed refinements, retry, one visible shortlist, explanation deduplication/caching, original-snapshot History, error visibility on returning to the current search, and reset cancellation/stale-response guards. Muted text contrast was corrected, and reduced-motion styles are included.

The subsequent typography and animated-example update was checked at desktop and **390 × 844** mobile sizes. The three examples type and delete with a **3.4-second** reading pause; the overlay remains separate from the input value, hides during focus/typing and stops when leaving the landing page. Focused fake-clock checks cover reduced motion, preference changes, reset cancellation and duplicate-timer prevention. Browser checks confirmed a complete hip-replacement example fits on mobile, entered text remains untouched, there is no horizontal overflow, and the normal knee/London search still returns **104** matches without browser errors.

The animated landing page was verified after deployment, with no browser errors or warnings. Its screenshot is saved at `outputs/docmap-animated-search.jpg` in the task workspace.

Hosted browser QA also passed on the new interface: an orthopaedic knee-replacement search near SW5 with Bupa returned **three** matches, and **Closer to SW5** reordered Timothy Waters first. Clicking his explanation showed loading followed by a concise **AI-generated explanation**, visible insurer qualification and expandable full supporting evidence. The browser recorded no console errors or warnings. Verified screenshots are saved at `outputs/docmap-premium-landing.jpg` and `outputs/docmap-premium-results.jpg` in the task workspace. Previous hosted security checks confirmed that `/.env.local`, `/demo/server.cjs`, `/package.json` and `/api/diagnostics` returned **404**, an unlisted browser origin returned **403**, and a public source-evidence page returned **200**; those routing controls are unchanged in this interface update.

## Meeting demo guide

The homepage now presents one comparison below the search hero: a broad knee-pain request beside the same concern with a running goal. **What I’ve tried** adds previous physiotherapy while retaining that goal. Both sides show the actual first three results from prepared DocMap searches of the same consultant records; they do not reconstruct Spire’s search results. The context side explains the recorded interests behind each option and links to the supporting evidence and Spire profile. **Try your own search** focuses the real search field without submitting, replacing a draft or resetting a session.

The shareable `/for-healthcare-teams` presentation uses the same comparison to show how patient context can reveal relevant expertise within Spire’s consultant pool. Its collapsed Pilot approach proposes clinically reviewed relevance, understanding the choice, time to shortlist, enquiry or booking starts, and abandonment as measurements. These are prospective measures, not proven improvements; the presentation sends no search, AI or analytics requests. Patient search and DeepSeek configuration are unchanged.

Run `npm run verify:comparison` to reproduce the prepared order against the existing private cached corpus and local MiniLM model. The verifier requires those local caches, disables network access, runs actual BM25 and semantic retrieval, checks each displayed fact and source, and refuses a changed order rather than rewriting the fixture. On October 4 the three stages retained the same 433 eligible consultants from 4,031 records, with no procedure requirement or exclusion. Goal results were Acharya, El-Husseiny and Donnachie; previous physiotherapy reordered them to Ridgewell, Donnachie and Acharya. Neither previous physiotherapy nor those ranks establish that surgery is appropriate. `node demo/scripts/verify-comparison.cjs --write-public-data` deliberately refreshes the reviewed fixture; normal verification writes only `demo/.cache/comparison-verification.json`. No raw source corpus is included in the public fixture or deployment upload.

The 231-test suite passes and verifies independent comparison instances, actual prepared order, keyboard controls, source links, reduced motion, draft preservation, direct hospital navigation and no presentation API requests. Browser checks at 320px, 390px, 820px and 1265px found no horizontal overflow; context changes preserve the page scroll position and the exact position of the next section. Hidden sizing content is inert and excluded from accessibility. Drafts survive hospital navigation and the Try your own search action. Existing tests continue to cover symptoms without an assumed diagnosis, contextual procedures, change of topic, immediate input clearing, persistent profile content and asynchronous focus/scroll restoration. See [the interface implementation record](UI-REFINEMENT-PLAN.md) for the earlier interaction release.

## Remaining product limits

The October 2 latency update keeps DeepSeek and its independent source check, adds bounded speed-aware provider routing and content-free request timings, and immediately displays a cited profile summary while the personalised paragraph is prepared. Its build passed **162 tests**; hosted checks generated two validated explanations in **3.27–5.21 seconds**, with cached repeats in **29–66 ms**. See [AI latency measurements and limits](AI-LATENCY-NOTES.md) for the measured stages and why these are not a guaranteed speed improvement.

The subsequent [everyday patient-language update](PATIENT-LANGUAGE-NOTES.md) replaces the practical-filter examples with symptoms, an explicit condition/procedure, and a goal of returning to running. It invites people to share what they are experiencing and what matters to them. Retained patient context now enters both actual retrieval methods and source selection, with clinical-only indexes to avoid hobby-based matches. Earlier verification counts above describe their dated builds, not a guarantee of unchanged rankings after the new clinical index.

This is a presentation build with real search, data and a working Railway preview at the chosen hosting address. Conversations expire after two hours or a process restart, and only the ten most recent search snapshots support fresh reveal requests. The interface offers an explicit new-search action while leaving earlier results visible until it is chosen. There is no booking integration, account authentication or durable patient record. Source records were merged in February 2026, which does not establish that every external profile is current. Strict exclusions may omit valid aliases, and postcode/place-centre distance is approximate. Procedure evidence does not confirm current availability at a particular hospital. The insurer-evidence coverage is limited as described above.

These limits are disclosed rather than filled with invented details. The Supabase connection blocker is resolved.

### October 4 interaction release

The current release separates the result scroller from the composer, measures draft height in a hidden mirror, and anchors refreshed results to the first visible consultant. The original six-line typing reproduction moved the page by 371px; the same check now leaves both page and result scroll positions unchanged. Direct card opening presents the sourced Why section first and personalises it on demand; disclosure state and reading position persist independently.

The 223-test suite covers growing, shrinking and empty shortlists, chip-removal failure, drafts typed during pending requests, independent modal focus, background completion on the healthcare view, deep links, and profile Back/Forward without extra generation. Real-data checks retain the 93 → 4 → 4 London/Bupa/SW5 sequence and its distance reordering. Independent semantic retrieval admits candidates with zero BM25 score. A real DeepSeek explanation completed with About and Practice locations still expanded.

Browser layouts were inspected at desktop, 820px, 390px and 320px. The reduced-motion lifecycle is covered in tests. Physical iPhone/Safari keyboard behaviour remains a device-check limitation; the implementation uses visual-viewport sizing, safe-area padding and a 140px textarea cap. The existing AI interpretation fallback remains explicit when a model interpretation cannot be verified.
