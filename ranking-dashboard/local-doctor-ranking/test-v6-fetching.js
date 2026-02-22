/**
 * Test V6 fetching to see why only 5 profiles are returned
 */

const { loadMergedData } = require('./apply-ranking');
const { filterBySpecialty } = require('./specialty-filter');
const { getBM25StageATopN, getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { getSessionContextParallelV2 } = require('./parallel-ranking-package/algorithm/session-context-variants');

async function main() {
  const practitioners = loadMergedData('merged_all_sources_2026-02-02T13-47-20.json');
  
  console.log(`\n=== Testing V6 Fetching ===\n`);
  
  // Filter by dietitian specialty
  const filtered = filterBySpecialty(practitioners, { manualSpecialty: 'Dietitian' });
  console.log(`Filtered practitioners: ${filtered.length}`);
  
  const bdaDietitians = filtered.filter(p => 
    p._originalRecord?.sources?.includes('BDA Dietitian File')
  );
  console.log(`BDA dietitians: ${bdaDietitians.length}`);
  
  const query = "I'm looking for a nutrition specialist experienced in IBS";
  
  // Get session context
  const sessionContext = await getSessionContextParallelV2(query, [], null, {
    specialty: 'Dietitian'
  });
  
  // Build filters
  const filters = {
    q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
    safe_lane_terms: sessionContext.safe_lane_terms || [],
    anchor_phrases: sessionContext.anchor_phrases || [],
    intent_terms: sessionContext.intent_terms || [],
    intentData: sessionContext.intentData || null,
    variantName: 'parallel-v2',
  };
  
  console.log(`\n=== Testing Stage A Fetching ===\n`);
  console.log(`Requesting 36 profiles (batchSize * 3)...`);
  const stageAResults = getBM25StageATopN(filtered, filters, 36);
  console.log(`Stage A returned: ${stageAResults.length} profiles`);
  
  const stageAWithScores = stageAResults.filter(r => r.score > 0);
  const stageAZeroScores = stageAResults.filter(r => r.score === 0);
  console.log(`  With scores > 0: ${stageAWithScores.length}`);
  console.log(`  With score = 0: ${stageAZeroScores.length}`);
  
  const stageABDA = stageAResults.filter(r => 
    r.document._originalRecord?.sources?.includes('BDA Dietitian File')
  );
  console.log(`  BDA dietitians: ${stageABDA.length}`);
  
  console.log(`\nTop 10 Stage A results:`);
  stageAResults.slice(0, 10).forEach((r, i) => {
    const isBDA = r.document._originalRecord?.sources?.includes('BDA Dietitian File');
    console.log(`  ${i+1}. ${r.document.name}${isBDA ? ' [BDA]' : ''} - Score: ${r.score.toFixed(4)}`);
  });
  
  console.log(`\n=== Testing Stage B Fetching ===\n`);
  console.log(`Requesting 36 profiles...`);
  const stageBResults = getBM25Shortlist(filtered, filters, 36);
  console.log(`Stage B returned: ${stageBResults.results?.length || 0} profiles`);
  
  const stageBWithScores = stageBResults.results?.filter(r => r.score > 0) || [];
  const stageBZeroScores = stageBResults.results?.filter(r => r.score === 0) || [];
  console.log(`  With scores > 0: ${stageBWithScores.length}`);
  console.log(`  With score = 0: ${stageBZeroScores.length}`);
  
  const stageBBDA = stageBResults.results?.filter(r => 
    r.document._originalRecord?.sources?.includes('BDA Dietitian File')
  ) || [];
  console.log(`  BDA dietitians: ${stageBBDA.length}`);
  
  console.log(`\nTop 10 Stage B results:`);
  (stageBResults.results || []).slice(0, 10).forEach((r, i) => {
    const isBDA = r.document._originalRecord?.sources?.includes('BDA Dietitian File');
    console.log(`  ${i+1}. ${r.document.name}${isBDA ? ' [BDA]' : ''} - Score: ${r.score.toFixed(4)}`);
  });
  
  // Simulate V6 fetching: already evaluated first 12
  console.log(`\n=== Simulating V6 Fetch (after evaluating first 12) ===\n`);
  const initialResults = stageBResults.results?.slice(0, 12) || [];
  const evaluatedIds = new Set(initialResults.map(r => r.document.practitioner_id || r.document.id));
  console.log(`Already evaluated: ${evaluatedIds.size} profiles`);
  
  // Try to fetch more
  const minFetchCount = Math.max(12 + 12 * 2, 12 * 3, Math.min(filtered.length, 12 + 12 * 5));
  console.log(`Requesting ${minFetchCount} profiles from Stage A...`);
  const fetchResults = getBM25StageATopN(filtered, filters, minFetchCount);
  console.log(`Fetched: ${fetchResults.length} profiles`);
  
  const newProfiles = fetchResults
    .map(r => r.document)
    .filter(doc => {
      const id = doc.practitioner_id || doc.id;
      return id && !evaluatedIds.has(id);
    })
    .slice(0, 12);
  
  console.log(`After filtering out evaluated: ${newProfiles.length} new profiles`);
  
  const newBDA = newProfiles.filter(p => 
    p._originalRecord?.sources?.includes('BDA Dietitian File')
  );
  console.log(`  BDA dietitians in new profiles: ${newBDA.length}`);
}

main().catch(console.error);
