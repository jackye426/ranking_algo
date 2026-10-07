# Simple discovery and clearer relevance

Release date: 7 October 2026. Expert Discovery only; patient contracts and database records are unchanged.

## What changed

The starting point can be a specialty, an interest, or a detailed assessment. Unspecified criteria now guide relevance as **Search focus**. Explicit must-haves and nice-to-haves remain distinct. Existing saved projects retain their recorded priorities; this release does not silently reinterpret saved decisions.

For “Cardiologists with radiology interests”, the requested role remains Cardiologist. Medical-imaging terminology expands retrieval across relevant CT, MRI, echocardiography and other recorded imaging evidence. Those terms do not become extra mandatory requirements. The interface shows the interpreted search and allows priority changes and removal.

Cards lead with identity, the strongest task-specific source passage, one optional supporting detail and actions. Recorded activity, listed interest and research remain distinct. Related research adds context without becoming a new requirement or an unsupported claim of qualification. Explicit self-attributed historical research can be shown even when the imported field was categorised as an interest; the clinical topic must occur in the same positive passage. This additional context does not change the ranking. Unrelated availability and regulatory caveats live in source/workflow depth. Missing explicit must-haves, material mismatches and limitations remain visible.

Profiles, comparison and printable review packs use the same source-owned evidence presenter. Full evidence, dates, original links and exact stored-record anchors remain accessible. Optional AI summaries remain experimental and unnecessary for discovery; the DeepSeek provider/model configuration is unchanged.

## Verification

- Real corpus: 22,271 indexed candidates and 273,093 passages, derived from 40,876 source rows. These are discovery records, not approved or available experts. Only four candidates have the separate reviewed external enrichment described in the existing audit.
- New development verification: six simple/focused briefs run with BM25-only, semantic-only and hybrid retrieval; **150/150 checks passed**. Checks cover professional role, source ownership, visibly relevant excerpts and no invented essentials. This is development verification, not a new independent held-out benchmark.
- Existing frozen held-out set: 28 briefs across seven families, replayed with all three retrieval modes; **228/228 critical checks per mode passed**. Hybrid known-candidate recall at 20: **97.92%**, BM25-only: **95.83%**, semantic-only: **93.75%**. First-five source-supported precision on answerable cases: **100%**. These measures cover known reviewed candidates, not exhaustive relevance across the corpus.
- Frozen development set: **104/105 checks per retrieval mode passed**. The sole disagreement is `dev-insufficient-evidence-1`, which expects a specialty-only request to clarify. That expectation is intentionally superseded by the requested simple-discovery behavior; the frozen evaluation was not rewritten to hide it. Generic “I need an expert” still clarifies.
- Local HTTP journey: **38/38 checks**, twelve sequential searches and one exact source citation. Includes simple discovery, optional research refinement, explicit reporting must-have, documented-only filtering, criterion removal, generic clarification and restored scope.

The corpus verification artifacts remain in the ignored local `expert/.cache` directory. They are not deployed or committed as public data.

## Demonstration

1. Start with **Cardiologists with radiology interests**. Check the role, imaging focus and source excerpt; there should be no inferred essential-gap banner.
2. Add **Research would be useful**. Research becomes Nice to have; the earlier profession and imaging interest remain.
3. Try **They must personally report cardiac CT**. This explicitly asks for performed activity; an interest alone must not become reporting evidence.
4. Remove a criterion, inspect two candidates, compare their evidence, save one and download the review pack. The source and uncertainty should remain consistent across views.
5. Try **Cardiologists** and then **I need an expert** as separate searches. The former supports discovery; the latter needs a focused question.

## Boundaries and remaining work

Scarlet's public recruitment material supports matching clinical expertise and subsequent qualification review. It does not establish that our previous gap-heavy cards reflect their preferred workflow. No customer validation, engagement availability, regulatory competence or time savings is claimed.

Broad radiology/imaging language is deliberately broad. A user can specify cardiac CT, cardiac MRI or another modality to narrow it. Imported professional text can still have inconsistent formatting; exact source passages and dates remain available rather than being silently rewritten. Related research is shown only when attributable, clinically related evidence is available.

Qualification, independence and recruitment statuses still require explicit user actions. Browser-local projects remain browser-local. No raw exports, credentials or project notes enter public deployment assets.

## Deployed release

- Preview: [DocMap Expert Discovery](https://docmap-expert-discovery-production.up.railway.app/expert-discovery).
- Railway deployment: `5f0763b0-0e61-4374-9a12-35702baaff94`, expert service only. Runtime ready; deployed frontend hashes match the staged release. Initial verification was on `95961471-d452-4064-a59f-9b814cff7a10`; the final deployment adds the source-scoped historical-research context correction.
- Automated regression suite: **828/828 expert tests** and **243/243 patient tests**. Expert checks include 88 frontend interaction tests and source ownership, intent, hybrid retrieval, project persistence and export consistency tests.
- Hosted health, assets, direct routes and private-path isolation: **12/12 passed**.
- Hosted simple/refined journey: **38/38 checks**, twelve search requests and one exact source route. Five responses used DeepSeek interpretation, five deterministic interpretation, one clarification and one saved-brief restoration. Median 5,060 ms; maximum 7,889 ms. This small mixed journey is not the twenty-search p95 benchmark.
- Final hosted replay after the supplementary-research correction: **39/39 checks**, including the actual historical-research record, twelve searches and one exact source route. Eight DeepSeek interpretations, two deterministic responses, one clarification and one restored brief. Median **3,967 ms**; maximum **5,923 ms**. All twelve asset/health/isolation checks were repeated and passed on this final deployment.
- Twenty sequential warm hosted searches: **20/20 successful**, median **6,882 ms**, p95 **7,703 ms**, maximum **10,413 ms**. Twelve used DeepSeek interpretation and eight used deterministic fallback. The eight-second p95 target passed; the maximum exceeded it. These timings were recorded on the initial release deployment before the final supplementary-research-only correction; that correction retains the same retrieval and ranking path.
- Browser checks: desktop 1280px, portrait tablet 768px, phone 390px and 320px; no document-level horizontal overflow. At 390×844 the first refined card's actions remain above the composer. At 320px the brief has a full-height scrollable editing surface; at 768px the brief is collapsed. Profile Escape restores focus, and continued typing survives a completed refinement. Reduced-motion and pending-navigation behavior are covered by the interaction suite. Physical mobile keyboards, Safari and assistive-technology participant testing were not performed in this release.
