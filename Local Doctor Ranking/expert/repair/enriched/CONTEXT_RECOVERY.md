# Reviewed recovery from a suppressed biography

`recover-context.cjs` is a pure preparation compiler. It does not access the
database, publish a release, choose a professional role or approve a source.

Every decision must bind the frozen original About value, a source text with the
same exact wording, the current packet, its existing About suppression and its
current professional-context patch. A named primary decision and a different
named secondary reviewer must approve the complete decision hash. Changing a
span, its classification, its source or its target invalidates that approval.

The original About suppression stays in place. Independently reviewed literal
professional spans become separate biography items, preserving their order and
source provenance. No sentence is generated to bridge omitted private or
administrative material. Optional neutral segmentation policies are bound to the
exact final item wording and review identity. They preserve a complete readable
source context; they cannot promote it to clinical activity.

An optional `professionSpans` array contains separately reviewed literal owner
role clauses. The compiler never derives these from provider names, membership,
the original importer’s profession constant, colleagues or inferred registration.
These source assertions remain distinct from the biography and require the same
independent approval as all other output. Approval of biography text alone does
not authorize adding a profession assertion.

Duplicate, stale, ambiguous or unsupported source bindings fail preparation. An
existing identical source item is recorded rather than counted as newly added;
matching text from a different origin requires explicit review. Neither identity
holds nor other field suppressions can change. The compiler applies the ordinary
release validator before returning its staged output.

`append-holds.cjs` performs a separate hold-only amendment. It requires a pinned
primary source receipt and pinned independent approval for a runtime-allowlisted
whole-group hold. Every other packet property and every prior hold must remain
identical. The amendment uses a new release identifier and never edits its input.

Focused verification:

```text
node --test --test-concurrency=4 expert/repair/enriched/append-holds.test.cjs expert/repair/enriched/recover-context.test.cjs
```

Real source texts, private decisions, source archives and release packets stay
outside Git and public assets. Compilation is not source-gate, retrieval-gate or
deployment approval.
