# AI response latency — 2 October 2026

The explanation is a two-call pipeline: DeepSeek writes a bounded, source-cited paragraph, then a separate call checks that paragraph against the saved evidence. A failed draft can be repaired once and must pass the same checks. The chain retains its 40-second deadline, 15-second individual request limit, and disabled SDK retries. DeepSeek reasoning was already disabled.

## Measurements

`node demo/scripts/benchmark-ai.cjs` uses the generic directory query `Knee replacement near SW5 accepting Bupa`, the first two returned public profiles, and the existing server-side OpenRouter key. It prints only timing, provider and token-count metadata. Each run intentionally makes paid generation/check requests. `--remote` measures the hosted endpoint and cache instead. Set `DOCMAP_BENCHMARK_ORIGIN` to target another ready preview.

| Sample | Draft | Independent check | Total | Output tokens (draft) |
| --- | ---: | ---: | ---: | ---: |
| Before, profile 1 | 6.94 s | 1.59 s | 8.54 s | 263 |
| Before, profile 2 | 5.92 s | 1.73 s | 7.64 s | 238 |
| Tuned routing, profile 1 | 6.42 s | 1.61 s | 8.05 s | 252 |
| Tuned routing, profile 2 | 5.15 s | 2.93 s | 8.09 s | 234 |

All four explanations passed validation and used Baidu through OpenRouter. This small sample does **not** establish a meaningful generation-speed improvement. It shows writing dominated these requests; it cannot separate provider queueing, network, prefill and decoding. The draft was already only about 250 output tokens, so reducing its token ceiling would not by itself improve speed. The patient paragraph and independent evidence check are preserved.

## Changes

- Keep `deepseek/deepseek-v3.2`. Prefer throughput for writing/query interpretation and latency for the short source check. Retain strict structured output and `data_collection: deny` on all provider routes.
- For this DeepSeek model, cap provider token rates at $0.60 per million input tokens and $1.70 per million output tokens. No premium model or unbounded speed variant is selected. Other explicitly configured models retain their own existing pricing behavior.
- OpenRouter performance preferences are best effort, not latency guarantees. Documentation: https://openrouter.ai/docs/guides/routing/provider-selection
- Show the already available, cited **Profile summary** immediately on reveal. Clearly label it, keep the personalisation status visible, and replace it only after generated wording passes all checks. If no valid summary/citations exist, retain the skeleton. No unverified AI tokens are streamed.
- Add content-free `Server-Timing` headers for interpretation, search, explanation, draft/check calls, cache and concurrent deduplication. No profile text, query text or identifiers enter these diagnostics.
- Show richer animated/clickable examples for procedure + postcode + insurer, condition-specific procedure + city, and procedure + radius + town. They use one shared source of example text, wrap on mobile, pause for reading and respect reduced motion.

## Validation

162 tests pass, including strict explanation grounding/repair, safe timing aggregation, immutable snapshots, pending-request isolation, example parsing and animation lifecycle. Local browser checks verified the full postcode/insurer prompt fits at 320px, immediate evidence appears while the AI is pending, then the checked AI paragraph replaces it. The knee example returned three real consultants with all requested filters. No browser errors were recorded.

Further substantial generation gains need a controlled comparison of another eligible serving endpoint or model. Search-side CPU/retrieval caching is a separate opportunity; it would not shorten the remote explanation-writing call measured here.

## Hosted verification

Railway deployment `172691eb-bc5d-4f44-8502-275c400fb456` is healthy with all 4,031 records. All three public asset hashes match the tested source. The hosted benchmark returned three matches in 3.36 s (interpretation 1.61 s; retrieval/result assembly 1.46 s). Two fresh, validated explanations took **5.21 s and 3.27 s**, with draft/check timings of **4.66/0.41 s** and **2.82/0.40 s**. Reopening their exact saved snapshots took **66 ms and 29 ms**. Both were actual OpenRouter AI results with no repair or evidence fallback. These hosted figures are separate from the local-client before/after comparison above and are not a controlled percentage improvement.

The live animated examples and search were browser-verified; local desktop, 390px and 320px layouts had no horizontal overflow. The hip/radius example returned eight real consultants, all shown within ten miles. The generic endometriosis example is covered by local parsing and existing real-record verification; this update does not repeat the previously blocked diagnostic transmission.
