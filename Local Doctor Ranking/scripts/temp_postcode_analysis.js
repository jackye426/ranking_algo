const fs = require('fs');
const data = JSON.parse(fs.readFileSync('merged_all_sources_2026-02-02T13-47-20.json', 'utf8'));

console.log('=== FIRST 5 RECORDS - LOCATION DATA ===\n');

data.records.slice(0, 5).forEach((record, idx) => {
  console.log(`Record ${idx + 1}: ${record.name}`);
  if (record.locations && record.locations.length > 0) {
    record.locations.slice(0, 3).forEach((loc, locIdx) => {
      console.log(`  Location ${locIdx + 1}:`);
      console.log(`    postcode: ${loc.postcode || 'NOT SET'}`);
      console.log(`    address: ${loc.address || 'NOT SET'}`);
      console.log(`    city: ${loc.city || 'NOT SET'}`);
      console.log(`    country: ${loc.country || 'NOT SET'}`);
    });
  } else {
    console.log('  No locations found');
  }
  console.log('');
});
