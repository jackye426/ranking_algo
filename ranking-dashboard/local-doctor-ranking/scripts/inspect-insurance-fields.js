/**
 * Inspect integrated records to find where insurance data lives (any key/column).
 * Prints top-level keys and hunts for insurance-related paths.
 *
 * Usage: node scripts/inspect-insurance-fields.js [path-to-integrated.json]
 */

const path = require('path');
const fs = require('fs');
const { chain } = require('stream-chain');
const Pick = require('stream-json/filters/Pick');
const { streamArray } = require('stream-json/streamers/StreamArray');

const DATA_DIR = path.join(__dirname, '..');
const DEFAULT_FILE = path.join(DATA_DIR, 'integrated_practitioners_with_isrctn_latest.json');

function allKeys(obj, prefix = '') {
  if (obj === null || typeof obj !== 'object') return [];
  const keys = [];
  for (const k of Object.keys(obj)) {
    const path = prefix ? prefix + '.' + k : k;
    keys.push(path);
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      keys.push(...allKeys(obj[k], path));
    } else if (Array.isArray(obj[k]) && obj[k].length > 0 && typeof obj[k][0] === 'object') {
      keys.push(path + '[]');
      keys.push(...allKeys(obj[k][0], path + '[]'));
    }
  }
  return keys;
}

function collectInsurerNames(record, out) {
  if (!record || typeof record !== 'object') return;
  function add(name) {
    const n = (name || '').trim();
    if (n) out.set(n, (out.get(n) || 0) + 1);
  }
  // record.insurance.* (BUPA etc.)
  const ins = record.insurance;
  if (ins) {
    if (Array.isArray(ins.insurance_details)) {
      ins.insurance_details.forEach((d) => add(d.insurer || d.name || d.displayName));
    }
    if (Array.isArray(ins.accepted_insurers)) {
      ins.accepted_insurers.forEach((s) => add(typeof s === 'string' ? s : (s && s.name) || (s && s.insurer)));
    }
  }
  // record.phin_data.insurance (PHIN)
  const phinIns = record.phin_data?.insurance;
  if (phinIns) {
    if (Array.isArray(phinIns.insurance_details)) {
      phinIns.insurance_details.forEach((d) => add(d.insurer || d.name));
    }
    if (Array.isArray(phinIns.accepted_insurers)) {
      phinIns.accepted_insurers.forEach((s) => add(typeof s === 'string' ? s : (s && s.name) || (s && s.insurer)));
    }
  }
  // Top-level
  const topArr = record.accepted_insurers || record.insurers || record.insurance_providers;
  if (Array.isArray(topArr)) {
    topArr.forEach((s) => add(typeof s === 'string' ? s : (s && s.name) || (s && s.insurer)));
  }
}

function run(dataFilePath) {
  let firstRecord = null;
  let keyUnion = new Set();
  const insurerCounts = new Map();
  let recordsWithAnyInsurance = 0;
  let sampleRecordsWithInsurance = [];

  const pipeline = chain([
    fs.createReadStream(dataFilePath),
    Pick.withParser({ filter: 'records' }),
    streamArray(),
  ]);
  pipeline.on('data', (chunk) => {
    const record = chunk.value;
    if (!record || typeof record !== 'object') return;
    if (!firstRecord) firstRecord = record;
    allKeys(record).forEach((k) => keyUnion.add(k));
    const before = insurerCounts.size;
    collectInsurerNames(record, insurerCounts);
    if (insurerCounts.size > before || (record.insurance && Object.keys(record.insurance).length > 0)) {
      recordsWithAnyInsurance++;
      if (sampleRecordsWithInsurance.length < 3) sampleRecordsWithInsurance.push(record);
    }
  });
  pipeline.on('end', () => {
    console.log('--- Top-level keys in first record (sample) ---');
    if (firstRecord) {
      console.log(Object.keys(firstRecord).sort().join(', '));
    }
    console.log('\n--- All key paths containing "insur" or "accept" ---');
    const relevant = [...keyUnion].filter((k) => /insur|accept/i.test(k)).sort();
    relevant.forEach((k) => console.log('  ', k));
    if (relevant.length === 0) {
      console.log('  (none found; listing all top-level keys from first record)');
      if (firstRecord) {
        Object.keys(firstRecord).forEach((k) => console.log('  ', k));
      }
    }
    console.log('\n--- Sample: record.insurance (first record) ---');
    if (firstRecord && firstRecord.insurance) {
      console.log(JSON.stringify(firstRecord.insurance, null, 2).slice(0, 2000));
    } else {
      console.log('  (no record.insurance)');
    }
    console.log('\n--- Other possible insurance keys (first record) ---');
    for (const key of ['accepted_insurers', 'insurers', 'insurance_providers', 'insurance_list']) {
      if (firstRecord && firstRecord[key] !== undefined) {
        console.log('  record.' + key + ':', Array.isArray(firstRecord[key]) ? `array[${firstRecord[key].length}]` : typeof firstRecord[key], JSON.stringify(firstRecord[key]).slice(0, 300));
      }
    }
    console.log('\n--- Records with any collected insurer names ---');
    console.log('  Count:', recordsWithAnyInsurance);
    console.log('  Unique insurer names found:', insurerCounts.size);
    if (insurerCounts.size > 0) {
      const sorted = [...insurerCounts.entries()].sort((a, b) => b[1] - a[1]);
      sorted.forEach(([name, count]) => console.log('    ', count.toString().padStart(6), name));
    }
    if (sampleRecordsWithInsurance.length > 0) {
      console.log('\n--- Sample record that has insurance (first one) ---');
      const r = sampleRecordsWithInsurance[0];
      console.log('  id:', r.id);
      console.log('  record.insurance:', JSON.stringify(r.insurance, null, 2)?.slice(0, 1500));
      for (const key of ['accepted_insurers', 'insurers', 'insurance_providers']) {
        if (r[key] !== undefined) console.log('  record.' + key + ':', JSON.stringify(r[key])?.slice(0, 500));
      }
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
