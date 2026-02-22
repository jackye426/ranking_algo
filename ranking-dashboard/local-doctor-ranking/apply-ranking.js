/**
 * Apply Ranking Algorithm to Merged Doctor Data
 * 
 * This script loads the merged doctor data file and applies the parallel ranking
 * algorithm to rank doctors based on user queries.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const fs = require('fs');
const path = require('path');
const { chain } = require('stream-chain');
const Pick = require('stream-json/filters/Pick');
const { streamArray } = require('stream-json/streamers/StreamArray');

// Import ranking algorithm and BM25 service
const { getSessionContextParallel } = require('./parallel-ranking-package/algorithm/session-context-variants');
const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');

// Insurance alias map (variant name -> canonical name) for filtering and display
let insuranceAliasMapLower = {};
try {
  const aliasPath = path.join(__dirname, 'data', 'insurance-aliases.json');
  if (fs.existsSync(aliasPath)) {
    const raw = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));
    for (const [k, v] of Object.entries(raw)) {
      if (k && v) insuranceAliasMapLower[k.toLowerCase().trim()] = v;
    }
  }
} catch (e) {
  // use empty map
}

/**
 * Get canonical insurance name for filtering/display (uses insurance-aliases.json).
 */
function getCanonicalInsuranceName(raw) {
  const k = (raw || '').trim().toLowerCase();
  return (k && insuranceAliasMapLower[k]) ? insuranceAliasMapLower[k] : (raw || '').trim();
}

/**
 * Build procedure_volumes_display from procedures_completed (BUPA) and procedure_volumes_phin (PHIN).
 */
function buildProcedureVolumesDisplay(record) {
  const out = [];
  const completed = record.procedures_completed || [];
  for (const p of completed) {
    const desc = p.description || p.procedure_group_name || '';
    const vol = p.count_numeric != null ? p.count_numeric : (typeof p.count === 'string' && p.count ? parseFloat(p.count) : null);
    if (desc) out.push({ name_or_description: desc, volume_count: vol, source: 'BUPA' });
  }
  const phin = record.procedure_volumes_phin || [];
  for (const p of phin) {
    const desc = p.procedure_name || p.description || p.name || '';
    const vol = p.volume != null ? p.volume : (p.count != null ? p.count : null);
    if (desc) out.push({ name_or_description: desc, volume_count: vol, source: 'PHIN' });
  }
  return out;
}

/**
 * Transform merged doctor record to practitioner format expected by BM25
 */
function transformMergedRecord(record) {
  // Extract primary location
  const primaryLocation = record.locations && record.locations.length > 0
    ? record.locations[0]
    : null;
  
  const addressLocality = primaryLocation?.hospital || 
                          primaryLocation?.address?.split(',')[0] || 
                          null;
  
  // Extract postcode from locations
  const postcode = record.locations?.find(loc => loc.postcode)?.postcode || null;
  
  // Transform procedures array to procedure_groups format
  const procedureGroups = (record.procedures || []).map(proc => ({
    procedure_group_name: proc
  }));
  
  // Extract subspecialties from specialties array (exclude primary specialty)
  const primarySpecialty = record.specialty || '';
  const subspecialties = (record.specialties || [])
    .filter(s => s !== primarySpecialty && s.trim() !== '')
    .map(s => s.trim());
  
  // Resolve profile_url: single field or first truthy from profile_urls (cromwell, hca, bupa)
  // Handle profile_urls as object or JSON string
  let profileUrlsObj = null;
  if (record.profile_urls) {
    if (typeof record.profile_urls === 'string') {
      try {
        profileUrlsObj = JSON.parse(record.profile_urls);
      } catch (e) {
        // If parsing fails, skip
      }
    } else if (typeof record.profile_urls === 'object') {
      profileUrlsObj = record.profile_urls;
    }
  }
  
  const profileUrl = record.profile_url
    || (profileUrlsObj && (profileUrlsObj.cromwell || profileUrlsObj.hca || profileUrlsObj.bupa || profileUrlsObj.spire))
    || (profileUrlsObj && Object.values(profileUrlsObj).find(v => v && v.trim() && v !== 'null'))
    || (record.urls && Array.isArray(record.urls) && record.urls.length > 0 ? record.urls[0] : null);

  // Insurance: top-level record.insurance (BUPA etc.) or record.phin_data.insurance (PHIN)
  const insuranceDetails = record.insurance?.insurance_details
    || record.phin_data?.insurance?.insurance_details
    || [];
  const acceptedInsurers = record.phin_data?.insurance?.accepted_insurers || [];
  const seen = new Set();
  const insuranceProviders = [];
  for (const d of insuranceDetails) {
    const raw = (d.insurer || d.name || '').trim();
    if (!raw) continue;
    const canonical = getCanonicalInsuranceName(raw) || raw;
    if (seen.has(canonical.toLowerCase())) continue;
    seen.add(canonical.toLowerCase());
    insuranceProviders.push({
      name: canonical,
      displayName: canonical,
      insurer_id: d.insurer_id,
      raw: raw || undefined,
    });
  }
  for (const a of acceptedInsurers) {
    const raw = (typeof a === 'string' ? a : (a && (a.name || a.insurer)) || '').trim();
    if (!raw) continue;
    const canonical = getCanonicalInsuranceName(raw) || raw;
    if (seen.has(canonical.toLowerCase())) continue;
    seen.add(canonical.toLowerCase());
    insuranceProviders.push({
      name: canonical,
      displayName: canonical,
      insurer_id: typeof a === 'object' && a != null ? a.id : undefined,
      raw: raw || undefined,
    });
  }
  const procedureVolumesDisplay = buildProcedureVolumesDisplay(record);
  const phinPatientFeedback = record.phin_data?.patient_feedback ?? record.patient_feedback ?? null;
  const phinPatientSatisfaction = record.patient_satisfaction_phin ?? record.phin_data?.patient_satisfaction_phin ?? null;
  
  // PHIN-style: whether practitioner offers remote consultation (true/false)
  const phinRemoteConsultation = deriveRemoteConsultation(record);
  
  return {
    practitioner_id: record.id || `practitioner_${Math.random().toString(36).substr(2, 9)}`,
    id: record.id,
    name: record.name || 'Unknown',
    title: record.title || null,
    specialty: record.specialty || null,
    subspecialties: subspecialties,
    description: record.about || '',
    about: record.about || '',
    profile_url: profileUrl || null,
    // BDA dietitians: clinical_expertise is a comma-separated list (e.g., "Diabetes, IBS, Obesity")
    // Other sources: may have structured format "Procedure: X; Condition: Y"
    // Priority: clinical_expertise > clinical_interests > bio
    clinical_expertise: record.clinical_expertise || record.clinical_interests || record.bio || '',
    address_locality: addressLocality,
    postal_code: postcode,
    address_country: 'United Kingdom',
    verified: !!record.gmc_number,
    gmc_number: record.gmc_number || null,
    year_qualified: record.year_qualified || null,
    years_experience: record.years_experience || null,
    gender: record.gender || null,
    languages: record.languages || [],
    qualifications: record.qualifications || [],
    professional_memberships: record.professional_memberships || [],
    memberships: record.professional_memberships || [],
    patient_age_group: record.patient_age_group || [],
    nhs_base: record.nhs_base || null,
    nhs_posts: record.nhs_posts || [],
    sources: record.sources || [],
    
    // Quality metrics (set defaults if not available)
    rating_value: null, // Not available in merged data
    review_count: 0,
    
    // Procedure groups
    procedure_groups: procedureGroups,
    total_admission_count: 0,
    procedure_count: procedureGroups.length,
    
    // Insurance providers (canonical names via alias map)
    insuranceProviders,
    
    // Display-only (no ranking): Reddit, ISRCTN, research, PHIN, procedure volumes
    reddit_patient_notes: record.reddit_patient_notes ?? null,
    reddit_recommendation_level: record.reddit_recommendation_level ?? null,
    reddit_recommendation_sources: record.reddit_recommendation_sources ?? null,
    isrctn_trials: record.isrctn_trials ?? null,
    isrctn_relational_trial_links: record.isrctn_relational_trial_links ?? null,
    has_isrctn_trials: !!(record.isrctn_trials && record.isrctn_trials.length > 0),
    research_interests: record.research_interests ?? null,
    phin_patient_feedback: phinPatientFeedback,
    phin_patient_satisfaction: phinPatientSatisfaction,
    phin_remote_consultation: phinRemoteConsultation,
    procedure_volumes_display: procedureVolumesDisplay,
    
    // Store original record for reference
    _originalRecord: record
  };
}

/**
 * Derive whether the practitioner offers remote consultation (video/telephone/online).
 * Used for PHIN data section: phin_remote_consultation (true/false).
 */
function deriveRemoteConsultation(record) {
  if (record == null) return false;
  // Explicit PHIN/source field
  if (typeof record.phin_data?.remote_consultation === 'boolean') return record.phin_data.remote_consultation;
  if (typeof record.remote_consultations === 'boolean' && record.remote_consultations) return true;
  if (record.remote_video_consultations === true || record.remote_audio_consultations === true) return true;
  // BUPA-style consultation_types array
  const types = record.consultation_types;
  if (Array.isArray(types)) {
    const lower = types.map(t => (t && String(t)).toLowerCase());
    if (lower.some(t => t.includes('video') || t.includes('telephone') || t.includes('telehealth') || t.includes('online') || t.includes('remote'))) return true;
  }
  // Locations: "Telephone / video consultation" or "Online"
  const locs = record.locations || [];
  for (const loc of locs) {
    const name = (loc.hospital || loc.name || '').toLowerCase();
    if (name.includes('telephone') || name.includes('video consultation') || name.includes('online')) return true;
  }
  return false;
}

/**
 * Load merged data via streaming (for files too large for readFileSync string limit)
 */
function loadMergedDataStreaming(dataFilePath) {
  return new Promise((resolve, reject) => {
    const practitioners = [];
    const pipeline = chain([
      fs.createReadStream(dataFilePath),
      Pick.withParser({ filter: 'records' }),
      streamArray(),
    ]);
    pipeline.on('data', (chunk) => {
      const record = chunk.value;
      if (record && typeof record === 'object') practitioners.push(transformMergedRecord(record));
    });
    pipeline.on('end', () => {
      console.log(`[Loading] Transformed ${practitioners.length} practitioners (streaming)`);
      console.log(`[Loading] Sample specialties:`, 
        [...new Set(practitioners.map(p => p.specialty).filter(Boolean))].slice(0, 10)
      );
      resolve(practitioners);
    });
    pipeline.on('error', reject);
  });
}

/**
 * Load and transform merged data (sync for small files; streams if file would exceed Node string limit).
 * Returns a Promise that resolves with the practitioner array (so server can await when using streaming).
 */
function loadMergedData(dataFilePath) {
  console.log(`[Loading] Reading data from: ${dataFilePath}`);
  const stat = fs.statSync(dataFilePath);
  const useStreaming = stat.size > 400 * 1024 * 1024; // ~400MB+: use streaming to avoid "string longer than 0x1fffffe8"
  if (useStreaming) {
    console.log(`[Loading] File large (${Math.round(stat.size / 1024 / 1024)}MB), using streaming parser`);
    return loadMergedDataStreaming(dataFilePath);
  }
  try {
    const rawData = fs.readFileSync(dataFilePath, 'utf8');
    const data = JSON.parse(rawData);
    console.log(`[Loading] Total records in file: ${data.total_records || data.records?.length || 0}`);
    const practitioners = (data.records || []).map(transformMergedRecord);
    console.log(`[Loading] Transformed ${practitioners.length} practitioners`);
    console.log(`[Loading] Sample specialties:`, 
      [...new Set(practitioners.map(p => p.specialty).filter(Boolean))].slice(0, 10)
    );
    return Promise.resolve(practitioners);
  } catch (err) {
    if (err.message && err.message.includes('Cannot create a string longer than')) {
      console.log(`[Loading] Sync read limit hit, falling back to streaming parser`);
      return loadMergedDataStreaming(dataFilePath);
    }
    return Promise.reject(err);
  }
}

/**
 * Rank doctors for a given query
 */
async function rankDoctors(practitioners, userQuery, options = {}) {
  const {
    shortlistSize = 10,
    messages = [],
    location = null
  } = options;
  
  // 🚫 BLACKLIST FILTER - Apply FIRST (exclude blacklisted doctors)
  // Never surface blacklisted practitioners
  const beforeBlacklist = practitioners.length;
  practitioners = practitioners.filter(p => !(p.blacklisted === true));
  const blacklistedCount = beforeBlacklist - practitioners.length;
  if (blacklistedCount > 0) {
    console.log(`[Ranking] 🚫 Filtered out ${blacklistedCount} blacklisted practitioner(s)`);
  }
  
  console.log(`\n[Ranking] Query: "${userQuery}"`);
  console.log(`[Ranking] Searching through ${practitioners.length} practitioners...`);
  
  // Step 1: Get session context using parallel ranking algorithm
  const startTime = Date.now();
  const sessionContext = await getSessionContextParallel(userQuery, messages, location);
  const processingTime = Date.now() - startTime;
  
  console.log(`[Ranking] Session context generated in ${processingTime}ms`);
  console.log(`[Ranking] Patient Query (q_patient): "${sessionContext.q_patient}"`);
  console.log(`[Ranking] Intent Terms: ${sessionContext.intent_terms.slice(0, 5).join(', ')}${sessionContext.intent_terms.length > 5 ? '...' : ''}`);
  console.log(`[Ranking] Anchor Phrases: ${sessionContext.anchor_phrases.join(', ') || 'None'}`);
  console.log(`[Ranking] Goal: ${sessionContext.intentData.goal}, Specificity: ${sessionContext.intentData.specificity}`);
  console.log(`[Ranking] Confidence: ${sessionContext.intentData.confidence}`);
  
  // Step 2: Apply BM25 ranking with two-stage retrieval
  const filters = {
    q_patient: sessionContext.q_patient,
    intent_terms: sessionContext.intent_terms,
    anchor_phrases: sessionContext.anchor_phrases,
    intentData: sessionContext.intentData,
    variantName: 'parallel'
  };
  
  const rankingStartTime = Date.now();
  const results = getBM25Shortlist(practitioners, filters, shortlistSize);
  const rankingTime = Date.now() - rankingStartTime;
  
  console.log(`[Ranking] BM25 ranking completed in ${rankingTime}ms`);
  console.log(`[Ranking] Top ${results.results.length} results:\n`);
  
  // Display results
  results.results.forEach((result, index) => {
    const doc = result.document;
    console.log(`${index + 1}. ${doc.name}${doc.title ? ` - ${doc.title}` : ''}`);
    console.log(`   Specialty: ${doc.specialty || 'N/A'}`);
    if (doc.subspecialties && doc.subspecialties.length > 0) {
      console.log(`   Subspecialties: ${doc.subspecialties.slice(0, 3).join(', ')}${doc.subspecialties.length > 3 ? '...' : ''}`);
    }
    console.log(`   Score: ${result.score?.toFixed(4) || result.score || 'N/A'}`);
    if (result.bm25Score !== undefined && result.bm25Score !== null) {
      console.log(`   BM25 Score: ${result.bm25Score.toFixed(4)}`);
    }
    if (result.rescoringScore !== undefined && result.rescoringScore !== null) {
      console.log(`   Rescoring Score: ${result.rescoringScore.toFixed(4)}`);
    }
    if (result.rescoringInfo) {
      const info = result.rescoringInfo;
      console.log(`   Matches: ${info.highSignalMatches} high-signal, ${info.pathwayMatches} pathway, ${info.anchorMatches} anchor`);
    }
    if (doc.gmc_number) {
      console.log(`   GMC: ${doc.gmc_number}`);
    }
    console.log('');
  });
  
  return {
    results: results.results,
    queryInfo: results.queryInfo,
    sessionContext: sessionContext,
    totalTime: processingTime + rankingTime
  };
}

/**
 * Main function - example usage
 */
async function main() {
  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.error('\n[Error] OPENAI_API_KEY not set in .env file');
    console.error('Please create a .env file in parallel-ranking-package/ folder with:');
    console.error('OPENAI_API_KEY=your_actual_api_key_here\n');
    process.exit(1);
  }
  
  // Load data
  const dataFilePath = path.join(__dirname, 'data', 'merged_all_sources_20260124_150256.json');
  if (!fs.existsSync(dataFilePath)) {
    console.error(`[Error] Data file not found: ${dataFilePath}`);
    process.exit(1);
  }
  
  const practitioners = loadMergedData(dataFilePath);
  
  // Example queries to test
  const testQueries = [
    "I need SVT ablation",
    "I have chest pain",
    "I need a cardiologist for atrial fibrillation",
    "Looking for a general surgeon for hernia repair"
  ];
  
  // Get query from command line arguments or use first test query
  const userQuery = process.argv[2] || testQueries[0];
  
  if (!userQuery) {
    console.log('Usage: node apply-ranking.js "your query here"');
    console.log('\nExample queries:');
    testQueries.forEach((q, i) => {
      console.log(`  ${i + 1}. "${q}"`);
    });
    process.exit(0);
  }
  
  // Rank doctors
  try {
    await rankDoctors(practitioners, userQuery, {
      shortlistSize: 10
    });
  } catch (error) {
    console.error('\n[Error] Ranking failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

// V7: load normalized + canonical merged practitioners (for variant 'v7')
const { loadV7Data } = require('./v7-data-loader');

// Export for use as module
module.exports = {
  loadMergedData,
  loadMergedDataStreaming,
  transformMergedRecord,
  rankDoctors,
  getCanonicalInsuranceName,
  loadV7Data,
};
