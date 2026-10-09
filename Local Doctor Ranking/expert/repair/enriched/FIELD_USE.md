# Enriched professional information: permitted uses

This specification applies to the immutable enriched release, not to the shared consultant table. Acceptance of a field means its attribution and wording have passed source checks. It does not approve a clinician for engagement.

| Source information | Retrieval and requirements | Profile and export | Limits |
| --- | --- | --- | --- |
| Attributable primary/alternative biography | Original passages remain available to BM25 and semantic retrieval; clinical activity must be supported by the actual statement | About, with source-linked excerpts and access to remaining passages | Biography length, provider count and promotional superlatives are not qualifications |
| Explicit profession | Requested professional role; compatible recorded role fields, never an assumed GMC requirement | Professional role/background | No new role is inferred merely from a provider's filename or specialty topic |
| Conditions and clinical interests | Topic/interest requests can use listed interests; activity requests require stronger wording | Clinical interests; concise sourced relevance | A listed condition is not proof that a procedure was performed |
| Procedure listing | Searchable procedural subject; distinct from documented performed activity | Treatments and procedures, labelled as a listing | Generic provider “Treatments” lists use `treatment-listing`, including conditions; no promotion to procedure performance |
| Population | Explicit recorded population may support a population request | Patient populations and source qualification | A general “adults” field cannot establish adult experience with an unrelated modality elsewhere in the record |
| Language and stated proficiency | Explicit requested constraint, or preference when the user says optional/preferred; owned language fields only | Languages; exact proficiency retained | Missing proficiency remains unknown; language is not clinical expertise |
| Consultation/industry service | Explicit requested service constraint or preference; owned service fields only | Services | A recorded offering is not present availability or proof of unrelated clinical activity |
| Qualifications and academic background | Searchable background; a credential requires its intact source wording | Qualifications and academic background, independent of registration | Mixed academic lists stay neutral; fragments such as “Language” and “(Hons)” are not standalone qualifications |
| Membership, professional body, affiliation | Searchable supporting background; relationships retain their source meaning | Affiliations or background, as appropriate | Mixed lists containing GMC/HCPC registration are neutral professional-body information, not membership proof |
| Research interests | Can directly answer a research-interest request | Research, labelled as interests | Does not establish study design, appraisal, participation or authorship |
| Profile-reported research background | Original source-ordered block remains searchable | Research, qualified as profile-reported | Bibliographic fragments are not individually verified publications; named trial roles require a separate verified identity/role decision |
| PHIN activity and source dates | Requested dated activity uses the reported range and available context | Reported procedure, range, hospital and period; unknowns explicit | `<=7` remains a range. A midpoint is not an observed count. Profile-update dates are not procedure periods or proof of current practice |

### Explicit source-report requests

“Recorded procedure activity” and “records of seven or fewer” are requests for
reported metadata. They are not requests to infer current clinical practice.
The interpreter preserves these as **Reported procedure activity** and
**Reported range of seven or fewer**, with ordinary focus priority unless the
user explicitly changes it. “Show any period attached to the figures” is display
context, not a mandatory requirement that would exclude every undated record.

The v8 prepared corpus contained 159,274 embedded volume entries, all with unknown
reporting periods. These are repeated prepared source entries, not unique
procedures or experts. Exact counts of zero, upper-bound buckets such as `<=7`,
intervals and derived numeric estimates must retain different meanings. `<=7`
does not prove at least one procedure; zero in a reported source does not prove
the clinician has no career experience. A date on a PHIN profile does not supply
the missing activity period. No cross-provider frequency or recency ranking is
justified by these entries.

### Ordinary-language field-use examples

The utility specimens retain **Haematologist**, **Orthopaedic surgeon**,
**Vascular surgeon**, **Musculoskeletal imaging** and **Allergy** rather than
silently broadening to a generic profession or modality. These are directly
supplied topics and roles, not inferred essential qualifications. Explicit
language priority phrases such as “Speaking Portuguese would be helpful” are
operations on the language requirement, not part of its name. Removal and
negation retain the same safety rules as other criteria.

The private utility pack now selects 15 cases and 18 information
categories. Its profile/save/export checks are separate from hosted retrieval.
The initial projection exposed a soft-wrapped biography defect; those failed
receipts remain unchanged. Corrected projection and retrieval must be rerun
against the exact newly packaged corpus before release signoff.

The additional positive service specimen asks for **Professionals offering
product development**, using the exact BDA service wording. The original broader
request for dietitians offering food-industry services remains a separate test:
its supplied service example must not disappear, but a service listing does not
invent a dietitian role or prove all broader industry offerings. Literal product
development, recipe development, cooking demos, content creation and writing and
editing are retained as service requests with the user's stated priority.

Explicit device-user statements such as “This version is for general practitioners
in primary care” are workflow context, not a request to rank GPs as the expert
role. Ordinary “Find general practitioners in primary care” retains its role and
setting requirements. The interpreter's cache identity changes with these rules.

## One evidence meaning across the workflow

Search cards, comparison, explanations and review packs use the same candidate–requirement matrix. Background sections are a separate attributable record view; their presence cannot silently establish a requirement. Optional AI prose has no authority to add facts, change evidence strength, write decisions or remove gaps.

Search is compiled from the active brief and location only. Removal clears the active requirement, not just its chip. An unresolved removal, mandatory constraint or unsupported Boolean interpretation retains the previous accepted search and asks for clarification. Ordinary specialty and unfamiliar positively stated expertise remain valid discovery inputs.

Candidate aggregation takes one strongest contribution per candidate and query, rather than a vote per repeated provider passage. Identical supporting text is deduplicated for presentation while differing source origins and dates remain available. Repeated material must not manufacture a stronger credential.

## Safety and historical evidence

Field exclusions are applied to a clone of the frozen professional projection before corpus preparation. The same prepared corpus feeds retrieval, current profile/background, source pages, explanations, newly saved evidence and export. Whole-identity holds remain effective independently of field corrections. Missing source links alone do not exclude an identity.

Historical saved evidence is not rewritten. New saves bind background to the exact candidate, release, corpus and projection. Partial/unavailable background remains explicit with Retry. Import validation accepts previous supported formats; a materially changed scope or evidence version marks decisions for review.

## Required end-to-end proof

For every accepted category, the release report must identify a source-bound example, its search request, returned evidence identifier, appropriate profile section and exported evidence/version. Categories with no safely attributable additions must report zero additions rather than invent examples. Mechanical text/hash verification and independent meaning review are separate receipts. Dataset acceptance and upstream model availability are reported separately.
