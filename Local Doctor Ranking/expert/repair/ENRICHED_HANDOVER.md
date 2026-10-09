# Broader enriched release: deployment and rollback handover

**Status: validation in progress; not approved for main-product activation.**

**9 October checkpoint:** the package identifiers and corpus measurements below are historical v12 preparation references. V13 source cleanup passed compilation, but inherited provider ownership requires further source-bound disposition. Neither is approved for deployment. The final forward and rollback packages must both contain the latest 66 mandatory holds and all final exclusions; do not execute this runbook with the older three-hold packages.

This runbook covers the integrated broader release, `enriched-r3-20261008`, and its compatible fallback, `enriched-safe-r1-20261008`. The previous `RELEASE-ROLLBACK.md` records the earlier R1/R0 rehearsal. Its old packages do not contain the newer field exclusions and are not fallback targets for this release.

## Deployment boundary

Only the authenticated `docmap-data-repair-preview` Railway service is used for rehearsals:

- Project: `0a83f08c-2a8e-487d-a648-22360a1193b6`.
- Environment: `37357730-0010-474b-b90d-07f368a22360`.
- Preview service: `96b1084b-29ff-4e9d-8b5f-79aee89f5b97`.
- Preview volume: `25b1bf94-0228-4bb7-adc1-3d0a895b3807`.
- Preview: <https://docmap-data-repair-preview-production.up.railway.app/expert-discovery>.

The main Expert Discovery service (`b3f468f3-5b43-4d9e-9159-af6445429d33`) and patient service (`b7ca400b-7dec-4e89-89e2-d5bb3b9ec257`) must not be switched, redeployed or reconfigured during this phase. The shared database and original archives remain read-only. Activation of the main product requires a separate instruction after signoff.

## What the release contains

Both packages use the same frozen 40,876-row professional projection, identity decisions, three additional whole-identity holds and 2,524 source-bound field exclusions. The safe R1 is a compatible narrower corpus with those same safety decisions; rollback must never remove them. Raw baseline fields remain private and are not evidence available to the application after exclusion.

The broader source packet contains 248,281 accepted source-field items: 80,826 inherited items and 167,455 newly recovered items. These are not counts of unique facts, new people or qualified experts. The two replayed corpora contain 584,121 and 300,372 passages respectively. Searchable populations differ by four existing identities whose attributable professional material becomes available; no new identities were admitted.

Every deployable package must bind:

1. The frozen baseline and approved repair/exclusion packet.
2. The exact application deployment manifest and all required runtime files, including dependency lockfile and model configuration.
3. The corpus/profile/projection versions.
4. The release-specific vector files, normalized-text keys and generation/proof receipts.
5. Prepared practice locations, source ownership and coordinate provenance.
6. Source, parser, identity-review and enrichment versions.
7. The completed acceptance report and immutable forward/rollback operation ledger.

The installed-dependency receipt additionally binds the actual Node executable/ABI and every installed runtime file (excluding npm `.bin` aliases). Strict readiness rehashes this inventory, validates the model/cache and performs a real normalized 384-dimensional query inference before reporting ready. A lockfile alone is insufficient. Pin the verified Node version in the Docker base; a different executable or installed dependency must fail rather than be accepted by version name alone.

Final deployment-manifest and cache checksums are recorded only after packaging. Earlier preparation receipts cannot stand in for the exact deployed package. The v12 source review has produced additional scope findings; its counts above are a preparation baseline, not a deployable signoff. The final handover must supersede them with the corrected package's receipts.

## Prepare and verify the private package

1. Recheck the current professional-data projection and exclusions against the frozen baseline. Recheck main-branch compatibility and selected archive checksums. Investigate material drift; do not overwrite the approved packet.
2. Run the full expert/repair/interpretation/project and patient suites. Keep source-quality, retrieval, browser, model-availability and performance results separate.
3. Stage the application with `node expert/stage.cjs <new-private-staging-directory>`. Review the allowlist: no raw rows, archives, held-out briefs, credentials or private evaluation evidence belong in the image or public assets.
4. Construct both releases with `expert/repair/package-release.cjs`, supplying the exact frozen baseline commit, staged deployment manifest and final cache descriptor. Its checks reject missing artifacts, invalid source guards, changed identity decisions and incompatible runtime pins.
5. Verify complete local artifact checksums and model/vector compatibility. Transfer through authenticated private volume access to fresh directories. Recheck remote bytes before changing preview configuration. Never upload a partially prepared release over a working directory.
6. Record disk and memory capacity using the actual integrated build. Preparation and serving are different workloads; offline process measurements do not establish hosted capacity.

Use release-specific cache directories whose final component is the release ID. Keep original source archives and provider exports outside the deployed package. The private professional projection and correction packet belong only on the protected volume, never inside a Docker image or a public route.

## Switch the isolated preview

Inspect pending Railway changes first. Do not accept an environment-wide staged change that would affect another service.

Set these preview variables together, using the exact verified package paths and manifest digest from the final receipt:

```text
EXPERT_RELEASE_STRICT=1
EXPERT_DATA_RELEASE=<absolute private path to the selected manifest.json>
EXPERT_DATA_RELEASE_SHA256=<SHA-256 of that exact manifest.json>
EXPERT_CACHE_DIR=<absolute private cache path ending in the selected release ID>
```

Retain preview authentication and the existing DeepSeek configuration. Never clear release mode to make readiness pass. Missing/corrupt artifacts, an incompatible runtime or changed source bytes must leave readiness false rather than fetch another dataset.

Deploy the matching staged application only to the isolated preview. Allow an interruption for volume attachment/restart. After deployment, authenticated health must report the selected release, manifest digest, corpus version, projection versions, hold counts and exclusions. Unauthenticated health must remain minimal; application routes and evidence remain protected.

## Hosted acceptance

Keep a fresh report for each operation; never overwrite a failed attempt.

- Run `expert/repair/verify-hosted.cjs` with the exact expected release/manifest/corpus variables. Use three warmups and twenty representative measured searches; report p95 and individual failures.
- Verify expert-only and simple discovery, granular interests/activity, requested language/service/population constraints, removal/negation, explicit clarification and current MDR controls.
- Check direct profile and exact-passage source routes, all mandatory holds, excluded source fields, obsolete-version errors and private-asset protection.
- Check save-before-opening, partial background and Retry, reload, legacy import, comparison, HTML export and JSON backup. Preserve evidence versions, notes and decisions.
- Check desktop, tablet, 390px, 320px, keyboard, reduced motion and 200% zoom with actual release data.
- Run three distinct DeepSeek explanation checks separately. A validated response counts as success; fallback is recorded as fallback. Rate limits are an availability limitation, not proof of a data defect. Timeouts, malformed output and wrong citations must still fail safely within the explanation budget.

The original 98-case results and the prospective first-run reports remain immutable. Frozen held-out failures do not become passes through retrospective relabelling. If they inform development, use a new sealed confirmation set for subsequent acceptance.

## Rollback rehearsal

1. While R3 is active, save a project containing its brief, rationale, background, notes and an explicit user decision. Export its JSON and readable review pack; record checksums privately.
2. Switch the preview to `enriched-safe-r1-20261008` with its matching manifest, cache and compatible build. Keep strict mode, authentication and all current field/identity exclusions enabled.
3. Verify exact health pins, expected narrower counts and all hold/exclusion checks. Run representative API and browser workflows.
4. Reopen the saved R3 project. Its stored wording, versions, notes and decisions must remain unchanged. A current-scope change may flag a decision for review; it must not fabricate a new decision. Old live citations must return a clear unavailable/changed response, never replacement wording. Resume creates a new search using the chosen release.
5. Restore the exact R3 package. Recheck health, citations, saved projects and representative searches. Preserve distinct operation IDs, deployment IDs, timestamps and report hashes for both directions.

Do not use the old unexcluded R0/R1 packages as this rehearsal's rollback. Do not perform SQL restoration or mutate historical browser projects. A failed target must remain unready until a verified compatible target is selected.

## Signoff and main-product handover

Signoff requires all source, identity, interpretation, retrieval, consistency, performance and recovery gates in the approved plan. Every lost reference candidate requires a recorded explanation even when aggregate metrics pass. Report judged-pool limitations and uncertainty; broad-query precision is not exhaustive corpus recall.

The final handover must identify the exact committed integration revision, deployment package, both release/cache manifests, source counts, known limitations and completed rehearsal receipts. Recheck source/exclusion drift and current main-branch compatibility immediately before signoff. Material changes require targeted revalidation and a new immutable package.

Only after those checks can the status become **ready to deploy to the main Expert Discovery product**. This phase does not activate it.
