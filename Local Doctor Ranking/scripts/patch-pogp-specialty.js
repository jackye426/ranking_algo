/**
 * One-off: set specialty to "Physiotherapy" for all POGP records in merged_all_sources_latest.json
 */
const fs = require('fs');
const path = require('path');

const latestPath = path.join(__dirname, '../data/merged_all_sources_latest.json');
const data = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
let count = 0;
(data.records || []).forEach((r) => {
  if (r.sources && r.sources.includes('POGP')) {
    r.specialty = 'Physiotherapy';
    count++;
  }
});
fs.writeFileSync(latestPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Patched', count, 'POGP records to specialty Physiotherapy');
