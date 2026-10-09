# Offline Bupa recovery preparation

These tools create private, reviewable repair packages. They never run original
scrapers/importers, call a model, scrape the network, write a database, or edit
original source files. Pass explicit input/output paths; private source artifacts
must remain outside this repository.

The audited environment uses Python 3.14.2, lxml 6.0.2, BeautifulSoup 4.14.3 and
ijson 3.4.0.post0. These are offline preparation dependencies, not application
runtime dependencies. `requirements-audit.txt` records the versions used.

`bupa_parser.py` preserves source text and explicit HTML paragraph/break/list
boundaries. It compares its extraction with a small isolated reproduction of the
old parser expressions, including the faulty lowercase b/r character class.
Inline tags do not introduce word boundaries. Entities are decoded by the HTML
parser once. Encoding guesses and text reconstruction from damaged flat strings
are prohibited.

`stage_bupa.py` requires the checksummed independent backup inventory, frozen
37,195-row Bupa array hash, professional baseline and the 37 historical URL
conflict IDs. It checks every snapshot against the backup hash. Every proposed
field must equal its frozen Bupa predecessor in the baseline, and the old HTML
extraction must reproduce that predecessor exactly. Merged fields, missing
sections, mismatched identity, unknown encoding, contact/personal content and
insufficient typed identity are withheld. Only explicitly agreed mandatory
identity holds change eligibility. Historical CSV URL conflicts are flagged;
their old URL proposals are never used and do not become blanket record holds.

Source URLs are evidence-only numeric routes read from the exact snapshot's
print link. They require the matching professional name and typed registration,
currently GMC or explicit HCPC/GDC registration sections. They are historical
metadata, not live URL verification. No `profile_urls`, name or registration is
patched. Source/observation dates stay null when unknown; file modification and
repair dates are not substituted for them.

The pilot contains 40 risk selections and 60 reproducible random controls. Full
staging processes all 37,195 mapped rows in batches of 1,000, retaining the pilot
and another 200 seeded follow-up profiles in a detailed source-review ledger.
This ledger contains sanitized source markup (attributes omitted), recovered
text, old extraction results, source/section hashes, line references and checks.
Contact/personal sections are not exported. All review labels explicitly say
automated and `humanReviewed: false`.

`verify_bupa_reviews.py` independently rereads the selected actual HTML files
using BeautifulSoup rather than the production recovery extractor's lxml tree.
It compares exact recovered text, source boundaries, source names, snapshot
hashes and each proposed field. This is still automated verification, not human
approval. Reviewers can cross-check the private ledger against original files.

Output includes:

- `manifest.json`, `repairs.json`, `baseline/raw.json`: hash-bound runtime packet.
- `row-outcomes.jsonl`: every mapped row and every attempted professional field.
- `source-reviews.jsonl`: independently inspectable pilot/follow-up source views.
- `source-accounting.json`: each malformed JSONL line (hash/error only), repeated
  snapshot reference, orphan snapshot and missing referenced snapshot.
- `run-inputs.json`, `summary.json`: input/code hashes, selection seed and counts.

`stage_bupa_context.py` separately stages literal language and Offers metadata
for the checksum-bound eligible source IDs. It accepts only exact h4 headings,
the immediate list and direct list items or the observed language tooltip
wrapper. It preserves each language and proficiency as one source item. Offers
are labelled service metadata, not evidence of performed activity or present
availability. Headline profession guesses are excluded. It does not replace the
baseline language field. `verify_bupa_context.py` independently reopens a
deterministic sample with BeautifulSoup and verifies the whole packet's
eligibility, hold exclusion and null-before-value preconditions.

Run tests from this folder with `python -m unittest -v test_bupa_parser.py
test_stage_bupa.py test_bupa_context.py`. Run each script with `--help` for required paths. New output
directories are required; an interrupted directory without a completed manifest
is not a release. A provisional cached baseline must be explicitly selected with
`--provisional`, then regenerated against the fresh baseline before approval.

The private packet is a proposal, not a production import. Its `approved` flag
means the deterministic source gates passed. Runtime source ownership, complete
corpus validation, preserved exclusion flags, independent review and explicit
release selection remain required. Source-changing repairs produce new evidence
IDs; saved snapshots and old citation text must never be silently overwritten.
