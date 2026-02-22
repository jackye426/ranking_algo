/**
 * Match tracker runs (recommendation-tracker.json) to WhatsApp sessions using:
 * 1. Time window: same calendar day (UTC for tracker; WhatsApp parsed as M/D/YY).
 * 2. Query similarity: tracker query vs patient messages extracted from WhatsApp chat.
 *
 * Usage: node match-tracker-to-whatsapp.js [--json]
 * Output: match count and list; with --json writes data/matches-tracker-whatsapp.json
 */

const fs = require('fs');
const path = require('path');

const TRACKER_PATH = path.join(__dirname, '..', 'data', 'recommendation-tracker.json');
const WHATSAPP_PARSED_PATH = path.join(__dirname, '..', 'data', 'whatsapp-sessions-parsed.json');
const WHATSAPP_SESSIONS_DIR = path.join(__dirname, '..', 'whatsapp-sessions');
const MATCHES_OUT_PATH = path.join(__dirname, '..', 'data', 'matches-tracker-whatsapp.json');

// WhatsApp timestamp: "2/13/26, 19:15:29" or "1/30/26, 14:25:37" (M/D/YY)
function whatsappTimestampToDate(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const [datePart] = ts.split(',').map((s) => s.trim());
  const [m, d, y] = datePart.split('/').map(Number);
  if (!m || !d || !y) return null;
  const year = y < 100 ? 2000 + y : y;
  const month = m;
  const day = d;
  return { year, month, day, key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

function trackerTimestampToDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return { year, month, day, key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

/**
 * Extract patient-side messages from a WhatsApp _chat.txt (everything not from DocMap).
 * Returns a single string of concatenated patient content for similarity.
 */
function extractPatientQueryFromChat(chatPath) {
  if (!fs.existsSync(chatPath)) return '';
  const text = fs.readFileSync(chatPath, 'utf8');
  const messageRegex = /\[[^\]]+\]\s*([^:]+):\s*/g;
  let match;
  const parts = [];
  let lastIndex = 0;
  while ((match = messageRegex.exec(text)) !== null) {
    const sender = (match[1] || '').trim();
    const contentStart = match.index + match[0].length;
    const nextMatch = messageRegex.exec(text);
    const contentEnd = nextMatch ? nextMatch.index : text.length;
    messageRegex.lastIndex = nextMatch ? nextMatch.index : messageRegex.lastIndex;
    const content = text.slice(contentStart, contentEnd).replace(/\s+/g, ' ').trim();
    if (!/DocMap/i.test(sender) && content.length > 0) {
      parts.push(content);
    }
    if (!nextMatch) break;
  }
  return parts.join(' ').trim();
}

/**
 * Normalise text for similarity: lowercase, alphanumeric + spaces, significant words only.
 */
function normaliseForSimilarity(s) {
  if (typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .join(' ');
}

/**
 * Word-set Jaccard similarity (0..1). Uses normalised word sets.
 */
function querySimilarity(str1, str2) {
  const n1 = normaliseForSimilarity(str1);
  const n2 = normaliseForSimilarity(str2);
  if (!n1 || !n2) return 0;
  const set1 = new Set(n1.split(/\s+/).filter(Boolean));
  const set2 = new Set(n2.split(/\s+/).filter(Boolean));
  const inter = [...set1].filter((w) => set2.has(w)).length;
  const union = set1.size + set2.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

function main() {
  const writeJson = process.argv.includes('--json');

  let trackerData;
  let whatsappData;
  try {
    trackerData = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
  } catch (e) {
    console.error('Failed to load tracker:', e.message);
    process.exit(1);
  }
  try {
    whatsappData = JSON.parse(fs.readFileSync(WHATSAPP_PARSED_PATH, 'utf8'));
  } catch (e) {
    console.error('Failed to load WhatsApp parsed:', e.message);
    process.exit(1);
  }

  const queries = trackerData.queries || [];
  const sessions = (whatsappData.sessions || []).filter((s) => s.recommendationCount > 0);

  // Precompute WhatsApp session date and patient query text
  const sessionMeta = sessions.map((s) => {
    const chatPath = path.join(WHATSAPP_SESSIONS_DIR, s.sessionId, s.file || '_chat.txt');
    const date = whatsappTimestampToDate(s.firstTimestamp);
    const patientText = extractPatientQueryFromChat(chatPath);
    return {
      session: s,
      dateKey: date ? date.key : null,
      patientQuery: patientText,
    };
  });

  // Normalise phone for comparison: keep + and digits only
  function normalisePhone(s) {
    if (!s || typeof s !== 'string') return '';
    return ('+' + s.replace(/\D/g, '')).replace(/^\++/, '+') || s.replace(/\D/g, '');
  }

  const sessionByPhone = new Map();
  sessionMeta.forEach((m) => {
    const key = normalisePhone(m.session.sessionId);
    if (key) sessionByPhone.set(key, m);
  });

  const matches = [];
  const dateKeyToSessions = new Map();
  sessionMeta.forEach((m) => {
    if (m.dateKey) {
      if (!dateKeyToSessions.has(m.dateKey)) dateKeyToSessions.set(m.dateKey, []);
      dateKeyToSessions.get(m.dateKey).push(m);
    }
  });

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const phone = normalisePhone(q.sessionPhoneNumber);
    let best = null;
    let bestSim = 0;
    let matchBy = null;

    // 1) Prefer exact match by session phone number (identifier)
    if (phone && sessionByPhone.has(phone)) {
      best = sessionByPhone.get(phone);
      bestSim = 1;
      matchBy = 'phone';
    }
    // 2) Fall back to time window + query similarity for runs without phone
    if (!best) {
      const trackerDate = trackerTimestampToDate(q.timestamp);
      if (trackerDate) {
        const candidates = dateKeyToSessions.get(trackerDate.key) || [];
        for (const cand of candidates) {
          const sim = querySimilarity(q.query, cand.patientQuery);
          if (sim > bestSim) {
            bestSim = sim;
            best = cand;
            matchBy = 'time+query';
          }
        }
      }
    }

    const minSim = 0.08;
    if (best && bestSim >= minSim) {
      matches.push({
        trackerIndex: i,
        trackerTimestamp: q.timestamp,
        trackerQueryPreview: (q.query || '').substring(0, 80),
        sessionPhoneNumber: q.sessionPhoneNumber ?? null,
        whatsappSessionId: best.session.sessionId,
        whatsappFirstTimestamp: best.session.firstTimestamp,
        recommendationCount: best.session.recommendationCount,
        querySimilarity: Math.round(bestSim * 1000) / 1000,
        matchBy: matchBy || 'time+query',
      });
    }
  }

  const byPhone = matches.filter((m) => m.matchBy === 'phone').length;
  const byTimeQuery = matches.filter((m) => m.matchBy === 'time+query').length;
  console.log('Tracker runs:', queries.length);
  console.log('WhatsApp sessions (with recommendations):', sessions.length);
  console.log('Matches:', matches.length, '(by phone:', byPhone, '| by time+query:', byTimeQuery + ')');
  if (matches.length > 0) {
    console.log('\nMatched pairs:');
    matches.forEach((m, idx) => {
      console.log(`  ${idx + 1}. ${m.trackerQueryPreview}...`);
      console.log(`     -> ${m.whatsappSessionId} (${m.matchBy}, sim: ${m.querySimilarity}, ${m.recommendationCount} recs)`);
    });
  }

  if (writeJson) {
    const outDir = path.dirname(MATCHES_OUT_PATH);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      MATCHES_OUT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          trackerRuns: queries.length,
          whatsappSessionsWithRecs: sessions.length,
          matchCount: matches.length,
          matches,
        },
        null,
        2
      ),
      'utf8'
    );
    console.log('\nWrote', MATCHES_OUT_PATH);
  }
}

main();
