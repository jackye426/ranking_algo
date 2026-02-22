# Frontend Features – Local Doctor Ranking UI

This document lists the features implemented in the web UI (`public/index.html`) for the Local Doctor Ranking server.

---

## 1. Modes

| Feature | Description |
|--------|-------------|
| **Rank by query** | Default mode. Enter a patient-style query (e.g. “I need SVT ablation”) and get ranked practitioner results. |
| **Search doctor by name** | Look up a specific doctor by name (partial match). Uses a separate form and endpoint; shows name, email, profile link, and locations. |

---

## 2. Session & WhatsApp

| Feature | Description |
|--------|-------------|
| **Session phone number** | Optional text field (e.g. `+44 7951 344688`) used to link this run to WhatsApp recommendations. When provided (and test mode is off), it is sent as `sessionPhoneNumber` so results can be matched to WhatsApp sessions. |
| **Test mode** | Checkbox (default: checked). When enabled, no phone number is required and results are not recorded for recommendation tracking. When unchecked, the session phone number is required (marked with *). |

---

## 3. Algorithm & Options

| Feature | Description |
|--------|-------------|
| **Algorithm (variant)** | Dropdown: **V5** (Ideal Profile – GPT-5.1), **V2** (Parallel – GPT-4o-mini), **V6** (Progressive Ranking – GPT-5.1), **V7** (Checklist + Progressive – GPT-5.1), **Production BM25** (New Features). |
| **Production BM25 options** | Shown only when “Production BM25” is selected: **Equivalence Normalization**, **Separate Query from Filters**, **Two-Stage Retrieval** (checkboxes). |

---

## 4. Filters (Rank-by-query mode)

| Filter | Type | Description |
|--------|------|-------------|
| **Specialty** | Text | Optional manual specialty (e.g. Cardiology, Physiotherapy, Dietitian). |
| **City** | Text | Optional city for location filter. |
| **Postcode** | Text | Optional postcode (e.g. SW5 or SW5 0TU). |
| **Radius (miles)** | Number | Optional radius from postcode/city (1–100). |
| **Age group** | Select | Any / Adult / Paediatric / Child. |
| **Gender** | Select | Any / Male / Female. |
| **Language** | Text | Optional language (e.g. English). |
| **Insurance** | Select | Any or specific insurer (Bupa, AXA PPP, Vitality, Aviva, WPA, Saga, Exeter Family Friendly, Freedom Health, Healix, Cigna, Simplyhealth, Allianz, BHSF, Benenden, Aetna). |
| **Show NHS options only** | Checkbox | Restricts results to NHS-affiliated practitioners. |
| **Clear All Filters** | Button | Resets specialty, city, postcode, radius, age, gender, language, insurance, and NHS checkbox. |

---

## 5. Other rank-mode controls

| Feature | Description |
|--------|-------------|
| **Evaluate fit quality with AI** | Checkbox. When enabled, the server evaluates top results as excellent/good/ill-fit and returns reasoning (where supported). |
| **Example queries** | Clickable chips: e.g. SVT ablation, Chest pain, Cardiologist, Hernia repair – they fill the query input. |

---

## 6. Result card (rank-by-query)

Each practitioner card shows:

| Section | Description |
|--------|-------------|
| **Rank & name** | Position, name, title, specialty; optional fit badge (e.g. excellent/good) for V6/V7. |
| **Profile link** | Link to practitioner profile URL when available. |
| **Subspecialties** | Tags (up to 12 shown). |
| **Procedures** | Tags (up to 10 shown). |
| **Conditions** | Tags (up to 10 shown). |
| **Pricing** | Display text or “Contact for pricing”. |
| **Remote consultations** | **Yes** (green) or **No** (grey) – whether the profile declares video/telephone or online consultations (`phin_remote_consultation`). |
| **AI reasoning** | Fit reason or evaluation reason when returned (e.g. V6). |
| **Patient feedback** | Reddit recommendation level and notes when present. |
| **Location** | Formatted list of locations. |
| **About** | Expandable details. |
| **Score breakdown** | Shown for Production BM25 (BM25 score, quality boost, proximity boost, exact match). |
| **Rescoring** | Intent/anchor/negative/pathway matches when available. |
| **Iteration info** | For V6/V7, which progressive iteration found this practitioner. |

---

## 7. API payload (rank-by-query)

The frontend sends a POST to `/api/rank` (or production endpoint) with body including:

- `query`, `messages`, `location`
- `shortlistSize`, `variant` (e.g. v5, v6, production)
- `specialty`, `locationFilter` (city, postcode, radius)
- `patient_age_group`, `languages`, `gender`
- `insurancePreference`, `nhsMode`
- `sessionPhoneNumber` (when not in test mode)
- `evaluateFit`, `testMode`
- Production options when variant is production: `useEquivalenceNormalization`, `separateQueryFromFilters`, `useTwoStageRetrieval`

---

## 8. Data displayed from API

Result objects include (among others):

- `name`, `title`, `specialty`, `subspecialties`, `procedures`, `conditions`
- `profile_url`, `locations`, `pricing`, `about`
- `phin_remote_consultation` (true/false) – drives the “Remote consultations” row
- `phin_patient_feedback`, `phin_patient_satisfaction`
- `reddit_patient_notes`, `reddit_recommendation_level`
- `fit_category`, `fit_reason` / `evaluation_reason`, `iteration_found`
- `score`, `bm25Score`, `rescoringInfo`, etc.

---

## 9. File reference

- **UI:** `public/index.html` (single-page app: HTML, CSS, and JavaScript inline).
- **Server:** `server.js` (loads data, exposes `/api/rank`, `/api/rank-production`, `/api/status`, `/api/stats`, search-by-name, etc.).

For backend filtering (blacklist, insurance, NHS, remote-consultation derivation), see `apply-ranking.js` and `bm25Service.js`.
