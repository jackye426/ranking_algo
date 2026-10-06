# Expert Discovery demonstration guide

DocMap helps an assessment team turn a device-specific clinical question into a shortlist it can explain and qualify. The demonstration should show **why a professional's recorded work is relevant, how candidates differ, and what remains to be checked**. It does not select an approved assessor or make a certification decision.

Use fictional, non-confidential assessment briefs. Scarlet is a reference persona, not a customer or partner claim. The patient demo is a separate application.

## Before presenting

Open the separate [Expert Discovery preview](https://docmap-expert-discovery-production.up.railway.app/expert-discovery). Start a new assessment for each pathway below. Use the workspace composer to refine that assessment; Home is for a separate assessment, with an explicit way to resume the current one. **Saved** opens the project's saved evidence, notes and review work. Keep **Documented essentials only** off initially: current practice is commonly unconfirmed, so a strict search may correctly return no candidates. See [UI audit corrections](UI_AUDIT_FIXES.md), [Discovery QA corrections](DISCOVERY_QA_FIXES.md) and [hosted verification](DEPLOYMENT_VERIFICATION.md) for the checks and their limits.

Lead with the sourced discovery, comparison and qualification gaps. Profiles show evidence immediately without a generation request. Optional AI wording is labelled experimental and is not necessary for this demonstration. If deliberately requested, generation and the support check share a 15-second deadline; validation failure leaves the sourced evidence available. The earlier hosted explanation round was 0/3 for validated wording. This reliability work is deferred, not passed; the full [Friendli verification report](FRIENDLI_VERIFICATION.md) retains the unsuccessful attempts.

See the [current release timing in deployment verification](DEPLOYMENT_VERIFICATION.md). Measurements belong to their named deployment and run; earlier observations include slower searches and deterministic interpretation fallbacks. A small preview measurement is not an overall response-time guarantee. Optional generated explanations have a separate reliability limitation.

Candidate order is calculated from the current brief and evidence corpus. The named professionals below are source-reviewed examples, not a fixed promised ranking or an approved roster.

After a reload, saved briefs, evidence, notes and drafts remain in the project. Choose **Resume discovery** from **Saved**, or the resume action on Home. DocMap submits the saved structured brief for a new current retrieval snapshot, preserving its requirements, priorities and version without asking the model to reinterpret the original wording. Existing saved evidence remains a historical snapshot; the newly retrieved ranking can change if the source corpus has changed. Continue refining from those new results rather than starting the assessment again.

## Pathway 1: clinical expertise behind a broad specialty

Paste:

> We are assessing software that analyses cardiac CT scans to support assessment of coronary artery disease in adults. Find UK clinical experts who could help examine the clinical relevance of its outputs and the consequences of incorrect results. Current clinical practice is essential; regulatory experience is optional.

1. Read the interpreted brief with the audience. Show that current practice is essential and regulatory experience is preferred, not a universal prerequisite for a clinical expert.
2. Inspect the candidate-specific reason and its source passage. A cardiology title alone is insufficient; the useful evidence concerns the actual imaging modality and clinical work.
3. Select two or three candidates and open **Compare evidence**. Compare supported requirements and confirmation gaps against the same brief. Use the comparison's explanation action only when an AI request is appropriate; the evidence table already works without it.
4. Refine: **“Include radiologists specialising in cardiac imaging.”** The existing modality and condition should remain active.
5. Refine: **“Remove regulatory experience but keep cardiac CT.”** The regulatory criterion should disappear while the CT criterion remains.
6. Switch between **Focused view** and **Directory**. This changes presentation of the same ranked snapshot; it does not launch another search.

Reviewed source examples include [Neghal Kandiyil’s PHIN profile](https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157), which records cardiac coronary CT and vascular-radiology research, and [Sanjay Banypersad’s hospital profile](https://www.circlehealthgroup.co.uk/consultants/sanjay-banypersad), which records cardiac CT/MRI practice and imaging-service development. The profiles support different lines of inquiry. They do not establish present availability or assessor approval. Combined CT/MRI activity must not become a CT-only volume claim.

**Point to make:** the team is looking for experience that bears on the device's clinical question, not simply matching a specialty label or favouring a bookable network member.

## Pathway 2: distinguish a clinical interest from a study contribution

In a new project, paste:

> We are assessing skin-lesion imaging software using dermoscopy in primary care. Find UK clinical expertise to help examine the evidence behind diagnostic accuracy and how results could affect referrals. Experience evaluating diagnostic studies is preferred. Regulatory experience is optional.

1. Check that diagnostic-study evaluation is preferred, including when the brief mentions diagnostic accuracy before expressing that preference.
2. Open relevant clinical and research evidence. A clinical-interest statement, a performed clinical activity, training and a named publication contribution are different evidence types.
3. Review [Paul Norris’s Spire profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/dr-paul-norris-c2720966/) and the [2010 MoleMate trial protocol](https://link.springer.com/article/10.1186/1471-2296-11-36) when surfaced. The protocol identifies a historical coauthor and a primary-care diagnostic-aid study. It does not prove a particular investigator task, current appraisal competence or regulatory-assessment experience.
4. Refine: **“We need one practising clinician and one research specialist.”** Show the complementary role goal. Do not describe a returned set as a fully qualified panel or fill it with weak candidates merely to reach two.
5. Save promising candidates with their source evidence and the questions that still need answering.

**Point to make:** a defensible shortlist separates what a record documents from what a team hopes a candidate can contribute. An old paper can justify a focused qualification conversation without becoming an invented present-day credential.

## Pathway 3: reveal a setting gap and a relationship to review

In a new project, paste:

> We are assessing skin-lesion imaging software for use outside a specialist clinical setting by non-specialist users. We need expertise to examine the consequences of missed lesions and what should prompt referral. Research experience is preferred. Manufacturer: Check 4 Cancer. Home-use validation and current practice must be confirmed.

1. Show the setting and manufacturer in the brief. Related skin-imaging research is not proof of experience validating a home-use workflow.
2. Inspect **Relationships to review** and **Questions before engagement**. [Per Hall’s Spire profile](https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/) records relevant skin-imaging research and an advisory role for Check 4 Cancer. Its role dates and precise scope remain unresolved.
3. Explain that the relationship deserves review for this engagement. Neither the relationship nor its absence decides independence automatically.
4. Turn on **Documented essentials only**. If no candidate has documented support for every essential requirement, show that empty result honestly. Turn it off to explore clearly qualified leads again.
5. As a separate clarification example, start a new project and enter **“Find a cardiology expert.”** The expected next step is a focused question about the technology, clinical use or assessment, not arbitrary recommendations.

**Point to make:** surfacing the unknown is useful work. It tells the recruiting team what to ask before relying on a candidate, rather than manufacturing certainty.

## Save the reasoning, then prepare qualification

From a relevant search:

1. **Save** a candidate. Open **Saved** to see the saved brief version, evidence, rationale, questions and dates. Expand **Original request & requirements** for the original wording and active priorities.
2. Expand **Candidate notes**, enter notes and choose **Save notes**. Expand **Project notes** to add scope notes and choose **Save project notes** separately. These sections start collapsed; the records are browser-local, not a shared team workspace.
3. Expand **Review & engagement** for the separate qualification and independence controls. Change them only to record an actual team decision for the relevant scope. A saved candidate or generated explanation is not approval.
4. Within **Review & engagement**, **Record activity** stores user-entered events in the browser. Leave it unsubmitted unless an actual contact, reply, meeting or engagement exists. This control sends no communication. **Not contacted in this project** sends only the contacted candidate IDs to the search server to filter the current project’s results and pagination; notes, event details and review decisions stay local, and the exclusion IDs are not sent to DeepSeek. With no recorded contact events, this filter cannot identify people contacted outside the project.
5. **Prepare outreach draft**, also within **Review & engagement**, creates editable preparation text. Review it, then download it if useful. The preview has no sending integration and must not be described as having contacted the expert.
6. Use the primary **Download review pack** action for a readable HTML evidence pack suitable for printing. For a restorable copy with saved evidence and notes, open **Backup & restore** and choose **Download project backup**. Alternatively choose **Copy backup**, save the copied JSON securely, then choose **Restore a backup**, paste it into **Or paste your JSON backup**, and select **Restore copied backup**. Restoration creates a separate project rather than silently overwriting existing work.
7. Change the assessment brief and return to **Saved**. Earlier saved decisions should be marked for review when the scope or evidence changes. A historical snapshot remains historical; resaving it does not rewind the active brief. After reloading, **Resume discovery** retrieves against the saved active brief without model reinterpretation.

If browser storage fails, use **Export project now** before leaving. Do not describe local IndexedDB persistence as a production recruitment CRM or cross-device team synchronisation.

Both local and hosted browser checks confirmed **Copy backup → paste JSON import → reload**. The local run retained candidate evidence snapshots, four brief versions, notes and the draft. The hosted run retained identical candidate evidence and draft under a new project identity, with zero recruitment events. HTML packs were also generated and validated from hosted snapshots, but the automated browser did not confirm receipt of a Blob-generated HTML file. Use the verified copied-backup route during the demonstration; do not report browser file receipt as verified until checked separately.

## How to describe the value

A conventional directory can help find people by name, specialty or a term in a biography. DocMap's proposition is to reduce the reasoning work between that directory and a justified shortlist: express the assessment situation, retrieve attributable evidence, compare relevant experience, preserve the rationale and organise the unresolved questions.

There is no measured improvement percentage or proven recruitment ROI in this preview. A pilot should compare the same assessment tasks using the existing workflow and DocMap, recording time to a source-supported shortlist, evidence quality, reviewer corrections and unresolved checks. See the [pilot measurement protocol](PILOT_MEASUREMENT.md).

Do not claim that DocMap establishes current registration, willingness, fees, independence or formal competence to assess a particular device. Those remain engagement-specific qualification work. See [data boundaries and evaluation](DATA_AND_EVALUATION.md) for the available evidence and known limitations.
