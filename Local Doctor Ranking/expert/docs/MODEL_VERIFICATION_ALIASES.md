# DeepSeek short-alias verification round

Round: `aliases-v1`. Recorded 2026-10-06T16:56:03.702Z. Model: `deepseek/deepseek-v3.2` through OpenRouter.

**Outcome: 0/3 distinct briefs passed generation, canonical source-ownership validation and the independent support check within the measured deadline.**

This is one fresh round after replacing long internal identifiers with request-local aliases. It permits exactly one attempt per brief and at most six model calls in total, with no automatic retries. The earlier local result remains **1/3 distinct briefs verified**; its failures, timings and attempt caps are unchanged. See [the earlier report](MODEL_VERIFICATION.md).

This round recorded 3 model-call attempts; 0 pending/interrupted attempt reservations remain. Only four freshly reviewed public professional identities and public-source passages were used. The briefs are fictional. No Supabase cache, project notes or private assessment dossier was read. Local MiniLM preparation forbids remote model downloads.

| Brief | Outcome | Total | Generation | Independent check | Completion tokens: generation / check |
| --- | --- | ---: | --- | --- | --- |
| cardiac-clinical-comparison | Sourced fallback | 15.01 s | 15.01 s · AbortError | Not reached | — / — |
| dermoscopy-study-evidence | Sourced fallback | 15.00 s | 15.00 s · AbortError | Not reached | — / — |
| outside-specialist-setting-relationship | Sourced fallback | 15.01 s | 15.01 s · AbortError | Not reached | — / — |

Received structured generation responses: 0. Independent support checks reached: 0. Generation aborts: 3. The three-brief live criterion remains unmet. This round does not demonstrate a latency improvement; no extra attempts were made.

## What changed and what stayed fixed

Short candidate/evidence aliases reduce identifier copying in the model wire format. Unknown aliases, duplicate sections, aliases owned by another candidate and full-ID spoofing are rejected. The response is restored to canonical IDs and validated before an independent support check. Both model calls retain the same source text, quotes, dates, qualifiers, full review limitations, current-practice gaps and requested scope. Both calls share the existing 15-second abort signal. Model/provider, paragraph bounds and support standards are unchanged.

This uncontrolled three-brief round cannot establish the cause of any latency difference. Provider queues, routing and response content can vary; no improvement percentage is claimed. A sourced fallback is an unsuccessful AI verification, even when the underlying search and evidence presentation remain usable.

## Separate bounded JSON-mode diagnostic

At 2026-10-06T17:00:15.074Z, one further public-source-only Norris brief tested JSON-object transport with the exact expected schema described in the prompt. The diagnostic retained production ownership validation, the independent support check and the shared 15-second deadline. The production strict-schema configuration was not changed.

The single generation attempt returned no model result before the deadline: **15.022 seconds total**, with 15.020 seconds recorded for generation. The transport recorded the error name `Error` and no HTTP status; the application returned its sourced fallback. No independent support-check call was reached. There was no retry. This result does not establish whether constrained schema handling contributes to latency, and it does not satisfy another distinct-brief verification.

The diagnostic is recorded by `expert/evaluation/probe-json-mode.cjs`, with its immutable local artifact at `expert/.cache/model-json-mode-probe.json`. Together with the failed alias round, it leaves the three-brief release criterion unmet. No additional paid probes were made by this report.

## cardiac-clinical-comparison

Fictional brief: We are assessing software that analyses cardiac CT scans to support assessment of coronary artery disease in adults. Compare UK clinicians who could help examine the clinical relevance of its outputs and the consequences of incorrect results. Current clinical practice is essential; regulatory experience is optional.

Outcome: sourced fallback; criterion failed. The AI wording could not be verified in time. The sourced evidence remains available; you can retry.

Checks: realDeepSeek=false; generatedSchemaValid=false; separateSupportCheck=false; independentSupportCheckPassed=false; sourceOwnership=true; finalSchemaAndProhibitedClaimChecks=false; withinDeadline=true; noModelAuthoredReviewState=true.

Compare the documented evidence and the gaps against the same brief.

**Dr Neghal Kandiyil**

Dr Neghal Kandiyil's record documents cardiac ct. This makes the profile worth exploring for those parts of the brief; the qualification questions identify what still needs checking.
- `evidence-40cd19a9545cf6b63fc3` · clinical-practice · [PHIN consultant-provided profile](https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157) · source date not recorded.

**Dr Sanjay Banypersad**

Dr Sanjay Banypersad's record documents cardiac ct. This makes the profile worth exploring for those parts of the brief; the qualification questions identify what still needs checking.
- `evidence-0dd4d93ec728782503c4` · clinical-practice · [Circle professional profile](https://www.circlehealthgroup.co.uk/consultants/sanjay-banypersad) · source date not recorded.

## dermoscopy-study-evidence

Fictional brief: We are assessing skin-lesion imaging software using dermoscopy in primary care. Find UK clinical expertise to help us examine the evidence behind diagnostic accuracy and how results could affect referrals. Experience evaluating diagnostic studies is preferred. Regulatory experience is optional.

Outcome: sourced fallback; criterion failed. The AI wording could not be verified in time. The sourced evidence remains available; you can retry.

Checks: realDeepSeek=false; generatedSchemaValid=false; separateSupportCheck=false; independentSupportCheckPassed=false; sourceOwnership=true; finalSchemaAndProhibitedClaimChecks=false; withinDeadline=true; noModelAuthoredReviewState=true.

Sourced evidence is available immediately.

**Dr Paul Norris**

Dr Paul Norris's record documents skin-lesion imaging and skin lesions. This makes the profile worth exploring for those parts of the brief; the qualification questions identify what still needs checking.
- `evidence-e75feb4be76f36fc94c2` · clinical-practice · [Spire professional profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/dr-paul-norris-c2720966/) · source date not recorded.

## outside-specialist-setting-relationship

Fictional brief: We are assessing skin-lesion imaging software for use outside a specialist clinical setting by non-specialist users. We need expertise to examine the consequences of missed lesions and what should prompt referral. Research experience is preferred. Manufacturer: Check 4 Cancer. Home-use validation and current practice must be confirmed.

Outcome: sourced fallback; criterion failed. The AI wording could not be verified in time. The sourced evidence remains available; you can retry.

Checks: realDeepSeek=false; generatedSchemaValid=false; separateSupportCheck=false; independentSupportCheckPassed=false; sourceOwnership=true; finalSchemaAndProhibitedClaimChecks=false; withinDeadline=true; noModelAuthoredReviewState=true.

Sourced evidence is available immediately.

**Mr Per Hall**

Mr Per Hall's record documents skin lesions and clinical research. This makes the profile worth exploring for those parts of the brief; the qualification questions identify what still needs checking.
- `evidence-5a8abc8d38428ffdabaf` · clinical-practice · [Spire professional profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/) · source date not recorded.
- `evidence-4ff74f64c286f36be310` · research · [Spire professional profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/) · source date not recorded.

## Audit details

Code SHA-256: `4215d0adb4ab352f7d976ab3482dce2bb3e9477a6369c13f64218a94139365ad`. Corpus: `expert-corpus-v1-c6509a4591b08ddc3448`.

Canonical citations are returned by the application; aliases are confined to individual model requests. Raw structured responses, source snapshots, checks and per-call timings are retained in the ignored local cache at `expert/.cache/model-verification-public-aliases-v1.json`. This report does not certify clinical competence, current practice, availability, formal assessment approval or independence.
