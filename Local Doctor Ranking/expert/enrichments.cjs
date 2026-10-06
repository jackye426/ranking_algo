'use strict';

// Small, manually source-reviewed additions. These are professional statements,
// not an approved roster. `observedAt` is the access date, never a practice date.
// Exact source excerpts are deliberately short; descriptions are paraphrases.
module.exports = Object.freeze([
  {
    sourceRecordId: 'spire_668',
    text: 'The professional profile documents assessment of skin lesions and skin-cancer care.',
    excerpt: 'Skin lesion assessment and management',
    field: 'targeted_public_profile', type: 'clinical-practice',
    sourceUrl: 'https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/',
    sourceLabel: 'Spire professional profile', sourceDate: null, observedAt: '2026-10-06', verified: true,
    review: {method: 'public-page-review', identityBasis: 'Exact pre-existing GMC-bearing profile URL; name, plastic-surgery role and Cambridge practice agree.', limitations: ['Undated biography does not verify current engagement availability.']}
  },
  {
    sourceRecordId: 'spire_668',
    text: 'The profile describes research into detecting skin cancer with dermoscopy, computer imaging, telemedicine and artificial intelligence, including helping non-specialists assess lesions.',
    excerpt: 'dermoscopy, computer imaging, telemedicine and artificial intelligence',
    field: 'targeted_public_research', type: 'research',
    sourceUrl: 'https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/',
    sourceLabel: 'Spire professional profile', sourceDate: null, observedAt: '2026-10-06', verified: true,
    review: {method: 'public-page-review', identityBasis: 'Exact existing profile URL and corroborated professional identity.', limitations: ['Research interests do not establish formal assessment approval or a particular device-study role.']}
  },
  {
    sourceRecordId: 'spire_668',
    text: 'The profile records a skin clinical-advisory role for the telemedicine screening company Check 4 Cancer. This is relationship evidence for review, not a conflict determination.',
    excerpt: 'Clinical Advisor for Skin', relatedOrganisation: 'Check 4 Cancer',
    field: 'targeted_public_relationship', type: 'relationship',
    sourceUrl: 'https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/',
    sourceLabel: 'Spire professional profile', sourceDate: null, observedAt: '2026-10-06', verified: true,
    review: {method: 'public-page-review', identityBasis: 'Exact existing profile URL and corroborated professional identity.', limitations: ['The page supplies no start/end date or engagement terms.', 'Relationship relevance and independence must be assessed for the actual engagement by the recruiting organisation.']}
  },
  {
    sourceRecordId: 'bupa_12291', registration: {body: 'GMC', identifier: '2720966'},
    text: 'The professional profile describes dermoscopy and the diagnosis and screening of skin cancer.',
    excerpt: 'use of dermoscopy in skin cancer diagnosis',
    field: 'targeted_public_profile', type: 'clinical-practice',
    sourceUrl: 'https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/dr-paul-norris-c2720966/',
    sourceLabel: 'Spire professional profile', sourceDate: null, observedAt: '2026-10-06', verified: true,
    review: {method: 'public-page-review', identityBasis: 'Exact GMC-linked existing profile; name and dermatology role agree.', limitations: ['The undated page does not confirm current engagement availability or regulatory-assessment experience.']}
  },
  {
    sourceRecordId: 'bupa_12291', registration: {body: 'GMC', identifier: '2720966'},
    text: 'Paul Norris is a named consultant-dermatologist coauthor of the 2010 MoleMate trial protocol. The study evaluates a skin-lesion diagnostic aid in primary care, including referral decisions and diagnostic performance.',
    excerpt: 'Paul Norris',
    field: 'targeted_publication', type: 'research',
    sourceUrl: 'https://link.springer.com/article/10.1186/1471-2296-11-36',
    sourceLabel: 'MoleMate trial protocol (2010)', sourceDate: '2010-05-11', observedAt: '2026-10-06', verified: true,
    review: {method: 'publisher-page-review', identityBasis: 'Author name, consultant-dermatologist role and Addenbrooke\'s affiliation match the existing GMC-linked professional record.', limitations: ['Historical coauthorship supports study involvement, not a specific investigator task, present study-appraisal competence or regulatory approval.', 'The study context is not a determination of an individual financial relationship or conflict.']}
  },
  {
    sourceRecordId: 'bupa_14429', registration: {body: 'GMC', identifier: '6052530'},
    text: 'The hospital profile documents cardiac CT and MRI practice and development of the imaging service at Royal Blackburn Hospital.',
    excerpt: 'cardiac CT and MRI service',
    field: 'targeted_public_profile', type: 'clinical-practice',
    sourceUrl: 'https://www.circlehealthgroup.co.uk/consultants/sanjay-banypersad',
    sourceLabel: 'Circle professional profile', sourceDate: null, observedAt: '2026-10-06', verified: true,
    review: {method: 'public-page-review', identityBasis: 'The page explicitly lists GMC 6052530, matching the existing record.', limitations: ['The profile is undated; current practice still requires confirmation.', 'Its combined CT/MRI activity must not be treated as a CT-only reporting count.']}
  },
  {
    sourceRecordId: 'bupa_11411',
    text: 'The consultant-provided professional profile records cardiac coronary CT experience.',
    excerpt: 'cardiac coronary CT',
    field: 'targeted_public_profile', type: 'clinical-practice',
    sourceUrl: 'https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157',
    sourceLabel: 'PHIN consultant-provided profile', sourceDate: null, observedAt: '2026-10-06', verified: true,
    review: {method: 'public-page-review', identityBasis: 'PHIN gives GMC 6036728; this matches the original record\'s GMC-bearing Spire profile URL, name, radiology role and Leicester affiliation.', limitations: ['The displayed page-update date is not a dated attestation of current clinical practice.', 'CT accreditation wording is not medical-device assessment approval.']}
  },
  {
    sourceRecordId: 'bupa_11411',
    text: 'The consultant-provided profile describes research involvement in vascular radiology and participation in trials.',
    excerpt: 'I have an active interest in research with vascular radiology and am involved in a number of trials.',
    field: 'targeted_public_research', type: 'research',
    sourceUrl: 'https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157',
    sourceLabel: 'PHIN consultant-provided profile', sourceDate: null, observedAt: '2026-10-06', verified: true,
    review: {method: 'public-page-review', identityBasis: 'Same corroborated GMC-bearing identity as the cardiac CT passage.', limitations: ['No individual trial, role, diagnostic-performance appraisal task or participation date is established by this passage.']}
  }
].map(item => Object.freeze(item)));
