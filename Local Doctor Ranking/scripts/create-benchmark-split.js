/**
 * Create train/holdout split for the benchmark.
 * Rule: sort test cases by id within each specialty, then take the last 5 per
 * specialty as holdout (25 total); the rest are train (75 total).
 * Handles id gaps (e.g. benchmark-cardio-018 missing): sort by id string so
 * the split is deterministic and reproducible.
 */

const path = require('path');
const fs = require('fs');

const BENCHMARK_FILE = path.join(__dirname, '../benchmarks/benchmark-test-cases-all-specialties.json');
const SPLIT_FILE = path.join(__dirname, '../benchmarks/benchmark-split.json');
const HOLDOUT_PER_SPECIALTY = 5;

function main() {
  const benchmarkPath = path.join(__dirname, BENCHMARK_FILE);
  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Benchmark file not found: ${benchmarkPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const testCases = data.testCases || [];

  // Group by expectedSpecialty
  const bySpecialty = new Map();
  for (const tc of testCases) {
    const spec = tc.expectedSpecialty || 'unknown';
    if (!bySpecialty.has(spec)) bySpecialty.set(spec, []);
    bySpecialty.get(spec).push(tc);
  }

  const holdoutIds = [];
  const trainIds = [];

  for (const [specialty, cases] of bySpecialty) {
    // Sort by id (string sort is deterministic; handles gaps like cardio-018)
    const sorted = [...cases].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const n = sorted.length;
    const holdoutCount = Math.min(HOLDOUT_PER_SPECIALTY, n);
    const splitIndex = n - holdoutCount;
    const train = sorted.slice(0, splitIndex);
    const holdout = sorted.slice(splitIndex);
    train.forEach(tc => trainIds.push(tc.id));
    holdout.forEach(tc => holdoutIds.push(tc.id));
  }

  const payload = {
    createdAt: new Date().toISOString(),
    rule: `last ${HOLDOUT_PER_SPECIALTY} per specialty by id (sort by id string within each specialty)`,
    trainIds,
    holdoutIds,
    trainCount: trainIds.length,
    holdoutCount: holdoutIds.length,
  };

  const outPath = path.join(__dirname, SPLIT_FILE);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[Split] Written to ${SPLIT_FILE}: ${trainIds.length} train, ${holdoutIds.length} holdout`);
}

main();
