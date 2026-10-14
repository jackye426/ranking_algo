# DocMap staged data repair — delivery status

8 October 2026. **The Bupa wording/provenance release is the isolated preview candidate. The broader context release and adoption by the existing expert service remain withheld.** This report does not claim the complete repair programme's acceptance gates have passed.

## What is implemented

The repair branch contains a pure, source-bound adapter, immutable release packaging, checksum-verified backup/preparation tools, a pinned expert reader that cannot fall back to Supabase, release-aware profile/citation/save behavior, and an authenticated private preview. Original archives and the shared table were not written. Patient application files, dependencies and API contracts were not edited. Concurrent work in the original checkout was preserved.

The preview is https://docmap-data-repair-preview-production.up.railway.app/expert-discovery . It uses HTTP Basic authentication over HTTPS: username `docmap`; the password is stored privately as `EXPERT_PREVIEW_PASSWORD` on Railway's `docmap-data-repair-preview` service. No password, reader token, model key, bulk corpus or raw HTML is committed or served as an asset.

| Stage | Result |
| --- | --- |
| Freeze and recovery | Fresh restricted projection: 40,876 source rows and 32 existing exclusions. Recheck found zero changed or removed professional rows. 37,452 selected source/pipeline files were copied across disks and checksummed; representative restoration and baseline replay passed. |
| Containment | Preserved prior identity decisions and all exclusions. Added whole-group holds for Hayley Smith, Philip Brown and the newly corroborated David Jones mixed attribution. Candidate grouping and named-row membership did not change. |
| Bupa wording | 24,917 source-supported field replacements across 10,913 existing rows; four professional text fields only. All 37,195 mapped Bupa rows have explicit outcomes. The 100-profile pilot and 200-profile follow-up passed independent actual-HTML comparison. These are automated source checks, not human approval. |
| Bupa provenance | Accepted recovered numeric Bupa links belong to evidence, not identity-grouping URL fields. Each correction retains original-value and snapshot hashes, field/parser/review provenance and unknown dates. Stored-link recovery is not current online verification. |
| Information preservation | PHIN reported ranges, available periods/hospitals/codes, CT/MR, negation and qualifications are retained. Profiles select previews before display limits and expose counts/full evidence. Saving obtains version-matched background, with explicit incomplete/retry states. Old saved evidence is not replaced by live data. |
| Additive context | Prepared 80,826 literal source-field items across 14,085 existing eligible rows. Independent provider checks covered all 47,875 HCA/Cromwell/BDA items; Bupa context sample covered 200 profiles/521 items. This package is **withheld after retrieval regression**, not active. Counts are structured source context, not counts of novel facts. |
| Research | Reviewed 12 archived trial cases: 11 literal recorded-role matches and one parser fallback without a source role. Zero candidate attributions approved. No trial associations were imported and no contact was promoted to investigator. |

## Immutable release identities

| Release | Manifest SHA-256 | Corpus | Status |
| --- | --- | --- | --- |
| `r0-safe-20261008-v2` | `e44e5a8460b7a206a93b81fa24d4d9c1ddd899c62f973e7273ab45c7b908aee6` | `expert-corpus-v2-84c7535787ffa50edce1` | Safe rollback release; three holds retained |
| `bupa-r1-20261008-v2` | `8409d33afcb2c8cfbfd035912e9b04d40db0e8bdfef5e846923c7b964b80fe9d` | `expert-corpus-v2-e9514a65fadc1ab935b6` | Isolated preview candidate |
| `context-r2-20261008` | `5376dbc5d04e661b3f00e54fe744db9b42da6f79adcd12e81b92ccf48ae4ba90` | `expert-corpus-v2-3506499e3898780ca0af` | Staged privately; withheld |

All final packages pin the frozen identity-review and enrichment code hashes. The 40,221 groups and 40,576 named-row mappings are identical across replays. Searchable population is 22,268 candidates; 17,949 groups remain identity-held. Counts describe record/index state, not approved or available experts. R0, R1 and R2 contain 277,343, 271,894 and 352,365 passages respectively. Different counts reflect repaired boundaries, evidence deduplication and optional additive context.

## Verification and limits

- The consolidated local regression run passed 1,436 checks with zero failures (expert 1,130, repair 17, evaluation-pack fixtures 16, patient 243, Python 30). Subsequent loader, replay and receipt hardening passed its 33 focused checks. These overlapping focused runs are not added together as unique tests.
- Actual BM25, MiniLM semantic and hybrid retrieval were evaluated separately on the same 98 frozen briefs for baseline, R0, R1 and R2. R1 had no new critical-check failure and no hybrid/BM25 case-level recall or source-support loss. A semantic-only known anchor moved from rank 20 to 21.
- Absolute search acceptance remains incomplete: unchanged critical failures span interpretation limits and three frozen expectations that conflict with deliberate broad-discovery behavior. Extended evaluation packs miss aggregate thresholds. Labels and weights were not altered to manufacture a pass.
- R2 has a genuine hybrid known-candidate recall loss and two further semantic losses relative to R1. Investigation found added literal clinical-interest terms affecting retrieval, with no activity promotion. The loss remains reported and the release withheld.
- Eight bounded repair-specific evidence/reachability checks passed. Gillett's restored exercise-guidance wording becomes reachable in actual BM25. Pericleous's five research-interest items gain intact structure/provenance; they were already represented elsewhere and are not five new research facts. These checks do not claim the natural-language parser supports every tested phrasing.
- R1's initial hosted run passed all 80 non-AI checks, with 20 warm searches at p95 736 ms. Three AI attempts returned correctly cited, explicit fallback; a separate metadata-only diagnostic confirmed an upstream HTTP 429 on the configured DeepSeek/Friendli route. No model/provider setting was changed. After rollback, the restored R1 run passed all 82 non-AI checks with exact release pins and p95 428 ms (maximum 448 ms); all three explanation retries again used explicit fallback. Successful DeepSeek acceptance remains open.
- Actual rollback changed from R1 code/data/cache to the previous authenticated R0 code/data/cache. Its 82 hosted checks passed, with exact manifest/corpus pins, all three holds and p95 6,326 ms across 20 warm searches. End-to-end timing includes interpretation/network effects and is not a pure retrieval benchmark.
- Browser rollback passed 20/20: saved R1 evidence/background, brief, notes and decisions were identical after import/export under R0. Obsolete citation returned 410; reading saved evidence made no live profile, search or AI request.
- R1 browser journey passed 25 checks: save without opening, independent source tab, draft preservation during refinement, focus restoration, reload, backup/import and no unsolicited explanation requests. Desktop, 768px, 390px and 320px screenshots show no horizontal overflow; before/after source-reader captures are retained. Reduced-motion state was captured. Physical mobile keyboards, Safari, assistive technology and native 200% text zoom were not tested.

## Demonstration and evidence

1. Open the protected preview and search `Radiologists who report cardiac CT`.
2. Save a candidate before opening its profile; reload the saved project and inspect retained evidence.
3. Inspect Gillett's stored source collection at `/api/expert/sources/expert-gmc-3684881`. The interests passage restores readable words and list boundaries from the saved Bupa HTML, with the recovered source link and record hashes.
4. Inspect the original-profile/source disclosures; research interests remain interests, reported volume ranges remain ranges, and unknown dates stay explicit.
5. Import a prior test backup: the saved snapshot stays historical; changed scope/evidence requires review. An obsolete version-qualified live citation fails explicitly.

Private release artifacts, source review ledgers, manifests, before/after screenshots and hosted receipts live outside Git under the task's `repair-private` directory. See `release-operation-ledger.json`, `browser-qa/`, `final-suite-verification/`, `retrieval-evaluation/`, and `releases/`. Raw HTML archives and full trial/contact exports are not deployed.

## Work remaining before broader adoption

1. Review the new context-driven candidate changes against the frozen relevance gate before selecting or revising R2. Do not silently remove the lost references or tune to those specific identities.
2. Reconcile frozen broad-discovery expectations with the product behavior and fix the remaining interpretation controls, then rerun absolute search acceptance.
3. Obtain successful validated explanations for three distinct briefs once the existing provider route accepts requests. The fallback behavior passes; successful DeepSeek acceptance is a separate, currently open gate.
4. Resolve source queues explicitly: encoding damage, typed identity/URL gaps, conflicting historical links, provider-biography reconciliation, missing source dates, POGP held identities and research-person attribution. None is repaired by inventing wording or changing identity IDs.
5. Complete the remaining device/accessibility checks before claiming the full UI acceptance matrix.

The existing expert service has not adopted this release. No shared-database migration, new-person import, broad rescrape, outreach or model change is included. See [source-quality queues](QUALITY_AND_UNRESOLVED.md), [Bupa preparation](BUPA_PREPARATION_REPORT.md), [provider review](PROVIDER_CONTEXT_REVIEW.md), [research review](RESEARCH_REVIEW.md), and the [rollback runbook](RELEASE-ROLLBACK.md).
