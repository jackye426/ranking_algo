const fs = require('fs');
const path = require('path');

/**
 * Add blacklist flag to a doctor in the ranking dataset
 */
function addBlacklistFlag(dataFilePath, doctorName, options = {}) {
  const { normalizedName, notes, reason } = options;
  
  console.log(`[Blacklist] Loading data from: ${dataFilePath}`);
  const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
  
  // Normalize doctor name for matching
  const searchName = normalizedName || doctorName.toLowerCase().replace(/^(dr|mr|mrs|miss|professor|prof)\.?\s+/i, '').trim();
  
  console.log(`[Blacklist] Searching for: "${doctorName}" (normalized: "${searchName}")`);
  
  let found = false;
  let updatedCount = 0;
  
  if (data.records && Array.isArray(data.records)) {
    // Handle integrated_practitioners format
    for (const record of data.records) {
      const recordName = (record.name || '').toLowerCase().replace(/^(dr|mr|mrs|miss|professor|prof)\.?\s+/i, '').trim();
      
      if (recordName === searchName || record.name === doctorName) {
        found = true;
        updatedCount++;
        
        // Add blacklist flag
        record.blacklisted = true;
        record.blacklistedDate = new Date().toISOString().split('T')[0];
        record.blacklistNotes = notes || 'Blacklisted - should not be recommended';
        record.blacklistReason = reason || 'Blacklisted';
        
        console.log(`[Blacklist] ✅ Updated record: ${record.name} (ID: ${record.id || 'N/A'})`);
        console.log(`[Blacklist]   - Name: ${record.name}`);
        console.log(`[Blacklist]   - Specialty: ${record.specialty || 'N/A'}`);
      }
    }
  } else if (Array.isArray(data)) {
    // Handle array format
    for (const record of data) {
      const recordName = (record.name || '').toLowerCase().replace(/^(dr|mr|mrs|miss|professor|prof)\.?\s+/i, '').trim();
      
      if (recordName === searchName || record.name === doctorName) {
        found = true;
        updatedCount++;
        
        record.blacklisted = true;
        record.blacklistedDate = new Date().toISOString().split('T')[0];
        record.blacklistNotes = notes || 'Blacklisted - should not be recommended';
        record.blacklistReason = reason || 'Blacklisted';
        
        console.log(`[Blacklist] ✅ Updated record: ${record.name} (ID: ${record.id || 'N/A'})`);
      }
    }
  }
  
  if (!found) {
    console.log(`[Blacklist] ❌ Doctor not found: "${doctorName}"`);
    return false;
  }
  
  console.log(`[Blacklist] 📝 Saving updated data...`);
  const backupPath = dataFilePath.replace('.json', `_backup_${Date.now()}.json`);
  fs.copyFileSync(dataFilePath, backupPath);
  console.log(`[Blacklist] 💾 Backup created: ${backupPath}`);
  
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[Blacklist] ✅ Successfully updated ${updatedCount} record(s) in ${dataFilePath}`);
  
  return true;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node add-blacklist-flag.js <data-file> <doctor-name> [options]');
    console.log('');
    console.log('Examples:');
    console.log('  node add-blacklist-flag.js integrated_practitioners_with_isrctn_latest.json "Mr Austin Ugwumadu"');
    console.log('  node add-blacklist-flag.js data/merged_all_sources_latest.json "Dr. Austin Ugwumadu" --notes "Blacklisted"');
    process.exit(1);
  }
  
  const dataFilePath = path.resolve(args[0]);
  const doctorName = args[1];
  
  if (!fs.existsSync(dataFilePath)) {
    console.error(`❌ File not found: ${dataFilePath}`);
    process.exit(1);
  }
  
  const options = {
    notes: args.includes('--notes') ? args[args.indexOf('--notes') + 1] : undefined,
    reason: args.includes('--reason') ? args[args.indexOf('--reason') + 1] : undefined,
  };
  
  const success = addBlacklistFlag(dataFilePath, doctorName, options);
  process.exit(success ? 0 : 1);
}

module.exports = { addBlacklistFlag };
