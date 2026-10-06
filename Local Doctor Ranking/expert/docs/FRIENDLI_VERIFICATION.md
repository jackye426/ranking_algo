# Friendli-only DeepSeek verification

Updated 6 October 2026. The user explicitly authorised this bounded Friendli diagnostic using selected public professional excerpts and fictional assessment briefs. It uses **DeepSeek v3.2 through OpenRouter**, with Friendli as the only allowed provider and fallbacks disabled. No private assessment dossier, user notes, contacts or full Supabase cache is sent. Authorisation for this diagnostic is not evidence of a comprehensive provider data-handling audit.

**Latest hosted outcome: 0/3 accepted AI explanations; the final local fixture round remains 1/3.** All hosted attempts returned sourced fallbacks after support rejection, in 4.218–8.250 seconds. The hosted report does not expose rejected drafts or checker text, so those failures cannot be labelled false positives. The local cardiac answer passed in 6.340 seconds and was independently reviewed against its citations. The three-brief reliability criterion remains **unmet**. All earlier outcomes below are preserved separately.

## Initial round: generation completed, explanations rejected

The immutable `expert/.cache/model-friendli-verification.json` records three distinct briefs at 18:57 UTC. All three generation calls returned complete JSON with `finish_reason: stop` within the shared 15-second budget. **0/3 produced a validated explanation, and no independent support checker was reached.** Sourced fallbacks were returned instead of unverified prose.

| Brief | Request characters | Headers | First content | Generation | End to end | Input / output tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cardiac clinical comparison | 7,059 | 4,195 ms | 4,198 ms | 7,449 ms | 7,455 ms | 1,379 / 261 |
| Dermoscopy study evidence | 6,036 | 2,811 ms | 2,812 ms | 5,412 ms | 5,414 ms | 1,179 / 192 |
| Outside-specialist setting and relationship | 5,713 | 4,892 ms | 4,892 ms | 9,453 ms | 9,455 ms | 1,103 / 235 |

Actual provider was Friendli in all three responses. Reported generation cost was **$0.0027025** in total. Reasoning-token counts were zero. The bounded corpus is `expert-corpus-v1-b069c9a4afcfb76a2202`, containing the selected public evidence, not the complete professional index. The AI code hash was `776f983148141c819ec4586eff3acbf3ae1399f8b2c8f545f628ef9c24c490e8`.

All outputs placed request-local evidence aliases inside prose as well as the structured citation array. The existing validator rejected that leakage. The two cardiac sections were 415/378 characters and 57/51 words; Norris was 534 characters and 74 words. Hall was **833 characters and 116 words**, also exceeding the existing 650-character/90-word limit. The failure therefore was not a generation timeout. The generic fallback notice did not distinguish these validation causes.

The rejected drafts also reveal substantive concerns that formatting cleanup alone must not approve: the cardiac answer presents optional device-assessment experience as an essential gap, and Hall's answer treats an advisory relationship as positive relevance to the device. Neither draft passed independent support review or appeared as validated AI wording. Their source facts and dates must remain bounded in the follow-up.

## Narrow corrective change

The follow-up retains strict structured output, per-candidate evidence ownership, maximum response length, the independent source-support check and **one shared 15-second deadline**. It introduces no automatic retries and does not display partial model text.

- Remove only standalone citation-only bracket groups when every alias is both owned by that candidate and already declared in its citation array. Unknown, undeclared, cross-candidate, nested or prose-embedded aliases remain invalid. This cleanup removes redundant formatting, never unsupported statements.
- Request one short paragraph per candidate, with one distinctive source fact, cautious relevance and one material essential unknown. Retain explicit instructions distinguishing preferred requirements from essential gaps and relationships from evidence of suitability.
- Buffer streaming internally so timings and the complete response can be collected; show wording only after local validation and independent support review.
- Record distinct failure reasons so format, incomplete response, unsupported content and timing failures are not all diagnosed as latency.

These changes respond to observed failures. They do not establish success until the separate follow-up report completes and its final answers are reviewed against the cited source facts.

## Format round: transport footer rejected

The subsequent immutable `model-friendli-format-verification.json` round at 19:04 UTC also returned **0/3 verified explanations**. Each stream reported Friendli, token usage and a `stop` finish, but the new buffered adapter rejected the response before JSON validation or support checking. The first-content times were 687/498/335 ms; generation/transport durations were 3,371/4,831/3,544 ms, and end-to-end fallback times were 3,374/4,843/3,545 ms. These were not deadline failures. The recorded generation cost was $0.0025915.

A separate **one-call synthetic** protocol probe at 19:06 UTC (`friendli-protocol.json`) captured the cause: after its terminal `stop` choice, the stream emitted a usage footer repeating the same empty terminal choice. The strict adapter treated any repeated terminal choice as invalid. The diagnostic cost was $0.0000145 and sent no professional records.

The correction accepts only this metadata-only, identical-terminal repetition with usage. New content, a conflicting finish, refusal, unexpected choice index or other malformed continuation still fails. The prompt, evidence, ownership checks, support checker and shared deadline are unchanged from the format round. This is protocol compatibility, not acceptance of an incomplete model answer.

## Protocol-corrected round: support decisions reached, 0/3 accepted

The separate `model-friendli-protocol-fix-verification.json` report completed at 19:07:44 UTC. All three generation calls and all three support-check calls completed before the shared deadline. **0/3 explanations were accepted** because each checker returned a nonempty unsupported-claims list. The actual final answers were sourced fallbacks; the generated drafts below were not displayed as validated AI wording.

| Brief | Generation headers / first content | Generation | Checker headers / first content | Checker | End to end | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cardiac comparison | 2,987 / 2,989 ms | 8,198 ms | 2,842 / 2,843 ms | 4,753 ms | 12,962 ms | Support rejection |
| Dermoscopy study | 4,204 / 4,204 ms | 5,856 ms | 2,779 / 2,779 ms | 5,507 ms | 11,365 ms | Support rejection |
| Outside-specialist setting | 5,264 / 5,264 ms | 7,225 ms | 1,420 / 1,421 ms | 3,794 ms | 11,023 ms | Support rejection |

All six calls report Friendli and `finish_reason: stop`, with zero reasoning tokens. Total recorded cost was **$0.0037525**. The AI code hash remained `3e60ef2e38d2f7d178175c1b9288654534d54ddae914e40841bbcb4bd3c9788e`; the corrected transport hash was `0ae6ebe5bc2a580192aae348700449685930e3f8bffe84d41cc12ee396d635e8`. This round establishes that generation plus checking can complete within the deadline for these inputs at this observation time. It does not meet the three-accepted-explanation criterion.

## Independent review of the protocol-corrected drafts

The evaluator read every generated paragraph, its declared citations, source facts and limitations, and the checker's objections. This is a review of the selected public-source fixtures, not a clinical assessment or a new regulator check. It does not override the pipeline's rejection.

**Cardiac comparison — checker false positives.** Kandiyil's cited [PHIN evidence](https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157) explicitly records cardiac coronary CT and vascular-radiology research/trial involvement. The draft's cautious statement that this research may provide a perspective does not assert assessor competence. Banypersad's cited [hospital biography](https://www.circlehealthgroup.co.uk/consultants/sanjay-banypersad) explicitly documents cardiac CT and MRI practice; the checker's assertion that this cannot establish CT imaging expertise conflicts with the supplied source. The draft separately leaves coronary-disease experience and current UK practice unconfirmed. The reviewer found these two rejection reasons overly restrictive, while retaining the failed pipeline outcome.

**Norris — attribution and scope need improvement, with checker overreach too.** The draft mentions historical coauthorship and potential relevance to evaluating evidence, but declares the dermoscopy passage and study-context passage rather than the distinct named-coauthor passage. Coauthorship is a real recorded fact; the citation association should nevertheless be precise. The [publication is a 2010 trial protocol](https://link.springer.com/article/10.1186/1471-2296-11-36), whereas the draft says a historical trial, omits the date, and does not explicitly distinguish coauthorship from individual diagnostic-study appraisal competence. Those are useful correction targets. The checker's additional entry says that current-practice uncertainty is **not** an unsupported claim, yet still includes it in the rejection list. That is a checker output defect, not evidence against the source. The optional regulatory gap is also unnecessary emphasis.

**Hall — one valid citation rejection and one false positive.** The paragraph cautiously relates recorded skin-imaging research to the proposed non-specialist workflow and leaves current practice/community-device experience unknown. This follows the [Spire source](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/) without claiming qualification. The checker wrongly objects to the current-practice unknown: an undated clinical biography does not establish currency for this engagement. However, the overall summary introduces a clinical advisory role without declaring the separate relationship passage among its citations. The role is genuinely in the source set but not in the evidence the checker was given. That is a real citation-coverage failure. The earlier draft's positive use of the relationship as a suitability argument is absent from this paragraph.

## Interpretation after the protocol round

Timing, transport compatibility and output acceptance have been separated. The latest failures arise after successful generation and checking, with a mixture of real citation/scope problems and overly restrictive or malformed checker findings. Do not bypass support checks, silently ignore their entries or declare success from fast completion alone. Any further change needs a specific, general rule for supported cautious relevance, current-practice unknowns and complete citation coverage, including the summary. Preserve the three failed rounds and record any later validation separately. The AI reliability criterion remains unmet at this update.

## Synthetic checker calibration

At 19:14 UTC, one separately recorded call evaluated **eight entirely fictional cases in one batch**. `checker-calibration.json` reports **8/8 expected decisions**: all three supported cases accepted and all five unsafe cases rejected. The evaluator inspected the fixture, request construction and returned reasons; only `modelCases` entered the request. Expected labels and scoring explanations were kept out of the payload.

| Case category | Expected decision | Observed decision |
| --- | --- | --- |
| Explicit clinical activity with cautious relevance | Accept | Accept |
| Undated clinical interest with current practice left unknown | Accept | Accept |
| Dated protocol coauthorship with contribution limits | Accept | Accept |
| Coauthorship promoted to study-appraisal competence | Reject | Reject |
| Undated practice presented as current | Reject | Reject |
| Another candidate's citation used as evidence | Reject | Reject |
| Advisory relationship presented as positive qualification | Reject | Reject |
| Preferred requirement promoted to essential | Reject | Reject |

Friendli returned headers at 1,234 ms and first content at 1,237 ms; the model call completed at 9,020 ms and the measured operation at **9,023 ms**. It used 3,295 input and 497 output tokens, zero reasoning tokens, and cost **$0.002393**. Fixture hash: `098557da7989fd33a765b415a4f0e9e590bcc180a55f6d8de6697144ac671c25`. Checker-prompt hash: `2d717e31f83695d248ce0f7cf50f7688f4d11254d58064cfb6f53fcd9166edef`.

This is a targeted development calibration after observed failures. It is neither an independent clinical holdout nor a production accuracy rate. All eight cases share one request; the single latency observation is not eight timing measurements. Cross-candidate citations should already be blocked deterministically before the checker, so that case tests an additional safeguard rather than a normal production input. The eight-case pass does **not** clear the three-real-brief acceptance criterion.

## Structured-response round: faster, still 0/3

The change separates the model's sourced fact and cautious relevance from the application's neutral summary and essential-unknown wording. `model-friendli-structured-verification.json` completed at 19:15:58 UTC with **0/3 accepted explanations**. The facts and concise relevance statements were generated quickly, but two checker outputs were truncated at their 180-token ceiling and the third rejected cautious relevance. None timed out at the shared 15-second deadline.

| Brief | Generation | Checker | End to end | Checker finish / outcome |
| --- | ---: | ---: | ---: | --- |
| Cardiac comparison | 2,565 ms | 3,071 ms | 5,646 ms | `length`; incomplete verdict rejected |
| Dermoscopy study | 1,412 ms | 2,445 ms | 3,859 ms | `length`; incomplete verdict rejected |
| Outside-specialist setting | 986 ms | 2,583 ms | 3,573 ms | `stop`; support rejection |

All six calls report Friendli. Total cost was **$0.004356**, with zero reasoning tokens. AI hash: `7972bac4891a8f8b9f5002fa0d880ae3a14920f13920ef61bba7d963b93b3e5f`; transport hash remained `0ae6ebe5bc2a580192aae348700449685930e3f8bffe84d41cc12ee396d635e8`. Generation returned complete structured fact/relevance fields and owned citations. The final returned answers were sourced fallbacks.

The evaluator independently checked all generated facts and cited passages. The cardiac facts stay within documented CT/MRI work and vascular-radiology research; Norris cites the dermoscopy fact without asserting protocol coauthorship or appraisal competence; Hall cites the skin-imaging/AI research passage without introducing an advisory-role claim. The narrower Norris answer omits available historical study evidence, which is a usefulness limitation rather than an invented credential.

There is no complete checker verdict for cardiac or Norris; a `length` finish cannot be treated as an implicit rejection or an approval of the content. Hall's completed checker objects that the research may inform discussion of non-specialist software assessment. The supplied source explicitly concerns dermoscopy, computer imaging, telemedicine and AI, including helping non-specialists assess lesions. The reviewer therefore regards this as another overly restrictive objection to cautious topic relevance, rather than an unsupported assertion of device-specific competence. The pipeline rejection remains unchanged.

The synthetic 8/8 calibration did not generalise to these real-source inputs. A narrow factual topic comparison may be easier to verify than language projecting a person's ability to contribute; a complete checker response also needs an adequate output-token ceiling within the same time budget. Neither observation permits bypassing the checker, altering frozen fixtures or claiming that this round passed. The reliability criterion remains unmet.

## Final local overlap round: 1/3 accepted

`model-friendli-overlap-verification.json` completed at 19:19:45 UTC. The generation prompt now describes recorded-topic overlap with the brief instead of predicting a person's ability to contribute. The checker output ceiling increased from 180 to 360 tokens after the observed truncations; its calibrated rules, source facts, fixed briefs and shared **15-second deadline** were unchanged. No support-check entries are bypassed and no automated fallback to another provider is enabled.

| Brief | Generation | Checker | End to end | Actual final outcome |
| --- | ---: | ---: | ---: | --- |
| Cardiac comparison | 3,479 ms | 2,851 ms | **6,340 ms** | DeepSeek answer; schema, ownership and support check passed |
| Dermoscopy study | 4,568 ms | 8,500 ms | **13,075 ms** | Sourced fallback; completed checker rejected |
| Outside-specialist setting | 5,302 ms | Not reached | **5,303 ms** | Sourced fallback; generation request returned HTTP 429 before content |

The four completed calls report Friendli and `stop`, with zero reasoning tokens and total reported cost **$0.0027225**. The failed 429 request reports neither actual provider nor usage; its cost is not established by the artifact. The request was constrained to Friendli, but the report does not locate the rate-limit response within the gateway/provider path.

AI hash: `cf7e097dc9af28d44fd06c893ccb4c3f94e97b5ad0be4567b980ebabbe48a5af`; transport hash: `4b68da526af3a945450df9cfc49324f831fe055fdd6fdbdc5a5278b1e84ad51e`. The report's overall `passed` value is false. The earlier 0/3 reports and the synthetic calibration remain untouched.

### Independent final-answer review

**Cardiac — accepted and source-supported.** The final text attributes coronary CT experience to Kandiyil's PHIN evidence and CT/MRI practice plus service development to Banypersad's hospital evidence. Each section cites the correct candidate-owned passage. Their recorded CT work overlaps with the brief's explicit CT modality. The server's request to confirm coronary-disease relevance is a qualification question, not an assertion of a clinical diagnosis or competence. The response invents no current practice, availability, regulatory approval, volume or independence claim. Its neutral summary introduces no new fact. The checker returned an empty violations list, local validation passed, and the evaluator independently agrees with this source-support outcome. The wording is deliberately modest and does not establish who is clinically superior.

**Norris — sourced fallback retained despite a false-positive objection.** The generated fact cites the recorded use of dermoscopy in skin-cancer diagnosis. The supplied brief explicitly asks about skin-lesion imaging **using dermoscopy**, so the topic-overlap statement follows from source plus brief; it does not invent device-specific competence. The checker additionally treats the server's request to confirm primary-care experience as though it claimed to be a fact from the biography. It is an explicit request about a gap, not source evidence. The evaluator regards both objections as false positives under the intended rubric. The system nevertheless rejected the draft and returned the sourced fallback; this case is not counted as passed.

**Hall — no model answer to assess.** The request failed before headers/content were recorded. There is no generated draft or support verdict, so no content-quality conclusion can be drawn from this attempt. The sourced fallback remained available; no retry was made within the round.

### Release interpretation

The implementation now distinguishes provider/request, incomplete-output, format and support-check failures while preserving source evidence. The latest local run demonstrates one complete verified response and two safe fallbacks; it does **not** demonstrate reliable personalised AI responses across the three agreed briefs. The **AI reliability gate remains open**, independently of the passed deterministic search/data gates and software regressions. No additional prompt or calibration tuning is assumed in this report. The planned single hosted workflow acceptance run must preserve its own actual result, including fallback or provider error, and must not retroactively turn these local attempts into successes.

## Hosted release acceptance: 0/3 accepted AI explanations

The single final hosted run at [the Expert Discovery preview](https://docmap-expert-discovery-production.up.railway.app/expert-discovery) completed at **19:25:20 UTC on 6 October 2026**. `hosted-workflow-friendli-release.json` records the actual deployed corpus `expert-corpus-v1-fc67aacfcc3999fc230c`, live searches and explanation responses. This uses selected results from the real corpus, so it is distinct from the small public-source fixture corpus above.

| Brief | Search response | Interpretation | Explanation response | Result |
| --- | ---: | --- | ---: | --- |
| Cardiac comparison | 6,056 ms | DeepSeek | **7,614 ms** | Sourced fallback; support-validation / unsupported-claims |
| Dermoscopy study | 8,203 ms | Deterministic | **4,218 ms** | Sourced fallback; support-validation / unsupported-claims |
| Outside-specialist setting | 5,783 ms | DeepSeek | **8,250 ms** | Sourced fallback; support-validation / unsupported-claims |

The report contains **no rejected model drafts, checker arguments, per-call timing or actual provider metadata**. The application was configured for the explicit Friendli-only route, but the report alone does not independently identify the upstream provider of each call. The failures reached support validation; they are not recorded as timeouts. Their semantic correctness cannot be adjudicated from a fallback response, so the earlier local false-positive findings must not be generalised to these hosted failures.

For all three workflows, returned citation ownership, JSON backup round-trip and HTML evidence-pack checks passed. The cardiac workflow also preserved explicit requirement removal and stale-review handling, and outreach preparation did not create a communication event. These demonstrate functioning sourced workflows; they do not make the AI explanation gate pass or verify browser file-download delivery.

Deployment `770eecc0-ab88-48d5-8802-f1650e12af2e` reached Ready at 19:23:22 UTC, with health and 11/11 hosted asset checks passing. The release's software checks passed 476 expert/evaluation tests and 243 patient-demo tests. See [deployment verification](DEPLOYMENT_VERIFICATION.md) and [release audit](RELEASE_AUDIT.md) for those separate checks.

**Final conclusion:** the preview is deployed with working sourced search and safe fallbacks, but reliable personalised AI explanations remain an unresolved release criterion: **1/3 in the last local fixture round, 0/3 in the final hosted run**. No further requests, prompt changes or calibration rounds are included. Preserve this limitation in the handover and demonstration.

## Scope and limits

The fixtures use four previously reviewed public professional identities: a two-person cardiac comparison, a historical dermoscopy-study case and a skin-imaging/relationship case. They are not independent new clinical cases, a provider comparison trial or a latency percentile study. A selected provider completing these three generations does not prove that the model or automatic routing is universally fast or slow. Earlier automatic-routing and alias-round failures remain in [the latency diagnosis](AI_LATENCY_DIAGNOSIS.md), [original verification](MODEL_VERIFICATION.md) and [alias verification](MODEL_VERIFICATION_ALIASES.md).
