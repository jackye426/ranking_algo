# Broader-data prospective evaluation

This pack was frozen on 8 October 2026 before broader-data retrieval tuning. It measures source-supported discovery, not clinical credentials, regulatory approval, availability, or clinical superiority.

Before any prospective held-out run, protocol v2 amended the review pool from the union top twenty to the union top ten, plus independently reviewed recall anchors. `pool-depth-amendment-v2.json` records the explicit decision and workload evidence; `contract-v1.json` and `freeze-manifest-v1.json` preserve the original bytes and hashes. All briefs, grades, source expectations and thresholds are unchanged. Every scored top-ten result still requires both reviews. Pool-relative nDCG is labelled with its protocol version and must not be compared as if v1 and v2 used the same ideal pool. The prior cardiac, skin and relationship displacements require additional separate case reviews.

Before paired development collection or any held-out run, protocol v3 clarified the plan's answerable-category denominator. A case is answerable only when the complete independently judged union across both releases, all methods and accepted anchors contains at least one grade 2 or 3 candidate. This same eligibility applies to every run, so returning zero results cannot remove a case. Raw metrics, including zero precision for adjacent-only results, remain in all-discovery-case and family summaries. Cases with no useful reviewed candidate are separately reported as insufficient evidence **in the reviewed pool**, and still require faithful interpretation, honest indirect presentation and no unsupported claim. `answerability-amendment-v3.json`, `contract-v2.json` and `freeze-manifest-v2.json` preserve the explicit decision and prior bytes. Briefs, grades and numerical thresholds remain unchanged.

Before any held-out interpretation or retrieval, a separate topic-split audit found one held-out reference reused a development person, source passage and clinical topic. `heldout-topic-split-amendment-v2.json` records the approved replacement of that one question with a distinct topic. The other 63 questions and expectations, all development questions, grades and thresholds are unchanged. The original private pack and `freeze-manifest-before-heldout-split-v2.json` remain preserved. Source-selected reference preparation reviewed 45 proposals independently: 28 accepted references across 26 people and 12 bounded cases; 17 withheld. No ranked results were inspected. Source-reference preparation involved explicit-name exposure, disclosed in the amendment; this is separate from the later name-, identifier-, release- and rank-blind relevance review. Final corpus ownership and exact passages must be rebound and verified before these references support acceptance.

## Frozen artifacts

- `contract.json`: grades, blinded-review rules, denominator definitions, thresholds and contamination policy.
- `development.json`: 32 development briefs, four in each of eight families. Ranking work may use these.
- `freeze-manifest.json`: checksums for the development pack, private 64-case held-out pack, contract and original 98-case files.
- `legacy-contract.cjs`: three old broad-discovery expectation conflicts and eight genuine interpretation-control cases. This is additive documentation. Run and report the original cases unchanged.

The private held-out pack is under the task's `enriched-private/evaluation` directory, outside the repository. Do not disclose its questions or labels to the ranking implementer before the implementation is frozen. Opening failures for development consumes them; preserve their first results and prepare a fresh sealed confirmation set.

The separate `legacy-report.cjs` reads completed original98 reports and adds a disposition table without changing their labels, metrics or pass flags:

```text
node expert/evaluation/enriched/legacy-report.cjs <private-legacy-reports-directory> <new-private-output-stem>
```

`legacy-runner.cjs` executes the original 98 files without editing their expectations. It accepts a new output directory and optional deployment-runtime query vectors:

```text
node --max-old-space-size=8192 expert/evaluation/enriched/legacy-runner.cjs <label> <corpus-or-segments> <cache> <models-root> <new-output-dir> main,round-two,final <optional-linux-query-receipt> <prepared-practices> <expected-release-id>
```

Checkpoints remain explicitly unvalidated until the selected packs finish with unchanged code, model and cache hashes. A partial run never becomes an all-98 result. Prepared queries must match all original pack hashes and the current query-planning modules; an unknown query fails rather than invoking a different local model runtime.

Only the `clarification` check in the three named broad-discovery cases is a documented contract conflict. A citation or other failure in the same case remains an unresolved failure. The eight functional-control cases have their own rows; missing results cannot become passes.

Frozen expectations state what each brief requests. They do **not** assign candidate relevance from a regular expression. Exact source references are private and require independent review before use as recall anchors. Mechanical quote verification is not relevance adjudication.

## Collect actual retrieval runs

Run from `Local Doctor Ranking`, using separate private caches and existing local MiniLM files. A corpus argument accepts either a corpus JSON file or its checksum-verified segment directory. The harness disables network fetches and uses the same current application modules for every corpus.

```text
node --max-old-space-size=8192 expert/evaluation/enriched/harness.cjs collect --pack=<pack.json> --corpus=<corpus-or-segments> --cache=<private-release-cache> --models=<local-model-directory> --label=<release-label> --out=<new-private-run.json>
```

When vectors were generated in the deployment Linux runtime, add `--queries=<verified-linux-query-receipt.json>`. The receipt pins the exact frozen brief pack, query planners, model files, generation batches and Linux runtime. Unknown queries, changed planners or changed model artifacts fail closed; the collector never substitutes Windows-generated query vectors.

Provide `--practice=<prepared-practice-snapshot.json> --release=<expected-release-id>` for the same immutable geography preparation used by the service. The complete practice ownership, source fingerprint, corpus version and release identifier are validated before coordinates are applied. A geographic restriction without this preparation blocks collection; no geocoder is invoked. Paired runs must use identical prepared coordinate entries, with separate corpus/release bindings, so coordinate drift cannot masquerade as an enrichment effect.

The runner records code hashes and rejects a code change during a run. It exercises the application brief/device interpreter, location text extraction, local location resolver, geography filter and documented-only state before collecting BM25, semantic and hybrid top twenty. Geography uses existing source coordinates; there are no per-candidate geocoding calls. The built-in city centres used by this pack resolve offline. Unsupported or unavailable locations remain explicit failures rather than broadening search.

Collection requires a complete, corpus-matched prepared cache and refuses generation during retrieval. Cache and model hashes must remain unchanged across the run. A digest of query vectors permits paired-run equivalence checks. RSS, heap and external-memory peaks and phase snapshots are reported; these are offline process measurements, not evidence of hosted capacity or latency.

This is an offline interpretation/retrieval run. Hosted UI/API workflows, current MDR selection controls, saved projects and optional DeepSeek success/failure remain separate tests. Preparation of candidate coordinates must be completed and versioned before producing the corpus.

Run output includes exact source excerpts and belongs outside Git. Original runs are never overwritten; use a fresh output path for iterations. Do not mutate seed embedding caches. Point each run at its own compatible cache directory.

The run also pins the local MiniLM model files and final vector-cache artifacts. Before adopting an older seed, use `seed-compatibility.cjs` in the intended inference runtime:

```text
node --max-old-space-size=1024 expert/evaluation/enriched/seed-compatibility.cjs <read-only-seed-cache> <verified-corpus-segments> <models-root> <new-private-proof.json> combined
```

This verifies cache completeness and source-segment checksums, matches exact normalized text keys, and re-embeds 24 content-blind deterministic samples. The declared tolerances are cosine at least 0.999 and maximum component difference at most 0.01. Failed receipts remain failures; they cannot be overridden by model-name equality. Diagnose the intended platform/runtime or rebuild the vectors. `individual` varies batch shape; `diagnostic` records ten repeated warm batches and numerical repeatability. Timing from this sample is an estimate, not a complete-corpus preparation benchmark. The lookup corpus supplies exact text only and is not approved as release evidence by this proof.

`prepare-cache.cjs` creates fresh vectors offline in exactly the runtime's normalized-text order and batches of 48. Its receipt pins input segments, implementation, model files and every cache artifact. It also retains a private deterministic sample with the complete original generation batches: quantized inference can depend on batch shape, so cross-runtime checks must reproduce that shape rather than silently relax tolerances. `derive-cache.cjs` projects a completed, checksum-verified fresh cache onto a second corpus, reusing only identical normalized-text/model keys and recording any newly generated batches. It never modifies the seed. Before accepting deployment reuse, verify the fresh sample in the deployment runtime; a locally successful generation alone is not that proof.

The primary prospective comparison uses the safe R1 and enriched R3 inputs with identical safety holds and field exclusions. A private versioned `comparison-input-selection` receipt pins the final chosen corpora before paired collection; superseded projection versions remain historical. Earlier integrated-R1 and historical-R2 runs retain their original source versions and must not be presented as this controlled comparison.

## Two independent source reviews

Collect the integrated R1 and enriched release with identical module hashes. Then create the private union pool; quote the pipe-separated values when using a shell.

```text
node --max-old-space-size=8192 expert/evaluation/enriched/harness.cjs blind --pack=<pack.json> --runs=<baseline-run.json|enriched-run.json> --corpora=<baseline-corpus|enriched-corpus> --anchors=<approved-anchor-ledger.json> --out=<new-private-pool-directory>
```

The pool contains each candidate in the union top ten from all three methods, in each available source version, plus accepted reference anchors. Identical candidate evidence versions collapse only when exact text and evidence meaning/provenance are equivalent. Names, candidate identifiers, release labels, rank and retrieval mode are hidden. Exact source text, evidence category, qualifications, dates and URLs remain visible. Self-identifying text and source URLs are an acknowledged blinding limitation; never alter a quotation to make blinding appear stronger. Actual rank positions through twenty remain in the private mapping for reference recall; non-anchor candidates ranked eleven to twenty receive no assumed relevance grade.

Give separate reviewers `blind-pool.json` (or its ten-profile `review-batches`) and their own `reviewer-a.json` / `reviewer-b.json` template. Do **not** provide `private-mapping.json`, raw run files or the other reviewer's decisions. Neither reviewer should be responsible for ranking changes.

After recording source relevance, reviewers use the separate `blind-presentations.json` to inspect the product's declared requirement support, reasons and gaps without ranks, retrieval modes or release labels. They record the insufficient-evidence honesty checks for any case whose reviewed union has no useful candidate. An incomplete check blocks scoring; an unsupported positive claim fails the separate safety gate.

For every anonymous profile:

1. Read the full request, refinements and frozen expected meaning.
2. Find owned passages supporting the central request. Match evidence intent: a listed interest can answer an interest query, but cannot establish performed activity.
3. Record grade 3 (direct), 2 (useful with gaps), 1 (adjacent), or 0 (irrelevant), cited `E...` tokens, requested gaps and a concrete rationale.
4. Leave grade `null` for incomplete material or unresolved attribution/meaning. Unknown is never replaced by irrelevant.
5. Judge the observed interpretation separately, including removed constraints and fail-closed behaviour. A safely rejected resolvable instruction is still a usefulness failure; silent constraint loss is critical.

All scored top-ten candidates and the complete ideal pool require resolved dual judgements. Disagreements require a separate source-based adjudication with a rationale and explicit attribution resolution. Missing or disputed rows stop scoring. Do not fabricate completed reviews from keyword rules or copy one review into the other.

## Score and report

```text
node expert/evaluation/enriched/harness.cjs score --pack=<pack.json> --pool=<blind-pool.json> --mapping=<private-mapping.json> --a=<reviewer-a.json> --b=<reviewer-b.json> --anchors=<approved-anchor-ledger.json> --adjudications=<optional-decisions.json> --out=<new-private-report.json>
```

Adjudications map a profile token to `{ "grade": 2, "reason": "...", "attributionResolved": true }`. The two original reviews remain intact. The optional argument may be omitted when there are no disagreements.

The report provides macro precision at five, useful coverage at five, graded nDCG at ten, bounded known-reference recall at twenty, family results and deterministic brief-level bootstrap intervals. Useful coverage prevents a run from reporting perfect precision after returning one candidate while omitting several useful ones. Scarce, genuinely unanswerable cases remain separately identified.

Source-groundedness and retrieval relevance are separate gates. A perfectly quoted passage about adjacent work does not satisfy a specific clinical-activity request. A source gap is not proof that the clinician lacks the requested ability. Every lost reference must still receive case-level review even if aggregate metrics pass.

The prospective reference set is deliberately bounded and small. Report its exact denominator alongside the unchanged legacy source-reference evaluation; do not describe this as exhaustive corpus recall. Review packs use pooled candidates, so nDCG and useful coverage are pool-relative.

## Verification and current status

```text
node --test expert/evaluation/enriched/harness.test.cjs expert/evaluation/enriched/legacy-report.test.cjs expert/evaluation/enriched/seed-compatibility.test.cjs
```

The harness tests frozen hashes, source-preserving blinding, independent review, missing/incorrect citations, unjudged candidates, duplicate results, underfilled shortlists, missing references and reproducible intervals. Passing these tests validates the evaluation machinery; it does not claim the application or broader release passes its relevance gates.

No held-out retrieval run, completed candidate adjudication or release acceptance is claimed by adding this pack. Model availability and the fifteen-second safe fallback budget remain a separate operational gate.
