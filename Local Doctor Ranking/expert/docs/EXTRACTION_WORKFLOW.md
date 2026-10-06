# Bounded evidence extraction and review

`expert/extraction.cjs` prepares candidate-owned, exact-span extraction proposals from selected professional source passages. It is an operator preparation tool, separate from live search. It defaults to DeepSeek through OpenRouter and makes **no request unless `live:true` or `--live` is supplied**.

At this checkpoint the workflow has passed 28 offline tests with controlled model responses. **A real DeepSeek v2 job produced two exactly anchored cached proposals, but neither passed the independent acceptance review and neither was indexed.** The earlier live v1 attempt failed exact quote/offset validation and remains recorded below. Existing source-reviewed additions remain the manually prepared entries in `enrichments.cjs`. This is not a corpus-wide automated enrichment pipeline or a demonstrated improvement in extraction quality.

## Select the source material

Start with bounded cardiac-imaging or skin-lesion pathways where the recorded narrative contains activity or context that deterministic extraction misses. Supply one to eight verbatim passages, covering at most three professionals and 20,000 source characters. Each passage is limited to 5,000 characters.

Select original source-field or freshly checked public-page text. Do not use an existing reviewed paraphrase as though it were an original quotation. Do not include project notes, recruitment event details, patient records or confidential assessment material. Identity must come from the existing source review; the model receives source aliases rather than candidate or source-record identifiers.

The private input JSON is an array, or an object containing a `sources` array. Each entry needs:

- `id`, `candidateId`, `sourceRecordId` and `field` from the selected source/candidate mapping.
- `text` and `textKind: "verbatim"`.
- An HTTPS `sourceUrl` without embedded credentials, and an optional `sourceLabel`.
- Separate `dates.sourceDate`, `dates.observedAt` and `dates.mergeDate`, where actually recorded.
- Complete `qualifiers` and `limitations` arrays, where relevant.

Only these fields are retained for the extraction job. Project notes, event data, review statuses and additional input fields are not transmitted. The raw selected text itself still needs the operator's professional-data scope check.

## Prepare or use a cached job

From `Local Doctor Ranking/`:

```powershell
node expert/extraction.cjs --input expert/.cache/selected-source-passages.json
```

Without `--live`, this validates the bounded input and returns a matching cached job or `not-run`. The console prints counts and a cache key, not source text or credentials. The ignored default cache is `expert/.cache/extraction/`.

For an explicitly intended live extraction, the same command accepts `--live`. Credentials are loaded privately from the existing environment files only on that path. The model defaults to `deepseek/deepseek-v3.2`; a deliberately configured `OPENROUTER_EXTRACTION_MODEL` overrides it. The request has a 15-second deadline, no automatic retry and a bounded output budget. Timeout, refusal, truncation or invalid output yields no cached proposal.

The cache key covers the **complete selected source content and attribution**, dates, qualifiers, limitations, model and extractor version. A source correction, identity reassignment or model/version change therefore requires a different job. Identical concurrent jobs share one request within a process. Existing cache entries are revalidated against the supplied canonical sources; corrupted entries fail closed and are preserved for investigation.

## What a proposal can say

The model proposes a kind of assertion, its subject and exact quotation. The server requires one unique, exact occurrence in the owned source and computes its JavaScript UTF-16 start/end offsets. It does not ask the model to count characters. Repeated or absent quotations fail; there is no fuzzy matching, case folding or whitespace repair. Optional offsets from a local caller are checked against the computed span rather than trusted. Allowed kinds cover clinical activity, research activity, received training, qualifications, relationships, populations, settings and historical dates. Activity, modality, condition, population, setting and date attributes must be literal substrings of the quoted span.

Unknown source aliases, invented quotations, wrong offsets, extra fields, duplicate claims and attributes not found in the quote are rejected. Canonical candidate/source identities and source metadata are restored from the caller-owned input. The model cannot write registration, current-practice, availability, qualification, independence, approval or recruitment status.

These checks establish text attribution, **not the correctness of the model's interpretation**. A real quotation can still describe received training, a study's population or another person's work. Every returned item remains `proposal-requires-source-review`. An empty proposal list is a valid outcome, not evidence that the professional lacks expertise.

## Review and prepare an enrichment

Use the exported `reviewProposal(job, proposalId, review)` function after independently reading the supporting primary page. The review must explicitly identify a reviewer and record:

- `actor: "user"`, `decision: "accept"`.
- `identityChecked`, `sourceChecked` and `subjectChecked`, each `true`.
- An `identityBasis`, a `public-page-review` or `publisher-page-review` method and the actual `observedAt` date.
- The current original `sources`, an allowed conservative evidence `type` and explicit source/engagement `limitations`.
- Optionally, a bounded human-reviewed `summary`. Otherwise the exact quotation is retained as text.

For example, in an operator script:

```javascript
const { reviewProposal } = require('./expert/extraction.cjs');
const accepted = reviewProposal(job, selectedProposalId, {
  sources: currentSelectedSources,
  actor: 'user', decision: 'accept', reviewer: reviewerName,
  identityChecked: true, sourceChecked: true, subjectChecked: true,
  identityBasis: reviewedIdentityBasis,
  method: 'public-page-review', observedAt: actualReviewDate,
  type: 'clinical-practice', limitations: reviewedLimitations
});
```

Unclear subjects must be resolved through a separately reviewed source passage. Received-training proposals cannot be promoted to clinical practice; study/organisation context cannot be accepted as a professional's performed clinical/research activity or relationship. Source changes invalidate acceptance of the old job. Current practice, assessor approval, participation and independence assertions are prohibited in the enrichment text.

The returned object is compatible with the existing `buildCorpus(..., {enrichments})` input and preserves the exact quote, source record, dates, review limitations, source-content hash, model/version and extraction span. **The function does not append to `enrichments.cjs`, write to Supabase, change a candidate or rebuild the index.** Review the object in code, add only accepted entries to the reviewed enrichment collection, then rebuild and run the affected source/retrieval regressions before publishing it.

The current index consumes accepted text and evidence type using its existing normalizer. Proposed attributes are retained in review provenance; they do not silently override live attribute extraction or requirement outcomes. Review files and cached proposals are local operator records, not cryptographically authenticated approval records.

## Verification

```powershell
node --test expert/extraction.test.cjs
```

The 28 offline cases cover cache reuse/invalidation, duplicate-call suppression, exact source spans including Unicode offsets and ambiguous repeated quotes, owned identity restoration, private-field omission, corrupt caches, failure without storage, explicit human review, stale sources and prohibited promotions. Quote rejection diagnostics retain only a reason and safe character lengths, never source text or identity values. The real v2 job and its offline cache reuse were also checked as described below. Acceptance of useful, correctly attributed extracted facts and validation of any resulting enrichment remain separate work; the two observed proposals do not establish that outcome.

### Live attempt ledger

| Attempt | Input and route | Observed outcome | Consequence |
| --- | --- | --- | --- |
| Initial v1 job, 6 October 2026 | Two selected reviewed public-source excerpts, 142 characters total, concerning dermoscopy and vascular-radiology research; existing automatic OpenRouter routing to DeepSeek | The model responded within the request contract, but the combined exact-quote/offset validator rejected the result. The response was not retained as a valid proposal. | Zero cached proposals and no corpus changes. This is a failed attempt, not a successful extraction. |
| V2 job, cached 6 October 2026 at 17:46:59 UTC | The same two excerpts; `deepseek/deepseek-v3.2` through existing automatic OpenRouter routing | Two proposals passed exact unique-quote and attribute anchoring; source IDs, candidate IDs, URLs, dates, qualifiers and limitations were preserved. | Cached for review; **zero accepted or indexed** after the independent semantic/subject review below. |

The first rejection did not preserve enough diagnostic detail to attribute the fault solely to quote copying or offset arithmetic. V2 removes model offset arithmetic and records a safe reason for any subsequent anchoring failure. It changes neither exact-text support nor the human-review boundary. No further paid call was made by the implementation tests.

The v2 cache key is `34ddff709c24cf3759a7df035c04590bf764dc72e8c400439c3a573560d046b3`; its source fingerprint is `f71a537b35e6b0bdbaf77e9bca9911ca664e60e60c9775291fdfb5b244ae9d24`. A separate offline invocation returned `cacheHit:true` with **zero model calls**, and reproduced both proposals exactly. Their spans are `[0,100)` and `[0,42)` respectively. Candidate/source bindings were checked against the corrected corpus's saved evaluation records; they agreed.

### Independent review of the two real proposals

| Source passage | Anchoring / attributes | Interpretation and subject | Acceptance |
| --- | --- | --- | --- |
| Kandiyil's reviewed vascular-radiology research/trial excerpt | The complete 100-character quotation and the literal activity value are source-faithful; metadata and limitations are intact. | The model labels the research/trial statement `clinical-activity`, which is an unsuitable category for that evidence, and returns `subject: unclear`. No individual trial task or current practice is established. | **Not accepted.** It needs a correctly classified, independently reviewed research assertion with sufficient subject context. |
| Norris's reviewed dermoscopy/skin-cancer diagnosis excerpt | The complete 42-character quotation, dermoscopy modality, skin-cancer condition and diagnosis activity are literal source substrings; metadata and limitations are intact. | `clinical-activity` is compatible with the excerpt's content, but the fragment itself has no named subject and the model returns `subject: unclear`. The existing manually reviewed page identity does not make this proposal automatically accepted. | **Not accepted.** The review function refuses unclear subjects; a fuller source passage and source review are needed. |

This review demonstrates why exact quotation checks and human interpretation checks are separate. The cache mechanism works; two source-faithful strings are not two validated new facts. No identity, review status, live claim or search-index entry was changed, and no extra model request was made for the independent review.
