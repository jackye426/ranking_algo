# V2 Ranking Algo & Clinical-Intent Plan

This plan turns session-context and ranking improvements into a concrete implementation roadmap. It covers: what “safe lane” is for, a data-derived subspecialty list, v2 ranking changes (high/medium priority), and making clinical intent the main driver of session context.

---

## What “safe lane” is for

**Safe lane terms** (`safe_lane_terms`) are a **small set of terms (max 4) that are added to the BM25 query** in addition to the verbatim patient query (`q_patient`).

- **Purpose:** Improve retrieval by expanding the BM25 query with terms we’re **confident** won’t misdirect or over-narrow search.
- **Why “safe”:**  
  - **Procedure terms** (e.g. “angiography”, “stent”, “catheter”, “ablation”) can over-narrow: they might match only docs that literally mention that procedure and miss equally relevant doctors. They can also be ambiguous (e.g. “ablation” in different contexts).  
  - **Symptom/condition terms** (e.g. “chest pain”, “palpitation”, “arrhythmia”, “heart disease”) are considered safer: they describe what the patient has or feels and align with how we want to “lane” the query (e.g. coronary vs rhythm). Adding a few of these to the BM25 query helps pull in the right kind of practitioners without over-committing to one procedure.
- **How they’re chosen:** The function `extractSafeLaneTerms(intent_terms, 4)` in `session-context-variants.js` (lines 424–464) **filters** the full `intent_terms` list:
  - **Include:** Terms matching “safe” patterns (e.g. chest pain, angina, coronary [but not “coronary angiography”], ischaemic, heart disease, palpitation, arrhythmia, breathless, dyspnea).
  - **Exclude:** Terms matching “procedure” patterns (interventional, angiography, pci, stent, surgery, procedure, bypass, catheter).
- **Where they’re used:** In `local-bm25-service.js`, the BM25 query is built as: **`q_patient` + `safe_lane_terms` (max 4) + `anchor_phrases`**. So safe_lane_terms directly expand the retrieval query.
- **Current gap:** In the **parallel** variant, `safe_lane_terms` is hardcoded to `[]`, so BM25 only gets `q_patient` + `anchor_phrases`. The parallel variant never calls `extractSafeLaneTerms`, so we’re not using this mechanism. V2 should call it and pass the result as `safe_lane_terms`.

**Summary:** Safe lane = “a few high-signal symptom/condition terms we’re willing to add to the BM25 query; procedure-heavy terms stay out of the query and are used only in rescoring.”

---

## Plan overview

| Phase | What | Output |
|-------|------|--------|
| **1** | Derive pre-fixed lists from practitioner JSONs (subspecialties, procedures, conditions, optional visit reasons) | `subspecialties-from-data.json`, `procedures-from-data.json`, `conditions-from-data.json` (+ optional `visit-reasons-from-data.json`) |
| **2** | Clinical intent v2: data-driven subspecialties/procedures/conditions, anchors, specialty-in, examples | Updated clinical prompt + response schema |
| **3** | Session context v2: merge anchors, safe_lane, subspecialties in intent_terms, normalization | `getSessionContextParallelV2` (or equivalent) |
| **4** | Wire v2 into ranking and benchmark | A/B vs current baseline |

---

## Pre-fixed lists from your JSON (conditions, procedures, visit reasons)

**Yes – you should make pre-fixed lists from your JSON.** They give the model and ranking pipeline a single vocabulary that matches how practitioners are actually described, so expansion_terms, anchor_phrases, and likely_subspecialties align with your index and rescoring logic.

**What your JSON already has:**

| List / concept | Source in practitioner JSON | Format |
|----------------|-----------------------------|--------|
| **Subspecialties** | `practitioner.subspecialties` | Array of strings (e.g. `["Heart Failure", "Electrophysiology", "Interventional Cardiology"]`). |
| **Procedures** | `practitioner.procedure_groups[].procedure_group_name` | One string per procedure (e.g. "Catheter Ablation", "Pacemaker Surgery"). Also in `clinical_expertise` as "Procedure: X; …". |
| **Conditions** | `practitioner.clinical_expertise` | Semicolon-separated string; extract segments "Condition: X" (e.g. "Condition: Atrial Fibrillation", "Condition: Coronary Artery Disease"). |
| **Clinical interests** | `practitioner.clinical_expertise` | Free-text segment after "Clinical Interests: …"; optional for later. |
| **Visit reasons / reasons to see** | Derived | Union of **conditions** + **procedures** (what doctors treat and what they do). No separate field; treat “visit reason” as “condition I have” or “procedure I need”. |

**Recommended pre-fixed lists to build:**

1. **Subspecialties** – From `subspecialties`; global and per-specialty. Use in clinical prompt so `likely_subspecialties` and expansion_terms use your labels.
2. **Procedures** – From `procedure_groups[].procedure_group_name` (and optionally "Procedure: X" in clinical_expertise, deduped). Use so expansion_terms and anchor_phrases prefer your procedure names.
3. **Conditions** – From parsing "Condition: X" in `clinical_expertise`; dedupe and sort. Use so expansion_terms and anchor_phrases prefer your condition names.
4. **Visit reasons (optional)** – Combined list: conditions + procedures (optionally with a label `type: "condition" | "procedure"`). Use in prompts as “reasons to see a doctor” or for validation.

**How to use them:**

- **Inject into prompts:** e.g. “When choosing expansion_terms and anchor_phrases, prefer phrases from these lists: [subspecialties for specialty], [top N procedures], [top N conditions].” You can pass per-specialty slices so the prompt isn’t huge.
- **Validate/normalize:** After the LLM responds, map or validate expansion_terms and anchor_phrases against these lists (e.g. pick closest match, or drop if no match). Start with “prefer” in the prompt; add validation in a later iteration if needed.
- **Few-shot examples:** Build 2–3 examples using only terms from these lists so the model sees the exact phrasing you want.

**Where they live:** One-off script (e.g. `build-lexicons-from-data.js`) that reads the five specialty JSONs and writes e.g. `subspecialties-from-data.json`, `procedures-from-data.json`, `conditions-from-data.json`, and optionally `visit-reasons-from-data.json` (conditions + procedures). Re-run when practitioner data is refreshed.

---

## Phase 1: Subspecialty, procedure, and condition lists from your JSON

**Goal:** Build pre-fixed lists (subspecialties, procedures, conditions, and optionally “visit reasons”) from practitioner data so prompts and validation use your vocabulary.

**Steps:**

1. **Source files:** The five specialty JSONs: `cardiology.json`, `general-surgery.json`, `obstetrics-and-gynaecology.json`, `ophthalmology.json`, `trauma-and-orthopaedic-surgery.json`.
2. **Subspecialties:** For each file, read `practitioners[]`; for each practitioner collect `practitioner.subspecialties` (array of strings). Flatten and dedupe; sort. Output global list and per-specialty breakdown.
3. **Procedures:** For each practitioner collect `practitioner.procedure_groups[].procedure_group_name`. Flatten and dedupe across all files; sort. Optionally also parse "Procedure: X" from `clinical_expertise` and merge (dedupe).
4. **Conditions:** For each practitioner, parse `clinical_expertise`: split on ";", then for each segment that starts with "Condition: ", take the value (e.g. "Atrial Fibrillation"). Flatten and dedupe; sort.
5. **Optional – visit reasons:** Combine conditions + procedures into one list (with optional `type` field). Or keep separate and treat “visit reason” in prompts as “condition or procedure from these lists”.
6. **Output files:** e.g. `subspecialties-from-data.json`, `procedures-from-data.json`, `conditions-from-data.json`, and optionally `visit-reasons-from-data.json`. Single script (e.g. `build-lexicons-from-data.js`); re-run when practitioner data is refreshed.
7. **Use in Phase 2:** Clinical intent prompt loads these (or per-specialty slices) and instructs the model to prefer expansion_terms and anchor_phrases from these lists; likely_subspecialties from the subspecialty list only.

**Deliverable:** Pre-fixed list files + script. No change to ranking until Phase 2/3 consume them.

---

## Phase 2: Clinical intent v2 (focus and data alignment)

**Goal:** Make clinical intent the main source of “what to match on” and align its outputs with your data (subspecialties, procedures).

**Steps:**

1. **Inject pre-fixed lists (subspecialties, procedures, conditions) into clinical prompt:** When building the system message for `classifyClinicalIntent`, load subspecialties (and optionally procedures/conditions) from Phase 1 files and add: “Subspecialties MUST be chosen from: [list for relevant specialty].” So `likely_subspecialties` and expansion_terms use your exact labels (e.g. “Electrophysiology”, “Interventional Cardiology”).
2. **Pass specialty when known:** Change the caller to pass `specialty` (e.g. from benchmark `expectedSpecialty` or production routing) into `classifyClinicalIntent(userQuery, conversationText, specialty)`. Extend the prompt: “The user is already in **{specialty}**. Classify intent within this specialty and return terms that match practitioners’ subspecialties and procedure_groups.”
3. **Clinical intent returns anchor_phrases:** Add `anchor_phrases` to the clinical intent JSON schema and prompt: “Return 1–3 anchor_phrases: the main procedures, conditions, or subspecialty names that a relevant practitioner would have in their profile (e.g. ‘atrial fibrillation’, ‘catheter ablation’, ‘Electrophysiology’).” Validate that the response includes `anchor_phrases` (default `[]` if missing).
4. **Stronger examples in clinical prompt:** Add 2–3 few-shot examples (e.g. Cardiology AF → electrophysiology, ablation, AF; General surgery → laparoscopic, key-hole; Gynaecology → hysteroscopy, reproductive medicine) showing expansion_terms and anchor_phrases that use your subspecialty/procedure wording.
5. **Increase max_tokens:** Set `max_tokens` to 300–350 for the clinical intent call so 8–14 expansion_terms + anchor_phrases + likely_subspecialties + negatives are not truncated.

**Deliverable:** Updated `classifyClinicalIntent` (and its prompt/schema) plus optional loader for subspecialties/procedures/conditions lists. Session context still uses existing merge; Phase 3 will consume the new fields.

---

## Phase 3: Session context v2 (high + medium priority)

**Goal:** Implement high- and medium-priority session-context improvements and a single entry point (e.g. v2) so you can A/B test against the current baseline.

**High priority:**

1. **Anchors from both general and clinical:**  
   - Merge `generalIntentResult.anchor_phrases` and `clinicalIntentResult.anchor_phrases` (from Phase 2).  
   - Dedupe (e.g. by lowercase).  
   - Cap at 4–5 (configurable).  
   - Use this merged list everywhere: `intentData.anchor_phrases`, returned `anchor_phrases`, and in BM25/rescoring (already use `filters.anchor_phrases`).

2. **Use safe_lane_terms:**  
   - After computing `intent_terms`, call `safe_lane_terms = extractSafeLaneTerms(intent_terms, 4)`.  
   - Return this in the session context object instead of `[]`.  
   - BM25 already uses `filters.safe_lane_terms` (max 4); no change needed in `local-bm25-service.js`.

**Medium priority:**

3. **Subspecialty names in intent_terms:**  
   - After merging clinical + general expansion_terms into `intent_terms`, append the **names** from `likely_subspecialties` (e.g. top 2–3 by confidence).  
   - Normalize (e.g. lowercase) and skip if already present in intent_terms.  
   - This lets subspecialty names influence BM25 (if you enable intent_terms in BM25) and rescoring consistently.

4. **Anchor cap:**  
   - Raise the cap on merged anchor_phrases from 3 to 4 or 5 (and document in the plan).

5. **Optional normalization of intent_terms:**  
   - After building intent_terms: lowercase, trim.  
   - Optionally drop a term if it is a substring of another (e.g. keep “catheter ablation”, drop “ablation” when both exist) to reduce redundancy.

**Deliverable:** New function (e.g. `getSessionContextParallelV2`) that: (a) calls the same three LLM calls (with clinical v2 from Phase 2 if already integrated), (b) merges anchors from general + clinical, (c) sets safe_lane_terms via `extractSafeLaneTerms`, (d) appends likely_subspecialties names to intent_terms, (e) applies anchor cap and optional normalization. Return the same shape as current session context so downstream (BM25, rescoring) only need to be pointed at v2.

---

## Phase 4: Wire v2 and evaluate

**Goal:** Use v2 in the ranking path and compare to current baseline.

**Steps:**

1. **Benchmark / evaluator:** Add a way to choose session context variant (e.g. env `SESSION_CONTEXT_VARIANT=v2` or a flag `--session-context-v2`). When set, call `getSessionContextParallelV2` instead of `getSessionContextParallel` when building filters. BM25 and rescoring stay unchanged (they already consume `filters.safe_lane_terms`, `filters.anchor_phrases`, `filters.intent_terms`, etc.).
2. **Cache:** Optionally build a separate cache for v2 (e.g. `benchmark-session-context-cache-v2.json`) by running your cache builder with v2, then run baseline with `--use-cache` and that cache.
3. **Metrics:** Run baseline (or evaluate-ranking-subset) with v2 and compare NDCG@12, Recall@12, MRR to current baseline. Optionally re-run comparison report (reasoning vs session context) to see if missing terms decrease.

**Deliverable:** Documented way to run and compare v1 vs v2; baseline or comparison results for v2.

---

## Summary: what safe lane is for (again)

- **Safe lane** = a small set of **symptom/condition-oriented** terms (max 4) added to the BM25 query.
- They are chosen by **filtering** full intent_terms: keep terms that match “safe” patterns (e.g. chest pain, palpitation, arrhythmia), **exclude** procedure-heavy terms (e.g. angiography, stent, catheter).
- **Purpose:** Slightly expand the BM25 query to improve retrieval without the risk of over-narrowing or ambiguity that procedure terms can cause; procedure-heavy matching is left to rescoring.
- **Current state:** In the parallel variant, safe_lane_terms are never set (always `[]`). V2 should call `extractSafeLaneTerms(intent_terms, 4)` and pass the result through so BM25 actually uses them.

---

## File / code references

| Item | Location |
|------|----------|
| Safe lane extraction | `parallel-ranking-package/algorithm/session-context-variants.js` – `extractSafeLaneTerms` (lines 424–464) |
| BM25 use of safe_lane_terms | `parallel-ranking-package/testing/services/local-bm25-service.js` – `getBM25Shortlist` (e.g. lines 701–709) |
| Clinical intent | `session-context-variants.js` – `classifyClinicalIntent`, `SYSTEM_MESSAGE_CLINICAL_INTENT` |
| General intent (anchors) | `session-context-variants.js` – `classifyGeneralIntentParallel`, `SYSTEM_MESSAGE_GENERAL_INTENT` |
| Practitioner subspecialties | e.g. `cardiology.json` – `practitioners[].subspecialties` |

---

## Order of implementation

1. Phase 1 – Build subspecialty list and script.  
2. Phase 2 – Clinical intent v2 (prompt + schema + specialty-in + subspecialty list).  
3. Phase 3 – Session context v2 (merge anchors, safe_lane, subspecialties in intent_terms, cap, optional normalization).  
4. Phase 4 – Wire v2 and run baseline + comparison.

This plan is ready to implement step by step; each phase has a clear deliverable and dependency on the previous one.

---

## Execution summary (implemented)

- **Phase 1:** `build-lexicons-from-data.js` created and run; outputs `subspecialties-from-data.json`, `procedures-from-data.json`, `conditions-from-data.json`.
- **Phase 2:** Clinical intent v2 in `session-context-variants.js`: `loadLexicons(baseDir)`, `buildClinicalIntentSystemMessageV2(specialty, lexicons)`, `classifyClinicalIntentWithOptions(userQuery, conversationText, specialty, options)` with `options.lexiconsDir`; anchor_phrases added to static clinical prompt and validated; max_tokens 320 when using lexicons.
- **Phase 3:** `getSessionContextParallelV2(userQuery, messages, location, options)` with `options.lexiconsDir` and `options.specialty`: merged anchors (general + clinical, cap 5), `safe_lane_terms = extractSafeLaneTerms(intent_terms, 4)`, subspecialty names appended to intent_terms, intent_terms normalized (lowercase, trim).
- **Phase 4:** `run-baseline-evaluation.js` supports `--session-context-v2` (and env `SESSION_CONTEXT_VARIANT=v2`); uses `benchmark-session-context-cache-v2.json` when `--use-cache`. `build-session-context-cache.js --v2` builds the v2 cache.

**How to run v2 baseline:**  
`node run-baseline-evaluation.js --session-context-v2` (live LLM) or build cache first with `node build-session-context-cache.js --v2`, then `node run-baseline-evaluation.js --session-context-v2 --use-cache`.

**Bug fix (why v2 scores were similar/worse):** The BM25 service treated only `variantName === 'parallel'` as the parallel variant. For v2 we pass `variantName: 'parallel-v2'`, so **rescoring score was never used as primary** for ambiguous queries—ranking stayed BM25-dominated instead of using the intent/anchor/subspecialty rescoring. Fixed by treating `'parallel-v2'` the same as `'parallel'` in `local-bm25-service.js` (use rescoring score as primary when query is ambiguous).

---

## Prompt sufficiency for stronger models (e.g. gpt-4o)

**Verdict: Mostly sufficient; a few changes would better unlock a stronger model.**

**What already helps:**
- **Structured JSON + clear rules** – GOAL, SPECIFICITY, expansion_terms counts, negative_terms conditions. A stronger model can apply these more consistently.
- **Clinical v2 data alignment** – Lexicons (subspecialties, procedures, conditions) and “prefer from list” give a target vocabulary; a better model can select and match it more reliably.
- **Inline examples** – Anchor phrases, intent lanes, and one JSON example per prompt give concrete patterns.
- **Clear task** – “Terms that match how doctors are described in profiles” / “procedure_groups, clinical_expertise” defines success.

**Gaps that could cap gains:**
1. **No few-shot query→output pairs** – The plan mentioned “2–3 few-shot examples” for clinical; we have “prefer from lists” but no full examples (e.g. “Query: I need ablation for AF” → expansion_terms, anchor_phrases, likely_subspecialties). Stronger models benefit from 1–2 such examples.
2. **General intent has no lexicon** – Only clinical v2 gets procedure/condition lists. General intent expansion_terms are still free-form; a stronger model can improve, but without the same vocabulary anchor.
3. **Token limits** – General intent: max_tokens 200 (tight for 8–14 terms + anchors + subspecialties). Clinical v2: 320. If you switch to a stronger (often more verbose) model, consider 250–300 for general intent.
4. **“Prefer” is soft** – Clinical v2 says “prefer phrases from practitioner vocabulary” and dumps 100 procedures + 80 conditions. Making it slightly stricter (e.g. “Choose expansion_terms and anchor_phrases from or very close to the lists above when possible”) can help a stronger model use the lists more consistently.
5. **No explicit ranking objective** – We don’t say “expansion_terms should maximize match to relevant practitioners and minimize match to irrelevant ones.” Stating this could help a stronger model optimise for retrieval.

**Recommended before trying gpt-4o (or similar):**  
Add 1–2 few-shot examples to the clinical v2 prompt (query + full JSON output using lexicon terms), and raise general intent max_tokens to 250–300. Optional: one sentence on “optimise for matching the right practitioners” in the expansion_terms rule.

---

## V2 ranking logic (complements v2 session context)

When `variantName === 'parallel-v2'`, the BM25 service applies **v2 ranking logic** so the improved session context (merged anchors, safe_lane_terms, subspecialties in intent_terms) is used more effectively:

1. **Stronger anchor boost** – Merged anchors (general + clinical) use `anchor_per_match_v2: 0.25`, `anchor_cap_v2: 0.75` (vs v1 `0.2` / `0.6`).
2. **Safe-lane rescoring** – Docs that match 1, 2, or 3+ `safe_lane_terms` get an additive boost (`safe_lane_1: 1.0`, `safe_lane_2: 2.0`, `safe_lane_3_or_more: 3.0`). Only when variant is parallel-v2 and `safe_lane_terms` is non-empty.
3. **Config** – All v2 rescoring weights are in `DEFAULT_RANKING_CONFIG` in `local-bm25-service.js` and can be overridden via `filters.rankingConfig` or `ranking-weights.json`.

Result: v2 runs (same cache) now use different rescoring than v1 – stronger anchor weight and explicit safe_lane boost.
