# What semantic retrieval contributes

Recorded 2026-10-06T16:28:31.789Z. This bounded offline probe uses 8 reviewed public-source passages and 12 fixed queries. No paid model, remote download, Supabase connection or private project data was used.

**This is evidence about language matching, not demonstrated aggregate ranking uplift.** The separate full development evaluation currently reports the same 91.7% known-candidate recall and 100% central-result precision for hybrid and BM25 retrieval, with no uniquely semantic candidate in its top 20. This small probe does not replace that result.

## Method

- Freeze five exact-term / everyday-language pairs before scoring, plus broad research and an unrelated knee-surgery control. No query is removed after seeing its score. The expected passage keys are a disclosed, manually defined probe target, not independent held-out labels.
- Use the production BM25 implementation (k1=1.5, b=0.75), including its stopwords and token aliases. Use the existing quantized local all-MiniLM-L6-v2 model, mean pooling and normalized vectors. Cosine ≥0.40 uses the production passage-admission threshold.
- Score every query against every passage. Show RRF (k=60) as an illustrative passage fusion. The full system also decomposes requirements, expands known concepts, checks evidence scope and reranks candidates; those steps are deliberately excluded here to isolate lexical and embedding behavior.
- Run the same fixed queries twice: reviewed source summaries, then literal supporting excerpts only. Reviewed summaries are human source-grounded paraphrases, not verbatim quotations. Some literal excerpts are very short and cannot carry the full reviewed context.
- A cosine is similarity, not confidence or proof. “Admitted” means available for later evidence checks, never that the professional fulfils the requirement.

Query-set SHA-256: `30ebd9736ba1081a17abef4c1f033e3ac3723c7cbc55762c489bb1840dd30bfc`. Source SHA-256: `7fcebfd16d3a5bf4aa34c66088c7cedee5fa33f7055a6468a81a82d0ead67b22`. Model: `Xenova/all-MiniLM-L6-v2`.

## All query outcomes

Ranks below show the best expected passage. A dash means no expected passage was retrieved by BM25, or no expected semantic passage reached 0.40. Semantic rank is among all passages, including those below the admission threshold.

| Query | BM25 rank | Semantic rank | Fused rank | Literal-only BM25 / semantic rank | Zero-overlap semantic target |
| --- | ---: | ---: | ---: | --- | --- |
| dermoscopy skin cancer diagnosis | 1 | 1 | 1 | 1 / 1 | — |
| Who checks suspicious moles using magnified pictures? | — | — | — | — / — | — |
| cardiac coronary CT | 1 | 1 | 1 | 1 / 1 | — |
| Who interprets pictures of arteries supplying the heart? | — | 1 | 1 | — / 1 | bupa_11411:targeted_public_profile |
| MoleMate primary care diagnostic performance referral study | 1 | 1 | 1 | — / — | — |
| Who helped study a tool that tells family doctors which unusual moles to send to hospital? | 2 | 1 | 1 | — / — | — |
| Check 4 Cancer clinical advisor telemedicine | 1 | 1 | 1 | 1 / — | — |
| Who advises a business offering remote mole checks? | — | — | — | — / — | — |
| vascular radiology trials | 1 | 1 | 1 | 1 / 1 | — |
| Who takes part in studies about blood vessel scans? | — | 1 | 2 | — / 1 | bupa_11411:targeted_public_research |
| clinical research | 1 | 1 | 1 | 1 / 1 | — |
| robotic knee replacement surgery | — | — | — | — / — | — |

Across the 11 non-negative probe queries, BM25 retrieved at least one expected passage for 7; semantic retrieval admitted at least one for 9. These are small, preselected passage-probe counts, not general search recall. 2 queries admitted an expected passage with **zero shared normalized keyword tokens**.

## What actually happened

- **A real vocabulary bridge:** “arteries supplying the heart” reached the coronary-CT passage at cosine 0.4699; “blood vessel scans” reached vascular-radiology research at 0.6418. Both had BM25 0 and zero shared normalized tokens. The bridge also appeared in the literal-excerpt run (0.4291 and 0.6485).
- **An ordering benefit in this small corpus:** the family-doctor / unusual-moles study request ranked the MoleMate summary second with BM25 and first with MiniLM (cosine 0.4884). Its one shared token was “study”; this is improved passage selection, not a new candidate discovered in the full directory.
- **Two everyday requests failed:** the suspicious-moles / magnified-pictures request’s strongest expected summary scored 0.3549, and the remote-mole-checks advisory request scored 0.3942. Neither reached 0.40, and BM25 found neither expected target. The latter was the most similar passage but still below threshold; a high relative rank does not make weak evidence acceptable.
- **Fusion can worsen a passage’s order:** vascular research was semantic rank 1 but illustrative RRF rank 2 because a different passage received lexical credit for the generic word “study”. In the literal-only relationship case, BM25 found the advisory excerpt first, while semantic retrieval admitted a telemedicine-research excerpt instead; fusion moved the actual advisory target to second. This supports retaining requirement-specific evidence checks after retrieval.
- **Missing context stays missing:** “Paul Norris” alone scored 0.0105 for the exact trial query and 0.0539 for the everyday study query. The reviewed study summary carried information absent from that short quotation. A fuller source passage would be preferable where available; these results must not be attributed to embeddings alone.
- **The negative control was rejected:** no passage reached 0.40 for robotic knee-replacement surgery. Maximum cosine was 0.1750 for summaries and 0.2168 for literal excerpts. One negative query is not a general false-positive-rate estimate.

## Interpretation and limits

The exact-term queries test that keyword search remains valuable. Everyday paraphrases test whether a related passage can enter the candidate pool without the user reproducing its vocabulary. The literal-only run exposes dependence on available context: a supporting quote consisting only of “Paul Norris” cannot communicate the trial, setting or role. Neither retrieval path can reconstruct missing evidence.

The coronary paraphrase mentions heart arteries but does not specify CT. A related CT passage is an exploratory lead, not authority to invent the intended modality. Similarly, “research” is broad and historical coauthorship is not individual diagnostic-study appraisal. Advisory relationship evidence is a prompt for review, not a conflict determination.

Keep the claim narrow: local semantic retrieval can bridge some everyday phrases to related professional passages, while exact terms remain strong for BM25. This probe exposes both missed paraphrases and fusion errors; it does not establish that the overall shortlist is better. A larger independent assessment with varied language and hard negatives is needed before that claim.

Detailed successes, misses and negative-control scores are retained below. No change to production thresholds or query rules was made based on this probe.

## Source inventory

- **spire_668:targeted_public_profile** · clinical-practice · [Spire professional profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/).
  - Reviewed summary: The professional profile documents assessment of skin lesions and skin-cancer care.
  - Exact supporting excerpt: “Skin lesion assessment and management”
  - Limits: Undated biography does not verify current engagement availability.
- **spire_668:targeted_public_research** · research · [Spire professional profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/).
  - Reviewed summary: The profile describes research into detecting skin cancer with dermoscopy, computer imaging, telemedicine and artificial intelligence, including helping non-specialists assess lesions.
  - Exact supporting excerpt: “dermoscopy, computer imaging, telemedicine and artificial intelligence”
  - Limits: Research interests do not establish formal assessment approval or a particular device-study role.
- **spire_668:targeted_public_relationship** · relationship · [Spire professional profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/).
  - Reviewed summary: The profile records a skin clinical-advisory role for the telemedicine screening company Check 4 Cancer. This is relationship evidence for review, not a conflict determination.
  - Exact supporting excerpt: “Clinical Advisor for Skin”
  - Limits: The page supplies no start/end date or engagement terms. Relationship relevance and independence must be assessed for the actual engagement by the recruiting organisation.
- **bupa_12291:targeted_public_profile** · clinical-practice · [Spire professional profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/dr-paul-norris-c2720966/).
  - Reviewed summary: The professional profile describes dermoscopy and the diagnosis and screening of skin cancer.
  - Exact supporting excerpt: “use of dermoscopy in skin cancer diagnosis”
  - Limits: The undated page does not confirm current engagement availability or regulatory-assessment experience.
- **bupa_12291:targeted_publication** · research · [MoleMate trial protocol (2010)](https://link.springer.com/article/10.1186/1471-2296-11-36).
  - Reviewed summary: Paul Norris is a named consultant-dermatologist coauthor of the 2010 MoleMate trial protocol. The study evaluates a skin-lesion diagnostic aid in primary care, including referral decisions and diagnostic performance.
  - Exact supporting excerpt: “Paul Norris”
  - Limits: Historical coauthorship supports study involvement, not a specific investigator task, present study-appraisal competence or regulatory approval. The study context is not a determination of an individual financial relationship or conflict.
- **bupa_14429:targeted_public_profile** · clinical-practice · [Circle professional profile](https://www.circlehealthgroup.co.uk/consultants/sanjay-banypersad).
  - Reviewed summary: The hospital profile documents cardiac CT and MRI practice and development of the imaging service at Royal Blackburn Hospital.
  - Exact supporting excerpt: “cardiac CT and MRI service”
  - Limits: The profile is undated; current practice still requires confirmation. Its combined CT/MRI activity must not be treated as a CT-only reporting count.
- **bupa_11411:targeted_public_profile** · clinical-practice · [PHIN consultant-provided profile](https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157).
  - Reviewed summary: The consultant-provided professional profile records cardiac coronary CT experience.
  - Exact supporting excerpt: “cardiac coronary CT”
  - Limits: The displayed page-update date is not a dated attestation of current clinical practice. CT accreditation wording is not medical-device assessment approval.
- **bupa_11411:targeted_public_research** · research · [PHIN consultant-provided profile](https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157).
  - Reviewed summary: The consultant-provided profile describes research involvement in vascular radiology and participation in trials.
  - Exact supporting excerpt: “I have an active interest in research with vascular radiology and am involved in a number of trials.”
  - Limits: No individual trial, role, diagnostic-performance appraisal task or participation date is established by this passage.

## Every score: reviewed-summary

BM25 and cosine are on different scales and must not be compared numerically to each other. “Expected” means the predeclared probe target. BM25 0 has no rank; the negative control has no expected target.

### skin-exact

dermoscopy skin cancer diagnosis

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | skin, cancer | 1.6365 | 3 | 0.6179 | 3 | Yes | 3 |
| spire_668:targeted_public_research | Yes | skin, cancer, dermoscopy | 2.1558 | 2 | 0.7017 | 2 | Yes | 2 |
| spire_668:targeted_public_relationship | No | skin, cancer | 1.0689 | 4 | 0.4435 | 5 | Yes | 4 |
| bupa_12291:targeted_public_profile | Yes | dermoscopy, diagnosis, skin, cancer | 5.1329 | 1 | 0.9115 | 1 | Yes | 1 |
| bupa_12291:targeted_publication | No | skin | 0.3638 | 5 | 0.5126 | 4 | Yes | 5 |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.0789 | 8 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.1136 | 7 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.2148 | 6 | No | — |

### skin-everyday

Who checks suspicious moles using magnified pictures?

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2021 | 6 | No | — |
| spire_668:targeted_public_research | Yes | None | 0.0000 | — | 0.3549 | 3 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.3668 | 1 | No | — |
| bupa_12291:targeted_public_profile | Yes | None | 0.0000 | — | 0.3141 | 4 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.3569 | 2 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.1156 | 7 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.1001 | 8 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.2290 | 5 | No | — |

### heart-exact

cardiac coronary CT

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.0884 | 5 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.0856 | 6 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.0963 | 4 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.0809 | 7 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0721 | 8 | No | — |
| bupa_14429:targeted_public_profile | Yes | cardiac, ct | 2.5507 | 2 | 0.5800 | 2 | Yes | 2 |
| bupa_11411:targeted_public_profile | Yes | cardiac, coronary, ct | 5.2478 | 1 | 0.7227 | 1 | Yes | 1 |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3058 | 3 | No | — |

### heart-everyday

Who interprets pictures of arteries supplying the heart?

An exploratory anatomical paraphrase, not an explicit request for CT. A retrieved CT passage does not establish that CT was intended.

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.0416 | 7 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.1473 | 4 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.1207 | 5 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.0956 | 6 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0321 | 8 | No | — |
| bupa_14429:targeted_public_profile | Yes | None | 0.0000 | — | 0.3932 | 3 | No | — |
| bupa_11411:targeted_public_profile | Yes | None | 0.0000 | — | 0.4699 | 1 | Yes | 1 |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3974 | 2 | No | — |

### study-exact

MoleMate primary care diagnostic performance referral study

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | care | 1.5440 | 2 | 0.3993 | 5 | No | 2 |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.3435 | 7 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.4430 | 2 | Yes | 3 |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.3776 | 6 | No | — |
| bupa_12291:targeted_publication | Yes | molemate, study, diagnostic, primary, care, referral, performance | 9.6064 | 1 | 0.5672 | 1 | Yes | 1 |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.2831 | 8 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.4167 | 4 | Yes | 5 |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.4418 | 3 | Yes | 4 |

### study-everyday

Who helped study a tool that tells family doctors which unusual moles to send to hospital?

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2934 | 6 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.3693 | 3 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.3416 | 4 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.3763 | 2 | No | — |
| bupa_12291:targeted_publication | Yes | study | 1.3234 | 2 | 0.4884 | 1 | Yes | 1 |
| bupa_14429:targeted_public_profile | No | hospital | 2.5517 | 1 | 0.1557 | 8 | No | 2 |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.2082 | 7 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3300 | 5 | No | — |

### relationship-exact

Check 4 Cancer clinical advisor telemedicine

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | cancer | 0.8355 | 3 | 0.3370 | 5 | No | 3 |
| spire_668:targeted_public_research | No | cancer, telemedicine | 1.7253 | 2 | 0.4523 | 2 | Yes | 2 |
| spire_668:targeted_public_relationship | Yes | telemedicine, check, cancer | 3.3950 | 1 | 0.6419 | 1 | Yes | 1 |
| bupa_12291:targeted_public_profile | No | cancer | 0.8355 | 4 | 0.3184 | 6 | No | 4 |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.2636 | 7 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.2235 | 8 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.3376 | 4 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3614 | 3 | No | — |

### relationship-everyday

Who advises a business offering remote mole checks?

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2202 | 6 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.2424 | 5 | No | — |
| spire_668:targeted_public_relationship | Yes | None | 0.0000 | — | 0.3942 | 1 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.2698 | 3 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.3813 | 2 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.0505 | 8 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.1707 | 7 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.2549 | 4 | No | — |

### vascular-exact

vascular radiology trials

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.1868 | 8 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.1872 | 7 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.2373 | 4 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.2149 | 6 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.2314 | 5 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.3469 | 3 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.4250 | 2 | Yes | 2 |
| bupa_11411:targeted_public_research | Yes | vascular, radiology, trials | 5.9758 | 1 | 0.7358 | 1 | Yes | 1 |

### vascular-everyday

Who takes part in studies about blood vessel scans?

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2804 | 7 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.3725 | 4 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.3394 | 6 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.3550 | 5 | No | — |
| bupa_12291:targeted_publication | No | study | 1.3234 | 1 | 0.2640 | 8 | No | 1 |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.4038 | 3 | Yes | 4 |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.4813 | 2 | Yes | 3 |
| bupa_11411:targeted_public_research | Yes | None | 0.0000 | — | 0.6418 | 1 | Yes | 2 |

### broad-research

clinical research

Deliberately broad: related research is not proof of a specific assessment task.

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.3308 | 6 | No | — |
| spire_668:targeted_public_research | Yes | research | 1.1195 | 2 | 0.3696 | 4 | No | 2 |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.3715 | 3 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.3035 | 7 | No | — |
| bupa_12291:targeted_publication | Yes | None | 0.0000 | — | 0.3801 | 2 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.2319 | 8 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.3404 | 5 | No | — |
| bupa_11411:targeted_public_research | Yes | research | 1.4240 | 1 | 0.5258 | 1 | Yes | 1 |

### negative-knee

robotic knee replacement surgery

No reviewed passage establishes this expertise. Any above-threshold result is a false positive for this probe.

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | -0.0192 | 8 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.1116 | 2 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.0233 | 4 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.0119 | 5 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.1750 | 1 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.0067 | 6 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | -0.0068 | 7 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.0783 | 3 | No | — |

## Every score: literal-excerpt

BM25 and cosine are on different scales and must not be compared numerically to each other. “Expected” means the predeclared probe target. BM25 0 has no rank; the negative control has no expected target.

### skin-exact

dermoscopy skin cancer diagnosis

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | skin | 1.0885 | 3 | 0.6256 | 2 | Yes | 2 |
| spire_668:targeted_public_research | Yes | dermoscopy | 1.0807 | 4 | 0.4972 | 4 | Yes | 4 |
| spire_668:targeted_public_relationship | No | skin | 1.2398 | 2 | 0.5305 | 3 | Yes | 3 |
| bupa_12291:targeted_public_profile | Yes | dermoscopy, skin, cancer, diagnosis | 5.3816 | 1 | 0.9450 | 1 | Yes | 1 |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0554 | 8 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.0575 | 7 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.0934 | 6 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.1965 | 5 | No | — |

### skin-everyday

Who checks suspicious moles using magnified pictures?

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.1910 | 5 | No | — |
| spire_668:targeted_public_research | Yes | None | 0.0000 | — | 0.3306 | 1 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.2214 | 3 | No | — |
| bupa_12291:targeted_public_profile | Yes | None | 0.0000 | — | 0.2726 | 2 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0599 | 7 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.1370 | 6 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.0515 | 8 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.2036 | 4 | No | — |

### heart-exact

cardiac coronary CT

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.0221 | 8 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.1681 | 4 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.0722 | 7 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.0781 | 6 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.1149 | 5 | No | — |
| bupa_14429:targeted_public_profile | Yes | cardiac, ct | 2.6315 | 2 | 0.7339 | 2 | Yes | 2 |
| bupa_11411:targeted_public_profile | Yes | cardiac, coronary, ct | 5.0177 | 1 | 0.9912 | 1 | Yes | 1 |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3672 | 3 | No | — |

### heart-everyday

Who interprets pictures of arteries supplying the heart?

An exploratory anatomical paraphrase, not an explicit request for CT. A retrieved CT passage does not establish that CT was intended.

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.0272 | 7 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.2789 | 4 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.0849 | 5 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.0129 | 8 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0845 | 6 | No | — |
| bupa_14429:targeted_public_profile | Yes | None | 0.0000 | — | 0.4154 | 2 | Yes | 2 |
| bupa_11411:targeted_public_profile | Yes | None | 0.0000 | — | 0.4291 | 1 | Yes | 1 |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3768 | 3 | No | — |

### study-exact

MoleMate primary care diagnostic performance referral study

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2668 | 4 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.2261 | 6 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.3658 | 2 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.2743 | 3 | No | — |
| bupa_12291:targeted_publication | Yes | None | 0.0000 | — | 0.0105 | 8 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.2572 | 5 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.1461 | 7 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3808 | 1 | No | — |

### study-everyday

Who helped study a tool that tells family doctors which unusual moles to send to hospital?

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2560 | 5 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.3399 | 2 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.3926 | 1 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.3328 | 3 | No | — |
| bupa_12291:targeted_publication | Yes | None | 0.0000 | — | 0.0539 | 7 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.1606 | 6 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.0275 | 8 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3296 | 4 | No | — |

### relationship-exact

Check 4 Cancer clinical advisor telemedicine

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.1908 | 6 | No | — |
| spire_668:targeted_public_research | No | telemedicine | 1.5117 | 3 | 0.4202 | 1 | Yes | 1 |
| spire_668:targeted_public_relationship | Yes | advisor | 2.3521 | 1 | 0.3253 | 3 | No | 2 |
| bupa_12291:targeted_public_profile | No | cancer | 1.6599 | 2 | 0.2601 | 5 | No | 3 |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0058 | 8 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.2709 | 4 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.1800 | 7 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.3844 | 2 | No | — |

### relationship-everyday

Who advises a business offering remote mole checks?

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.1820 | 5 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.1961 | 4 | No | — |
| spire_668:targeted_public_relationship | Yes | None | 0.0000 | — | 0.2818 | 1 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.2340 | 2 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0117 | 7 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.0952 | 6 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | -0.0349 | 8 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.1988 | 3 | No | — |

### vascular-exact

vascular radiology trials

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2470 | 4 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.2422 | 5 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.2030 | 7 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.2184 | 6 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0082 | 8 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.4239 | 3 | Yes | 3 |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.4713 | 2 | Yes | 2 |
| bupa_11411:targeted_public_research | Yes | vascular, radiology, trials | 3.5765 | 1 | 0.7926 | 1 | Yes | 1 |

### vascular-everyday

Who takes part in studies about blood vessel scans?

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2309 | 7 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.4564 | 2 | Yes | 2 |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.3126 | 5 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.2465 | 6 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.0211 | 8 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.3939 | 3 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.3634 | 4 | No | — |
| bupa_11411:targeted_public_research | Yes | None | 0.0000 | — | 0.6485 | 1 | Yes | 1 |

### broad-research

clinical research

Deliberately broad: related research is not proof of a specific assessment task.

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.2702 | 4 | No | — |
| spire_668:targeted_public_research | Yes | None | 0.0000 | — | 0.3410 | 3 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.4720 | 2 | Yes | 2 |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | 0.2151 | 5 | No | — |
| bupa_12291:targeted_publication | Yes | None | 0.0000 | — | 0.0876 | 8 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.1805 | 6 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | 0.1513 | 7 | No | — |
| bupa_11411:targeted_public_research | Yes | research | 1.1922 | 1 | 0.5435 | 1 | Yes | 1 |

### negative-knee

robotic knee replacement surgery

No reviewed passage establishes this expertise. Any above-threshold result is a false positive for this probe.

| Passage | Expected | Shared normalized tokens | BM25 | BM25 rank | Cosine | Semantic rank | ≥0.40 | RRF rank |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| spire_668:targeted_public_profile | No | None | 0.0000 | — | 0.0964 | 4 | No | — |
| spire_668:targeted_public_research | No | None | 0.0000 | — | 0.2168 | 1 | No | — |
| spire_668:targeted_public_relationship | No | None | 0.0000 | — | 0.0484 | 6 | No | — |
| bupa_12291:targeted_public_profile | No | None | 0.0000 | — | -0.0137 | 8 | No | — |
| bupa_12291:targeted_publication | No | None | 0.0000 | — | 0.1562 | 2 | No | — |
| bupa_14429:targeted_public_profile | No | None | 0.0000 | — | 0.0795 | 5 | No | — |
| bupa_11411:targeted_public_profile | No | None | 0.0000 | — | -0.0099 | 7 | No | — |
| bupa_11411:targeted_public_research | No | None | 0.0000 | — | 0.1295 | 3 | No | — |

## Reproduce

From `Local Doctor Ranking/` after the local embedding model has been cached:

```powershell
node expert/evaluation/hybrid-language.cjs --freeze-only
node expert/evaluation/hybrid-language.cjs
```

The runner refuses remote model downloads. The frozen query/source manifest and complete machine-readable report are saved in the ignored expert cache; this document contains every query and every passage score. No production index is read or overwritten.
