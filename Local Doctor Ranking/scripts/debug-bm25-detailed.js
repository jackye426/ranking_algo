/**
 * Detailed BM25 debugging for dietitians
 */

const { loadMergedData } = require('./apply-ranking');
const { filterBySpecialty } = require('./specialty-filter');
const { createWeightedSearchableText, rankPractitionersBM25 } = require('./parallel-ranking-package/testing/services/local-bm25-service');

const practitioners = loadMergedData('merged_all_sources_2026-02-02T13-37-43.json');

// Tokenize function (same as BM25)
const tokenize = (text) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2);
};

const filtered = filterBySpecialty(practitioners, { manualSpecialty: 'Dietitian' });
console.log(`Filtered practitioners: ${filtered.length}\n`);

// Find a BDA dietitian with IBS in their expertise
const bdaWithIBS = filtered.find(p => 
  p._originalRecord?.sources?.includes('BDA Dietitian File') &&
  p.clinical_expertise?.toLowerCase().includes('ibs')
);

if (!bdaWithIBS) {
  console.log('No BDA dietitian with IBS found');
  process.exit(1);
}

console.log(`Found BDA dietitian with IBS: ${bdaWithIBS.name}`);
console.log(`Clinical expertise: ${bdaWithIBS.clinical_expertise?.substring(0, 200)}`);

const searchableText = createWeightedSearchableText(bdaWithIBS);
console.log(`\nSearchable text length: ${searchableText.length}`);
console.log(`Searchable text (first 500 chars): ${searchableText.substring(0, 500)}`);

const tokens = tokenize(searchableText);
console.log(`\nTokens count: ${tokens.length}`);
console.log(`Sample tokens: ${tokens.slice(0, 50).join(', ')}`);

const query = 'IBS dietitian';
const queryTokens = tokenize(query);
console.log(`\nQuery: "${query}"`);
console.log(`Query tokens: ${queryTokens.join(', ')}`);

// Check if query tokens appear in document tokens
queryTokens.forEach(term => {
  const count = tokens.filter(t => t === term).length;
  const found = count > 0;
  console.log(`  Token "${term}": ${found ? `FOUND (${count} times)` : 'NOT FOUND'}`);
});

// Now manually calculate BM25 score for this document
const k1 = 1.5;
const b = 0.75;

// Build all documents
const documents = filtered.map(p => ({
  practitioner: p,
  text: createWeightedSearchableText(p),
  tokens: null
}));

documents.forEach(doc => {
  doc.tokens = tokenize(doc.text);
});

const avgDocLength = documents.reduce((sum, doc) => sum + doc.tokens.length, 0) / documents.length;
console.log(`\nAverage document length: ${avgDocLength.toFixed(2)}`);
console.log(`This document length: ${tokens.length}`);

// Calculate document frequencies
const docFreq = {};
queryTokens.forEach(term => {
  docFreq[term] = documents.filter(doc => doc.tokens.includes(term)).length;
});

console.log(`\nDocument frequencies:`);
queryTokens.forEach(term => {
  console.log(`  "${term}": ${docFreq[term]} documents (out of ${documents.length})`);
});

// Calculate BM25 score for this document
let score = 0;
const docLength = tokens.length;

queryTokens.forEach(term => {
  const termFreq = tokens.filter(t => t === term).length;
  const docFreqForTerm = docFreq[term] || 1;
  const idf = Math.log((documents.length - docFreqForTerm + 0.5) / (docFreqForTerm + 0.5));
  
  const numerator = termFreq * (k1 + 1);
  const denominator = termFreq + k1 * (1 - b + b * (docLength / avgDocLength));
  const termScore = idf * (numerator / denominator);
  
  console.log(`\nTerm "${term}":`);
  console.log(`  Term frequency in doc: ${termFreq}`);
  console.log(`  Document frequency: ${docFreqForTerm}`);
  console.log(`  IDF: ${idf.toFixed(4)}`);
  console.log(`  Numerator: ${numerator.toFixed(4)}`);
  console.log(`  Denominator: ${denominator.toFixed(4)}`);
  console.log(`  Term score: ${termScore.toFixed(4)}`);
  
  score += termScore;
});

console.log(`\nTotal BM25 score (manual calc): ${score.toFixed(4)}`);

// Now test with actual BM25 function
console.log(`\n=== Testing with Actual BM25 Function ===`);
const bm25Results = rankPractitionersBM25(filtered, query);
const lauraResult = bm25Results.find(r => r.document.name === bdaWithIBS.name);

if (lauraResult) {
  console.log(`\nLaura Coxden BM25 result:`);
  console.log(`  Score: ${lauraResult.score.toFixed(4)}`);
  console.log(`  Rank: ${lauraResult.rank}`);
  
  // Check top 5 results
  console.log(`\nTop 5 BM25 Results:`);
  bm25Results.slice(0, 5).forEach((r, i) => {
    const isBDA = r.document._originalRecord?.sources?.includes('BDA Dietitian File');
    console.log(`  ${i+1}. ${r.document.name}${isBDA ? ' [BDA]' : ''} - Score: ${r.score.toFixed(4)}`);
  });
  
  // Check if any have non-zero scores
  const nonZero = bm25Results.filter(r => r.score > 0);
  console.log(`\nResults with non-zero scores: ${nonZero.length} out of ${bm25Results.length}`);
} else {
  console.log(`\n⚠️  Laura Coxden not found in BM25 results`);
}
