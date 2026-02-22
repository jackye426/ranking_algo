/**
 * Utility to map doctor names to practitioner IDs
 * Handles name variations and fuzzy matching
 */

const crypto = require('crypto');

/**
 * Generate practitioner ID from profile (same as transform function)
 */
const generatePractitionerId = (profile) => {
  const idString = profile.profile_url || profile.name || JSON.stringify(profile);
  return crypto.createHash('md5').update(idString).digest('hex').substring(0, 32);
};

/**
 * Normalize name for matching (remove titles, extra spaces, case-insensitive)
 */
const normalizeName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^(dr|prof|professor|mr|mrs|ms|miss)\s+/i, '') // Remove titles
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
};

/**
 * Create name-to-ID mapping from practitioners array
 * @param {Array} practitioners - Array of practitioner objects
 * @returns {Object} Map of normalized names to practitioner IDs
 */
const createNameToIdMap = (practitioners) => {
  const nameMap = {};
  
  practitioners.forEach(practitioner => {
    const name = practitioner.name || '';
    const normalized = normalizeName(name);
    const id = practitioner.practitioner_id || practitioner.id;
    
    if (normalized && id) {
      // Store both normalized and original name
      nameMap[normalized] = id;
      nameMap[name.toLowerCase()] = id; // Also store lowercase original
      nameMap[name] = id; // And exact original
    }
  });
  
  return nameMap;
};

/**
 * Create name-to-ID mapping from Cromwell profiles
 * @param {Array} cromwellProfiles - Array of Cromwell profile objects
 * @returns {Object} Map of names to practitioner IDs
 */
const createNameToIdMapFromCromwell = (cromwellProfiles) => {
  const nameMap = {};
  
  cromwellProfiles.forEach(profile => {
    const name = profile.name || '';
    const id = generatePractitionerId(profile);
    const normalized = normalizeName(name);
    
    if (normalized && id) {
      nameMap[normalized] = id;
      nameMap[name.toLowerCase()] = id;
      nameMap[name] = id;
    }
  });
  
  return nameMap;
};

/**
 * Resolve ground truth names to practitioner IDs
 * @param {Array} groundTruthNames - Array of doctor names (e.g., ["Dr Krishnaraj Rathod", ...])
 * @param {Object} nameToIdMap - Name-to-ID mapping object
 * @returns {Array} Array of practitioner IDs, or null if resolution fails
 */
const resolveGroundTruthNames = (groundTruthNames, nameToIdMap) => {
  if (!groundTruthNames || !Array.isArray(groundTruthNames)) {
    return null;
  }
  
  const resolvedIds = [];
  const unresolvedNames = [];
  
  groundTruthNames.forEach(name => {
    const normalized = normalizeName(name);
    let id = nameToIdMap[normalized] || nameToIdMap[name.toLowerCase()] || nameToIdMap[name];
    
    // If still not found, try fuzzy matching (exact substring match)
    if (!id) {
      const nameLower = normalized.toLowerCase();
      for (const [mapName, mapId] of Object.entries(nameToIdMap)) {
        if (mapName.toLowerCase().includes(nameLower) || nameLower.includes(mapName.toLowerCase())) {
          id = mapId;
          break;
        }
      }
    }
    
    if (id) {
      resolvedIds.push(id);
    } else {
      unresolvedNames.push(name);
    }
  });
  
  if (unresolvedNames.length > 0) {
    console.warn('[Name Mapper] Could not resolve names:', unresolvedNames);
  }
  
  return resolvedIds.length > 0 ? resolvedIds : null;
};

/**
 * Find practitioner by name (fuzzy matching)
 * @param {string} name - Doctor name to find
 * @param {Array} practitioners - Array of practitioner objects
 * @returns {Object|null} Practitioner object or null if not found
 */
const findPractitionerByName = (name, practitioners) => {
  const normalized = normalizeName(name);
  
  // Try exact match first
  let found = practitioners.find(p => {
    const pName = normalizeName(p.name);
    return pName === normalized;
  });
  
  // Try fuzzy match (contains)
  if (!found) {
    found = practitioners.find(p => {
      const pName = normalizeName(p.name);
      return pName.includes(normalized) || normalized.includes(pName);
    });
  }
  
  return found || null;
};

module.exports = {
  normalizeName,
  createNameToIdMap,
  createNameToIdMapFromCromwell,
  resolveGroundTruthNames,
  findPractitionerByName,
  generatePractitionerId
};
