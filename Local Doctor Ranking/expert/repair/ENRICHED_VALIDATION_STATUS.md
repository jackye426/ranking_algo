# Broader enriched release — implementation status

This continues the approved staged repair programme. It is not a release approval.

## Current checkpoint — 9 October, 18:25 UTC

**Not ready for main-product deployment yet.** The frozen application passes
1,631 expert/repair/evaluation checks, 243 patient checks, 30 source-parser tests
and 14 disposable Chromium journeys. A separate native 200% zoom viewport
capture verifies the complete profile fits; full-page screenshot stitching at
native zoom is not used as the visual proof.

The final staged source packets are `enriched-r3-20261009-v3` and
`enriched-safe-r1-20261009-v3`. Both retain 67 mandatory whole-identity holds
and 2,890 source-bound field exclusions. The broader packet contains 243,651
context items across 17,565 existing source rows; this includes source-field
representations and repeated origins, not that many new facts or qualified
experts. Held identities contribute no searchable evidence.

The final broader replay passes with 40,221 resolved candidate identities,
22,208 searchable candidates and 577,987 passages. Identity mappings,
protected source fields and exclusion propagation are unchanged except for
the documented additional holds. All 577,987 passages and their owned
provenance passed the surface checker. Profile, source, save and export checks
cover 2,118 affected non-held candidates, including projection-only specialty
and NHS-base exclusions.

The additional mixed podiatrist/neuropsychologist record is held. Reviewed
native import continuity and explicit corroboration resolved eligible provider
ownership; 4,834 unestablished inherited context items are withheld. Missing
URLs alone are not identity exclusions. Forty partially suppressed BDA
biographies recover 86 exact professional spans and 30 independently reviewed
owner-profession assertions. Their full original About exclusions remain.
Discipline adjectives such as “gastroenterology dietitian” cannot establish a
gastroenterologist role.

Final source-review coverage retains 599 unchanged accepted claims across
360 records, with a further 14 independently double-reviewed source claims
and the 30 reviewed profession assertions. All accepted context categories
have source-reviewed examples. The first 393/404 sample failure (97.28%) and
the separate 397/404 professional-suitability result (98.27%) remain recorded;
corrected or targeted samples are not substituted for initial accuracy.

The fresh restricted read at 18:14 UTC found zero changed, added or removed
professional rows, no exclusion drift and unchanged identity/enrichment
modules. Main remains at `714d5a587d60b581028e89228e4f06fa7a492ed0`, with its
subsequent application changes incorporated into this branch.

Remaining gates are the paired final baseline/enriched retrieval runs,
independent prospective and sealed evaluation, actual retrieval-to-export
utility examples, exact private deployment/cache packaging, hosted verification
and rollback rehearsal. No held-out acceptance, ranking-quality pass or
main-service activation is claimed.

## Source-formatting checkpoint — 9 October, 18:40 UTC

The exhaustive preparation check found four additional runtime defects: a
case-insensitive title boundary split ordinary words and names; sentence
chunking dropped a generated short tail; a career date range was mistaken
for a contact number; and inline navigation wording discarded substantive
clinical text. The corrected runtime passes 1,637 application checks. The
30 source-parser and 86 enriched-preparation Python checks also pass.

All 243,651 source-context items have been accounted for: 242,935 retain
complete token coverage; 130 absent and 586 partial items have explicit
source-bound dispositions, including 64 differences consisting only of
whitespace at real glued title boundaries. There is no unexplained character
or ordering loss after those deliberate omissions. Original failed proofs
remain preserved. This is not a claim that every raw word is indexed.

Source packets remain unchanged. The earlier v15 corpus/cache/surface results
are now historical; corrected-code v16 corpora and fresh acceptance receipts
are required. No held-out results have been used for ranking development.

## Historical checkpoint — superseded by the current sections

The application now includes the subsequent main-product changes from `714d5a587d60b581028e89228e4f06fa7a492ed0` (editable project names and aligned card actions). The integrated Node regression run passes 1,573 checks. A subsequent narrow population-wording correction passes 56 focused checks; a final complete run is still required. Final packaging, current-main compatibility and hosted checks remain outstanding; the older measurements below are historical checkpoints.

Independent provider ownership review checked 118 flagged source associations. It identified 59 unresolved typed-GMC disagreements and four cross-person provider biographies. These 63 source records, plus the three earlier holds, are now mandatory whole-identity-group holds in both forward and rollback releases. A disagreement is not automatically a proven wrong-person identity; it is withheld until reconciled. A missing original URL or non-GMC role alone is not an identity exclusion. Final corpus replay must prove complete group propagation and unchanged identity mappings.

All 321 source-cleanup targets (312 initial and nine supplemental leaves) have explicit primary and independent secondary reviews. Both staged v13 packets passed the pure source compiler with 66 holds and 2,616 field suppressions. They are intermediate preparation artifacts, not deployable packages. Original text and reviews remain private and immutable. NHS-base contact exclusions apply only to the evidence projection: canonical NHS-base metadata and recorded practice locations remain unchanged.

Both independent development reviewers completed 943 candidate/source-version judgements, 32 interpretation checks and 30 insufficient-evidence presentation checks. Source-only adjudication resolved 61 of 62 disagreements; the remaining mixed ophthalmologist/dentist profile is withheld for attribution and blocks complete v12 scoring. The original 98-case runs and their actual recall losses remain recorded. No held-out results or retrieval acceptance is claimed. A fresh corpus, affected source reviews and paired retrieval runs are required.

The isolated preview still runs the earlier repair build. Main Expert Discovery, the patient demo, Supabase and the original archives have not been activated or rewritten by this work.

**Current blocking finding:** the new provider ownership gate found inherited additions whose recorded basis is only a canonical URL and compatible name. The initial trace includes 10,978 newly recovered items across 2,371 provider pairs, with inherited R2 coverage still being reconciled. This is not independent professional corroboration. Unresolved additions require source-bound withholding or explicit corroborated ownership review; missing registration alone does not justify whole-person exclusion. Literal-text checks and claim-format review cannot be relabelled identity verification.

The independent legacy comparison is complete: 138 candidate/source versions, including 41 adjudicated disagreements. Four lost-reference cases contain weaker entrants, two contain stronger research contributions and four have comparable documented support. Original recall failures remain failures. No retrieval weights have been changed, no sealed held-out run has been used for tuning, and no fresh release acceptance is claimed.

Team descriptions and named colleague appositions now remain qualified background, rather than individual practice or professional-role evidence. Explicit founder-role appositions support only the stated owner's role; they do not establish every team service. The corrected sources and runtime still require a fresh ownership-closed corpus, paired evaluation and exact cache binding before deployment.

## Boundaries

- Target: a validated package compatible with main Expert Discovery, demonstrated in the private repair preview.
- No activation on main Expert Discovery, shared Supabase writes, patient changes, new identities or model/provider changes.
- Existing source exports, release packets and historical saved projects remain immutable.
- Optional model availability is reported separately from data readiness; unsafe failure behaviour still blocks release.

## Baseline and integration

Integration branch `codex/docmap-enriched-validation` starts from main expert revision `f65953fb66a544ec595d1325f7a43def9f2c52d5` and merges repair revision `630944b0f19cbbb34e88591ec76d16e61e653027`.

The fresh professional-only read contains 40,876 rows. Comparison with the prior frozen baseline found no changed/removed rows and identical exclusion flags. Reader credentials were used in memory and were not exported.

Current clarification/MDR features and homepage examples are retained. New release machinery supports explicit source-bound field exclusions, isolated cloned rows, full runtime manifests, version-qualified profiles and citations, and compatible historical project imports.

## Evidence and interpretation

The final source candidate contains 167,466 newly recovered items and 80,826 inherited R2 items. Every accepted item has independent literal-source verification. The original semantic sample failed and remains recorded; the fresh confirmation reached 99.50% label support, and all nine detected defects were withheld. Source-field counts are not counts of new facts or newly qualified experts. See `enriched/SOURCE_PREPARATION_REPORT.md` for dispositions and limitations.

The first enriched replay had 538,158 passages and 22,272 searchable existing identities. End-to-end utility checks then found soft-wrapped biography lines being split into incomplete sentences and nonadjacent statements being reordered. The original sources were intact. The corrected preparer preserves exact source words and line breaks, keeps only adjacent statements together, and projects About in source order. Two exact archived-source fixtures and synthetic negation/modality controls verify the repair. The resulting R3 replay has 587,109 passages and the same 22,272 searchable identities; a compatible safe-baseline replay is being completed. Earlier corpus counts remain historical, not final acceptance measurements.

Both releases retain the same 2,515 source-field exclusions, three mandatory identity holds and removal of 222 unsafe earlier patches. Identity mappings and protected fields are unchanged. All 15,003 selected source files were rehashed against the catalog and separate-disk backup without drift.

The prospective evaluation was frozen before retrieval tuning: 32 development briefs and 64 private held-out briefs. The old 98-case pack remains unchanged. Mechanical exact-quote checks are not relevance judgements.

Implemented interpretation work includes explicit language/service fields, unfamiliar interest/research topics, documented-only result controls, priority changes and removal semantics. Utility tests additionally corrected lost specific roles, musculoskeletal imaging, paediatric allergy and language proficiency. Explicit requests for source-reported procedure figures use the actual range/count metadata; a <=7 range may include zero, a derived midpoint is not a count, and unknown periods remain unknown. Essential clinical experience remains distinct from an interest, qualification, service or research topic. No optional background becomes an automatic requirement.

## Verification in progress

The latest complete integrated test run passed 1,448 expert/repair/evaluation checks. The preceding patient run passed 243 checks; final complete verification remains required after subsequent changes. Fourteen fictional Chromium journeys pass, including native 200% zoom, 320px source reading, save-before-open, wrong-person background rejection and recovery. These checks do not substitute for final-corpus or hosted validation.

Historical blinded review confirmed real R2 relevance dilution in cardiac, skin-lesion and relationship results. Those findings are not relabelled as obsolete expectations. Fresh semantic vectors are being prepared for a fair prospective comparison using the same current safety exclusions on both sides. The old embedding cache failed numeric reuse checks. An early exact-batch Windows/Linux sample passed, but the full fresh-cache sample failed the unchanged tolerances (minimum cosine 0.99734; maximum absolute difference 0.01121). All receipts remain recorded. Final deployment vectors will be generated on the target Linux runtime; the failed Windows cache is not approved for deployment. Retrieval query vectors must use the same target model/runtime.

Still required: completed fresh vector and prepared-geography receipts, independent prospective relevance judgements, sealed validation, source/profile/export parity, hosted performance, exact-package rollback, final source/main-code drift recheck, immutable packaging and final delivery evidence.

Private artifacts and reports are stored outside Git under the task's `enriched-private` directory. No raw professional export, archived HTML or credential belongs in Git, a public asset or a Docker image.


## Preparation verification update — 8 October, 18:50 UTC

The complete current suite passes 1,492 expert/repair/evaluation tests, 243 patient tests and 30 Python source-parser tests. These counts supersede earlier overlapping runs; they are not added together as independent evidence. The package test now checks the actual Docker runtime COPY allowlist against every required pinned artifact, including the new source-bound segmentation helper.

The full corrected Linux seed contains 238,684 vectors. Twenty-four checks using the original generation batches reproduced cosine 1.0 and maximum component difference 0. This seed is approved only for reuse by identical normalized-text and model keys; the final release cache still requires its own corpus binding. The Windows numerical failure remains recorded. Fresh Linux query receipts cover development and the unchanged original 98-case pack under the current brief interpreter.

Further full-field checking corrected short clinical terms mistaken for navigation, qualifications/date fragments being dropped, clinical Contact/Mobile phrases being mistaken for phone details, inline markup splitting words, and medical inequalities being erased as HTML. Source-bound reviewed biography boundaries preserve short professional entries and their original context without turning ambiguous fragments into performed-activity claims. Personal, ratings and unresolved flattened bibliographic blocks are withheld with exact source-field guards; earlier packets remain immutable. The source team is closing the final neighbouring-span checks before the paired corpus replay. No retrieval acceptance or final source-packet approval is implied here.

A real BDA service listing now supports the explicit request “Professionals offering product development” through interpretation, evidence, profile and saved/exported snapshot. The older broader query failure remains recorded. This does not infer a Dietitian role where the source does not explicitly establish it. “This version is for general practitioners” now describes intended users rather than silently imposing an expert role.

Main Expert remains at `f65953fb66a544ec595d1325f7a43def9f2c52d5` with a clean checkout. All Railway services are online, with no pending deployment changes. Only private preview preparation artifacts have changed; no main-service activation has occurred.
