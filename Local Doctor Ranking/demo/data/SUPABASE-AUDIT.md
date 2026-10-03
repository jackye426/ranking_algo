# Supabase consultant data audit

Audit date: **1 October 2026**. Project: **DocMap**, reference `oewczjseteyvyvikxxaz`.

The demo now reads real consultant records from this project. The primary source is `public.integrated_practitioners`. The public-profile collection is used only for a small, explicitly attributed set of insurer and portrait supplements; it does not replace or add consultants to the Supabase result set.

## Source schema and relationships

The inspected primary table contains **40,876 rows**. Exactly **4,868 rows** have a non-null `profile_urls.spire` value and form the input to the Spire mapper. These are exact inspected counts. Initial table-list estimates were stale and must not be used as the population size.

The demo reader restricts retrieval to these public consultant fields:

| Column | PostgreSQL type / observed content | Use |
| --- | --- | --- |
| `id` | `text` | Source record identity; retained for every merged row. |
| `name` | `text` | Consultant display name, checked against the Spire profile slug. |
| `gmc_number` | `text`, nullable | Identity check and deduplication; not inferred when missing. |
| `hcpc_number` | `text`, nullable | Available registration metadata; not substituted for GMC. Some values are descriptive text rather than registration numbers. |
| `specialty`, `specialty_source` | `text` | Clinical specialty and its recorded source label. |
| `about`, `about_source` | `text`, nullable | Original profile description and source label. |
| `clinical_interests` | `text`, nullable | Often semicolon-separated clinical interests. |
| `areas_of_interest` | `jsonb`, observed as arrays or null | Additional recorded clinical terms. |
| `procedures` | `jsonb`, observed as arrays of strings | Recorded procedure descriptions mixed with specialty tags; tags alone are not treatment evidence. |
| `procedures_completed` | `jsonb`, observed as arrays of objects | Reader projects only `description`, `hospital` and `code`; counts and numeric midpoints are omitted. |
| `profile_urls` | `jsonb` object | Source-specific profile links, including `spire`, `bupa`, `phin` and sometimes other providers. |
| `locations` | `jsonb` array | Hospital, source, address/street, postcode, city/region, website and sometimes coordinates. |
| `languages` | `jsonb`, observed as arrays or null | Recorded languages; absence is not guessed. |
| `sources` | `jsonb` array | Ingestion-source labels. These are not insurance-acceptance evidence. |
| `merge_date` | `timestamptz` | Source integration timestamp, not a fresh profile-verification date. |
| `requires_review`, `do_not_recommend` | Boolean; the latter may be null | Exclusion flags. |

Practice and source relationships in this table are embedded in JSONB. The mapper does not need a separate hospital or insurer join to interpret the available rows. It does not fetch private contact fields or unrelated product tables.

Three related benchmark tables were also identified:

| Table | Inspected count | Relationship / relevant fields |
| --- | ---: | --- |
| `public.consultant_benchmark_cohorts` | 1 | UUID `id`, referenced by the other benchmark tables. |
| `public.consultant_benchmark_members` | 516 | UUID `id` and `cohort_id`; text `practitioner_id`, `gmc_number`, `display_name`; JSONB `profile_urls`. |
| `public.consultant_benchmark_cards` | 516 | UUID `id` and `cohort_id`; text `practitioner_id`; numeric `profile_score`; JSONB `profile_components` and `util_summary`. |

The benchmark tables have foreign keys through `cohort_id`. `practitioner_id` is a **logical join to the practitioner identity, without an enforced foreign key**. These benchmark metrics are not incorporated into the demonstration ranking: a profile or utilization score is not evidence of clinical quality or suitability for a particular patient.

## Mapping and quality results

The mapper was executed against the complete **4,868-row** Spire input, not just the small public demonstration sample. It produced **4,031 unique consultants**:

| Outcome | Count |
| --- | ---: |
| Input rows with a recorded Spire URL | 4,868 |
| Rejected source rows | 433 |
| Duplicate source rows merged into accepted identities | 404 |
| Accepted unique consultant records | 4,031 |
| Accepted consultants with an explicitly recorded GMC number | 3,695 |
| Accepted consultants with at least one postcode | 4,031 |
| Accepted consultants with clinical interests or exact extracted clinical sentences | 3,910 |
| Accepted consultants with stored procedure strings, including specialty tags | 4,006 |
| Accepted consultants with coordinates already present in the source before geocoding | 325 |
| Accepted consultants with verified insurer supplements | 4 |
| Accepted consultants with matched public-profile supplements | 11 |

Thus `4,868 - 433 - 404 = 4,031`. The mapper's general `excluded` counter is **837**, combining rejected rows and merged duplicates; `excludedRows` and `duplicateRowsMerged` separate those two outcomes.

The exclusive rejection reasons were:

| Reason | Rows |
| --- | ---: |
| Recorded GMC does not match the `c` registration number in the Spire URL | 120 |
| Name is incompatible with the linked profile's name | 299 |
| `do_not_recommend` or `requires_review` flag | 9 |
| GMC conflicts with a different registration type in the profile URL | 2 |
| Otherwise unflagged duplicate of a flagged identity | 1 |
| Conflicting names within a duplicate identity group | 2 |
| **Total** | **433** |

The initial database inspection found **121 GMC/Spire-URL mismatch rows** and **324 duplicate GMC groups**. Those measures use different groupings and precede mapper rejection ordering: a row caught by an earlier flag is not counted again as a GMC rejection. Duplicate *groups* are also different from duplicate *rows merged*, and the mapper can use a shared Spire profile identity where GMC is absent.

The mapper accepts only official HTTPS Spire consultant-profile URL forms and Spire-named locations. It rejects missing identities, contradictory registration identifiers and incompatible profile names. The name check handles titles, common explicit aliases, initials, accents and punctuation, but remains deliberately conservative. Some excluded records may be legitimate aliases or source typos; the correct next step is an identity review, not silently weakening the join.

Duplicate records merge proven locations, clinical terms, language values and source-row provenance. A flagged duplicate cannot be reintroduced by another unflagged copy. Conflicting coordinates are withheld for resolution instead of allowing the last row to determine distance. The observed literal `nHospital` ingestion artefact is corrected to ` Hospital`; historical hospital names are otherwise retained rather than silently renamed.

When both clinical-interest fields are empty, the mapper may extract short **exact clinical sentences from `about`**. This occurred for **1,083 accepted source rows** before deduplication. It never adds inferred treatments, invented expertise or public-snapshot clinical text to fill the source record. Provenance identifies these values as exact sentence extraction. Remaining missing interests stay empty.

## Procedure evidence and clinical refinements

The additional procedure-field inspection found `procedures` populated in **4,842 source rows** and `procedures_completed` populated in **3,182 source rows**. After the same identity checks and deduplication, **4,006 consultants** have at least one stored procedure string. These are availability counts for the fields, not counts of consultants proven to perform a particular operation: values such as “Orthopaedics - hip and knee” are specialty tags and cannot satisfy a knee-replacement or arthroscopy requirement.

The completed-procedure source objects contain procedure descriptions, hospital names, codes, activity ranges such as `1-5` or `5-50`, and `count_numeric` values such as `3` or `27.5`. The numeric values are bucket midpoints, **not observed operation volumes**. Reader version 2 projects only `description`, `hospital` and `code`. Neither the activity ranges nor their midpoints enter the mapped consultant records, explanations or rankings. A completed-procedure entry supports a documented procedure history; it does not establish current availability or clinical quality.

Mapped `procedures` and `procedureEvidence` preserve the source text, source row, original field, and hospital/code where present. `fieldProvenance.procedures` retains these references. The source schema does not identify a direct provider URL for every procedure field, so missing field-level links remain null and use the demo's source-record page for citation. A Spire identity URL is not substituted as proof that Spire supplied that treatment description.

Explicit specialty refinements match the **recorded specialty title**, including grounded title aliases such as “Hip and Knee Surgeon” for orthopaedics. A specialty mentioned only in a biography or training history cannot meet that filter. Explicit procedure refinements require positive documented procedure evidence from stored procedures, clinical-interest fields or a sentence attributing the procedure to the consultant's own practice. Negated, training-only, research-only and colleague-attributed mentions do not qualify. All requested procedures are required together. Narrower documented forms can support a broader request—for example, total knee replacement supports knee replacement—but a generic knee-replacement mention does not prove total or revision knee replacement.

This matching is deliberately conservative. Missing procedure evidence is not a claim that a consultant cannot perform the treatment. The procedure-field additions changed neither the accepted identity count of **4,031** nor the **four** consultants with explicit Bupa supplements.

## Provenance and insurance limits

Every accepted record retains its constituent `sourceRecordIds`, source merge timestamps, explicit affiliation evidence, field provenance and location provenance. Clinical descriptions sourced from BUPA or PHIN are not falsely attributed to Spire merely because a Spire identity link exists. When the underlying field has no direct source URL, the demo's source-record page provides the recorded fact and provenance, with the external profile link clearly serving as identity evidence.

Spire affiliation is grounded in the database's official Spire profile link plus its structured Spire practice locations and identity consistency checks. This audit does **not** mean every one of the 4,031 external profiles was freshly fetched or that every practice location was reconfirmed on 1 October.

Although **3,934 input rows include `BUPA` in `sources`**, **none has a non-null `profile_urls.bupa`** in the retrieved Spire population. There are no structured insurer-acceptance fields sufficient to make a reliable Bupa filter from this source alone. A BUPA ingestion label or hospital location cannot establish that a consultant accepts a particular policy.

Only four Supabase consultants receive Bupa evidence from the separately verified public-source collection, joined by exact GMC or exact valid profile URL identity, with compatible names:

- **Ravi Popat:** Bupa Finder lists fee assurance and Open Referral participation.
- **Timothy / Tim Waters:** Bupa Finder explicitly says **not fee assured**; Open Referral participation is listed.
- **Yegappan Kalairajah:** fee assured, but **not in the Open Referral network**.
- **Sunil Kumar:** Bupa Platinum, fee assured and Open Referral participation.

These supplements add insurer evidence and, where matched, a portrait URL. They do not replace Supabase's descriptions, interests or locations, and do not append fallback consultants. Each supplement records its original source and research date. See [the public-source inventory and insurer links](DATA-PROVENANCE.md). No evidence means **unverified**, not “does not accept Bupa”; consequently the current Bupa filter has intentionally limited coverage. Listed recognition is not a guarantee of policy cover, procedure eligibility, appointment availability or absence of a fee shortfall.

The inspected source merge timestamps are dated **15 February 2026**. The runtime read on 1 October proves the database was read then; it does not make the underlying profile information freshly verified. The mapper retains merge timestamps separately and does not convert them into `retrievedAt` assertions.

## Read path and preservation of existing data

The deployed Edge Function **`docmap-spire-demo-read`**, reader **version 2**, provides a live, read-only, column-allowlisted source for the local server. Version 2 adds the procedure fields and the restricted completed-procedure projection above; authentication remains unchanged. Its dedicated 256-bit access token is checked against a hash held in the function. The function's privileged database credential remains inside the Supabase execution environment. The local server's reader token is held in an ignored `.env.local` file and is never sent to browser JavaScript or returned in API responses.

The inspected table has RLS enabled, an authenticated `SELECT` policy with a true predicate, and no anonymous `SELECT` policy. The Edge Function uses its server-side service-role access for the narrowly implemented read and applies its own token authentication. The demo did **not** change existing database rows, schema, grants or RLS policies.

The raw allowed-column response is stored at runtime under `demo/.cache/supabase-raw.json` for local inspection and verification. It is not committed and is not served as a static browser asset. Do not commit the runtime raw cache, reader token or service credentials. The demo's public source pages should continue to render only the deliberate consultant-fact/provenance allowlist.

The live read, identity mapper and retrieval verification address the requested data connection. Wider insurer coverage, identity-review exceptions and source refreshes remain data-quality work; they should be resolved with explicit evidence rather than inferred acceptance or silent record substitution.
