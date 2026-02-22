/**
 * V6 Progressive Ranking Example
 * 
 * Demonstrates how to use the progressive ranking algorithm
 */

const { rankPractitionersProgressive } = require('./index');

// Example usage
async function example() {
  // Load practitioners (example - replace with your data loading)
  // const practitioners = require('../cardiology.json').practitioners;
  
  const userQuery = "I need SVT ablation";
  
  const results = await rankPractitionersProgressive(
    practitioners, // Your practitioner array
    userQuery,
    {
      maxIterations: 5,
      maxProfilesReviewed: 30,
      batchSize: 12,
      fetchStrategy: 'stage-b', // or 'stage-a'
      targetTopK: 3,
      model: 'gpt-5.1',
      shortlistSize: 12,
      // Optional V2 options
      // messages: [],
      // location: null,
      // rankingConfig: './ranking-weights.json',
      // specialty: 'Cardiology',
      // patient_age_group: 'Adult',
      // languages: ['English'],
      // gender: null,
      // manualSpecialty: null,
    }
  );
  
  // Check results
  console.log(`\n=== V6 Progressive Ranking Results ===`);
  console.log(`Query: "${userQuery}"`);
  console.log(`Iterations: ${results.metadata.iterations}`);
  console.log(`Profiles Evaluated: ${results.metadata.profilesEvaluated}`);
  console.log(`Profiles Fetched: ${results.metadata.profilesFetched}`);
  console.log(`Termination Reason: ${results.metadata.terminationReason}`);
  console.log(`\nQuality Breakdown:`);
  console.log(`  Excellent: ${results.metadata.qualityBreakdown.excellent}`);
  console.log(`  Good: ${results.metadata.qualityBreakdown.good}`);
  console.log(`  Ill-fit: ${results.metadata.qualityBreakdown.illFit}`);
  
  const top3AllExcellent = results.results.slice(0, 3).every(r => r.fit_category === 'excellent');
  console.log(`\nTop 3 All Excellent: ${top3AllExcellent ? '✅' : '❌'}`);
  
  console.log(`\n=== Top 12 Results ===`);
  results.results.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.document.name}`);
    console.log(`   Fit: ${r.fit_category} | Score: ${r.score.toFixed(3)} | Found in iteration: ${r.iteration_found}`);
    console.log(`   Reason: ${r.evaluation_reason}`);
  });
  
  // Iteration details
  if (results.metadata.iterationDetails.length > 0) {
    console.log(`\n=== Iteration Details ===`);
    results.metadata.iterationDetails.forEach(detail => {
      console.log(`Iteration ${detail.iteration}:`);
      console.log(`  Profiles fetched: ${detail.profilesFetched}`);
      console.log(`  Profiles evaluated: ${detail.profilesEvaluated}`);
      console.log(`  Top 3 all excellent: ${detail.top3AllExcellent ? '✅' : '❌'}`);
      console.log(`  Quality: Excellent=${detail.qualityBreakdown.excellent}, Good=${detail.qualityBreakdown.good}, Ill-fit=${detail.qualityBreakdown.illFit}`);
    });
  }
}

// Uncomment to run
// example().catch(console.error);

module.exports = { example };
