/**
 * Verify the improved merge mapping for BDA dietitians
 */

const { loadMergedData } = require('./apply-ranking');

const practitioners = loadMergedData('merged_all_sources_2026-02-02T13-47-20.json');

console.log(`\n=== Verifying Improved Merge ===\n`);
console.log(`Total practitioners: ${practitioners.length}`);

// Find BDA dietitians
const bdaDietitians = practitioners.filter(p => 
  p._originalRecord?.sources?.includes('BDA Dietitian File')
);

console.log(`BDA Dietitians: ${bdaDietitians.length}`);

// Sample a few BDA dietitians to verify mapping
const samples = bdaDietitians.slice(0, 5);

console.log(`\n=== Sample BDA Dietitians (Improved Mapping) ===\n`);

samples.forEach((p, idx) => {
  console.log(`\n${idx + 1}. ${p.name}`);
  console.log(`   Title: ${p.title || 'N/A'}`);
  console.log(`   Specialty: ${p.specialty}`);
  console.log(`   Clinical Expertise: ${p.clinical_expertise?.substring(0, 100) || 'EMPTY'}`);
  console.log(`   About (first 150 chars): ${p.about?.substring(0, 150) || 'EMPTY'}`);
  console.log(`   Company Name: ${p._originalRecord?.company_name || 'N/A'}`);
  console.log(`   Profile URL: ${p._originalRecord?.profile_url || 'N/A'}`);
  console.log(`   Locations: ${p._originalRecord?.locations?.length || 0} location(s)`);
  if (p._originalRecord?.locations && p._originalRecord.locations.length > 0) {
    p._originalRecord.locations.forEach((loc, i) => {
      console.log(`     ${i+1}. ${loc.address || JSON.stringify(loc)} (${loc.type || 'unknown'})`);
    });
  }
  console.log(`   Geographical Areas: ${p._originalRecord?.geographical_areas_served || 'N/A'}`);
});

// Check field mapping statistics
console.log(`\n=== Field Mapping Statistics ===\n`);
const withClinicalExpertise = bdaDietitians.filter(p => p.clinical_expertise && p.clinical_expertise.trim().length > 0);
const withAbout = bdaDietitians.filter(p => p.about && p.about.trim().length > 0);
const withCompanyName = bdaDietitians.filter(p => p._originalRecord?.company_name);
const withProfileUrl = bdaDietitians.filter(p => p._originalRecord?.profile_url);
const withLocations = bdaDietitians.filter(p => p._originalRecord?.locations && p._originalRecord.locations.length > 0);
const withGeographicalAreas = bdaDietitians.filter(p => p._originalRecord?.geographical_areas_served);

console.log(`With clinical_expertise: ${withClinicalExpertise.length} (${(withClinicalExpertise.length / bdaDietitians.length * 100).toFixed(1)}%)`);
console.log(`With about: ${withAbout.length} (${(withAbout.length / bdaDietitians.length * 100).toFixed(1)}%)`);
console.log(`With company_name: ${withCompanyName.length} (${(withCompanyName.length / bdaDietitians.length * 100).toFixed(1)}%)`);
console.log(`With profile_url: ${withProfileUrl.length} (${(withProfileUrl.length / bdaDietitians.length * 100).toFixed(1)}%)`);
console.log(`With locations: ${withLocations.length} (${(withLocations.length / bdaDietitians.length * 100).toFixed(1)}%)`);
console.log(`With geographical_areas_served: ${withGeographicalAreas.length} (${(withGeographicalAreas.length / bdaDietitians.length * 100).toFixed(1)}%)`);

// Check if industry_services is included in about
console.log(`\n=== Industry Services Integration ===\n`);
const withIndustryServices = bdaDietitians.filter(p => p._originalRecord?.industry_services);
const withIndustryServicesInAbout = bdaDietitians.filter(p => 
  p.about && p._originalRecord?.industry_services && 
  p.about.toLowerCase().includes('services:')
);
console.log(`With industry_services field: ${withIndustryServices.length}`);
console.log(`With industry_services in about: ${withIndustryServicesInAbout.length}`);

if (withIndustryServices.length > 0 && withIndustryServicesInAbout.length < withIndustryServices.length) {
  console.log(`\n⚠️  Warning: Some industry_services may not be included in about field`);
  const missing = bdaDietitians.find(p => 
    p._originalRecord?.industry_services && 
    (!p.about || !p.about.toLowerCase().includes('services:'))
  );
  if (missing) {
    console.log(`   Example: ${missing.name}`);
    console.log(`   Industry services: ${missing._originalRecord.industry_services.substring(0, 100)}`);
    console.log(`   About: ${missing.about?.substring(0, 100) || 'EMPTY'}`);
  }
}

console.log(`\n✅ Verification complete!\n`);
