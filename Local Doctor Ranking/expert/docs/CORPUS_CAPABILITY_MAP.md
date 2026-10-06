# Corpus capability map

Generated 2026-10-06T17:39:04.623Z from a streamed pass over **40,876 raw professional source rows** (153.3 MB). No raw records, names, biographies, contact values or credential material are exported by this report.

**These are source rows, not distinct qualified experts. Raw presence and machine-parseable format are not verification, identity correctness, current practice or suitability.** Coverage is of the restricted professional projection saved in the local cache, not every column in the underlying database.

Raw cache SHA-256: `9a9e3376cb241f534f5538117ed929cae47316e5831cf9d66732b4e04a27a99c`. Scan took 30.6 seconds.

## Population and source coverage

The source-prefix table is a mutually exclusive classification of the row ID prefix. The recorded-source table is multi-label: one row may name multiple sources, so its counts do not sum to the row count.

| Row ID source prefix | Rows | All rows |
| --- | ---: | ---: |
| bupa | 37,195 | 91.0% |
| spire | 912 | 2.2% |
| pogp | 889 | 2.2% |
| hca | 401 | 1.0% |
| circle | 367 | 0.9% |
| nuffield | 362 | 0.9% |
| bda | 349 | 0.9% |
| ramsay | 315 | 0.8% |
| cromwell | 86 | 0.2% |

| Recorded source label | Rows carrying label | All rows |
| --- | ---: | ---: |
| bupa | 37,195 | 91.0% |
| phin | 12,101 | 29.6% |
| spire | 4,868 | 11.9% |
| nuffield | 3,800 | 9.3% |
| hca | 2,727 | 6.7% |
| circle | 2,463 | 6.0% |
| ramsay | 1,905 | 4.7% |
| pogp | 889 | 2.2% |
| cromwell | 545 | 1.3% |
| bda | 349 | 0.9% |

Source coverage below uses the same exclusive ID prefixes. Each percentage is **within that source prefix** and measures the merged row, not proof that the prefixed source supplied that particular field. Clinical text means clinical interests, areas of interest or a procedure-text field; research text means the research-interests field. Both are topic coverage, not performed activity.

| Source prefix | Rows | Biography | Profile URL | Clinical text | Research text | Qualification text | Registration-shaped value |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bupa | 37,195 | 22,042 (59.3%) | 13,831 (37.2%) | 30,205 (81.2%) | 9,102 (24.5%) | 16,162 (43.5%) | 20,946 (56.3%) |
| spire | 912 | 888 (97.4%) | 912 (100.0%) | 899 (98.6%) | 0 (0.0%) | 892 (97.8%) | 486 (53.3%) |
| pogp | 889 | 237 (26.7%) | 889 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| hca | 401 | 374 (93.3%) | 401 (100.0%) | 346 (86.3%) | 0 (0.0%) | 346 (86.3%) | 352 (87.8%) |
| circle | 367 | 325 (88.6%) | 367 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 178 (48.5%) |
| nuffield | 362 | 54 (14.9%) | 362 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 318 (87.8%) |
| bda | 349 | 340 (97.4%) | 345 (98.9%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| ramsay | 315 | 249 (79.0%) | 315 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 188 (59.7%) |
| cromwell | 86 | 70 (81.4%) | 86 (100.0%) | 80 (93.0%) | 0 (0.0%) | 86 (100.0%) | 1 (1.2%) |

## Recorded specialty and profession proxies

Explicit professional-role columns were present in 0 rows, with parseable role text in 0. The current reader does **not** select a dedicated professional_role field. Missing projected role data is not proof that the underlying source lacks it. Titles such as Dr or Professor are not converted into professional roles.

The following mutually exclusive buckets use primary specialty wording only. They are **lexical profession proxies**, not registration-verified roles, and mixed labels stay mixed. A therapist can list a medical specialty as their area of work; a treatment technique such as CBT does not identify a regulated profession. These counts should guide enrichment coverage, not determine eligibility for an assessment. “No primary specialty label” includes absent text and unusually long text excluded by the 140-character label limit.

| Primary-specialty proxy bucket | Rows | All rows |
| --- | ---: | ---: |
| Medical-specialty label | 23,211 | 56.8% |
| Psychology label | 4,288 | 10.5% |
| Counselling / psychotherapy label | 3,662 | 9.0% |
| Other / unclassified specialty label | 3,345 | 8.2% |
| Physiotherapy label | 2,933 | 7.2% |
| Osteopathy / chiropractic label | 1,342 | 3.3% |
| No primary specialty label | 625 | 1.5% |
| Dietetics / nutrition label | 409 | 1.0% |
| Podiatry / chiropody label | 289 | 0.7% |
| Speech / language therapy label | 271 | 0.7% |
| Audiology label | 186 | 0.5% |
| Optometry / orthoptics label | 104 | 0.3% |
| Occupational therapy label | 75 | 0.2% |
| Mixed specialty/profession labels | 74 | 0.2% |
| Prosthetics / orthotics label | 29 | 0.1% |
| Nursing / midwifery label | 17 | 0.0% |
| Dentistry label | 14 | 0.0% |
| Radiography / sonography label | 2 | 0.0% |

Most frequent recorded primary-specialty labels (top 30 of 2,206 distinct labels; case/whitespace normalized, no inferred specialty). A label may combine several areas. Remaining label counts are retained in the ignored aggregate JSON rather than collapsed into a claim of clinical expertise.

| Recorded specialty label | Rows | All rows |
| --- | ---: | ---: |
| psychology | 4,206 | 10.3% |
| anaesthetics | 4,115 | 10.1% |
| counselling | 3,003 | 7.3% |
| physiotherapy | 2,815 | 6.9% |
| cognitive behavioural therapy (cbt) | 1,763 | 4.3% |
| trauma & orthopaedic surgery | 1,590 | 3.9% |
| clinical radiology | 1,389 | 3.4% |
| general surgery | 996 | 2.4% |
| obstetrics and gynaecology | 939 | 2.3% |
| osteopathy | 757 | 1.9% |
| cardiology | 734 | 1.8% |
| ophthalmology | 704 | 1.7% |
| psychotherapy | 650 | 1.6% |
| chiropractic | 585 | 1.4% |
| general psychiatry | 467 | 1.1% |
| consultant orthopaedic surgeon | 461 | 1.1% |
| dermatology | 441 | 1.1% |
| gastroenterology | 413 | 1.0% |
| urology | 406 | 1.0% |
| general (internal) medicine | 405 | 1.0% |
| dietetics | 369 | 0.9% |
| clinical oncology | 358 | 0.9% |
| paediatrics | 354 | 0.9% |
| consultant cardiologist | 326 | 0.8% |
| plastic surgery | 306 | 0.7% |
| podiatry / chiropody | 269 | 0.7% |
| speech therapy | 267 | 0.7% |
| ear | 261 | 0.6% |
| haematology | 209 | 0.5% |
| endocrinology and diabetes mellitus | 205 | 0.5% |

## Field presence and usable format

Present excludes null, blank/placeholder strings and empty containers. False is a present boolean. “Usable format” is a mechanical check only: ≥40 cleaned characters for biography text; an HTTP(S) URL without embedded credentials for URL fields; a seven-digit GMC or prefixed HCPC-shaped identifier; textual labels for list fields; named/addressed locations; parseable merge dates. A publication field passes if it contains a readable text reference or HTTP(S) link, including search links. No claim has been clinically or externally verified by these tests.

| Projected field | Present rows | Usable-format rows | Usable / all rows | Non-empty storage shapes |
| --- | ---: | ---: | ---: | --- |
| id | 40,876 | 40,876 | 100.0% | string: 40,876 |
| name | 40,576 | 40,576 | 99.3% | string: 40,576 |
| title | 38,705 | 38,677 | 94.6% | string: 38,705 |
| first_name | 35,750 | 35,665 | 87.3% | string: 35,750 |
| last_name | 35,753 | 35,750 | 87.5% | string: 35,753 |
| name_alternatives | 3,956 | 3,956 | 9.7% | object: 3,956 |
| gmc_number | 22,433 | 22,399 | 54.8% | string: 22,433 |
| hcpc_number | 132 | 73 | 0.2% | string: 132 |
| specialty | 40,364 | 40,364 | 98.7% | string: 40,364 |
| specialty_source | 40,793 | 40,793 | 99.8% | string: 40,793 |
| specialty_alternatives | 4,867 | 4,867 | 11.9% | object: 4,867 |
| about | 24,127 | 24,033 | 58.8% | string: 24,127 |
| about_source | 3,683 | 3,683 | 9.0% | string: 3,683 |
| about_alternatives | 7,677 | 7,615 | 18.6% | object: 7,677 |
| clinical_interests | 24,838 | 24,838 | 60.8% | string: 24,838 |
| areas_of_interest | 24,758 | 24,758 | 60.6% | array: 24,758 |
| research_interests | 9,120 | 9,102 | 22.3% | string: 9,120 |
| nhs_base | 14,072 | 14,067 | 34.4% | string: 14,072 |
| nhs_posts | 4,161 | 4,161 | 10.2% | array: 4,161 |
| qualifications | 17,486 | 17,485 | 42.8% | array: 17,486 |
| detailed_qualifications | 2,622 | 2,622 | 6.4% | array: 2,622 |
| professional_memberships | 14,624 | 14,618 | 35.8% | array: 14,624 |
| publications | 1,204 | 1,204 | 2.9% | array: 1,204 |
| procedures | 26,478 | 26,478 | 64.8% | array: 26,478 |
| procedures_completed | 24,492 | 24,492 | 59.9% | array: 24,492 |
| procedure_volumes_phin | 10,011 | 10,011 | 24.5% | array: 10,011 |
| profile_urls | 17,512 | 17,508 | 42.8% | object: 17,512 |
| urls | 14,293 | 14,289 | 35.0% | array: 14,293 |
| locations | 38,472 | 37,583 | 91.9% | array: 38,472 |
| languages | 7,807 | 7,807 | 19.1% | array: 7,807 |
| sources | 40,876 | 40,876 | 100.0% | array: 40,876 |
| merge_date | 40,876 | 40,876 | 100.0% | string: 40,876 |
| requires_review | 40,876 | 40,876 | 100.0% | boolean: 40,876 |
| do_not_recommend | 22,372 | 22,372 | 54.7% | boolean: 22,372 |

True policy flags: requires_review = 0; do_not_recommend = 32. A false or absent flag is not evidence that human qualification or identity review occurred. These flags must not be replaced by inferred model decisions.

## What can actually feed discovery

| Coverage indicator | Rows | Interpretation |
| --- | ---: | --- |
| Name plus a parseable profile/reference URL | 17,466 (42.7%) | Identity-review starting point; a URL is not corroboration of every merged fact. |
| Any registration field present / registration-shaped value | 22,543 (55.1%) / 22,469 (55.0%) | Syntax, not live regulator verification or correct body/person attribution. |
| Any usable biography / alternate biography | 24,579 (60.1%) / 7,615 (18.6%) | Alternate text matters to coverage and must retain source association. |
| Alternate biography differing from primary | 7,598 (18.6%) | Additional source text, not automatically additional or current expertise. |
| Primary biography with recorded source label | 3,651 (8.9%) | Source-label presence, not a sentence-level citation or fresh source check. |
| Biography container with a standalone URL value | 9 (0.0%) | Counts whole URL leaves, not hyperlinks embedded inside narrative text. A link is not necessarily a supporting clinical source. |
| Clinical-interest or areas-of-interest text | 24,838 (60.8%) | Topics can find leads; interests are not performed clinical work. |
| Procedure text or a structured procedure label | 27,474 (67.2%) | Recorded procedures can supply modality/use context; coding lists need scope review. |
| Clinical-activity wording somewhere in narrative | 6,857 (16.8%) | Lexical review-queue proxy, not evidence of current practice. |
| Population wording / care-setting wording | 10,576 (25.9%) / 1,155 (2.8%) | Mentions may describe training, study context or unrelated work; require a relation to the clinical anchor. |
| Research-interests field text / broader research wording | 9,102 (22.3%) / 9,841 (24.1%) | Topic mentions, qualifications, awards and performed research are not interchangeable. |
| Qualification text / qualification year mention | 17,486 (42.8%) / 16,005 (39.2%) | Training history, not present competence or a performed research role. |
| Potential professional/industry relationship wording | 2,058 (5.0%) | A lexical review queue only: it includes non-commercial organisations and cannot establish conflict or independence. |
| Regulatory-assessment wording | 2 (0.0%) | Review candidates for explicit activity and device scope; broad clinical experience is not regulatory-assessor qualification. |
| Structured location / postcode / numeric coordinates | 37,583 (91.9%) / 36,405 (89.1%) / 7,077 (17.3%) | Recorded place metadata; not proof of current practice, residence or availability. |

The projection contains no dedicated patient-population, care-setting, structured industry-relationship, availability, engagement-interest or assessor-approval column. The narrative counts above intentionally do not claim such facts have been extracted or verified.

## Publications, volumes and dates

| Indicator | Count | Why the distinction matters |
| --- | ---: | --- |
| Publication field present / containing URL | 1,204 (2.9%) / 1,203 (2.9%) | A link may be a search listing rather than a publication. |
| Publication-search URL rows | 171 (0.4%) | PubMed/Scholar search links do not prove authorship. |
| Publication identifier pattern / year mention rows | 245 (0.6%) / 169 (0.4%) | A DOI/PMID or year still needs authorship and candidate identity linkage. |
| Publication objects: title / authors / identifier / year | 0 / 0 / 0 / 0 | Counts of objects, not validated papers or individual study roles. |
| Procedure-volume objects / named / recorded count | 210,247 / 210,247 / 174,543 | A numeric procedure dimension or a fee is not a performed volume. |
| Volume objects with numeric derivative / period / source URL | 74,968 / 0 / 0 | A count_numeric value may be derived from a range; retain the original range and unit. |
| Rows with labelled recorded count / name+count+period+URL | 12,406 (30.4%) / 0 (0.0%) | Even a complete tuple is not comparable quality, CT-only activity or current availability. |
| Parseable merge date | 40,876 (100.0%) | Database-processing timestamp, not a source date or date of clinical activity. |
| Structured source/publication date / observation/update date | 0 (0.0%) / 0 (0.0%) | Only date-labelled fields count here; an arbitrary biography year does not. |
| A narrative year mention | 19,909 (48.7%) | Often a qualification, historical post, award or publication; not current-practice verification. |

Publication entries contain 0 structured objects. The raw publication references are string values, so absence of structured author/title metadata does not mean that no underlying paper exists. Resolving those references and verifying candidate authorship is a separate enrichment step. Date coverage above checks explicitly named source/publication/observation/update fields in the projected JSON; it does not infer dates from URLs or unlabelled prose.

## Corrected derived-corpus snapshot

The existing audit file was generated 2026-10-06T17:36:06.974Z for the corrected `expert-corpus-v1-fc67aacfcc3999fc230c`. The raw-field scan above and this derived snapshot use the same source cache. This report does not rebuild the corpus or index. These are normalizer output counts, not independent verification of every identity or claim.

| Derived audit item | Count |
| --- | ---: |
| inputRows | 40,876 |
| candidates | 40,221 |
| searchableCandidates | 22,271 |
| passages | 273,108 |
| duplicateRowsMerged | 355 |
| heldForIdentityReview | 17,946 |
| excludedRows | 300 |
| invalidRegistrations | 107 |

| Derived passage type | Passages |
| --- | ---: |
| professional-background | 95,273 |
| location | 70,219 |
| clinical-interest | 50,487 |
| procedure | 29,146 |
| training | 15,543 |
| clinical-practice | 7,113 |
| research | 5,249 |
| relationship | 78 |

| Attribution class | Passages |
| --- | ---: |
| source-record | 205,936 |
| linked-source | 67,162 |
| verified-source | 10 |

Source-record attribution means copied from a row; linked-source means a source URL was attached. Neither is independent public-page verification. Ten manually reviewed passages, where still reported, are a tiny targeted addition rather than verification of the network. Held identities are coverage losses, not safe-to-recommend experts.

## Product capability map

| Workflow | What the data supports | Weak proxies / unresolved questions | Required user or enrichment work |
| --- | --- | --- | --- |
| Discovery | Search attributable biographies, interests, procedures and research narratives against an explicit clinical/device brief. | Role/specialty alone, topic mentions and sparse profiles cannot establish task-specific expertise. | Corroborate identity and source scope; qualify current work. |
| Comparison | Compare the same requirement–evidence matrix and source passages; make gaps visible. | Different sources have different completeness and dates; absent evidence is not evidence of no expertise. | Confirm role, recency, population, setting and relevant activity. |
| Complementary panel preparation | Identify different recorded clinical and research perspectives for a shared scope. | Research interests/degrees do not establish a researcher role, assessor competence or ability to appraise a study. | Attribute actual study tasks and discuss intended contribution with each candidate. |
| Qualification and independence review | Carry evidence and unresolved questions into explicit team decisions. | Public memberships and advisory wording do not prove approval, availability, or conflict/independence. | Obtain registration/current-practice checks, declarations and engagement-specific qualification records. |
| Outreach preparation | Draft a bounded invitation using recorded professional experience and the team’s questions. | No projected personal contact channel, consent, willingness, diary, fee or verified recruitment history. | Team reviews and sends through an authorised channel; only real activity is recorded. |
| Evidence packs | Save brief/evidence versions, URLs, dates, source limitations, notes and explicit manual decisions. | A pack preserves a historical snapshot; it does not refresh sources or certify suitability. | Recheck stale scope/evidence and retain reviewed source associations. |

## Prioritised enrichment backlog

1. **Identity and source attribution first.** 17,466 (42.7%) have a name plus a parseable link, but links are not universal corroboration and the corrected audit still withholds many identities. Resolve source/name/registration conflicts with authoritative profile or regulator evidence before increasing recall. Keep every assertion attached to its actual source.
2. **Improve clinical narrative coverage.** 16,297 rows (39.9%) lack a ≥40-character biography. Preserve alternate biographies and fetch targeted professional narratives for useful but sparse leads. Add explicit clinical activity, patient population and setting with sentence-level relations; do not infer these from a title or hospital.
3. **Add recency and dated activity.** The cache has 40,876 (100.0%) merge timestamps but only 0 (0.0%) structured source/publication-date rows. Store observed date separately from publication/update date and the period of the professional activity. Obtain direct confirmation of current practice.
4. **Resolve publications to attributed contributions.** 171 (0.4%) rows have search links. Resolve actual DOI/PMID/title/author/affiliation, disambiguate the person, identify study design and their explicit role. Historical coauthorship is useful evidence but cannot become individual study-appraisal competence.
5. **Represent volume with scope, unit, period and provenance.** Only 0 (0.0%) rows have the mechanically complete name/count/period/URL tuple. Preserve ranges and missing periods; separate combined-modality totals, admissions, procedures and individual interpretation activity. Do not rank volume as quality.
6. **Structure profession and relationship review.** Dedicated role text is not selected in this projection; record verified profession separately from specialty. Review the 2,058 (5.0%) lexical relationship queue for actual company/organisation, role, dates and terms. Public-body membership or an award is not commercial involvement. Independence remains an engagement-specific human determination.
7. **Keep operational facts in the project workflow.** Availability, willingness, fees, contact events, qualification and independence decisions need direct, authorised team records. Do not fill missing values with model inference or attach fabricated ROI estimates.

## Reproduce and refresh

```powershell
node expert/evaluation/capability-report.cjs
```

Run this after the final corpus build to refresh the derived snapshot. It streams `expert/.cache/raw.json`, reads the small existing `corpus-audit.json`, and writes aggregate JSON to the ignored cache plus this document. It does not load credentials, call any service, rebuild the corpus, read a held-out case pack or start another embedding index. The fixed regex proxy definitions are in the script and are not validated extraction claims.
