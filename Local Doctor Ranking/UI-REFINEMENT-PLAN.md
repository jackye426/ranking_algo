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
