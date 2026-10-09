# Frozen retrieval ablation — 2026-10-08

All runs use the same repair search/brief modules, frozen labels and actual local MiniLM, BM25 and hybrid retrieval. This isolates corpus changes rather than comparing different ranking implementations. No remote model or embedding API is used.

| Corpus | Pack | Mode | Cases | Recall at 20 | Source support at 5 | Failed checks |
|---|---|---|---:|---:|---:|---:|
| baseline | main | bm25 | 42 | 92.86% | 94.29% | 2 |
| baseline | main | semantic | 42 | 92.86% | 94.29% | 2 |
| baseline | main | hybrid | 42 | 92.86% | 94.29% | 2 |
| baseline | round-two | bm25 | 28 | 75.00% | 79.17% | 4 |
| baseline | round-two | semantic | 28 | 75.00% | 79.17% | 4 |
| baseline | round-two | hybrid | 28 | 79.17% | 79.17% | 4 |
| baseline | final | bm25 | 28 | 68.75% | 70.83% | 8 |
| baseline | final | semantic | 28 | 66.67% | 70.83% | 8 |
| baseline | final | hybrid | 28 | 70.83% | 70.83% | 8 |
| r0-safe-20261008-v2 | main | bm25 | 42 | 92.86% | 94.29% | 2 |
| r0-safe-20261008-v2 | main | semantic | 42 | 94.29% | 94.29% | 2 |
| r0-safe-20261008-v2 | main | hybrid | 42 | 94.29% | 94.29% | 2 |
| r0-safe-20261008-v2 | round-two | bm25 | 28 | 75.00% | 79.17% | 4 |
| r0-safe-20261008-v2 | round-two | semantic | 28 | 72.92% | 79.17% | 4 |
| r0-safe-20261008-v2 | round-two | hybrid | 28 | 79.17% | 79.17% | 4 |
| r0-safe-20261008-v2 | final | bm25 | 28 | 68.75% | 70.83% | 8 |
| r0-safe-20261008-v2 | final | semantic | 28 | 66.67% | 70.83% | 8 |
| r0-safe-20261008-v2 | final | hybrid | 28 | 70.83% | 70.83% | 8 |
| bupa-r1-20261008-v2 | main | bm25 | 42 | 92.86% | 94.29% | 2 |
| bupa-r1-20261008-v2 | main | semantic | 42 | 94.29% | 94.29% | 2 |
| bupa-r1-20261008-v2 | main | hybrid | 42 | 94.29% | 94.29% | 2 |
| bupa-r1-20261008-v2 | round-two | bm25 | 28 | 75.00% | 79.17% | 4 |
| bupa-r1-20261008-v2 | round-two | semantic | 28 | 77.08% | 79.17% | 4 |
| bupa-r1-20261008-v2 | round-two | hybrid | 28 | 79.17% | 79.17% | 4 |
| bupa-r1-20261008-v2 | final | bm25 | 28 | 68.75% | 70.83% | 8 |
| bupa-r1-20261008-v2 | final | semantic | 28 | 66.67% | 70.83% | 8 |
| bupa-r1-20261008-v2 | final | hybrid | 28 | 70.83% | 70.83% | 8 |
| context-r2-20261008 | main | bm25 | 42 | 92.86% | 94.29% | 2 |
| context-r2-20261008 | main | semantic | 42 | 94.29% | 94.29% | 2 |
| context-r2-20261008 | main | hybrid | 42 | 94.29% | 94.29% | 2 |
| context-r2-20261008 | round-two | bm25 | 28 | 75.00% | 79.17% | 4 |
| context-r2-20261008 | round-two | semantic | 28 | 70.83% | 79.17% | 4 |
| context-r2-20261008 | round-two | hybrid | 28 | 77.08% | 79.17% | 4 |
| context-r2-20261008 | final | bm25 | 28 | 68.75% | 70.83% | 8 |
| context-r2-20261008 | final | semantic | 28 | 66.67% | 70.83% | 8 |
| context-r2-20261008 | final | hybrid | 28 | 70.83% | 70.83% | 8 |

## Changes against the frozen baseline

- r0-safe-20261008-v2: 0 newly failing checks; 1 per-case/mode recall or source-support decreases. Full case diagnostics are retained privately.
- bupa-r1-20261008-v2: 0 newly failing checks; 1 per-case/mode recall or source-support decreases. Full case diagnostics are retained privately.
- context-r2-20261008: 0 newly failing checks; 3 per-case/mode recall or source-support decreases. Full case diagnostics are retained privately.

## Incremental changes against the preceding release

- r0-safe-20261008-v2 versus baseline: 0 newly failing checks; 1 per-case/mode recall or source-support decreases.
  - round-two / semantic / r2-skin-lesion-images-01: knownRecallAt20 100.00% → 50.00%.
- bupa-r1-20261008-v2 versus r0-safe-20261008-v2: 0 newly failing checks; 1 per-case/mode recall or source-support decreases.
  - round-two / semantic / r2-cardiac-ct-03: knownRecallAt20 100.00% → 50.00%.
- context-r2-20261008 versus bupa-r1-20261008-v2: 0 newly failing checks; 3 per-case/mode recall or source-support decreases.
  - round-two / semantic / r2-skin-lesion-images-01: knownRecallAt20 100.00% → 50.00%.
  - round-two / semantic / r2-relationship-review-02: knownRecallAt20 100.00% → 0.00%.
  - round-two / hybrid / r2-cardiac-ct-03: knownRecallAt20 100.00% → 50.00%.

## Interpretation

The baseline failure list is retained and is not relabelled as a pass. No newly failing checks means only that those checks did not regress; it does not erase per-case ranking losses listed separately or establish that absolute search acceptance passed. PREEXISTING_FAILURES.md documents the unchanged deterministic interpretation limits and broad-discovery expectation conflicts.
Recall includes frozen references even if missing or held for identity review. Source support at five checks central clinical wording; it is not a clinical gold standard or proof of eligibility, current practice, availability, independence or specialist superiority.
Synthetic briefs are interpreted deterministically. These results do not exercise paid DeepSeek interpretation. Broad ontology coverage and new-population discovery are outside this fixed pack.
Each per-pack report records the corpus checksum, corpus version, scenario fingerprint, actual retrieval diagnostics and semantic/BM25 contribution. Seed embedding caches were verified unchanged; each release index uses its own writable private cache.
