/**
 * Location Filtering Utility
 *
 * Hard filter for practitioners by location: city name, postcode, or radius.
 * Follows the same pattern as specialty-filter.js.
 */

const path = require('path');

// Load postcode district centroids (lat/lon) for radius calculations
let POSTCODE_CENTROIDS = {};
try {
  POSTCODE_CENTROIDS = require(path.join(__dirname, 'data', 'uk-postcode-centroids.json'));
} catch {
  console.warn('[Location Filter] Could not load postcode centroids. Radius filtering will be unavailable.');
}

// ---------------------------------------------------------------------------
// UK city / region data
// ---------------------------------------------------------------------------

const UK_MAJOR_CITIES = new Set([
  'london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'liverpool',
  'edinburgh', 'bristol', 'sheffield', 'cardiff', 'nottingham', 'newcastle',
  'leicester', 'coventry', 'belfast', 'reading', 'brighton', 'cambridge',
  'oxford', 'southampton', 'york', 'exeter', 'bath', 'norwich', 'derby',
  'aberdeen', 'dundee', 'portsmouth', 'plymouth', 'wolverhampton',
  'stoke-on-trent', 'sunderland', 'guildford', 'cheltenham', 'colchester',
  'windsor', 'chester', 'canterbury', 'salisbury', 'winchester', 'st albans',
  'swansea', 'newport', 'middlesbrough', 'bolton', 'stockport', 'luton',
  'slough', 'watford', 'woking', 'crawley', 'maidstone', 'ipswich',
  'peterborough', 'milton keynes', 'northampton', 'swindon', 'gloucester',
  'worcester', 'hereford', 'lincoln', 'carlisle', 'durham', 'wakefield',
  'huddersfield', 'halifax', 'blackpool', 'preston', 'burnley', 'warrington',
  'wigan', 'rochdale', 'oldham', 'doncaster', 'rotherham', 'barnsley',
  'scunthorpe', 'grimsby', 'hull', 'harrogate', 'scarborough',
  'chelmsford', 'basildon', 'southend-on-sea', 'romford', 'ilford',
  'enfield', 'barnet', 'croydon', 'bromley', 'kingston upon thames',
  'richmond', 'wimbledon', 'putney', 'marylebone', 'mayfair',
  'st johns wood', 'hampstead', 'highgate',
  'elstree', 'bushey', 'stanmore', 'edgware',
  'surrey', 'essex', 'kent', 'sussex', 'hertfordshire', 'berkshire',
  'buckinghamshire', 'hampshire', 'suffolk', 'norfolk', 'devon', 'cornwall',
  'dorset', 'somerset', 'wiltshire', 'oxfordshire', 'warwickshire',
  'staffordshire', 'cheshire', 'lancashire', 'yorkshire',
]);

// London boroughs — when a user searches "London", match these too
const LONDON_BOROUGHS = new Set([
  'westminster', 'chelsea', 'kensington', 'hammersmith', 'fulham',
  'camden', 'islington', 'hackney', 'tower hamlets', 'greenwich',
  'lambeth', 'southwark', 'wandsworth', 'lewisham', 'bromley',
  'croydon', 'barnet', 'enfield', 'harrow', 'ealing', 'hounslow',
  'richmond', 'kingston', 'merton', 'sutton', 'bexley', 'havering',
  'redbridge', 'waltham forest', 'newham', 'barking', 'dagenham',
  'hillingdon', 'haringey', 'city of london',
  'marylebone', 'mayfair', 'soho', 'fitzrovia', 'bloomsbury',
  'st johns wood', 'hampstead', 'highgate', 'finchley',
  'wimbledon', 'putney', 'battersea', 'clapham', 'brixton',
  'dulwich', 'peckham', 'deptford', 'woolwich', 'eltham',
  'stratford', 'bow', 'poplar', 'canary wharf', 'docklands',
]);

// London postcode area prefixes
const LONDON_POSTCODE_AREAS = new Set([
  'E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC',
]);

// ---------------------------------------------------------------------------
// Postcode utilities
// ---------------------------------------------------------------------------

/**
 * Normalize a UK postcode: uppercase, strip all spaces
 */
function normalizePostcode(raw) {
  if (!raw) return '';
  return raw.toUpperCase().replace(/\s+/g, '');
}

/**
 * Extract the postcode district (outward code) from a normalized postcode.
 * Full postcode = outward code + 3-char inward code (digit + 2 letters).
 *
 * Examples: "NW87JA" -> "NW8", "SW50TU" -> "SW5", "EC1A1BB" -> "EC1A", "W1G" -> "W1G"
 */
function extractPostcodeDistrict(norm) {
  if (!norm) return '';
  
  // Full UK postcode format: outward code (2-4 chars) + space + inward code (3 chars: digit + 2 letters)
  // After normalization (spaces removed): e.g., "B771BZ", "SW50TU", "EC1A1BB"
  
  // Check if it's a full postcode (has inward code: ends with digit + 2 letters)
  if (norm.length > 4 && /\d[A-Z]{2}$/.test(norm)) {
    // Extract outward code by removing last 3 characters (inward code)
    return norm.slice(0, -3);
  }
  
  // If it's already a district/outward code (like "B77", "SW5", "EC1A"), return as-is
  return norm;
}

/**
 * Extract the postcode area (letters only) from a normalized postcode.
 * "NW87JA" -> "NW", "SW50TU" -> "SW", "W1G8BJ" -> "W"
 */
function extractPostcodeArea(norm) {
  if (!norm) return '';
  const match = norm.match(/^([A-Z]{1,2})/);
  return match ? match[1] : '';
}

/**
 * Check if a normalized postcode string looks like a full UK postcode
 * (outward code + 3-char inward code)
 */
function isFullPostcode(norm) {
  return /^[A-Z]{1,2}\d{1,2}[A-Z]?\d[A-Z]{2}$/.test(norm);
}

/**
 * Try to extract a UK postcode from free-text address
 */
function extractPostcodeFromAddress(address) {
  if (!address) return null;
  const match = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// City parsing
// ---------------------------------------------------------------------------

/**
 * Parse city name from a location's address string.
 * Handles comma-separated and newline-separated formats.
 */
function parseCityFromAddress(address) {
  if (!address) return null;

  // Split by comma or newline
  const segments = address
    .split(/[,\n]/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);

  // Direct match against known cities
  for (const seg of segments) {
    if (UK_MAJOR_CITIES.has(seg)) return seg;
    if (LONDON_BOROUGHS.has(seg)) return seg;
  }

  // Fuzzy: check if any segment contains a known city name
  for (const seg of segments) {
    for (const city of UK_MAJOR_CITIES) {
      if (seg === city || (seg.includes(city) && city.length >= 4)) return city;
    }
    for (const borough of LONDON_BOROUGHS) {
      if (seg === borough || (seg.includes(borough) && borough.length >= 4)) return borough;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function matchCity(loc, normalizedCity) {
  if (!loc) return false;

  // 1. Parse city from address text
  const parsedCity = parseCityFromAddress(loc.address);

  if (parsedCity === normalizedCity) return true;

  // 2. Special London handling
  if (normalizedCity === 'london') {
    // Match if parsed city is a London borough
    if (parsedCity && LONDON_BOROUGHS.has(parsedCity)) return true;

    // Match if address contains "london" anywhere (handles comma-separated lists like "London, Manchester")
    if (loc.address && loc.address.toLowerCase().includes('london')) return true;

    // Match if postcode starts with a London area
    const pc = normalizePostcode(loc.postcode || '');
    if (pc) {
      const area = extractPostcodeArea(pc);
      if (LONDON_POSTCODE_AREAS.has(area)) return true;
    }

    // Also check address-embedded postcodes
    if (loc.address) {
      const extracted = extractPostcodeFromAddress(loc.address);
      if (extracted) {
        const area = extractPostcodeArea(normalizePostcode(extracted));
        if (LONDON_POSTCODE_AREAS.has(area)) return true;
      }
    }
  }

  // 3. Generic: check if address contains the city name (handles comma-separated lists)
  // For addresses like "London, Manchester" or "Service areas: London, Birmingham"
  if (loc.address) {
    const addressLower = loc.address.toLowerCase();
    // Check for exact word match or comma-separated match
    const cityPattern = new RegExp(`\\b${normalizedCity}\\b`, 'i');
    if (cityPattern.test(addressLower)) return true;
  }

  // 4. Check hospital name
  if (loc.hospital && loc.hospital.toLowerCase().includes(normalizedCity)) return true;

  return false;
}

function matchPostcode(loc, normalizedPostcode, postcodePrefix, isFull) {
  // Get postcode from the location's explicit field
  let locPostcode = normalizePostcode(loc.postcode || '');
  let source = 'postcode_field';

  // Fallback: extract from address text
  if (!locPostcode && loc.address) {
    const extracted = extractPostcodeFromAddress(loc.address);
    if (extracted) {
      locPostcode = normalizePostcode(extracted);
      source = 'address_text';
    }
  }

  if (!locPostcode) {
    return false;
  }

  const locDistrict = extractPostcodeDistrict(locPostcode);
  
  if (isFull) {
    // Full postcode match: exact match required
    return locPostcode === normalizedPostcode;
  }
  
  // Prefix match: "SW5" should match "SW50TU", "SW51AA", "SW5", etc.
  // Check if the location's postcode or district starts with the prefix
  // Also check if the prefix matches the location's district
  const postcodeStartsWith = locPostcode.startsWith(postcodePrefix);
  const districtStartsWith = locDistrict.startsWith(postcodePrefix);
  const prefixMatchesDistrict = postcodePrefix === locDistrict;
  
  return postcodeStartsWith || districtStartsWith || prefixMatchesDistrict;
}

function matchRadius(loc, centerCoords, radiusMiles) {
  // Resolve coordinates for this location's postcode district
  let locPostcode = normalizePostcode(loc.postcode || '');
  if (!locPostcode && loc.address) {
    const extracted = extractPostcodeFromAddress(loc.address);
    if (extracted) locPostcode = normalizePostcode(extracted);
  }
  if (!locPostcode) return false;

  const district = extractPostcodeDistrict(locPostcode);
  const locCoords = POSTCODE_CENTROIDS[district];
  if (!locCoords) return false;

  const distance = haversineDistance(
    centerCoords.lat, centerCoords.lon,
    locCoords.lat, locCoords.lon
  );

  return distance <= radiusMiles;
}

/**
 * Fallback matching for practitioners with empty locations array
 * A practitioner passes if ALL active criteria match (consistent with main filter logic)
 * Also checks _originalRecord for location data as fallback
 */
function matchFallbackFields(p, params) {
  const { normalizedCity, normalizedPostcode, postcodePrefix, isFull, centerCoords, radiusMiles, useProximityForPostcode = false } = params;

  // Get location data from practitioner object or _originalRecord
  const locality = (p.address_locality || p._originalRecord?.address_locality || '').toLowerCase();
  const postalCode = p.postal_code || p._originalRecord?.postal_code || '';
  
  // Also check if _originalRecord has any location-like fields
  const origAddress = p._originalRecord?.contact_address || p._originalRecord?.address || '';
  const origGeographicalAreas = p._originalRecord?.geographical_areas_served || '';

  // Check city criterion (if provided)
  if (normalizedCity) {
    let cityMatches = false;
    
    // Check address_locality field
    if (locality && locality.includes(normalizedCity)) {
      cityMatches = true;
    }
    
    // Check contact_address or address field
    if (!cityMatches && origAddress) {
      const addressLower = origAddress.toLowerCase();
      const cityPattern = new RegExp(`\\b${normalizedCity}\\b`, 'i');
      if (cityPattern.test(addressLower)) {
        cityMatches = true;
      }
    }
    
    // Check geographical_areas_served (comma-separated list)
    if (!cityMatches && origGeographicalAreas) {
      const areasLower = origGeographicalAreas.toLowerCase();
      const cityPattern = new RegExp(`\\b${normalizedCity}\\b`, 'i');
      if (cityPattern.test(areasLower)) {
        cityMatches = true;
      }
    }
    
    if (!cityMatches) return false;
  }

  // Check postcode criterion (if provided)
  if (normalizedPostcode) {
    // If using proximity search (centerCoords available), check radius instead of exact match
    if (centerCoords && useProximityForPostcode) {
      let radiusMatches = false;
      
      // Check postal_code field
      const pc = normalizePostcode(postalCode);
      if (pc) {
        const district = extractPostcodeDistrict(pc);
        const coords = POSTCODE_CENTROIDS[district];
        if (coords) {
          const dist = haversineDistance(centerCoords.lat, centerCoords.lon, coords.lat, coords.lon);
          if (dist <= radiusMiles) {
            radiusMatches = true;
          }
        }
      }
      
      // Check if postcode is in address text
      if (!radiusMatches && origAddress) {
        const extracted = extractPostcodeFromAddress(origAddress);
        if (extracted) {
          const pc = normalizePostcode(extracted);
          if (pc) {
            const district = extractPostcodeDistrict(pc);
            const coords = POSTCODE_CENTROIDS[district];
            if (coords) {
              const dist = haversineDistance(centerCoords.lat, centerCoords.lon, coords.lat, coords.lon);
              if (dist <= radiusMiles) {
                radiusMatches = true;
              }
            }
          }
        }
      }
      
      if (!radiusMatches) return false;
    } else {
      // Fallback to prefix/exact matching if no centroid available
      let postcodeMatches = false;
      
      // Check postal_code field
      const pc = normalizePostcode(postalCode);
      if (pc) {
        const matches = isFull ? pc === normalizedPostcode : pc.startsWith(postcodePrefix);
        if (matches) {
          postcodeMatches = true;
        }
      }
      
      // Check if postcode is in address text
      if (!postcodeMatches && origAddress) {
        const extracted = extractPostcodeFromAddress(origAddress);
        if (extracted) {
          const pc = normalizePostcode(extracted);
          if (pc) {
            const matches = isFull ? pc === normalizedPostcode : pc.startsWith(postcodePrefix);
            if (matches) {
              postcodeMatches = true;
            }
          }
        }
      }
      
      if (!postcodeMatches) return false;
    }
  }

  // Check radius criterion (if provided)
  if (centerCoords && radiusMiles) {
    let radiusMatches = false;
    
    // Check postal_code field
    const pc = normalizePostcode(postalCode);
    if (pc) {
      const district = extractPostcodeDistrict(pc);
      const coords = POSTCODE_CENTROIDS[district];
      if (coords) {
        const dist = haversineDistance(centerCoords.lat, centerCoords.lon, coords.lat, coords.lon);
        if (dist <= radiusMiles) {
          radiusMatches = true;
        }
      }
    }
    
    // Check if postcode is in address text
    if (!radiusMatches && origAddress) {
      const extracted = extractPostcodeFromAddress(origAddress);
      if (extracted) {
        const pc = normalizePostcode(extracted);
        if (pc) {
          const district = extractPostcodeDistrict(pc);
          const coords = POSTCODE_CENTROIDS[district];
          if (coords) {
            const dist = haversineDistance(centerCoords.lat, centerCoords.lon, coords.lat, coords.lon);
            if (dist <= radiusMiles) {
              radiusMatches = true;
            }
          }
        }
      }
    }
    
    if (!radiusMatches) return false;
  }

  // All active criteria matched (or no criteria provided)
  return true;
}

// ---------------------------------------------------------------------------
// Haversine distance
// ---------------------------------------------------------------------------

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate distance between two coordinates using the Haversine formula.
 * @returns {number} Distance in miles
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------------------------------------------------------------------
// Main filter function
// ---------------------------------------------------------------------------

/**
 * Filter practitioners by location criteria.
 * A practitioner passes if ANY of their locations match ALL active criteria.
 *
 * @param {Object[]} practitioners - Transformed practitioner array (with _originalRecord)
 * @param {Object}   options
 * @param {string}   [options.city]         - City name (e.g. "London", "Manchester")
 * @param {string}   [options.postcode]     - Postcode or prefix (e.g. "SW5", "NW8 7JA")
 * @param {string}   [options.radiusCenter] - Centre postcode for radius search
 * @param {number}   [options.radiusMiles]  - Radius in miles (default 10)
 * @returns {Object[]} Filtered practitioners
 */
function filterByLocation(practitioners, options = {}) {
  const { city = null, postcode = null, radiusCenter = null, radiusMiles = 10 } = options;

  console.log(`[Location Filter] Called with ${practitioners.length} practitioners, options:`, JSON.stringify(options));

  if (!city && !postcode && !radiusCenter) {
    console.log(`[Location Filter] No location criteria provided, returning all practitioners`);
    return practitioners;
  }

  // Pre-compute search parameters
  const normalizedCity = city ? city.toLowerCase().trim() : null;
  const normalizedPostcode = postcode ? normalizePostcode(postcode) : null;
  const postcodePrefix = normalizedPostcode ? extractPostcodeDistrict(normalizedPostcode) : null;
  const isFull = normalizedPostcode ? isFullPostcode(normalizedPostcode) : false;
  
  // If postcode is provided but no radiusCenter, treat postcode as radius center for proximity search
  let effectiveRadiusCenter = radiusCenter || (normalizedPostcode ? normalizedPostcode : null);
  let effectiveRadiusMiles = radiusMiles;
  
  // If using postcode as radius center, default to 10 miles if no radius specified
  if (normalizedPostcode && !radiusCenter && !radiusMiles) {
    effectiveRadiusMiles = 10; // Default 10 miles for postcode-based proximity search
  }
  
  console.log(`[Location Filter] Normalized criteria: city="${normalizedCity}", postcode="${normalizedPostcode}" (prefix: "${postcodePrefix}", full: ${isFull})`);
  console.log(`[Location Filter] Proximity search: center="${effectiveRadiusCenter}", radius=${effectiveRadiusMiles}mi`);

  // Resolve radius centre coordinates (from radiusCenter or postcode)
  let centerCoords = null;
  let resolvedDistrict = null;
  if (effectiveRadiusCenter) {
    const centerNorm = normalizePostcode(effectiveRadiusCenter);
    const centerDistrict = extractPostcodeDistrict(centerNorm);
    console.log(`[Location Filter] Normalizing "${effectiveRadiusCenter}" -> "${centerNorm}" -> district: "${centerDistrict}"`);
    
    centerCoords = POSTCODE_CENTROIDS[centerDistrict] || null;
    resolvedDistrict = centerDistrict;
    
    // If exact district not found, try to find a nearby district
    if (!centerCoords) {
      // Try to find districts with same area code (e.g., B70, B71, B72, etc. for B77)
      const areaCode = centerDistrict.match(/^([A-Z]{1,2})/)?.[1];
      if (areaCode) {
        const nearbyDistricts = Object.keys(POSTCODE_CENTROIDS).filter(d => d.startsWith(areaCode));
        if (nearbyDistricts.length > 0) {
          // Try to find the numerically closest district
          const centerNum = parseInt(centerDistrict.replace(/^[A-Z]+/, '')) || 0;
          const closest = nearbyDistricts
            .map(d => ({
              district: d,
              num: parseInt(d.replace(/^[A-Z]+/, '')) || 0,
              coords: POSTCODE_CENTROIDS[d]
            }))
            .filter(d => d.coords)
            .sort((a, b) => Math.abs(a.num - centerNum) - Math.abs(b.num - centerNum))[0];
          
          if (closest) {
            centerCoords = closest.coords;
            resolvedDistrict = closest.district;
            console.warn(`[Location Filter] ⚠️ District "${centerDistrict}" not found, using nearby district "${resolvedDistrict}"`);
          }
        }
      }
      
      if (!centerCoords) {
        console.warn(`[Location Filter] ⚠️ Could not resolve centroid for "${effectiveRadiusCenter}" (district: "${centerDistrict}").`);
        console.warn(`[Location Filter] Total districts available: ${Object.keys(POSTCODE_CENTROIDS).length}`);
        
        // Check for similar districts
        const similarDistricts = Object.keys(POSTCODE_CENTROIDS).filter(d => 
          d.startsWith(centerDistrict.substring(0, 1)) || 
          centerDistrict.startsWith(d.substring(0, 1))
        ).slice(0, 5);
        
        if (similarDistricts.length > 0) {
          console.warn(`[Location Filter] Similar districts found: ${similarDistricts.join(', ')}`);
        }
        
        // If postcode was provided but centroid not found, fall back to prefix matching
        if (normalizedPostcode && !radiusCenter) {
          console.warn(`[Location Filter] Falling back to prefix matching instead of proximity search.`);
        }
      }
    } else {
      console.log(`[Location Filter] ✅ Resolved centroid for "${resolvedDistrict}": lat=${centerCoords.lat}, lon=${centerCoords.lon}`);
    }
  }

  const filtered = practitioners.filter((p, index) => {
    const locations = p._originalRecord?.locations || [];

    // Debug first few practitioners
    if (index < 3) {
      console.log(`[Location Filter] Practitioner ${index}: ${p.name}`);
      console.log(`  - Locations count: ${locations.length}`);
      console.log(`  - address_locality: ${p.address_locality || 'N/A'}`);
      console.log(`  - postal_code: ${p.postal_code || 'N/A'}`);
      if (locations.length > 0) {
        locations.slice(0, 2).forEach((loc, i) => {
          console.log(`  - Location ${i}: ${JSON.stringify(loc).substring(0, 150)}`);
        });
      }
    }

    // If no locations array or empty, use fallback fields from practitioner object
    if (locations.length === 0) {
      const matches = matchFallbackFields(p, { 
        normalizedCity, 
        normalizedPostcode, 
        postcodePrefix, 
        isFull, 
        centerCoords, 
        radiusMiles: effectiveRadiusMiles,
        useProximityForPostcode: !!normalizedPostcode && !!centerCoords
      });
      if (index < 3) {
        console.log(`  - No locations, using fallback: ${matches ? 'MATCH' : 'NO MATCH'}`);
      }
      return matches;
    }

    // Practitioner passes if ANY location satisfies ALL active criteria
    // Filter out locations that don't have address or postcode (invalid locations)
    const validLocations = locations.filter(loc => loc && (loc.address || loc.postcode || loc.hospital));
    
    // If no valid locations, fall back to practitioner-level fields
    if (validLocations.length === 0) {
      const matches = matchFallbackFields(p, { 
        normalizedCity, 
        normalizedPostcode, 
        postcodePrefix, 
        isFull, 
        centerCoords, 
        radiusMiles: effectiveRadiusMiles,
        useProximityForPostcode: !!normalizedPostcode && !!centerCoords
      });
      if (index < 3) {
        console.log(`  - No valid locations, using fallback: ${matches ? 'MATCH' : 'NO MATCH'}`);
      }
      return matches;
    }

    // Check if any valid location matches ALL active criteria
    const matches = validLocations.some((loc, locIndex) => {
      let cityMatch = !normalizedCity || matchCity(loc, normalizedCity);
      
      // If postcode is provided, use proximity search (radius) instead of exact/prefix matching
      let postcodeMatch = true;
      let radiusMatch = true;
      
      if (normalizedPostcode) {
        // Use radius-based proximity search when postcode is provided
        if (centerCoords) {
          radiusMatch = matchRadius(loc, centerCoords, effectiveRadiusMiles);
          postcodeMatch = radiusMatch; // Postcode match = radius match for proximity search
        } else {
          // Fallback to prefix matching if centroid not available
          postcodeMatch = matchPostcode(loc, normalizedPostcode, postcodePrefix, isFull);
        }
      } else if (centerCoords) {
        // Only radius search (no postcode filter)
        radiusMatch = matchRadius(loc, centerCoords, effectiveRadiusMiles);
      }
      
      if (index < 3 && locIndex < 2) {
        console.log(`  - Location ${locIndex} check: city=${cityMatch}, postcode=${postcodeMatch}, radius=${radiusMatch}`);
      }
      
      return cityMatch && postcodeMatch && radiusMatch;
    });
    
    if (index < 3) {
      console.log(`  - Final result: ${matches ? 'MATCH' : 'NO MATCH'}`);
    }
    
    return matches;
  });

  const label = buildFilterLabel(options);
  if (normalizedPostcode && centerCoords) {
    console.log(`[Location Filter] ${label} (proximity: ${effectiveRadiusMiles}mi from ${postcodePrefix}): ${practitioners.length} -> ${filtered.length} practitioners`);
  } else {
    console.log(`[Location Filter] ${label}: ${practitioners.length} -> ${filtered.length} practitioners`);
  }
  
  // Debug: Log sample of why practitioners might be filtered out
  if (filtered.length === 0 && practitioners.length > 0) {
    console.warn(`[Location Filter] No practitioners matched. Sample practitioner structure:`);
    const sample = practitioners[0];
    console.warn(`  - Has _originalRecord: ${!!sample._originalRecord}`);
    console.warn(`  - Locations count: ${sample._originalRecord?.locations?.length || 0}`);
    if (sample._originalRecord?.locations?.length > 0) {
      const firstLoc = sample._originalRecord.locations[0];
      console.warn(`  - First location: ${JSON.stringify(firstLoc).substring(0, 200)}`);
    }
    console.warn(`  - address_locality: ${sample.address_locality || 'N/A'}`);
    console.warn(`  - postal_code: ${sample.postal_code || 'N/A'}`);
    console.warn(`  - Filter criteria: city=${normalizedCity || 'none'}, postcode=${normalizedPostcode || 'none'}, radius=${centerCoords ? `${radiusMiles}mi` : 'none'}`);
  }

  return filtered;
}

function buildFilterLabel(options) {
  const parts = [];
  if (options.city) parts.push(`city="${options.city}"`);
  if (options.postcode) parts.push(`postcode="${options.postcode}"`);
  if (options.radiusCenter) parts.push(`${options.radiusMiles || 10}mi from "${options.radiusCenter}"`);
  return parts.join(' + ') || 'no filter';
}

// ---------------------------------------------------------------------------
// Stats / diagnostics
// ---------------------------------------------------------------------------

/**
 * Get location coverage statistics for the dataset
 */
function getLocationStats(practitioners) {
  let withLocations = 0;
  let withPostcode = 0;
  let withParsedCity = 0;
  let totalLocations = 0;
  const cities = {};

  for (const p of practitioners) {
    const locs = p._originalRecord?.locations || [];
    if (locs.length > 0) withLocations++;
    totalLocations += locs.length;

    for (const loc of locs) {
      if (loc.postcode) withPostcode++;
      const city = parseCityFromAddress(loc.address);
      if (city) {
        withParsedCity++;
        cities[city] = (cities[city] || 0) + 1;
      }
    }
  }

  const topCities = Object.entries(cities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ city: name, count }));

  return {
    totalPractitioners: practitioners.length,
    withLocations,
    totalLocations,
    withPostcode,
    withParsedCity,
    centroidsLoaded: Object.keys(POSTCODE_CENTROIDS).length,
    topCities,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  filterByLocation,
  normalizePostcode,
  extractPostcodeDistrict,
  extractPostcodeArea,
  parseCityFromAddress,
  haversineDistance,
  getLocationStats,
};
