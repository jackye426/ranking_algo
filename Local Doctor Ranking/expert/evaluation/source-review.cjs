'use strict';

// Review log records both positive source checks and unsuccessful attempts.
// Fetch failures are not evidence that the professional lacks the expertise.
module.exports = Object.freeze({
  reviewedAt: '2026-10-06', reviewer: 'Codex source review',
  identityApproach: 'Registration-linked source record plus corroborated name, role and organisation. No name-only enrichment.',
  checks: [
    {sourceRecordId: 'spire_668', sourceUrl: 'https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/mr-per-hall-c2866413/', status: 'reviewed', supports: ['skin-lesion assessment', 'research involving imaging and non-specialist users', 'recorded advisory role for Check 4 Cancer'], doesNotEstablish: ['current role dates', 'financial terms', 'conflict determination', 'regulatory approval']},
    {sourceRecordId: 'bupa_12291', sourceUrl: 'https://www.spirehealthcare.com/spire-cambridge-lea-hospital/consultants/dr-paul-norris-c2720966/', status: 'reviewed', supports: ['dermoscopy', 'skin cancer diagnosis'], doesNotEstablish: ['dated current practice', 'availability', 'regulatory approval']},
    {sourceRecordId: 'bupa_12291', sourceUrl: 'https://link.springer.com/article/10.1186/1471-2296-11-36', status: 'reviewed', sourceDate: '2010-05-11', supports: ['historical named coauthorship', 'skin-lesion diagnostic aid trial', 'primary care setting'], doesNotEstablish: ['principal investigator role', 'current assessor qualification', 'personal manufacturer relationship']},
    {sourceRecordId: 'bupa_14429', sourceUrl: 'https://www.circlehealthgroup.co.uk/consultants/sanjay-banypersad', status: 'reviewed', supports: ['GMC-linked identity', 'cardiac CT and MRI practice', 'imaging service development'], doesNotEstablish: ['dated current practice', 'CT-only annual volume', 'device certification experience']},
    {sourceRecordId: 'bupa_11411', sourceUrl: 'https://www.phin.org.uk/profiles/consultants/neghal-kandiyil-195157', status: 'reviewed', supports: ['GMC-linked identity', 'cardiac coronary CT', 'vascular radiology research and trials'], doesNotEstablish: ['dated current practice', 'named study role', 'regulatory approval']},
    {sourceRecordId: 'bupa_11411', sourceUrl: 'https://www.spirehealthcare.com/spire-nottingham-hospital/consultants/dr-neghal-kandiyil-c6036728/', status: 'fetch-failed', reason: 'The source reader returned a cache miss; existing record evidence was not relabelled freshly verified.'},
    {sourceRecordId: 'bupa_14429', sourceUrl: 'https://www.spirehealthcare.com/spire-manchester-hospital/consultants/dr-sanjay-banypersad-c6052530/', status: 'fetch-failed', reason: 'The source reader returned a cache miss; an accessible GMC-linked hospital source was reviewed instead.'},
    {sourceRecordId: 'bupa_12291', sourceUrl: 'https://www.bmj.com/content/345/bmj.e4110', status: 'fetch-failed', reason: 'Direct publisher access returned 403. No fresh full-paper verification claimed; the accessible earlier protocol supplies bounded historical study evidence.'}
  ]
});
