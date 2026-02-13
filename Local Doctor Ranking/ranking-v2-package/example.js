/**
 * Example usage of the V2 Ranking Algorithm
 */

const { rankPractitioners } = require('./index');
const fs = require('fs');
const path = require('path');

async function example() {
  // Example 1: Basic usage
  console.log('=== Example 1: Basic Usage ===\n');
  
  // Load practitioners (example with cardiology)
  const practitionersPath = path.join(__dirname, '..', 'cardiology.json');
  if (!fs.existsSync(practitionersPath)) {
    console.error('Cardiology practitioners file not found. Please ensure cardiology.json exists in the parent directory.');
    return;
  }
  
  const practitionersData = JSON.parse(fs.readFileSync(practitionersPath, 'utf8'));
  const practitioners = practitionersData.practitioners || [];
  
  const userQuery = "I've been having ongoing chest tightness and was told I should see a cardiologist. Who would be the right type of specialist?";
  
  const results = await rankPractitioners(practitioners, userQuery, {
    shortlistSize: 12,
    rankingConfig: path.join(__dirname, '..', 'best-stage-a-recall-weights-desc-tuned.json'), // Optional: use custom weights
  });
  
  console.log(`Query: "${userQuery}"`);
  console.log(`\nFound ${results.results.length} results:\n`);
  
  results.results.forEach((result, index) => {
    const doc = result.document;
    console.log(`${index + 1}. ${doc.name || 'Unknown'}`);
    console.log(`   Specialty: ${doc.specialty || 'N/A'}`);
    console.log(`   Score: ${result.score.toFixed(4)}`);
    console.log(`   BM25 Score: ${result.bm25Score.toFixed(4)}`);
    if (result.rescoringInfo) {
      console.log(`   Rescoring: ${JSON.stringify(result.rescoringInfo, null, 2)}`);
    }
    console.log('');
  });
  
  console.log('\n=== Session Context ===');
  console.log(`Intent Terms: ${results.sessionContext.intent_terms.slice(0, 5).join(', ')}...`);
  console.log(`Anchor Phrases: ${results.sessionContext.anchor_phrases.join(', ')}`);
  console.log(`Safe Lane Terms: ${results.sessionContext.safe_lane_terms.join(', ')}`);
  
  // Example 2: With conversation history
  console.log('\n\n=== Example 2: With Conversation History ===\n');
  
  const messages = [
    { role: 'user', content: 'I need to see a doctor for chest pain' },
    { role: 'assistant', content: 'I can help you find a cardiologist. Can you tell me more about your symptoms?' },
    { role: 'user', content: userQuery },
  ];
  
  const resultsWithHistory = await rankPractitioners(practitioners, userQuery, {
    messages,
    shortlistSize: 5,
  });
  
  console.log(`Top 5 results with conversation history:`);
  resultsWithHistory.results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.document.name}`);
  });
  
  // Example 3: With cached session context
  console.log('\n\n=== Example 3: With Cached Session Context ===\n');
  
  // First, generate session context
  const firstResults = await rankPractitioners(practitioners, userQuery, {
    shortlistSize: 12,
  });
  
  // Use cached session context for subsequent queries
  const sessionContextCache = {
    'query-1': firstResults.sessionContext,
  };
  
  const cachedResults = await rankPractitioners(practitioners, userQuery, {
    sessionContextCache,
    sessionContextCacheId: 'query-1',
    shortlistSize: 12,
  });
  
  console.log(`Results with cached context: ${cachedResults.results.length} results`);
  console.log('(This avoids regenerating session context, useful for batch processing)');
}

// Run example
if (require.main === module) {
  example().catch(console.error);
}

module.exports = { example };
