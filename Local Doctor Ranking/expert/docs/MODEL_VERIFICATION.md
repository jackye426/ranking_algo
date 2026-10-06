# DeepSeek verification

Original round recorded 2026-10-06T16:17:33.804Z; later diagnostic and hosted observations are identified separately below. Model: `deepseek/deepseek-v3.2` through OpenRouter.

**Release criterion: not met — 1/3 distinct briefs have a fully verified response within the 15-second pipeline deadline.**

Later bounded checks are preserved in [the short-alias and JSON-mode diagnostic report](MODEL_VERIFICATION_ALIASES.md). The alias round verified 0/3 briefs; a single JSON-mode diagnostic also reached the deadline without a model result. These checks do not erase the earlier results below or satisfy the release criterion. Production strict-schema validation and independent support checking remain in place.

A further [instrumented full-payload probe](AI_LATENCY_DIAGNOSIS.md#full-payload-automatic-routing-probe) used existing automatic routing and internal streaming on the same three public-source briefs. It verified **0/3**: all three exhausted the generation budget and none reached the independent checker. Header delays and incomplete/no-content streams are now recorded, but the underlying routing/prefill/generation cause remains unresolved. No production provider or deadline changed, and no unverified wording was displayed.

The original round below is a live generation-and-grounding check on four source-bound public professional records and three fictional, non-confidential briefs. It is not a full-directory retrieval evaluation or a clinical qualification decision.

| Scenario | Outcome | End-to-end time | Generator / independent check |
| --- | --- | --- | --- |
| cardiac-clinical-comparison | Sourced fallback | 15.03 s | expert_evidence_explanation: 15.02 s (Error) |
| dermoscopy-study-evidence | Sourced fallback | 15.02 s | expert_evidence_explanation: 15.02 s (Error) |
| outside-specialist-setting-relationship | Sourced fallback | 15.03 s | expert_evidence_explanation: 15.03 s (Error) |

Original round: latest attempts 0/3; distinct briefs with an earlier or current verified response 1/3. That round recorded 11 public-only model call attempts. Later diagnostics and hosted requests are separate observations, not included in that count.

## Hosted guide workflows

Three fixed guide briefs were run against deployment `22a98893-1b58-4232-b807-39dc4b7d20fe`, using the full professional corpus and selected server-owned evidence. All three explanation requests returned the sourced fallback; **0/3 counted as validated DeepSeek explanations**.

| Guide pathway | Explanation outcome | End-to-end time, including network overhead |
| --- | --- | ---: |
| Cardiac CT | Sourced fallback | 15,035 ms |
| Dermoscopy and study evidence | Sourced fallback | 5,799 ms |
| Outside-specialist setting and relationship | Sourced fallback | 15,085 ms |

The shorter request was rejected before the deadline, but the hosted fallback metadata does not identify whether schema, ownership, prohibited-claim or independent-support validation caused the rejection. The longer requests are consistent with the shared 15-second deadline; their precise upstream phase is also unknown. These observations do not justify attributing every failure to model latency. Source evidence remained available, and no unchecked model wording was accepted.

The hosted source and project workflows were verified separately. Their success does not satisfy the model-explanation criterion. Full results and the final brief-correction deployment's pending hosted checks are recorded in [hosted verification](DEPLOYMENT_VERIFICATION.md); raw workflow observations are in the ignored `expert/.cache/hosted-workflow.json`. All original and later unsuccessful attempts remain recorded.

## Source boundary and interrupted preliminary check

The first sandbox connection attempts returned connection errors and sourced fallbacks. A subsequent approved escalation was interrupted immediately when a separate automatic-review restriction was received; it produced no received model result, but the first request may already have been transmitted. That configuration was not retried. The original verification script subsequently used only fresh public-page evidence and public-profile identity, with a runtime guard against other source passages. The user later explicitly authorised selected professional source excerpts for OpenRouter/DeepSeek; the separately reported hosted workflows use that authorised scope.

## Method

- Build a small corpus only from freshly reviewed public profiles and existing manually reviewed public enrichments for Kandiyil, Banypersad, Norris and Hall. No Supabase rows or cache fields are read by this verification script. Local legacy anchor labels are replaced by public-source identifiers before model input.
- Use actual BM25 and the existing local all-MiniLM-L6-v2 embeddings to retrieve evidence and construct requirement matrices. The small-corpus cache is separate from the full index.
- Call the production createExpertAI pipeline: one DeepSeek generation followed by a separate DeepSeek support check, sharing its 15-second deadline. Provider responses, schema checks, source ownership and timings are recorded.
- Distinguish reviewed source summaries from exact quoted passages; current practice, availability, formal assessor approval and independence are not established by a professional profile.
- Keys are loaded privately through dotenv; logs contain no key, authorisation header or confidential dossier information.

## Concrete changes and remaining blocker

The first public run found duplicate sections for one candidate and a verifier timeout. The next version added exact JSON-schema candidate cardinality, shorter paragraphs, lower output budgets and explicit limits on historical coauthorship. A final revision selected latency routing for expert calls and removed redundant checker context while retaining cited passages, their source dates, scope qualifiers, full reviewed-source limitations, requirements and gaps. Independent verification and the shared 15-second deadline were retained throughout.

OpenRouter documents `sort: latency` as preferring low-latency providers; the expert path now uses it while retaining the existing privacy and maximum-price controls. [Official provider routing documentation](https://openrouter.ai/docs/guides/routing/provider-selection).

A separate unauthenticated OpenRouter models request returned HTTP 200 in 169 ms. This confirms gateway connectivity, not inference speed. The unsuccessful final calls timed out in the generation path; the observations cannot separate provider queues, routing overhead and model execution.

The three-brief release criterion remains blocked unless all three have a verified response. No automatic retry loop, longer deadline, weaker support check or different model is substituted.

## Results

### cardiac-clinical-comparison

The example below passed in an earlier attempt. The most recent attempt timed out and displayed the sourced fallback.

Fictional brief: We are assessing software that analyses cardiac CT scans to support assessment of coronary artery disease in adults. Compare UK clinicians who could help examine the clinical relevance of its outputs and the consequences of incorrect results. Current clinical practice is essential; regulatory experience is optional.

Review focus: Distinguish documented imaging experience without inferring current activity, regulatory competence, or a winner.

Outcome: **Verified model response**. Provider reported by the application: `deepseek`.

Both candidates have documented expertise in cardiac CT, the essential modality. Dr Kandiyil is a radiologist with additional research involvement, while Dr Banypersad is a cardiologist, representing different clinical viewpoints. For both, the available evidence is sparse and does not confirm current practice, specific focus on coronary artery disease in adults, UK location, or any medical-device assessment experience. These are critical gaps that must be addressed through direct questioning.

**Dr Neghal Kandiyil**

Dr Kandiyil’s profile documents cardiac coronary CT experience (evidence-40cd19a9545cf6b63fc3) and an active research interest in vascular radiology (evidence-74d7ec67475dcdaee6b8). This provides a direct, documented foundation in the essential modality. However, the evidence does not establish current clinical practice, specific experience with coronary artery disease in adults, UK location, or any medical-device assessment work. The research involvement suggests a potential, cautious relevance to evaluating new technologies, but the scope and nature of that research are undefined. The most material unknowns are the specific patient population, current activity, and regulatory experience, all of which must be confirmed.

Supporting evidence:
- `evidence-40cd19a9545cf6b63fc3` · clinical-practice · targeted_public_profile · reviewed source summary · [Source](https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157). Source date: not recorded.
- `evidence-74d7ec67475dcdaee6b8` · research · targeted_public_research · reviewed source summary · [Source](https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157). Source date: not recorded.

**Dr Sanjay Banypersad**

Dr Banypersad’s hospital profile documents practice in a cardiac CT service (evidence-0dd4d93ec728782503c4), providing direct, documented expertise in the essential modality. As a consultant cardiologist, his specialty is meaningfully distinct from radiology, offering a different clinical perspective on coronary disease assessment. The evidence does not establish current practice, specific focus on coronary artery disease in adults, UK location, or any device assessment experience. The most material unknown is whether his CT practice involves the interpretation and assessment of coronary artery disease in the adult population relevant to the software's intended use.

Supporting evidence:
- `evidence-0dd4d93ec728782503c4` · clinical-practice · targeted_public_profile · reviewed source summary · [Source](https://www.circlehealthgroup.co.uk/consultants/sanjay-banypersad). Source date: not recorded.

Checks: realDeepSeek=true; separateSupportCheck=true; independentSupportCheckPassed=true; sourceOwnership=true; finalSchemaAndProhibitedClaimChecks=true; withinDeadline=true; noModelAuthoredReviewState=true.

### dermoscopy-study-evidence

Fictional brief: We are assessing skin-lesion imaging software using dermoscopy in primary care. Find UK clinical expertise to help us examine the evidence behind diagnostic accuracy and how results could affect referrals. Experience evaluating diagnostic studies is preferred. Regulatory experience is optional.

Review focus: Keep the historical MoleMate trial contribution distinct from current practice or formal regulatory assessment.

Outcome: **Fallback / verification did not pass**. Provider reported by the application: `evidence`.

Sourced evidence is available immediately.

**Dr Paul Norris**

Dr Paul Norris's record documents skin-lesion imaging and skin lesions. This makes the profile worth exploring for those parts of the brief; the qualification questions identify what still needs checking.

Supporting evidence:
- `evidence-e75feb4be76f36fc94c2` · clinical-practice · targeted_public_profile · reviewed source summary · [Source](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/dr-paul-norris-c2720966/). Source date: not recorded.

Application notice: The AI wording could not be verified in time. The sourced evidence remains available; you can retry.

Checks: realDeepSeek=false; generatedSchemaValid=false; separateSupportCheck=false; independentSupportCheckPassed=false; sourceOwnership=true; finalSchemaAndProhibitedClaimChecks=false; withinDeadline=true; noModelAuthoredReviewState=true.

### outside-specialist-setting-relationship

Fictional brief: We are assessing skin-lesion imaging software for use outside a specialist clinical setting by non-specialist users. We need expertise to examine the consequences of missed lesions and what should prompt referral. Research experience is preferred. Manufacturer: Check 4 Cancer. Home-use validation and current practice must be confirmed.

Review focus: Do not infer home-use validation. Surface the recorded advisory relationship as a review question, not independence or a conflict determination.

Outcome: **Fallback / verification did not pass**. Provider reported by the application: `evidence`.

Sourced evidence is available immediately.

**Mr Per Hall**

Mr Per Hall's record documents skin lesions and clinical research. This makes the profile worth exploring for those parts of the brief; the qualification questions identify what still needs checking.

Supporting evidence:
- `evidence-5a8abc8d38428ffdabaf` · clinical-practice · targeted_public_profile · reviewed source summary · [Source](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/). Source date: not recorded.
- `evidence-4ff74f64c286f36be310` · research · targeted_public_research · reviewed source summary · [Source](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/). Source date: not recorded.

Application notice: The AI wording could not be verified in time. The sourced evidence remains available; you can retry.

Checks: realDeepSeek=false; generatedSchemaValid=false; separateSupportCheck=false; independentSupportCheckPassed=false; sourceOwnership=true; finalSchemaAndProhibitedClaimChecks=false; withinDeadline=true; noModelAuthoredReviewState=true.

## Original public-only attempt history

| Brief | Attempt | Outcome | Total | Generator | Independent check | Code fingerprint |
| --- | --- | --- | --- | --- | --- | --- |
| cardiac-clinical-comparison | 1 | Verified | 12.35 s | 11.32 s | 1.03 s | `22928b47e8` |
| dermoscopy-study-evidence | 1 | Checker timeout/error | 15.02 s | 7.25 s | 7.77 s | `22928b47e8` |
| outside-specialist-setting-relationship | 1 | Validation rejected | 13.27 s | 13.27 s | Not reached | `22928b47e8` |
| cardiac-clinical-comparison | 2 | Generation timeout/error | 15.03 s | 15.02 s | Not reached | `d24d633838` |
| dermoscopy-study-evidence | 2 | Checker timeout/error | 15.01 s | 9.43 s | 5.58 s | `d24d633838` |
| outside-specialist-setting-relationship | 2 | Generation timeout/error | 15.01 s | 15.01 s | Not reached | `d24d633838` |
| dermoscopy-study-evidence | 3 | Generation timeout/error | 15.02 s | 15.02 s | Not reached | `466ddab1de` |
| outside-specialist-setting-relationship | 3 | Generation timeout/error | 15.03 s | 15.03 s | Not reached | `466ddab1de` |

## Manual grounding review

The accepted cardiac comparison attributes CT experience to the correct public profile, distinguishes the recorded radiology and cardiology roles, and leaves current practice, population scope, location and regulatory experience unconfirmed. Its optional-regulatory gap is overemphasised in the older wording; the revised prompt now prioritises essential unknowns. The initial Norris draft overstated coauthorship as diagnostic-study evaluation experience, but it never passed the independent pipeline and was not displayed. The initial Hall draft duplicated the candidate section and was rejected locally. No final Norris or Hall model answer was accepted.

## Limits

Successful support checks are evidence of this small verification run, not a guarantee against all model errors. The separate frozen full-corpus evaluation measures retrieval. Public profile dates are often absent, and historical study contributions do not establish current work or formal regulatory assessment competence. Outreach remains an editable preparation draft and is never sent by this pipeline.

Raw professional evidence, complete structured responses and per-call timings remain in the ignored local cache at `expert/.cache/model-verification-public.json`.
