# Why the V4 LLM ranker underperforms vs v2 rescoring

This document analyses why V4 (AI ranking) lags v2 (rule-based rescoring) on the benchmark (Recall@12, MRR, NDCG) and what to change.

---

## 1. Summary

**V2 rescoring** uses **explicit intent from session context** (anchor phrases, likely subspecialties, intent terms, safe-lane terms, negative terms) and scores against the **full** practitioner document. The LLM ranker in V4 only sees the **raw patient query** and **truncated profile cards**, and gets **no** intent hints. So the model has to infer “chest tightness → interventional cardiology / coronary angiography” from the query alone, while v2 is told exactly which phrases and subspecialties to boost. That information asymmetry is the main cause of underperformance.

---

## 2. What v2 rescoring uses (that the LLM does not get)

From `local-bm25-service.js` and the session context cache:

| Signal | Role in v2 | Passed to V4 LLM? |
|--------|------------|-------------------|
| **anchor_phrases** | Additive boost per match (e.g. "chest tightness", "coronary angiography", "interventional cardiology"). Strong signal for “this is what we want”. | **No** |
| **likely_subspecialties** | Confidence-weighted match to `doc.subspecialties` (e.g. Interventional Cardiology 0.8). Direct “prefer these subspecialties”. | **No** |
| **intent_terms** | Tiered: high_signal (chest pain, angina, coronary artery disease…), pathway, procedure. Counts matches in full doc text. | **No** (LLM only sees query words) |
| **safe_lane_terms** | High-confidence symptom/condition terms; extra boost when present in doc. | **No** |
| **negative_terms** | Penalty when doc matches (e.g. “heart failure” when user wants AF specialist). Down-rank wrong lane. | **No** |
| **Full document text** | `createWeightedSearchableText(doc)` – full clinical_expertise, procedure_groups, subspecialties, description, about. | **No** – cards use truncated description (350 chars) |

So v2 has **structured intent** (phrases to prefer, subspecialties to prefer, terms to avoid) and **full text**. The V4 ranker has **query + compact cards** and no intent.

---

## 3. What the V4 LLM actually sees

- **System prompt:** Generic “rank by relevance; use only these IDs; base relevance on specialty, subspecialties, procedures, conditions, clinical_interests, description”.
- **User message:**  
  - “Valid practitioner_ids: […]”  
  - “Patient query: …”  
  - “Candidate profile cards: [JSON array]”.
- **Profile cards:** For each practitioner: `rank_index`, `practitioner_id`, `name`, `specialty`, `subspecialties`, `procedures`, `conditions`, `clinical_interests`, **description (truncated to 350 chars)**, qualifications, memberships.

So:

1. **No anchor_phrases / likely_subspecialties / negative_terms** – The model is not told “prefer docs with these phrases/subspecialties” or “down-rank docs that match these terms”. It must infer clinical intent from the query only.
2. **Truncated description** – 350 characters can cut off the most relevant sentence (e.g. “expert in chest pain and coronary angiography”). v2 rescoring uses the full searchable text.
3. **Generic instruction** – “Rank by relevance” does not say “prefer exact procedure/condition/subspecialty match” or “down-rank if profile emphasizes areas the patient is not asking about”. So the model may spread relevance more diffusely.
4. **sessionContext.intentData is available but unused** – `getRankingV4` receives `sessionContext` (with `intentData`: anchor_phrases, likely_subspecialties, negative_terms, etc.) but `rankWithAI` is only called with `userQuery` and `profileCards`. None of that intent is injected into the prompt.

---

## 4. How ground truth is defined (benchmark reasons)

From `benchmark-ground-truth-reasons.json`, good matches are described in terms of:

- **Subspecialty** (e.g. Electrophysiology)
- **Procedures** (e.g. Cardiac Ablation, ECG Holter Monitor)
- **Clinical expertise** (e.g. AF, palpitations, heart rhythm)

So the “right” ranking is highly aligned with **explicit subspecialty + procedure + condition** match. V2 rescoring is built to reward exactly those (anchor + subspecialty + intent terms). The LLM is doing open-ended “relevance” without being steered toward those same signals.

---

## 5. Root causes (concise)

| Cause | Explanation |
|-------|-------------|
| **No intent in the prompt** | Anchor phrases, likely subspecialties, and negative terms are never passed to the LLM. It has to infer intent from the query only, while v2 uses explicit intent. |
| **Truncated descriptions** | 350 chars can drop the most relevant clinical sentence. v2 uses full text. |
| **Generic prompt** | No instruction to strongly prefer procedure/subspecialty/condition match or to down-rank mismatched focus. |
| **Model** | gpt-4o-mini may be weaker at this kind of structured medical comparison than a larger model. |
| **Task difficulty** | Choosing “top 12 out of 50” with only query + cards and no intent is harder than v2’s weighted scoring with full text and intent. |

---

## 6. Recommended changes (in order of impact)

1. **Inject intent into the ranker prompt**  
   Pass `sessionContext.intentData` (or equivalent) into `rankWithAI` and add to the user (or system) message:
   - **Anchor phrases to prefer:** “Prefer practitioners whose profile contains these phrases: [anchor_phrases].”
   - **Subspecialties to prefer:** “Prefer these subspecialties when they match the practitioner’s subspecialties: [likely_subspecialties].”
   - **Terms to avoid:** “Down-rank practitioners whose profile strongly emphasizes: [negative_terms].”  
   This aligns the LLM’s signal with v2’s.

2. **Increase description length or add a “key phrases” field**  
   Either raise `maxDescriptionChars` (e.g. 500–600) or add a short “key clinical phrases” line per card (e.g. first 100 chars of clinical_expertise + top procedures) so the most discriminative text is always visible.

3. **Tighten the ranking instruction**  
   Add: “Strongly prefer practitioners whose procedures, conditions, or subspecialties directly match the patient’s concern. Down-rank those whose main focus does not align with the query.”

4. **Optional: one few-shot example**  
   Add a minimal example (one query + 2–3 cards + correct order and 1-sentence reason) to reinforce “match procedures/subspecialty/conditions”.

5. **Optional: stronger model**  
   Try gpt-4o (or same with higher temperature for diversity) for the ranker and compare metrics.

6. **Optional: two-step ranking**  
   First call: use intent to score or filter (e.g. “which of these 50 are relevant?”). Second call: rank the shortlist. Reduces the burden of picking 12 from 50 in one shot.

---

## 7. Conclusion

The LLM underperforms mainly because it **does not get the same intent and full-text signals** that v2 rescoring uses. The highest-impact fix is to **pass anchor_phrases, likely_subspecialties, and negative_terms into the ranker prompt** and to **improve profile signal** (less truncation or key phrases). After that, refining the prompt and optionally the model or pipeline should close most of the gap with v2.

---

## 8. Why V4 still underperforms after intent injection (model + task + signal)

Even with intent hints and 1500-char descriptions, V4 stays below v2. Remaining reasons:

### 8a. Task structure: deterministic score vs one-shot ordering

- **v2:** For each of 50 docs, compute a **number** (intent term counts × weights + anchor + subspecialty + negative penalties). Sort by that number. No ambiguity.
- **V4:** The model must **output a full ordering** of 12 IDs in one shot. It has to compare 50 cards in context and emit a ranked list. Small mistakes (e.g. swapping rank 2 and 3, or dropping one relevant doc) directly hurt MRR/NDCG. The task is harder than “score each doc”; it’s “choose and order the best 12.”

So part of the gap is **task difficulty**, not only “model is weak.”

### 8b. Information and calibration

- **v2** uses **full document text** via `createWeightedSearchableText(doc)` (clinical_expertise weighted 3×, procedure_groups 2.8×, etc.) and **all intent_terms** (15–20+ terms) with tiered weights (high_signal, pathway, procedure). It also uses **safe_lane_terms** for extra boost. So v2 has: full text + full intent term list + anchor + subspecialty + negative + safe_lane.
- **V4** gets: **structured cards** (procedures, conditions, subspecialties, truncated description) + **only** anchor_phrases, likely_subspecialties, negative_terms in the prompt. We do **not** pass the full **intent_terms** or **safe_lane_terms**. So the LLM still has less lexical signal than v2 (no “match these 15 terms with these weights”).
- **Calibration:** v2 uses **fixed weights** (e.g. anchor_per_match 0.2, anchor_cap 0.6, subspecialty_factor, negative_4, etc.) that were tuned. The LLM gets “prefer these phrases” but not “this phrase is worth +2.0.” So the model may underweight anchor match vs narrative in the description, or treat all hints equally.

So another part of the gap is **information loss** (no full intent_terms/safe_lane, no full text) and **no explicit weights** for the hints.

### 8c. Model limitation (gpt-4o-mini)

- **Size/cost:** V4 uses **gpt-4o-mini**. It’s smaller and cheaper; it may be less reliable at: (1) following the ranking hints **consistently** across 50 items, (2) **medical terminology** alignment (e.g. “AF” vs “atrial fibrillation,” “PCI” vs “percutaneous coronary intervention”), (3) **position bias** (favoring cards that appear earlier in the list), (4) **comparing 50 options** in one go without dropping or misordering.
- **Test:** Running the same V4 pipeline with **gpt-4o** (or another larger model) for the ranker would show whether a bigger model closes part of the gap. If it does, **model capacity is a real bottleneck**; if not, the main issue is task structure and missing signal.

### 8d. Summary table

| Factor | v2 | V4 (with intent) |
|--------|----|-------------------|
| Task | Score each doc, sort | One-shot: output top 12 order |
| Doc representation | Full weighted text | Cards + truncated description |
| Intent | Full intent_terms + anchor + subspecialty + negative + safe_lane | Anchor + subspecialty + negative only |
| Weights | Explicit (tuned) | Implicit (“prefer”) |
| Model | N/A (rules) | gpt-4o-mini |

**Conclusion:** Underperformance is a mix of **task structure** (harder to output a perfect ordering than to sort by score), **information and calibration** (missing full intent_terms/safe_lane and explicit weights), and **model limitation** (gpt-4o-mini may be underpowered for this comparison task). Trying **gpt-4o** for the ranker is the clean test for model limitation; adding **intent_terms/safe_lane** to the prompt and/or a **score-then-sort** design (LLM scores each card, code sorts) could reduce the remaining gap.
