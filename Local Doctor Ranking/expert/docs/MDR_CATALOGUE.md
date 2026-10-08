# MDR designation catalogue and classification registry

The runtime includes all **71 MDR designation codes**: 26 MDA, 18 MDN, 14 MDS and 13 MDT. These describe the scope of notified-body designation. They are distinct from EMDN device nomenclature and are not device risk classes or evidence of a person's competence, authorisation or experience.

## Source and reproducibility

- Legal basis: [Annex I to Commission Implementing Regulation (EU) 2017/2185](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32017R2185).
- Pinned transcription source: [MDCG 2019-14, Explanatory note on MDR codes, December 2019](https://health.ec.europa.eu/document/download/6d75a830-9b9b-4e4a-a3b6-047329e9a104_en), downloaded 8 October 2026: **184,628 bytes**, 23 pages.
- PDF SHA-256: `aaba13eb6865c3e84c3638bb7068471b492093bd8e39a3819d14276315cc44da`.
- Catalogue SHA-256: `03a8b0921cd1357bb97ac9c08c7832a47a7e2471f23ce2a574a28c0872635988`, over the UTF-8 compact JSON serialization of `nodes` in recorded order.
- Catalogue version: `mdr-2017-2185:mdcg-2019-14:03a8b0921cd1357bb`.

The importer reads only the code and label columns on guidance pages 8–23. PDF coordinates separate these from the examples and conditions columns; examples do not become additional definitions or search criteria. All 71 label texts were cross-checked against the official English regulation's indexed Annex I tables. Direct EUR-Lex downloads presented a browser challenge; this audit does not claim a regulation-file byte comparison or bypass that challenge. The reproducible byte source is the Commission-hosted guidance PDF.

The display label joins whitespace, uses the regulation's unspaced slashes, rejoins the line-wrapped `non-active` in MDN 1214, and separates MDS 1004's footnote marker `1`. `termRaw` retains the joined guidance extraction, including that marker and original slash spacing. Source page numbers are retained for every code. The guidance is not legally binding; the regulation is the legal source. This is a pinned release, not a claim that each request checks for updates.

```powershell
python expert/scripts/import-mdr.py --source '<path-to-mdcg-2019-14.pdf>' --check
node --test expert/mdr-taxonomy.test.cjs expert/emdn-taxonomy.test.cjs
```

The importer requires `pypdf` only during import. It refuses a different PDF digest and validates exact code counts, uniqueness and non-empty labels. To reproduce the committed file, omit `--check`. New source bytes require a source review and explicit version/digest update. No PDF parser, model request or network request is used at runtime.

## Module contracts

`mdr-taxonomy.cjs` exports `lookup`, `normalizeCode`, `detectCodes`, `getMapping`, `getClarification` and `getMetadata`. Returned nodes and metadata are deeply frozen. Nodes retain family, dimension, exact display label, raw source label, source page, catalogue version/digest and limitations. MDR is a flat catalogue: `path` contains the code entry only, with no invented EMDN hierarchy.

`classification-registry.cjs` wraps the unchanged EMDN module and the MDR module:

- `lookup(code | {system, code})`: exact membership, never cross-system coercion.
- `normalizeReference(value)`: syntax/cosmetic normalization only; it does not prove membership.
- `detectCodes(message)`: reports ordered, positioned references, canonical `{system, code}` classifications, invalid codes, unsupported IVDR-shaped codes and ambiguous EMDN categories. Detection is for recovery; individual valid tokens may be present alongside errors.
- `resolveSet(message | references[])`: accepts at most 32 references. Any invalid/unsupported token rejects the entire selection and returns no accepted classifications or nodes. Repeated valid identities are deduplicated.
- `getMapping(reference)` / `getClarification(reference)`: route through the relevant catalogue.
- `getMetadata(system)`: source, release and content identity for that system. The common `taxonomyDigest` aliases the EMDN workbook digest or MDR catalogue digest. With no system argument, it returns the registry version and supported systems.

MDR code spelling accepts compact, spaced, hyphenated and lowercase forms, including `MDA0315`, `MDA 0315` and `mda-0315`. Digits are never repaired, truncated or reassembled from `MDA 03 15`; unrecognised lengths/prefixes/suffixes remain errors. Mixed sets retain each system, including short EMDN entries such as `V92`. Bare MDR/MDS/MDT prose, MDT meetings, MDS EB2 and regulation titles do not activate designation lookup. IVDR designation tokens are reported as unsupported, not mistaken for MDR or EMDN.

## Search and evidence boundary

This release adds complete lookup coverage and clarification, **not 71 clinical expertise mappings**. `getMapping` returns null for MDR codes. MDA 0315 asks for software purpose and clinical subject; other design/purpose codes ask for clinical application; MDS/MDT codes ask which device/application and clinical or technical expertise is relevant. User-supplied purpose can guide discovery without turning a category into a credential. The existing three reviewed EMDN mappings remain unchanged.

Recognising all codes in a set does not validate whether their assignment to one device is appropriate. MDA/MDN scope, horizontal characteristics/processes, device grouping, candidate matching intent and professional evidence remain separate concerns. No official EMDN-to-MDR crosswalk is asserted.

Tests cover the complete independent expected-code set, source metadata/integrity, representative exact labels, normalization, mixed lists and positions, atomic failure, explicit system mismatch, unsupported IVDR, ordinary acronym false positives, bounded typed input, immutability and the absence of invented expertise mappings. Integration and retrieval tests must separately establish useful candidate discovery and faithful saved-scope behavior.
