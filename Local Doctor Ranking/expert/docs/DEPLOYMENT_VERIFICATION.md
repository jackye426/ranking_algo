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
