/**
 * Analyze where non–excellent-fit doctors appear in the ranking (top 3, 5, 12).
 * Reads excellent-fit-baseline.json (or --input path) and outputs rank distribution and tendencies.
 *
 * Usage: node analyze-non-excellent-fit-ranks.js [--input=excellent-fit-baseline.json]
 */

const fs = require('fs');
const path = require('path');

function getArg(name, defaultValue) {
  for (const arg of process.argv) {
    if (arg === `--${name}` && process.argv[process.argv.indexOf(arg) + 1])
      return process.argv[process.argv.indexOf(arg) + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return defaultValue;
}

const inputFile = getArg('input', 'excellent-fit-baseline.json');
const inputPath = path.isAbsolute(inputFile) ? inputFile : path.join(__dirname, inputFile);

if (!fs.existsSync(inputPath)) {
  console.error('Input not found:', inputPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const byId = data.byId || {};
const caseIds = Object.keys(byId);

// Collect all non-excellent-fit entries with rank
const allNonExcellent = [];
let casesWithAnyNonExcellent = 0;
let casesWithNonExcellentInTop3 = 0;
let casesWithNonExcellentInTop5 = 0;
let casesWithNonExcellentInTop12 = 0;

for (const id of caseIds) {
  const rec = byId[id];
  const labels = rec.metrics?.non_excellent_fit_labels || [];
  if (labels.length === 0) continue;
  casesWithAnyNonExcellent++;
  let inTop3 = false;
  let inTop5 = false;
  let inTop12 = false;
  for (const label of labels) {
    const rank = label.rank;
    allNonExcellent.push({ caseId: id, rank, name: label.name, reason: label.reason });
    if (rank >= 1 && rank <= 3) inTop3 = true;
    if (rank >= 1 && rank <= 5) inTop5 = true;
    if (rank >= 1 && rank <= 12) inTop12 = true;
  }
  if (inTop3) casesWithNonExcellentInTop3++;
  if (inTop5) casesWithNonExcellentInTop5++;
  if (inTop12) casesWithNonExcellentInTop12++;
}

// Rank distribution (1-12)
const rankCounts = Array.from({ length: 12 }, () => 0);
for (const entry of allNonExcellent) {
  if (entry.rank >= 1 && entry.rank <= 12) rankCounts[entry.rank - 1]++;
}

// Buckets: top 3, ranks 4-5, ranks 6-12
const inTop3 = allNonExcellent.filter((e) => e.rank >= 1 && e.rank <= 3);
const inRanks4to5 = allNonExcellent.filter((e) => e.rank >= 4 && e.rank <= 5);
const inRanks6to12 = allNonExcellent.filter((e) => e.rank >= 6 && e.rank <= 12);

const totalCases = caseIds.length;
const totalSlotsTop3 = totalCases * 3;
const totalSlotsTop5 = totalCases * 5;
const totalSlotsTop12 = totalCases * 12;

console.log('=== Non–excellent-fit tendency (baseline) ===\n');
console.log('Input:', inputPath);
console.log('Total test cases:', totalCases);
console.log('Total non–excellent-fit labels:', allNonExcellent.length);
console.log('Cases with at least one non–excellent fit:', casesWithAnyNonExcellent);
console.log('');

console.log('--- Where they appear (rank distribution) ---');
console.log('Rank 1:', rankCounts[0]);
console.log('Rank 2:', rankCounts[1]);
console.log('Rank 3:', rankCounts[2]);
console.log('Rank 4:', rankCounts[3]);
console.log('Rank 5:', rankCounts[4]);
console.log('Rank 6:', rankCounts[5]);
console.log('Rank 7:', rankCounts[6]);
console.log('Rank 8:', rankCounts[7]);
console.log('Rank 9:', rankCounts[8]);
console.log('Rank 10:', rankCounts[9]);
console.log('Rank 11:', rankCounts[10]);
console.log('Rank 12:', rankCounts[11]);
console.log('');

console.log('--- By bucket ---');
console.log('Non–excellent in top 3 (ranks 1–3):', inTop3.length, 'occurrences');
console.log('Non–excellent in ranks 4–5:', inRanks4to5.length, 'occurrences');
console.log('Non–excellent in ranks 6–12:', inRanks6to12.length, 'occurrences');
console.log('');

console.log('--- Cases with at least one non–excellent in slice ---');
console.log('Cases with ≥1 non–excellent in top 3:', casesWithNonExcellentInTop3, `(${((casesWithNonExcellentInTop3 / totalCases) * 100).toFixed(1)}%)`);
console.log('Cases with ≥1 non–excellent in top 5:', casesWithNonExcellentInTop5, `(${((casesWithNonExcellentInTop5 / totalCases) * 100).toFixed(1)}%)`);
console.log('Cases with ≥1 non–excellent in top 12:', casesWithNonExcellentInTop12, `(${((casesWithNonExcellentInTop12 / totalCases) * 100).toFixed(1)}%)`);
console.log('');

console.log('--- Tendency summary ---');
const pctSlotsTop3 = totalSlotsTop3 > 0 ? (inTop3.length / totalSlotsTop3) * 100 : 0;
const pctSlotsTop5 = totalSlotsTop5 > 0 ? ((inTop3.length + inRanks4to5.length) / totalSlotsTop5) * 100 : 0;
const pctSlotsTop12 = totalSlotsTop12 > 0 ? (allNonExcellent.length / totalSlotsTop12) * 100 : 0;
console.log('Of all top-3 slots, % that are non–excellent:', pctSlotsTop3.toFixed(1) + '%');
console.log('Of all top-5 slots, % that are non–excellent:', pctSlotsTop5.toFixed(1) + '%');
console.log('Of all top-12 slots, % that are non–excellent:', pctSlotsTop12.toFixed(1) + '%');
