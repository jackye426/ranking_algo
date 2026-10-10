# Cursor ingestion output contract

The ingestion fixer should use the existing `handover/DATA_INGESTION_FIXER_HANDOVER.md`
and its defect/fixture appendices. This contract does not assert Cursor's fixes are
complete. Delivered output must pass validation before use. No instruction here
changes the main validation workstream or approves R3.

Each delivery is a private immutable `docmap-ingestion-proposal-v1` JSON packet.
It has schemaVersion 1, proposalId, baseReleaseId, sources, changes, outcomes,
conflicts and quarantine arrays. Empty conflict/quarantine arrays are explicit;
absent outcomes are not success. A delivery must account for every acquired input,
including invalid/skipped rows, missing archives and unknown ownership.

Each source supplies provider, providerRecordId, sourceKey, immutable version,
contentSha256, hashSemantics (`original-bytes` or `canonical-source-record`),
requestedUrl, finalUrl, sourceDate and observedAt. Unknown dates are explicit null.
Export/merge/file modification dates are separate metadata and cannot become
observation or publication dates. Private archive descriptor includes objectKey,
sha256, byte count, media type and `private: true`. Rehash actual objects separately.
Colliding name-slug/offset snapshots are quarantined, never used as identity keys.

Each change supplies recordId, sourceKey/version/hash, operation (`add`, `change`,
`remove`), permitted field, beforeValueSha256 for changes/removals, exact proposed
value, ownership receipt and original boundaries. Removal is an explicit null
proposal; it does not delete history. Boundaries identify originalField, offsets,
exactSpanSha256 and their offset encoding (recommended UTF-8 byte offsets).
Never recover missing words with AI. Retain list introductions, negation, CT/MR,
numeric ranges, source order, dates, qualifiers and alternative assertions.

Ownership decisions are `corroborated-existing-owner`,
`source-native-import-continuity` or `unresolved`, with immutable receipt hashes.
Typed identifier authority is explicit; unknown/malformed HCPC cannot fall through
to GMC. Similar names, URLs and identical biography prose cannot approve a join.
The pipeline reports parseOutcome, attributionOutcome, qualityOutcome, qualifiers,
evidence type and dates per proposed claim. An exact quote with unresolved ownership
stays quarantined. PI/authorship/practice cannot be inferred from contact roles,
team text, interests or training.

Conflicts retain both source assertions, typed identifiers, source versions and
the unresolved reason. Quarantine decisions state whole-identity hold versus
source-bound field exclusion, their scope and reason. A rejected addition also
requires an explicit disposition for any unsafe baseline field. Existing 32
exclusions, 67 additional holds and 2,890 source-bound exclusions must survive
unless separately reviewed changes are explicitly included in a new package.

Quarantine items require `decisionId`, `recordId`, `reason` and `scope`:
`whole-identity-hold`, `source-field-exclusion` or `rejected-source-addition`.
Source-scoped items also require the bound `sourceKey` and permitted `field`.
Conflict items require recordId, reason, at least two known sourceKeys and both
original assertions. Changes require `evidenceType` and `dates` with explicit
sourceDate/observedAt values. Each source has exactly one accounting outcome:
parsed, parsed-with-quarantine, failed, invalid-encoding, schema-incompatible,
skipped or unavailable. Archive keys are relative private object keys.

`pipeline.cjs` validates the transport contract and stages proposals privately.
It does not certify receipt truth or authorize publication. All input/source/span
hashes must subsequently be checked against the delivered original archive and
existing approved release. Native-source ownership receipts must retain primary
and secondary review linkage where required by the existing handover. Duplicate
or overlapping conflicting field proposals fail instead of selecting a winner.

Source changes invalidate source-bound correction approvals, derived vector/index/
profile/explanation artifacts and attribution receipts for the affected versions.
The old release and its holds remain immutable. Re-review and a new manifest are
required; a changed source cannot clear a hold, overwrite an approved field or
silently rewrite a saved citation. Existing matching vectors may be proposed for
reuse only by exact normalized text, model, dtype, dimensions, tokenizer, numerical
compatibility and target-runtime receipts. Model-name equality is insufficient.

Required regression set includes Gillett/Pericleous/Hughes source recovery,
Hayley/Philip/David mixed-identity holds, wrong snapshot owner, sparse/non-doctor
profiles, multiple sources and contradictory qualifications/registrations,
malformed JSON/encoding and shifted fields, repeated evidence, CT/MR, negative
lists, ongoing qualifications, missing dates, PHIN inequalities/ranges, professional
fragments inside personal/contact text, saved-version mismatches and excluded
alternative/derived fields. Preserve failures and unresolved findings; do not read
sealed held-out questions or relabel failed expectations.

Acceptance proceeds from a delivered proposal through source-byte, parser,
ownership, scope, semantic and full package parity gates. These are separate from
ranking/relevance and target-runtime approval. The database branch can validate
new deliveries using this contract; it does not assume that a repaired scraper
automatically satisfies downstream gates.
