/**
 * Check that BDA and POGP sources are present in the integrated data and used in ranking.
 * Streams the integrated file to count by source, then runs sample ranking queries.
 *
 * Usage: node scripts/check-bda-pogp-sources.js [path-to-integrated.json]
 */

const path = require('path');
const fs = require('fs');
const { chain } = require('stream-chain');
const Pick = require('stream-json/filters/Pick');
const { streamArray } = require('stream-json/streamers/StreamArray');

const DATA_DIR = path.join(__dirname, '..');
const DEFAULT_FILE = path.join(DATA_DIR, 'integrated_practitioners_with_isrctn_latest.json');

function hasSource(record, name) {
  const sources = record.sources || [];
  return Array.isArray(sources) && sources.some((s) => String(s).toLowerCase().includes(name.toLowerCase()));
}

function loadAndCountBySource(dataFilePath) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let withPOGP = 0;
    let withBDA = 0;
    const pipeline = chain([
      fs.createReadStream(dataFilePath),
      Pick.withParser({ filter: 'records' }),
      streamArray(),
    ]);
    pipeline.on('data', (chunk) => {
      const record = chunk.value;
      if (!record || typeof record !== 'object') return;
      total++;
      if (hasSource(record, 'POGP')) withPOGP++;
      if (hasSource(record, 'BDA')) withBDA++;
    });
    pipeline.on('end', () => resolve({ total, withPOGP, withBDA }));
    pipeline.on('error', reject);
  });
}

async function main() {
  const dataFile = process.argv[2] || DEFAULT_FILE;
  if (!fs.existsSync(dataFile)) {
    console.error('File not found:', dataFile);
    process.exit(1);
  }
  console.log('Checking sources in:', dataFile);
  console.log('');

  const { total, withPOGP, withBDA } = await loadAndCountBySource(dataFile);
  console.log('--- Counts in integrated file (record.sources) ---');
  console.log('Total records:', total.toLocaleString());
  console.log('Records with POGP in sources:', withPOGP.toLocaleString());
  console.log('Records with BDA in sources:', withBDA.toLocaleString());
  console.log('');

  // Load practitioners via apply-ranking (transform includes sources on practitioner)
  const { loadMergedData } = require(path.join(DATA_DIR, 'apply-ranking'));
  const { rankPractitioners } = require(path.join(DATA_DIR, 'ranking-v2-package'));

  console.log('Loading and transforming practitioners (streaming)...');
  const practitioners = await loadMergedData(dataFile);
  const pogpPractitioners = practitioners.filter((p) => (p.sources || []).some((s) => String(s).toLowerCase().includes('pogp')));
  const bdaPractitioners = practitioners.filter((p) => (p.sources || []).some((s) => String(s).toLowerCase().includes('bda')));
  console.log('After transform:');
  console.log('  Practitioners with POGP in sources:', pogpPractitioners.length.toLocaleString());
  console.log('  Practitioners with BDA in sources:', bdaPractitioners.length.toLocaleString());
  if (pogpPractitioners.length > 0) {
    const sample = pogpPractitioners[0];
    console.log('  Sample POGP practitioner:', sample.name, '| specialty:', sample.specialty, '| sources:', sample.sources);
  }
  if (bdaPractitioners.length > 0) {
    const sample = bdaPractitioners[0];
    console.log('  Sample BDA practitioner:', sample.name, '| specialty:', sample.specialty, '| sources:', sample.sources);
  }
  console.log('');

  // Run ranking for dietitian and physio queries; report how many BDA/POGP in top 20
  console.log('--- Ranking check (BDA/POGP in top 20) ---');
  const dietitianQuery = 'dietitian for IBS';
  const physioQuery = 'pelvic physiotherapist';

  const dietitianResult = await rankPractitioners(practitioners, dietitianQuery, { shortlistSize: 20 });
  const physioResult = await rankPractitioners(practitioners, physioQuery, { shortlistSize: 20 });

  const bdaInDietitian = (dietitianResult.results || []).filter((r) =>
    (r.document?.sources || []).some((s) => String(s).toLowerCase().includes('bda'))
  );
  const pogpInPhysio = (physioResult.results || []).filter((r) =>
    (r.document?.sources || []).some((s) => String(s).toLowerCase().includes('pogp'))
  );

  console.log(`Query: "${dietitianQuery}"`);
  console.log('  Top 20 results:', dietitianResult.results?.length || 0);
  console.log('  BDA practitioners in top 20:', bdaInDietitian.length);
  if (bdaInDietitian.length > 0) {
    bdaInDietitian.slice(0, 5).forEach((r, i) => console.log(`    ${i + 1}. ${r.document.name} (${r.document.specialty}) sources: ${(r.document.sources || []).join(', ')}`));
  }
  console.log('');
  console.log(`Query: "${physioQuery}"`);
  console.log('  Top 20 results:', physioResult.results?.length || 0);
  console.log('  POGP practitioners in top 20:', pogpInPhysio.length);
  if (pogpInPhysio.length > 0) {
    pogpInPhysio.slice(0, 5).forEach((r, i) => console.log(`    ${i + 1}. ${r.document.name} (${r.document.specialty}) sources: ${(r.document.sources || []).join(', ')}`));
  }

  console.log('');
  console.log('--- Summary ---');
  if (withBDA === 0 && withPOGP === 0) {
    console.log('No BDA or POGP sources found in the integrated file. Merge may not have included BDA/POGP.');
  } else {
    console.log('BDA and/or POGP are present in the data and are included in the ranking pool (no filter by source).');
    if (bdaInDietitian.length === 0 && bdaPractitioners.length > 0) console.log('Note: No BDA practitioners in top 20 for dietitian query – check specialty/signals (e.g. Dietitian filter).');
    if (pogpInPhysio.length === 0 && pogpPractitioners.length > 0) console.log('Note: No POGP practitioners in top 20 for physio query – check specialty/signals.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
