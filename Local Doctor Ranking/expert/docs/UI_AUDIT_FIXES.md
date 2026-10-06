# UI audit corrections

Checkpoint: 7 October 2026. This release addresses faithful brief editing, evidence presentation and recoverable project workflows in **DocMap Expert Discovery**. It does not redesign or redeploy the patient application. The separate expert preview is deployed; local and hosted observations are distinguished below.

## What changed

- **Follow-ups edit the active brief.** “Research should be optional” updates the existing research criteria and preserves their IDs. “Helpful” and “useful” are preferences; required clinical reporting remains essential. Validation research remains distinct from diagnostic-study appraisal. Recognised operations are resolved before additive extraction, and a model patch cannot recreate the instruction as a literal criterion.
- **Removal is unambiguous.** “Remove the UK location requirement” removes geography and its mentions from retained retrieval context. Short aliases are removed at word boundaries, without altering unrelated words. Negated commands preserve requirements; an ambiguous reference such as “make that optional” asks which active criterion should change instead of guessing.
- **Equivalent wording stays one requirement.** Primary care, primary-care experience and typographical-hyphen variants share a canonical criterion. “Primary-care clinicians” expresses setting plus a generic search subject, not a new profession or an inferred GP restriction. Explicit GP restrictions and specific non-doctor roles remain separate. Older duplicate chip IDs still address the surviving equivalent requirement when changing priority or removing it.
- **Evidence is easier to compare without overstating it.** Shared card, comparison and export presentation distinguishes recorded activity, listed interests, procedures, research and training. Cards foreground relevant, candidate-owned supporting passages and separate essential confirmation gaps from preferred evidence gaps. This changes presentation, not the underlying qualification decision.
- **Citations open the relevant evidence.** Links lead to the selected passage in the stored evidence record, with provenance and available original-source links. A source publication date is distinct from a database processing date. A reviewed summary remains labelled as a summary; source limitations and missing dates remain visible.
- **Project work can resume and recover.** Original brief wording, structured requirements, filters and failed requests are retained. Resuming a saved brief reruns server-owned retrieval without another interpretation step; it does not accept saved candidate evidence as authoritative. Failed edits can be retried against their saved base brief. Draft recovery, mobile brief controls and edit focus have focused regression coverage. Notes and review decisions remain browser-local.

## Verified locally

| Check | Result | Scope |
| --- | --- | --- |
| Expert/evaluation suite | **728/728 passed** | Includes interpretation, presentation, recovery, persistence, source ownership and saved-brief boundaries. |
| Patient regressions | **243/243 passed** | Existing patient behavior; not a patient release. |
| Frozen retrieval replay | **42 briefs, all three methods passed** | 14 development and 28 held-out briefs; actual BM25, local MiniLM and hybrid retrieval. Each method passed 105 development and 228 held-out trust/refinement assertions. |
| Full-corpus audit workflow | **36/36 assertions across nine requests passed** | Quoted audit follow-ups and controlled initial equivalents, saved-brief resume/retry, real professional evidence, selected citations and backup/export consistency. |
| Focused parser boundary checks | **225/225 passed** | Includes 45 new interpretation regressions; this is a subset/earlier focused run, not additional tests to add to 728. |

The full replay used corpus `expert-corpus-v1-19dcca60f6fbf2fec923`. It reuses known, frozen cases and is a **regression replay**, not a fresh independent evaluation. The audit did not supply every original initial prompt; the workflow report explicitly distinguishes quoted follow-ups from controlled equivalents. Local deterministic or mocked-model checks do not establish live DeepSeek interpretation accuracy.

Private ignored reports retain the details: `expert-ui-audit-release.txt`, `patient-regressions-ui-audit.txt`, `discovery-evaluation-ui-audit-final-{development,holdout}.json` and `audit-fixes-local-ui-audit-final.json`. The workflow is reproducible with `evaluation/verify-audit-fixes.cjs` against the authorised local or hosted expert preview, using a new round name.

## Hosted verification

Deployment `81dcf40a-3999-4e77-9323-a91d87f36dce` reached Ready at 23:46:09 UTC on 6 October (7 October in London), then SUCCESS. Health returned the same evaluated corpus. All **12 route, asset-hash, CSP and blocked-path checks passed**. The 23-file runtime allowlist contains no raw exports, project notes, evaluation cache or credentials.

The audit journey passed **36/36 checks across nine hosted requests**. Three responses used DeepSeek interpretation, four used the explicit interpretation fallback, one restored a saved brief without interpretation, and one applied a deterministic saved priority edit. The earlier five-request live DeepSeek preflight passed all five quoted-operation/priority checks; neither observation is a general accuracy claim. Saved-brief resume preserved the exact brief and version and retrieved the same candidate order. Candidate ownership, strongest reporting quotations, listed-interest labels and exact source links passed against real records, including Ahmed and Kandiyil.

The separate twenty-search run returned sourced results in **20/20 cases**, with **3,061 ms median and 7,268 ms p95** (nearest rank). Seventeen responses used DeepSeek interpretation, including cache hits; three used fallback. The eight-second p95 target passed, although the slowest response took 8,848 ms. No browser searches ran concurrently. This is one preview observation, not a response-time guarantee or a claim that model availability improved.

See [deployment verification](DEPLOYMENT_VERIFICATION.md) for the final broader workflow and browser checks. Earlier release records, unsuccessful attempts and model-generation outcomes remain historical evidence.

## Browser observations and fixes found during verification

Local Chromium checks covered desktop, 768px portrait tablet, 390px and 320px CSS layouts. The brief collapses on portrait tablets; the mobile editing sheet has a usable scrolling surface. No document-level horizontal overflow was observed. Profile Escape/Back/Forward restored focus and retained the multiline draft. The final single-quotation comparison-label simplification passed a separate 114-test focused replay after the aggregate suite.

A real interruption during the controlled local server restart retained the shortlist, restored editable submitted text and exposed Retry/Edit after reload. A rapid reload initially lost the last characters typed before IndexedDB completed. A versioned, project-scoped sessionStorage draft mirror now synchronously preserves those keystrokes and is reconciled into IndexedDB; the same immediate-reload check passed after correction. Newer drafts are never overwritten by an older failed submission. Separate tests cover typing while saving notes and opening an activity dialog in one project then navigating to another.

The local fictional test project retained saved candidates, rationale and notes on reload and resumed discovery from its structured brief. The review-pack button displayed a download-success acknowledgement, but the browser download observer timed out; receipt of that particular browser file is not claimed. Generated HTML contents and JSON roundtrip were independently verified against the same real hosted snapshots. The stored-record citation showed the selected reporting passage first, with missing original-page/date limitations and technical details collapsed.

## Limits retained

Interpretation supports finite language coverage and asks for clarification when an edit cannot be resolved. Evidence labels describe the records; they do not certify current practice, competence, availability, qualification or independence. Browser storage and backups do not provide collaborative accounts or a regulator-verified audit trail. Responsive viewport and automated interaction tests are not physical mobile-keyboard certification.

Optional generated explanations remain experimental and deferred. This release does not claim to repair their reliability, validate new model-generated explanations, demonstrate clinical superiority or establish ROI. See the [discovery QA history](DISCOVERY_QA_FIXES.md), [release audit](RELEASE_AUDIT.md) and [model verification](MODEL_VERIFICATION.md) for earlier outcomes and limitations.
