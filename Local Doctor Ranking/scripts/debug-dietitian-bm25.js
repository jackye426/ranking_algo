/**
 * Debug script to check BM25 searchable text for BDA dietitians
 */

const { loadMergedData } = require('./apply-ranking');
const { filterBySpecialty } = require('./specialty-filter');
const { createWeightedSearchableText, rankPractitionersBM25 } = require('./parallel-ranking-package/testing/services/local-bm25-service');

const practitioners = loadMergedData('merged_all_sources_2026-02-02T13-37-43.json');

console.log(`\n=== Debugging BM25 for BDA Dietitians ===\n`);

// Get BDA dietitians
const bdaDietitians = practitioners.filter(p => 
  p._originalRecord?.sources?.includes('BDA Dietitian File')
);

console.log(`Total BDA dietitians: ${bdaDietitians.length}`);

// Sample a few BDA dietitians
const samples = bdaDietitians.slice(0, 3);

samples.forEach((p, idx) => {
  console.log(`\n--- Sample ${idx + 1}: ${p.name} ---`);
  console.log(`Specialty: ${p.specialty}`);
  console.log(`Clinical Expertise: ${p.clinical_expertise?.substring(0, 150) || 'EMPTY'}`);
  console.log(`About: ${p.about?.substring(0, 150) || 'EMPTY'}`);
  
  const searchableText = createWeightedSearchableText(p);
  console.log(`\nSearchable Text (first 300 chars): ${searchableText.substring(0, 300)}`);
  console.log(`Searchable Text Length: ${searchableText.length}`);
  console.log(`Searchable Text Word Count: ${searchableText.split(/\s+/).length}`);
});

// Test BM25 search on filtered dietitians
console.log(`\n=== Testing BM25 Search ===\n`);

const filtered = filterBySpecialty(practitioners, { manualSpecialty: 'Dietitian' });
console.log(`Filtered practitioners: ${filtered.length}`);

const query = 'IBS dietitian';
console.log(`Query: "${query}"`);

// Test BM25 on filtered list
const results = rankPractitionersBM25(filtered, query);

console.log(`\nTop 5 BM25 Results:`);
results.slice(0, 5).forEach((r, i) => {
  const isBDA = r.document._originalRecord?.sources?.includes('BDA Dietitian File');
  console.log(`${i+1}. ${r.document.name}${isBDA ? ' [BDA]' : ''} - Score: ${r.score.toFixed(4)}`);
  const searchableText = createWeightedSearchableText(r.document);
  console.log(`   Searchable text length: ${searchableText.length}`);
  console.log(`   Clinical expertise: ${r.document.clinical_expertise?.substring(0, 80) || 'EMPTY'}`);
});

// Check if any BDA dietitians have non-zero scores
const bdaResults = results.filter(r => 
  r.document._originalRecord?.sources?.includes('BDA Dietitian File')
);

console.log(`\nBDA Dietitians in results: ${bdaResults.length}`);
const nonZeroBDA = bdaResults.filter(r => r.score > 0);
console.log(`BDA Dietitians with non-zero scores: ${nonZeroBDA.length}`);

if (nonZeroBDA.length > 0) {
  console.log(`\nTop BDA dietitian with non-zero score:`);
  const top = nonZeroBDA[0];
  console.log(`Name: ${top.document.name}`);
  console.log(`Score: ${top.score.toFixed(4)}`);
  const searchableText = createWeightedSearchableText(top.document);
  console.log(`Searchable text: ${searchableText.substring(0, 200)}`);
} else {
  console.log(`\n⚠️  All BDA dietitians have zero scores!`);
  console.log(`\nChecking first BDA dietitian in results:`);
  if (bdaResults.length > 0) {
    const first = bdaResults[0];
    const searchableText = createWeightedSearchableText(first.document);
    console.log(`Name: ${first.document.name}`);
    console.log(`Score: ${first.score.toFixed(4)}`);
    console.log(`Searchable text: ${searchableText.substring(0, 300)}`);
    console.log(`Query tokens: ${query.toLowerCase().split(/\s+/).filter(w => w.length > 2).join(', ')}`);
    
    // Check if query terms appear in searchable text
    const queryTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const lowerSearchable = searchableText.toLowerCase();
    queryTerms.forEach(term => {
      const found = lowerSearchable.includes(term);
      console.log(`  Query term "${term}": ${found ? 'FOUND' : 'NOT FOUND'}`);
    });
  }
}
