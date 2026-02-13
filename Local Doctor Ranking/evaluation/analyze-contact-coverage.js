/**
 * Analyze Email and URL Coverage by Source
 * 
 * Evaluates:
 * 1. Email address coverage by source
 * 2. Website URL coverage by source
 * 3. Identifies sources missing URLs (e.g., HCA, Spire)
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/merged_all_sources_latest.json');

/**
 * Extract source from record
 */
function getSource(record) {
  // Records can have multiple sources, so we'll track each one
  return record.sources || [];
}

/**
 * Check if record has email
 */
function hasEmail(record) {
  // Check top-level email field
  if (record.email && record.email.trim()) return true;
  
  // Check locations for email
  if (record.locations && Array.isArray(record.locations)) {
    for (const loc of record.locations) {
      if (loc.email && loc.email.trim()) return true;
    }
  }
  
  return false;
}

/**
 * Get email from record
 */
function getEmail(record) {
  if (record.email && record.email.trim()) return record.email.trim();
  
  if (record.locations && Array.isArray(record.locations)) {
    for (const loc of record.locations) {
      if (loc.email && loc.email.trim()) return loc.email.trim();
    }
  }
  
  return null;
}

/**
 * Check if record has profile URL for a specific source
 */
function hasProfileUrlForSource(record, source) {
  // Check top-level profile_url (assign to first source if exists)
  if (record.profile_url && record.profile_url.trim()) {
    const sources = record.sources || [];
    if (sources.includes(source)) return true;
  }
  
  // Check profile_urls - can be object or JSON string
  let profileUrlsObj = null;
  if (record.profile_urls) {
    if (typeof record.profile_urls === 'string') {
      try {
        profileUrlsObj = JSON.parse(record.profile_urls);
      } catch (e) {
        // If parsing fails, skip
      }
    } else if (typeof record.profile_urls === 'object') {
      profileUrlsObj = record.profile_urls;
    }
  }
  
  if (profileUrlsObj) {
    const sourceKey = source.toLowerCase();
    const url = profileUrlsObj[sourceKey];
    if (url && url.trim() && url !== 'null') return true;
  }
  
  return false;
}

/**
 * Get profile URLs by source from record
 */
function getProfileUrlsBySource(record) {
  const urlsBySource = {};
  
  // Top-level profile_url (if exists, assign to first source or 'unknown')
  if (record.profile_url && record.profile_url.trim()) {
    const sources = record.sources || ['unknown'];
    sources.forEach(src => {
      if (!urlsBySource[src]) urlsBySource[src] = [];
      urlsBySource[src].push(record.profile_url.trim());
    });
  }
  
  // Check profile_urls - can be object or JSON string
  let profileUrlsObj = null;
  if (record.profile_urls) {
    if (typeof record.profile_urls === 'string') {
      try {
        profileUrlsObj = JSON.parse(record.profile_urls);
      } catch (e) {
        // If parsing fails, skip
      }
    } else if (typeof record.profile_urls === 'object') {
      profileUrlsObj = record.profile_urls;
    }
  }
  
  if (profileUrlsObj) {
    Object.entries(profileUrlsObj).forEach(([source, url]) => {
      if (url && url.trim() && url !== 'null') {
        // Normalize source name (hca -> HCA, bupa -> BUPA, etc.)
        const sourceKey = source.toUpperCase();
        if (!urlsBySource[sourceKey]) urlsBySource[sourceKey] = [];
        urlsBySource[sourceKey].push(url.trim());
      }
    });
  }
  
  return urlsBySource;
}

/**
 * Main analysis function
 */
function analyzeCoverage() {
  console.log('[Analysis] Loading data from:', DATA_FILE);
  
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Data file not found: ${DATA_FILE}`);
  }
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const records = data.records || [];
  
  console.log(`[Analysis] Analyzing ${records.length} records...\n`);
  
  // Statistics by source
  const statsBySource = {};
  
  // Track all sources found
  const allSources = new Set();
  
  // Process each record
  records.forEach(record => {
    const sources = getSource(record);
    
    sources.forEach(source => {
      allSources.add(source);
      
      if (!statsBySource[source]) {
        statsBySource[source] = {
          totalRecords: 0,
          withEmail: 0,
          withUrl: 0,
          emails: [],
          urlsBySource: {}
        };
      }
      
      statsBySource[source].totalRecords++;
      
      // Check email
      if (hasEmail(record)) {
        statsBySource[source].withEmail++;
        const email = getEmail(record);
        if (email && !statsBySource[source].emails.includes(email)) {
          statsBySource[source].emails.push(email);
        }
      }
      
      // Check URL for this specific source
      if (hasProfileUrlForSource(record, source)) {
        statsBySource[source].withUrl++;
        const urlsBySource = getProfileUrlsBySource(record);
        if (urlsBySource[source] && urlsBySource[source].length > 0) {
          if (!statsBySource[source].urlsBySource[source]) {
            statsBySource[source].urlsBySource[source] = [];
          }
          urlsBySource[source].forEach(url => {
            if (!statsBySource[source].urlsBySource[source].includes(url)) {
              statsBySource[source].urlsBySource[source].push(url);
            }
          });
        }
      }
    });
  });
  
  // Calculate percentages and format results
  const results = {
    summary: {
      totalRecords: records.length,
      sourcesAnalyzed: Array.from(allSources).sort(),
      analysisDate: new Date().toISOString()
    },
    bySource: {}
  };
  
  Object.keys(statsBySource).sort().forEach(source => {
    const stats = statsBySource[source];
    const emailCoverage = (stats.withEmail / stats.totalRecords * 100).toFixed(2);
    const urlCoverage = (stats.withUrl / stats.totalRecords * 100).toFixed(2);
    
    results.bySource[source] = {
      totalRecords: stats.totalRecords,
      emailCoverage: {
        count: stats.withEmail,
        percentage: parseFloat(emailCoverage),
        uniqueEmails: stats.emails.length
      },
      urlCoverage: {
        count: stats.withUrl,
        percentage: parseFloat(urlCoverage),
        hasUrls: stats.withUrl > 0
      },
      missingUrl: stats.withUrl === 0
    };
  });
  
  return results;
}

/**
 * Print formatted report
 */
function printReport(results) {
  console.log('='.repeat(80));
  console.log('EMAIL AND URL COVERAGE ANALYSIS BY SOURCE');
  console.log('='.repeat(80));
  console.log(`\nTotal Records: ${results.summary.totalRecords}`);
  console.log(`Sources Analyzed: ${results.summary.sourcesAnalyzed.join(', ')}\n`);
  
  console.log('─'.repeat(80));
  console.log('COVERAGE BY SOURCE');
  console.log('─'.repeat(80));
  
  Object.keys(results.bySource).sort().forEach(source => {
    const stats = results.bySource[source];
    console.log(`\n${source}:`);
    console.log(`  Total Records: ${stats.totalRecords}`);
    console.log(`  Email Coverage: ${stats.emailCoverage.count}/${stats.totalRecords} (${stats.emailCoverage.percentage}%)`);
    console.log(`    Unique Emails: ${stats.emailCoverage.uniqueEmails}`);
    console.log(`  URL Coverage: ${stats.urlCoverage.count}/${stats.totalRecords} (${stats.urlCoverage.percentage}%)`);
    
    if (stats.missingUrl) {
      console.log(`  ⚠️  WARNING: ${source} has NO URLs listed`);
    }
  });
  
  console.log('\n' + '─'.repeat(80));
  console.log('SOURCES WITHOUT URLS:');
  console.log('─'.repeat(80));
  const sourcesWithoutUrls = Object.keys(results.bySource)
    .filter(source => results.bySource[source].missingUrl)
    .sort();
  
  if (sourcesWithoutUrls.length === 0) {
    console.log('  ✓ All sources have at least some URLs');
  } else {
    sourcesWithoutUrls.forEach(source => {
      const stats = results.bySource[source];
      console.log(`  ✗ ${source}: ${stats.totalRecords} records, 0 URLs (0%)`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
}

// Run analysis
try {
  const results = analyzeCoverage();
  printReport(results);
  
  // Save detailed results to JSON
  const outputFile = path.join(__dirname, 'contact-coverage-analysis.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n[Analysis] Detailed results saved to: ${outputFile}`);
  
} catch (error) {
  console.error('[Analysis] Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
