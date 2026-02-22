# Schema: integrated_practitioners_with_isrctn_latest.json

This document describes the schema of the new integrated file and how it maps to the ranking pipeline.

---

## Transform opportunities: fields we could use in `transformMergedRecord`

All of these exist on integrated records but are **not** currently mapped onto the practitioner object. The table lists each field and the **recommended transform action** (what to add in `apply-ranking.js`). **Insurance** was previously missed; it is #1 below so insurance filtering can work.

**Priority:** (1) Unlocks existing behaviour → (2) Improves search/ranking → (3) Display/API.

| # | Field | Type | Transform action (what to add) |
|---|-------|------|--------------------------------|
| 1 | **`insurance`** | object | **Map to `insuranceProviders`.** Read `record.insurance.insurance_details` (or `accepted_insurers`); build `insuranceProviders: [{ name: insurer, displayName: insurer }]` so BM25 `filterByInsurance` works. Empty `insurance` → `[]`. |
| 2 | `areas_of_interest` | string[] | Merge into searchable text: append to `clinical_expertise` (e.g. `clinical_expertise + ' ' + (record.areas_of_interest || []).join(' ')`) or add a dedicated field that BM25 includes. |
| 3 | `research_interests` | string \| null | Add to practitioner: `research_interests: record.research_interests || null`. Optionally concatenate into `clinical_expertise` or a BM25-weighted field for research intent. |
| 4 | `reddit_patient_notes` | string | Surface on practitioner: `reddit_patient_notes: record.reddit_patient_notes || ''`. Optionally append to `description`/`about` for BM25 so patient language is searchable. |
| 5 | `reddit_recommendation_level` | string | Surface: `reddit_recommendation_level: record.reddit_recommendation_level || null`. Enables display and optional boost without reading `_originalRecord`. |
| 6 | `isrctn_trials` | array | Surface: `isrctn_trials: record.isrctn_trials || []`. Enables research/trials filter or boost. |
| 7 | `isrctn_relational_trial_links` | array | Surface: `isrctn_relational_trial_links: record.isrctn_relational_trial_links || []`. Use for role/site in trials. |
| 8 | `procedures_completed` | array | Surface: `procedures_completed: record.procedures_completed || []`. Optionally derive `total_admission_count` or procedure volume from `count_numeric` for ranking. |
| 9 | `contact_phone` | string | Surface: `contact_phone: record.contact_phone || null`. |
| 10 | `email` | string | Surface: `email: record.email || null`. |
| 11 | `website` | string | Surface: `website: record.website || null` (distinct from `profile_url`). |
| 12 | `first_name` | string | Surface: `first_name: record.first_name || null`. |
| 13 | `last_name` | string | Surface: `last_name: record.last_name || null`. |
| 14 | `consultation_types` | string[] | Surface: `consultation_types: record.consultation_types || []`. |
| 15 | `reddit_recommendation_sources` | array | Surface: `reddit_recommendation_sources: record.reddit_recommendation_sources || []`. |
| 16 | `reddit_trust_affiliations` | array | Surface: `reddit_trust_affiliations: record.reddit_trust_affiliations || []`. Optional trust/affiliation boost. |
| 17 | `reddit_expertise_type` | string | Surface: `reddit_expertise_type: record.reddit_expertise_type || null`. Optional intent-based boost. |
| 18 | `awards` | array | Surface: `awards: record.awards || []`. |
| 19 | `publications` | array | Surface: `publications: record.publications || []`. |
| 20 | `fee_assured` | boolean | Surface: `fee_assured: record.fee_assured ?? false`. |
| 21 | `verified_account` | boolean | Surface: `verified_account: record.verified_account ?? false`. |
| 22 | `specialty_source` | string | Surface: `specialty_source: record.specialty_source || null`. |
| 23 | `sources` | string[] | Surface: `sources: record.sources || []`. Provenance / filter. |
| 24 | `reddit_patient_notes_raw` | string | Surface if needed for display/fallback: `reddit_patient_notes_raw: record.reddit_patient_notes_raw || ''`. |
| 25 | `reddit_name_field` | string | Surface: `reddit_name_field: record.reddit_name_field || null`. |
| 26 | `reddit_urls` | array | Surface: `reddit_urls: record.reddit_urls || []`. |
| 27 | `reddit_match_confidence` | number | Surface for debug/quality: `reddit_match_confidence: record.reddit_match_confidence ?? null`. |
| 28 | `reddit_match_method` | string | Surface for debug: `reddit_match_method: record.reddit_match_method || null`. |
| 29 | `merge_date` | string | Surface for debug/freshness: `merge_date: record.merge_date || null`. |
| 30 | `requires_review` | boolean | Surface: `requires_review: record.requires_review ?? false`. Filter or flag. |

**Summary:** 30 fields. **#1 (insurance)** is required for insurance filtering to work. **#2–#8** improve search or ranking. **#9–#30** are mainly surface-for-display/API or optional signals.

---

## 1. File-level structure

The file is a single JSON object (not an array):

| Field | Type | Description |
|-------|------|-------------|
| `total_records` | number | Total count of practitioners (e.g. 43004) |
| `merged_at` | string (ISO date) | When the merge was produced |
| `statistics` | object | Merge stats (see below) |
| `records` | array | **Array of practitioner records** — this is what we load and transform |

### Statistics (sample)

- `existing_merged_records`, `reddit_entries`, `reddit_doctors_matched`, `bupa_records`, `bupa_urls_added`
- `practitioners_with_trust_affiliations`, `practitioners_with_reddit_data`
- **`isrctn_practitioners_with_trials`** — count of practitioners with ISRCTN trial data (e.g. 1241)

---

## 2. Record schema (one practitioner in `records[]`)

### Core identity & specialty (unchanged from previous merged format)

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `id` | string | Yes (as `practitioner_id` / `id`) |
| `gmc_number` | string \| null | Yes (verified, filters) |
| `name`, `title`, `first_name`, `last_name` | string | Yes (name, title in BM25 text) |
| `specialty` | string | Yes (primary specialty) |
| `specialty_source` | string | No |
| `specialties` | string[] | Yes → mapped to `subspecialties` (excluding primary) |

### Clinical & profile text

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `about` | string \| null | Yes → `description` / `about` in BM25 |
| `clinical_interests` | string | Yes → `clinical_expertise` |
| `areas_of_interest` | string[] | Could be merged into searchable text |
| `research_interests` | string \| null | **New / underused** — could boost research-related queries |

### Procedures & qualifications

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `procedures` | string[] | Yes → `procedure_groups[]` with `procedure_group_name` |
| `procedures_completed` | object[] | No (could be used for volume/experience signals) |
| `qualifications` | string[] | Yes (in BM25 via memberships/qualifications if wired) |
| `professional_memberships` | string[] | Yes → `memberships` |

### Location & contact

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `locations` | object[] | Yes → primary location for `address_locality`, `postal_code` |
| `contact_phone`, `email`, `website` | string | Display / contact |
| `profile_urls`, `urls` | object / array | Yes → `profile_url` |

### Demographics & filters

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `languages` | string[] | Yes (filter + optional BM25) |
| `gender` | string | Yes (filter) |
| `patient_age_group` | array | Yes (filter) |
| `nhs_base` | string \| null | Display / filter |

### Reddit-related (new in this file)

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `reddit_recommendation_level` | string | Yes — server already returns it from `_originalRecord` |
| `reddit_recommendation_sources` | array | Could be used for ranking/display |
| `reddit_patient_notes` | string | Yes — server returns it; could be added to BM25 searchable text |
| `reddit_patient_notes_raw` | string | Raw form of notes |
| `reddit_name_field`, `reddit_urls` | string / array | Display / matching |
| `reddit_expertise_type` | string | e.g. "surgical_specialist" — could boost for intent |
| `reddit_match_confidence`, `reddit_match_method` | number / string | Matching metadata |
| `reddit_source_entry` | object | Source recommendation payload |
| `reddit_trust_affiliations` | array | **New** — could be used for trust/affiliation boost |

### ISRCTN (new in this file)

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `isrctn_trials` | array | **New** — trials linked to this practitioner; strong signal for “research / trials” intent |
| `isrctn_relational_trial_links` | array | **New** — relational links to trials (e.g. principal investigator, site) |

### Insurance affiliation

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `insurance` | object | **No** — transform sets `insuranceProviders: []`. File has `insurance.accepted_insurers`, `insurance.insurance_details` (e.g. `{ insurer: "Bupa", insurer_id: 32 }`), `insurance.insurer_count`. Map to `insuranceProviders` for BM25 insurance filter. |

### Other

| Field | Type | Used in ranking? |
|-------|------|------------------|
| `sources` | string[] | e.g. ["BUPA", "PHIN"] — provenance |
| `merge_date`, `requires_review` | string / boolean | Pipeline metadata |
| `fee_assured`, `verified_account` | boolean | Display / future ranking |
| `consultation_types` | string[] | Display |
| `awards`, `publications` | array | **Could be used** for research/credibility boost |

---

## 3. What the ranking pipeline expects (after transform)

`apply-ranking.js` → `transformMergedRecord()` maps each **merged record** to a **practitioner** object used by:

- **BM25 (local-bm25-service.js)**: builds searchable text from:
  - `specialty`, `subspecialties`, `description`, `about`, `name`, `title`, `address_locality`, `memberships`, `procedure_groups` (via `procedure_group_name`)
- **Filters**: `patient_age_group`, `languages`, `gender`, `manualSpecialty`, location
- **Rescoring**: subspecialty match, anchor phrases, safe-lane terms; uses `procedure_groups`, `subspecialties`, `clinical_expertise` (parsed for procedures/conditions)

Current transform already:

- Reads `records` from the merged file (so works with `data.records` from the new file).
- Maps `specialties` → `subspecialties`, `procedures` → `procedure_groups`, `about` / `clinical_interests` → `description` / `about` / `clinical_expertise`.
- Keeps **`_originalRecord: record`** so the server can expose `reddit_patient_notes`, `reddit_recommendation_level`, etc.

---

## 4. Gaps and recommendations

1. **Switch data source**  
   Point the server (and any scripts that load “merged” data) at `integrated_practitioners_with_isrctn_latest.json` and keep using the same top-level shape: `data.records` (and optionally `data.statistics` for logging).

2. **Schema compatibility**  
   The new file’s records are a superset of what `transformMergedRecord` expects (same `id`, `specialty`, `specialties`, `about`, `clinical_interests`, `procedures`, `locations`, etc.). No change to the transform is strictly required to *load* the new file; only the **file path** needs to change.

3. **New fields to consider for ranking**
   - **ISRCTN**: Expose `isrctn_trials` (and optionally `isrctn_relational_trial_links`) on the practitioner object (e.g. copy from `_originalRecord` or in transform). Use in ranking when the session context or query indicates “research” / “clinical trials” intent (e.g. boost or filter).
   - **Reddit**: Optionally add `reddit_patient_notes` (and/or `reddit_recommendation_level`) into the BM25 searchable text so patient language can match; and/or use `reddit_recommendation_level` / `reddit_trust_affiliations` as a small quality/social-proof boost.
   - **Research**: If present, add `research_interests` (and optionally `publications` / `awards`) to the BM25 text or to a separate “research” boost when intent is research-oriented.

4. **Next steps**
   - Update **server.js** (and any load path) to use `integrated_practitioners_with_isrctn_latest.json` instead of `merged_all_sources_latest.json`.
   - Optionally extend **transformMergedRecord** to set e.g. `isrctn_trials`, `reddit_*` on the practitioner object so BM25 and rescoring can use them without reading `_originalRecord`.
   - Add ranking logic (weights or filters) for ISRCTN and Reddit when we have clear product rules.

---

## 5. Quick reference: one record (key fields only)

```json
{
  "id": "bupa_31834",
  "gmc_number": null,
  "name": "Mrs Nikki Croce",
  "title": "Mrs",
  "specialty": "Counselling",
  "specialties": ["Counselling", "Eye Movement Desensitisation and Reprocessing (EMDR)", ...],
  "clinical_interests": "working with child, adolescent and adults...",
  "areas_of_interest": ["...", "..."],
  "about": "My name is Nikki...",
  "locations": [{ "hospital": "...", "postcode": "TQ32QY", ... }],
  "qualifications": ["..."],
  "professional_memberships": ["..."],
  "procedures": [],
  "reddit_recommendation_level": "🟢 Green - Mentioned by patients...",
  "reddit_patient_notes": "",
  "isrctn_trials": [],
  "isrctn_relational_trial_links": []
}
```
