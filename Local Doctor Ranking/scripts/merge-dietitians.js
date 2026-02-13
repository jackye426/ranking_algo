/**
 * Merge Dietitians File into Existing Data Pool
 * 
 * This script merges a dietitians file (JSON or CSV) into the existing merged_all_sources file.
 * Supports different data structures and automatically detects file format.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const EXISTING_MERGED_FILE = 'merged_all_sources_20260124_150256.json';
const DIETITIANS_FILE = process.argv[2] || 'bda_dietitian_rows.csv'; // Pass filename as argument
const OUTPUT_FILE = `merged_all_sources_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`;

/**
 * Parse CSV file and convert to array of objects
 * Handles quoted fields, commas within quotes, and multi-line fields
 */
function parseCSV(csvFilePath) {
  console.log(`[Loading] Parsing CSV file: ${csvFilePath}`);
  
  const csvContent = fs.readFileSync(csvFilePath, 'utf8');
  
  // Normalize line endings
  const normalized = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Parse CSV properly handling quoted fields
  function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    values.push(current.trim());
    
    return values;
  }
  
  // Split into lines, handling multi-line quoted fields
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line (and not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  
  // Add last line if exists
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.replace(/^"|"$/g, '').trim());
  console.log(`[Loading] CSV headers (${headers.length}): ${headers.join(', ')}`);
  
  // Parse data rows
  const records = [];
  let skippedRows = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = parseCSVLine(line);
    
    // Handle rows with different column counts (pad or truncate)
    const paddedValues = [...values];
    while (paddedValues.length < headers.length) {
      paddedValues.push('');
    }
    const finalValues = paddedValues.slice(0, headers.length);
    
    const record = {};
    headers.forEach((header, index) => {
      let value = finalValues[index] || '';
      // Remove surrounding quotes if present
      value = value.replace(/^"|"$/g, '');
      record[header] = value;
    });
    
    // Only add records that have at least a name or id
    if (record.name || record.id) {
      records.push(record);
    } else {
      skippedRows++;
    }
  }
  
  console.log(`[Loading] Parsed ${records.length} CSV records (${skippedRows} empty rows skipped)`);
  return records;
}

/**
 * Transform dietitian record to match merged data structure
 * Handles different possible structures (JSON and CSV)
 */
function transformDietitianRecord(record, index) {
  // Try to detect structure and normalize
  
  // Structure 1: Already in merged format
  if (record.id && record.specialty) {
    return record;
  }
  
  // Normalize field names (handle CSV column variations)
  const getName = () => {
    return record.name || 
           record.full_name || 
           record.practitioner_name || 
           record['Full Name'] ||
           record['Name'] ||
           record['Practitioner Name'] ||
           'Unknown';
  };
  
  const getTitle = () => {
    return record.title || 
           record.qualification || 
           record['Title'] ||
           record['Qualification'] ||
           null;
  };
  
  const getSpecialty = () => {
    return record.specialty || 
           record['Specialty'] ||
           'Dietitian';
  };
  
  const getClinicalExpertise = () => {
    // BDA schema: clinical_expertise is a direct field (comma-separated list)
    // Also check for clinical_interests for backward compatibility
    return record.clinical_expertise || 
           record.clinical_interests || 
           record.expertise || 
           record['Clinical Expertise'] ||
           record['Clinical Interests'] ||
           '';
  };
  
  const getAbout = () => {
    // BDA schema: bio is the main bio field
    // Combine bio + industry_services for richer content
    const bio = record.bio || 
                record.about || 
                record.description ||
                record['Bio'] ||
                record['About'] ||
                record['Description'] ||
                '';
    
    const industryServices = record.industry_services || 
                             record['Industry Services'] ||
                             '';
    
    // Combine bio and industry services if both exist
    if (bio && industryServices) {
      return `${bio}\n\nServices: ${industryServices}`;
    }
    return bio || industryServices || '';
  };
  
  const getIndustryServices = () => {
    return record.industry_services || 
           record['Industry Services'] ||
           '';
  };
  
  const getGeographicalAreas = () => {
    return record.geographical_areas_served || 
           record['Geographical Areas Served'] ||
           '';
  };
  
  const getContactAddress = () => {
    return record.contact_address || 
           record['Contact Address'] ||
           '';
  };
  
  const getCompanyName = () => {
    return record.company_name || 
           record['Company Name'] ||
           null;
  };
  
  const getProfileUrl = () => {
    return record.profile_url || 
           record['Profile URL'] ||
           null;
  };
  
  const getGMCNumber = () => {
    return record.gmc_number || 
           record.hcpc_number || 
           record['GMC Number'] ||
           record['HCPC Number'] ||
           null;
  };
  
  // Handle procedures (could be comma-separated string in CSV)
  const getProcedures = () => {
    if (Array.isArray(record.procedures)) {
      return record.procedures;
    }
    if (record.procedure_groups) {
      return Array.isArray(record.procedure_groups) 
        ? record.procedure_groups.map(pg => typeof pg === 'object' ? pg.procedure_group_name : pg)
        : [];
    }
    if (record['Procedures']) {
      const procStr = record['Procedures'];
      if (typeof procStr === 'string') {
        return procStr.split(',').map(p => p.trim()).filter(Boolean);
      }
      return Array.isArray(procStr) ? procStr : [];
    }
    return [];
  };
  
  // Handle languages (could be comma-separated string in CSV)
  const getLanguages = () => {
    if (Array.isArray(record.languages)) {
      return record.languages;
    }
    if (record['Languages']) {
      const langStr = record['Languages'];
      if (typeof langStr === 'string') {
        return langStr.split(',').map(l => l.trim()).filter(Boolean);
      }
      return Array.isArray(langStr) ? langStr : [];
    }
    return [];
  };
  
  // Structure 2: Simple object with name, specialty, etc. (or CSV row)
  // BDA Schema mapping:
  // - name → name
  // - title → title  
  // - bio → about/description
  // - clinical_expertise → clinical_expertise (comma-separated list)
  // - industry_services → included in about/description
  // - geographical_areas_served → locations
  // - contact_address → locations
  // - company_name → stored for reference
  // - profile_url → stored for reference
  
  const clinicalExpertise = getClinicalExpertise();
  const about = getAbout();
  const industryServices = getIndustryServices();
  const geographicalAreas = getGeographicalAreas();
  const contactAddress = getContactAddress();
  const companyName = getCompanyName();
  const profileUrl = getProfileUrl();
  
  // Build locations array from contact_address and geographical_areas_served
  const locations = [];
  if (contactAddress) {
    locations.push({
      address: contactAddress,
      type: 'practice_address'
    });
  }
  if (geographicalAreas) {
    // Parse comma-separated geographical areas
    const areas = geographicalAreas.split(',').map(a => a.trim()).filter(Boolean);
    areas.forEach(area => {
      locations.push({
        address: area,
        type: 'service_area',
        geographical_area: true
      });
    });
  }
  
  const transformed = {
    id: record.id || 
        record.practitioner_id || 
        record['ID'] ||
        record['Practitioner ID'] ||
        `dietitian_${Date.now()}_${index}`,
    name: getName(),
    title: getTitle(),
    specialty: getSpecialty(),
    specialty_source: 'BDA Dietitian File',
    specialties: record.specialties || 
                 (record['Specialties'] ? (typeof record['Specialties'] === 'string' ? record['Specialties'].split(',').map(s => s.trim()) : record['Specialties']) : []) ||
                 [getSpecialty()],
    // BDA schema: clinical_expertise is a comma-separated list (e.g., "Diabetes, IBS, Obesity")
    // Store as-is for BM25 search (createWeightedSearchableText handles unstructured format)
    clinical_expertise: clinicalExpertise,
    clinical_interests: clinicalExpertise, // Also store in clinical_interests for backward compatibility
    about: about,
    // Store BDA-specific fields for reference
    company_name: companyName,
    profile_url: profileUrl,
    industry_services: industryServices, // Store separately for potential future use
    geographical_areas_served: geographicalAreas, // Store separately for location filtering
    procedures: getProcedures(),
    gmc_number: getGMCNumber(),
    year_qualified: record.year_qualified || 
                    record['Year Qualified'] ||
                    null,
    years_experience: record.years_experience || 
                      record['Years Experience'] ||
                      null,
    gender: record.gender || 
            record['Gender'] ||
            null,
    languages: getLanguages(),
    qualifications: record.qualifications || 
                    (record['Qualifications'] ? (typeof record['Qualifications'] === 'string' ? record['Qualifications'].split(',').map(q => q.trim()) : record['Qualifications']) : []) ||
                    [],
    professional_memberships: record.professional_memberships || 
                             record.memberships ||
                             (record['Professional Memberships'] ? (typeof record['Professional Memberships'] === 'string' ? record['Professional Memberships'].split(',').map(m => m.trim()) : record['Professional Memberships']) : []) ||
                             [],
    patient_age_group: record.patient_age_group || 
                       (record['Patient Age Group'] ? (typeof record['Patient Age Group'] === 'string' ? record['Patient Age Group'].split(',').map(a => a.trim()) : record['Patient Age Group']) : []) ||
                       [],
    nhs_base: record.nhs_base || 
              record['NHS Base'] ||
              null,
    locations: locations.length > 0 ? locations : 
               (record.locations || []) ||
               (record.location ? [record.location] : []) ||
               (record['Location'] ? [{ address: record['Location'] }] : []) ||
               [],
    sources: ['BDA Dietitian File'],
    match_confidence: 100.0,
    match_method: 'direct',
    merge_date: new Date().toISOString(),
    conflicts: [],
    requires_review: false,
  };
  
  return transformed;
}

/**
 * Load and transform dietitians file (supports JSON and CSV)
 */
function loadDietitians(dietitiansFilePath) {
  console.log(`[Loading] Reading dietitians from: ${dietitiansFilePath}`);
  
  if (!fs.existsSync(dietitiansFilePath)) {
    throw new Error(`Dietitians file not found: ${dietitiansFilePath}`);
  }
  
  const fileExt = path.extname(dietitiansFilePath).toLowerCase();
  let dietitians = [];
  
  if (fileExt === '.csv') {
    // Parse CSV file
    dietitians = parseCSV(dietitiansFilePath);
  } else {
    // Parse JSON file
    const rawData = fs.readFileSync(dietitiansFilePath, 'utf8');
    const data = JSON.parse(rawData);
    
    // Handle different JSON file structures
    if (Array.isArray(data)) {
      // Structure: [{...}, {...}]
      dietitians = data;
    } else if (data.records && Array.isArray(data.records)) {
      // Structure: { records: [{...}, {...}] }
      dietitians = data.records;
    } else if (data.practitioners && Array.isArray(data.practitioners)) {
      // Structure: { practitioners: [{...}, {...}] }
      dietitians = data.practitioners;
    } else if (data.dietitians && Array.isArray(data.dietitians)) {
      // Structure: { dietitians: [{...}, {...}] }
      dietitians = data.dietitians;
    } else {
      throw new Error('Unknown dietitians file structure. Expected array or object with records/practitioners/dietitians array');
    }
  }
  
  console.log(`[Loading] Found ${dietitians.length} dietitian records`);
  
  // Transform to merged format
  const transformed = dietitians.map((record, index) => transformDietitianRecord(record, index));
  
  console.log(`[Loading] Transformed ${transformed.length} dietitians`);
  console.log(`[Loading] Sample names:`, transformed.slice(0, 5).map(d => d.name).join(', '));
  
  return transformed;
}

/**
 * Load existing merged data
 */
function loadExistingMerged(mergedFilePath) {
  console.log(`[Loading] Reading existing merged data from: ${mergedFilePath}`);
  
  if (!fs.existsSync(mergedFilePath)) {
    throw new Error(`Merged file not found: ${mergedFilePath}`);
  }
  
  const rawData = fs.readFileSync(mergedFilePath, 'utf8');
  const data = JSON.parse(rawData);
  
  const existingRecords = data.records || [];
  console.log(`[Loading] Found ${existingRecords.length} existing records`);
  
  return {
    ...data,
    records: existingRecords,
  };
}

/**
 * Merge dietitians into existing data
 */
function mergeData(existingData, dietitians) {
  console.log(`[Merging] Merging ${dietitians.length} dietitians into ${existingData.records.length} existing records`);
  
  // Create a set of existing IDs to avoid duplicates
  const existingIds = new Set(existingData.records.map(r => r.id));
  
  // Filter out dietitians that already exist (by ID or name)
  const existingNames = new Set(existingData.records.map(r => (r.name || '').toLowerCase().trim()));
  
  const newDietitians = dietitians.filter(d => {
    const id = d.id;
    const name = (d.name || '').toLowerCase().trim();
    
    // Skip if ID already exists
    if (id && existingIds.has(id)) {
      console.log(`[Merging] Skipping duplicate ID: ${id} (${d.name})`);
      return false;
    }
    
    // Skip if name already exists (optional - comment out if you want to allow duplicates)
    // if (name && existingNames.has(name)) {
    //   console.log(`[Merging] Skipping duplicate name: ${d.name}`);
    //   return false;
    // }
    
    return true;
  });
  
  console.log(`[Merging] Adding ${newDietitians.length} new dietitians (${dietitians.length - newDietitians.length} duplicates skipped)`);
  
  // Merge records
  const mergedRecords = [...existingData.records, ...newDietitians];
  
  // Update statistics
  const mergedData = {
    ...existingData,
    total_records: mergedRecords.length,
    merged_at: new Date().toISOString(),
    statistics: {
      ...existingData.statistics,
      dietitian_records: newDietitians.length,
      total_after_merge: mergedRecords.length,
    },
    records: mergedRecords,
  };
  
  return mergedData;
}

/**
 * Main function
 */
function main() {
  try {
    const dietitiansFilePath = path.join(__dirname, DIETITIANS_FILE);
    const mergedFilePath = path.join(__dirname, EXISTING_MERGED_FILE);
    const outputPath = path.join(__dirname, OUTPUT_FILE);
    
    // Load data
    const dietitians = loadDietitians(dietitiansFilePath);
    const existingData = loadExistingMerged(mergedFilePath);
    
    // Merge
    const mergedData = mergeData(existingData, dietitians);
    
    // Save merged data
    console.log(`[Saving] Writing merged data to: ${OUTPUT_FILE}`);
    fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2), 'utf8');
    
    console.log('\n✅ Merge completed successfully!');
    console.log(`📊 Statistics:`);
    console.log(`   Existing records: ${existingData.records.length}`);
    console.log(`   New dietitians: ${mergedData.statistics.dietitian_records}`);
    console.log(`   Total after merge: ${mergedData.total_records}`);
    console.log(`\n📁 Output file: ${OUTPUT_FILE}`);
    console.log(`\n💡 Next step: Update server.js to use the new merged file, or rename it to replace the old one.`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  if (process.argv.length < 3) {
    console.log('Usage: node merge-dietitians.js <dietitians-file.json|csv>');
    console.log('Example: node merge-dietitians.js bda_dietitian_rows.csv');
    console.log('Example: node merge-dietitians.js dietitians.json');
    process.exit(1);
  }
  main();
}

module.exports = {
  loadDietitians,
  transformDietitianRecord,
  mergeData,
};
