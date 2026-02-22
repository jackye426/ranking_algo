/**
 * Transform Cromwell JSON data to production practitioner schema
 * Maps Cromwell structure to match what BM25 expects
 */

const crypto = require('crypto');

/**
 * Generate a stable ID from Cromwell profile data
 */
const generatePractitionerId = (profile) => {
  const idString = profile.profile_url || profile.name || JSON.stringify(profile);
  return crypto.createHash('md5').update(idString).digest('hex').substring(0, 32);
};

/**
 * Transform a single Cromwell profile to production practitioner format
 */
const transformCromwellProfile = (profile) => {
  const practitionerId = generatePractitionerId(profile);
  
  return {
    practitioner_id: practitionerId,
    id: practitionerId,
    name: profile.name || 'Unknown',
    title: profile.title || null,
    specialty: profile.specialty || null,
    description: profile.about || '',
    about: profile.about || '', // Also set 'about' for createWeightedSearchableText compatibility
    clinical_expertise: profile.clinical_interests || '',
    address_locality: profile.locations?.[0]?.name || 'Cromwell Hospital',
    postal_code: null, // Cromwell data doesn't have postcodes
    address_country: 'United Kingdom',
    verified: profile.gmc_number !== null,
    gmc_number: profile.gmc_number,
    year_qualified: profile.year_qualified || null,
    gender: profile.gender || null,
    languages: profile.languages || [],
    qualifications: profile.qualifications || [],
    professional_memberships: profile.professional_memberships || [],
    memberships: profile.professional_memberships || [], // Also set 'memberships' for createWeightedSearchableText compatibility
    patient_age_group: profile.patient_age_group || [],
    nhs_base: profile.nhs_base || null,
    
    // Quality metrics (Cromwell has quality_score)
    rating_value: profile.quality_score ? (profile.quality_score / 2) : null, // Convert 10-point to 5-point scale
    review_count: 0, // Cromwell doesn't have review counts
    
    // Procedure groups (empty for Cromwell, but structure needed for BM25)
    procedure_groups: [],
    total_admission_count: 0,
    procedure_count: 0,
    
    // Insurance providers (empty for Cromwell)
    insuranceProviders: [],
    
    // Additional Cromwell-specific fields
    profile_url: profile.profile_url,
    subspecialties: profile.subspecialties || [],
    
    // Store original Cromwell profile for UI display
    _cromwellProfile: profile,
    
    // Searchable text (for BM25)
    searchableText: [
      profile.name,
      profile.title,
      profile.specialty,
      profile.about,
      profile.clinical_interests,
      profile.qualifications?.join(' '),
      profile.professional_memberships?.join(' ')
    ].filter(Boolean).join(' ')
  };
};

/**
 * Transform Cromwell JSON corpus to practitioner array
 */
const transformCromwellCorpus = (cromwellData) => {
  if (!cromwellData || !cromwellData.profiles || !Array.isArray(cromwellData.profiles)) {
    throw new Error('Invalid Cromwell data format: expected { profiles: [...] }');
  }
  
  const practitioners = cromwellData.profiles.map(transformCromwellProfile);
  
  console.log(`[Cromwell Transformer] Transformed ${practitioners.length} profiles`);
  console.log(`[Cromwell Transformer] Sample specialties:`, 
    [...new Set(practitioners.map(p => p.specialty).filter(Boolean))].slice(0, 10)
  );
  
  return practitioners;
};

/**
 * Get corpus statistics
 */
const getCorpusStats = (practitioners) => {
  const stats = {
    total: practitioners.length,
    specialties: [...new Set(practitioners.map(p => p.specialty).filter(Boolean))].length,
    verified: practitioners.filter(p => p.verified).length,
    withGMC: practitioners.filter(p => p.gmc_number).length,
    genderDistribution: {
      male: practitioners.filter(p => p.gender === 'Male').length,
      female: practitioners.filter(p => p.gender === 'Female').length,
      unknown: practitioners.filter(p => !p.gender || p.gender === 'Unknown').length
    },
    topSpecialties: Object.entries(
      practitioners.reduce((acc, p) => {
        if (p.specialty) {
          acc[p.specialty] = (acc[p.specialty] || 0) + 1;
        }
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([specialty, count]) => ({ specialty, count }))
  };
  
  return stats;
};

module.exports = {
  transformCromwellProfile,
  transformCromwellCorpus,
  getCorpusStats
};
