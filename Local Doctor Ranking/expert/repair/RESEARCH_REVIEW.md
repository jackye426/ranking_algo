# Bounded research-role preparation

`research.cjs` reads the two exact ISRCTN files listed in a frozen `backup-manifest.json`, checks their byte counts and SHA-256 hashes, then prepares 12 distinct trial-role cases. It has no network/model access, performs no source or corpus writes, and prints only public registry IDs, recorded role labels and review metadata. Names, contact details, registration values and unrestricted trial records are omitted.

Run with `node expert/repair/research.cjs --source-backup <frozen-source-backup-directory>`. The checked-in `research-cases.json` records the reproducible selection and outcomes; it is a review fixture, not a provider import or clinician roster.

Coverage: the known ethics-reference/GMC-number false match; Public contact; Scientific contact; a later explicit PI that must not promote the first contact; a plain PI role; combined Scientific/Public/PI roles; Public/PI; Scientific/PI; Public/Scientific contact only; generic Contact; institutional-only association; and recruitment-status-only inference.

All 12 real cases are withheld. The parsed role field establishes what the archived parser recorded, but neither literal registry-page role verification nor independent candidate identity review has been completed by this preparation. The derived `principal_investigator` field is deliberately ignored. There is no quota for accepted cases.

A subsequent, separate review of the 12 backed-up literal HTML pages matched the first contact name and role in 11 cases. For `ISRCTN18290337`, the parser's generic `Contact` value was not present in the source role element, which was empty. This is a parser fallback, not a verified role. All 12 pages were reviewed; 11 roles matched, one role was not recorded, and zero candidate attributions were approved. The original preparation fixture remains unchanged so the parsed and literal findings can be distinguished.

`research-repair.test.cjs` uses explicitly synthetic review decisions to exercise eligibility. An explicit role needs source review and an independently corroborated professional identity. Public/Scientific contacts may be retained only as contact-role background; they cannot establish investigator responsibility. Trial topic, institution or recruitment status cannot establish a person's clinical activity, availability, authorship or every trial task. A successful gate produces an **eligible-for-reviewed-role-packet** result, never an automatically verified enrichment or published claim.

Before any real case advances: inspect the literal registry source, corroborate the person against an independent professional identity, record the actual role and relevant dates, retain limitations, and apply the existing human source-review workflow. The source trial and the candidate remain separate until that attribution is reviewed.
