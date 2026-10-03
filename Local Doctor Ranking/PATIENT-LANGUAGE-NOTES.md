# Everyday patient language — 2 October 2026

The demo should show how a person's clinical concern, previous care and goals help find relevant documented practice. Postcode and insurance remain useful refinements; they are no longer the landing page's main examples.

## Experience

The landing page invites: **Tell us what you’re experiencing and what matters to you.** Its animated text and clickable examples use the same complete requests:

- “I’m a runner with knee pain and want to get back to running”
- “I have stage 3 endometriosis and want to discuss excision surgery”
- “My periods are very painful and I haven’t been diagnosed”

Short button labels keep the layout quiet. The follow-up input says **Tell us more, or refine your search…**. Animation pauses for reading, never replaces typed text, and respects reduced motion. This iteration targets everyday English, not multilingual interpretation.

## Search and explanations

The interpreter keeps the explicit clinical concern and requested procedures separate from the person's context. Running goals and failed physiotherapy are retained as context, not surgery requirements. Follow-ups preserve earlier criteria. A lack of diagnosis cannot turn symptoms into an inferred diagnosis; staging never proves a consultant's stage-specific experience. Original patient wording is retained so a model paraphrase cannot reverse negation. Bounded context that cannot safely fit asks for a shorter description rather than silently dropping meaning.

Both actual BM25 and MiniLM embedding retrieval receive the clinical concern and relevant context. BM25 removes conversational filler and expands a few linguistic word forms, such as “painful periods” and “period pains”; it remains the repository's BM25 implementation. The indexes use mapped clinical interests, specialty and procedures, including attributed clinical practice extracted by the existing mapper. Raw biographies are excluded from retrieval because they also contain hobbies and administrative prose. Hard filters continue to require their existing source evidence.

Evidence selection checks the requested clinical phrase and can supplement the local model's selection with directly relevant clinical facts from the same consultant. A running goal can surface “Running injuries” or “Runner's knee”; the doctor's personal interest in running cannot establish clinical experience. Requested procedure evidence remains first. “Painful sex” cannot stand in for “painful periods”.

DeepSeek explanations receive the retained context and selected source facts. They may connect a goal to documented practice, but must not promise a return to activity, diagnose symptoms or infer that unsuccessful prior care makes surgery suitable. Independent support checking and the immediate cited profile summary remain in place. This change adds no extra remote AI call to either search or explanation generation.

## Verification scope

Unit tests cover interpretation, follow-up state, unsupported model changes, both retrieval paths, clinical evidence selection, source preservation and animation behavior. An offline audit uses all 4,031 cached verified Spire records, the actual local MiniLM and FLAN models and real BM25, with network access blocked. The first-person examples are fictional demo inputs; this audit does not transmit them to a remote model.

The final suite passed **189 tests**. The five-search offline audit made **zero network attempts**, and all 30 displayed results had source citations:

| Request | Total | BM25 candidates | Embedding candidates |
| --- | ---: | ---: | ---: |
| Knee pain baseline | 433 | 433 | 398 |
| Stage 3 endometriosis, requesting excision | 105 | 105 | 102 |
| Runner with knee pain and a return-to-running goal | 433 | 433 | 414 |
| Same runner, adding unsuccessful physiotherapy | 433 | 433 | 421 |
| Painful periods without a diagnosis | 142 | 104 | 135 |

The running context changed the leading profiles and added exact “Running injuries” and “Runner's knee” source facts. The physiotherapy follow-up preserved the knee concern and running goal, changed ranking, and added no procedure requirement. The painful-periods results used relevant menstrual symptom evidence; none of the six summaries substituted endometriosis, painful sex or laparoscopy. All six excision summaries retained the limitation on unverified stage-specific experience. Broader semantic matches lacking a direct symptom phrase receive a sourced specialty fallback without a claim of exact fit.

The full task-workspace report is `outputs/offline-patient-example-audit-v3.json`. The rebuilt embedding cache is fingerprint-checked against the current clinical corpus and was reused for the localhost preview; production builds its index from the connected reader. Deployment uploads exclude this cache and all local records and credentials.

## Live verification

Railway deployment `9605052d-66f2-4caf-ab28-32d9e84b5695` succeeded at the existing preview URL. Its index prepared in about 105 seconds before readiness; all 4,031 records and both model services are ready. All 27 staged runtime files match the tested source, and the three published frontend assets match their local hashes.

The established generic knee-directory check passed all six assertions: four-turn location/insurance/specialty/procedure refinement, an earlier card retaining its original criteria, actual OpenRouter generation, valid citations and insurance qualifications, an identical cached response, and rejection of client-supplied explanation criteria. The live counts were **93 → 4 → 4 → 3** with the new clinical-only index. The checked explanation took **6.56 seconds** and its cached repeat **53 ms**, observations rather than speed guarantees. This remote check submitted generic directory searches and public profile facts, not the first-person examples above.

Local desktop, 390px and 320px layouts were inspected without horizontal overflow. The live landing page has the new examples and invitation, no recorded browser warnings/errors, and a saved screenshot at `outputs/docmap-patient-language-live.jpg`. The localhost server was also restarted with the tested code.

Live model interpretation is still probabilistic. Unfamiliar wording can require clarification or fall back to the supported explicit terms; this update is not a claim of universal language understanding. Missing clinical evidence remains missing, and ranking expresses relevance of recorded practice rather than clinical suitability or quality.
