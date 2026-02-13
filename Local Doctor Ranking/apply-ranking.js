/**
 * Apply Ranking Algorithm to Merged Doctor Data
 * 
 * This script loads the merged doctor data file and applies the parallel ranking
 * algorithm to rank doctors based on user queries.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const fs = require('fs');
const path = require('path');

// Import ranking algorithm and BM25 service
const { getSessionContextParallel } = require('./parallel-ranking-package/algorithm/session-context-variants');
const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');

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
    
    // Quality metrics (set defaults if not available)
    rating_value: null, // Not available in merged data
    review_count: 0,
    
    // Procedure groups
    procedure_groups: procedureGroups,
    total_admission_count: 0,
    procedure_count: procedureGroups.length,
    
    // Insurance providers
    insuranceProviders: [],
    
    // Store original record for reference
    _originalRecord: record
  };
}

/**
 * Load and transform merged data
 */
function loadMergedData(dataFilePath) {
  console.log(`[Loading] Reading data from: ${dataFilePath}`);
  
  const rawData = fs.readFileSync(dataFilePath, 'utf8');
  const data = JSON.parse(rawData);
  
  console.log(`[Loading] Total records in file: ${data.total_records || data.records?.length || 0}`);
  
  // Transform records to practitioner format
  const practitioners = (data.records || []).map(transformMergedRecord);
  
  console.log(`[Loading] Transformed ${practitioners.length} practitioners`);
  console.log(`[Loading] Sample specialties:`, 
    [...new Set(practitioners.map(p => p.specialty).filter(Boolean))].slice(0, 10)
  );
  
  return practitioners;
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
  const dataFilePath = path.join(__dirname, 'merged_all_sources_20260124_150256.json');
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

// Export for use as module
module.exports = {
  loadMergedData,
  transformMergedRecord,
  rankDoctors
};
