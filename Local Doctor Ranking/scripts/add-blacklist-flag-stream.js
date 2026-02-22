const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Add blacklist flag to a doctor using streaming approach for large files
 */
function addBlacklistFlagStream(dataFilePath, doctorName, options = {}) {
  const { notes, reason } = options;
  
  console.log(`[Blacklist] Processing large file: ${dataFilePath}`);
  console.log(`[Blacklist] Searching for: "${doctorName}"`);
  
  // Create backup first
  const backupPath = dataFilePath.replace('.json', `_backup_${Date.now()}.json`);
  console.log(`[Blacklist] 💾 Creating backup: ${backupPath}`);
  fs.copyFileSync(dataFilePath, backupPath);
  
  // Read file as text and do string replacement
  console.log(`[Blacklist] 📖 Reading file...`);
  const fileContent = fs.readFileSync(dataFilePath, 'utf8');
  
  // Find the doctor's record using regex
  // Look for the name field followed by the record structure
  const normalizedName = doctorName.toLowerCase().replace(/^(dr|mr|mrs|miss|professor|prof)\.?\s+/i, '').trim();
  const namePattern = new RegExp(
    `("name":\\s*"${doctorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^}]*)(})`,
    'gi'
  );
  
  let updated = false;
  let matchCount = 0;
  
  // Replace the record with blacklist fields added
  const updatedContent = fileContent.replace(namePattern, (match, recordStart, closingBrace) => {
    matchCount++;
    
    // Check if blacklisted already exists
    if (recordStart.includes('"blacklisted"')) {
      console.log(`[Blacklist] ⚠️  Record already has blacklist flag, updating...`);
      // Update existing blacklist fields
      return recordStart
        .replace(/"blacklisted":\s*[^,}]+/g, '"blacklisted": true')
        .replace(/"blacklistedDate":\s*"[^"]*"/g, `"blacklistedDate": "${new Date().toISOString().split('T')[0]}"`)
        .replace(/"blacklistNotes":\s*"[^"]*"/g, `"blacklistNotes": "${(notes || 'Blacklisted - should not be recommended').replace(/"/g, '\\"')}"`)
        .replace(/"blacklistReason":\s*"[^"]*"/g, `"blacklistReason": "${(reason || 'Blacklisted').replace(/"/g, '\\"')}"`) + closingBrace;
    }
    
    // Add blacklist fields before the closing brace
    const blacklistFields = `,\n      "blacklisted": true,\n      "blacklistedDate": "${new Date().toISOString().split('T')[0]}",\n      "blacklistNotes": "${(notes || 'Blacklisted - should not be recommended').replace(/"/g, '\\"')}",\n      "blacklistReason": "${(reason || 'Blacklisted').replace(/"/g, '\\"')}"`;
    
    updated = true;
    return recordStart + blacklistFields + closingBrace;
  });
  
  if (matchCount === 0) {
    console.log(`[Blacklist] ❌ Doctor not found: "${doctorName}"`);
    console.log(`[Blacklist] Trying alternative search patterns...`);
    
    // Try without title prefix
    const nameWithoutTitle = doctorName.replace(/^(dr|mr|mrs|miss|professor|prof)\.?\s+/i, '').trim();
    const altPattern = new RegExp(
      `("name":\\s*"[^"]*${nameWithoutTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^}]*)(})`,
      'gi'
    );
    
    const altUpdatedContent = fileContent.replace(altPattern, (match, recordStart, closingBrace) => {
      if (recordStart.includes('"blacklisted"')) {
        return recordStart
          .replace(/"blacklisted":\s*[^,}]+/g, '"blacklisted": true')
          .replace(/"blacklistedDate":\s*"[^"]*"/g, `"blacklistedDate": "${new Date().toISOString().split('T')[0]}"`)
          .replace(/"blacklistNotes":\s*"[^"]*"/g, `"blacklistNotes": "${(notes || 'Blacklisted - should not be recommended').replace(/"/g, '\\"')}"`)
          .replace(/"blacklistReason":\s*"[^"]*"/g, `"blacklistReason": "${(reason || 'Blacklisted').replace(/"/g, '\\"')}"`) + closingBrace;
      }
      
      const blacklistFields = `,\n      "blacklisted": true,\n      "blacklistedDate": "${new Date().toISOString().split('T')[0]}",\n      "blacklistNotes": "${(notes || 'Blacklisted - should not be recommended').replace(/"/g, '\\"')}",\n      "blacklistReason": "${(reason || 'Blacklisted').replace(/"/g, '\\"')}"`;
      updated = true;
      return recordStart + blacklistFields + closingBrace;
    });
    
    if (updated) {
      console.log(`[Blacklist] ✅ Found and updated record using alternative pattern`);
      fs.writeFileSync(dataFilePath, altUpdatedContent, 'utf8');
      console.log(`[Blacklist] ✅ Successfully updated ${dataFilePath}`);
      return true;
    } else {
      console.log(`[Blacklist] ❌ Doctor not found with any pattern`);
      return false;
    }
  }
  
  if (updated) {
    console.log(`[Blacklist] ✅ Found ${matchCount} matching record(s)`);
    fs.writeFileSync(dataFilePath, updatedContent, 'utf8');
    console.log(`[Blacklist] ✅ Successfully updated ${dataFilePath}`);
    return true;
  } else {
    console.log(`[Blacklist] ⚠️  Found record but it may already be updated`);
    return true;
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node add-blacklist-flag-stream.js <data-file> <doctor-name> [--notes "notes"] [--reason "reason"]');
    console.log('');
    console.log('Example:');
    console.log('  node add-blacklist-flag-stream.js integrated_practitioners_with_isrctn_latest.json "Mr Austin Ugwumadu"');
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
  
  const success = addBlacklistFlagStream(dataFilePath, doctorName, options);
  process.exit(success ? 0 : 1);
}

module.exports = { addBlacklistFlagStream };
