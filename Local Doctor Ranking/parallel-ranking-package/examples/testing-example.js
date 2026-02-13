/**
 * Testing Example
 * 
 * Shows how to use the testing framework programmatically
 */

const { getSessionContextParallel } = require('../algorithm/session-context-variants');

async function testQuery() {
  console.log('=== Testing Example ===\n');
  
  // Test case: SVT ablation query
  const testCase = {
    id: 'test-001',
    name: 'SVT ablation query',
    userQuery: 'I need SVT ablation',
    conversation: [
      { role: 'user', content: 'I need SVT ablation' },
      { role: 'assistant', content: 'I can help you find a specialist...' }
    ]
  };
  
  console.log('Test Case:', testCase.name);
  console.log('Query:', testCase.userQuery);
  console.log('\nRunning algorithm...\n');
  
  // Run algorithm
  const result = await getSessionContextParallel(
    testCase.userQuery,
    testCase.conversation,
    null
  );
  
  // Display results
  console.log('Results:');
  console.log('--------');
  console.log('Patient Query:', result.q_patient);
  console.log('Intent Terms:', result.intent_terms.slice(0, 5).join(', '), '...');
  console.log('Anchor Phrases:', result.anchor_phrases.join(', '));
  console.log('Processing Time:', result.processingTime, 'ms');
  
  console.log('\nIntent Classification:');
  console.log('  Goal:', result.intentData.goal);
  console.log('  Specificity:', result.intentData.specificity);
  console.log('  Confidence:', result.intentData.confidence);
  console.log('  Primary Intent:', result.intentData.primary_intent);
  console.log('  Is Ambiguous:', result.intentData.isQueryAmbiguous);
  console.log('  Negative Terms:', result.intentData.negative_terms.length > 0 
    ? result.intentData.negative_terms.slice(0, 3).join(', ') + '...'
    : '[] (disabled)');
  
  console.log('\nInsights:');
  console.log('  Specialty:', result.insights.specialty || 'null');
  console.log('  Urgency:', result.insights.urgency);
  console.log('  Symptoms:', result.insights.symptoms.join(', ') || 'none');
  
  // Evaluate query clarity
  console.log('\nQuery Analysis:');
  if (result.intentData.isQueryAmbiguous) {
    console.log('  ⚠️  Query is AMBIGUOUS');
    console.log('  → Negative terms disabled');
    console.log('  → Broader results expected');
  } else {
    console.log('  ✅ Query is CLEAR');
    console.log('  → Negative terms enabled');
    console.log('  → Aggressive filtering expected');
  }
  
  console.log('\n=== Test Complete ===');
}

// Run test
testQuery().catch(console.error);
