'use strict';

// Exact device classification is deliberately separate from professional evidence.
// The pinned workbook contains no code-to-clinician competency mapping.
const corpus = require('./data/emdn-2026.json');
const MAPPING_VERSION = 'docmap-emdn-search-expansion-v1';
const CODE_PATTERN = /^[A-Z](?:[0-9]{2}){0,6}$/;

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

// Only cosmetic normalization. Never truncate, repair digits, or select an ancestor
// when an exact code is absent from this release.
function normalizeCode(input) {
  if (typeof input !== 'string' || input.length > 64) return null;
  const code = input.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

const rawByCode = new Map(corpus.nodes.map(node => [node.code, node]));
if (rawByCode.size !== corpus.nodes.length) throw new Error('Duplicate EMDN code in pinned taxonomy');
const mappingLimit = 'Search terms guide retrieval only. A classification code does not establish a clinician\'s experience, competence, device assessment role or regulatory approval.';
const mappings = freeze({
  Z11030692: {
    id: 'emdn-2026-ct-software-v1', version: MAPPING_VERSION, code: 'Z11030692',
    kind: 'reviewed-search-expansion', label: 'CT software',
    text: 'Computed tomography is the recorded modality. The clinical application must be supplied separately.',
    queryTerms: ['computed tomography', 'CT imaging'],
    concepts: [{ kind: 'modality', label: 'Computed tomography', text: 'computed tomography CT imaging' }],
    clarification: { required: true, type: 'clinical-application', question: 'What is the CT software used for, and which clinical condition or body area should the expert know?' },
    limitations: ['This code does not identify cardiac CT, coronary disease, a reporting activity, an algorithm or validation experience.', mappingLimit]
  },
  Z12040118: {
    id: 'emdn-2026-video-dermatoscope-v1', version: MAPPING_VERSION, code: 'Z12040118',
    kind: 'reviewed-search-expansion', label: 'Video dermatoscopy',
    text: 'Video dermatoscopy provides a search focus for dermoscopy and examination of skin lesions.',
    queryTerms: ['dermoscopy', 'dermatoscopy', 'skin lesion examination'],
    concepts: [{ kind: 'modality', label: 'Dermoscopy', text: 'dermoscopy dermatoscopy skin lesion examination' }],
    clarification: { required: false, type: null, question: null },
    limitations: ['The code does not establish primary-care use, an AI diagnostic aid, malignancy detection performance or study-evaluation expertise.', mappingLimit]
  },
  J010792: {
    id: 'emdn-2026-cardiac-implant-monitoring-v1', version: MAPPING_VERSION, code: 'J010792',
    kind: 'reviewed-search-expansion', label: 'Remote monitoring of implanted cardiac devices',
    text: 'The recorded device purpose is remote monitoring of active implantable cardiac devices.',
    queryTerms: ['remote monitoring', 'implantable cardiac devices', 'cardiac device follow-up'],
    concepts: [{ kind: 'clinical_activity', label: 'Implanted cardiac device monitoring', text: 'remote monitoring implantable cardiac devices cardiac device follow-up' }],
    clarification: { required: false, type: null, question: null },
    limitations: ['The code does not identify a particular device model, clinician role, monitoring workflow or software-validation activity.', mappingLimit]
  }
});

function getMapping(input) {
  const code = normalizeCode(input);
  return code && Object.hasOwn(mappings, code) ? mappings[code] : null;
}

function getClarification(input) {
  const code = normalizeCode(input), node = code && rawByCode.get(code);
  if (!node) return null;
  if (mappings[code]) return mappings[code].clarification;
  if (code === 'V92') return freeze({ required: true, type: 'device-purpose', question: 'What does the software do, and which clinical condition, procedure or workflow should the expert know?' });
  return freeze({ required: true, type: node.level < 3 || !node.terminal ? 'specific-device-or-purpose' : 'clinical-application', question: 'What is the device used for, and what clinical expertise should the expert have?' });
}

const byCode = new Map();
for (const raw of corpus.nodes) {
  const path = [];
  for (let length = 1; length <= raw.code.length; length += 2) {
    const ancestor = rawByCode.get(raw.code.slice(0, length));
    if (!ancestor) throw new Error(`Missing EMDN ancestor for ${raw.code}`);
    path.push({ code: ancestor.code, term: ancestor.termRaw.trim() });
  }
  byCode.set(raw.code, freeze({
    code: raw.code, term: raw.termRaw.trim(), termRaw: raw.termRaw,
    category: raw.code[0], categoryDescription: rawByCode.get(raw.code[0]).termRaw.trim(),
    level: raw.level, terminal: raw.terminal, parentCode: raw.level === 1 ? null : raw.code.slice(0, -2), path,
    source: { sheet: corpus.metadata.sourceSheet, row: raw.row, range: `C${raw.row}:F${raw.row}` },
    release: corpus.metadata.release, taxonomyVersion: corpus.metadata.taxonomyVersion,
    clarification: getClarification(raw.code)
  }));
}
const metadata = freeze({ ...corpus.metadata, sourceUrl: corpus.metadata.officialDownload.url, mappingVersion: MAPPING_VERSION, reviewedMappingCodes: Object.keys(mappings) });

function lookup(input) {
  const code = normalizeCode(input);
  return code ? byCode.get(code) || null : null;
}
function getMetadata() { return metadata; }

/**
 * Recognise deliberate classification input, not arbitrary clinical abbreviations.
 * Long digit-bearing codes are distinctive enough to accompany ordinary language.
 * Short codes require explicit framing, code-only input or nearby device wording.
 * Single-letter categories require EMDN framing; a standalone letter is ambiguous.
 * Invalid explicitly entered tokens are reported rather than repaired or discarded.
 */
function detectCodes(input) {
  const message = typeof input === 'string' ? input.slice(0, 20000) : '';
  const references = [], seenPositions = new Set();
  const add = (token, start, explicit) => {
    if (seenPositions.has(start)) return;
    seenPositions.add(start);
    const normalized = token.toUpperCase(), syntactic = normalizeCode(normalized);
    const node = syntactic && byCode.get(syntactic);
    references.push({ input: token, code: normalized, valid: Boolean(node), start, end: start + token.length, explicit, reason: node ? null : syntactic ? 'not-in-release' : 'invalid-format' });
  };
  // Explicit lists may contain commas, slashes, semicolons, ampersands or "and".
  // Each list token must begin with a letter followed by digits, or be one letter.
  const listPattern = /\bEMDN\b\s*(?:(?:codes?|categories|category)\b\s*)?[:#=–-]?\s*/gi;
  for (const marker of message.matchAll(listPattern)) {
    let cursor = marker.index + marker[0].length;
    let count = 0;
    while (cursor < message.length && count < 20) {
      const remaining = message.slice(cursor);
      const token = remaining.match(/^[A-Za-z](?:[0-9_-][A-Za-z0-9_-]*|[ \t]+[0-9][0-9 \t]*)?(?![A-Za-z0-9_])/);
      if (!token) break;
      add(token[0], cursor, true);
      cursor += token[0].length; count += 1;
      const separator = message.slice(cursor).match(/^\s*(?:[,;/&+]\s*|\band\b\s*)/i);
      if (!separator) break;
      cursor += separator[0].length;
    }
  }
  for (const token of message.matchAll(/\b[A-Za-z][0-9][A-Za-z0-9_-]*(?![A-Za-z0-9_-])/g)) {
    const normalized = token[0].toUpperCase(), node = byCode.get(normalized);
    const digitCount = token[0].match(/^[A-Za-z]([0-9]+)/)[1].length;
    const context = message.slice(Math.max(0, token.index - 45), token.index + token[0].length + 60);
    const shortDeviceContext = node && /\b(?:EMDN|device|devices|software|classification|nomenclature|codes?|categories|category)\b/i.test(context);
    if ((node && digitCount >= 4) || digitCount >= 5 || shortDeviceContext) add(token[0], token.index, false);
  }
  // Bare, exact code(s) are an intentional lookup. Prose such as "C19 concerns"
  // or "vitamin B12" is not converted to classification context.
  if (!references.length) {
    const trimmed = message.trim();
    const codeOnly = /^(?:[A-Za-z][0-9][A-Za-z0-9_-]*)(?:\s*(?:[,;/&+]\s*|\band\b\s*)[A-Za-z][0-9][A-Za-z0-9_-]*)*[.!?]?$/i;
    if (codeOnly.test(trimmed)) {
      for (const token of message.matchAll(/[A-Za-z][0-9][A-Za-z0-9_-]*/g)) add(token[0], token.index, false);
    }
  }
  references.sort((a, b) => a.start - b.start);
  const ambiguousCategories = !references.length && /^[A-Za-z]$/.test(message.trim()) ? [message.trim().toUpperCase()] : [];
  return {
    codes: [...new Set(references.filter(r => r.valid).map(r => r.code))],
    invalidCodes: [...new Set(references.filter(r => !r.valid).map(r => r.code))],
    ambiguousCategories, references
  };
}

module.exports = { lookup, normalizeCode, detectCodes, getMapping, getClarification, getMetadata, MAPPING_VERSION };
