/**
 * Recommendation Tracker (feedback loop)
 *
 * Tracks queries and top 10 doctor recommendations, plus AI reasoning.
 * Data lives in recommendation-loop/data/recommendation-tracker.json.
 */

const fs = require('fs');
const path = require('path');

const TRACKER_FILE = path.join(__dirname, '..', 'data', 'recommendation-tracker.json');

/**
 * Ensure data dir and tracker file exist
 */
function initializeTracker() {
  const dataDir = path.dirname(TRACKER_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(TRACKER_FILE)) {
    const initialData = {
      queries: [],
      summary: {
        doctorTally: {},
        totalQueries: 0,
        lastUpdated: null,
      },
    };
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

/**
 * Ensure a doctor entry has fit_category and fit_reason (for migration)
 */
function ensureDoctorFitFields(doc) {
  return {
    ...doc,
    fit_category: doc.fit_category ?? null,
    fit_reason: doc.fit_reason ?? null,
  };
}

/**
 * Migrate old records: ensure top10, aiReasoning, sessionPhoneNumber, filterConditions, and per-doctor fit fields exist
 */
function migrateRecord(q) {
  const top5 = q.top5 || [];
  const top10 = (q.top10 || top5).map(ensureDoctorFitFields);
  const migratedTop5 = (q.top5 || top10.slice(0, 5)).map(ensureDoctorFitFields);
  return {
    ...q,
    top10,
    top5: migratedTop5,
    aiReasoning: q.aiReasoning ?? null,
    sessionPhoneNumber: q.sessionPhoneNumber ?? null,
    filterConditions: q.filterConditions ?? null,
  };
}

/**
 * Load tracker data and migrate if needed
 */
function loadTrackerData() {
  initializeTracker();
  try {
    const data = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    if (Array.isArray(data.queries)) {
      data.queries = data.queries.map(migrateRecord);
    }
    return data;
  } catch (err) {
    console.error('[Tracker] Error loading:', err.message);
    return {
      queries: [],
      summary: {
        doctorTally: {},
        totalQueries: 0,
        lastUpdated: null,
      },
    };
  }
}

/**
 * Save tracker data atomically
 */
function saveTrackerData(data) {
  const tempFile = TRACKER_FILE + '.tmp';
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, TRACKER_FILE);
  } catch (err) {
    console.error('[Tracker] Error saving:', err.message);
    if (fs.existsSync(tempFile)) try { fs.unlinkSync(tempFile); } catch (e) {}
    throw err;
  }
}

/**
 * Normalise a doctor entry for storage.
 * fit_category: AI-assigned fit (e.g. 'excellent', 'good', 'ill_fit'). null if not evaluated.
 */
function normaliseDoctor(doc, rank) {
  return {
    id: doc.id ?? null,
    name: doc.name ?? 'Unknown',
    rank: doc.rank ?? rank,
    score: doc.score ?? null,
    specialty: doc.specialty ?? null,
    fit_category: doc.fit_category ?? null,
    fit_reason: doc.fit_reason ?? null,
  };
}

/**
 * Record a query and its doctor list (top 10) and optional AI reasoning.
 *
 * @param {string} query - Search query text
 * @param {Array} doctors - Up to 10 doctors { id, name, rank?, score?, specialty }
 * @param {Object} [options] - Optional { aiReasoning, sessionPhoneNumber, filterConditions }
 * @returns {Promise<void>}
 */
async function recordQuery(query, doctors, options = {}) {
  if (typeof options !== 'object' || options === null) {
    options = {};
  }
  const doctorsList = Array.isArray(doctors) ? doctors : [];
  const top10 = doctorsList.slice(0, 10).map((d, i) => normaliseDoctor(d, i + 1));
  const top5 = top10.slice(0, 5);

  const data = loadTrackerData();
  const timestamp = new Date().toISOString();

  const sessionPhoneNumber = (options.sessionPhoneNumber != null && String(options.sessionPhoneNumber).trim() !== '')
    ? String(options.sessionPhoneNumber).trim()
    : null;

  // Normalize filter conditions: only include non-null/non-empty values
  const filterConditions = options.filterConditions && typeof options.filterConditions === 'object'
    ? Object.fromEntries(
        Object.entries(options.filterConditions).filter(([_, v]) => 
          v != null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)
        )
      )
    : null;

  data.queries.push({
    timestamp,
    query: (query || '').trim(),
    sessionPhoneNumber,
    filterConditions,
    top10,
    top5,
    aiReasoning: options.aiReasoning ?? null,
  });

  top5.forEach((doc) => {
    const id = doc.id;
    if (id) {
      data.summary.doctorTally[id] = (data.summary.doctorTally[id] || 0) + 1;
    }
  });

  data.summary.totalQueries = data.queries.length;
  data.summary.lastUpdated = timestamp;
  saveTrackerData(data);

  console.log(
    `[Tracker] Recorded query: "${(query || '').substring(0, 50)}${(query || '').length > 50 ? '...' : ''}" with ${top10.length} doctors`
  );
}

/**
 * Get top recruitment targets by appearance count
 * @param {number} limit
 * @returns {Array}
 */
function getTopRecruitmentTargets(limit = 20) {
  try {
    const data = loadTrackerData();
    const { doctorTally, totalQueries } = data.summary;
    const list = Object.entries(doctorTally)
      .map(([id, count]) => ({
        id,
        appearanceCount: count,
        percentage: totalQueries > 0 ? ((count / totalQueries) * 100).toFixed(2) : '0.00',
      }))
      .sort((a, b) => b.appearanceCount - a.appearanceCount)
      .slice(0, limit);

    const details = new Map();
    data.queries.forEach((q) => {
      (q.top10 || q.top5 || []).forEach((doc) => {
        if (doc.id && !details.has(doc.id)) {
          details.set(doc.id, { name: doc.name, specialty: doc.specialty });
        }
      });
    });

    return list.map((t) => ({
      ...t,
      name: details.get(t.id)?.name ?? 'Unknown',
      specialty: details.get(t.id)?.specialty ?? null,
      percentage: parseFloat(t.percentage),
    }));
  } catch (err) {
    console.error('[Tracker] getTopRecruitmentTargets:', err.message);
    return [];
  }
}

/**
 * Get tracker statistics
 * @returns {Object}
 */
function getTrackerStats() {
  try {
    const data = loadTrackerData();
    const { doctorTally, totalQueries, lastUpdated } = data.summary;
    const uniqueDoctors = Object.keys(doctorTally).length;
    const recentQueries = data.queries
      .slice(-10)
      .reverse()
      .map((q) => ({
        timestamp: q.timestamp,
        query: q.query,
        sessionPhoneNumber: q.sessionPhoneNumber ?? null,
        hasAiReasoning: q.aiReasoning != null,
      }));
    const topTargets = getTopRecruitmentTargets(20);
    return {
      topTargets,
      summary: {
        totalQueries,
        lastUpdated,
        uniqueDoctors,
      },
      recentQueries,
    };
  } catch (err) {
    console.error('[Tracker] getTrackerStats:', err.message);
    return {
      topTargets: [],
      summary: { totalQueries: 0, lastUpdated: null, uniqueDoctors: 0 },
      recentQueries: [],
    };
  }
}

initializeTracker();

module.exports = {
  recordQuery,
  getTopRecruitmentTargets,
  getTrackerStats,
};
