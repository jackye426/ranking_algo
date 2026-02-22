/**
 * Load benchmark question bank from CSV files.
 * Use for pre-filter + LLM benchmark generation pipeline.
 *
 * Expects CSVs in project root: "Benchmark question bank - <Specialty>.csv"
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');

/** Map CSV filename (without path) to canonical specialty name (matches specialty JSONs and expectedSpecialty). */
const CSV_TO_SPECIALTY = {
  'Benchmark question bank - cardiology.csv': 'Cardiology',
  'Benchmark question bank - General Surgery.csv': 'General surgery',
  'Benchmark question bank - Obs & Gynae.csv': 'Obstetrics and gynaecology',
  'Benchmark question bank - ophthalmology.csv': 'Ophthalmology',
  'Benchmark question bank - Trauma & Orthopaedic Surgery patient queries.csv': 'Trauma & orthopaedic surgery',
};

const QUESTION_BANK_CSV_PREFIX = 'Benchmark question bank -';
const MAX_QUESTIONS_PER_SPECIALTY = 20;

/**
 * Normalize a single line: strip surrounding quotes, trim, collapse internal quotes if needed.
 */
// Unicode curly/smart quotes (opening, closing)
const WRAP_QUOTES = [
  ['"', '"'],
  ["'", "'"],
  ['\u201C', '\u201D'],
  ['\u2018', '\u2019'],
];

function normalizeLine(line) {
  let s = (line || '').trim();
  if (!s) return '';
  let changed = true;
  while (changed && s.length >= 2) {
    changed = false;
    for (const [open, close] of WRAP_QUOTES) {
      if (s.startsWith(open) && s.endsWith(close)) {
        s = s.slice(1, -1).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

/**
 * Heuristic: skip lines that look like metadata/tags (not a full patient query).
 */
function isLikelyMetadata(text) {
  const t = text.toLowerCase();
  if (t.length < 30) return true;
  if (/^["']?practical,?\s+intent-heavy["']?$/i.test(t)) return true;
  if (/^["']?[a-z\s&-]+["']?$/i.test(t) && t.split(/\s+/).length <= 4) return true;
  return false;
}

/**
 * Parse one CSV file into an array of question strings (max 20).
 */
function parseQuestionCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const questions = [];
  for (const line of lines) {
    const q = normalizeLine(line);
    if (!q) continue;
    if (isLikelyMetadata(q)) continue;
    questions.push(q);
    if (questions.length >= MAX_QUESTIONS_PER_SPECIALTY) break;
  }
  return questions;
}

/**
 * Discover and load all question banks from CSVs in project root.
 * @returns {Array<{ specialty: string, questions: string[] }>}
 */
function getQuestionBank() {
  const result = [];
  const dirEntries = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });

  for (const entry of dirEntries) {
    if (!entry.isFile() || !entry.name.startsWith(QUESTION_BANK_CSV_PREFIX) || !entry.name.endsWith('.csv'))
      continue;
    const specialty = CSV_TO_SPECIALTY[entry.name];
    if (!specialty) continue;
    const filePath = path.join(PROJECT_ROOT, entry.name);
    const questions = parseQuestionCsv(filePath);
    result.push({ specialty, questions });
  }

  // Sort so order is consistent (alphabetically by specialty)
  result.sort((a, b) => a.specialty.localeCompare(b.specialty));

  return result;
}

/**
 * Get questions for a single specialty (by canonical name).
 * @param {string} specialty - e.g. "Cardiology", "Trauma & orthopaedic surgery"
 * @returns {string[]}
 */
function getQuestionsForSpecialty(specialty) {
  const bank = getQuestionBank();
  const found = bank.find((b) => b.specialty === specialty);
  return found ? found.questions : [];
}

/**
 * Write combined question bank to JSON for pipeline consumption.
 * Output: { bySpecialty: { "Cardiology": [...], ... }, all: [ { specialty, questions }, ... ] }
 */
function writeQuestionBankJson(outputPath) {
  const bank = getQuestionBank();
  const bySpecialty = {};
  bank.forEach(({ specialty, questions }) => {
    bySpecialty[specialty] = questions;
  });
  const payload = { bySpecialty, all: bank };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
if (require.main === module) {
  const bank = getQuestionBank();
  console.log('Question bank summary:\n');
  bank.forEach(({ specialty, questions }) => {
    console.log(`  ${specialty}: ${questions.length} questions`);
  });
  const outPath = path.join(__dirname, '../benchmarks/benchmark-questions-loaded.json');
  writeQuestionBankJson(outPath);
  console.log(`\nWritten: ${outPath}`);
}

module.exports = {
  getQuestionBank,
  getQuestionsForSpecialty,
  writeQuestionBankJson,
  parseQuestionCsv,
  PROJECT_ROOT,
  CSV_TO_SPECIALTY,
  MAX_QUESTIONS_PER_SPECIALTY,
};
