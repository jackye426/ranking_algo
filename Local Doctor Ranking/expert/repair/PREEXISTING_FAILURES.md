# Frozen search failures and repair promotion — 8 October 2026

Baseline, R0 and R1 were evaluated with the same current repair search/brief modules, untouched scenario labels and actual offline BM25, MiniLM and hybrid retrieval. This is a corpus ablation, not a comparison against an old search implementation. Each of the three modes has 14 critical failed checks across 11 cases: main 2, round-two 4, final 8. No new critical-check failures appeared in R0 or R1. Absolute frozen search acceptance nevertheless fails; round-two and final also miss aggregate recall/precision thresholds.

## Three broad-discovery expectation conflicts

| Case | Frozen expectation | Observed behavior |
|---|---|---|
| dev-insufficient-evidence-1 | Ask for clarification for “Find a cardiology expert.” | Starts broad cardiologist discovery; 1,184 baseline results. |
| hold-insufficient-evidence-2 | Ask for clarification for “Find a dermatology expert.” | Starts broad dermatologist discovery; 647 baseline results. |
| r2-insufficient-evidence-02 | Ask for clarification for imaging expertise | Starts broad medical-imaging discovery; 4,369 baseline results. |

This behavior is deliberate in the current implementation: expert/brief.cjs:221 accepts a meaningful role or clinical/research focus, and expert/brief-discovery.test.cjs:23 explicitly requires broad specialty queries to start without clarification. The frozen evaluation expectations disagree with those current product tests. They were not silently rewritten or waived for this ablation.

## Eleven fail-closed checks in eight interpretation cases

| Case | Trigger that cannot be safely applied | Failed checks / observed consequence |
|---|---|---|
| r2-skin-lesion-images-03 | “Clinical expertise is essential” is unresolved; the later request to drop research has no accepted initial brief to edit. | One missing Skin lesions check; clarification with empty unaccepted brief and zero results. |
| r2-outside-specialist-setting-03 | The removal target “home use from the requirements” is not resolved to the active Community / home use requirement. | One removal check; clarification retaining the prior accepted brief and zero results. |
| r2-insufficient-evidence-03 | “we only want options where every essential requirement is documented” is treated as unresolved expertise. | One missing Skin lesions check; clarification with empty unaccepted brief and zero results. |
| final-outside-01 | “A user without medical training may act on its advice” is an unresolved control. | One missing Skin lesions check; clarification with empty unaccepted brief. |
| final-outside-04 | “without assuming a particular modality” cannot be applied safely. | Three checks: Skin lesions, technology context retained, and technology-context meaning; clarification with empty unaccepted brief. |
| final-relationship-03 | “Do not infer independence from a missing company mention” is an unresolved control. | Two checks: Cardiac CT and manufacturer retained; clarification with empty unaccepted brief. |
| final-clinical-01 | “do not treat a consultant title as proof of it” is an unresolved control. | One missing Cardiac CT check; clarification with empty unaccepted brief. |
| final-insufficient-03 | “Return only candidates whose essential requirements are documented” is treated as unresolved expertise. | One missing Cardiac CT check; clarification with empty unaccepted brief. |

expert/brief.cjs:375 preserves the prior accepted brief or returns a blank brief when interpretation is incomplete; lines 378 onward identify unresolved controls; createBriefInterpreter at line 409 applies these gates. The evaluation uses client:null, so this specifically exercises deterministic interpretation without paid model recovery. These are genuine usefulness failures, but they halt retrieval with an explicit unapplied-request/clarification state. They are not evidence that a requirement was silently accepted then ignored.

The full prompts, failed-check names, brief states, and fresh deterministic interpretation turns are retained in the private preexisting-failure-review.json. No scenario labels were changed.

## What the measured result permits

- All absolute search acceptance gates are **not passed**. The current frozen pack cannot support an unqualified search-quality acceptance or existing-live adoption claim.
- The unchanged failures do not themselves show a repair regression in identity, provenance, clinical activity attribution, source evidence, or patient isolation. Those have separate replay and focused-test gates.
- R1 has no hybrid or BM25 case-level recall/precision loss. Its semantic-only r2-cardiac-ct-03 case loses one top-20 anchor because Dr Neghal Kandiyil moves from rank 20 to 21; it stays searchable, and hybrid is unchanged. R0 has a separate semantic-only boundary loss repaired in R1.
- A protected isolated preview can be used for further validation while these limitations remain visible. Existing-live adoption still requires the outstanding acceptance decision and validation; this report does not waive that gate.
