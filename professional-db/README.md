# DocMap professional database

Independent integration branch: `codex/docmap-professional-database` in `ranking_algo`.
It is based on published `master` (`c194190`), with only this directory added.
The staging checkout retains the historical app privately; runtime dependencies
come from the explicitly supplied immutable package, not unpublished Git ancestry.
The existing expert and patient applications are unchanged. This package owns the
private database schema, atomic importer, reconciler, pinned reader, pipeline
proposal validator and a loopback preview.
`projects-adapter.createProjectAdapter` takes an absolute immutable runtime and
its manifest hash, then adds exact database evidence/version envelopes to existing
saved projects and retains them through JSON/print exports and team decisions.

Current scope is **staging**, pending the main validation chat's approval of an
exact immutable package. Source-review flags and historical preview receipts do
not constitute product approval. No real release is automatically approved.

- [Design and query paths](docs/DESIGN.md)
- [Current release inventory](docs/RELEASE_INVENTORY.md)
- [Cursor output contract](docs/PIPELINE_CONTRACT.md)
- [Publication and rollback](docs/PUBLICATION_ROLLBACK.md)
- [Validation results and limitations](docs/VALIDATION.md)

Install with `npm ci --ignore-scripts` in this directory. Connection settings live
in an absolute private JSON file, referenced by `DOCMAP_DB_CONNECTION_FILE`.
Never put its contents, credentials or original archives in Git, logs, browser
configuration or model requests. Use a dedicated local/staging database.

`node cli.cjs migrate` applies the checked migration history only to that
configured database. Set `DOCMAP_TEST_RUNTIME_DIR` to the supplied immutable
expert runtime before `npm test`; the fixtures create and drop disposable local
test databases and copy runtime code privately. No validation-workstream source
or private evidence is included in this branch. Readers and preparation use the
release's verified runtime, rather than whatever app code is beside this package.
`node --expose-gc cli.cjs import ABSOLUTE_BINDING_FILE BINDING_SHA256 ABSOLUTE_REPORT`
verifies immutable artifacts and imports atomically. Complete outcomes go to a
private NDJSON report; its aggregate summary contains no professional quotations.

Generate a fresh inventory with `node --expose-gc inventory.cjs ABSOLUTE_HISTORY_ROOT
ABSOLUTE_NEW_PRIVATE_OUTPUT`. Inventory reads existing artifacts without changing
them. It generates import bindings for the current v19 pair. A binding is an
integrity descriptor, not an approval receipt.

Start the independent loopback preview with `node preview.cjs` and an absolute
`DOCMAP_PREVIEW_CONFIG_FILE` containing an explicit pin, port and `staging: true`.
Staging preview readiness is labelled separately from approved product readiness.
It uses the existing BM25 implementation without model calls. The product adapter
in `expert-adapter.cjs` requires exact approval, runtime, geography, vectors and
query-embedding verification; it does not activate any service.
`profiles.prepareProfiles` writes hashed release-specific profiles with the exact
frozen profile renderer, retains version metadata and excludes held identities.

The local database, full reconciliation reports, original-source references,
bindings and preview configuration are under ignored `.private/`. Retain that
directory privately when moving the checkout. It is not included in the push.
