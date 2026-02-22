/**
 * V7 Data Loader
 *
 * Loads and merges V7 normalized (for BM25) and canonical (for checklist_profile) datasets
 * into a unified practitioner list. Mapping: normalized id <-> canonical via legacy_ids.
 */

const fs = require('fs');
const path = require('path');

/**
 * Load JSON that may be wrapped as { records: [...] } or be the array itself.
 * For very large files, consider streaming; here we use sync read for typical V7 sizes.
 *
 * @param {string} filePath - Absolute or relative path to JSON file
 * @returns {Object} Parsed JSON (object with .records or array)
 */
function loadJsonFile(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

/**
 * Build map: normalized_practitioner_id -> canonical checklist_profile
 * Canonical records have legacy_ids (e.g. ['bupa_1']) and checklist_profile.
 *
 * @param {Object} canonicalData - Loaded canonical JSON { records: [...] }
 * @returns {Map<string, Object>} normalized_id -> checklist_profile
 */
function buildChecklistProfileMap(canonicalData) {
  const map = new Map();
  const records = canonicalData.records || [];
  for (const rec of records) {
    const profile = rec.checklist_profile || null;
    const legacyIds = rec.legacy_ids || [];
    if (!profile) continue;
    for (const lid of legacyIds) {
      if (lid && typeof lid === 'string') {
        map.set(lid.trim(), profile);
      }
    }
    if (rec.practitioner_id && !map.has(rec.practitioner_id)) {
      map.set(rec.practitioner_id, profile);
    }
  }
  return map;
}

/**
 * Ensure a practitioner object has fields BM25 expects (e.g. practitioner_id, clinical_expertise).
 * Normalized records may use "id"; we ensure practitioner_id is set.
 *
 * @param {Object} normRecord - Single record from practitioners_normalized.json
 * @returns {Object} Same object with practitioner_id set if missing
 */
function ensurePractitionerId(normRecord) {
  const out = { ...normRecord };
  if (!out.practitioner_id && out.id) {
    out.practitioner_id = out.id;
  }
  if (!out.practitioner_id && out.name) {
    out.practitioner_id = out.id || `prac_${(out.name + Math.random()).slice(0, 20)}`;
  }
  return out;
}

/**
 * Load V7 normalized and canonical datasets and merge into one practitioner list.
 * Each merged practitioner has:
 * - All normalized fields (for BM25 search)
 * - checklist_profile from canonical (for checklist matching), or null if no match
 *
 * @param {Object} options - Options
 * @param {string} [options.normalizedDataPath] - Path to practitioners_normalized.json (relative to this file's dir or absolute)
 * @param {string} [options.canonicalDataPath] - Path to practitioners_canonical.json
 * @param {string} [options.baseDir] - Base directory for relative paths (default: project root one level up from Local Doctor Ranking)
 * @returns {{ practitioners: Object[], checklistProfileByNormalizedId: Map<string, Object> }}
 */
function loadV7Data(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, '..');
  const normalizedPath = options.normalizedDataPath || path.join(baseDir, 'V7 dataset', 'practitioners_normalized.json');
  const canonicalPath = options.canonicalDataPath || path.join(baseDir, 'V7 dataset', 'practitioners_canonical.json');

  const normalizedResolved = path.isAbsolute(normalizedPath) ? normalizedPath : path.resolve(baseDir, normalizedPath);
  const canonicalResolved = path.isAbsolute(canonicalPath) ? canonicalPath : path.resolve(baseDir, canonicalPath);

  if (!fs.existsSync(normalizedResolved)) {
    throw new Error(`V7 normalized data not found: ${normalizedResolved}`);
  }
  if (!fs.existsSync(canonicalResolved)) {
    throw new Error(`V7 canonical data not found: ${canonicalResolved}`);
  }

  const normalizedData = loadJsonFile(normalizedResolved);
  const canonicalData = loadJsonFile(canonicalResolved);

  const checklistProfileByNormalizedId = buildChecklistProfileMap(canonicalData);
  const normalizedRecords = normalizedData.records || [];

  const practitioners = normalizedRecords.map((rec) => {
    const withId = ensurePractitionerId(rec);
    const normalizedId = withId.practitioner_id || withId.id;
    const checklistProfile = (normalizedId && checklistProfileByNormalizedId.get(normalizedId)) || null;
    return {
      ...withId,
      checklist_profile: checklistProfile,
    };
  });

  console.log(`[V7 Data] Loaded ${practitioners.length} practitioners (normalized); ${checklistProfileByNormalizedId.size} have checklist_profile`);
  return {
    practitioners,
    checklistProfileByNormalizedId,
  };
}

module.exports = {
  loadV7Data,
  buildChecklistProfileMap,
  loadJsonFile,
  ensurePractitionerId,
};
