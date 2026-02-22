/**
 * Basic Usage Example
 * 
 * Shows how to use the parallel ranking algorithm in a simple scenario
 */

const { getSessionContextParallel } = require('../algorithm/session-context-variants');

async function basicExample() {
  console.log('=== Basic Usage Example ===\n');
  
  // Example 1: Simple query
  const userQuery = "I need SVT ablation";
  const messages = [
    { role: 'user', content: 'I need SVT ablation' },
    { role: 'assistant', content: 'I can help you find a specialist for SVT ablation...' }
  ];
  const location = null;
  
  console.log('Query:', userQuery);
  console.log('Running parallel ranking algorithm...\n');
  
  // Get session context
  const result = await getSessionContextParallel(userQuery, messages, location);
  
  console.log('Results:');
  console.log('--------');
  console.log('Patient Query (q_patient):', result.q_patient);
  console.log('Intent Terms:', result.intent_terms.slice(0, 5).join(', '), '...');
  console.log('Anchor Phrases:', result.anchor_phrases.join(', '));
  console.log('Processing Time:', result.processingTime, 'ms');
  console.log('\nIntent Data:');
  console.log('  Goal:', result.intentData.goal);
  console.log('  Specificity:', result.intentData.specificity);
  console.log('  Confidence:', result.intentData.confidence);
  console.log('  Primary Intent:', result.intentData.primary_intent);
  console.log('  Is Query Ambiguous:', result.intentData.isQueryAmbiguous);
  console.log('  Negative Terms:', result.intentData.negative_terms.length > 0 
    ? result.intentData.negative_terms.slice(0, 3).join(', ') + '...' 
    : '[] (disabled - query is ambiguous)');
  
  console.log('\n=== Next Steps ===');
  console.log('1. Use q_patient for BM25 Stage A retrieval');
  console.log('2. Use intent_terms for Stage B rescoring');
  console.log('3. Use anchor_phrases for explicit condition boosting');
  console.log('4. Use negative_terms for wrong subspecialty penalties (if enabled)');
}

// Run example
basicExample().catch(console.error);
