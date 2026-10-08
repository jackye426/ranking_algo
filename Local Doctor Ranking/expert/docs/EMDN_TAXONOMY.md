# Pinned EMDN taxonomy and reviewed retrieval mappings

This module resolves all 8,516 codes in the supplied English v.2026 workbook. An exact device classification and a clinician's documented expertise remain separate objects. The workbook does not contain clinicians, risk classes, competence criteria or an official code-to-specialty mapping.

## Provenance

- Supplied filename: `EMDN v2026_EN..xlsx`.
- Worksheet: `EMDN_v.2026`; title `C1`, headers `A2:F2`, data `A3:F8518`.
- SHA-256: `a973dcdd8ae291248c9d06d355d3cc859d89a5584004db9354721c9c596bc1bd`.
- On **2026-10-08**, the bytes fetched from the [official full-list download](https://webgate.ec.europa.eu/dyna2/emdn/build/EMDN%20v2026_EN..xlsx) matched the supplied workbook exactly (382,642 bytes). The download is reached from the [European Commission's EMDN page](https://health.ec.europa.eu/medical-devices-topics-interest/european-medical-devices-nomenclature-emdn_en), through its full-list link.
- This is a pinned, verified download. The application does not claim to check the current release on every search.
- Visible workbook labels declare v.2026; embedded query-field names still mention v.3 2025. The original bytes and terminology are retained.
- Document creation `2026-01-27T15:20:57Z` and modification `2026-06-17T08:04:06Z` are document properties, not evidence of a publication/effective date.

## Reproduce the import

Python 3 standard library only; the source workbook is opened read-only and never saved. Supply a private local copy of the source. Do not place the workbook in public assets.

```powershell
python expert/scripts/import-emdn.py --source '<path-to-original-workbook>'
python expert/scripts/import-emdn.py --source '<path-to-original-workbook>' --check
node --test expert/emdn-taxonomy.test.cjs
```

The importer refuses an unreviewed workbook hash. A new release needs an explicit source audit, pinned-hash change, taxonomy-version change, mapping review and evaluation. Output uses deterministic ordering/formatting; no execution time, machine path or user information is written to the JSON. `--check` makes no output changes.

The only runtime files are `expert/emdn-taxonomy.cjs` and `expert/data/emdn-2026.json`. No spreadsheet package, network request or AI call is needed for lookup. The JSON contains public classification data, not the professional source corpus.

## Import invariants and findings

| Check | Verified result |
|---|---:|
| Unique codes | 8,516 |
| Categories / levels | 23 / 7 |
| Terminal nodes | 6,773 |
| Medical-device-software labels / IVD subset | 173 / 34 |
| Software-accessory labels | 171 |
| Duplicated term labels / duplicate codes | 9 / 0 |
| Child rows before their parent row | 65 |
| Labels with outer whitespace | 32 |
| Missing parents / terminal-child conflicts | 0 / 0 |

The importer validates `^[ABCDFGHJKLMNPQRSTUVWXYZ](?:[0-9]{2}){0,6}$`, `length(code) = 2 * level - 1`, complete category/parent membership, matching category descriptions, valid YES/NO fields and terminal/child consistency. All codes are loaded before the hierarchy is built; worksheet row order is not a hierarchy. Labels are not identity keys. A node preserves the exact `termRaw`, plus a trimmed `term` for display and search.

Software counts use exact label endings including singular ACCESSORY. They must not be inferred from suffixes. `Z11030482` at `C7165:F7165` is labelled **INSTRUMENTS FOR RADIOLOGICAL SECTION**, despite sharing an ending with software accessory codes. It is preserved as written and has no reviewed search mapping. There are 172 codes ending 82 but only 171 software-accessory labels.

## Public module contract

- `normalizeCode(value)`: trims outer whitespace, converts case, validates syntax; returns code or null. It never deletes internal whitespace, repairs digits or picks an ancestor.
- `lookup(value)`: exact membership lookup; returns an immutable node or null. Nodes include code, original/display term, category, level, terminality, parent, complete `{code, term}` path, source sheet/row/range, pinned taxonomy version and clarification policy.
- `detectCodes(message)`: returns `{codes, invalidCodes, ambiguousCategories, references}`. References contain `{input, code, valid, start, end, explicit, reason}` for precise removal by the brief adapter. Detection does not itself change or negate a brief.
- `getMapping(code)`: returns one of three immutable reviewed mappings, otherwise null.
- `getClarification(code)`: returns a clarification policy for valid codes. CT requests an application; V92 requests device purpose; other unmapped/broad codes request clinical purpose. The brief adapter decides whether the user's existing context answers the question.
- `getMetadata()`: stable release, provenance hash/link, audit counts and mapping version. Returned data are deeply frozen.

Detection accepts EMDN-framed codes/lists, code-only inputs, known codes with at least four digits in ordinary language and unknown code-shaped tokens with at least five leading digits. Unknown long codes are returned as recoverable errors rather than silently ignored. Short known codes in prose need device/software/classification wording. A standalone category letter is ambiguous until EMDN framing is supplied. Ordinary `B12 deficiency`, `T2 MRI`, `C19 concerns`, trial IDs and registration IDs do not activate taxonomy lookup.

Malformed/unknown codes must be corrected explicitly. A valid broad category is a legitimate lookup, but not enough to invent a clinical application or rank unrelated clinicians confidently. A terminal node can also be broad: V92 is terminal and does not describe a clinical purpose.

## Reviewed search expansions

These mappings are **DocMap search interpretations**, version `docmap-emdn-search-expansion-v1`. They are not fields from the official workbook, formal expert qualifications or official regulatory mappings. They are deliberately limited and reviewed against each source label. Candidate relevance must still be supported by attributable professional evidence.

| Code / exact source | Retrieval focus | Required restraint |
|---|---|---|
| `Z11030692`, `C7191:F7191`: COMPUTED TOMOGRAPHS (CT) - MEDICAL DEVICE SOFTWARE | Computed tomography / CT imaging | Ask for clinical application if absent. Never default to cardiac CT, coronary disease, AI or validation research. |
| `Z12040118`, `C7800:F7800`: VIDEO DERMATOSCOPES | Dermoscopy / dermatoscopy / skin-lesion examination | Does not establish primary-care setting, AI use, diagnostic accuracy or study evaluation. |
| `J010792`, `C1492:F1492`: ACTIVE IMPLANTABLE CARDIAC DEVICES REMOTE MONITORING SYSTEMS - MEDICAL DEVICE SOFTWARE | Remote monitoring of implanted cardiac devices / cardiac device follow-up | Does not identify a specific device, clinician role, workflow or software-validation activity. |
| `V92`, `C4553:F4553`: MEDICAL DEVICE SOFTWARE - NOT INCLUDED IN OTHER CLASSES | **No clinical expansion** | Ask what the software does and what expertise is needed. |

No expansion silently creates a must-have, a confirmed clinical activity, regulatory experience, availability or approval. The integration should preserve the user's clinical purpose and priorities, expose the interpreted focus, and use taxonomy/mapping versions in search and saved-scope identity.

## Verification boundary

Taxonomy tests check every imported code/parent/terminal, exact examples, duplicate-label separation, suffix exceptions, immutable/versioned metadata, three-mapping scope and safe detection including code-plus-prose and malformed codes. Reproducible import is checked against the original workbook separately.

These checks establish classification integrity. They do not establish retrieval quality or interpretation correctness; integration tests must cover CT-plus-coronary context, dermoscopy, implanted cardiac monitoring, broad/unmapped codes, invalid recovery, refinement/removal, saved projects and source-grounded results.
