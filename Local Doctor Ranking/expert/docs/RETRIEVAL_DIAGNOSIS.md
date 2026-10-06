# Second retrieval holdout: failure diagnosis

The immutable first report is `evaluation-holdout-round-two-first.json`, evaluated on corpus `expert-corpus-v1-df5d3dceb8c666e65512`. Hybrid recall at 20 was 87.5%, below the 90% gate. This diagnosis does not alter labels, denominators or thresholds. It inspects the saved ranking and a bounded normalization of original source rows; no second embedding run or model-generated relevance labels were used.

All missed known references were searchable and entered **both** retrieval pools. None was absent because of identity quarantine, missing source data or a retrieval cutoff. The problem occurs in reranking, although the implications differ by case.

| Frozen case | Known reference final hybrid rank | Finding |
|---|---|---|
| `r2-cardiac-ct-03` | Banypersad 21; Kandiyil 23 | Explicit coronary artery disease is an additional essential requirement. Several higher results have practice evidence for both cardiac CT and this condition. Banypersad's disease passage is conservatively background/potential; Kandiyil's selected evidence establishes cardiac/coronary CT but not the additional condition explicitly. |
| `r2-complementary-panel-04` | Banypersad 20; Kandiyil 22 | Similar disease-evidence distinction, with additional research and practising-clinician perspectives. Current practice remains unknown, as required. |
| `r2-skin-lesion-images-01` | Norris 16; Hall 40 | Clinical skin evidence contributes approximately the same score for many candidates. Hall's documented skin-image reporting, non-expert diagnostic support and related research do not add relevance when the supplied software-assessment purpose is treated only as context. |
| `r2-relationship-review-02` | Hall 40 | Same skin-context limitation. The manufacturer relationship is retained for investigation; it correctly does not act as automatic exclusion or a clinical relevance bonus. |

## What should improve

Preserve the assessment question in retrieval as well as in the visible brief. Once a clinical requirement exists, the current query selection mostly drops technology/workflow context. The reranker then ignores context rows. That makes an assessment-software brief resemble a general skin directory query, despite useful source evidence for image interpretation and diagnostic support.

A general improvement should distinguish the requested task—assessment, reporting, interpretation, treatment or research—from a condition mention. Context may support relative relevance when connected to the same clinical evidence; it must not become a fabricated qualification or imply that an expert has assessed this exact product. Device applicability should remain a confirmation question. No automatic dermoscopy or other modality requirement should be invented from a generic skin-software brief.

Conservative extraction also loses useful relationships between statements. The cardiac references show that a specific imaging-practice passage and a separate disease-context passage may be weaker than another candidate's directly stated combined practice. Improve safe passage segmentation/classification generally, without assuming that any four reviewed people must always occupy the first 20. Known-reference recall is intentionally a recovery metric, not a complete ordering of clinical suitability.

## What must stay unchanged

Do not boost source IDs, reviewed enrichment flags or names. Do not turn a manufacturer link into relevance or independence approval. Do not erase explicit condition requirements to recover familiar candidates. Keep missing/held references in the denominator, preserve all first reports, and call any subsequent runs on these cases development regressions.

The pack uses 28 fictional conversations but only four source-reviewed reference people across two clinical areas. A future independent benchmark should expand reviewed reference sets and compare the relevance of alternatives, including deliberately unrelated controls and scarce-evidence cases. That would measure useful ordering more directly than repeatedly testing the same four people with fresh wording. This second independent result remains a failed recall gate. Subsequent fixed-pack results and their limits are reported in [the evaluation record](DATA_AND_EVALUATION.md); they do not replace this finding.
