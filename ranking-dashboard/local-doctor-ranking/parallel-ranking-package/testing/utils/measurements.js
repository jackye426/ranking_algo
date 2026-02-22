/**
 * Measurement tools for ranking variant testing
 * - Precision@K calculation
 * - Relevance flagging
 * - Booking proxy tracking
 * - Result export
 */

/**
 * Extract practitioner ID from result object
 */
const getPractitionerId = (result) => {
  return result.document?.practitioner_id || result.document?.id || result.practitioner_id || result.id;
};

/**
 * Calculate Precision@K
 * @param {Array} results - Ranked results from variant
 * @param {Array} groundTruth - Array of practitioner IDs that are relevant
 * @param {number} k - Number of top results to consider (default: 3)
 * @returns {number} Precision@K score (0-1)
 */
const calculatePrecisionAtK = (results, groundTruth, k = 3) => {
  if (!groundTruth || groundTruth.length === 0) {
    return null; // No ground truth available
  }
  
  if (!results || results.length === 0) {
    return 0;
  }
  
  const topK = results.slice(0, k);
  const groundTruthSet = new Set(groundTruth);
  
  const relevantInTopK = topK.filter(result => {
    const practitionerId = getPractitionerId(result);
    return groundTruthSet.has(practitionerId);
  }).length;
  
  // Precision@K = relevant items in top K / K (standard definition)
  return relevantInTopK / k;
};

/**
 * Calculate Recall@K
 * @param {Array} results - Ranked results from variant
 * @param {Array} groundTruth - Array of practitioner IDs that are relevant
 * @param {number} k - Number of top results to consider (default: 5)
 * @returns {number} Recall@K score (0-1)
 */
const calculateRecallAtK = (results, groundTruth, k = 5) => {
  if (!groundTruth || groundTruth.length === 0) {
    return null; // No ground truth available
  }
  
  if (!results || results.length === 0) {
    return 0;
  }
  
  const topK = results.slice(0, k);
  const groundTruthSet = new Set(groundTruth);
  
  const relevantInTopK = topK.filter(result => {
    const practitionerId = getPractitionerId(result);
    return groundTruthSet.has(practitionerId);
  }).length;
  
  // Recall@K = relevant items found in top K / total ground truth items
  return groundTruth.length > 0 ? relevantInTopK / groundTruth.length : 0;
};

/**
 * Calculate Mean Reciprocal Rank (MRR)
 * @param {Array} results - Ranked results from variant
 * @param {Array} groundTruth - Array of practitioner IDs that are relevant
 * @returns {number} MRR score (0-1), or 0 if no ground truth found
 */
const calculateMRR = (results, groundTruth) => {
  if (!groundTruth || groundTruth.length === 0) {
    return null;
  }
  
  if (!results || results.length === 0) {
    return 0;
  }
  
  const groundTruthSet = new Set(groundTruth);
  
  for (let i = 0; i < results.length; i++) {
    const practitionerId = getPractitionerId(results[i]);
    if (groundTruthSet.has(practitionerId)) {
      return 1 / (i + 1); // Rank is 1-indexed
    }
  }
  
  return 0; // No ground truth found in results
};

/**
 * Calculate NDCG (Normalized Discounted Cumulative Gain)
 * @param {Array} results - Ranked results from variant
 * @param {Array} groundTruth - Array of practitioner IDs that are relevant (ordered by relevance)
 * @param {number} k - Number of top results to consider (default: 5)
 * @returns {number} NDCG score (0-1)
 */
const calculateNDCG = (results, groundTruth, k = 5) => {
  if (!groundTruth || groundTruth.length === 0) {
    return null;
  }
  
  if (!results || results.length === 0) {
    return 0;
  }
  
  const topK = results.slice(0, k);
  const groundTruthSet = new Set(groundTruth);
  
  // Calculate DCG (Discounted Cumulative Gain)
  let dcg = 0;
  topK.forEach((result, index) => {
    const practitionerId = getPractitionerId(result);
    const relevance = groundTruthSet.has(practitionerId) ? 1 : 0;
    const rank = index + 1;
    dcg += relevance / Math.log2(rank + 1);
  });
  
  // Calculate IDCG (Ideal DCG) - perfect ranking
  let idcg = 0;
  const minK = Math.min(k, groundTruth.length);
  for (let i = 0; i < minK; i++) {
    idcg += 1 / Math.log2(i + 2); // All relevant, ranked perfectly
  }
  
  return idcg > 0 ? dcg / idcg : 0;
};

/**
 * Calculate position metrics
 * @param {Array} results - Ranked results from variant
 * @param {Array} groundTruth - Array of practitioner IDs that are relevant
 * @returns {Object} Position metrics
 */
const calculatePositionMetrics = (results, groundTruth) => {
  if (!groundTruth || groundTruth.length === 0) {
    return null;
  }
  
  if (!results || results.length === 0) {
    return {
      averagePosition: null,
      minPosition: null,
      maxPosition: null,
      inTop3: 0,
      inTop5: 0,
      inTop10: 0,
      totalFound: 0
    };
  }
  
  const groundTruthSet = new Set(groundTruth);
  const positions = [];
  
  results.forEach((result, index) => {
    const practitionerId = getPractitionerId(result);
    if (groundTruthSet.has(practitionerId)) {
      positions.push(index + 1); // Rank is 1-indexed
    }
  });
  
  return {
    averagePosition: positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
    minPosition: positions.length > 0 ? Math.min(...positions) : null,
    maxPosition: positions.length > 0 ? Math.max(...positions) : null,
    inTop3: positions.filter(p => p <= 3).length,
    inTop5: positions.filter(p => p <= 5).length,
    inTop10: positions.filter(p => p <= 10).length,
    totalFound: positions.length,
    positions: positions // All positions where ground truth was found
  };
};

/**
 * Master evaluation function - calculates all metrics
 * @param {Array} results - Ranked results from variant
 * @param {Array} groundTruth - Array of practitioner IDs that are relevant
 * @param {number} k - Number of top results to consider (default: 5)
 * @returns {Object} All evaluation metrics
 */
const evaluateAgainstGroundTruth = (results, groundTruth, k = 5) => {
  if (!groundTruth || groundTruth.length === 0) {
    return {
      precisionAt3: null,
      precisionAt5: null,
      recallAt3: null,
      recallAt5: null,
      mrr: null,
      ndcg: null,
      positionMetrics: null
    };
  }
  
  return {
    precisionAt3: calculatePrecisionAtK(results, groundTruth, 3),
    precisionAt5: calculatePrecisionAtK(results, groundTruth, 5),
    recallAt3: calculateRecallAtK(results, groundTruth, 3),
    recallAt5: calculateRecallAtK(results, groundTruth, 5),
    mrr: calculateMRR(results, groundTruth),
    ndcg: calculateNDCG(results, groundTruth, k),
    positionMetrics: calculatePositionMetrics(results, groundTruth)
  };
};

/**
 * Flag a relevance issue with a result
 * @param {Object} result - Result object
 * @param {string} reason - Reason for flagging
 * @returns {Object} Flag object
 */
const flagRelevanceIssue = (result, reason) => {
  return {
    practitionerId: result.document?.practitioner_id || result.document?.id || result.practitioner_id || result.id,
    practitionerName: result.document?.name || result.name,
    flagged: true,
    reason: reason || 'No reason provided',
    timestamp: new Date().toISOString()
  };
};

/**
 * Record booking proxy (which doctor tester would choose)
 * @param {Object} result - Selected result
 * @param {string} variant - Variant name
 * @returns {Object} Booking proxy record
 */
const recordBookingProxy = (result, variant) => {
  return {
    practitionerId: result.document?.practitioner_id || result.document?.id || result.practitioner_id || result.id,
    practitionerName: result.document?.name || result.name,
    variant: variant,
    timestamp: new Date().toISOString()
  };
};

/**
 * Export test results to JSON
 */
const exportTestResultsJSON = (testCase, variants, measurements) => {
  const exportData = {
    testCase: {
      id: testCase.id,
      name: testCase.name,
      conversation: testCase.conversation,
      userQuery: testCase.userQuery,
      timestamp: new Date().toISOString()
    },
    variants: variants.map(variant => ({
      name: variant.name,
      enrichedQuery: variant.enrichedQuery,
      processingTime: variant.processingTime,
      top3Results: variant.top3Results.map((result, idx) => ({
        rank: idx + 1,
        practitionerId: result.document?.practitioner_id || result.document?.id,
        practitionerName: result.document?.name,
        specialty: result.document?.specialty,
        bm25Score: result.score,
        relevanceFlagged: measurements.relevanceFlags?.[variant.name]?.[idx] || null,
        bookingProxy: measurements.bookingProxy?.[variant.name] === idx
      })),
      precisionAt3: measurements.precisionAt3?.[variant.name] || null
    })),
    measurements: {
      precisionAt3: measurements.precisionAt3,
      relevanceFlags: measurements.relevanceFlags,
      bookingProxy: measurements.bookingProxy,
      groundTruth: testCase.groundTruth || null
    }
  };
  
  return JSON.stringify(exportData, null, 2);
};

/**
 * Export test results to CSV
 */
const exportTestResultsCSV = (testCase, variants, measurements) => {
  const rows = [];
  
  // Header
  rows.push([
    'Variant',
    'Rank',
    'Practitioner ID',
    'Practitioner Name',
    'Specialty',
    'BM25 Score',
    'Relevance Flagged',
    'Flag Reason',
    'Booking Proxy',
    'Precision@3'
  ].join(','));
  
  // Data rows
  variants.forEach(variant => {
    const precision = measurements.precisionAt3?.[variant.name] || '';
    
    variant.top3Results.forEach((result, idx) => {
      const flag = measurements.relevanceFlags?.[variant.name]?.[idx];
      const isBookingProxy = measurements.bookingProxy?.[variant.name] === idx;
      
      rows.push([
        variant.name,
        idx + 1,
        result.document?.practitioner_id || result.document?.id || '',
        `"${(result.document?.name || '').replace(/"/g, '""')}"`,
        `"${(result.document?.specialty || '').replace(/"/g, '""')}"`,
        result.score?.toFixed(4) || '',
        flag ? 'Yes' : 'No',
        flag ? `"${flag.reason.replace(/"/g, '""')}"` : '',
        isBookingProxy ? 'Yes' : 'No',
        idx === 0 ? precision : '' // Only show precision in first row per variant
      ].join(','));
    });
  });
  
  return rows.join('\n');
};

/**
 * Aggregate measurements across multiple test cases
 */
const aggregateMeasurements = (allMeasurements) => {
  const aggregated = {
    precisionAt3: {},
    bookingProxyCount: {},
    relevanceFlagCount: {},
    averagePrecisionAt3: {}
  };
  
  // Count booking proxies per variant
  allMeasurements.forEach(measurement => {
    if (measurement.bookingProxy) {
      Object.entries(measurement.bookingProxy).forEach(([variant, rank]) => {
        aggregated.bookingProxyCount[variant] = (aggregated.bookingProxyCount[variant] || 0) + 1;
      });
    }
  });
  
  // Calculate average Precision@3 per variant
  const precisionScores = {};
  allMeasurements.forEach(measurement => {
    if (measurement.precisionAt3) {
      Object.entries(measurement.precisionAt3).forEach(([variant, score]) => {
        if (score !== null) {
          if (!precisionScores[variant]) {
            precisionScores[variant] = [];
          }
          precisionScores[variant].push(score);
        }
      });
    }
  });
  
  Object.entries(precisionScores).forEach(([variant, scores]) => {
    aggregated.averagePrecisionAt3[variant] = scores.reduce((a, b) => a + b, 0) / scores.length;
  });
  
  // Count relevance flags per variant
  allMeasurements.forEach(measurement => {
    if (measurement.relevanceFlags) {
      Object.entries(measurement.relevanceFlags).forEach(([variant, flags]) => {
        const flagCount = Object.values(flags).filter(f => f && f.flagged).length;
        aggregated.relevanceFlagCount[variant] = (aggregated.relevanceFlagCount[variant] || 0) + flagCount;
      });
    }
  });
  
  return aggregated;
};

module.exports = {
  calculatePrecisionAtK,
  calculateRecallAtK,
  calculateMRR,
  calculateNDCG,
  calculatePositionMetrics,
  evaluateAgainstGroundTruth,
  getPractitionerId,
  flagRelevanceIssue,
  recordBookingProxy,
  exportTestResultsJSON,
  exportTestResultsCSV,
  aggregateMeasurements
};
