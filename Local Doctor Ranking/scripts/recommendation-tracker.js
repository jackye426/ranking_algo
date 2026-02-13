/**
 * Recommendation Tracker
 * 
 * Tracks all queries and their top 5 doctor recommendations.
 * Maintains a running tally of doctor appearances for recruitment targeting.
 */

const fs = require('fs');
const path = require('path');

const TRACKER_FILE = path.join(__dirname, 'recommendation-tracker.json');

/**
 * Initialize tracker file if it doesn't exist
 */
function initializeTracker() {
  if (!fs.existsSync(TRACKER_FILE)) {
    const initialData = {
      queries: [],
      summary: {
        doctorTally: {},
        totalQueries: 0,
        lastUpdated: null
      }
    };
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

/**
 * Load tracker data from file
 */
function loadTrackerData() {
  initializeTracker();
  try {
    const data = fs.readFileSync(TRACKER_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Tracker] Error loading tracker data:', error.message);
    // Return empty structure if file is corrupted
    return {
      queries: [],
      summary: {
        doctorTally: {},
        totalQueries: 0,
        lastUpdated: null
      }
    };
  }
}

/**
 * Save tracker data to file atomically
 */
function saveTrackerData(data) {
  const tempFile = TRACKER_FILE + '.tmp';
  try {
    // Write to temp file first
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    // Atomic rename
    fs.renameSync(tempFile, TRACKER_FILE);
  } catch (error) {
    console.error('[Tracker] Error saving tracker data:', error.message);
    // Clean up temp file if it exists
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Record a query and its top 5 doctor recommendations
 * @param {string} query - The user's search query
 * @param {Array} top5Doctors - Array of top 5 doctors with {id, name, rank, score, specialty}
 * @returns {Promise<void>}
 */
async function recordQuery(query, top5Doctors) {
  try {
    const data = loadTrackerData();
    const timestamp = new Date().toISOString();
    
    // Ensure we only take top 5
    const top5 = (top5Doctors || []).slice(0, 5);
    
    // Add query record
    data.queries.push({
      timestamp,
      query: query || '',
      top5: top5.map(doc => ({
        id: doc.id || null,
        name: doc.name || 'Unknown',
        rank: doc.rank || null,
        score: doc.score || null,
        specialty: doc.specialty || null
      }))
    });
    
    // Update doctor tally
    top5.forEach(doc => {
      const doctorId = doc.id;
      if (doctorId) {
        if (!data.summary.doctorTally[doctorId]) {
          data.summary.doctorTally[doctorId] = 0;
        }
        data.summary.doctorTally[doctorId]++;
      }
    });
    
    // Update summary
    data.summary.totalQueries = data.queries.length;
    data.summary.lastUpdated = timestamp;
    
    // Save to file
    saveTrackerData(data);
    
    console.log(`[Tracker] Recorded query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}" with ${top5.length} doctors`);
  } catch (error) {
    console.error('[Tracker] Error recording query:', error.message);
    throw error;
  }
}

/**
 * Get top recruitment targets sorted by appearance count
 * @param {number} limit - Maximum number of targets to return (default: 20)
 * @returns {Array} Array of doctors sorted by appearance count
 */
function getTopRecruitmentTargets(limit = 20) {
  try {
    const data = loadTrackerData();
    const { doctorTally, totalQueries } = data.summary;
    
    // Convert tally to array and sort
    const targets = Object.entries(doctorTally)
      .map(([id, count]) => ({
        id,
        appearanceCount: count,
        percentage: totalQueries > 0 ? ((count / totalQueries) * 100).toFixed(2) : '0.00'
      }))
      .sort((a, b) => b.appearanceCount - a.appearanceCount)
      .slice(0, limit);
    
    // Enrich with doctor details from recent queries
    const doctorDetails = new Map();
    data.queries.forEach(q => {
      q.top5.forEach(doc => {
        if (doc.id && !doctorDetails.has(doc.id)) {
          doctorDetails.set(doc.id, {
            name: doc.name,
            specialty: doc.specialty
          });
        }
      });
    });
    
    // Add details to targets
    return targets.map(target => ({
      ...target,
      name: doctorDetails.get(target.id)?.name || 'Unknown',
      specialty: doctorDetails.get(target.id)?.specialty || null,
      percentage: parseFloat(target.percentage)
    }));
  } catch (error) {
    console.error('[Tracker] Error getting top targets:', error.message);
    return [];
  }
}

/**
 * Get tracker statistics
 * @returns {Object} Summary statistics
 */
function getTrackerStats() {
  try {
    const data = loadTrackerData();
    const { doctorTally, totalQueries, lastUpdated } = data.summary;
    
    // Get unique doctors count
    const uniqueDoctors = Object.keys(doctorTally).length;
    
    // Get recent queries (last 10)
    const recentQueries = data.queries
      .slice(-10)
      .reverse()
      .map(q => ({
        timestamp: q.timestamp,
        query: q.query
      }));
    
    // Get top targets
    const topTargets = getTopRecruitmentTargets(20);
    
    return {
      topTargets,
      summary: {
        totalQueries,
        lastUpdated,
        uniqueDoctors
      },
      recentQueries
    };
  } catch (error) {
    console.error('[Tracker] Error getting stats:', error.message);
    return {
      topTargets: [],
      summary: {
        totalQueries: 0,
        lastUpdated: null,
        uniqueDoctors: 0
      },
      recentQueries: []
    };
  }
}

// Initialize on module load
initializeTracker();

module.exports = {
  recordQuery,
  getTopRecruitmentTargets,
  getTrackerStats
};
