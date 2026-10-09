# Source quality and unresolved work — 8 October 2026

The fresh baseline contains 40,876 professional source rows. Recovery accounts
for the frozen 37,195 Bupa rows without adding identities or changing original
source files. Tests and source checks establish bounded repair correctness;
they do not establish current practice or complete search acceptance.

## Prepared and checked

- Bupa text: 24,917 field repairs across 10,913 rows. Full row outcomes and
  100 pilot plus 200 follow-up source reviews are retained; independent actual
  HTML comparison passed 300/300. Clinical-interest and areas-of-interest
  patches can represent the same source section, not separate new facts.
- Stage 4 context: 80,826 literal source-field items across 14,085 existing
  eligible rows. Bupa contributes 32,951 items (languages and explicit Offers);
  HCA/Cromwell/BDA contribute 47,875 items (conditions, languages, patient
  populations and services). POGP contributes zero accepted items.
- Independent checks covered all 47,875 provider items and 200 Bupa context
  source profiles/521 items. “Offers” remains service metadata, not performed
  clinical activity. No headline profession was inferred and no complete
  provider biography replaced a merged biography.
- These counts are not novel facts: 7,308 of 40,983 provider items at least eight
  normalized characters long already occur literally within baseline narrative
  fields. That is a duplication indicator, not a complete semantic audit.
- PHIN range, reporting-period, hospital, procedure-code and available source
  metadata are preserved from existing records. This is not a new activity-count
  import; derived estimates remain labelled and periods remain non-comparable.

## Prioritized unresolved queue

| Priority | Queue and evidence | Required next step |
| --- | --- | --- |
| P0 | Three mandatory whole-group identity holds: `bupa_6445`, `bupa_26882`, `bupa_22318`. The collision investigation newly confirmed mixed osteopathy/ophthalmology attribution in David Jones (`bupa_22318`). | Keep all three held until independent person/source attribution is resolved; do not release on name similarity. |
| P0 | Saved Bupa filenames use nonunique named slugs. Ravi Lingam (`bupa_13206`) and Robert Smith (`bupa_27571`) have snapshots of different professionals from their internally consistent current rows. | Recover an original provider-ID-bound snapshot; keep repair proposals withheld. These two snapshot conflicts do not by themselves authorize new row exclusions. |
| P1 | 37 historical CSV/GMC disagreements are provenance-proposal flags. | Reconcile each historical URL against the person; never use them as blanket row holds. Current independently proved snapshot bindings remain separate. |
| P1 | 8,107 Bupa rows have at least one field in the typed-identity/URL recovery backlog; 258 mapped rows lack stored print-URL metadata. | Obtain typed registration or independently corroborated canonical provider identity and source URL before adding evidence. URL presence alone is insufficient. |
| P1 | Unknown source encoding affects at least one withheld field on 1,560 rows. Mark Hughes is a confirmed example where damaged encoding already exists in the saved HTML. Two Bupa language items also remain withheld. | Find intact original bytes or an independently verified source. Do not guess lost text or automatically reverse unknown encoding. |
| P1 | Source accounting: 103 malformed JSONL lines, 120 extra duplicate snapshot references, 283 current HTML files outside the frozen Bupa mapping; zero missing referenced files. | Recover and reconcile originals with explicit lineage. Do not create people from orphan filenames or reinterpret positional IDs. Four unmatched provider-export records likewise create no new identities. |
| P1 | All 889 POGP source records remain identity-held; no POGP population context was accepted. | Resolve existing identity groups before reconsidering their explicit fields. |
| P1 | Research: 12 archived trial cases reviewed, 11 literal role matches and one parser fallback with no source role; zero candidate attributions approved. | Independently corroborate each person and exact role. Public/Scientific contact, institution, ethics reference and recruitment status do not establish investigator responsibility. |
| P2 | 4,075 Bupa About fields differ from the frozen single-provider predecessor. Whole-provider biography reconciliation and alternative biographies remain incomplete. | Compare source-owned statements and preserve merged evidence; do not overwrite a whole biography to improve coverage. |
| P2 | Explicit profession recovery is incomplete; source headlines can be specialties, organisations or names. PHIN records still lack resolved source dates in some cases. | Add only literal, identity-bound profession evidence; reconcile dates without treating archive/merge timestamps as practice currency. |

Counts overlap across queues. A withheld field is not automatically an identity
hold, and a successful parser correction is not a new registration check.

## Release and acceptance limits

Private, code-hash-pinned R0-v2, Bupa R1-v2 and context R2 packages passed the
source-bound loader and identity replay. Original generated preparation
artifacts remain unchanged. At this report's handoff, the root reported R0's
protected hosted checks passed, R1 was deployed and warming its cache, and R2
was staged privately but not activated while evaluation was outstanding. This
document does not assert final hosted acceptance.

The consolidated local suites report 1,436 passing tests and zero failures.
That does **not** mean the frozen search gates all pass. Baseline/R0/R1 retain
14 critical failed checks across 11 cases in each retrieval mode, plus unmet
aggregate thresholds. No new critical failures appeared in R0/R1; R1 has no
hybrid/BM25 case loss but one semantic-only anchor moved from rank 20 to 21.
R2's final evaluation is not claimed here. See the private
`retrieval-evaluation/PREEXISTING_FAILURES.md` and final verification report.
