/**
 * Test script to check if dietitians are being retrieved correctly
 */

const { loadMergedData } = require('./apply-ranking');
const { filterBySpecialty } = require('./specialty-filter');

const practitioners = loadMergedData('merged_all_sources_2026-02-02T13-37-43.json');

console.log(`\n=== Dietitian Analysis ===\n`);
console.log(`Total practitioners: ${practitioners.length}`);

// Check BDA dietitians
const bdaDietitians = practitioners.filter(p => 
  p._originalRecord?.sources?.includes('BDA Dietitian File')
);
console.log(`BDA Dietitians: ${bdaDietitians.length}`);

if (bdaDietitians.length > 0) {
  const sample = bdaDietitians[0];
  console.log(`\nSample BDA Dietitian:`);
  console.log(`  ID: ${sample.id}`);
  console.log(`  Name: ${sample.name}`);
  console.log(`  Specialty: ${sample.specialty}`);
  console.log(`  Clinical Expertise: ${sample.clinical_expertise?.substring(0, 100) || 'EMPTY'}`);
  console.log(`  About: ${sample.about?.substring(0, 100) || 'EMPTY'}`);
  console.log(`  Original Sources: ${sample._originalRecord?.sources?.join(', ')}`);
}

// Test specialty filter
console.log(`\n=== Testing Specialty Filter ===\n`);
const filtered = filterBySpecialty(practitioners, { manualSpecialty: 'Dietitian' });
console.log(`Filtered by "Dietitian": ${filtered.length} practitioners`);

// Check if BDA dietitians are in filtered results
const bdaInFiltered = filtered.filter(p => 
  p._originalRecord?.sources?.includes('BDA Dietitian File')
);
console.log(`BDA Dietitians in filtered results: ${bdaInFiltered.length}`);

// Check all dietitians
const allDietitians = practitioners.filter(p => p.specialty === 'Dietitian');
console.log(`\nAll practitioners with specialty="Dietitian": ${allDietitians.length}`);

// Check if any have empty clinical_expertise
const emptyExpertise = bdaDietitians.filter(p => !p.clinical_expertise || p.clinical_expertise.trim() === '');
console.log(`BDA Dietitians with empty clinical_expertise: ${emptyExpertise.length}`);

if (emptyExpertise.length > 0) {
  console.log(`\nSample with empty expertise:`);
  const sample = emptyExpertise[0];
  console.log(`  Name: ${sample.name}`);
  console.log(`  About: ${sample.about?.substring(0, 150) || 'EMPTY'}`);
  console.log(`  Original clinical_interests: ${sample._originalRecord?.clinical_interests?.substring(0, 150) || 'EMPTY'}`);
}
