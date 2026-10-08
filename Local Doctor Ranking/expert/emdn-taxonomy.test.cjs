'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const data = require('./data/emdn-2026.json');
const { lookup, normalizeCode, detectCodes, getMapping, getClarification, getMetadata } = require('./emdn-taxonomy.cjs');

test('all 8,516 exact codes are present with complete, coherent ancestry independent of source row order', () => {
  assert.equal(data.nodes.length, 8516);
  assert.equal(new Set(data.nodes.map(n => n.code)).size, 8516);
  const children = new Map();
  for (const row of data.nodes) {
    const node = lookup(row.code);
    assert.equal(node.termRaw, row.termRaw);
    assert.equal(node.term, row.termRaw.trim());
    assert.equal(node.level, (node.code.length + 1) / 2);
    assert.equal(node.category, node.code[0]);
    assert.equal(node.path.length, node.level);
    assert.equal(node.path.at(-1).code, node.code);
    assert.equal(node.source.range, `C${row.row}:F${row.row}`);
    if (node.parentCode) {
      const parent = lookup(node.parentCode);
      assert.equal(parent.level, node.level - 1);
      children.set(parent.code, (children.get(parent.code) || 0) + 1);
    }
  }
  for (const row of data.nodes) assert.equal(row.terminal, !children.has(row.code), row.code);
  assert.equal(lookup('H010101').source.row, 507);
  assert.equal(lookup('H0101').source.row, 1212);
  assert.equal(getMetadata().counts.parentAfterChildRows, 65);
});

test('audit counts reconcile with terms, including singular ACCESSORY and the suffix exception', () => {
  const count = predicate => data.nodes.filter(predicate).length;
  assert.equal(count(n => n.level === 1), 23);
  assert.equal(count(n => n.terminal), 6773);
  assert.equal(count(n => /\bMEDICAL DEVICE SOFTWARE(?: - NOT INCLUDED IN OTHER CLASSES)?$/.test(n.termRaw)), 173);
  assert.equal(count(n => /IVD MEDICAL DEVICE SOFTWARE$/.test(n.termRaw)), 34);
  assert.equal(count(n => /SOFTWARE ACCESSOR(?:Y|IES)$/.test(n.termRaw)), 171);
  assert.equal(count(n => /82$/.test(n.code)), 172);
  assert.equal(lookup('Z11030482').term, 'INSTRUMENTS FOR RADIOLOGICAL SECTION');
  assert.equal(getMapping('Z11030482'), null);
  assert.equal(count(n => n.termRaw.trim() !== n.termRaw), 32);
});

test('duplicate labels are separate code identities and preserve their different hierarchy', () => {
  const a = lookup('J0302'), b = lookup('P020101');
  assert.equal(a.term, 'MIDDLE EAR IMPLANTS');
  assert.equal(a.term, b.term);
  assert.notEqual(a.category, b.category);
  assert.equal(a.terminal, true);
  assert.equal(b.terminal, false);
});

test('exact examples retain worksheet provenance and official label rather than inferred specialty', () => {
  for (const [code, row, term] of [
    ['Z11030692', 7191, 'COMPUTED TOMOGRAPHS (CT) - MEDICAL DEVICE SOFTWARE'],
    ['Z12040118', 7800, 'VIDEO DERMATOSCOPES'],
    ['J010792', 1492, 'ACTIVE IMPLANTABLE CARDIAC DEVICES REMOTE MONITORING SYSTEMS - MEDICAL DEVICE SOFTWARE'],
    ['V92', 4553, 'MEDICAL DEVICE SOFTWARE - NOT INCLUDED IN OTHER CLASSES']
  ]) {
    const node = lookup(code);
    assert.equal(node.term, term);
    assert.equal(node.source.sheet, 'EMDN_v.2026');
    assert.equal(node.source.row, row);
    assert.equal(node.terminal, true);
  }
  assert.deepEqual(lookup('Z11030692').path.map(n => n.code), ['Z', 'Z11', 'Z1103', 'Z110306', 'Z11030692']);
});

test('normalization changes only case and outer whitespace, never repairs or truncates codes', () => {
  assert.equal(lookup(' z11030692 ').code, 'Z11030692');
  for (const input of [null, {}, 92, 'Z 11030692', 'Z-11030692', 'Z1103069', 'Z110306920', 'Z1103069292', 'Z11030692 trailing', 'EMDN Z11030692', '__proto__']) assert.equal(lookup(input), null, String(input));
  assert.equal(normalizeCode('E92'), 'E92');
  assert.equal(lookup('E92'), null);
  assert.equal(lookup('Z').level, 1);
});

test('deliberate EMDN references and code-only input support lowercase and multiple codes', () => {
  assert.deepEqual(detectCodes('z11030692').codes, ['Z11030692']);
  assert.deepEqual(detectCodes('EMDN code: z11030692 for coronary disease in the UK').codes, ['Z11030692']);
  assert.deepEqual(detectCodes('EMDN codes Z11030692, Z12040118 and J010792').codes, ['Z11030692', 'Z12040118', 'J010792']);
  assert.deepEqual(detectCodes('Z11030692 / J010792').codes, ['Z11030692', 'J010792']);
  assert.deepEqual(detectCodes('EMDN Z11030692; EMDN J010792').codes, ['Z11030692', 'J010792']);
  assert.deepEqual(detectCodes('EMDN Z11030692 and Z11030692').codes, ['Z11030692']);
  const message = 'Find experts for EMDN Z12040118, with skin lesion research';
  const reference = detectCodes(message).references[0];
  assert.equal(message.slice(reference.start, reference.end), 'Z12040118');
});

test('a single-letter category requires EMDN framing and ordinary clinical codes remain text', () => {
  assert.deepEqual(detectCodes('Z').ambiguousCategories, ['Z']);
  assert.deepEqual(detectCodes('Z').codes, []);
  assert.deepEqual(detectCodes('EMDN category Z').codes, ['Z']);
  assert.deepEqual(detectCodes('EMDN categories Z and W').codes, ['Z', 'W']);
  for (const input of ['I need a specialist', 'Vitamin B12 deficiency', 'C19 concerns', 'T2 MRI reporting', 'a', 'We need category Z experience', 'Research in the UK', 'ICD C01 cancer coding', 'B12 deficiency software research']) assert.deepEqual(detectCodes(input).codes, [], input);
});

test('code plus ordinary language works while unknown long codes remain recoverable errors', () => {
  for (const message of ['Z11030692 for detecting coronary artery disease', 'Find experts for Z12040118', 'z11030692 cardiac CT software']) {
    const found = detectCodes(message);
    assert.equal(found.codes.length, 1, message);
    assert.equal(message.slice(found.references[0].start, found.references[0].end).toUpperCase(), found.codes[0]);
  }
  assert.deepEqual(detectCodes('Find experts for V92 software').codes, ['V92']);
  assert.deepEqual(detectCodes('V92 software for wound assessment').codes, ['V92']);
  assert.deepEqual(detectCodes('The patient has C01').codes, []);
  assert.deepEqual(detectCodes('Find experts for Z1103069').invalidCodes, ['Z1103069']);
  assert.deepEqual(detectCodes('Z1103069292 for reporting CT').invalidCodes, ['Z1103069292']);
  assert.deepEqual(detectCodes('Clinical trial NCT12345678 and registration GMC1234567').references, []);
});

test('invalid explicit input is surfaced without broadening to a valid ancestor', () => {
  for (const input of ['EMDN Z1103069', 'EMDN Z1103069292', 'EMDN E92', 'EMDN Z-11030692', 'EMDN Z 11030692', 'EMDN Z11030692fake']) {
    const detected = detectCodes(input);
    assert.deepEqual(detected.codes, [], input);
    assert.equal(detected.invalidCodes.length, 1, input);
    assert.equal(detected.references[0].valid, false);
  }
  const mixed = detectCodes('EMDN Z11030692 and E92');
  assert.deepEqual(mixed.codes, ['Z11030692']);
  assert.deepEqual(mixed.invalidCodes, ['E92']);
});

test('only three reviewed mappings exist; CT needs application and V92 has no clinical expansion', () => {
  const mapped = data.nodes.map(n => getMapping(n.code)).filter(Boolean);
  assert.deepEqual(mapped.map(m => m.code).sort(), ['J010792', 'Z11030692', 'Z12040118']);
  const ct = getMapping('Z11030692');
  assert.equal(ct.clarification.required, true);
  assert.equal(ct.clarification.type, 'clinical-application');
  assert.doesNotMatch(ct.queryTerms.join(' '), /cardiac|coronary|validation|AI/i);
  assert.equal(getMapping('V92'), null);
  assert.equal(getClarification('V92').type, 'device-purpose');
  assert.equal(getClarification('Z').required, true);
  assert.equal(getClarification('Z1103069292'), null);
  assert.doesNotMatch(getMapping('Z12040118').queryTerms.join(' '), /primary.care|AI|validation|regulatory/i);
  assert.doesNotMatch(getMapping('J010792').queryTerms.join(' '), /validation|regulatory|approval/i);
  for (const mapping of mapped) assert.match(mapping.limitations.join(' '), /does not establish.*competence/);
});

test('returned objects are immutable and metadata remains byte-stable across calls', () => {
  const node = lookup('Z11030692');
  assert.throws(() => { node.path[0].term = 'Wrong'; }, TypeError);
  assert.throws(() => { getMapping('Z12040118').queryTerms.push('regulatory approval'); }, TypeError);
  const metadata = getMetadata();
  assert.equal(metadata.workbookSha256, 'a973dcdd8ae291248c9d06d355d3cc859d89a5584004db9354721c9c596bc1bd');
  assert.equal(metadata.provenanceStatus, 'official-download-byte-match');
  assert.equal(metadata.officialDownload.verifiedOn, '2026-10-08');
  assert.equal(metadata.officialDownload.sha256, metadata.workbookSha256);
  assert.match(metadata.sourceUrl, /^https:\/\/webgate\.ec\.europa\.eu\//);
  assert.match(metadata.officialDownload.verification, /not an automatic current-version check/);
  const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(metadata), digest(getMetadata()));
});
