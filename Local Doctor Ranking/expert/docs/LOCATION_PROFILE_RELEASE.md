# Location controls, interpretation recovery and useful professional profiles

Release: **8 October 2026**. Expert Discovery only. The patient application, original database records, embedding model and DeepSeek configuration are unchanged.

## Search and interface contracts

- **Expertise is sufficient to start.** Location is optional and defaults to **Anywhere**. A separate location input accepts UK-wide, a resolvable UK city/town, a full postcode or a postcode district. A point location uses a visible **25-mile** default, with **10 / 25 / 50 miles** available. UK-wide has no radius.
- **Location restricts results.** Candidates must have a recorded UK practice for UK-wide, or a usable recorded practice within the selected radius. The nearest qualifying practice and approximate straight-line distance are shown. Expertise relevance ordering is preserved; proximity does not replace clinical relevance.
- **Controls and conversation share one filter.** An explicitly edited location field wins over conflicting sentence geography, with a notice. Otherwise, recognised geographic wording updates the control. Removing location and adding clinical criteria in the same follow-up applies both instructions. A location-led sentence does not bypass clinical interpretation; “within 2 weeks” remains timing.
- **Clinical language stays clinical.** “Specialist in Endometriosis”, “experience in Brachytherapy”, and “tumours near the brainstem” do not become location queries. Unfamiliar place names use the dedicated field or explicit location wording. An unsent location edit survives unrelated criterion changes and retries, as well as edits made while a request is pending.
- **Errors preserve the accepted search.** An ambiguous, unsupported or temporarily unavailable location produces an actionable error, not an ignored restriction or a misleading empty shortlist. Earlier results and accepted criteria remain available. Failed operations support Retry, editing and an explicit Search anywhere action. Newer drafts are preserved.
- **Unfamiliar expertise survives interpretation failure.** For “I need a specialist who has experience with radioactive brain implants”, the quoted expertise remains a removable positive activity criterion for BM25 and semantic retrieval, with or without UK. It does not become generic engagement context. This is faithful phrase retention, not inferred experience or an invented synonym.
- **Unresolved instructions stop the update.** Ambiguous removals, priority changes, negative expertise or unresolved must-haves return `interpretationIncomplete`, specific `unresolvedInstructions` and retry support. The API returns HTTP 422 without committing a partial brief or rerunning the old search as though the instruction succeeded. Recovery is deliberately bounded; it does not claim to interpret every free-form request offline.

Cards use aligned **View profile**, Save and Compare actions. When a direct match is unestablished, they show concise sourced background instead of repeating only a generic warning. The requested experience remains explicitly unconfirmed.

## API, provenance and persistence

- `POST /api/expert/location` accepts `{query, radiusMiles?}` and returns resolution status and a server-resolved location. Statuses distinguish resolved, ambiguous, not found and unavailable. Clients cannot supply coordinates as search authority.
- `POST /api/expert/search` accepts optional `locationFilter: null | {query, radiusMiles?}`, including location-only updates. The accepted brief contains the resolved filter separately from clinical requirements; `locationStats` reports exclusions. Filtering precedes pagination, so focused and directory views share the same restricted snapshot.
- `POST /api/expert/profile` accepts `{sessionId, searchId, candidateId, corpusVersion}`. It requires snapshot membership and matching evidence versions. It returns a bounded projection of the candidate's owned corpus passages, independently of the few passages selected for search. No model request is needed to read the profile.
- Profiles expose About, clinical interests, recorded procedures, research, qualifications and deduplicated practice locations. Source passages, evidence types, qualifications, limitations and dates remain attached. Unknown source dates stay unknown; integration dates do not establish current practice. Unattributable, quarantined, personal and administrative material is excluded from this projection.
- Profile caches are candidate/corpus scoped and invalidate on corpus change. Saved candidates retain the accepted brief and evidence version. If full background has been loaded when saved, that background is included; otherwise the backup/export explicitly identifies the limited saved background. Saved views never silently substitute newer records.
- Location drafts, accepted scope and recoverable failed operations remain browser-local. Backup/import validates profile ownership and corpus attribution. HTML review packs separate professional background from evidence for the search. Legacy UK briefs migrate to the explicit geographic filter when resumed; qualification and recruitment decisions remain user-controlled.

## Geographic preparation and limitations

Valid source coordinates and their provenance are retained. Missing UK practice coordinates are prepared from recorded postcodes through **postcodes.io**, using shared lookups, bounded concurrency and bulk full-postcode requests. Preparation occurs outside interactive retrieval. Successful postcode and named-place lookups use a separate durable expert cache; transient failures have a short retry window. Only place names/postcodes are sent to the geocoder, not expertise briefs, profiles or project notes.

Five existing city-centre anchors are retained; other named places require an exact, unambiguous mapped match. Ambiguous names such as Newport need a county or postcode. International locations are not supported. A radius is measured from the stated city/place/postcode centre, not a driving route or exact address. Recorded practices do not establish residence, current practice, availability or willingness to travel. Candidates with unusable locations are excluded only when a geographic restriction requires that evidence, and the UI discloses the excluded count.

Local and hosted preparation for corpus `expert-corpus-v1-003234ea2e49a2446f3f` returned the same coverage:

| Measure | Count |
| --- | ---: |
| Identity-supported candidates examined | 22,275 |
| Candidates with a recorded UK location | 20,109 |
| Candidates with usable UK coordinates | 20,057 |
| Recorded practice entries examined | 70,219 |
| Practice entries retaining source coordinates | 11,192 |
| Practice entries geocoded | 48,371 |
| UK practice entries still missing coordinates | 389 |
| Postcode lookups that failed during preparation | 92 |

These measures mix candidate, practice-entry and lookup denominators as labelled; they must not be added together. They are coverage measures, not verified-current-practice counts or approved-expert counts. No database rewrite was performed. Geographic caches, source exports and credentials are not public deployment assets.

## Verification and demonstration

**Local results:** 952 expert regression tests passed; 243 patient regression tests passed. The local real-data location/profile journey passed **20 checks**. The extended hosted journey passed **22 checks**, including unfamiliar-expertise recovery, UK/radius restriction, Herbert's and Hyam's fuller profiles, ownership, exact source links, backup/import, review-pack content and failure preservation. This is regression and integration verification, not a new independent relevance benchmark.

Run from `Local Doctor Ranking/`:

```powershell
npm run test:expert
npm test
node expert/evaluation/verify-location-profile.cjs http://127.0.0.1:3200 local
```

The last command requires a running, prepared expert service. It uses its configured interpreter and writes an ignored report under `expert/.cache/`; use a separate report tag for hosted verification. Endpoint timings in that small journey are not a twenty-search p95 benchmark.

Demonstration:

1. Search **“I need a specialist who has experience with radioactive brain implants”** with location blank. Confirm the specific expertise remains visible and results appear without requiring UK.
2. Set location to **UK**. Open Christopher Herbert when returned. Review the biography, recorded radiotherapy training, procedures and research alongside the explicit absence of established implant-specific evidence. Open an exact source citation.
3. Start **“Cardiologists with radiology interests”**, location **London**, radius **25 miles**; then select **10 miles**. All shown qualifying practices must satisfy the selected range.
4. Refine with **“Remove the location filter. Research is helpful.”** Confirm geography clears and research becomes a preference while earlier expertise remains.
5. Enter **Newport**, then an unsupported location such as **US**. Confirm an actionable error preserves the accepted shortlist. Edit the location or choose Anywhere deliberately.
6. Open a profile before saving it, download the review pack and project backup, then import the backup. Confirm location scope, background, source links and saved evidence versions remain intact.

## Hosted release verification

Target preview: [DocMap Expert Discovery](https://docmap-expert-discovery-production.up.railway.app/expert-discovery).

- Railway deployment **`f3dedf23-32fb-4a76-8f57-23768073a027`** reported **SUCCESS**, and the expert health endpoint reported ready. A temporary 502 occurred during replacement/index startup; it recovered before final verification. This is not a zero-downtime deployment claim.
- **12/12 hosted asset, direct-route and isolation checks passed**, including matching release hashes, security headers, and 404 responses for private cache/environment paths and patient APIs.
- **22/22 real-data integration checks passed**, including Herbert and Hyam, geography restrictions and clearing, ambiguous/unsupported places, profile ownership, frozen background export/import and exact source links. Hosted geographic coverage matched the table above.
- **20/20 warm searches succeeded. Median 5,320 ms; p95 8,506 ms. The earlier eight-second p95 target was not met.** Two interpretation calls used deterministic fallback; the slowest response was 9,008 ms. These observations include model interpretation and retrieval, not optional AI summaries. The focused integration journey measured profile responses at 33–38 ms and location-only updates at 1,035–2,263 ms; those small samples are not percentile claims.
- Hosted Chromium checks covered desktop, 768px tablet, 390px and 320px layouts: no document overflow, aligned card actions, visible location/radius controls, independent profile sections, Escape/focus restoration, UK clarification from location alone, retained expertise and a newer multiline draft during a location-only refinement. Saving a loaded biography and reloading preserved that background in the saved profile.
- Reduced-motion behaviour passed automated interaction tests and hosted stylesheet inspection. The browser was not running an OS reduced-motion preference during visual checks. Safari, physical mobile keyboards and screen-reader testing were not performed. Local visual access was blocked by the browser connection, so visual verification used the hosted preview.
- Reproducible observations are in the ignored local files `expert/.cache/location-profile-hosted-v3.json` and `expert/.cache/hosted-verification-location-profile-v3.json`. They contain the individual checks/timings. Screenshots are committed below. The implementation belongs on `codex/docmap-expert-discovery`; a separate pre-existing local discovery-adapter commit was preserved outside this release rather than publishing unrelated patient changes.

Remaining limitations are source coverage, UK-only resolution, unknown evidence dates/current-practice status, and the measured latency target miss. No exact radioactive-implant expertise is claimed for these indirect matches. No clinical relevance benchmark or AI-summary reliability improvement is claimed by this release.

## Visual evidence

- [Before: indirect-match cards](screenshots/indirect-match-before.jpg)
- [After: indirect-match cards](screenshots/indirect-match-after.jpg)
- [After: separate expertise and location](screenshots/location-home-after.jpg)
- [After: sourced professional profile](screenshots/profile-after.jpg)
