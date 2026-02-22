/**
 * Generate UK postcode district centroids from postcodes.io (free, no API key)
 *
 * Strategy:
 * 1. Extract unique districts from practitioner data only -> lookup each via postcodes.io
 * 2. Discover more districts by querying a geographic grid (outcodes near lat/lon)
 *
 * Why some districts (e.g. B77) can be missing:
 * - They are not present in the practitioner data (Step 1 only includes districts from merged data)
 * - The grid in Step 3 has 0.25° spacing; small or sparse areas can fall between grid points
 * and never be returned by the "outcodes near this point" API.
 *
 * To add a missing outcode: GET https://api.postcodes.io/outcodes/B77 and add
 * { "B77": { "lat": ..., "lon": ... } } to uk-postcode-centroids.json (between B76 and B79).
 *
 * Run: node data/generate-centroids.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error for ${url}: ${e.message}\nData: ${data.substring(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDistrict(norm) {
  if (!norm) return null;
  if (norm.length > 4 && /\d[A-Z]{2}$/.test(norm)) {
    return norm.slice(0, -3);
  }
  if (/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(norm)) {
    return norm;
  }
  return null;
}

async function main() {
  // Step 1: Extract unique districts from practitioner data
  console.log('Step 1: Extracting postcode districts from practitioner data...');
  const dataFilePath = path.join(__dirname, '..', 'merged_all_sources_2026-02-02T13-47-20.json');
  const rawData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
  const records = rawData.records || [];

  const dataDistricts = new Set();
  for (const record of records) {
    if (!record.locations) continue;
    for (const loc of record.locations) {
      if (loc.postcode) {
        const norm = loc.postcode.toUpperCase().replace(/\s+/g, '');
        const district = extractDistrict(norm);
        if (district) dataDistricts.add(district);
      }
      if (loc.address) {
        const match = loc.address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
        if (match) {
          const norm = match[1].toUpperCase().replace(/\s+/g, '');
          const district = extractDistrict(norm);
          if (district) dataDistricts.add(district);
        }
      }
    }
  }
  console.log(`  Found ${dataDistricts.size} unique districts from practitioner data`);

  // Step 2: Look up each district from our data via postcodes.io /outcodes/:outcode
  // Plus: use the nearest-outcode approach to discover neighbouring districts
  console.log('\nStep 2: Looking up district centroids from postcodes.io...');
  const centroids = {};
  let found = 0;
  let notFound = 0;

  // First look up all districts from our data
  const districtArray = Array.from(dataDistricts).sort();
  const BATCH_SIZE = 10;

  for (let i = 0; i < districtArray.length; i += BATCH_SIZE) {
    const batch = districtArray.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (district) => {
      try {
        const url = `https://api.postcodes.io/outcodes/${encodeURIComponent(district)}`;
        const response = await fetchJSON(url);
        if (response.status === 200 && response.result) {
          const { latitude, longitude } = response.result;
          if (latitude != null && longitude != null) {
            centroids[district] = {
              lat: Math.round(latitude * 10000) / 10000,
              lon: Math.round(longitude * 10000) / 10000
            };
            found++;
            return;
          }
        }
        notFound++;
      } catch {
        notFound++;
      }
    });
    await Promise.all(promises);
    if (i % 100 === 0) {
      console.log(`  Progress: ${i}/${districtArray.length}, found: ${found}`);
    }
    await sleep(150);
  }

  console.log(`  From practitioner data: ${found} found, ${notFound} not found`);

  // Step 3: Discover additional UK districts using nearest-outcode lookups
  // Query a grid of points across the UK to find all outcodes
  console.log('\nStep 3: Discovering additional UK districts via geographic grid...');

  // UK bounding box: lat 49.9-60.9, lon -8.2 to 1.8
  const gridPoints = [];
  for (let lat = 50.0; lat <= 60.5; lat += 0.25) {
    for (let lon = -7.5; lon <= 1.8; lon += 0.25) {
      gridPoints.push({ lat, lon });
    }
  }
  console.log(`  Grid points to query: ${gridPoints.length}`);

  let gridFound = 0;
  for (let i = 0; i < gridPoints.length; i += BATCH_SIZE) {
    const batch = gridPoints.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (point) => {
      try {
        const url = `https://api.postcodes.io/outcodes?lon=${point.lon}&lat=${point.lat}&limit=10&radius=25000`;
        const response = await fetchJSON(url);
        if (response.status === 200 && response.result && Array.isArray(response.result)) {
          for (const outcode of response.result) {
            if (outcode.outcode && outcode.latitude != null && outcode.longitude != null) {
              if (!centroids[outcode.outcode]) {
                centroids[outcode.outcode] = {
                  lat: Math.round(outcode.latitude * 10000) / 10000,
                  lon: Math.round(outcode.longitude * 10000) / 10000
                };
                gridFound++;
              }
            }
          }
        }
      } catch {
        // ignore errors for grid queries
      }
    });
    await Promise.all(promises);
    if (i % 200 === 0) {
      console.log(`  Grid progress: ${i}/${gridPoints.length}, new districts found: ${gridFound}, total: ${Object.keys(centroids).length}`);
    }
    await sleep(150);
  }

  console.log(`  Grid discovery: ${gridFound} additional districts found`);
  console.log(`  Total districts: ${Object.keys(centroids).length}`);

  // Sort and write
  const sorted = {};
  Object.keys(centroids).sort().forEach(key => {
    sorted[key] = centroids[key];
  });

  const outputPath = path.join(__dirname, 'uk-postcode-centroids.json');
  fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 2));
  console.log(`\nWritten to: ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
  console.log(`Total districts: ${Object.keys(sorted).length}`);
}

main().catch(console.error);
