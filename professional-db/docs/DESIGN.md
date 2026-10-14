# Database design and access patterns

## Existing system inspected

Read-only Supabase inspection on 9 October 2026 found DocMap project
`oewczjseteyvyvikxxaz`, PostgreSQL 17, and `public.integrated_practitioners`:
40,876 rows, 32 `do_not_recommend` rows and zero `requires_review` rows. RLS is
enabled; authenticated SELECT and service-role ALL policies exist. The original
table also contains raw, contact, booking, fees and email enrichment. No table in
the existing public schema was migrated, imported into or updated.

The existing server-side Edge Function selects a bounded professional subset and
filters nested location/volume fields. The application reader can load immutable
repair packages; repair adapters enforce original-value hashes, field exclusions
and group holds. `buildCorpus` resolves identities and emits candidates, evidence
and a per-record identity ledger. Search, profiles, source reader and saved projects
already carry release/corpus/profile metadata. Patient routes are separate.

The new layer consumes that existing immutable boundary. It preserves its frozen
corpus instead of rerunning today's classifier and calling the result historical.
The integration branch adds only `professional-db` on the published remote base.
Runtime code is an explicitly supplied, hash-verified package dependency; the
database layer does not require unpublished sibling application files. The legacy
v19 binding-v1 contract fixes profile-v3. Older profile versions require an explicit
binding; unknown versions fail readiness rather than inheriting current app code.

## Private relational model

| Table | Meaning |
| --- | --- |
| releases | Immutable package identity, exact manifest/binding bytes, versions, counts and reconciliation hash |
| identities | Stable opaque application identity anchors; GMC-shaped IDs are historical names, not newly verified registrations |
| members | Exact candidate membership and ordered structured candidate payload per release, including held candidates |
| identity_decisions | Ordered original per-record decisions, source assertions, conflicts and membership; changed decisions require a new release |
| records | Original professional subset and projected records, original full-record hash and projection hash; full original bytes remain in the private package |
| fields | Exact structured fields per release/source record; alternatives and typed registrations remain distinct |
| source_versions | Source-bound content/snapshot assertions, provider label, source key, dates and explicit archive-verification status |
| evidence | Ordered passage text, original type, dates, qualifiers, ranges, contradictions and full immutable payload |
| evidence_sources | Every original source assertion for a passage, in original order, with source version and original field |
| dispositions | Corrections, field exclusions, identity holds and privacy-filter outcomes; rejected/withheld fields cannot return through baseline fallback |
| archive_links | Append-only links to separately rehashed private HTML objects; source dates are never inferred from file times |
| publication_events | Separately authorized exact approval/revocation receipts; package flags cannot populate this table |
| proposals | Private pipeline changes and unresolved conflicts; proposals are absent from product evidence queries |
| derived_artifacts | Append-only release-specific BM25/vector/profile/cache descriptors |

JSONB makes structured fields queryable. Exact serialized payloads preserve property
and array order for frozen corpus fingerprints. This avoids recreating different
evidence IDs from JSONB's property ordering. Text and its classifications are never
regenerated during database import. Dates stay literal with null for unknown.
Ranges stay reported ranges; an inequality is not converted to a count or midpoint.
Evidence deduplication remains exactly as recorded in the package: all distinct
source assertions and ordered qualifiers survive.
The first source-version provider/date assertion is routing metadata, not a
resolved consensus claim. Every original provider/date assertion remains in the
ordered evidence sources (and correction dispositions where applicable). Product
readers use those complete frozen payloads rather than this first metadata value.

Existing IDs provide initial stable anchors across the two compatible release
memberships. This is not approval to create new regulator identities or merge
future people. Future splits/merges need reviewed identity decisions and an explicit
alias/history design extension before publication. Missing GMC is valid for
non-doctor roles. Numeric shape cannot change registration authority.

An original integrated record is a versioned merged input, not a falsely attributed
provider-original HTML record. Its hash semantics are `canonical-integrated-record`.
A repair's snapshot hash is `asserted-source-snapshot`; it becomes byte-verified
only through a verified private archive link. Unknown native provider identifiers
remain unresolved; importer positions or names are not promoted to provider IDs.

## Import, parity and failure behavior

The binding pins manifest, corpus export, source replay and full frozen runtime.
Before writes, the importer rehashes declared package artifacts, checks supported
versions and exact replay/corpus/runtime links, validates provenance/date semantics,
and executes the frozen adapter's before-hash, ownership, protected-field,
segmentation, duplicate, exclusion and hold gates.

Preparation groups every decision for a source record into bounded batches, with
all mandatory holds present for the frozen adapter's global safety checks. Its
results are privately hashed LF-framed NDJSON. Literal U+2028/U+2029 remain source
text; they are not record separators. Regression tests compare batched results to
the whole-packet adapter across batch boundaries and Unicode chunk boundaries.

One database transaction loads the complete dataset. Deferrable foreign keys bind
records, members, decisions, evidence and sources. The release row is inserted
last, after round-trip hashes and the ordered corpus fingerprint reconcile.
Database errors, corrupt artifacts and interruption roll back all writes. The
transaction is serialized by a release advisory lock. A repeated exact import
returns the original reconciliation hash; changed bytes under the same release ID
fail. Historical v17/v19 same-ID packages are intentionally not interchangeable.
Complete evidence/member tables are analyzed before hold reconciliation, and all
parents before final foreign-key checks. This avoids release-only nested scans
when a newly inserted release is absent from previous statistics. A ten-minute
per-statement timeout rolls back a stalled import without publishing anything.

Triggers reject history UPDATE/DELETE and additions to a sealed release. Importer
roles have no UPDATE, DELETE or TRUNCATE grants. A database administrator can always
alter a database; byte hashes and external pins also detect such tampering.
Package Git attributes retain LF line endings across Windows/Linux checkouts,
so migration byte checksums do not drift through automatic newline conversion.

Every imported record, member, decision, field, disposition, passage and source
binding receives a private outcome. Failed receipts are retained separately. A
post-commit report filesystem failure does not unseal a successful dataset: recover
the pending report, verify its hash against the release row, and retain it before
publication. Never replace its history by rerunning under another manifest.

Privacy filtering removes contact/credential/private fields before storage of
professional rows. Omitted paths have explicit dispositions and the exact original
input stays in the private package. This structural filtering does not certify
free text as professional-only: source-scope review remains a publication gate,
including the known pending R3 findings. Nothing is uploaded to a model.

## Restricted access

`docmap_professional` and migration metadata are private schemas, unexposed through
the Data API. PUBLIC receives no schema/table access. Every table enables RLS.
Dedicated no-login reader, importer and publisher roles have distinct grants.
The importer has table-scoped maintenance rights on its five analyzed parent
tables, permitting statistics collection without table ownership or history writes
(PostgreSQL 17+ [MAINTAIN](https://www.postgresql.org/docs/17/sql-grant.html)).
Reader access excludes original records, pipeline proposals, correction inputs
and private archive objects. The corpus identity ledger is readable only for
approved releases, so a reader can verify exact membership/conflicts. Evidence access requires the latest publication event
to be approved. The server reader additionally requires the configured exact
approval receipt hash; it revalidates on requests. Revocation defeats warm caches.
Publication ordering uses a generated monotonic sequence rather than timestamp/
event-ID sorting: a later revocation also wins inside one transaction. A regression
checks this under the actual restricted publisher and reader roles.

Real deployments should grant these no-login roles to separately provisioned
server credentials. Granting importer/publisher privileges to a browser or
`authenticated` defeats this model. Keep the schema outside Data API exposed
schemas and originals in a private bucket/directory; signed archive access, if
added, needs a separately authorized server endpoint. No such endpoint is exposed
here. Remote database connections require verified TLS.

The grants/RLS/private-schema approach follows the current
[Supabase Data API security guide](https://supabase.com/docs/guides/api/securing-your-api).
The recent PostgreSQL minor-upgrade advisory was checked; these migrations use
none of the affected ltree, encrypted pgcrypto or btree_gist features.

## Practical query paths

- **Discovery preparation:** exact release row -> ordered members/evidence ->
  verified corpus fingerprint -> release-specific existing BM25 and semantic
  preparation. `loadRows` is a restricted reconciliation path, not the public reader.
- **Profile:** pinned release/corpus/projection/profile tuple -> candidate membership
  -> evidence by `(release_id,professional_id,ordinal)` -> existing profile renderer.
  Held candidates have no eligible passages. No generated biography is substituted.
- **Exact citation:** saved release/manifest/corpus/approval pin + candidate/evidence
  IDs -> exact historical evidence and ordered `evidence_sources`. Missing/revoked/
  corrupt history returns explicit 410; current evidence is never substituted.
- **Export/save/explanation cache:** store the complete version tuple with exact
  evidence payload. Cache keys include release, manifest, corpus, projection, profile,
  safety policy and model/runtime descriptor. Source changes require new cache keys.
  Saved project evidence remains a historical snapshot even when unavailable live.
  `projects-adapter` attaches exact evidence/version envelopes to existing project
  backups, validates saved search text/types/dates/qualifiers against database
  evidence, adds versions to explicit team decisions, and retains metadata in
  JSON and printable exports. A changed selection marks a review requirement;
  it never rewrites a previous team decision or its historical evidence.
- **Pipeline update:** stage immutable source version and proposed add/change/remove
  operations -> inspect ownership/scope/parse/quality/conflicts -> compile a new
  immutable reviewed package -> import/reconcile -> separate exact approval event.
  There is no proposal-to-live UPSERT.

The staging preview demonstrates read/search/profile/citation/export. The adapter
prepares the existing expert engine without changing patient APIs or default service
selection. Full target-runtime semantic verification and approved-release saved
project rehearsal remain publication dependencies, not consequences of transport parity.
