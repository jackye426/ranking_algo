# MDR code-search release

This release adds MDR designation-code lookup and code-set context to Expert Discovery while keeping one active search per project. The patient demo, professional corpus, existing embeddings and DeepSeek configuration are unchanged.

## Demonstration guide

1. Enter `mda0315`.
2. Choose “The software supports diagnosis.”
3. Reply “Coronary artery disease on cardiac CT.”
4. Review the sourced clinical shortlist and open a professional profile.
5. Try `MDA 0315 + MDS1009 + MDT-2010 for detecting coronary artery disease on cardiac CT`.
6. Expand **Official definitions and sources** to inspect device type, characteristics and technology/process context. Remove a chip to change that context without erasing independently requested expertise.
7. Add `Z11030692` to an existing cardiac search. One Cardiac CT criterion is used; the code references do not multiply its ranking weight.

The MDR catalogue contains all 71 published entries. [Catalogue provenance and reproducibility](MDR_CATALOGUE.md) documents the source, exact labels, family counts, digests and reviewed normalization. MDR lookup itself makes no network/model request. Broad categories need the user's clinical purpose; no MDR-to-specialty crosswalk is invented.

## Search and saved-state contracts

- `deviceContext.schemaVersion: 2` stores typed classification references, source/version metadata, criterion origins, suppression and supplied purpose. Legacy singleton EMDN contexts remain readable; saved evidence snapshots remain frozen.
- `classificationUpdate: {action, classifications}` supports add/remove/replace/clear. Code sets are bounded at 32 references and accepted atomically. Unknown members are identified without partially applying the valid subset.
- `deviceCode` retains its compatibility behavior: a string selects one code; null clears classifications.
- `classificationContinuation: {proposal, questionId, questionRevision}` carries an exact answer to its pending proposal. Accepted evidence remains separate. Proposal structure, catalogue metadata, base scope and criterion origins are validated.
- Optional `acceptedBriefVersion` guards stale changes. `requestId` makes successful retries return the same snapshot and rejects conflicting reuse.
- Equivalent criteria merge classification/user origins. Removed criteria remain suppressed. Cosmetic reference order does not change scope; material code or catalogue changes do.
- Project schema one and the existing storage namespace remain unchanged. Backup/import/export carry the set and pending conversation. No nested searches, database migrations or new patient APIs were added.
- Classification metadata is contextual input for optional explanations, never candidate-owned evidence.

## Coverage boundaries

This is clinical-expert discovery. Software lifecycle, manufacturing and technical-assessor competence are outside the demonstrated professional evidence coverage. An explicit request for those assessors receives a capability limitation, not implied clinician qualification.

MDS/MDT codes stay as device context; they do not silently add mandatory qualifications. Separate devices use separate existing projects. A materially unclear combination asks about shared purpose. Compatible broad software codes share the user's purpose answer.

## Verification

- **1,193 expert tests passed**, including catalogue integrity, atomic updates, origin/suppression, malformed/forged proposals, code-set clarification, location continuity, stale requests, saved-project compatibility, browser interaction harness and evidence grounding.
- **243 patient tests passed**.
- **248 frontend/persistence tests** are included in the expert total; desktop/mobile layout rules, quick replies, exact-answer transport, saved scope and legacy snapshots are covered.
- Full-corpus local checks exercised 22,271 indexed professionals / 273,093 passages. The real-record sequence reached sourced cardiac-imaging candidates, mixed MDR/EMDN updates, removal, resume, profile/source access and project backup.
- Regression review found and fixed monitoring-criterion resurrection, pending-draft inconsistency during mixed-code questions, repeated relationship questions, and unsupported technical-assessor requests. The final adversarial review also caught a negated relationship answer ("not the same device") being treated as shared purpose; separate-device answers now preserve the accepted search and direct the user to separate projects.
- Deployment packaging contains **35 allowlisted files**; environment files, private notes, raw exports and caches are excluded. The public MDR catalogue is narrowly unignored in Git.
- Live visual and hosted verification results are recorded below.

## Responsive and interaction review

The real hosted journey `MDA0315 + MDS1009 + MDT2010` → diagnosis quick reply → coronary artery disease on cardiac CT returned sourced professionals in one shortlist. The single project selector, composer and Focused/Directory navigation remain intact.

- Checked 1280px, 768px, 390px and 320px CSS viewports. Document scroll width equalled viewport width at every size. The tablet brief rail collapses; code chips and long classification labels wrap on phones.
- Classification disclosure responds to Enter independently; Tab reaches the first candidate's primary profile action with a visible focus treatment.
- Existing reduced-motion and interaction harness regressions passed. Physical touch devices, native mobile keyboards and Safari were not tested in this release.
- Screenshots are kept in the task's visualization directory: `mdr-before.png`, `mdr-after-question.png`, `mdr-after-results-desktop.png`, `mdr-after-results-tablet.png`, and `mdr-after-mobile.png`. The desktop capture surface clipped at 998 physical pixels despite a 1280px CSS viewport; DOM width checks found no document overflow. Tablet/phone captures show the complete viewport.

One conservative language limitation remains: a compound relationship answer such as “Not separate devices, but one combined device…” can require rephrasing. A plain positive shared-device answer works; separate-device/negated-shared answers never silently combine the applications.

## Hosted release proof — 8 October 2026

- Preview: https://docmap-expert-discovery-production.up.railway.app/expert-discovery
- Railway deployment `39fcfae2-7de1-4f00-8fe3-6452e554b919` reached **SUCCESS**. Only the existing expert service was deployed. The patient service was untouched.
- `node expert/scripts/verify-mdr-hosted.cjs` completed **38 checks** against the final deployment: matching public asset hashes, health/model/corpus identity, multi-turn MDR clarification, complementary/mixed code sets, no duplicate clinical criterion, reorder/removal/suppression, old-snapshot profile and exact citation, backup/export, unsupported technical/IVDR requests, separate-device negation, routes and private/patient endpoint isolation.
- The sourced cardiac results included Dr Justin Carter, Dr Niall Keenan and Dr Jaymin S Shah. Those results came from professional evidence, not from treating classification codes as credentials.
- The optional explanation request returned the existing retryable **sourced evidence fallback**. No successful DeepSeek-generated explanation is claimed for this release check. The model remains `deepseek/deepseek-v3.2`; search results and biographies remain usable without generated prose.
- Corpus identity remains `expert-corpus-v1-003234ea2e49a2446f3f`: 22,271 indexed professionals and 273,093 passages. No corpus or embedding rebuild/version change was made by this feature.
- The service rebuilds its in-memory index on startup. A brief 502 was observed during an earlier deployment's warm-up; subsequent health and route checks recovered. This was not a zero-downtime deployment verification.

### Latency samples

These are diagnostic hosted samples, not a p95 study or a claim of an established latency improvement. Model-backed paths vary; the general-expertise sample was slower than the pre-release sample and should be monitored separately from lookup overhead.

| Request | Before | Final release |
| --- | ---: | ---: |
| `Z12040118` | 575 ms | 396 ms |
| `Z11030692 for detecting coronary artery disease` | 6,794 ms | 6,584 ms |
| `Cardiologists with radiology interests` | 5,258 ms | 7,703 ms |
| `mda0315` → initial purpose question | — | 91 ms |
| Purpose → clinical-subject question | — | 6,042 ms |
| Clinical-subject answer → sourced results | — | 7,273 ms |
| Three-code MDR set with explicit cardiac use | — | 6,834 ms |
| Add EMDN CT to the MDR set | — | 6,664 ms |
| Reorder / remove a code | — | 724 / 626 ms |

Catalogue lookup is deterministic and makes no model call. Applying user-provided clinical context can use the existing interpretation path, which accounts for the distinction between fast lookup and slower complete search. Detailed check/timing output is in the local ignored `expert/.cache/mdr-hosted-verification.json`; no private project data was sent by this verifier.
