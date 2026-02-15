/**
 * Merge BDA dietitians and POGP physiotherapists into the existing ranking dataset.
 * One run produces: base merged + BDA + POGP, compatible with apply-ranking.js.
 *
 * Usage:
 *   node merge-extra-sources.js [base-merged.json] [bda-file] [pogp-file] [--set-latest]
 * Paths can be absolute or relative to cwd. Omitted paths use defaults.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DEFAULT_BASE = path.join(DATA_DIR, 'merged_all_sources_latest.json');
const DEFAULT_BDA = path.join(DATA_DIR, 'bda_dietitians_profiles.json');
const DEFAULT_POGP = path.join(__dirname, '../../pogp_profiles_20260213_133317.json');

const { loadDietitians, transformDietitianRecord, loadExistingMerged } = require('./merge-dietitians');

/**
 * Map one POGP profile to merged record shape matching existing dataset (BUPA/HCA/Cromwell).
 * Uses same field names and formats so BM25 parseClinicalExpertise and createWeightedSearchableText match.
 */
function transformPogpRecord(profile, index) {
  const id = profile.profile_url
    ? (profile.profile_url.split('/').filter(Boolean).pop() || `pogp_${index}`)
    : `pogp_${index}`;
  const specialtyList = profile.specialties && Array.isArray(profile.specialties)
    ? profile.specialties
    : (profile.specialty ? profile.specialty.split(',').map(s => s.trim()).filter(Boolean) : []);
  const procedures = specialtyList.length ? [...specialtyList] : [];
  const conditions = specialtyList.length ? specialtyList.filter(s => /pain|dysfunction|incontinence|disease|disorder/i.test(s)) : [];
  const clinicalInterestsText = specialtyList.length ? specialtyList.join(', ') : (profile.specialty || '');
  // Match existing format: "Procedure: X; Procedure: Y; Condition: Z; Clinical Interests: ..." for parseClinicalExpertise
  const procedureSegments = procedures.map(p => `Procedure: ${p}`).join('; ');
  const conditionSegments = conditions.map(c => `Condition: ${c}`).join('; ');
  const clinicalInterests = [procedureSegments, conditionSegments, `Clinical Interests: ${clinicalInterestsText}`].filter(Boolean).join('; ');

  const aboutParts = [
    'Physiotherapy.',
    profile.member_type ? `Member type: ${profile.member_type}.` : '',
    profile.region ? `Region: ${profile.region}.` : '',
    clinicalInterestsText ? `Specialties and areas: ${clinicalInterestsText}.` : '',
  ].filter(Boolean);
  const about = aboutParts.join(' ').trim();

  const locations = profile.region
    ? [{ hospital: 'Practice', address: profile.region, postcode: '', source: 'POGP' }]
    : [];

  return {
    id,
    name: profile.name || 'Unknown',
    title: profile.member_type || null,
    specialty: 'Physiotherapy',
    specialty_source: 'POGP',
    sources: ['POGP'],
    about,
    clinical_expertise: clinicalInterests,
    clinical_interests: clinicalInterests,
    procedures,
    conditions,
    locations,
    profile_url: profile.profile_url || null,
    urls: profile.urls || [],
    specialties: specialtyList.length ? specialtyList : (profile.specialty ? [profile.specialty] : []),
    qualifications: profile.member_type ? [profile.member_type] : [],
    professional_memberships: ['POGP'],
    languages: [],
    year_qualified: null,
    years_experience: null,
    gender: null,
    patient_age_group: [],
    nhs_base: null,
    gmc_number: null,
    match_confidence: 100.0,
    match_method: 'direct',
    merge_date: new Date().toISOString(),
    conflicts: [],
    requires_review: false,
  };
}

function loadPogpProfiles(pogpFilePath) {
  if (!fs.existsSync(pogpFilePath)) {
    console.log(`[POGP] File not found (skipping): ${pogpFilePath}`);
    return [];
  }
  console.log(`[POGP] Reading: ${pogpFilePath}`);
  const data = JSON.parse(fs.readFileSync(pogpFilePath, 'utf8'));
  const profiles = data.profiles || [];
  console.log(`[POGP] Found ${profiles.length} profiles`);
  return profiles.map((p, i) => transformPogpRecord(p, i));
}

function resolvePath(value, defaultPath) {
  if (!value) return defaultPath;
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

function mergeAll(existingData, dietitians, physios) {
  // Upsert by id: existing record is replaced when BDA/POGP has same id (so structure stays current)
  const byId = new Map();
  existingData.records.forEach((r) => { if (r && r.id) byId.set(r.id, r); });
  let replacedBda = 0, replacedPogp = 0;
  dietitians.forEach((r) => {
    if (r && r.id) {
      if (byId.has(r.id)) replacedBda++;
      byId.set(r.id, r);
    }
  });
  physios.forEach((r) => {
    if (r && r.id) {
      if (byId.has(r.id)) replacedPogp++;
      byId.set(r.id, r);
    }
  });
  const mergedRecords = Array.from(byId.values());
  const existingIds = new Set(existingData.records.map((e) => e.id));
  const addedBdaCount = dietitians.filter((r) => r && r.id && !existingIds.has(r.id)).length;
  const addedPogpCount = physios.filter((r) => r && r.id && !existingIds.has(r.id)).length;
  console.log(`[Merging] BDA dietitians: ${replacedBda} updated, ${addedBdaCount} added`);
  console.log(`[Merging] POGP physios: ${replacedPogp} updated, ${addedPogpCount} added`);
  return {
    ...existingData,
    total_records: mergedRecords.length,
    merged_at: new Date().toISOString(),
    statistics: {
      ...existingData.statistics,
      bda_dietitian_records: dietitians.length,
      pogp_physio_records: physios.length,
      total_after_merge: mergedRecords.length,
    },
    records: mergedRecords,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const setLatest = argv.includes('--set-latest');
  const args = argv.filter((a) => a !== '--set-latest');

  const basePath = resolvePath(args[0], DEFAULT_BASE);
  const bdaPath = resolvePath(args[1], DEFAULT_BDA);
  const pogpPath = resolvePath(args[2], DEFAULT_POGP);

  if (!fs.existsSync(basePath)) {
    console.error('Base merged file not found:', basePath);
    process.exit(1);
  }

  const existingData = loadExistingMerged(basePath);

  let dietitians = [];
  if (fs.existsSync(bdaPath)) {
    dietitians = loadDietitians(bdaPath);
  } else {
    const csvInDataDir = path.join(DATA_DIR, 'bda_dietitians_rows.csv');
    const csvRepoRoot = path.join(__dirname, '../../data/bda_dietitians_rows.csv');
    const csvPath = fs.existsSync(csvInDataDir) ? csvInDataDir : (fs.existsSync(csvRepoRoot) ? csvRepoRoot : null);
    if (csvPath) {
      console.log('[BDA] JSON not found, trying CSV:', csvPath);
      dietitians = loadDietitians(csvPath);
    } else {
      console.log('[BDA] No BDA file found (skipping). Tried:', bdaPath, csvInDataDir, csvRepoRoot);
    }
  }

  const physios = loadPogpProfiles(pogpPath);

  const merged = mergeAll(existingData, dietitians, physios);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputPath = path.join(DATA_DIR, `merged_all_sources_${timestamp}.json`);
  console.log('[Saving] Writing:', outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), 'utf8');

  if (setLatest) {
    const latestPath = path.join(DATA_DIR, 'merged_all_sources_latest.json');
    fs.copyFileSync(outputPath, latestPath);
    console.log('[Saving] Copied to', latestPath);
  }

  console.log('\nDone.');
  console.log('  Base records:', existingData.records.length);
  console.log('  BDA in merge:', merged.statistics.bda_dietitian_records);
  console.log('  POGP in merge:', merged.statistics.pogp_physio_records);
  console.log('  Total:', merged.total_records);
  console.log('  Output:', outputPath);
  if (!setLatest) {
    console.log('  Tip: run with --set-latest to copy output to merged_all_sources_latest.json');
  }
}

if (require.main === module) main();

module.exports = {
  transformPogpRecord,
  loadPogpProfiles,
  mergeAll,
};
