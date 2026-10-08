# Bupa offline repair preparation — 8 October 2026

This preparation creates private source-backed proposals. No original scraper
or importer was run; original drive files, database rows, runtime application
code and deployment were not changed by these Python tools. The full run used
the independently copied and hashed source backup. No model was called.

## Inputs and identity gates

- Fresh professional baseline: 40,876 rows, SHA-256
  `69ed571e67c79d8ed1327b74e23dd999ea5b39c53bd20553f23f34afae9c3a8e`.
- Frozen Bupa array: 37,195 rows, SHA-256
  `f1af82cf966703e1d58abc833892386210629c98b69298e8033736bce8a84f7d`.
  Its array index binds to `bupa_<index>`; every row is accounted for.
- Snapshot hashes are checked against the independent backup manifest before
  parsing. Names must agree across baseline, frozen row and source HTML. A
  matching explicitly typed GMC, HCPC or GDC registration and a unique numeric
  stored print route are required before attaching a source URL.
- Proposed replacement fields must equal their frozen Bupa predecessor, and
  the isolated legacy extraction must reproduce that predecessor from the
  actual HTML. This preserves fields already merged with other sources.
- Unknown encoding, ambiguous source identity, missing URL metadata,
  contact/personal content and failed character/boundary checks are withheld.
  Recovery never guesses words from damaged text.

## Completed text package

Private package `bupa-r1-20261008-v2` contains 24,917 field proposals across
10,913 source rows. The four fields contain 6,832 About me, 6,969 clinical
interests, 6,969 areas-of-interest and 4,147 research-interest proposals. The
clinical/areas figures are two projections of the same source section and must
not be described as separate newly discovered facts.

All 37,195 rows were processed in batches of 1,000: 8,247 had only proposed
repairs, 2,666 had proposals plus withheld fields, 14,990 were unchanged and
11,292 had no accepted repair. Field withholding is not an identity exclusion.
There are exactly three mandatory identity holds: `bupa_6445`, `bupa_26882`
and `bupa_22318`.

The source accounting ledger includes 103 malformed JSONL lines (line/error
and hashes only), 120 additional duplicate snapshot references, 283 unbound
current HTML files, zero missing referenced snapshots, and 258 mapped rows
without URL metadata. Orphan files were not assigned to people by name.

The reproducible review ledger contains 40 targeted risk profiles, 60 seeded
controls and 200 additional seeded profiles. The separate BeautifulSoup
verifier reopened their actual HTML and passed all 300 checks, including 194
proposed sample fields, exact source text, boundaries, snapshot hashes, names
and typed registrations. This is automated source comparison; the ledgers
explicitly state `humanReviewed: false`.

The runtime identity replay, performed separately, confirmed unchanged source
group mappings and retention of existing holds plus the three mandatory holds.
The root packager subsequently created the final private packages under
`repair-private/releases/` with identity-review and enrichment code-hash pins.
The original generated `repair-private/bupa-r1-20261008-v2` artifact remains
unchanged; it is distinct from the final pinned package with the same release
ID under `releases/`.

| Final private package | Manifest SHA-256 |
| --- | --- |
| `releases/r0-safe-20261008-v2/manifest.json` | `e44e5a8460b7a206a93b81fa24d4d9c1ddd899c62f973e7273ab45c7b908aee6` |
| `releases/bupa-r1-20261008-v2/manifest.json` | `8409d33afcb2c8cfbfd035912e9b04d40db0e8bdfef5e846923c7b964b80fe9d` |
| `releases/context-r2-20261008/manifest.json` | `5376dbc5d04e661b3f00e54fe744db9b42da6f79adcd12e81b92ccf48ae4ba90` |

All three passed the source-bound loader and identity replay. At handoff the
root reported R0 protected hosted checks passed, R1 deployed and warming its
cache, and R2 privately staged but not activated pending evaluation. Final
hosted acceptance and complete search acceptance are not claimed. The frozen
search pack still has preexisting critical/aggregate failures; R1 also has one
semantic-only rank-20-to-21 loss despite unchanged hybrid/BM25 case coverage.
See `QUALITY_AND_UNRESOLVED.md` for the prioritized remaining work.

## Source collision discovered during recovery

The original scraper stored the last URL slug as its HTML filename and opened
that path for writing. Different people with the same named slug could
overwrite the same snapshot. Historical CSVs corroborate this collision for
Ravi Lingam and Robert Smith: their current rows remained internally consistent
with a different professional than the available snapshot, so proposals were
withheld without inventing a current-row exclusion.

David Jones (`bupa_22318`) is different: the current ophthalmology row also
retains frozen osteopathy interests, procedures and qualification. The source
trace confirmed mixed attribution, so the parent authorized a third mandatory
identity hold. The v2 packet contains the same 24,917 repairs as the prior
packet and adds that hold; David already had no accepted repair. Prior two-hold
and provisional packages remain immutable and withheld.

The 37 disagreements from a historical URL CSV remain provenance-proposal
flags, not blanket row holds. The current snapshot can independently prove a
different valid binding; no URL from the conflicting old CSV is imported.

## Additive context

The separate context stage is limited to explicit language list items and
Offers. It excludes already-held candidate groups using the independently
verified eligibility artifact, and requires the same typed identity, source
URL and snapshot checks. Offers are service metadata; they do not establish
performed work or current availability. Headline professions are not inferred.

An initial pass caught a source-shape omission: Bupa language list items are
inside `ul > div.tooltip > li`. The parser now accepts this exact observed
wrapper and direct list items, with regression coverage. Arbitrary descendants
remain withheld, and tooltip attributes never enter evidence text. The first
context artifact is withheld; the v2 output and independent verification are
the artifacts intended for the final combined package.

The completed v2 context artifact covers all 37,195 mapped rows and proposes
32,951 literal items across 13,014 eligible rows: 24,683 Offers items across
12,210 rows and 8,268 language items across 4,464 rows (these row sets overlap).
It withholds 17,222 ineligible rows and 282 rows without typed identity proof;
two of those also have a frozen-GMC mismatch. Another 6,677 rows produce no
context proposal. Two individual language items have unknown encoding and are
withheld in the per-row ledger.

The independent BeautifulSoup check passes 200/200 selected source profiles
and all 521 sampled items. Whole-packet checks confirm fresh baseline hash,
unique row patches, eligibility, absence of all three mandatory holds,
null-before-value hashes, literal source kinds/labels and unknown dates kept
null. The context proposals also pass the current runtime adapter in memory.
No application file or persisted baseline is changed by that validation.

Private context artifact: `bupa-context-20261008-v2/context-proposals.json`;
SHA-256 `d81a53d975b9620d287d523a358afc04580167d7a2075d38f4508b4ef9f6c9cc`.
Its `row-outcomes.jsonl`, `summary.json` and `independent-source-checks.json`
record exact source evidence, gate results and verification. These values are
additive source context; they are not a claim that all are new facts absent
from other merged fields.

## Validation and operational limits

The 30 Python fixtures pass, covering the lowercase b/r defect, block versus
inline boundaries, entity decoding, CT/MR and negative list context, encoding
and privacy holds, strict field lineage, required identity holds, historical
URL disagreement handling, Offers, language proficiency and tooltip wrappers.

Source and observation dates remain null when unknown. Stored print routes
were recovered from checked snapshots and were not live-verified. Hashes and
review IDs bind each proposal to exact input and parser output. The proposal
`approved` flag means these deterministic gates passed, not human approval.

Source-changing repairs require a new release and derived evidence/corpus
cache; earlier evidence IDs and old citation text must not be overwritten.
Rollback selects the retained previous immutable release and its own cache.
The parent owns final packaging, corpus/display checks and any later promotion.
