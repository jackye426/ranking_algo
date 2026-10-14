# Staging validation and publication dependencies

Validated on 9–10 October 2026 in a dedicated loopback PostgreSQL 18 cluster,
database `docmap_professional_stage`, port 55439. The live DocMap Supabase project
was inspected read-only and uses PostgreSQL 17. No shared consultant/patient table,
main expert service, protected preview or main validation source file was changed.

The publish branch starts at remote `master` commit `c194190` and adds only
`professional-db`. The historical validation checkout at `e8e794e` is retained
locally for evidence and existing patient regression results; its 426 unrelated
file changes are not part of this branch. Runtime dependencies are verified from
the supplied immutable package. No evidence, credentials, private report or HTML
archive is pushed.

## Imported package fidelity

Both v19 packages imported atomically and remain unapproved. R3
(`enriched-r3-20261009-v4`) has complete private reconciliation report SHA-256
`4bdaa6fb55a3c1abaab23982d6702f8da2215fbe924f7a0cd6a0b0610da0f819`.
Safe (`safe-r1-20261009-v4`) has report SHA-256
`26172133a0a3049ba29bf9fae32e23b98fa2685e14abe88822f06e0793bcf853`.
Both report files were independently rehashed against sealed database receipts.

| Representation | R3 v19 | Safe v19 |
| --- | ---: | ---: |
| Original professional records | 40,876 | 40,876 |
| Identity groups | 40,221 | 40,221 |
| Held identity groups | 18,013 | 18,013 |
| Eligible indexed candidates | 22,208 | 22,204 |
| Evidence passages | 577,834 | 300,173 |
| Structured field outcomes | 1,407,578 | 1,390,139 |
| Ordered evidence/source bindings | 611,384 | 328,128 |
| Source versions | 96,149 | 72,206 |
| Recorded corrections | 42,301 | 24,862 |
| Source-bound field exclusions | 2,890 | 2,890 |
| Additional mandatory holds | 67 | 67 |
| Complete reconciliation outcomes | 2,905,434 | 2,268,257 |
| Unexplained discrepancies | 0 | 0 |

The ordered file/database comparisons independently checked all 40,221 candidates
and 40,876 identity decisions per release, and all 878,007 passages across both.
Canonical values **and exact JSON serialization order** matched for each item.
Both exact repeat imports were idempotent; normal approved readiness rejected both.
Full payloads retain source
ownership, wording, qualifiers, dates, source order, volume ranges, contradictions
and exclusions. No classifier/enrichment was rerun during import. Import equality
does not certify the package's unresolved source or meaning findings.

An additional independent audit compared every original professional subset and
projected record to the byte-verified preparation artifact: 81,752 release-record
representations. It checked all 168,355 source versions and all 939,512 ordered
source assertions, including content/version IDs, original fields, URLs, dates and
foreign-baseline rejection. Its complete private outcome report has SHA-256
`ca119365157377e5c369778c67da467a47329cdd3c239f74491db4f4b669f41e`,
with zero discrepancies. The final audit confirmed all eight migration checksums,
zero real approval events and zero evidence visible to the restricted reader.

The staged pair has zero identity-mapping and hold differences. This supports
compatibility preparation; it is not an approved-pair switching rehearsal.

The six supplied recovery/hold examples passed for both: Gillett, Pericleous, Hughes,
Hayley, Philip and David. Held examples have zero eligible passages.

R3 import/preparation/reconciliation took 1,713.9 seconds on the loaded workstation;
the final foreign-key check took 132.0 seconds after analyzing parent tables.
Complete transport comparison and BM25 preparation took 350.1 seconds. BM25
construction took 16.9 seconds. Twenty local warm searches, after three warmups,
measured p95 39.9 ms and maximum 61.6 ms. These are staging transport/BM25 results,
not hosted latency, semantic retrieval, relevance or AI acceptance results.

Safe import/preparation/reconciliation took 932.7 seconds, with 85.2 seconds for
final foreign-key checks. Its complete comparison/BM25 preparation took 193.7
seconds; BM25 construction took 9.5 seconds. The same twenty warm searches measured
p95 18.1 ms and maximum 25.3 ms. The final staging receipt confirms both comparisons,
both repeats, both sets of examples, zero real publication events and 37,358 private
archive references. An interrupted attempt is not counted as a successful dataset.

## Private original archives

All 37,358 retained HTML objects, totaling 4,976,068,676 bytes, matched the existing
backup manifest. There are 37,118 distinct content hashes; equal bytes do not prove
equal people or source ownership. The full private catalog SHA-256 is
`5ee20470ab37cd77194986cbc2ec46e3f00244065eea7c1e4205e6013ebd55d8`.
All objects were rehashed again during atomic private-reference registration,
which took 86.3 seconds with bounded independent reads and batched inserts.
Original HTML remains in the existing private archive. Neither verification nor
file modification times become source/observation dates or ownership approval.

## Regression verification

- 18 database/package/reader/project/profile/archive/preview tests passed from the
  clean remote-base checkout, using the exact external frozen runtime.
- 243 relevant existing patient tests passed in the historical application checkout.
- 53 existing profile, saved-project, source-reader and release/server regressions
  passed. Patient and existing application files are unchanged by this branch.
- The dependency install/audit reported zero vulnerabilities; package scripts were
  disabled during dependency installation.

Fixtures include sparse and non-doctor profiles, multiple sources, conflicting
identifiers, malformed/stale/duplicate input, repeated evidence, CT/MR, negation,
missing dates, inequalities/procedure ranges, Unicode/multichunk framing, interrupted
imports, denied staged/unknown/corrupt pins, immutable history, source-byte changes,
historical citations, versioned exports, saved decisions and compatible rollback.
Complete envelope/version/audit checks reject malformed root delimiters, trailing
content and wrong array shapes before writes; array scans validate every record.
Approval/rollback tests use synthetic releases in disposable databases only.
Imports were also executed under the actual restricted importer role, including
statistics collection, with no publication permission. Restricted publisher/reader
tests prove that same-transaction revocation wins independently of event-ID spelling.
Quarantine must match the proposed source and field or explicitly hold the identity.

Failed staging attempts were retained and rolled back. Initial SQL null handling
was corrected; an inefficient report keyset scan was replaced by indexed composite
keys. New-table estimates selected a release-only index for deferred evidence FK
checks and a new release's hold join, so complete parents are now analyzed before
reconciliation and constraint checking, with a ten-minute per-statement timeout. Node 25
readline split literal U+2028/U+2029 inside valid JSON strings; LF-only NDJSON framing
now preserves those characters. Regression fixtures cover the framing failure.

## Outstanding publication gates

There are no real approval events. Normal product readiness rejects the staged R3
and safe packages. The isolated preview labels its explicit staging override.
The actual R3 preview smoke test passed CT/MR search, exact citation hash equality,
profile/export version equality, saved-envelope integrity, held-profile 404,
historical-unavailable 410 and private-path 404. It runs only on loopback port 55440.

The main validation chat must approve the exact immutable broader package before
approved publication, target-runtime semantic caches, full product rehearsal and
approved-pair switching can be claimed. Existing v19 inference receipts require
Node 22/Linux; local Node 25/Windows does not satisfy them. The pinned inference
adapter explicitly rejected Node/platform/ABI mismatch in 171 ms, before corpus
loading or a model request. Docker was unavailable,
so matching hosted/runtime verification remains a dependency. Cursor's repaired
pipeline delivery has not been accepted by this database workstream.

Follow [the publication/rollback runbook](PUBLICATION_ROLLBACK.md), including exact
approval linkage, source/meaning/privacy review, compatible safety decisions, saved
project/citation rehearsal and target-runtime checks. Do not activate the main
service. Staging fidelity is complete only for the receipts explicitly marked
passed; it is not production readiness.

## Private evidence locations

The staging checkout is
`C:/Users/yulon/Documents/ChatGPT/Expert Network/database-workspace/professional-db`.
Its ignored `.private/` contains inventory bindings, the PostgreSQL cluster and
credentials, failed receipts, full archive catalog/registration receipt, patient
regression logs and `staging-proof-retry-20261009` with complete outcomes, per-release
summaries, examples, ordered parity, BM25 descriptors and preview configuration.
The safe proof and combined staging summary are in `staging-proof-final-20261009`.
That directory also retains the complete additional source/original audit and
its aggregate receipt. Full per-release semantic preparation/profile generation
and the hosted approved-pair workflow remain the publication phase.
The clean branch checkout is the sibling `database-publish/professional-db`;
its ignored `.private/` contains clean-branch tests and preview diagnostics.
Keep private evidence and credentials separate when moving or sharing the branch.
