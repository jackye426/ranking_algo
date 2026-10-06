# Expert Discovery release audit

Checkpoint: 6 October 2026, after hosted verification and the final brief-interpretation correction. **This is an implementation and verification manifest, not a blanket release pass.** The corrected deployment is live, all served asset hashes match, and twenty warm searches returned results at p95 7,937 ms. The copied-backup persistence roundtrip and two targeted live interpretation corrections pass. Local code passes 419 tests and its final retrieval replay passes. Reliable three-brief model explanations remain an unmet criterion.

The objective is assessment brief → relevant candidates → comparison → qualification pack → recruitment preparation. Scarlet is the reference persona; no partnership, internal roster access, formal assessor approval or measured ROI is claimed. The patient application and `synaptic_care_fe` are outside this release's implementation scope.

## Artifact and version manifest

| Item | Checkpoint identity |
| --- | --- |
| Repository / working branch | `jackye426/ranking_algo` / `codex/docmap-expert-discovery` |
| Base commit | `9e31810681559015cbb1a0584ed171d51bdf159c`; release revisions are recorded in the separate expert branch history |
| Local application | `http://localhost:3100/expert-discovery`; own `/api/expert/*` APIs and browser project namespace |
| Professional projection | 40,876 source rows; these are not 40,876 approved or distinct experts |
| Raw-source audit fingerprint | SHA-256 `9a9e3376cb241f534f5538117ed929cae47316e5831cf9d66732b4e04a27a99c` |
| Final independent first-pass corpus | `expert-corpus-v1-ee9449e83c05a7a62986`, audited at 17:25:28 UTC |
| Final retrieval pack fingerprint | `af87bf8ef574e0bc4553bc773d906e0bfa914ed14dde7152429d9c5e224fe2ef` |
| Corrected release corpus | `expert-corpus-v1-fc67aacfcc3999fc230c`: 22,271 indexed candidates, 273,108 passages, 17,946 identity groups held; built 17:36:06 UTC |
| Corrected retrieval replay | Same frozen final pack, evaluated 17:38:20 UTC; all recorded gates pass, explicitly a post-fix regression |
| Final parser replay | Latest `bca65ad…` parser on the same `fc67…` corpus: development 105/105 and final held-out 228/228 trust/refinement checks in every retrieval mode; recall and central-evidence precision unchanged |
| Measured deployment | `22a98893-1b58-4232-b807-39dc4b7d20fe`: reached Ready at 17:58:46 UTC on the corrected `fc67aacfcc3999fc230c` corpus, reusing cached vectors; hosted observations are recorded in [deployment verification](DEPLOYMENT_VERIFICATION.md) |
| Final brief-correction deployment | `09022aa3-51e0-4b86-ad94-98309930e45d`: Ready at 18:20:53 UTC; health, assets, twenty-search and targeted-brief checks passed, with AI reliability limits recorded |

The local code snapshot after the frontend race fixes and final brief correction is recorded below. Hosted observations are attributed separately to each deployment in the verification report.

| File | SHA-256 |
| --- | --- |
| `expert/server.cjs` | `46e297ebd2bb2a4a1236085d13ba841ae6a76d736caba00ae378cf84193365b7` |
| `expert/data.cjs` | `ce545346c2219034d4bd92d6ebc7981ef46854b40f945870572f45f77ecc1fd1` |
| `expert/brief.cjs` | `bca65ad384d26dd692c62db4eb0b37cd52f85237062eab6ec7cae7cab23a1a50` |
| `expert/search.cjs` | `cfb25b474eeffde67a24ce1480ab30144d1fa6b8a8cbe16f3f7d5090a5fa5cf6` |
| `expert/ai.cjs` | `776f983148141c819ec4586eff3acbf3ae1399f8b2c8f545f628ef9c24c490e8` |
| `expert/public/app.js` | `af99b7e20aa00f599e1a5448dbd38794bc188a1f8ac4aec3d44a67380c917162` |
| `expert/public/projects.js` | `077af0a20063fefb2e81a1e7c5011e896ea56c22798fbf1dd9e61fa89025ef38` |
| `expert/stage.cjs` | `5667089e01368857285542703cc6900ddefd18cfff574b551f370fe068fb3380` |
| `expert/extraction.cjs` (later offline operator tool) | `c7960f8bb631158dd61f917d61eb304a8bef1935e5e2aaa11e37f3246a90dad7` |

## Implementation against the requested workflow

| Requested capability | Implemented behavior | Remaining limit |
| --- | --- | --- |
| Separate professional experience | Independent route, server/configuration, data reader, static assets, project namespace and deployment allowlist; earlier hosted health, assets and core workflow checked | The final brief-correction deployment still requires readiness and hosted verification; the three-brief AI reliability criterion is unmet. |
| Natural-language brief and refinement | Versioned essential/preferred requirements; clinical/device context, role, geography, timing, manufacturer and panel goals; clarification for vague requests; removable criteria | Free-form extraction has finite concept/wording coverage. The offline evaluation does not establish live DeepSeek interpretation accuracy. |
| Actual hybrid retrieval | BM25 and local MiniLM passage retrieval, candidate fusion and reranking; clinical evidence governs admission; bounded assessment-context contribution | The benchmark is narrow and the known-reference set is not exhaustive. No claim of universal hybrid superiority. |
| Evidence-first cards and profiles | Candidate-specific evidence, source links, gaps and qualification questions; optional background/research/relationship sections | Conservative classification still leaves useful activity in background text and some source excerpts are incomplete or untidy. |
| Meaningful comparison | Two or three candidates against the same brief; common requirement matrix and deliberate model explanation | Source evidence remains useful when AI wording falls back. A matrix is not a formal qualification decision. |
| Complementary expertise | Clinical/research perspectives, explicit panel goal and no padding with weak candidates | No automated panel optimisation, diversity guarantee or confirmed participating panel. Technical and device-evaluation roles are limited by actual source coverage. |
| Full ranked results alongside focus | Focused six and cursor-paginated directory share the same immutable search snapshot and ranking | This is the complete eligible result set for the current search, not a verified master roster of every source row. |
| Project, notes and review pack | Browser-local IndexedDB; saved brief/evidence versions, notes, questions, explicit review states; JSON backup and printable HTML | No multi-user account, server project storage, synchronisation or authenticated audit trail. |
| Qualification and independence | Separate explicit team decisions, sourced relationships and scope/corpus invalidation; imported stale warnings recomputed | No regulator checking integration or automatic independence determination. Imported history remains user-supplied. |
| Recruitment preparation | Editable outreach draft; manually recorded real activity; project contact filter | No sending, inbox, booking, availability or external recruitment-system integration. |
| Bounded model-assisted source preparation | Exact-span DeepSeek proposal/cache/review tool; source-content/model/version invalidation; real v2 cache creation and offline reuse verified | Two source-faithful proposals were cached; both have unclear subjects and one has an incorrect activity category. **Zero accepted/indexed.** The earlier failed v1 attempt is retained. See [extraction workflow](EXTRACTION_WORKFLOW.md). |

The extraction requirement is interpreted as **using a model where it adds value, beginning with reviewed pathways**, not running unreviewed corpus-wide extraction. The new operator tool provides that bounded mechanism. It must not be described as completed enrichment until a real job and its human source review are recorded. Existing manually reviewed additions are distinct from model-extracted evidence.

## Verification ledger

| Check | Recorded result | What it establishes / does not establish |
| --- | --- | --- |
| Expert regression suite and evaluation-contract tests | **419/419 passed:** 403 expert tests plus 16 evaluation-pack tests, recorded in the refreshed `expert/.cache/final-release-tests.txt`. The frontend subset contains 39 passing cases. | Supersedes the earlier 311, 336, 380 and 389 checkpoints; counts are not additive. Includes extraction, imported-staleness, final race/persistence checks and 30 brief-interpretation regressions. |
| Patient regression suite | 243 passed, reported by the integration owner | Existing patient behavior has regression coverage; this is not a new patient product release. |
| Final persistence/security review | 66 focused projects/security/frontend checks passed, including three new imported-staleness cases | Project states, payload boundaries, source ownership, escapes and cache separation; not proof of deployment security. |
| Quantitative corpus capability audit | All 40,876 rows scanned; source/proxy totals reconcile; five audit tests passed | Raw coverage and formats, not clinical verification. See [capability map](CORPUS_CAPABILITY_MAP.md). |
| Bounded extraction | 28 controlled-response tests passed; real v2 produced two exactly anchored cached proposals; offline reuse made zero model calls | Semantic review accepted neither proposal. Cache correctness is verified; useful accepted enrichment and downstream benefit remain unproven. |
| Local core end-to-end journey | Core browser journey was observed. Final comparison-selection and pending-search/history race fixes plus small persistence fixes are complete and covered by the 39 frontend tests | No outstanding known race remains from that review. Hosted/device-specific checks are separate; automated DOM tests do not prove real mobile-keyboard behavior. |
| Browser persistence roundtrip | Local copied-backup import/reload retained evidence, four brief versions, notes and draft. Hosted copied-backup import/reload retained identical candidate evidence and draft under a new project identity, with zero recruitment events | Blob HTML-download receipt remains unconfirmed. JSON/HTML export contents were checked, and HTML packs were generated and validated from hosted snapshots; that does not prove browser file receipt. |
| Model explanation, three distinct briefs | **Not met:** one distinct brief verified in an earlier round; alias round 0/3; JSON-mode attempt failed; instrumented automatic-routing full-payload round 0/3; hosted guide workflows 0/3 | Hosted sourced fallbacks took 15,035 / 5,799 / 15,085 ms. Their metadata does not establish the exact failing pipeline phase. Tiny synthetic responses and cached extraction proposals do not clear explanation reliability. |
| Hosted health, assets and journey | Routes/assets/health and isolation checks passed; twenty warm searches returned results: p50 4,212 ms, p95 7,837 ms. Three broader guide searches took 9,041 / 12,160 / 7,664 ms, partly overlapping browser work | The eight-second target was met for the twenty-search run, not every observed search or an overall SLA. Measurements belong to the earlier deployment. See [deployment verification](DEPLOYMENT_VERIFICATION.md). |

The source and retrieval first-pass results below are deliberately retained even after their bugs are corrected. Replaying the same cases after learning from them is a **regression result**, not a fresh independent pass.

### Final source review

On the final independent first-pass corpus, 100/100 identity decisions were source-consistent, 200/200 claim anchors were text-traceable, and 199/200 interpreted claims were supported (**99.5%**). The numeric precision threshold passed. The zero-critical-claim gate **failed** because a received endoscopy qualification was promoted to performed clinical activity when combined with an unrelated active-clinic clause.

That defect was corrected and independently rechecked on the same 200 fixed anchors and 100 identities: 185 claim projections were unchanged; all 15 changed projections were reviewed. The qualification is now training/potential endoscopy evidence while the separate pre-term clinic activity remains documented. All 200 anchors remain present, with no unresolved critical finding in this fixed regression sample. `post-final-source-correction.cjs` records the correction checks. The original failed ledger remains immutable. This source-record review is not 100 fresh regulator checks. Twenty display-quality issues and 55 conservative usefulness misses were separately recorded; they must not be erased by the precision figure.

### Final retrieval first pass

The frozen 28-case pack used real BM25, real local embeddings and the same downstream matrix/reranking, with no paid model calls and deterministic brief interpretation:

| Metric | Hybrid | BM25 only | Semantic only |
| --- | ---: | ---: | ---: |
| Known-reference recall at 20 | 95.833% | 93.750% | 91.667% |
| Source-supported central-evidence precision in first five | 100% | 100% | 100% |
| Trust/refinement checks passed | 225/228 | 225/228 | 225/228 |

The three failures concerned research-requirement removal, preserving a skin-lesion requirement and retaining a named manufacturer. Targeted parser corrections were followed by a full replay on `expert-corpus-v1-fc67aacfcc3999fc230c`. The same final pack now passes **228/228 trust/refinement checks in each mode**, with the recall and precision values above unchanged. All recorded replay gates pass. This is a post-fix regression, not a new independent pass; `evaluation-holdout-final-first.json` remains the failed first result and `evaluation-holdout-final.json` records the replay.

The subsequent hosted walkthrough exposed a separate interpretation problem: diagnostic-study evaluation could become a professional role, and assessment questions could become extra essential research credentials. Thirty focused regressions cover the correction, including preferred importance and supported non-doctor roles. The latest parser was then replayed on the same corrected corpus: development passed 105/105 trust/refinement checks per mode, with 91.67% known-reference recall; the final held-out pack passed 228/228 per mode, retaining the recall values in the table and 100% central-evidence precision. This is another regression on the same packs, not new independent evidence.

Semantic retrieval added unique candidates to 26 pools, but none uniquely reached the hybrid top 20. The modest aggregate hybrid advantage came from reranking candidates both methods found. A separate fixed [language probe](HYBRID_CONTRIBUTION.md) demonstrates genuine zero-keyword-overlap matches and also records failures. Neither result establishes universal semantic or clinical superiority. The final pack's authoring/implementation timing limitation and all earlier failed rounds are retained in [data and evaluation](DATA_AND_EVALUATION.md).

## Data and scope gaps that remain visible

- Only 60.1% of raw rows have a usable-length biography; 18.6% have alternate biography text. Dedicated professional role is not selected in the current projection, so specialty wording remains a role proxy. Non-doctor records exist, but that does not establish comprehensive technical-specialist coverage.
- Primary biography source labels appear on only 8.9% of rows. Source links, registration syntax and database merge timestamps do not verify every merged assertion or current practice. Identity holds are coverage losses, not eligible experts.
- Research interests, publication links and qualifications are uneven. Publication references lack structured authorship objects; 171 rows contain publication-search URLs. There is no general DOI/PMID author disambiguation, trial-role verification or automated literature enrichment.
- No recorded procedure-volume tuple contains a name, count, reporting period and source URL together. Combined modality totals, ranges and admissions cannot become comparable quality scores or individual interpretation counts.
- Population, workflow, research activity and relationship extraction remain conservative and incomplete. The new extraction tool is a review aid, not evidence that those gaps have been filled.
- Current professional status, willingness, fees, availability, engagement-specific qualification and independence need direct records. No authorised internal roster or historical recruitment system is connected. No membership or approval is fabricated.
- The preview has no confidential dossier upload, user authentication, tenant model, collaborative storage or retention administration. Those are future operational capabilities, not hidden requirements for demonstrating fictional briefs with public professional evidence.
- ROI remains a proposed pilot measurement. No time-saving percentage, superior clinical outcome or recruitment-conversion result has been measured. See [pilot measurement](PILOT_MEASUREMENT.md).

## Privacy and deployment review

Private notes, event details and decisions remain browser-local. Requested contact filtering sends only contacted candidate IDs to the search server, not to DeepSeek. Search/explanation endpoints accept bounded whitelisted fields; explanation candidates and evidence are resolved from server-owned search snapshots. Imported evidence cannot replace model input. Source text and HTML exports are escaped; supporting links reject executable schemes. Exported JSON/HTML deliberately contain the user's saved notes when the user chooses to export them.

The last asset audit scanned 76 untracked expert/public files and found no high-confidence key/JWT/private-key or bulk raw-record patterns, and no files above 1 MB. This was a point-in-time scan, not a guarantee for files added later. The actual raw cache and private environment file are Git-ignored. The deployment staging allowlist excludes caches, environment files, project backups, evaluation artifacts and this offline extraction tool. Credentials belong only in the independent service's private variables.

The final staging check covered 94 files (2.28 MB including all immutable review ledgers). No cache, private environment, raw-export or dependency path was staged; no OpenRouter-key, Supabase-secret or private-key pattern was found. The ledgers contain review decisions and fingerprints rather than the sampled raw source exports.

## Remaining release checks

- [x] Record the corrected corpus and same final-pack replay: `fc67aacfcc3999fc230c`, 228/228 checks in each mode. Preserve the independent first-pass failures and denominator.
- [x] Independently recheck the training/practice correction on the same fixed source anchors, with remaining usefulness/display issues retained explicitly.
- [x] Record the final 419 expert/evaluation tests and prior unchanged 243 patient tests.
- [x] Verify the comparison-selection and pending-search/history race fixes and small persistence fixes: frontend subset 39/39, included in the final combined run.
- [x] Record the hosted save/compare/copied-backup import/reload journey. Keep the unverified Blob download path and physical mobile-keyboard behavior distinct from verified checks.
- [x] Refresh the capability map against the corrected corpus audit without rebuilding another index.
- [x] Verify a real bounded cached extraction job and its zero-call offline reuse, and independently review the two proposals. Neither is accepted or indexed; no model-assisted enrichment benefit is claimed.
- [ ] Resolve or explicitly retain the unmet three-distinct-brief DeepSeek explanation criterion. Preserve all unsuccessful calls; do not replace independent checking with unchecked streamed wording.
- [x] Deploy the measured allowlisted artifact to the independent service; deployment `22a98893-1b58-4232-b807-39dc4b7d20fe` reached Ready on the corrected corpus.
- [x] Record hosted health/assets/source-page, twenty warm searches and real-evidence workflow checks separately from runtime readiness.
- [x] Complete the latest brief-correction replay: development 105/105 and final held-out 228/228 per mode; preserve the earlier observations.
- [x] Final deployment `09022aa3-51e0-4b86-ad94-98309930e45d` reached Ready at 18:20:53 UTC. All served asset hashes match. Twenty searches returned results (p50 6,848 ms, p95 7,937 ms); five used DeepSeek and fifteen explicit fallback. Both targeted corrected briefs passed through live DeepSeek interpretation. See the separate deployment report.
- [x] Implementation commit `0954827` was pushed to [codex/docmap-expert-discovery](https://github.com/jackye426/ranking_algo/tree/codex/docmap-expert-discovery). Subsequent audit-only updates remain on that branch. The [independent preview](https://docmap-expert-discovery-production.up.railway.app/expert-discovery) serves the tested runtime; the patient service was not redeployed.

No new sample should be generated merely to obtain a passing label. Completed checks support an evidence-led demonstration; the unmet explanation-reliability criterion and verification limitations remain visible in the delivery.
