/**
 * Parse WhatsApp chat export into structured recommendation entries.
 *
 * Expected format (per message):
 * [21:03, 11/02/2026] Jack: 1. Mr Oliver O'Donovan
 *
 * 📍 Spire Bristol Hospital / St Michael's Hospital (Bristol)
 * Consultant Gynaecologist – Lead of a BSGE-Accredited Endometriosis Centre
 *
 * Why he may be a good fit:
 * ...paragraph...
 *
 * Best for:
 * ...line...
 *
 * 🔗 https://...
 *
 * Supports variable number of results (not always 5). Handles "Why he/she may be a good fit:".
 */

/**
 * Split export text into blocks: one per WhatsApp message (timestamp line).
 * Supports both formats: [21:03, 11/02/2026] Jack: and [2/13/26, 19:15:29] DocMap:
 * @param {string} text - Raw export text
 * @returns {string[]} - Array of message content strings (without timestamp prefix)
 */
function splitIntoMessages(text) {
  const messageRegex = /\[[^\]]+\]\s*[^:]+:\s*/g;
  const parts = text.split(messageRegex);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Parse a single message block into one recommendation entry.
 */
function parseOneBlock(block) {
  const lines = block.split(/\r?\n/).map((l) => l.trim());
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  const rankNameMatch = firstLine.match(/^(\d+)[.)]\s+(.+)$/);
  if (!rankNameMatch) return null;

  const rank = parseInt(rankNameMatch[1], 10);
  const name = rankNameMatch[2].trim();

  let location = null;
  let title = null;
  let whyGoodFit = null;
  let bestFor = null;
  let link = null;

  let i = 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('📍')) {
      location = line.replace(/^📍\s*/, '').trim();
      i++;
      while (i < lines.length && !lines[i]) i++;
      if (i < lines.length && !lines[i].startsWith('Why ') && !lines[i].startsWith('Best for') && !lines[i].startsWith('🔗')) {
        title = lines[i];
        i++;
      }
      continue;
    }
    if (/^Why (he|she) may be a good fit:/i.test(line)) {
      const restOfLine = line.replace(/^Why (he|she) may be a good fit:\s*/i, '').trim();
      const paragraph = restOfLine ? [restOfLine] : [];
      i++;
      while (i < lines.length && lines[i] && !/^Best for:/i.test(lines[i]) && !lines[i].startsWith('🔗')) {
        paragraph.push(lines[i]);
        i++;
      }
      whyGoodFit = paragraph.join(' ').trim() || null;
      continue;
    }
    if (/^Best for:/i.test(line)) {
      const restOfLine = line.replace(/^Best for:\s*/i, '').trim();
      const parts = restOfLine ? [restOfLine] : [];
      i++;
      while (i < lines.length && lines[i] && !lines[i].startsWith('🔗')) {
        parts.push(lines[i]);
        i++;
      }
      bestFor = parts.join(' ').trim() || null;
      continue;
    }
    if (line.startsWith('🔗')) {
      const urlMatch = line.match(/🔗\s*(https?:\S+)/);
      link = urlMatch ? urlMatch[1].trim() : null;
      i++;
      continue;
    }
    i++;
  }

  return { rank, name, location, title, whyGoodFit, bestFor, link };
}

/**
 * Parse full WhatsApp export into entries.
 * @param {string} text - Raw export text
 * @returns {{ entries: Array, messageCount: number, firstTimestamp: string | null }}
 */
function parseWhatsAppExport(text) {
  const messages = splitIntoMessages(text);
  const entries = [];
  const timestampMatch = text.match(/\[([^\]]+)\]/);
  const firstTimestamp = timestampMatch ? timestampMatch[1] : null;

  for (const block of messages) {
    const entry = parseOneBlock(block);
    if (entry) entries.push(entry);
  }

  return { entries, messageCount: messages.length, firstTimestamp };
}

/**
 * Build plain-text reasoning from entries (for backward compatibility).
 */
function entriesToReasoningText(entries) {
  return entries
    .map((e) => `${e.rank}. ${e.name}\nWhy good fit: ${e.whyGoodFit || ''}\nBest for: ${e.bestFor || ''}`)
    .join('\n\n');
}

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const input = process.argv[2];
  let text;
  if (input && input !== '-') {
    const filePath = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
    text = fs.readFileSync(filePath, 'utf8');
  } else {
    try {
      text = fs.readFileSync(0, 'utf8');
    } catch (e) {
      console.error('Usage: node parse-whatsapp-recommendations.js <export.txt>');
      process.exit(1);
    }
  }
  console.log(JSON.stringify(parseWhatsAppExport(text), null, 2));
}

module.exports = {
  splitIntoMessages,
  parseOneBlock,
  parseWhatsAppExport,
  entriesToReasoningText,
};
