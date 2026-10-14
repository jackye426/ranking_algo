# Isolated expert preview: verification and rollback

**R1 is restored and ready on the authenticated isolated preview.** The final hosted run completed on 2026-10-08 at 15:21:01 UTC with 82/82 non-AI checks passing, exact manifest/corpus pins, and p95 428 ms across 20 measured searches after three warmups (maximum 448 ms). All three AI checks returned explicit evidence fallback, so the overall report is failed and AI acceptance remains incomplete. The separate earlier diagnostic confirmed HTTP 429 on the configured provider route; it does not establish the upstream status of every later attempt. R2 remains withheld and was never activated because a genuine retrieval recall regression remains. No eligibility, ranking or weighting change was made to clear that gate.

The actual R1-to-R0 rollback had already passed 82 API checks at 15:16:44 UTC and the saved-R1 project browser scenario passed 20/20 checks at 15:17:14 UTC. Rollback search p95 was 6,326 ms (maximum 6,366 ms), below 8,000 ms. The initial R0 run had p95 405 ms; the initial R1 run had p95 736 ms and all 80 non-AI checks passed, with three AI fallbacks. The private `release-operation-ledger.json` records the distinct operations and receipt hashes. This workflow does not change the shared database, original expert service or patient application.

## Pinned release and authentication

- Keep each baseline, repair packet and manifest immutable. A correction creates a new release ID and package.
- Set `EXPERT_DATA_RELEASE` to the absolute manifest path and `EXPERT_CACHE_DIR` to a dedicated cache path whose final directory name is the release ID. Never unset the release variable as a rollback: that re-enables the ordinary live reader.
- Set a strong `EXPERT_PREVIEW_PASSWORD` privately, without command-line arguments or logs. `EXPERT_PREVIEW_USERNAME` defaults to `docmap`. Rotate through the deployment environment and restart the preview. An explicitly empty password fails configuration.
- Unauthenticated readiness returns only `{"ready":true}` or `{"ready":false}`. Every other route, asset and evidence endpoint requires Basic authentication over HTTPS. Authenticated health includes release and projection metadata. Credentials are not forwarded to model clients.
- Keep the uploaded package readable by the unprivileged application user. Keep private packages outside the static asset directories. The runtime stage allowlist does not include repair inputs or baseline data.
- Pin the frozen identity-review and enrichment SHA-256 values in the final manifest. Both were independently verified in the local replay. The two-hold `r0-safe-20261008` and `bupa-r1-20261008` packages are superseded and must not be activated.

## Offline failure checks

Run from the application checkout:

```text
node --test --test-concurrency=1 expert/releases.test.cjs expert/releases-server.test.cjs expert/preview-auth.test.cjs expert/repair/baseline-replay.test.cjs expert/repair/verify-hosted.test.cjs expert/repair/segment-corpus.test.cjs
```

The latest focused run passed 33 tests with zero failures or skips. It covers stale before-value hashes, changed artifact bytes, unsafe paths and junctions, protected identity fields, missing mandatory holds, blank replacements, duplicate corrections, identity/enrichment checksum mismatches and unsupported package/baseline versions. A corrupt pinned upload leaves the service unready with HTTP 503 and makes no network-reader fallback. Stale profile or corpus citations return HTTP 410; held identities return HTTP 404 when authenticated. Unauthorized clients receive HTTP 401 before request-body processing. Streamed baseline reuse and bounded corpus segments preserve Unicode and reject changed bytes, length or version.

The mandatory held source rows are `bupa_6445`, `bupa_26882` and `bupa_22318`. The complete identity group remains withheld, including its otherwise valid source passages. All prior identity holds and all 32 pre-existing excluded source rows remain preserved.

## Hosted acceptance

Supply the preview credentials through the same environment variables. Set `EXPERT_EXPECTED_MANIFEST_SHA256` and `EXPERT_EXPECTED_CORPUS_VERSION` to the exact receipt values below, then run:

```text
node expert/repair/verify-hosted.cjs https://PREVIEW-ORIGIN EXPECTED-RELEASE-ID ABSOLUTE-PRIVATE-REPORT.json
```

Add `--ai` only for the authorized selected-professional explanation checks. That performs one explanation request for each of three distinct briefs. The default run does not call the explanation endpoint. Search interpretation follows the configured preview service behavior.

The script excludes three warmups, measures 20 actual searches, and requires nearest-rank p95 below 8 seconds. It checks release/version metadata, card/profile ownership, exact source excerpts, original citation links, pagination when available, legacy-link labeling, HTTP 410 for obsolete versions, all three held groups, and HTTP 404 for private artifacts. It also checks unauthenticated minimal health and the protected application/asset/source boundary when credentials are configured.

Reports contain bounded IDs, hashes, counts, statuses and timings. They omit credentials, names, source excerpts and full responses. A timeout, rate limit, missing candidate, wrong release, exposed artifact or failed check makes the report fail. When expected checksum/version variables are supplied, a same-ID package or corpus substitution fails before any search or explanation call. AI fallback remains explicitly recorded as fallback and does not count as a successful DeepSeek explanation. The script does not retry away a failure. Browser layout and clinical meaning need separate human review.

## Exact release receipts

Paths below are relative to the private repair output directory; packages and reports are not web assets. All releases use baseline SHA-256 `69ed571e67c79d8ed1327b74e23dd999ea5b39c53bd20553f23f34afae9c3a8e`, profile projection `expert-profile-v2`, and repair projection `expert-repair-v1`. Fresh and reference professional rows matched exactly for all 40,876 rows; only wrapper fetch metadata changed. The committed and frozen data projection differ only in line endings. Identity-review and enrichment code are byte-identical and pinned in each final package.

| Release | Final manifest SHA-256 | Corpus version | Passages | Approved patches |
| --- | --- | --- | ---: | ---: |
| `r0-safe-20261008-v2` | `e44e5a8460b7a206a93b81fa24d4d9c1ddd899c62f973e7273ab45c7b908aee6` | `expert-corpus-v2-84c7535787ffa50edce1` | 277,343 | 0 |
| `bupa-r1-20261008-v2` | `8409d33afcb2c8cfbfd035912e9b04d40db0e8bdfef5e846923c7b964b80fe9d` | `expert-corpus-v2-e9514a65fadc1ab935b6` | 271,894 | 24,917 |
| `context-r2-20261008` | `5376dbc5d04e661b3f00e54fe744db9b42da6f79adcd12e81b92ccf48ae4ba90` | `expert-corpus-v2-3506499e3898780ca0af` | 352,365 | 39,002 |

Final manifests are under `releases/RELEASE-ID/manifest.json`. Replays are under `replay/RELEASE-ID/replay-report.json`. All three replays passed: exact membership of all 40,221 groups and all 40,576 named-row mappings was preserved; no prior hold was released; exactly the three mandatory groups were additionally held. Each release has 22,268 searchable candidates and 17,949 held groups. All 32 baseline excluded source rows, spanning 31 groups, remain held with no passages. The 300 missing-name rows remain excluded before grouping.

| Receipt | SHA-256 |
| --- | --- |
| R0-v2 replay report | `4922e941fd5ebe2cef36fb2ca5e83eda80a1ec21c31ad84798e30a9a35a4482e` |
| R1-v2 replay report | `994362cdc08d2088d0d23c6863b253a02d6d5e3bc3673d44be96b88e972aa2bf` |
| R2 replay report | `6da767be1a41680e9b3f2489dbaf0f38d69596ad5d5f5b337e7dfd8c6da813b1` |
| Hosted R0-v2 report (`hosted-r0-before-retry.json`) | `ec38787624b67a137d825409b83373a971eb3a1df06cf923c8dbb7bec140e02b` |
| Actual rollback to R0-v2 (`hosted-r0-rollback.json`; 82 passed) | `3bef7f14eb63a525ad51c9ae33ad87f85017c7ab8be1c7f4724a6a3c8b3c8f46` |
| R1 saved project on R0 (`browser-qa/r1-saved-on-r0-v3-report.json`; 20 passed) | `9e108cfc949dab688cc30a79250fdfed4a512993e85261181021c64a5bf7261d` |
| Hosted R1-v2 report (`hosted-r1-ai.json`; three AI checks failed) | `4a17acfc3a691706a3d21a06bc6dad80567a6c3f599b9767ed8d2541ac28d4b0` |
| Final restored R1 (`hosted-r1-restored.json`; 82 non-AI passed, three AI fallbacks) | `ad0bf412624f5c9b18a6b9c16445ebfaa37481e87022abc617e6ee9136d2a0af` |
| R1 provider diagnostic (`preview-ai-diagnostic-r1.json`; one HTTP 429) | `007a90c82cb135d4136a3c142d87cb538515550741ce2678350d42735fb1a3b4` |
| R2 offline evaluation summary (promotion withheld) | `2702387ec1db7d94d51ae8681e6af3c7773a222ce680b786075b14a7cb72ab83` |
| R2 independent delta review (promotion remains withheld) | `95e0bb2d236ccfbac825db2148405892ac19d05583c865585f4f822e513f1769` |
| Backup manifest (`source-backup/backup-manifest.json`) | `94fa32ffa4c645169267cd94bf4d75aa017e4d0cd069ec807723b2e29c134abb` |

The R1 replay records the original preparer manifest SHA `49f0e3a64f683a468d5606d4025dd5fabb8a900198040f29384dc1c4dae80baf`. The final deployment package adds runtime pins and uses different JSON serialization. Both repair packets have the same canonical value hash `a1a26d76851bb9805ac0bbfe7710852989bf5231747fe9c106453f9a1f4c8402`, covering all 24,917 patches and three holds. Use the final manifest hash in the table for hosted verification; retain both original receipts without overwriting either package.

Every replay restored and rehashed three independent source snapshots plus checked the Bupa source metadata against the 37,449-file backup manifest. This proves the sampled offline restoration; it is not a full backup-restore exercise.

The R2 corpus export is 577,511,452 bytes and exceeds the ordinary single-string JSON limit. Use `replay/context-r2-20261008/segments/segments-manifest.json`, SHA `875267e80a99e5291a8ecfe7b85b1bc0d2e568b94a2595a6e13b30e70c4b2bb1`, for offline consumers. Its 36 bounded array segments retain 40,221 candidates, 352,365 passages and 40,876 ledger entries. The manifest binds per-segment bytes/checksums/counts, original corpus SHA `122d8e40e0e2c86c6f8f531b33fc44543c7995ae6de5963904a43aa24183e866`, metadata and the version-derived logical fingerprint. It is written only after all checks pass; the original export remains immutable.

## Promotion and stop conditions

Promote only the isolated authenticated preview, one release at a time. Retain separate immutable hosted reports for R1, the rollback rehearsal to R0, and R2; run the authorized three-brief AI checks explicitly when assessing AI acceptance. Check the exact manifest/corpus variables before each run. Keep the release-specific cache and manifest paired. Retrieval evaluation, source-comparison evidence and browser review are separate gates from the hosted harness.

R2's failed retrieval gate is concrete: `r2-cardiac-ct-03` hybrid top-20 recall fell from 1 to 0.5 because `bupa_11411` moved from rank 20 to 21. Round-two hybrid recall fell from 79.17% to 77.08%. Independent delta review supported the new condition evidence and found no inspected language/service winner or promotion to performed clinical activity. No new critical failed checks and unchanged source support do not erase the regression. R2 remains withheld in this delivery. Eight bounded source/BM25/qualification checks passed, but their tested phrasings required clarification, so they do not establish general search acceptance. Any future promotion needs a separately approved remedy and renewed gates.

Stop on any identity membership change, lost baseline exclusion, missing mandatory hold, unsupported packet field, changed source/before checksum, newly confirmed mixed person, broken citation ownership, exposed private artifact, failed readiness, latency failure or AI fallback. The loader validates packet integrity and the bounded provenance structure; it cannot independently prove that a source excerpt belongs to the person. Source/name/registration comparison and independent review remain required before packaging. Runtime pin fields are optional in the generic loader for compatibility; all final releases in this runbook include them and must retain them.

Keep the full 1,436-test suite receipt separate from the 33-test focused run above: those counts overlap and must not be added. The focused run validates the latest receipt and streaming changes; it does not turn pending hosted or model checks into completed ones.

## Rollback

The completed API rehearsal used R1 deployment `112c4e03-8c90-45e2-ba37-891e3d0924ee`, restored authenticated code from deployment `67127352-342d-4b81-a3d4-9c68bfd9dd5e`, and produced rollback deployment `b9c9e422-93db-47a2-b167-39e146519c0d` with R0 data/cache. The saved-R1 browser scenario preserved its one saved candidate, background, brief, decisions, notes, rationale, corpus and release identity across import/export. The R1 citation returned HTTP 410 on R0, with no search, live-profile fetch, AI request or browser runtime error. Its existing review marker remained true. This proves that bounded scenario rather than every possible legacy backup. R1 was subsequently restored as successful deployment `f82de7d8-b3f2-4995-bae1-dd5704a9b855`; authenticated readiness and all non-AI hosted checks passed. The following procedure remains reusable.

The measured p95 changed from 405 ms in the initial R0 run to 6,326 ms in the rollback run. Both satisfy the agreed bound. These are end-to-end searches including the configured brief interpretation, provider/network time and local retrieval; they do not isolate which component caused the variation. AI explanation checks were not requested in either R0 run.

1. Keep the preview private and retain the failed report. Do not edit the failing package in place.
2. Select the verified three-hold R0 package `r0-safe-20261008-v2` and the matching reviewed runtime build. Keep authentication enabled.
3. Change both preview variables together to the R0 manifest and its separate cache, for example `/data/releases/r0-safe-20261008-v2/manifest.json` and `/data/expert/r0-safe-20261008-v2`. Use the actual uploaded package location. Restart only the isolated preview service.
4. Confirm authenticated readiness reports the expected release and manifest hash. R0-v2 replay recorded corpus `expert-corpus-v2-84c7535787ffa50edce1`, 40,221 groups, 22,268 searchable candidates, 17,949 held groups and 277,343 passages. A changed runtime projection may require a fresh replay rather than assuming these counts still apply.
5. Run hosted acceptance against R0 and retain a new report. All three held-group source pages must remain HTTP 404. Old versioned links must fail explicitly rather than substitute new evidence. Saved projects retain their original evidence; rollback does not migrate them.
6. Resume review only after the rollback report passes. No SQL restoration, source-snapshot deletion, source-table import or original-service action is part of this rollback.

If the pinned package cannot load, retain the failed closed state until the previous verified package is selected. Do not copy a mutable cache over the package or clear the release environment variable.
