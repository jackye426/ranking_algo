# Offline provider ownership gate

`provider_ownership.py` inspects an existing provider-profile association before
`prepare_sources.py` prepares additional professional details. It is an offline
proposal gate, not an identity resolver, live-register check or release approval.
It never edits original records, changes identity membership, or removes old
evidence. The release adapter must independently enforce approved group holds.

## Outcomes

- **eligible-for-source-review**: compatible recorded typed registration and a
  bound canonical profile/name, an official Spire `c`-number URL corroborating
  an existing GMC with matching source-header and URL names, or a reviewed identity
  corroboration. Individual fields still require source/meaning/privacy review.
- **ownership-review-required**: insufficient or ambiguous identity evidence.
  Name and URL similarity alone never approve a binding. Missing source links or
  identifiers are not described as identity conflicts.
- **field-review-required**: the provider's specialty label contradicts the
  corroborating professional biography. Do not infer a different person solely
  from this label, or release the conflicting field without review.
- **hold-required**: disjoint identifiers within a compatible authority,
  internally conflicting identifiers, or a clearly conflicting recorded role
  require identity-group review. This is a proposal; neither records nor holds
  are automatically changed. A wrong registration could be a source error.

GMC, GDC, HCPC and NMC fields compare only within the named authority. Different
authorities need dual-role corroboration; a non-doctor is not required to have a
GMC number. Biography/membership text is never mined into a new identifier.
Recorded specialty topics are not automatically treated as non-doctor professions.

The Spire rule accepts only the official HTTPS host, named consultant routes and
an exact seven-digit `c` suffix. It records a separate source-native assertion;
it does not populate missing GMC fields or verify present registration. An
absent baseline GMC remains unresolved. `p`, `n` and `ch` suffixes are never
converted to GMC or another regulator's identifier. Conflicting suffixes,
explicit identifiers or names stop admission; malformed typed fields remain
reviewable even when a URL looks compatible. Regulator prefixes and whitespace
are normalized only inside an already explicitly typed registration field.

## Hash-bound review path

An optional `--ownership-reviews reviews.json` accepts a private array of:

```json
{
  "schemaVersion": 1,
  "decision": "corroborated-existing-owner",
  "reviewId": "independent-review-id",
  "reviewer": "source-reviewer",
  "rationale": "Explain why the professional fields corroborate ownership.",
  "binding": { "...": "exact make_binding() output" },
  "evidence": [
    {
      "category": "professional-role",
      "sourcePointer": ["about"],
      "baselinePointer": ["about"],
      "sourceValueSha256": "hash of exact source field",
      "baselineValueSha256": "hash of exact baseline field",
      "rationale": "Describe the source-specific professional corroboration."
    },
    {
      "category": "qualification",
      "sourcePointer": ["qualifications"],
      "baselinePointer": ["qualifications"],
      "sourceValueSha256": "hash of exact source field",
      "baselineValueSha256": "hash of exact baseline field",
      "rationale": "Describe the independently checked qualification history."
    }
  ]
}
```

Bindings include provider, original source file/index, source-file hash, baseline
snapshot hash, source-row hash, baseline-row hash, existing identity and canonical
profile URL. Row/value hashes use `value_hash()` canonical JSON. Review evidence
must include at least two distinct professional-field pairs and qualification or
career history. Copied biography equality is not independent ownership proof;
reviewers must inspect the actual attribution. A review cannot override known
typed or professional-role conflicts. Stale, duplicate, unused or wrong-person
review bindings fail preparation instead of being silently reused.

## Source-native import continuity

A distinct reviewed decision, `source-native-import-continuity`, can establish
recovery from the same original provider record without requiring a second
provider. An ID prefix or copied biography does not establish this continuity.
The review retains the exact binding above and must also include:

- A separate primary and secondary reviewer, review IDs and the secondary
  receipt hash.
- `nativeImport` source record/index, selected source-file/row hashes and the
  current baseline-row hash, all matching the binding.
- Hashed `importer` path/function, `originalSource` path/file/row/index and
  `datedOutput` path/file/row. Original source and dated output retain the same
  recorded name/profile key; the selected export must continue that named
  canonical profile. Older source-array indices stay distinct from current ones.
- `professionalProjectionReproduced: true`,
  `crossProviderMatchingExecuted: false` and `fieldMeaningApproval: false`.

The reviewers must inspect or replay the immutable append transformation before
issuing this receipt. The gate validates the supplied attestation and exact
current inputs; it does not execute archived parsers or claim to fetch archived
files itself. Actual same-authority or owner-role conflicts still block admission.
Malformed registration, a contradictory specialty label or an unavailable link
remains a separate `fieldReviewRequired` limitation. Ownership continuity never
authorizes those fields, invents a valid URL, or approves another provider join.

## Review outputs and limits

The builder writes `ownership-ledger.json` and `ownership-coverage.json` alongside
existing processing outcomes. Rejected additions retain the explicit flag
`baselineSafetyReviewRequired`; rejecting an addition does not imply unsafe old
material has been removed. Canonical URL/name pairs without typed proof remain
separately counted, with available role signals for review. Such counts do not
establish approved identities or independently verified practice.

This gate cannot detect every attribution error: source-native wrong identifiers,
mixed biographies, unnamed collaborators, copied fields and sparse roles still
need source review. Bupa HTML's separate frozen-array/snapshot binding remains its
own audited path. Immutable previously prepared packages are not rewritten when
the builder is updated.

Run synthetic contracts with:

```powershell
python -m unittest discover -s expert/repair/enriched -p 'test_*.py'
```
