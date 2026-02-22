/**
 * Parse all WhatsApp session exports in whatsapp-sessions/.
 * Each subfolder can contain _chat.txt (from unzipped export).
 * Writes summary to stdout and optionally a combined JSON file.
 */

const fs = require('fs');
const path = require('path');
const { parseWhatsAppExport } = require('./parse-whatsapp-recommendations');

const SESSIONS_DIR = path.join(__dirname, '..', 'whatsapp-sessions');
const DEFAULT_OUTPUT_JSON = path.join(__dirname, '..', 'data', 'whatsapp-sessions-parsed.json');

function findChatFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findChatFiles(full, files);
    else if (e.name === '_chat.txt' || e.name.toLowerCase().endsWith('.txt')) files.push(full);
  }
  return files;
}

function main() {
  const writeJson = process.argv.includes('--json');
  const outputPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : DEFAULT_OUTPUT_JSON;

  const chatFiles = findChatFiles(SESSIONS_DIR);
  if (chatFiles.length === 0) {
    console.log('No _chat.txt or .txt files found under', SESSIONS_DIR);
    return;
  }

  const allSessions = [];
  let totalEntries = 0;

  console.log('Parsing', chatFiles.length, 'session(s)...\n');

  for (const file of chatFiles) {
    const rel = path.relative(SESSIONS_DIR, path.dirname(file));
    const label = rel || path.basename(path.dirname(file));
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      console.warn('Skip', label, err.message);
      continue;
    }
    const result = parseWhatsAppExport(text);
    const count = result.entries.length;
    totalEntries += count;
    allSessions.push({
      sessionId: label,
      file: path.basename(file),
      firstTimestamp: result.firstTimestamp,
      messageCount: result.messageCount,
      recommendationCount: count,
      entries: result.entries,
    });
    console.log(label, '|', count, 'recommendations', '|', result.messageCount, 'messages', '| first', result.firstTimestamp || '');
  }

  console.log('\nTotal:', totalEntries, 'recommendation entries across', allSessions.length, 'sessions.');

  if (writeJson) {
    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({ sessions: allSessions, totalEntries }, null, 2), 'utf8');
    console.log('Wrote', outputPath);
  }
}

main();
