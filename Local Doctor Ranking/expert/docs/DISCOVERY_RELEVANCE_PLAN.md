# Discovery relevance release

## Problem and verified causes

Simple professional discovery is being treated as a fully specified assessment. The deterministic parser rejects role-only and broad imaging-interest searches, defaults unspecified criteria to essential, and the search planner skips roles. Cards print multiple source qualifications before users can understand relevance. Source limitations about availability or regulatory experience appear even when neither was requested.

## Implementation

1. Introduce a search-focus priority for new unspecified criteria. Preserve explicit must-haves, preferences, exclusions and saved legacy priorities. Accept meaningful role or clinical-topic searches; clarify genuinely generic requests. Capture whether the user seeks an interest, research or performed activity.
2. Use controlled related terms in retrieval, not as extra requirements. Keep the requested profession, source ownership and activity/interest/research distinctions. Rank primary relevance before related evidence. Use existing BM25 and semantic infrastructure.
3. Present identity, one primary relevance passage, at most two supporting details, and actions. Related research stays an optional supporting detail. Preserve source dates and distinctions. Put full quotations, provenance and generic source limitations in evidence depth. Show material contradictions and explicitly mandatory unsupported criteria visibly.
4. Carry the same interpretation into profile, comparison, saved work and export. Keep the original request accessible. Make focus, must-have and preference selectable. Preserve existing saved priorities and versioned evidence.
5. Adjust homepage copy/examples to welcome simple requests and optional further detail without requiring device, setting or project terminology.

## Verification and acceptance

- Simple cardiologist, cardiology imaging-interest and imaging-research searches retrieve source-backed candidates without requiring an assessment brief.
- Cardiologist intent does not expand to radiologist eligibility. Related CT/MRI terminology is retrieval expansion, not an AND checklist.
- Listed interests satisfy an interest request; they cannot establish personally reporting scans or current practice.
- Unspecified criteria create no mandatory-gap banners. Explicit mandatory requirements and source contradictions remain visible.
- Refinements, removal, priority changes, resumed projects and fallback parsing retain the active intent. No removed historical text returns through retrieval.
- Cards, profiles, comparison and exported evidence preserve candidate ownership, evidence type and dates. No AI generation is required for the card explanation.
- Unit, interaction, patient isolation and full-corpus checks pass; inspect desktop, tablet and phone layouts, keyboard and reduced motion.
- Stage only expert runtime files, deploy the existing expert Railway service, check hosted health/assets and real simple-to-refined searches, then commit and push the expert branch.

## Scope and limitations

No database edits, new provider, patient-demo behavior changes or automated recruitment actions. Existing optional generated summaries remain experimental. Scarlet public recruitment pages support expertise matching and later qualification checks; they are not validation of our exact UI or a customer relationship. No broad inferred regulatory, availability, age or geography requirements.

Sources reviewed: [External expert roster](https://www.scarlet.cc/careers/b8b9848d-e72d-42e2-935b-5a45ba5fc174), [Deployment Optimisation](https://www.scarlet.cc/careers/6efc28da-11ef-4bb7-a08b-7487fff8b27e). Full-time clinical evaluation requirements must not automatically be imposed on every external discovery search.
