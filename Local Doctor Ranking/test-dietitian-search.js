/**
 * Test if dietitians are being retrieved in searches
 */

const { loadMergedData } = require('./apply-ranking');
const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { filterBySpecialty } = require('./specialty-filter');

const practitioners = loadMergedData('merged_all_sources_2026-02-02T13-47-20.json');

console.log(`\n=== Testing Dietitian Search ===\n`);
console.log(`Total practitioners: ${practitioners.length}`);

// Test 1: Search without specialty filter
console.log(`\n1. Search: "I need a dietitian for IBS" (no filter)`);
const filters1 = {
  q_patient: 'I need a dietitian for IBS',
  variantName: 'parallel-v2'
};
const results1 = getBM25Shortlist(practitioners, filters1, 12);
console.log(`   Results: ${results1.results.length}`);
const dietitiansInResults1 = results1.results.filter(r => r.document.specialty === 'Dietitian');
console.log(`   Dietitians in results: ${dietitiansInResults1.length}`);
if (dietitiansInResults1.length > 0) {
  console.log(`   Top dietitian: ${dietitiansInResults1[0].document.name} (score: ${dietitiansInResults1[0].score.toFixed(3)})`);
}

// Test 2: Search with specialty filter
console.log(`\n2. Search: "I need a dietitian for IBS" (with Dietitian filter)`);
const filtered = filterBySpecialty(practitioners, { manualSpecialty: 'Dietitian' });
console.log(`   Filtered to: ${filtered.length} dietitians`);
const filters2 = {
  q_patient: 'I need a dietitian for IBS',
  variantName: 'parallel-v2'
};
const results2 = getBM25Shortlist(filtered, filters2, 12);
console.log(`   Results: ${results2.results.length}`);
results2.results.forEach((r, i) => {
  const isBDA = r.document._originalRecord?.sources?.includes('BDA Dietitian File');
  console.log(`   ${i+1}. ${r.document.name} - ${r.document.specialty}${isBDA ? ' [BDA]' : ''} (score: ${r.score.toFixed(3)})`);
  console.log(`      Clinical expertise: ${r.document.clinical_expertise?.substring(0, 80) || 'EMPTY'}`);
});

// Test 3: Check BDA dietitians specifically
console.log(`\n3. BDA Dietitian Analysis`);
const bdaDietitians = practitioners.filter(p => 
  p._originalRecord?.sources?.includes('BDA Dietitian File')
);
console.log(`   Total BDA dietitians: ${bdaDietitians.length}`);
const withExpertise = bdaDietitians.filter(p => p.clinical_expertise && p.clinical_expertise.trim().length > 0);
const withAbout = bdaDietitians.filter(p => p.about && p.about.trim().length > 0);
console.log(`   With clinical_expertise: ${withExpertise.length}`);
console.log(`   With about: ${withAbout.length}`);
console.log(`   With both: ${bdaDietitians.filter(p => (p.clinical_expertise && p.clinical_expertise.trim()) && (p.about && p.about.trim())).length}`);

// Test 4: Check if BDA dietitians appear in search results
console.log(`\n4. BDA Dietitians in Search Results`);
const filters3 = {
  q_patient: 'IBS dietitian',
  variantName: 'parallel-v2'
};
const results3 = getBM25Shortlist(filtered, filters3, 20);
const bdaInResults = results3.results.filter(r => 
  r.document._originalRecord?.sources?.includes('BDA Dietitian File')
);
console.log(`   Total results: ${results3.results.length}`);
console.log(`   BDA dietitians in results: ${bdaInResults.length}`);
if (bdaInResults.length > 0) {
  console.log(`   Top BDA dietitians:`);
  bdaInResults.slice(0, 5).forEach((r, i) => {
    console.log(`   ${i+1}. ${r.document.name} - score: ${r.score.toFixed(3)}`);
    console.log(`      Clinical expertise: ${r.document.clinical_expertise?.substring(0, 80) || 'EMPTY'}`);
  });
} else {
  console.log(`   ⚠️  No BDA dietitians found in top 20 results!`);
  console.log(`   Checking top results:`);
  results3.results.slice(0, 5).forEach((r, i) => {
    const isBDA = r.document._originalRecord?.sources?.includes('BDA Dietitian File');
    console.log(`   ${i+1}. ${r.document.name}${isBDA ? ' [BDA]' : ''} - score: ${r.score.toFixed(3)}`);
  });
}
