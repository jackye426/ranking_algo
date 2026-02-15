/**
 * List all unique insurer names in the integrated data (record.insurance.insurance_details[].insurer).
 * Use this to see what to add to insurance-aliases.json and the frontend dropdown.
 *
 * Usage: node scripts/list-insurers-in-data.js [path-to-integrated.json]
 */

const path = require('path');
const fs = require('fs');
const { chain } = require('stream-chain');
const Pick = require('stream-json/filters/Pick');
const { streamArray } = require('stream-json/streamers/StreamArray');

const DATA_DIR = path.join(__dirname, '..');
const DEFAULT_FILE = path.join(DATA_DIR, 'integrated_practitioners_with_isrctn_latest.json');

function run(dataFilePath) {
  const insurers = new Map(); // name -> count
  const pipeline = chain([
    fs.createReadStream(dataFilePath),
    Pick.withParser({ filter: 'records' }),
    streamArray(),
  ]);
  pipeline.on('data', (chunk) => {
    const record = chunk.value;
    if (!record || typeof record !== 'object') return;
    // Top-level (BUPA etc.) or PHIN: record.phin_data.insurance
    const details = record.insurance?.insurance_details
      || record.phin_data?.insurance?.insurance_details
      || [];
    for (const d of details) {
      const name = (d.insurer || d.name || '').trim();
      if (!name) continue;
      insurers.set(name, (insurers.get(name) || 0) + 1);
    }
    const accepted = record.phin_data?.insurance?.accepted_insurers || [];
    for (const a of accepted) {
      const name = (typeof a === 'string' ? a : (a && (a.name || a.insurer)) || '').trim();
      if (!name) continue;
      insurers.set(name, (insurers.get(name) || 0) + 1);
    }
  });
  pipeline.on('end', () => {
    const aliasPath = path.join(DATA_DIR, 'data', 'insurance-aliases.json');
    let aliases = {};
    if (fs.existsSync(aliasPath)) {
      aliases = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));
    }
    const canonicalNames = new Set(Object.values(aliases));
    const sorted = [...insurers.entries()].sort((a, b) => b[1] - a[1]);
    console.log('--- All insurer names in data (by frequency) ---\n');
    sorted.forEach(([name, count]) => {
      const inAliases = Object.keys(aliases).some((k) => k.toLowerCase() === name.toLowerCase()) || canonicalNames.has(name);
      console.log(`${count.toString().padStart(6)}  ${name}${inAliases ? '  [in alias file]' : '  [NOT in alias file]'}`);
    });
    console.log('\n--- Summary ---');
    console.log('Unique insurer names in data:', insurers.size);
    console.log('Canonical names in alias file:', canonicalNames.size);
    const notInAliases = sorted.filter(([name]) => {
      const keyMatch = Object.keys(aliases).some((k) => k.toLowerCase() === name.toLowerCase());
      const valMatch = canonicalNames.has(name);
      return !keyMatch && !valMatch;
    });
    if (notInAliases.length > 0) {
      console.log('Names in data but not in alias file:', notInAliases.length);
      console.log('Consider adding these to data/insurance-aliases.json and the frontend dropdown.');
    }
  });
  pipeline.on('error', (err) => {
    console.error(err);
    process.exit(1);
  });
}

const dataFile = process.argv[2] || DEFAULT_FILE;
if (!fs.existsSync(dataFile)) {
  console.error('File not found:', dataFile);
  process.exit(1);
}
console.log('Scanning:', dataFile, '\n');
run(dataFile);
