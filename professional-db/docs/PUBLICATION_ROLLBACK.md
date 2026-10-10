# Publication and rollback runbook

**No main service activation is authorized by this work.** Both imported v19
packages remain staged and have no product approval event. Keep their private
packages, reports and all prior receipts immutable. Do not edit the shared
`public.integrated_practitioners` table or repoint the existing protected preview.

## Exact approval boundary

The main validation chat must approve an exact immutable package, including
manifest, corpus, code/runtime/dependency, cache, identity and safety pins. R3
approval is not inferred from source-review flags or database tests. If it delivers
new bytes using an existing ID, require a new unique immutable release ID rather
than overwriting the imported history.

After approval, create a private binding from the approved package and independently
verify every artifact. Run the importer against the isolated database. Require its
complete reconciliation report, zero unexplained discrepancies and all existing
holds/exclusions. Confirm source-review, meaning, ownership, privacy and retrieval
acceptance independently; import equality cannot validate a defective package.

A publisher-authorized approval receipt has schemaVersion 1, eventId, releaseId,
decision `approved`, manifestSha256, corpusSha256, corpusVersion,
projectionVersion, safetySha256, authority `main-validation-human-approval`, and
approvalReference identifying the actual main-chat approval. Its hash is canonical
JSON SHA-256 (`util.hash`), explicitly distinct from artifact byte hashes. The
receipt is external trusted input; this tool does not authenticate a chat title or
approve an arbitrary JSON file by itself. Provision publisher credentials only
to the authorized review operator.

Run `node cli.cjs publish ABSOLUTE_RECEIPT_FILE CANONICAL_RECEIPT_SHA256` only after
that approval. Publishing records an approval in the isolated database; it neither
switches a product pin nor deploys. Configure the independent reader with releaseId,
manifestSha256, bindingSha256, corpusVersion and approvalSha256. Omit none. Missing,
wrong, corrupt, incompatible or revoked pins fail readiness and never choose the
"latest" release, mutable cache, live reader or alternate package.

## Derived preparation and isolated workflow

Build/register BM25, semantic/vector descriptors and profiles under a dedicated
directory ending with the selected release ID. Record release/manifest/corpus/
projection/profile/safety/model/runtime hashes in each derived descriptor and
cache key. Preserve frozen corpus text, qualifier order, all source assertions and
reported ranges. Never rerun an unapproved classifier to create historical evidence.

`expert-adapter.prepareDatabaseExpert` requires an absolute exact runtime directory,
model directory and release cache directory. It verifies the runtime manifest,
installed Node/platform/ABI/dependencies/system libraries, vector/model/geography
files and bounded normalized query inference before `engine.ready=true`. Use the
matching Node22/Linux target for the existing v19 receipts. Node25/Windows local
transport checks do not satisfy those receipts. A missing cache or dependency is
a failure, not permission to download another model or fabricate embeddings.

The adapter returns an engine usable by the existing expert server's `createApp`.
Launch it only in a new isolated loopback/private preview with private authentication
when leaving loopback. Keep shared/main expert and patient services unchanged.
Revalidate the exact approval/revocation pin before each served workflow and do not
persist unversioned explanation caches. DeepSeek remains the agreed explanation
model; this branch makes no model API calls or model-selection change.

## Rehearse compatible release switching

1. Import/reconcile approved A and B. Verify identical compatible identity mappings
   and that B's safety decisions are retained by both allowed selections. Older
   R0/R1 packages with fewer holds/exclusions are ineligible rollback targets.
2. In a disposable isolated project, search A, inspect full profiles and exact
   citations, save selected evidence and export JSON/HTML. Record complete pins and
   saved-evidence hashes; retain the original project.
3. Stop only the task's isolated preview, change its explicit pin/config to B and
   start it again. Check readiness, profiles, source citations, cache/model pins,
   exclusions and old saved projects. Historical A citations return A evidence
   through a separately pinned historical reader, or explicit 410 when unavailable.
4. Switch back to A by its exact compatible approved pin; never unset release
   configuration. Verify the original saved payload hashes and safety decisions
   again across search/profile/source/save/export/explanation surfaces.
5. Record restart/switch receipts, versions and performance. A synthetic test of
   this sequence does not replace the final approved-pair hosted rehearsal.

Append a `revoked` publication event if approval is withdrawn. Existing history
remains intact and the pinned reader becomes unready, including with warm caches.
Do not delete release rows or silently serve another package. Rollback is selection
of an explicitly compatible approved package, not removal of present safety policy.

## Recover an import/report failure

Before commit: PostgreSQL rolls back and no release is published. Retain `.failed`
outcomes and original error. Repair code or prepare a new package; retry the exact
binding using a new report path. After a completed commit, an exact repeat import
is idempotent. If report rename/write failed after commit, recover `.pending`,
rehash it and compare to `releases.reconciliation_sha256`; retain its aggregate
summary before publication. Source history is never discarded to hide a failure.

Schema rollback is unnecessary for selecting prior releases. The schema is separate
and append-only. Never undo it by dropping the shared database or consultant table.
Stop only the exact task PostgreSQL cluster when archiving this workspace, using its
explicit `.private/pgdata` path. Back up private database/report/source references
first and never include connection credentials in the integration branch.
