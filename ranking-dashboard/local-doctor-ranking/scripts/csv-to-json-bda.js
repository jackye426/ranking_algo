/**
 * Convert BDA dietitians CSV to JSON profiles file.
 * Output format: { source: "BDA", total_profiles: N, profiles: [...] }
 * Merge script can then accept either CSV or this JSON.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CSV = path.join(__dirname, '../../data/bda_dietitians_rows.csv');
const DEFAULT_OUTPUT = path.join(__dirname, '../data/bda_dietitians_profiles.json');

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCSV(csvFilePath) {
  const csvContent = fs.readFileSync(csvFilePath, 'utf8');
  const normalized = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) lines.push(currentLine);

  if (lines.length === 0) throw new Error('CSV file is empty');

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const profiles = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = parseCSVLine(line);
    const padded = [...values];
    while (padded.length < headers.length) padded.push('');
    const finalValues = padded.slice(0, headers.length);

    const record = {};
    headers.forEach((header, index) => {
      let value = (finalValues[index] || '').replace(/^"|"$/g, '');
      record[header] = value;
    });

    if (record.name || record.id) profiles.push(record);
  }

  return { headers, profiles };
}

function main() {
  const csvPath = process.argv[2] ? (path.isAbsolute(process.argv[2]) ? process.argv[2] : path.join(process.cwd(), process.argv[2])) : DEFAULT_CSV;
  const outputPath = process.argv[3] ? (path.isAbsolute(process.argv[3]) ? process.argv[3] : path.join(process.cwd(), process.argv[3])) : DEFAULT_OUTPUT;

  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    process.exit(1);
  }

  console.log('[csv-to-json-bda] Reading:', csvPath);
  const { profiles } = parseCSV(csvPath);
  console.log('[csv-to-json-bda] Parsed', profiles.length, 'profiles');

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const output = {
    source: 'BDA',
    total_profiles: profiles.length,
    profiles,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('[csv-to-json-bda] Wrote:', outputPath);
}

if (require.main === module) main();

module.exports = { parseCSV, parseCSVLine };
