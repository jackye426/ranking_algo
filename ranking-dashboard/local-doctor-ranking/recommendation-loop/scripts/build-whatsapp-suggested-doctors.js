/**
 * Build a single deduplicated list of all WhatsApp-suggested doctors:
 * - Re-parses all WhatsApp sessions (so run this whenever new chats are added)
 * - Deduplicates by normalized name (titles stripped, case-insensitive)
 * - Looks up email from practitioner data on file (merged_all_sources_latest.json)
 * - Keeps a tally of how many times each doctor appeared in WhatsApp recommendations
 *
 * Usage (from Local Doctor Ranking):
 *   node recommendation-loop/scripts/build-whatsapp-suggested-doctors.js
 *
 * Writes:
 *   recommendation-loop/data/whatsapp-sessions-parsed.json (refreshed)
 *   recommendation-loop/output/whatsapp-suggested-doctors.json (master list)
 */

const fs = require('fs');
const path = require('path');
const { parseWhatsAppExport } = require('./parse-whatsapp-recommendations');

const SESSIONS_DIR = path.join(__dirname, '..', 'whatsapp-sessions');
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const PARSED_OUTPUT = path.join(DATA_DIR, 'whatsapp-sessions-parsed.json');
const MASTER_LIST_OUTPUT = path.join(OUTPUT_DIR, 'whatsapp-suggested-doctors.json');

// Tracker data: try multiple locations
const TRACKER_PATHS = [
  path.join(__dirname, '..', 'data', 'recommendation-tracker.json'),
  path.join(__dirname, '..', '..', 'recommendation-tracker.json'),
  path.join(__dirname, '..', '..', 'scripts', 'recommendation-tracker.json'),
];

// Practitioner data: try recommendation-loop data first, then project data/
const PRACTITIONER_PATHS = [
  path.join(__dirname, '..', 'data', 'merged_all_sources_latest.json'),
  path.join(__dirname, '..', '..', 'data', 'merged_all_sources_latest.json'),
];

const TITLE_PREFIXES = /\b(Mr|Mrs|Ms|Miss|Dr|Prof\.?|Professor)\s+/gi;

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

/**
 * Normalize name for deduplication and lookup: strip titles, lowercase, collapse spaces.
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(TITLE_PREFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Normalize phone number for matching: keep + and digits only.
 */
function normalizePhone(s) {
  if (!s || typeof s !== 'string') return '';
  return ('+' + s.replace(/\D/g, '')).replace(/^\++/, '+') || s.replace(/\D/g, '');
}

/**
 * Convert WhatsApp timestamp to date key (YYYY-MM-DD).
 */
function whatsappTimestampToDateKey(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const [datePart] = ts.split(',').map((s) => s.trim());
  const [m, d, y] = datePart.split('/').map(Number);
  if (!m || !d || !y) return null;
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Convert ISO timestamp to date key (YYYY-MM-DD).
 */
function trackerTimestampToDateKey(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Load tracker data and build session-to-query mapping.
 * Returns Map: sessionId -> { query, filterConditions, timestamp }
 * Also returns Map: dateKey -> [queries] for time-based fallback matching
 */
function loadTrackerMatches() {
  const phoneMatches = new Map();
  const dateMatches = new Map();
  
  // Try to load tracker data from multiple locations
  let trackerPath = null;
  for (const p of TRACKER_PATHS) {
    if (fs.existsSync(p)) {
      trackerPath = p;
      break;
    }
  }
  
  if (!trackerPath) {
    console.warn('No recommendation-tracker.json found; case breakdown and geography cluster will be empty.');
    return { phoneMatches, dateMatches };
  }

  let trackerData;
  try {
    trackerData = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    console.log('Loaded tracker data from', trackerPath);
  } catch (err) {
    console.warn('Failed to load tracker data:', err.message);
    return { phoneMatches, dateMatches };
  }

  const queries = trackerData.queries || [];
  
  // Build mappings
  for (const q of queries) {
    const queryInfo = {
      query: q.query || '',
      filterConditions: q.filterConditions || null,
      timestamp: q.timestamp || null,
    };
    
    // Primary: phone number matching
    const phone = normalizePhone(q.sessionPhoneNumber);
    if (phone) {
      phoneMatches.set(phone, queryInfo);
    }
    
    // Fallback: date-based matching
    const dateKey = trackerTimestampToDateKey(q.timestamp);
    if (dateKey) {
      if (!dateMatches.has(dateKey)) {
        dateMatches.set(dateKey, []);
      }
      dateMatches.get(dateKey).push(queryInfo);
    }
  }

  console.log(`Loaded ${queries.length} tracker queries (${phoneMatches.size} with phone numbers, ${dateMatches.size} date keys)`);
  return { phoneMatches, dateMatches };
}

/**
 * Extract patient messages from WhatsApp chat (everything not from DocMap).
 */
function extractPatientMessages(chatPath) {
  if (!fs.existsSync(chatPath)) return '';
  const text = fs.readFileSync(chatPath, 'utf8');
  const messageRegex = /\[[^\]]+\]\s*([^:]+):\s*/g;
  const parts = [];
  let match;
  let lastIndex = 0;
  
  while ((match = messageRegex.exec(text)) !== null) {
    const sender = (match[1] || '').trim();
    const contentStart = match.index + match[0].length;
    const nextMatch = messageRegex.exec(text);
    const contentEnd = nextMatch ? nextMatch.index : text.length;
    messageRegex.lastIndex = nextMatch ? nextMatch.index : messageRegex.lastIndex;
    const content = text.slice(contentStart, contentEnd).trim();
    
    // Only get patient messages (not DocMap)
    if (!/DocMap/i.test(sender) && content.length > 0) {
      parts.push(content);
    }
    if (!nextMatch) break;
  }
  
  return parts.join(' ');
}

/**
 * Extract geography cluster from WhatsApp conversation text.
 */
function extractGeographyFromWhatsApp(chatPath) {
  const patientText = extractPatientMessages(chatPath);
  if (!patientText) return [];
  
  const locations = [];
  
  // Common UK cities/regions to help validate
  const ukLocations = [
    'London', 'Birmingham', 'Manchester', 'Liverpool', 'Leeds', 'Sheffield', 'Bristol', 'Cardiff',
    'Edinburgh', 'Glasgow', 'Newcastle', 'Nottingham', 'Leicester', 'Coventry', 'Belfast',
    'Worcester', 'Oxford', 'Cambridge', 'Brighton', 'Southampton', 'Portsmouth', 'Norwich',
    'Wales', 'Scotland', 'England', 'Northern Ireland', 'Yorkshire', 'Surrey', 'Kent', 'Essex',
    'Merseyside', 'Greater Manchester', 'West Midlands', 'East Midlands', 'South West', 'South East',
    'Swansea', 'Bath', 'York', 'Canterbury', 'Durham', 'Exeter', 'Plymouth', 'Reading', 'Milton Keynes',
    'Bridgend', 'Surbiton', 'High Wycombe', 'Kingston Upon Thames', 'Kingston', 'Midlands',
    'South Wales', 'North Wales', 'West London', 'East London', 'North London', 'South London',
    'West Midlands', 'East Midlands', 'South West', 'South East',
  ];
  
  // Patterns to extract locations from patient messages (more specific)
  const locationPatterns = [
    // "based in [location]" - capture up to 4 words (e.g., "Bridgend south wales")
    /based\s+in\s+([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s+[A-Z][a-z]+){0,2})(?:\s|$|,|\.|and)/gi,
    // "in [location]" - but not "in the" or "in a"
    /\bin\s+([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s+[A-Z][a-z]+){0,2})(?:\s|$|,|\.|and)/gi,
    // "location: [location]" or "your location [location]"
    /location[:\s]+([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s+[A-Z][a-z]+){0,2})(?:\s|$|,|\.)/gi,
    // "near [location]"
    /near\s+([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s+[A-Z][a-z]+){0,2})(?:\s|$|,|\(|\.)/gi,
    // "from [location]"
    /from\s+([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s+[A-Z][a-z]+){0,2})(?:\s|$|,|\.)/gi,
    // Travel patterns: "within X from [location]" or "X hour from [location]"
    /(?:within\s+)?(?:\d+\s+)?(?:hour|miles?|km)?\s+from\s+([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s+[A-Z][a-z]+){0,2})(?:\s|$|,|\.)/gi,
    // Standalone location mentions (at start or after comma, max 4 words)
    /(?:^|,\s*)([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s+[A-Z][a-z]+){0,2})(?:\s|$|,|\.)/gm,
  ];
  
  const foundLocations = new Set();
  
  for (const pattern of locationPatterns) {
    const matches = patientText.matchAll(pattern);
    for (const match of matches) {
        if (match[1]) {
          let loc = match[1].trim();
          
          // Clean up location names
          loc = loc.replace(/\s*\([^)]+\)$/, '').trim(); // Remove trailing parentheses
          loc = loc.replace(/^(the|a|an)\s+/i, '').trim(); // Remove articles
          loc = loc.replace(/\s+(and|or|but|no|don|do|have|has|does|did|can|could|would|will|should|not|doesn|didn|won|can't|couldn|wouldn|terms|but)\s*$/i, '').trim(); // Remove trailing conjunctions/verbs
          loc = loc.replace(/\s+(and|or|but|no|don|do|have|has|does|did|can|could|would|will|should|not|doesn|didn|won|can't|couldn|wouldn|terms|but)\s+.*$/i, '').trim(); // Remove trailing conjunctions/verbs with more text
          loc = loc.replace(/\s*\n\s*/g, ' ').trim(); // Remove newlines
          loc = loc.replace(/\s+/g, ' ').trim(); // Normalize whitespace
          loc = loc.replace(/\s+(No|Yes|Not)$/i, '').trim(); // Remove trailing "No" or "Yes"
          
          // Remove if it starts with lowercase words that aren't locations
          if (/^(in|at|on|for|with|from|to|the|a|an)\s+/i.test(loc)) {
            loc = loc.replace(/^(in|at|on|for|with|from|to|the|a|an)\s+/i, '').trim();
          }
          
          // Must be 1-4 words, first word must start with capital
          const words = loc.split(/\s+/);
          if (words.length > 4) continue; // Too many words, likely not a location
          if (!/^[A-Z]/.test(words[0])) continue; // First word must start with capital
          
          // Filter out names (common first names) and invalid patterns
          const commonNames = ['Laura', 'Emily', 'Jess', 'Caitlin', 'Michelle', 'Raph', 'Abbie', 'Sarah', 'Estelle', 'Bethany'];
          if (words.length === 2 && commonNames.some(name => words[0].toLowerCase() === name.toLowerCase())) {
            continue; // Likely a person's name
          }
          
          // Filter out phrases that don't look like locations
          if (loc.toLowerCase().includes('terms') || loc.toLowerCase().includes('but') && words.length === 2) {
            continue;
          }
          
          // Must contain at least one known location word or be a proper noun pattern
          const hasKnownLocation = ukLocations.some(uk => {
            const ukLower = uk.toLowerCase();
            const locLower = loc.toLowerCase();
            return locLower.includes(ukLower);
          });
          
          if (!hasKnownLocation && words.length > 2) {
            // If more than 2 words and no known location, skip
            continue;
          }
          
          // Filter out common false positives
          const falsePositives = [
            'Patient', 'She', 'He', 'They', 'Within', 'About', 'Around', 'Travel', 'Hospital', 
            'Centre', 'Center', 'Clinic', 'Surgery', 'Therapy', 'Treatment', 'Management',
            'Understanding', 'Whether', 'Related', 'Pelvic', 'Floor', 'Tension', 'Nerve',
            'Sensitisation', 'Muscular', 'Imbalance', 'Factors', 'Goal', 'Learn', 'Manage',
            'Reduce', 'Flare', 'Exercise', 'Safely', 'Without', 'Exacerbating', 'Symptoms',
            'Improve', 'Overall', 'Quality', 'Life', 'Avoiding', 'Further', 'Seeking',
            'Specific', 'Experience', 'Post', 'Surgical', 'Pain', 'Physiotherapist', 'Specialist',
            'Doctor', 'Consultant', 'Endometriosis', 'Adenomyosis', 'Gastroenterology', 'Gynaecology', 'Cardiology',
            'Great', 'Thank', 'Thanks', 'Hello', 'Hi', 'Hey', 'Please', 'Help', 'Looking', 'Find',
            'Someone', 'Specialist', 'Insurance', 'Have', 'Don', 'Does', 'Can', 'Could', 'Would',
          ];
          
          if (falsePositives.some(fp => loc.toLowerCase().includes(fp.toLowerCase()))) {
            continue;
          }
          
          // Check if it's a known UK location or looks like a location
          const isKnownLocation = ukLocations.some(uk => {
            const ukLower = uk.toLowerCase();
            const locLower = loc.toLowerCase();
            return locLower === ukLower || 
                   locLower.startsWith(ukLower + ' ') ||
                   locLower.includes(' ' + ukLower) ||
                   (ukLower.includes(' ') && locLower.includes(ukLower.split(' ')[0]));
          });
          
          // Validate location format - must be known location or proper noun pattern
          const wordCount = words.length;
          const isValidLocation = isKnownLocation || 
            (wordCount === 1 && /^[A-Z][a-z]+$/.test(loc) && loc.length >= 4) ||
            (wordCount >= 2 && wordCount <= 3 && /^[A-Z]/.test(loc));
          
          if (isValidLocation && loc.length >= 3 && loc.length <= 50 && !foundLocations.has(loc.toLowerCase())) {
            foundLocations.add(loc.toLowerCase());
            locations.push(loc);
          }
        }
    }
  }
  
  // Deduplicate and return (case-insensitive)
  const seen = new Set();
  const unique = [];
  for (const loc of locations) {
    const lower = loc.toLowerCase().trim();
    if (lower && !seen.has(lower)) {
      seen.add(lower);
      unique.push(loc);
    }
  }
  return unique;
}

/**
 * Load practitioner records and build lookup: normalizedName -> { email, name }.
 * Uses name and name_alternatives; first non-empty email wins.
 */
function loadPractitionerLookup() {
  let jsonPath = null;
  for (const p of PRACTITIONER_PATHS) {
    if (fs.existsSync(p)) {
      jsonPath = p;
      break;
    }
  }
  if (!jsonPath) {
    console.warn('No merged_all_sources_latest.json found; email lookup will be empty.');
    return new Map();
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const records = raw.records || raw;
  const lookup = new Map();

  for (const r of records) {
    const name = r.name;
    const email = (r.email && String(r.email).trim()) || '';
    const alts = Array.isArray(r.name_alternatives) ? r.name_alternatives : [];
    const names = [name, ...alts].filter(Boolean);

    for (const n of names) {
      const key = normalizeName(n);
      if (!key) continue;
      if (!lookup.has(key)) lookup.set(key, { email: '', canonicalName: name });
      const entry = lookup.get(key);
      if (email && !entry.email) entry.email = email;
      // Prefer keeping a canonical name that matches the form we have (e.g. with title)
      if (n === name) entry.canonicalName = name;
    }
  }
  return lookup;
}

function main() {
  const skipParse = process.argv.includes('--no-parse');
  const chatFiles = findChatFiles(SESSIONS_DIR);

  if (chatFiles.length === 0) {
    console.log('No _chat.txt or .txt files found under', SESSIONS_DIR);
    return;
  }

  let sessions;
  let allEntries = [];

  if (skipParse && fs.existsSync(PARSED_OUTPUT)) {
    const parsed = JSON.parse(fs.readFileSync(PARSED_OUTPUT, 'utf8'));
    sessions = parsed.sessions || [];
    allEntries = sessions.flatMap((s) => (s.entries || []).map((e) => ({ ...e, sessionId: s.sessionId })));
    console.log('Using existing', PARSED_OUTPUT, '|', allEntries.length, 'entries.');
  } else {
    sessions = [];
    console.log('Parsing', chatFiles.length, 'session(s)...');
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
      sessions.push({
        sessionId: label,
        file: path.basename(file),
        firstTimestamp: result.firstTimestamp,
        messageCount: result.messageCount,
        recommendationCount: result.entries.length,
        entries: result.entries,
      });
      for (const e of result.entries) allEntries.push({ ...e, sessionId: label });
    }
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PARSED_OUTPUT, JSON.stringify({ sessions, totalEntries: allEntries.length }, null, 2), 'utf8');
    console.log('Wrote', PARSED_OUTPUT, '|', allEntries.length, 'recommendation entries.');
  }

  const lookup = loadPractitionerLookup();
  const { phoneMatches, dateMatches } = loadTrackerMatches();

  // Group by normalized name: { normalizedName -> { name, tally, location, title, cases, geography } }
  const byKey = new Map();
  for (const e of allEntries) {
    const key = normalizeName(e.name);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        name: e.name,
        normalizedName: key,
        whatsappTally: 0,
        location: e.location || null,
        title: e.title || null,
        queries: [],
        geographyClusters: [],
        whatsappNumbers: new Set(), // Track unique WhatsApp numbers
      });
    }
    const row = byKey.get(key);
    row.whatsappTally += 1;
    if (!row.location && e.location) row.location = e.location;
    if (!row.title && e.title) row.title = e.title;
    
    // Track WhatsApp number (sessionId)
    if (e.sessionId) {
      row.whatsappNumbers.add(e.sessionId);
    }
    
    // Match session to tracker query
    let trackerMatch = null;
    
    // Try phone number matching first
    const sessionPhone = normalizePhone(e.sessionId);
    if (sessionPhone && phoneMatches.has(sessionPhone)) {
      trackerMatch = phoneMatches.get(sessionPhone);
    }
    
    // Fallback: time-based matching (find session timestamp and match by date)
    if (!trackerMatch) {
      // Find the session to get its timestamp
      const session = sessions.find(s => s.sessionId === e.sessionId);
      if (session && session.firstTimestamp) {
        const sessionDateKey = whatsappTimestampToDateKey(session.firstTimestamp);
        if (sessionDateKey && dateMatches.has(sessionDateKey)) {
          // Use the first query from that date (or could use query similarity for better matching)
          const queriesForDate = dateMatches.get(sessionDateKey);
          if (queriesForDate && queriesForDate.length > 0) {
            // Prefer queries with filterConditions or longer queries (more detailed)
            trackerMatch = queriesForDate.reduce((best, q) => {
              if (!best) return q;
              const bestScore = (best.filterConditions ? 1 : 0) + (best.query.length > 50 ? 1 : 0);
              const qScore = (q.filterConditions ? 1 : 0) + (q.query.length > 50 ? 1 : 0);
              return qScore > bestScore ? q : best;
            }, null);
          }
        }
      }
    }
    
    // Extract geography from WhatsApp conversation
    // Find the session to get its file path
    const session = sessions.find(s => s.sessionId === e.sessionId);
    if (session) {
      const chatPath = path.join(SESSIONS_DIR, session.sessionId, session.file || '_chat.txt');
      if (fs.existsSync(chatPath)) {
        const geography = extractGeographyFromWhatsApp(chatPath);
        for (const geo of geography) {
          if (!row.geographyClusters.includes(geo)) {
            row.geographyClusters.push(geo);
          }
        }
      }
    }
    
    // Add query (just the query string)
    if (trackerMatch && trackerMatch.query) {
      // Avoid duplicates
      if (!row.queries.includes(trackerMatch.query)) {
        row.queries.push(trackerMatch.query);
      }
    }
  }

  const list = [];
  for (const row of byKey.values()) {
    const fromFile = lookup.get(row.normalizedName);
    // Convert Set to sorted array for WhatsApp numbers
    const whatsappNumbers = Array.from(row.whatsappNumbers).sort();
    list.push({
      name: row.name,
      normalizedName: row.normalizedName,
      email: (fromFile && fromFile.email) || '',
      whatsappTally: row.whatsappTally,
      whatsappNumbers: whatsappNumbers.length > 0 ? whatsappNumbers : null,
      location: row.location,
      title: row.title,
      query: row.queries.length > 0 ? row.queries : null,
      geographyCluster: row.geographyClusters.length > 0 ? row.geographyClusters : null,
    });
  }

  list.sort((a, b) => b.whatsappTally - a.whatsappTally || (a.name || '').localeCompare(b.name || ''));

  const output = {
    builtAt: new Date().toISOString(),
    totalUniqueDoctors: list.length,
    totalRecommendationOccurrences: allEntries.length,
    doctors: list,
  };

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(MASTER_LIST_OUTPUT, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', MASTER_LIST_OUTPUT, '|', list.length, 'unique doctors,', allEntries.length, 'total occurrences.');
}

main();
