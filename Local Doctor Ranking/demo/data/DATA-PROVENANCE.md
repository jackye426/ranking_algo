# Public Spire profile demonstration corpus

This is a manually curated set of **12 real consultants**, prepared on **1 October 2026** from official public Spire consultant profiles. It is **not a Supabase export**, a full Spire directory, or live appointment inventory. The task could not establish access to the user's Supabase projects when this corpus was prepared. It exists to make the search demonstration useful while that connection is resolved.

## Source and field mapping

- Each record's `profileUrl` is an official Spire consultant profile. Name, specialty, clinical interests, short paraphrased description, GMC where explicitly shown, and hospital affiliations come from that profile.
- `affiliationEvidence` records the profile's explicit practising-site listing. Affiliation is never inferred from a mention of Spire in a biography or from a generic hospital page.
- The locations array intentionally includes only the selected demonstration hospitals; some consultants also practise at other Spire sites that are not included. Those omitted sites do not imply a consultant stopped practising there.
- The hospital address and geographic coordinates are taken from its official Spire hospital page. Coordinates are the published JSON-LD `GeoCoordinates`, retrieved directly from the public HTML; they are suitable for approximate straight-line distance, not journey time.
- Portrait URLs are the images inside the consultant image section of the same official profile. No invented portraits, ratings, review counts, treatment outcomes, fees or appointment slots were added. Images remain on Spire's origin.
- `insuranceEvidence` is consultant-specific evidence from official Bupa Finder. Inclusion under `insurers: ['Bupa']` means **listed by Bupa**, not guaranteed policy cover, treatment eligibility, appointment availability or a promise of no top-up. The interface should use “Bupa listed” or “Bupa recognition listed”, and tell users to confirm policy cover.
- An empty insurers/evidence array means **not verified in this demonstration corpus**. It does not mean the consultant does not accept that insurer. No insurer is inferred from a hospital's contracts.
- `retrievedAt` is the date of this research snapshot. It is not a source update date or a guarantee that the underlying source was recently reviewed. Web retrieval used official pages and, where necessary, search-service cached copies; consultant portraits and hospital coordinates were also checked directly against public page HTML.

## Coverage and source inventory

Ten orthopaedic consultants are included, plus one cardiologist and one dermatologist for meaningful specialty filtering. This is deliberately a small sample. London East is in Redbridge; Bushey and Harpenden are in Hertfordshire. A “London and nearby” catchment label is appropriate; do not describe all these sites as central London.

| Consultant | Included Spire sites | Profile source | Bupa evidence |
| --- | --- | --- | --- |
| Ravi Popat | Bushey, Harpenden | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-ravi-popat-c7043233/) | [Bupa](https://www.finder.bupa.co.uk/Consultant/view/311728/mr_ravi_popat): fee assured; Open Referral network |
| Tim Waters | Bushey | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-tim-waters-c4201393/) | [Bupa](https://www.finder.bupa.co.uk/Consultant/view/89653/mr_timothy_waters): **not fee assured**; Open Referral network |
| Simon Jennings | Bushey | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-simon-jennings-c3585092/) | Not checked |
| Ben Spiegelberg | Bushey | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-ben-spiegelberg-c6090006/) | Not checked |
| Yegappan Kalairajah | Harpenden | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-yegappan-kalairajah-c4209982/) | [Bupa](https://www.finder.bupa.co.uk/Consultant/view/83829/mr_yegappan_kalairajah): fee assured; **not in Open Referral network** |
| Tarique Parwez | Harpenden | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-tarique-parwez-c4465261/) | Not verified |
| Sunil Kumar | London East | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-sunil-kumar-c3327618/) | [Bupa](https://www.finder.bupa.co.uk/Consultant/view/29307/mr_sunil_kumar): Platinum; fee assured; Open Referral network |
| Ahmad Ali | London East | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-ahmad-ali-c4392905/) | Not checked |
| Mohit Bansal | London East | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-mohit-bansal-c6108524/) | Not checked |
| Mandeep Lamba | London East | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/mr-mandeep-lamba-c4076494/) | Not checked |
| Ameet Bakhai | Bushey | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/dr-ameet-bakhai-c3476550/) | Not checked |
| Laurence R Lever | Bushey | [Spire profile](https://www.spirehealthcare.com/consultant-profiles/dr-laurence-r-lever-c2651714/) | Not checked |

Hospital sources and published coordinates:

| Hospital | Postal address | Latitude, longitude | Source |
| --- | --- | --- | --- |
| Spire Bushey Hospital | Heathbourne Road, Bushey, Hertfordshire, WD23 1RD | 51.637526, -0.331566 | [Hospital page](https://www.spirehealthcare.com/spire-bushey-hospital/) |
| Spire Harpenden Hospital | Ambrose Lane, Harpenden, Hertfordshire, AL5 4BP | 51.82813, -0.360392 | [Hospital page](https://www.spirehealthcare.com/spire-harpenden-hospital/) |
| Spire London East Hospital | Roding Lane South, Redbridge, Essex, IG4 5PZ | 51.587154, 0.043064 | [Hospital page](https://www.spirehealthcare.com/spire-london-east-hospital/) |

## Quality and practical limits

All 12 records have source-linked Spire affiliation, specialty, clinical interests, image URLs, and at least one included hospital with a verified postal address and published coordinates. Four have consultant-specific Bupa evidence. Eleven include an explicitly published GMC number; Ameet Bakhai's number is omitted because it was not displayed in the inspected profile body. No performance or clinical-quality conclusion should be derived from this small sample.

Do not fabricate a Supabase relationship, synchronisation status or data-freshness claim. When the live dataset is connected, preserve source identities and explicit affiliation/insurance evidence and audit coverage before switching the application data source. This sample can remain a clearly labelled, opt-in offline demonstration fixture.
