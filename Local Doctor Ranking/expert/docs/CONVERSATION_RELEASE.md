# Conversational clarification and quick replies

8 October 2026 · Expert Discovery only.

## Product behavior

A request that needs context now opens a compact conversation. The submitted request, DocMap's question, reviewed quick replies and one reply composer appear together. Initial questions hide empty candidate controls. When candidates already exist, the accepted shortlist remains available with a previous-results notice and the question above the composer.

Quick replies send their exact visible text immediately. CT software offers Cardiac CT, Brain CT, Lung CT and General CT. V92 offers three purposes and then asks for the clinical subject when it is still missing. General expertise questions offer three explicitly labelled examples. Unreviewed questions have free text only. These suggestions need no additional model call.

The official code definition, hierarchy and provenance are optional under View classification. Location remains a separate compact control. Viewing a question or choosing an example creates no professional evidence or qualification claim.

## State and recovery

- Browser-local `pendingClarification` holds the question, originating operation, accepted base, proposed partial brief, filters and device metadata independently of accepted results.
- Ordinary replies resume the returned partial brief. Device replies retain only the unresolved request and code. Conversation history is never replayed into retrieval.
- A question does not advance accepted brief versions, replace candidates or stale saved decisions. A completed response updates criteria and results together.
- Cancellation resumes accepted scope explicitly in a new server session, including accepted contact filters and location. This prevents server partial proposals leaking into the next search.
- Typed drafts survive quick replies. Failed replies retain the question and retry operation; only visible answer text is restored if the composer is empty.
- Question actions check both the originating project and question ID, including imported projects with the same saved question. Concurrent or duplicate submissions are ignored.
- Optional `conversationLog` stores the last 100 visible messages, questions and result acknowledgements. Retries deduplicate entries. Schema-one project backups remain compatible; pending state and history round-trip without replacing frozen saved evidence.

## API and release scope

`/api/expert/search` retains its request fields and statuses. Clarification responses add `{ kind, question, quickReplies: [{ id, message }] }`. Stable kinds are `ct-application`, `device-purpose`, `device-clinical-subject`, `expertise` and `context`. Invalid codes, conflicts, interpretation failures and outages retain recovery responses.

The reviewed catalogue is in `expert/clarifications.cjs`, included in both deployment allowlists. No database migration, professional source changes, re-embedding, patient behavior changes or model-provider changes are included. Actual BM25, MiniLM retrieval and DeepSeek remain in use.

## Demonstration journeys

1. Enter `Z11030692`. Select **Cardiac CT**, or type the clinical use. Review sourced results. Type a draft before selecting a chip to see it preserved.
2. Enter `V92`. Choose **The software supports diagnosis.** The next question requests a clinical subject. Reply **Cardiac CT for coronary artery disease**.
3. Enter **I need a specialist**. Choose a reviewed example, then remove the sole expertise criterion. Previous results remain until the next answer; cancelling keeps the accepted search.
4. Leave a question pending, return Home or reload, then use **Continue conversation**. Backup/import retains the same question, proposed scope and visible history.

## Verification

Automated regressions: **1,112 expert tests**, including **162 frontend interaction tests**, and **243 patient tests** passed with no failures or skips. They include question metadata, two-step clarification, source ownership, pending scope/removal semantics, draft recovery, duplicate clicks, location precedence, saved snapshot consistency, project switching, retry, import and backward compatibility.

Independent real HTTP-to-UI harness probes reproduced and verified fixes for pending contact-filter cancellation/reload and stale controls targeting an imported copy. Source, ranking and patient regressions remain green.

The first hosted pass completed **90 API/asset checks**, including all reviewed reply families, the V92 second question, direct source citations, partial-brief backup/import and accepted-scope cancellation. A typed CT check initially failed because the assertion expected lowercase “lung cancer”; the actual interpreted label was “Lung cancer.” The assertion now ignores capitalization while continuing to require that exact concept and exclude cardiac CT.

Real browser testing found a cascade conflict that left the old candidate heading visible during an initial question. The heading now has an explicit hidden state. The second UI pass also added the compact location disclosure and a visible previous-results label. These fixes have focused regressions.

Accepted code/location removal now pauses with the other criteria controls while a question is pending. Cancellation re-enables every filter. Starting over before the first accepted search keeps the unsent reply editable on Home, clears only the abandoned original request and retains the conversation log. If a separate Home draft also exists, Use other saved draft swaps the two without overwriting either.

Browser verification on the hosted preview covered:

- CT quick reply with a multiline draft retained; immediate disabled reply controls and source-backed results.
- Removing the sole CT criterion, reloading, Continue conversation, then a keyboard-activated Dermatologists reply. The new brief contains Dermatologist, without resurrected CT.
- V92 purpose reply, a free-text clinical-subject question, compact location expanded to UK, then source-backed cardiac/coronary results.
- Visible history containing the exact quick reply rather than joined transport text.
- Existing profiles opening against the displayed CT snapshot while a question waits; browser Back restores the pending question and card focus.
- Desktop 1280×720, tablet 768×1024, 390×844 and 320×568. No document-level horizontal overflow. Quick replies are 44px high; longer questions scroll separately from the composer.
- A short 390×500 viewport retained the reply control within the viewport, with the question region scrollable and keyboard-reachable. This simulates reduced available space; it is not a physical mobile-keyboard test.

Reduced-motion behavior is covered by the existing media-query override and interaction regressions. Chromium was used for browser inspection; physical touch devices, Safari and screen-reader testing were not performed.

Screenshots: [before](screenshots/conversation-before.png), [desktop](screenshots/conversation-ct-desktop.png), [tablet](screenshots/conversation-ct-768.png), [390px](screenshots/conversation-ct-390.png), [320px](screenshots/conversation-ct-320.png), [long follow-up](screenshots/conversation-subject-320.png), and [previous results retained](screenshots/conversation-previous-results.png).

The deployment payload contains 30 allowlisted files (2,901,892 bytes), excluding credentials, private project data, raw professional exports and local caches. Final deployment: `28a4e9d2-42c3-495f-a921-ce9b89dbda3f` on the existing Expert Discovery service.

Railway reports **SUCCESS** for that deployment. The final hosted verification finished at 14:20:13 UTC on 8 October 2026: **90 checks passed across 30 requests**, with the hosted public assets matching the local release hashes. The slowest request in this diagnostic run took 6,686ms; this is not a formal latency percentile benchmark.

The last browser repeat for the final cancellation/Start over guards was blocked by in-app browser connection timeouts, including on a fresh tab. The earlier hosted visual journeys and screenshots remain valid for the presentation; the final guards passed the 162 frontend tests and the complete expert suite. The viewport override was reset after testing. Physical-device, Safari and screen-reader checks remain outside this verification.
