# Profile fields: what we weight vs what doctors have

Cross-examination of **BM25/searchable fields we use** vs **fields present in practitioner profiles**, to identify what we haven’t taken into account as weights (or use but isn’t there).

---

## What we use (createWeightedSearchableText / FIELD_WEIGHTS)

These are the only profile fields that go into BM25 and rescoring searchable text:

| Field we use | In BM25/rescoring? | Notes |
|--------------|--------------------|--------|
| **clinical_expertise** | Yes | One long string: "Procedure: X; Condition: Y; Clinical Interests: Z". Single weight for whole blob. |
| **procedure_groups** | Yes | `procedure_group_name` from each item. |
| **specialty** | Yes | e.g. "Cardiology". |
| **subspecialties** | Yes | Array joined to string. |
| **specialty_description** | Yes | **But see below: not present in current profile data.** |
| **description** | Yes | Long bio/description. |
| **about** | Yes | Often duplicate of description. |
| **name** | Yes | Practitioner name. |
| **address_locality** | Yes | e.g. hospital or area. |
| **memberships** | Yes | Array joined (e.g. "Heart Research UK (HRUK), Royal College of Physicians"). |
| **title** | Yes | e.g. "Dr, Consultant Cardiologist". |

So we **do not** have separate weights for “conditions” vs “procedures” vs “clinical interests” — they are all inside **clinical_expertise** with one weight.

---

## What doctors have in their profile (from specialty JSONs)

From the practitioner schema (cardiology, general-surgery, obs-gynae, ophthalmology, trauma-ortho), every practitioner has at least:

| Profile field | Used in searchable text? | Notes |
|---------------|---------------------------|--------|
| practitioner_id, id | No | IDs, not for ranking. |
| name | Yes | |
| title | Yes | |
| specialty | Yes | |
| subspecialties | Yes | |
| description | Yes | |
| about | Yes | |
| clinical_expertise | Yes | |
| address_locality | Yes | |
| **postal_code** | **No** | Not in createWeightedSearchableText. |
| **address_country** | **No** | Not in createWeightedSearchableText. |
| verified | No | Used in quality boost only, not in BM25 text. |
| gmc_number | No | Not in searchable text. |
| year_qualified | No | Not in searchable text (could match “qualified 1990”). |
| years_experience | No | Quality boost only. |
| **gender** | **No** | Not in searchable text (queries sometimes ask “female cardiologist”). |
| **languages** | **No** | Not in searchable text (e.g. “Cantonese speaking”). |
| **qualifications** | **No** | Not in searchable text (e.g. “FRCP”, “MD”). |
| **professional_memberships** | No | We use **memberships**; in sample data they are identical. If they differ elsewhere, we only search memberships. |
| memberships | Yes | |
| **patient_age_group** | **No** | Not in searchable text (e.g. ["Adults"] vs ["Children"]) — critical for paediatric vs adult. |
| **nhs_base** | **No** | Not in searchable text (e.g. "University College London Hospitals NHS Foundation Trust"). |
| rating_value, review_count | No | Quality boost only. |
| procedure_groups | Yes | |
| total_admission_count, procedure_count | No | Numeric only. |
| insuranceProviders | No | Not in searchable text (could match “Bupa” etc.). |
| **specialty_description** | In our code | **Field is in FIELD_WEIGHTS and createWeightedSearchableText, but does not exist in the current practitioner JSONs (cardiology etc.). So we weight a field that is not present in the data.** |

---

## What we haven’t taken into account (candidates for new weights)

These are **profile fields that exist** but we **do not** put into BM25/searchable text at all (so no weight, and no chance to match query terms in them):

1. **patient_age_group**  
   - e.g. `["Adults"]` or `["Children"]`.  
   - **Impact:** Queries like “paediatric cardiologist” or “doctor for my child” cannot match on this; we only match via wording in description/clinical_expertise. Adding it (e.g. as a dedicated weighted field) would let “paediatric” / “adults” match explicitly.

2. **languages**  
   - e.g. `["English", "Cantonese"]`.  
   - **Impact:** “Cantonese speaking cardiologist” cannot match on this field. Adding it would support language-based queries.

3. **qualifications**  
   - e.g. `["BSc", "MD", "FRCP"]`.  
   - **Impact:** “FRCP cardiologist” or “consultant with MD” cannot match on a dedicated qualifications field. Right now only matches if that text appears in description/about/clinical_expertise.

4. **nhs_base**  
   - e.g. "University College London Hospitals NHS Foundation Trust".  
   - **Impact:** “UCLH cardiologist” or “doctor at X hospital” cannot match on this. We only have address_locality (often a different string).

5. **gender**  
   - e.g. "Male" / "Female".  
   - **Impact:** “female cardiologist” cannot match on a dedicated field; only if mentioned in free text.

6. **postal_code**  
   - We use address_locality but not postal_code.  
   - **Impact:** “cardiologist in NW8” would only match if that appears in address_locality.

7. **address_country**  
   - Not in searchable text.  
   - **Impact:** “UK cardiologist” / “consultant in United Kingdom” cannot match on this.

8. **insuranceProviders**  
   - Not in searchable text.  
   - **Impact:** “Bupa”, “AXA PPP” etc. cannot match.

9. **professional_memberships**  
   - We use **memberships** only. If some records populate professional_memberships but not memberships (or differently), that content is never searched.

---

## What we use but isn’t in the profile (dead weight)

- **specialty_description**  
  - We have a **field weight** and we concatenate it in **createWeightedSearchableText**, but **no practitioner in the sampled specialty JSONs has this key**. So we are effectively weighting an empty field.  
  - **Action:** Either remove it from searchable text / weights until the data has it, or confirm a different source (e.g. merged) that does have it and ensure that source is what we rank on.

---

## Summary

| Category | What |
|----------|------|
| **Not taken into account (profile has it, we don’t weight/search it)** | patient_age_group, languages, qualifications, nhs_base, gender, postal_code, address_country, insuranceProviders; and professional_memberships if it ever differs from memberships. |
| **Used in code but not in current profile data** | specialty_description. |
| **Single blob, could be split for separate weights** | clinical_expertise (contains Procedure / Condition / Clinical Interests in one string; we use one weight for all). |

**Recommendation:** Add **patient_age_group** and **languages** (and optionally **qualifications**, **nhs_base**, **gender**) to createWeightedSearchableText with their own weights so queries can match them. Stop weighting **specialty_description** in the current data pipeline unless/until the data actually contains it. Optionally split **clinical_expertise** into procedure / condition / clinical-interests segments and weight them separately for finer control.
