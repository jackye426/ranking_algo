# EMDN discovery and results scrolling

Release: 8 October 2026. Expert preview only; patient APIs, patient assets, original professional records and model configuration are unchanged.

## What changed

The expertise input accepts an EMDN code, with ordinary clinical context where needed. Exact lookup uses a pinned 8,516-entry taxonomy, not a model-generated definition. The interface distinguishes the official category from DocMap's interpretation and professional evidence. CT software asks for its clinical application; V92 and other unmapped categories ask for intended clinical use. Video dermatoscopy and implanted-cardiac-device monitoring have bounded reviewed retrieval mappings.

The taxonomy SHA-256 is `a973dcdd8ae291248c9d06d355d3cc859d89a5584004db9354721c9c596bc1bd`. The supplied workbook matched the [official download](https://webgate.ec.europa.eu/dyna2/emdn/build/EMDN%20v2026_EN..xlsx) byte for byte on 8 October 2026. This pins the verified release; it does not automatically track future updates. See [taxonomy provenance and import](EMDN_TAXONOMY.md).

The large results title and count now scroll with candidates. Only compact view/navigation controls remain above the scrolling region; the composer stays separate. At the previous 1280 x 720 layout, the permanent heading left approximately 305px for cards over 530px tall. The new structure releases that heading space as the user scrolls. Response arrival now preserves a reading position changed during the pending request, rather than restoring the submission-time position.

## Search and evidence boundaries

- Code and hierarchy are reference data, never evidence of an expert's experience, assessor competence or approval.
- Reviewed concepts become visible search-focus requirements; the code label is not a hidden second retrieval query. Research and regulatory experience do not become mandatory unless requested.
- Clinical passages remain indexed by actual BM25 and MiniLM embeddings, fused using the existing ranking pipeline. No professional-corpus rewrite or re-embedding was needed.
- Removal lineage prevents a retained code or resume from resurrecting deleted concepts. Explicit re-adds are supported. User-supplied criteria and location remain separate from code-derived concepts.
- Invalid codes, multiple selections and unresolved clinical-application changes preserve the accepted shortlist and show a recoverable explanation. Only one code is selected at a time.
- Taxonomy and mapping versions contribute to saved scope. Old evidence, notes and decisions remain frozen; changed scope marks decisions for review. Older schema-one backups remain importable.
- Clarification recovery preserves only the unresolved request, not successful conversation history. New code selections, removal commands and clinical mutation notation are distinguished from answers to a pending question.

## Demonstration guide

1. Enter `Z11030692`. Read the official CT-software category and answer the short question with `Detecting coronary artery disease`. Review documented cardiac CT and coronary evidence. UK-wide remains optional and separate.
2. Enter `Z12040118`. Review dermoscopy/skin-lesion imaging evidence, including Paul Norris and Amin Karim, without adding primary-care or research requirements.
3. Enter `J010792`. Inspect the recorded remote-monitoring research of Guy Furniss and Iftikhar Fazal. These records remain potential relevance, not proof of current performed monitoring.
4. Enter `V92`. A question about clinical purpose appears rather than a fabricated specialty. Supply the software's task and clinical area.
5. Remove a code-derived criterion, refine another criterion, save and resume. The removed focus must stay removed. Re-add it explicitly to restore it.

## Verification

- Expert suite: **1,069 passed**, no failures or skips.
- Patient suite: **243 passed**, no failures or skips.
- Includes real-taxonomy UI recovery, project import/reload, frozen scope, malicious/forged metadata, removal/re-add lineage, inactive-code removal, unrelated taxonomy categories, changed clinical applications, failed interpretation and scroll preservation.
- Independent adversarial review reproduced five defect groups before fixes and replayed them successfully after fixes.
- Reproducible workbook import `--check` passes; source workbook content is unchanged.
- Runtime staging contains **29 explicitly allowed files**, 2,870,850 bytes. It excludes environment files, raw professional exports, project notes, caches and dependencies. Uploaded runtime hashes match the tested source.

### Real-corpus retrieval checks

The existing corpus is `expert-corpus-v1-003234ea2e49a2446f3f`, with 22,271 indexed candidates and 273,093 passages. The following local checks use real embeddings, cached professional data and deterministic interpretation, without model-backed interpretation latency.

| Query | Hybrid / BM25-only returned candidates | Hybrid / BM25-only duration | Observation |
|---|---:|---:|---|
| CT code + coronary artery disease | 704 / 621 | 1,554 / 491ms | Justin Carter, Niall Keenan and Jaymin Shah have recorded cardiac CT and coronary evidence. |
| Video dermatoscope code | 138 / 77 | 358 / 254ms | Hybrid places Paul Norris first; BM25-only places Amin Karim first. Both have direct dermoscopy passages. |
| Implant monitoring software code | 5,379 / 5,358 | 4,104 / 4,025ms | Both put Furniss and Fazal first, with weaker research/background evidence retained as potential relevance. |

Both retrieval methods contribute candidates in every hybrid case. Increased candidate counts are not a recall or quality improvement claim. These six observations are not a hosted latency percentile benchmark. The complete observed results are in the ignored local cache, `emdn-retrieval-verification.json`.

## Limits

The lookup covers all codes; reviewed clinical expansion covers the three demonstration categories. Other valid categories need user-supplied clinical purpose. Specific device/software experience, current practice, validation work and availability are not inferred from related clinical work.

An unresolved change from coronary CT to lung/brain CT is explicitly rejected without changing results; review and remove the earlier clinical-application criteria before specifying the replacement. Clearing a code does not remove independently supplied clinical requirements. Generic `clinical reporting is essential` can need clarification; `cardiac CT reporting is essential` is supported. No universal device-to-specialty mapping is claimed.

The recorded implant-monitoring evidence is weaker than the CT and dermoscopy examples. Preserve that limitation rather than changing the source's meaning to strengthen the demonstration.

## Hosted release

Preview: https://docmap-expert-discovery-production.up.railway.app/expert-discovery

Railway deployment `2f26703f-f663-46db-a8e0-03156a90d884` reached **SUCCESS**. Hosted health reports the unchanged corpus and DeepSeek configuration. Four frontend asset hashes match the tested release, and **32 hosted checks pass**, covering classification, clarification, refinement, location clearing, removal/resume, professional profiles, exact citations, backup/export, direct routes and private/patient route isolation. The reproducible check is `node expert/scripts/verify-emdn-hosted.cjs`.

| Observed hosted action | Duration |
|---|---:|
| CT-code clarification | 103ms |
| CT code + coronary purpose + UK | 4,126ms |
| Video dermatoscope search | 417ms |
| Implant-monitoring search | 3,575ms |
| Broad software-code clarification | 29ms |
| Optional DeepSeek explanation | 5,310ms |

The explanation returned `deepseek/deepseek-v3.2`, passed the application's validation, and cited only evidence belonging to the selected professional. This single observed success is not a model-reliability benchmark. The first deployment briefly returned 502 while preparing its index before recovering; no zero-downtime claim is made.

### Visual and interaction proof

- At 1280 × 720, the results region is 429px high, compared with approximately 305px before this release. The 89px introduction scrolls away; navigation and the composer retain their positions. Accepted classification context is 106px high at this width, with optional provenance in Details.
- At 768 × 1024 the first card, including its actions, fits in the initial reading area. At 390 × 844 and 320 × 740 there is no document-level horizontal overflow; source text and controls remain reachable in the results region.
- A real browser journey entered the CT code, answered the purpose question through the composer, then added cardiac MRI as a nice-to-have. Results reranked while preserving a newer multiline draft, focus and a nonzero results scroll position. Reload/resume retains the code. Keyboard profile opening focuses Close; Escape restores the originating card action.
- Normal code clarification leaves the composer empty and says “Add the clinical application to continue.” The original request remains editable. It is not presented as zero matching experts.
- Reduced-motion and pending-request preservation are covered by the frontend regression suite. Physical mobile keyboards, Safari and screen-reader operation were not tested in this release.

Screenshots: [before scrolling layout](screenshots/emdn-scroll-before.png), [desktop panel after](screenshots/emdn-desktop-after.png), [scrolled panel after](screenshots/emdn-scroll-after.png), [complete tablet view](screenshots/emdn-tablet-after.png), [390px](screenshots/emdn-mobile-after.png), [320px](screenshots/emdn-320-after.png). The in-app browser's 1280px captures retain only the visible panel width; desktop overflow was checked separately from DOM geometry. Tablet and phone captures show their complete tested widths.
