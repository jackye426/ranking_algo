'use strict';

// Independent, synthetic evidence-relation regressions. No held-out search
// brief, full professional corpus, embedding service or model call is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const { matrixFor } = require('./search.cjs');
const { parseBrief } = require('./brief.cjs');
const { classifyPassage } = require('./data.cjs');
const projects = require('./public/projects.js');

const person = { id: 'audit-person', name: 'Synthetic Expert', locations: [], organisations: [] };
const requirement = (kind, label) => ({ id: kind, kind, label, text: label, importance: 'essential' });
const evidence = (id, text, type = classifyPassage(text, 'about')) => ({ id, candidateId: person.id, sourceRecordId: 'source-' + id, text, type, field: 'about', attributes: {}, qualifiers: [] });
const skin = requirement('modality', 'Skin-lesion imaging');
const matrix = (passages, requirements, candidate = person) => matrixFor(candidate, passages, { version: 1, requirements });

test('a population in unrelated clinical work does not document the requested clinical-use population', () => {
  const rows = matrix([
    evidence('skin', 'I perform dermoscopy for skin lesions.'),
    evidence('adult-care', 'I treat adults with arthritis.'),
  ], [skin, requirement('population', 'Adults')]);
  assert.equal(rows[0].status, 'documented');
  assert.notEqual(rows[1].status, 'documented');
});

test('a setting in an unrelated pathway remains a confirmation gap', () => {
  const rows = matrix([
    evidence('skin', 'I perform dermoscopy for skin lesions.'),
    evidence('diabetes-care', 'I manage diabetes in primary care.'),
  ], [skin, requirement('setting', 'Primary care')]);
  assert.equal(rows[0].status, 'documented');
  assert.notEqual(rows[1].status, 'documented');
});

test('packing separate clinical sentences into one passage does not create a population relation', () => {
  const rows = matrix([
    evidence('packed', 'I perform dermoscopy for skin lesions. I treat children with asthma.'),
  ], [skin, requirement('population', 'Children')]);
  assert.notEqual(rows[1].status, 'documented');
});

test('explicitly related modality and population remain documented', () => {
  const rows = matrix([
    evidence('related', 'I interpret cardiac CT scans in adults.'),
  ], [requirement('modality', 'Cardiac CT'), requirement('population', 'Adults')]);
  assert.deepEqual(rows.map(row => row.status), ['documented', 'documented']);
  assert.deepEqual(rows[1].evidenceIds, ['related']);
});

test('medical licensing complaints are not formal medical-device assessment experience', () => {
  const rows = matrix([
    evidence('licensing', 'My regulatory experience includes reviewing GMC fitness-to-practise complaints.'),
  ], [requirement('regulatory', 'Medical-device assessment experience')]);
  assert.notEqual(rows[0].status, 'documented');
});

test('an explicit notified-body assessment role is recognised without needing the phrase regulatory experience', () => {
  const rows = matrix([
    evidence('assessor', 'I act as a clinical assessor for a notified body and evaluate clinical evaluation reports under MDR.'),
  ], [requirement('regulatory', 'Medical-device assessment experience')]);
  assert.equal(rows[0].status, 'documented');
  assert.deepEqual(rows[0].evidenceIds, ['assessor']);
});

test('a limitation on surgery does not negate documented research in the same sentence', () => {
  const rows = matrix([
    evidence('research', 'I undertake clinical research but do not perform surgery.', 'research'),
  ], [requirement('research', 'Clinical research')]);
  assert.equal(rows[0].status, 'documented');
});

test('a UK source-domain name cannot establish geography for a recorded US location', () => {
  const candidate = { ...person, locations: [{ name: 'Sample Clinic', address: '10 Main Street, Boston', country: 'United States', sourceUrl: 'https://hospital.example.co.uk/profile' }] };
  const rows = matrixFor(candidate, [evidence('location', 'Sample Clinic, Boston, United States', 'location')], { geography: 'UK', requirements: [requirement('geography', 'UK')] });
  assert.notEqual(rows[0].status, 'documented');
});

test('recorded UK geography requires its supporting location evidence', () => {
  const candidate = { ...person, locations: [{ name: 'Sample Clinic', postcode: 'SW5 0AA', sourceRecordId: 'source-location' }] };
  const rows = matrixFor(candidate, [evidence('location', 'Sample Clinic, London SW5 0AA', 'location')], { geography: 'UK', requirements: [requirement('geography', 'UK')] });
  assert.equal(rows[0].status, 'documented');
  assert.deepEqual(rows[0].evidenceIds, ['location']);
});

test('a removal clause cannot remove a requirement explicitly preserved in the next clause', () => {
  const previous = parseBrief({ message: 'Cardiac CT and regulatory experience are essential.' }).brief;
  const next = parseBrief({ previous, message: 'Remove regulatory experience but keep cardiac CT.' }).brief;
  assert.ok(next.requirements.some(row => row.label === 'Cardiac CT'));
  assert.ok(!next.requirements.some(row => row.kind === 'regulatory'));
});

test('saved JSON and HTML preserve the same matrix and owned evidence used for comparison', () => {
  const passages = [evidence('related', 'I interpret cardiac CT scans in adults.')];
  const brief = { version: 1, requirements: [requirement('modality', 'Cardiac CT'), requirement('population', 'Adults')] };
  const requirementMatrix = matrixFor(person, passages, brief);
  const candidate = { ...person, evidence: passages, requirementMatrix, reasons: [] };
  const saved = projects.saveCandidate(projects.createProject('Matrix export audit'), candidate, brief, 'synthetic-corpus');
  const pack = JSON.parse(projects.exportJSON(saved)).project.candidates[0];
  assert.deepEqual(pack.candidate.requirementMatrix, requirementMatrix);
  for (const row of pack.candidate.requirementMatrix) for (const id of row.evidenceIds) {
    assert.ok(pack.candidate.evidence.some(item => item.id === id && item.candidateId === person.id));
  }
  const html = projects.exportHTML(saved);
  assert.ok(html.includes('Supported'));
  assert.ok(html.includes('source-related'));
  assert.ok(html.includes('I interpret cardiac CT scans in adults.'));
});
