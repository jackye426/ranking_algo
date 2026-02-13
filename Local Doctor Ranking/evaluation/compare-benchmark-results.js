/**
 * Compare two benchmark result files (e.g. existing vs rerun).
 * Matches cases by id; compares groundTruth (order-independent) and reports same/different.
 *
 * Usage: node compare-benchmark-results.js [existing.json] [new.json]
 * Default: benchmark-test-cases-all-specialties.json, benchmark-test-cases-sample.json
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_EXISTING = 'benchmark-test-cases-all-specialties.json';
const DEFAULT_NEW = 'benchmark-test-cases-sample.json';

function loadBenchmark(filePath) {
  const full = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
  if (!fs.existsSync(full)) {
    console.error(`File not found: ${full}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  return (data.testCases || []).map((tc) => ({ ...tc }));
}

function normalizeNames(names) {
  if (!names || !Array.isArray(names)) return new Set();
  return new Set(names.map((n) => (n || '').trim().toLowerCase()).filter(Boolean));
}

function compareCase(existing, newer) {
  const existingSet = normalizeNames(existing.groundTruth);
  const newerSet = normalizeNames(newer.groundTruth);
  const same = existingSet.size === newerSet.size && [...existingSet].every((n) => newerSet.has(n));
  const onlyInExisting = [...existingSet].filter((n) => !newerSet.has(n));
  const onlyInNew = [...newerSet].filter((n) => !existingSet.has(n));
  return { same, onlyInExisting, onlyInNew, existingSet, newerSet };
}

function main() {
  const existingPath = process.argv[2] || DEFAULT_EXISTING;
  const newPath = process.argv[3] || DEFAULT_NEW;

  console.log('[Compare] Loading existing:', existingPath);
  const existingCases = loadBenchmark(existingPath);
  console.log('[Compare] Loading new:', newPath);
  const newCases = loadBenchmark(newPath);

  const byIdExisting = new Map(existingCases.map((c) => [c.id, c]));
  const byIdNew = new Map(newCases.map((c) => [c.id, c]));

  const onlyInExisting = existingCases.filter((c) => !byIdNew.has(c.id)).map((c) => c.id);
  const onlyInNew = newCases.filter((c) => !byIdExisting.has(c.id)).map((c) => c.id);

  const compared = [];
  for (const tc of newCases) {
    const existing = byIdExisting.get(tc.id);
    if (!existing) continue;
    const result = compareCase(existing, tc);
    compared.push({
      id: tc.id,
      userQuery: (tc.userQuery || '').slice(0, 60) + (tc.userQuery && tc.userQuery.length > 60 ? '...' : ''),
      same: result.same,
      onlyInExisting: result.onlyInExisting,
      onlyInNew: result.onlyInNew,
    });
  }

  const sameCount = compared.filter((c) => c.same).length;
  const diffCount = compared.filter((c) => !c.same).length;

  console.log('\n--- Summary ---');
  console.log('Existing file cases:', existingCases.length);
  console.log('New file cases:', newCases.length);
  console.log('Matched by id:', compared.length);
  console.log('Only in existing (ids):', onlyInExisting.length, onlyInExisting.slice(0, 5).join(', '), onlyInExisting.length > 5 ? '...' : '');
  console.log('Only in new (ids):', onlyInNew.length, onlyInNew.slice(0, 5).join(', '), onlyInNew.length > 5 ? '...' : '');
  console.log('Same ground truth:', sameCount);
  console.log('Different ground truth:', diffCount);

  if (diffCount > 0) {
    console.log('\n--- Cases with different ground truth ---');
    compared
      .filter((c) => !c.same)
      .forEach((c) => {
        console.log(`  ${c.id}: only in existing: [${c.onlyInExisting.join(', ')}]; only in new: [${c.onlyInNew.join(', ')}]`);
      });
  }

  const outputPath = path.join(__dirname, 'benchmark-comparison-report.json');
  const report = {
    existingFile: existingPath,
    newFile: newPath,
    comparedAt: new Date().toISOString(),
    summary: {
      existingCases: existingCases.length,
      newCases: newCases.length,
      matched: compared.length,
      sameGroundTruth: sameCount,
      differentGroundTruth: diffCount,
      onlyInExisting: onlyInExisting.length,
      onlyInNew: onlyInNew.length,
    },
    differences: compared.filter((c) => !c.same),
    allCompared: compared,
  };
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nReport written to', outputPath);
}

main();
