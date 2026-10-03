# DocMap blue glass interface refinement

## Objective and decisions

Deliver the approved soft-blue, iOS-inspired consultant search experience without changing retrieval, clinical interpretation, data access or model configuration. Keep the existing Railway preview address. Preserve provenance and important insurance qualifications.

The inspection found flat green surfaces, weak action hierarchy, three competing footer controls, and inline explanations that disrupt result comparison. Existing system typography and generous landing layout are a useful foundation.

## Implementation

1. Replace sage tokens with cool ivory, pearl, powder blue, dark ink and a deeper blue action colour. Use glass chiefly for floating controls and sheets; give cards stable reading surfaces. Keep contrast, 44px touch targets and responsive wrapping.
2. Simplify cards to portrait/name/specialty, hospital/distance/insurance, a short differentiator drawn from existing evidence, and two actions. Move full record details into the explanation sheet while keeping coverage exceptions visible on the card.
3. Use a reusable native dialog for the explanation: a floating desktop panel and a mobile bottom sheet, with identity, loading, validated summary, visible caveats, retry and consolidated sources/profile details. Preserve safe URL handling and immutable search snapshots. Cancel stale work and restore focus/scroll on dismissal.
4. Add immediate control feedback, a short search entrance, gentle refinement continuity, and restrained sheet motion. Animate transform/opacity; use reduced-motion and reduced-transparency alternatives. Keep loading honest and allow immediate dismissal.

## Verification and release

- Run existing unit tests and focused DOM interaction checks for dialog lifecycle, loading/error/retry, caching, stale requests, reset and History.
- Visually inspect landing, real consultant shortlist and explanation at desktop and mobile widths, including long names, missing portraits, insurance exceptions, narrow layouts and empty results.
- Verify keyboard dismissal/focus restoration, retained criteria, actual refinement and absence of browser errors or horizontal overflow.
- Stage only the existing runtime allowlist; verify the manifest excludes credentials/data caches; deploy to the existing Railway service and check health and hosted UI.

## Scope boundary

No Supabase changes, search/ranking changes, model changes, new tracking, new dependencies or custom-domain changes are planned. This is a web interpretation of iOS materials and motion, not native Liquid Glass rendering.

## Outcome

Implemented the soft-blue visual system, two-action cards, exact profile differentiators, reusable responsive explanation dialog, source disclosure and motion. No backend runtime files changed: comparison against the previous deployment manifest found differences only in `public/index.html`, `public/styles.css` and `public/app.js`.

The full suite passes 156 tests. The new frontend integration check covers immutable request ownership, delayed native close events, reset/refinement cancellation, cache, History, evidence fallback, retries, combined insurance exceptions and source-disclosure focus restoration. A second source review found no release blockers.

Browser checks passed at 1280 x 900, 390 x 844 and 320 x 700. Real search remained 104 -> 4 -> 4 for knee/London -> Bupa -> SW5. A one-mile radius returned zero; removing only that criterion restored four with Knee, SW5 and Bupa retained. The live-data local server generated an actual AI explanation for Timothy Waters with sources and the not-fee-assured qualification. Escape returned focus to the original card; reopening used the cache; History preserved earlier criteria. No console errors or horizontal overflow were observed.

The first release, Railway deployment `1d5db03b-477c-40db-adbf-93f2803e4866`, succeeded. Hosted health confirmed all 4,031 records and DeepSeek v3.2; all three public frontend files matched local hashes. A real knee-replacement/Bupa/SW5 search returned three consultants. Ravi Popat's validated AI explanation appeared in the mobile bottom sheet, with visible confirmation advice and full sources. Handle-drag dismissal restored focus to Ravi's card. The same cached explanation was checked in the desktop panel, with no browser errors or horizontal overflow.

Hosted QA identified identical labels for topic and procedure. The final polish now prefixes only colliding non-topic labels with their role (e.g. `Procedure: Knee replacement`), while preserving independent filter removal. The regression covers both removal keys and unchanged source labels. Mobile header drag also prevents accidental text selection. The suite still passes 156 tests.

Both 27-file staging manifests were checked for hashes and excluded credentials/caches. Final deployment `75eb7845-a228-44d7-acdf-b94d5989edf7` from `outputs/docmap-deployment-v8` succeeded. Hosted health is ready with 4,031 records and embeddings enabled; all three public frontend files match the local release hashes. Native Safari/iPhone hardware has not been exercised; viewport checks use the in-app Chromium browser.

Final hosted verification confirmed three results for `Knee replacement near SW5 accepting Bupa`, distinct topic/procedure chips, no horizontal or action-row overflow at a measured 320px viewport, and no browser warnings/errors. The final desktop screenshot is `outputs/docmap-blue-desktop.jpg`; explanation views are `outputs/docmap-blue-desktop-sheet.jpg` and `outputs/docmap-blue-mobile-sheet.jpg`. Temporary viewport overrides were reset. All planned work is complete; no deployment blockers remain.

## Consultant profiles and homepage walkthrough — 3 October 2026

The next refinement addresses the approved interaction and information plan:

1. Apply the supplied DocMap heart-and-dot artwork and its sampled indigo (`#3231e4`) with pale periwinkle surfaces. The original JPEG is displayed through a cropped CSS frame, without redrawing the mark.
2. Clear submitted text immediately, display the accepted message, preserve drafts typed during a request, and offer retry/edit after failure. Home preserves the current conversation; Resume returns to it; New search explicitly resets it. Browser Back/Forward and profile close restore the appropriate view, focus and scroll. Queued browser traversal cannot dismiss a subsequently opened profile.
3. Add informative clinical excerpts, practice details and concise relevance to cards. View consultant opens a persistent profile without requesting AI. About, clinical focus, practice locations, recorded languages/registration and source links remain mounted while an independent personalised section loads, completes or fails. Suppress clearly damaged ingestion fragments from polished excerpts while preserving original text in Sources.
4. Replace the scenario dialog with an inline, three-story homepage walkthrough. Prepared examples use verified consultant excerpts, links to the supporting record and official profile, keyboard-accessible tabs, replay and reduced-motion handling. The CTA only focuses the real input. The hospital-value section describes pilot measures and makes no numerical ROI claims.
5. Animate submission, initial result placeholders, retained result positions and profile transitions without adding delays to retrieval. No new analytics, model calls for basic profiles, dependencies, clinical filtering or database changes are introduced.

Validation includes the full suite plus focused offline tests for persistent profile DOM, evidence handling, tab controls, immediate clearing, draft/retry behaviour, asynchronous browser history, stale requests and focus/scroll restoration. Local real-data search was verified on 4,031 records: knee/London returned 93 candidates, Bupa narrowed to 4, and SW5 reordered those 4 by distance while retaining the topic and insurer. The observed sequence took approximately 5.0s, 2.3s and 2.4s; the first turn included 3.4s of interpretation and 1.3s of retrieval. These are observations, not latency guarantees. A real AI explanation completed while its consultant profile remained present.

Deployment continues to use a deny-by-default, 31-file runtime manifest. New profile/walkthrough assets and the logo are explicitly allowed in staging, Docker context and Docker COPY instructions. Private environment files, raw records, model caches and repository history are excluded. The configured readiness window is 900 seconds.

The final local suite passes **210 tests**. Browser checks covered desktop, 390px and 320px widths; the narrow view has no horizontal overflow. Back and Resume preserve the shortlist, and profile close restores the originating card's focus. All three walkthrough excerpts were checked against their served supporting records. Hosted QA identified corrupted clinical-interest fragments in Rahij Anwar's source record. The final presentation-only correction suppresses those fragments and characteristic mojibake, uses an intact clinical biography sentence and preserves all original interests in Sources. The application remains a web approximation of iOS interaction; no native iPhone/Safari hardware check was performed.

Final Railway deployment `349606e0-dcbd-424c-accb-125829bcd346` succeeded from the verified `outputs/docmap-deployment-v13` manifest. Public health returned HTTP 200 with 4,031 Supabase records, embeddings ready and DeepSeek v3.2 configured for interpretation and explanations. All nine public asset hashes match the release. Hosted browser checks confirmed immediate input clearing, 93 knee/London matches, profile details available before AI, Home/Resume preserving results, working walkthrough tabs and no browser warnings/errors. After the final correction, the live Rahij Anwar card displays the intact biography sentence instead of corrupt fragments. No backend runtime, database or credential changes were made in this release.
