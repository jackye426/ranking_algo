# Consultant evidence reader

Presentation release, 8 October 2026.

## Scope

The selected source passage appears first and once, below a compact consultant identity. Other passages are grouped into collapsed clinical work and interests, procedures, research, background and qualifications, practice locations, and relationships. Counts describe passages.

Exact excerpts and reviewed summaries have distinct labels. Provider, unknown or recorded source date, original-page links and material qualifications stay beside the evidence. Technical provenance is disclosed separately; identical provenance is deduplicated while different origins, dates and reviewed excerpts remain available.

Profile paragraphs and lists follow explicit source boundaries, preserving short modality names, negation, ranges and source order. No boundaries are inferred from medical terminology or capitals. Each disclosure indicator follows its own open state.

Search, ranking, model configuration, canonical evidence, corpus versions, saved profile snapshots and backup validation are unchanged. Source reading has no AI dependency.

## Automated verification

- Expert suite: **986 passed**, no failures or skips.
- Patient suite: **243 passed**, no failures or skips.
- Includes wrong-person and obsolete source targets, HTML escaping and unsafe links, reviewed summaries with name-only literal proof, provenance differences, unknown dates, independent source disclosure/navigation, frozen saved profiles and unchanged legacy backup import/export.
- Native Escape now captures the profile's reading position before the browser hides the dialog. A regression reproduces native layout reset and checks position, disclosures, focus, exactly one close and no additional profile or AI request.
- Display fixtures cover CT/MR, negative lead-ins, ordered interleaved paragraphs/lists, numeric ranges, Herbert's continuation lines and Hyam's explicit asterisk list without repairing malformed source joins.
- Deployment staging contains 26 explicitly allowed runtime files. The source-reader navigation script is included; private caches, environment files and raw database exports are excluded.

## Responsive and accessibility checks

At 320px, the quotation's measured reading width increases from **123.2px to 239.2px**, using 16px text and 1.6 line height. A long-name fixture also passes 768px and 390px without document-level horizontal overflow.

An isolated layout fixture doubles text sizes (32px quotation text), including at 320px. This is a **text-enlargement test**, not a claim that native browser zoom or a physical mobile device was tested. Long names and identifiers wrap. When an enlarged identity exceeds 40% of the viewport height, the header stays in normal document flow so it cannot obstruct reading. Ordinary layouts retain the sticky header.

Header measurements update without resetting reading position. Initial/hash citation navigation opens the correct disclosure when needed; font settlement cannot reposition the reader after user interaction.

## Source limitations retained

Missing original links and dates remain explicit. Flat text with no reliable boundaries remains prose. Malformed joins in the source are not silently repaired. Research involvement, interests, training and clinical activity remain distinct; presentation changes do not establish additional expertise or current practice.

## Screenshots

- [Source before — desktop](screenshots/source-reader-before-desktop.png)
- [Source before — 320px](screenshots/source-reader-before-320.png)
- [Profile before](screenshots/profile-reader-before.png)
- [200% text fixture — 320px](screenshots/source-reader-200-text-fixture-320.png)
- [Source after — desktop](screenshots/source-reader-after-desktop.png)
- [Source after — 768px](screenshots/source-reader-after-768.png)
- [Source after — 390px](screenshots/source-reader-after-390.png)
- [Source after — 320px](screenshots/source-reader-after-320.png)
- [Hyam's explicit list](screenshots/source-reader-hyam-after.png)
- [Reviewed summary and literal proof](screenshots/source-reader-reviewed-summary-after.png)
- [Direct-visit evidence index](screenshots/source-reader-index-after.png)
- [Profile after — desktop](screenshots/profile-reader-after-desktop.png)
- [Profile after — 768px](screenshots/profile-reader-after-768.png)
- [Profile after — 390px](screenshots/profile-reader-after-390.png)
- [Profile after — 320px](screenshots/profile-reader-after-320.png)
- [Profile reading position after Escape and reopening](screenshots/profile-reader-escape-after.png)

## Hosted and interaction verification

The final release passed 13 hosted route/asset checks, including exact release asset hashes and excluded private/patient paths. Source routes retained 404 for wrong-person/obsolete citations and 400 for duplicate evidence parameters. The original corpus version remained `expert-corpus-v1-003234ea2e49a2446f3f`.

Railway deployment `91f74915-4d9f-4f78-8ae5-fc82ad7f62ad` reached **SUCCESS** on the existing expert service. Health reports ready with the unchanged DeepSeek configuration. The final live Escape → reopen check restored exactly **1117.6px** and retained the open procedure disclosure; the browser reported no console errors.

Preview: https://docmap-expert-discovery-production.up.railway.app/expert-discovery

Desktop, 768px, 390px and 320px checks confirmed aligned quotation/heading edges, 16px quotation type with 25.6px line height, no document-level horizontal overflow, one selected passage and zero initially expanded groups. The identity remained visible and the citation target cleared the sticky header. Hyam's direct source URL showed five collapsed groups and no selected passage.

Keyboard Enter independently opens groups, with a visible focus ring and correct plus/minus indicators. About remains expanded while its collapsed Registration and qualifications disclosure shows plus. Herbert's procedure ranges and continuation lines remain literal paragraphs.

Opening a source link produced a separate browser tab with `noopener noreferrer`. Reading its record details left the original profile, unsent multiline draft, disclosure states and 1715px reading position unchanged. The temporary verification draft was then cleared. Existing saved notes and decisions were not edited.

The source reader has no animations or AI/network actions beyond loading its document/assets. Existing reduced-motion handling remains in the expert/patient regressions. Physical mobile keyboards, screen readers and native browser zoom were not tested in this Chromium-based verification.
