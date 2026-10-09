# R2 retrieval delta review — 8 October 2026

**Decision: R2 remains withheld pending relevance and acceptance-gate review. R1 is the protected preview candidate; no existing-live adoption is established.** No ranking weights, labels, or source-type eligibility rules were changed in response to the measured losses.

## Measured change

All four corpora used the same current search/brief implementation and 98 untouched cases in BM25, semantic and hybrid modes. R2 adds no critical failed checks and no first-page source-support loss. It nevertheless loses a known top-20 reference in one hybrid case and has two additional semantic case losses versus R1.

| Case and mode | R1 → R2 | Interpretation |
|---|---|---|
| r2-cardiac-ct-03, hybrid | Dr Neghal Kandiyil rank20 →21; recall100% →50% | A small retrieval-fusion boundary swap with Dr Amar Paul Mann (21 →20). |
| r2-skin-lesion-images-01, semantic | Dr Paul Norris rank17 →30; recall100% →50% | Newly projected condition terms improve other candidates’ topic retrieval. Hybrid recall is unchanged. |
| r2-relationship-review-02, semantic | Mr Per Hall rank20 →34; recall100% →0% | Newly projected condition terms improve other candidates’ topic retrieval. Hybrid retains the reference at rank20. |

Round-two hybrid recall falls79.17% →77.08%; semantic recall falls77.08% →70.83%. BM25 remains75.00%, and source support at five remains79.17%. Main/final aggregate metrics are unchanged from R1. All references remain searchable with unchanged identity mapping.

## Source and scoring explanation

For the hybrid20/21 boundary swap, both candidates retain exactly the same requirement-matrix statuses/evidence IDs, clinical score10, and their own unchanged context scores. Kandiyil receives no added passages. Mann receives language/service context, but none directly matches the brief or wins a qualifying semantic query. His strongest new service match is0.288, below the0.4 threshold. The final relevance scores change by less than0.003, reversing a small retrieval-fusion tie. The precise split between corpus-wide lexical normalization and semantic candidate ordering was not separately ablated; this is not evidence of a changed clinical qualification.

A separate cardiac example, Dr Konstantinos Vakalis, rises19 →6 after source-supported Coronary Artery Disease / Ischaemic Heart Disease entries are projected. His coronary-topic requirement changes from potential to documented listed interest, with clinical score10.3 →11.9; activity and diagnostic-study requirements remain unknown. His new Coronary Artery Disease passage scores0.991 for the matching semantic topic versus0.488 for prior evidence. He was already within the top20, so this does not itself explain the boundary loss.

The larger skin semantic movements are driven by newly projected literal Skin Cancer / Melanoma condition entries, retained as clinical-interest with listed-condition-not-performed-care and stated-interest qualifiers. The same Skin Cancer text scores0.731 against Skin lesions, above the inspected entrants’ earlier best passages (approximately0.328–0.660). Examples include Dr Marie-Louise Daly61 →9, Dr Susie Morris36 →10 and Dr Sundus Yahya84 →11. Their clinical scores remain5; this is changed retrieval ordering among candidates with existing clinical support, not an invented stronger activity claim.

The probe used the completed R2 MiniLM vectors and identical local query embeddings. No inspected language/service passage became a scored clinical-query winner. Face-to-face consultations sometimes wins the non-specialist-software context comparison but scores0.369, below the0.4 threshold, so it contributes nothing there. No metadata overweight or activity promotion was found in these reviewed deltas.

## What remains unresolved

These are source-supported topic gains alongside frozen known-anchor recall losses. The added candidates have not been adjudicated as better, equivalent or worse choices for the complete clinical brief. The fixed reference lists are not an exhaustive relevance gold standard, but their unchanged acceptance gates still fail. It would be misleading either to call R2 a no-regression pass or to infer that its new source facts are erroneous solely because anchor rank changes.

Retain R1 for the protected preview and preserve R2 with its exact manifest/corpus fingerprint. Review the newly retrieved candidates against the full brief and predeclare a broader relevance evaluation before reconsidering R2. Do not tune weights, remove correctly attributed conditions, or rewrite frozen labels merely to recover these anchors.

Detailed private artifacts: r2-ranking-losses.json, r2-source-delta-review.json and r2-semantic-winner-review.json. Public repair-specific findings are summarized in REPAIR_SPECIFIC_CHECKS.md; raw diagnostics remain private. This review does not waive the absolute search failures documented in PREEXISTING_FAILURES.md.
