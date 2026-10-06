# Hosted preview verification

Preview: [DocMap Expert Discovery](https://docmap-expert-discovery-production.up.railway.app/expert-discovery).

This is an independent Railway service. The patient demo was not redeployed or changed. The expert service uses a private evidence-cache volume, server-side credentials and a twenty-file runtime allowlist after the explanation-transport follow-up (nineteen in the earlier releases). Raw database exports, source-review samples, model caches, project notes and environment files are absent from the uploaded application directory.

## Release observations — 6 October 2026

Deployment `22a98893-1b58-4232-b807-39dc4b7d20fe` became ready at 17:58:46 UTC. It reused the prepared embeddings after a restart. Health reported corpus `expert-corpus-v1-fc67aacfcc3999fc230c`, 40,876 source rows, 22,271 indexed candidates and 273,108 indexed passages, with DeepSeek v3.2 configured. Counts are discovery coverage, not approved or available experts.

All three direct app routes, JavaScript, CSS, the font and logo returned HTTP 200 with a Content Security Policy. Requests for the environment file, raw source cache and patient chat API returned HTTP 404. The release directory's 19 file hashes matched the source being tested.

The first local Node health request timed out before any searches were sent. The public endpoint then returned HTTP 200 in 242 ms through curl. Using Node's IPv4-first DNS setting resolved the test-runner connection issue. This was recorded separately from application latency; no unsuccessful search was discarded.

### Twenty warm-index searches

The first complete, sequential run used twenty predefined fictional briefs, with the full hosted evidence index ready. It did not request explanations or replay cases until they passed.

| Measure | Observed |
| --- | ---: |
| Successful searches with results | 20 / 20 |
| Median end-to-end latency | 4,212 ms |
| 95th percentile (nearest rank) | 7,837 ms |
| Eight-second criterion for this run | Met |
| DeepSeek interpretation | 19 / 20 |
| Explicit deterministic interpretation fallback | 1 / 20 |

This is one small preview measurement, not a service-level guarantee. In the separate, longer demonstration-pathway check, initial searches took 9,041, 12,160 and 7,664 ms; some browser verification overlapped that check. Those observations are retained rather than hidden by the twenty-case result. Larger and concurrent workloads need further measurement.

### Workflow and explanation checks

Three fixed briefs retrieved the reviewed examples: Neghal Kandiyil and Sanjay Banypersad for cardiac CT; Paul Norris for dermoscopy and primary-care study evidence; Per Hall for skin imaging outside a specialist setting and a recorded relationship to review.

- Server-owned pagination retained the same snapshot and total.
- Comparison/explanation citations belonged to the selected candidates.
- Removing regulatory experience retained cardiac CT and marked saved decisions for review after the scope changed.
- Outreach drafting produced preparation text without a communication or recruitment event.
- Saving, JSON export/import and HTML pack generation retained the evidence snapshots and left qualification and independence at **Not reviewed**.
- In the hosted browser, saving Norris and Hall, comparing their evidence, copying the project backup, importing it and reloading preserved the saved evidence and draft under a new project identity. There were zero recorded recruitment events.

All three hosted explanation requests returned sourced fallback: 15,035 ms, 5,799 ms and 15,085 ms including network overhead. The shorter response was rejected before the deadline; a fallback alone does not reveal whether schema, ownership, prohibited-claim or independent-support validation rejected it. The longer responses are consistent with the shared 15-second deadline, but hosted metadata does not identify the precise upstream phase. **None is counted as a validated DeepSeek explanation.** Earlier model runs and their failures remain in [the model verification report](MODEL_VERIFICATION.md).

The browser download observer did not confirm receipt of a Blob-generated HTML download. The copied-JSON backup/import path is verified. Actual HTML packs were generated and validated from the same hosted snapshots; an example was saved separately for review. The browser file-download receipt remains a limitation, not a reported pass.

### Final interpretation correction

The live walkthrough revealed that a model could mislabel diagnostic-study evaluation as a professional role and turn parts of an assessment question into extra essential research credentials. The correction adds canonical research wording, preserves explicit preferred importance, rejects generic expertise as a role and keeps assessment questions separate from credential requirements. It retains supported non-doctor role phrases. Thirty focused regressions reproduce those failures.

Final code passes **419 tests: 403 expert tests and 16 evaluation-pack checks**. The unchanged patient suite previously passed 243 tests. The final deterministic retrieval replay passed 105/105 development and 228/228 held-out checks per retrieval mode, retaining 95.833% hybrid known-reference recall and 100% central-evidence precision. The earlier measurements above remain attributable to their original deployment.

### Final corrected deployment

Deployment `09022aa3-51e0-4b86-ad94-98309930e45d` reached Ready at **18:20:53 UTC**, with the same corrected corpus and cached embeddings. All eight served app/asset bodies matched their corresponding local release hashes. Direct routes, health and the three blocked-path checks passed again.

The same twenty fictional briefs were rerun once because the interpretation code had changed. **20/20 returned sourced results; median 6,848 ms and p95 7,937 ms.** The eight-second p95 criterion passed, but one request took 8,107 ms. Only five responses used DeepSeek interpretation; fifteen used the explicit deterministic fallback. Compared with the earlier run's nineteen model-backed interpretations, this shows substantial model-service variability. Do not present the latency target as proof that model-backed interpretation is consistently available.

Both observed interpretation failures were separately checked through the live DeepSeek path after correction. The homepage skin-imaging example returned in 5,489 ms and the longer study-evaluation brief in 6,410 ms. Each retained exactly one preferred **Diagnostic study evaluation** research requirement, with no generic clinical-expertise role or extra essential research credentials. Removing the research requirement preserved the clinical modality and primary-care setting. A corrected example HTML pack and JSON project were generated from the resulting hosted snapshot. These were interpretation checks, not additional explanation-generation attempts.

Hosted desktop and 390px project views were inspected. The copied-backup workflow remained intact, with no horizontal overflow in the 390px check. The detailed local 320px, tablet, keyboard and reduced-motion checks remain distinct from a physical mobile-device test.

## Remaining release criteria

- Three distinct, independently validated DeepSeek explanations have **not** been achieved; only one earlier public-only brief passed. Generation remains optional, deliberate and bounded, with explicit retry and sourced fallback.
- The earlier Friendli diagnostic restriction was resolved by explicit user authorization. The expert explanation/checking route now uses Friendli through OpenRouter, with provider fallback disabled and the existing privacy/price filters retained. The brief interpreter and patient service keep their existing configuration. Authorization is not a comprehensive provider privacy audit.
- Responsive layouts, keyboard behavior, stable drafts and reduced-motion CSS were checked locally. Browser viewport checks are not physical-device keyboard testing. No clinical superiority, approval, availability, independence or time-saving claim follows from these checks.

Runtime source and evidence are versioned; historical reports are preserved in the ignored private evaluation cache. See the [release audit](RELEASE_AUDIT.md), [data evaluation](DATA_AND_EVALUATION.md), [demonstration guide](DEMO_GUIDE.md) and [enrichment backlog](ENRICHMENT_BACKLOG.md) for scope and limitations.

## Explanation follow-up deployment

Deployment **`770eecc0-ab88-48d5-8802-f1650e12af2e`** reached Ready at **19:23:22 UTC**, subsequently reporting SUCCESS. It serves the same `expert-corpus-v1-fc67aacfcc3999fc230c` corpus. The staged twenty runtime files total 1,252,372 bytes; they include the new private stream adapter and exclude evaluation material and credentials. The expert-only variable `EXPERT_OPENROUTER_PROVIDER=friendli` was set without redeploying any other service, then applied with this deployment.

The read-only hosted smoke check passed **11/11**: three direct routes, five public assets matching local hashes, and three denied paths. Health reported ready, the same 22,271 indexed candidates/273,108 passages, and configured DeepSeek v3.2. Source, ranking, brief interpretation and frontend code were unchanged, so the earlier twenty-case search percentile is retained as its original measurement rather than rerun or relabelled.

One new hosted workflow run used the three fixed fictional demonstration briefs with the full professional index and server-owned candidate evidence:

| Brief | Search | Interpretation | Explanation | Outcome |
| --- | ---: | --- | ---: | --- |
| Cardiac comparison | 6,056 ms | DeepSeek | 7,614 ms | Sourced fallback; support-validation rejected claims |
| Dermoscopy / study evidence | 8,203 ms | Explicit deterministic fallback | 4,218 ms | Sourced fallback; support-validation rejected claims |
| Outside specialist setting / relationship | 5,783 ms | DeepSeek | 8,250 ms | Sourced fallback; support-validation rejected claims |

All three completed owned-citation, JSON roundtrip and HTML-pack checks. The cardiac workflow additionally verified active requirement removal, stale saved-review marking and an outreach draft without creating a recruitment event. The application exposed only bounded failure stage/reason metadata, not rejected prose or raw checker messages. These hosted rejections therefore cannot be independently classified as true or false positives from the public response alone.

**Hosted validated AI explanations: 0/3.** These are safe fallbacks, not successful personalised model explanations. The final public-only run separately passed the cardiac brief in 6,340 ms; it does not override the hosted outcome. The three-brief AI reliability criterion remains unmet. No same-run retries or additional prompt tuning followed this acceptance round. All **476 expert/evaluation tests and 243 patient regressions** pass; model-service behavior remains a distinct limitation. Full diagnostic history is in [Friendli verification](FRIENDLI_VERIFICATION.md).

## Discovery-first corrections — final release, 6 October 2026

This later release implements the agreed discovery-first scope. Optional AI explanations are explicitly experimental and deferred; the historical generation results above are not relabelled as successes.

Deployment **`bbf241c0-d7ad-40ee-97e2-9cf0f084075e`** reached Ready at **21:33:08 UTC** and reported SUCCESS. It serves the unchanged `expert-corpus-v1-fc67aacfcc3999fc230c` corpus through the separate expert service. Only the twenty allowlisted runtime files (1,287,572 bytes) were staged. Patient deployment, source database, credentials, private evaluation cache and project notes were not changed or published.

Runtime fingerprints:

| File | SHA-256 |
| --- | --- |
| `expert/brief.cjs` | `b6b0b0271fd7a7c2e715175ec72c5ddd199875547bded7263eb79cb38889f026` |
| `expert/search.cjs` | `802749d5a0aec1f340cb79acf21278f33a884a0ce22e99b61b9551b644255368` |

The final hosted workflow round completed at **21:35:11 UTC**: **38/38 checks across nine requests passed**. It verifies cardiac CT reporting and adult evidence, strict eligibility, removal/readdition, fresh-assessment isolation, preferred research, GP-only restrictions, negative roles, later role replacement, clearing role restrictions, clarification, and evidence-preserving JSON/HTML preparation. The model-backed duplicate question is now one canonical criterion. No optional AI generation requests were made.

The separate fixed twenty-search run completed at **21:36:39 UTC**, with no concurrent hosted browser searches:

| Measure | Final observed result |
| --- | ---: |
| Successful searches with sourced results | 20 / 20 |
| Median | 3,094 ms |
| 95th percentile, nearest rank | 5,139 ms |
| Eight-second target | Met |
| DeepSeek-backed interpretation responses, including cache hits | 20 / 20 |
| Routes, release asset hashes, CSP and blocked paths | 11 / 11 |

This follows a preserved failed timing run on deployment `53f8d84e-dc31-4fd0-8b05-6b41cd93102e`: median 7,338 ms, p95 11,153 ms. A bounded, source-invalidated passage-analysis cache removes repeated classification work. Model responsiveness also improved in the later observation (eight versus twenty model-backed interpretation responses), so these timings are not a controlled measure of caching alone. No interpretation timeout or model configuration was loosened to meet the target.

All **624 expert/evaluation and 243 patient tests pass**. The full deterministic retrieval replay retained 105 development and 228 held-out checks per mode, with 95.833% hybrid known-reference recall at twenty. Source coverage is unchanged; these results do not imply that all indexed professionals were independently source-checked. Detailed corrections, browser observations, unsuccessful attempts and cache equivalence are recorded in [Discovery QA corrections](DISCOVERY_QA_FIXES.md).

## UI audit corrections — 7 October 2026

Deployment **`81dcf40a-3999-4e77-9323-a91d87f36dce`** reached Ready at **23:46:09 UTC on 6 October** (7 October in London) and SUCCESS at 23:46:37 UTC. The expert service alone was deployed. The explicit runtime allowlist contains **23 files / 1,339,101 bytes**, with no raw database export, project notes, credentials or evaluation cache. It adds the shared evidence presenter, saved-brief validator and exact-source-page renderer. Patient API contracts, application assets and deployment are unchanged.

The corpus is **`expert-corpus-v1-19dcca60f6fbf2fec923`**: 40,876 raw rows, 40,221 identity groups, 22,275 identity-supported candidates, 17,946 groups held for identity review, 22,271 indexed candidates and 273,093 passages. Four candidates have the separately reviewed external-source enrichment. A bounded correction prevents an interest predicate such as “My primary interests involves…” from being promoted to performed clinical activity. The original records were not rewritten; corpus-version invalidation rebuilt the derived index and preserved the original evidence.

| Hosted acceptance | Observed result |
| --- | --- |
| Health, direct routes, asset release hashes/CSP and blocked paths | **12/12 passed**; health ready with the evaluated corpus |
| Audit-specific workflow | **36/36 passed**, nine requests; completed 23:49:24 UTC |
| Existing discovery regression journey | **38/38 passed**, nine requests; completed 23:50:40 UTC |
| Separate twenty-search observation | **20/20 sourced results**, completed 23:48:15 UTC |
| Median / p95, nearest rank | **3,061 / 7,268 ms**; eight-second p95 target passed |
| Slowest observed request | **8,848 ms**; retained in the report |
| Interpretation during timing sample | **17 DeepSeek / 3 explicit fallback**, including cache hits |

The audit workflow checks “Research should be optional,” UK removal including retained contextual text, primary-care aliases, research priorities, exact saved-brief resume and retry, candidate-owned citations, strongest task-specific reporting excerpts, essential gaps and source-preserving HTML/JSON preparation. Its nine responses comprised three model interpretations, four interpretation fallbacks, one saved-brief retrieval and one deterministic priority patch. The broader regression journey covers strict eligibility, removal/readdition, GP-only restrictions, excluded roles, role replacement, clarification and export consistency. It returned three model interpretations, five deterministic responses and one clarification without an interpretation mode. Successful fallback handling is not counted as model success. Optional AI generation was not requested in these acceptance runs and remains experimental.

All **728 expert/evaluation tests and 243 patient regressions passed**. A final presentation-only label deduplication then passed its focused **114-test** replay. The 42-brief frozen retrieval replay passed **105 development and 228 held-out assertions per method** across actual BM25, semantic and hybrid retrieval. Held-out known-candidate recall@20 was **100% hybrid**, **95.833% BM25** and **95.833% semantic**. First-five central-evidence precision was 100% for the evaluated answerable cases. This reuses the existing reviewed sample; it is not an independent new evaluation or exhaustive corpus-recall claim. The local audit workflow separately passed 36/36 checks.

The final hosted Chromium walkthrough used a new fictional assessment. Research remained preferred after “Research should be optional”; removing UK removed the active location while preserving a newly typed multiline draft. Saving Ahmed, saving a fictional note, reloading the project and selecting **Resume discovery** restored the note, active brief, sourced results and unsent draft. The selected source URL opened the reporting quotation first with missing date/original-page limitations visible. The final desktop viewport measured 1280×720 CSS pixels. Local 768px, 390px and 320px checks, profile Back/Forward focus restoration and interrupted-request recovery are separately recorded in [UI audit corrections](UI_AUDIT_FIXES.md). Temporary viewport overrides were reset. These are Chromium/viewport checks, not Safari, screen-reader, physical touch-device or native mobile-keyboard certification.

Historical explanation failures and earlier timing samples above are preserved, not superseded as successful observations. The current [demonstration guide](DEMO_GUIDE.md) explains the resumed-discovery and saved-work controls.
