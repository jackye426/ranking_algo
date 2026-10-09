# Independent provider-context review — 8 October 2026

**The current immutable `professional-context-r2` proposals and their merged
`context-r2-proposal` packet pass this source and contract review.** This is
automated verification plus code review, not human review or release approval.
No full corpus build was run and no baseline, source file or application code
was changed. Ten focused regression tests were added in
`context-source-review.test.cjs` and pass.

## Complete source comparison

All 47,875 accepted review-ledger items across 3,003 existing rows were compared
against their actual backed-up original fields and array indices. Every item
passed exact text, source-file checksum, source label, allowed field/type,
canonical provider URL, unique matching baseline URL, compatible name, GMC
agreement when both values exist, group eligibility, mandatory-hold exclusion,
and null-date checks. Before-value hashes match the fresh baseline and every
context target is null. No new person is created.

All four exports were checked. Accepted items come from three exports:

| Source | Accepted items | Existing source rows receiving items |
| --- | ---: | ---: |
| HCA | 46,209 | 2,430 |
| Cromwell | 1,398 | 479 |
| British Dietetic Association | 268 | 268 |
| POGP | 0 | 0 |

The row sets overlap. All 889 POGP source records remain identity-held; this
release does not recover POGP population data. Item kinds are 42,397 conditions,
4,680 languages, 530 populations and 268 services. A row may have multiple
providers and identity proof types: 2,305 rows have at least one canonical-URL,
compatible-name and matching seven-digit-GMC binding; 872 have at least one
canonical-URL and compatible-name binding. Those two sets overlap by 174 rows.

The accepted text contains no email/URL, phone-like, HTML or mojibake indicators
under the independent scan. These are bounded indicators, not a general privacy
classifier. Source fields are an explicit professional allowlist. Downstream
context passages carry `listed-condition-not-performed-care` or
`recorded-context-not-performed-activity`; this staging never infers actual
performed clinical work, practice dates or current availability.

## Counts are not novel facts

The builder excludes exact whole-passage duplicates, but that does not measure
semantic novelty or duplicates inside old biography paragraphs. An independent
literal-substring check found 7,308 of 40,983 proposed items with at least eight
normalized characters already inside baseline About/interests/research text,
across 1,851 rows. This is a duplication indicator, not a count of all
duplicates. The remaining items must not be called new facts either.

Use “47,875 attributed source-field items” or “80,826 combined source-context
items,” with the existing report's `changesNotClaimedAsNovelFacts: true`.

## Merge and runtime contract

Rebuilding the merge from the immutable Bupa R1-v2 packet and the two exact
proposal artifacts reproduces every merged record exactly. The current runtime
adapter accepts all 39,002 patches (24,917 text repairs plus 14,085 context row
patches), preserves all three mandatory holds, and changes zero protected
baseline fields. The combined context contains 80,826 items. Validation applies
the before-value hash to every changed field, with no persisted baseline write.

The ten new tests cover preserved source indices across blank array entries,
URL credential rejection, incompatible names and typed
GMC values, overlapping source contexts, missing rows, occupied context,
mandatory holds, duplicate artifacts, contradictory duplicate provenance,
combined limits, existing-context reconciliation and absent source provenance.
The merge's limited shape checks are followed by the strict adapter; that
adapter validation must remain a required packaging gate.

## Future-builder issue corrected

The review found that removing blank array values before recording
`sourceItemIndex` could shift future provenance. The parent authorized a narrow
fix: `indexedStrings()` retains original indices and unchanged literal text
while excluding blank values. A regression fixture covers leading and middle
blank entries. None of the current artifact's 47,875 accepted items had that
mismatch; its immutable artifacts were not regenerated. Complete independent
field/index comparison remains a gate for future generated artifacts.

Private evidence lives in `repair-private/provider-context-review/`:
`source-verification.json`, `merge-verification.json`, and the allowlisted
independent audit script. Both verification reports explicitly record
`humanReviewed: false`.

## Final release-diff boundary review

A bounded read of the changed runtime, reader, release loader, source reader,
profile, browser evidence/save/export code and explicit deployment file lists
found no blocking privacy or attribution defect. This was static review and
focused fixture validation, not another full corpus build or production test.

- A configured data release cannot fall through to mutable cache or live reader
  fetches. Package hashes, relative confined paths, no-symlink checks, allowed
  fields, before hashes and all three mandatory holds are enforced.
- Added provenance has an explicit field allowlist. Public metadata exposes
  release and source hashes/labels, not local backup paths or raw exports.
  Runtime/deployment file lists do not copy the audit tools or private source
  directories into the public static asset tree.
- The private-preview gate runs before application, asset and source routes;
  unauthenticated health is reduced to readiness. Credential values are not
  returned. Source pages escape text and restrict external URLs.
- Candidate ownership remains checked for profiles and selected source
  passages. Stale explicit corpus/profile citations return unavailable status;
  legacy collection links are labelled as current collections.
- Background save/cache matching checks candidate, corpus, profile version and
  supplied release. Request IDs prevent late fetches replacing newer saves.
  Saved-only views retain their original background; absent optional release
  metadata remains valid for legacy projects. Existing saved text is not
  silently replaced by a newly repaired corpus.
- The over-200-line profile fallback retains the complete source text,
  including terminal negation. Import validation mirrors the v2 fallback and
  retains legacy v1 block rules. Qualifiers distinguish listed conditions and
  recorded service metadata from performed clinical activity.

The future-index fix changes only the offline builder and its focused tests.
The current immutable provider and Bupa context proposal artifacts are retained
unchanged; all previously reported source and merge verifications still apply.
