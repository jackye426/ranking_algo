/**
 * Specialty Filtering Utility
 * 
 * Filters practitioners by specialty/subspecialty to optimize ranking performance
 */

/**
 * Normalize specialty/subspecialty names for matching
 */
function normalizeSpecialtyName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Filter practitioners by manual specialty filter
 * 
 * @param {Array} practitioners - All practitioners
 * @param {Object} options - Filtering options
 * @param {string} options.manualSpecialty - Manual specialty to filter by
 * @returns {Array} Filtered practitioners
 */
function filterBySpecialty(practitioners, options = {}) {
  const { manualSpecialty = null } = options;
  
  // If no manual specialty provided, return all practitioners
  if (!manualSpecialty) {
    return practitioners;
  }
  
  // Manual specialty filter - search across all profile fields
  const normalizedManual = normalizeSpecialtyName(manualSpecialty);
  const searchTerms = normalizedManual.split(/\s+/).filter(term => term.length > 2);
  
  const filtered = practitioners.filter(p => {
    // Check specialty field (bidirectional so "Physiotherapy" and "Physiotherapist" match each other)
    if (p.specialty) {
      const normSpec = normalizeSpecialtyName(p.specialty);
      if (normSpec.includes(normalizedManual) || normalizedManual.includes(normSpec)) {
        return true;
      }
    }
    
    // Check subspecialties
    if (p.subspecialties && p.subspecialties.some(sub => 
      normalizeSpecialtyName(sub).includes(normalizedManual) ||
      searchTerms.some(term => normalizeSpecialtyName(sub).includes(term))
    )) {
      return true;
    }
    
    // Check clinical expertise (broader search)
    if (p.clinical_expertise) {
      const expertiseLower = p.clinical_expertise.toLowerCase();
      if (expertiseLower.includes(normalizedManual) ||
          searchTerms.some(term => expertiseLower.includes(term))) {
        return true;
      }
    }
    
    // Check title
    if (p.title) {
      const titleLower = p.title.toLowerCase();
      if (titleLower.includes(normalizedManual) ||
          searchTerms.some(term => titleLower.includes(term))) {
        return true;
      }
    }
    
    return false;
  });
  
  console.log(`[Specialty Filter] Manual filter "${manualSpecialty}": ${practitioners.length} → ${filtered.length} practitioners`);
  
  return filtered;
}

/**
 * Get list of all unique specialties in the dataset
 */
function getAllSpecialties(practitioners) {
  const specialties = new Set();
  practitioners.forEach(p => {
    if (p.specialty) {
      specialties.add(p.specialty);
    }
  });
  return Array.from(specialties).sort();
}

/**
 * Get statistics about specialty distribution
 */
function getSpecialtyStats(practitioners) {
  const stats = {};
  practitioners.forEach(p => {
    if (p.specialty) {
      stats[p.specialty] = (stats[p.specialty] || 0) + 1;
    }
  });
  
  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([specialty, count]) => ({ specialty, count }));
}

module.exports = {
  filterBySpecialty,
  getAllSpecialties,
  getSpecialtyStats,
  normalizeSpecialtyName
};
