'use strict';

// Targeted primary-provider checks made to investigate the third held-out audit.
// These are professional source-identity observations, not regulator checks or
// a complete roster. Excerpts are intentionally short. Unknown stays unknown.
module.exports = [
  {
    sourceUrl: 'https://www.ramsayhealth.co.uk/specialists/dr-christopher-wong',
    sourceLabel: 'Ramsay Health Care UK', sourceDate: null, observedAt: '2026-10-06',
    name: 'Dr Christopher Wong', registration: { body: 'GMC', identifier: '6038036' },
    role: 'Consultant Nephrologist and General Physician',
    excerpts: ['Dr Christopher Wong is a Consultant Nephrologist and General Physician in Ormskirk', 'GMC Number', '6038036'],
    checked: true, method: 'Primary provider page text reviewed during identity-conflict investigation.',
    limitations: ['The registration is stated by the provider, not freshly confirmed on the regulator register.', 'Same name does not permit reassignment of another source row.']
  },
  {
    sourceUrl: 'https://www.ramsayhealth.co.uk/specialists/mr-robert-morley',
    sourceLabel: 'Ramsay Health Care UK', sourceDate: null, observedAt: '2026-10-06',
    name: 'Mr Robert Morley', registration: { body: 'HCPC', identifier: 'CH14313' },
    role: 'Consultant Podiatric Surgeon',
    excerpts: ['Mr Robert Morley is a Consultant Podiatric Surgeon in Nottingham', 'HCPC CH14313'],
    checked: true, method: 'Primary provider page text reviewed during identity-conflict investigation.',
    limitations: ['The registration is stated by the provider, not freshly confirmed on the regulator register.', 'This source does not identify Robert Moverley.']
  },
  {
    sourceUrl: 'https://www.nuffieldhealth.com/consultants/mr-robert-moverley',
    sourceLabel: 'Nuffield Health', sourceDate: null, observedAt: '2026-10-06',
    name: 'Mr Robert Moverley', registration: { body: 'GMC', identifier: '6166627' },
    role: 'Orthopaedic surgery',
    excerpts: ['Mr Robert Moverley', 'GMC number: 6166627', 'Orthopaedic surgery'],
    checked: true, method: 'Primary provider page text reviewed during identity-conflict investigation.',
    limitations: ['The registration is stated by the provider, not freshly confirmed on the regulator register.', 'This source does not establish a second HCPC registration.']
  },
  {
    sourceUrl: 'https://www.hcahealthcare.co.uk/finder/stepconsultantprofile/mr-eric-clarke',
    sourceLabel: 'HCA Healthcare UK', sourceDate: null, observedAt: '2026-10-06',
    name: 'Eric Clarke', registration: null, role: 'Physiotherapy',
    excerpts: ['Eric Clarke', 'Physiotherapy'],
    checked: true, method: 'Primary provider page text reviewed during identity-conflict investigation.',
    limitations: ['No regulator identifier was observed on the fetched page; the raw HCPC identifier is not externally verified here.', 'This source does not identify Enrico Clarke or establish clinical oncology expertise.']
  },
  {
    sourceUrl: 'https://www.drclairehepworth.com/about-dr-hepworth',
    sourceLabel: 'Dr Claire Hepworth professional website', sourceDate: null, observedAt: '2026-10-06',
    name: 'Dr Claire Hepworth', registration: { body: 'HCPC', identifier: 'PYL26294' },
    role: 'Clinical Psychologist',
    excerpts: ['Dr Claire Hepworth, Clinical Psychologist.', 'Health and Care Professions Council (PYL26294)'],
    checked: true, method: 'Clinician-owned professional page reached through the Bupa provider profile during fourth-holdout identity investigation.',
    corroboratingUrl: 'https://www.finder.bupa.co.uk/Consultant/view/225728/dr_claire_hepworth',
    reviewedSourceRecordIds: ['bupa_3846'],
    limitations: ['The clinician-owned page states this registration; no live regulator status verification was performed.', 'The source record carries physiotherapy-coded PH68586 and an unresolved same-name HCA association. Quarantine and reconcile; this observation does not authorize silently replacing the source identifier.', 'The linked HCA page could not be freshly fetched.']
  }
];
