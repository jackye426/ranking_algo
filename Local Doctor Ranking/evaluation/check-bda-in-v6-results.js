/**
 * Check if BDA dietitians are being retrieved in V6 searches
 */

const { loadMergedData } = require('./apply-ranking');
const { filterBySpecialty } = require('./specialty-filter');
const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { getSessionContextParallelV2 } = require('./parallel-ranking-package/algorithm/session-context-variants');

async function main() {
  const practitioners = loadMergedData('merged_all_sources_2026-02-02T13-47-20.json');
  
  console.log(`\n=== Checking BDA Dietitians in V6 Search ===\n`);
  
  // Filter by dietitian specialty
  const filtered = filterBySpecialty(practitioners, { manualSpecialty: 'Dietitian' });
  console.log(`Filtered practitioners: ${filtered.length}`);
  
  // Count BDA dietitians
  const bdaDietitians = filtered.filter(p => 
    p._originalRecord?.sources?.includes('BDA Dietitian File')
  );
  console.log(`BDA dietitians in filtered list: ${bdaDietitians.length}`);
  
  // Test query similar to what was used
  const query = "I'm looking for a nutrition specialist experienced in IBS, particularly post-infectious IBS triggered by antibiotics or food poisoning";
  
  console.log(`\nQuery: "${query}"`);
  
  // Get session context (same as V6 does)
  const sessionContext = await getSessionContextParallelV2(query, [], null, {
    specialty: 'Dietitian'
  });
  
  console.log(`\nSession Context:`);
  console.log(`  q_patient: ${sessionContext.q_patient}`);
  console.log(`  intent_terms: ${sessionContext.intent_terms?.slice(0, 10).join(', ')}`);
  console.log(`  anchor_phrases: ${sessionContext.anchor_phrases?.join(', ')}`);
  
  // Build filters (same as V6)
  const filters = {
    q_patient: sessionContext.q_patient || sessionContext.enrichedQuery,
    safe_lane_terms: sessionContext.safe_lane_terms || [],
    anchor_phrases: sessionContext.anchor_phrases || [],
    intent_terms: sessionContext.intent_terms || [],
    intentData: sessionContext.intentData || null,
    variantName: 'parallel-v2',
  };
  
  // Get BM25 results (Stage B with rescoring)
  console.log(`\n=== BM25 Results (Top 20) ===\n`);
  const bm25Result = getBM25Shortlist(filtered, filters, 20);
  
  console.log(`Total results: ${bm25Result.results.length}`);
  
  // Check BDA dietitians in results
  const bdaInResults = bm25Result.results.filter(r => 
    r.document._originalRecord?.sources?.includes('BDA Dietitian File')
  );
  
  console.log(`BDA dietitians in results: ${bdaInResults.length}`);
  
  // Show top results
  console.log(`\nTop 10 Results:`);
  bm25Result.results.slice(0, 10).forEach((r, i) => {
    const isBDA = r.document._originalRecord?.sources?.includes('BDA Dietitian File');
    console.log(`${i+1}. ${r.document.name}${isBDA ? ' [BDA]' : ''} - Score: ${r.score.toFixed(4)}`);
    console.log(`   Clinical expertise: ${r.document.clinical_expertise?.substring(0, 80) || 'EMPTY'}`);
  });
  
  // Show BDA dietitians specifically
  if (bdaInResults.length > 0) {
    console.log(`\n=== BDA Dietitians in Results ===\n`);
    bdaInResults.slice(0, 10).forEach((r, i) => {
      const rank = bm25Result.results.findIndex(res => res.document.name === r.document.name) + 1;
      console.log(`Rank ${rank}. ${r.document.name} - Score: ${r.score.toFixed(4)}`);
      console.log(`   Clinical expertise: ${r.document.clinical_expertise?.substring(0, 100) || 'EMPTY'}`);
    });
  } else {
    console.log(`\n⚠️  No BDA dietitians found in top 20 results!`);
    
    // Check why - look at their BM25 scores
    console.log(`\n=== Checking BDA Dietitian Scores ===\n`);
    const sampleBDA = bdaDietitians.slice(0, 5);
    sampleBDA.forEach((p, i) => {
      const result = bm25Result.results.find(r => r.document.name === p.name);
      if (result) {
        console.log(`${i+1}. ${p.name} - Rank: ${bm25Result.results.indexOf(result) + 1}, Score: ${result.score.toFixed(4)}`);
      } else {
        console.log(`${i+1}. ${p.name} - NOT IN TOP 20`);
        // Check if they're in the full results
        const allResults = getBM25Shortlist(filtered, filters, 100);
        const found = allResults.results.find(r => r.document.name === p.name);
        if (found) {
          const rank = allResults.results.indexOf(found) + 1;
          console.log(`   Found at rank ${rank} with score ${found.score.toFixed(4)}`);
        } else {
          console.log(`   Not found in top 100 results`);
        }
      }
    });
  }
}

main().catch(console.error);
