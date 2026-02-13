/**
 * Test script to verify specialty filtering works correctly
 */

const { loadMergedData } = require('./apply-ranking');
const { filterBySpecialty, getAllSpecialties, getSpecialtyStats } = require('./specialty-filter');
const fs = require('fs');
const path = require('path');

async function testSpecialtyFiltering() {
  console.log('Testing Specialty Filtering...\n');
  
  // Load data
  const dataFilePath = path.join(__dirname, 'merged_all_sources_20260124_150256.json');
  const practitioners = loadMergedData(dataFilePath);
  
  console.log(`Loaded ${practitioners.length} practitioners\n`);
  
  // Test 1: Cardiology query (should filter to Cardiology)
  console.log('Test 1: Cardiology query');
  const cardiologyIntent = {
    likely_subspecialties: [
      { name: 'Electrophysiology', confidence: 0.9 },
      { name: 'Cardiology', confidence: 0.85 }
    ]
  };
  
  const cardiologyFiltered = filterBySpecialty(practitioners, cardiologyIntent, { minConfidence: 0.4 });
  console.log(`  Filtered: ${practitioners.length} → ${cardiologyFiltered.length} (${((cardiologyFiltered.length / practitioners.length) * 100).toFixed(1)}%)`);
  console.log(`  Sample specialties:`, [...new Set(cardiologyFiltered.slice(0, 10).map(p => p.specialty))].join(', '));
  console.log('');
  
  // Test 2: General surgery query
  console.log('Test 2: General surgery query');
  const surgeryIntent = {
    likely_subspecialties: [
      { name: 'General Surgery', confidence: 0.8 },
      { name: 'Laparoscopic Surgery', confidence: 0.75 }
    ]
  };
  
  const surgeryFiltered = filterBySpecialty(practitioners, surgeryIntent, { minConfidence: 0.4 });
  console.log(`  Filtered: ${practitioners.length} → ${surgeryFiltered.length} (${((surgeryFiltered.length / practitioners.length) * 100).toFixed(1)}%)`);
  console.log(`  Sample specialties:`, [...new Set(surgeryFiltered.slice(0, 10).map(p => p.specialty))].join(', '));
  console.log('');
  
  // Test 3: No subspecialties (should return all)
  console.log('Test 3: No subspecialties inferred');
  const noIntent = {
    likely_subspecialties: []
  };
  
  const noFiltered = filterBySpecialty(practitioners, noIntent, { minConfidence: 0.4 });
  console.log(`  Filtered: ${practitioners.length} → ${noFiltered.length} (should be all)`);
  console.log(`  Match: ${noFiltered.length === practitioners.length ? '✅' : '❌'}`);
  console.log('');
  
  // Test 4: Manual specialty filter
  console.log('Test 4: Manual specialty filter (Cardiology)');
  const manualFiltered = filterBySpecialty(practitioners, {}, { manualSpecialty: 'Cardiology' });
  console.log(`  Filtered: ${practitioners.length} → ${manualFiltered.length} (${((manualFiltered.length / practitioners.length) * 100).toFixed(1)}%)`);
  console.log(`  All Cardiology: ${manualFiltered.every(p => p.specialty === 'Cardiology') ? '✅' : '❌'}`);
  console.log('');
  
  // Show specialty stats
  console.log('Top 10 Specialties:');
  const stats = getSpecialtyStats(practitioners);
  stats.slice(0, 10).forEach((stat, i) => {
    console.log(`  ${i + 1}. ${stat.specialty}: ${stat.count} doctors`);
  });
  
  console.log('\n✅ Specialty filtering tests completed!');
}

testSpecialtyFiltering().catch(console.error);
