/**
 * Local Test Server for Ranking Variant Testing
 * Loads Cromwell corpus and exposes test API endpoints
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { transformCromwellCorpus, getCorpusStats } = require('./utils/transform-cromwell-data');
const {
  getSessionContextAlgorithmic,
  getSessionContextParallel,
  getSessionContextParallelGeneralGoalSpecificity
} = require('../algorithm/session-context-variants');
const { getBM25Shortlist } = require('./services/local-bm25-service');
const { createNameToIdMapFromCromwell, resolveGroundTruthNames } = require('./utils/name-to-id-mapper');
const { evaluateAgainstGroundTruth } = require('./utils/measurements');

const app = express();
const PORT = process.env.TEST_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));

// Load Cromwell corpus
let cromwellCorpus = null;
let practitioners = null;
let nameToIdMap = null; // For ground truth resolution

const loadCorpus = () => {
  try {
    const corpusPath = path.join(__dirname, '..', 'consultant_profiles_with_gmc_20260122.json');
    console.log('[Test Server] Loading corpus from:', corpusPath);
    
    const rawData = fs.readFileSync(corpusPath, 'utf8');
    const cromwellData = JSON.parse(rawData);
    
    practitioners = transformCromwellCorpus(cromwellData);
    cromwellCorpus = {
      ...cromwellData,
      transformed: practitioners,
      stats: getCorpusStats(practitioners)
    };
    
    // Create name-to-ID mapping for ground truth resolution
    // Use transformed practitioners to ensure ID consistency
    const { createNameToIdMap } = require('./utils/name-to-id-mapper');
    nameToIdMap = createNameToIdMap(practitioners);
    
    // Also create from Cromwell profiles as fallback (for backward compatibility)
    const cromwellNameMap = createNameToIdMapFromCromwell(cromwellData.profiles);
    // Merge both maps (transformed takes precedence)
    nameToIdMap = { ...cromwellNameMap, ...nameToIdMap };
    
    console.log('[Test Server] Corpus loaded successfully');
    console.log('[Test Server] Total practitioners:', practitioners.length);
    console.log('[Test Server] Stats:', cromwellCorpus.stats);
    console.log('[Test Server] Name-to-ID map created:', Object.keys(nameToIdMap).length, 'names');
    
    return true;
  } catch (error) {
    console.error('[Test Server] Failed to load corpus:', error);
    return false;
  }
};

// Initialize on startup
if (!loadCorpus()) {
  console.error('[Test Server] CRITICAL: Failed to load corpus. Server may not work correctly.');
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /test/corpus
 * Returns corpus statistics
 */
app.get('/test/corpus', (req, res) => {
  if (!cromwellCorpus) {
    return res.status(500).json({ error: 'Corpus not loaded' });
  }
  
  res.json({
    success: true,
    stats: cromwellCorpus.stats,
    totalPractitioners: practitioners.length
  });
});

/**
 * POST /test/analyze-session-context
 * Analyzes session context using specified variant
 * Query param: variant=algorithmic|parallel
 */
app.post('/test/analyze-session-context', async (req, res) => {
  try {
    const { userQuery, messages, location } = req.body;
    const variant = req.query.variant || 'algorithmic';
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    
    let result;
    
    switch (variant) {
      case 'algorithmic':
        result = await getSessionContextAlgorithmic(userQuery || '', messages, location);
        break;
      case 'parallel':
        result = await getSessionContextParallel(userQuery || '', messages, location);
        break;
      default:
        return res.status(400).json({ error: `Unknown variant: ${variant}` });
    }
    
    res.json({
      success: true,
      variant,
      ...result
    });
  } catch (error) {
    console.error('[Test Server] Error in analyze-session-context:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /test/bm25-rank
 * Ranks practitioners using BM25
 */
app.post('/test/bm25-rank', (req, res) => {
  try {
    const { practitioners, filters, shortlistSize = 3 } = req.body;
    
    if (!practitioners || !Array.isArray(practitioners)) {
      return res.status(400).json({ error: 'practitioners array is required' });
    }
    
    const ranked = getBM25Shortlist(practitioners, filters || {}, shortlistSize);
    
    res.json({
      success: true,
      results: ranked,
      count: ranked.length
    });
  } catch (error) {
    console.error('[Test Server] Error in bm25-rank:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /test/run-all-variants
 * Runs all three variants in parallel and returns results
 */
app.post('/test/run-all-variants', async (req, res) => {
  try {
    const { userQuery, messages, location, filters } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    
    // Run all three variants in parallel (with error handling to ensure all are returned)
    const variantPromises = [
      getSessionContextAlgorithmic(userQuery || '', messages, location)
        .then(result => ({ name: 'algorithmic', ...result }))
        .catch(err => {
          console.error('[Test Server] Algorithmic variant failed:', err);
          return { name: 'algorithmic', error: err.message, q_patient: userQuery || '', safe_lane_terms: [], intent_terms: [], enrichedQuery: userQuery || '', insights: {}, intentData: null, processingTime: 0 };
        }),
      getSessionContextParallel(userQuery || '', messages, location)
        .then(result => ({ name: 'parallel', ...result }))
        .catch(err => {
          console.error('[Test Server] Parallel variant failed:', err);
          return { name: 'parallel', error: err.message, q_patient: userQuery || '', safe_lane_terms: [], intent_terms: [], enrichedQuery: userQuery || '', insights: {}, intentData: null, processingTime: 0 };
        }),
      getSessionContextParallelGeneralGoalSpecificity(userQuery || '', messages, location)
        .then(result => ({ name: 'parallel_general_goal_specificity', ...result }))
        .catch(err => {
          console.error('[Test Server] Parallel General Goal Specificity variant failed:', err);
          return { name: 'parallel_general_goal_specificity', error: err.message, q_patient: userQuery || '', safe_lane_terms: [], intent_terms: [], enrichedQuery: userQuery || '', insights: {}, intentData: null, processingTime: 0 };
        })
    ];
    
    const [algorithmic, parallel, parallelGeneral] = await Promise.all(variantPromises);
    
    // Rank practitioners for each variant
    const variants = [algorithmic, parallel, parallelGeneral];
    const rankedVariants = variants.map(variant => {
      const bm25Result = getBM25Shortlist(
        practitioners,
        { 
          ...filters,
          q_patient: variant.q_patient || variant.enrichedQuery, // Use separated q_patient
          safe_lane_terms: variant.safe_lane_terms || [],
          intent_terms: variant.intent_terms || [],
          anchor_phrases: variant.anchor_phrases || variant.intentData?.anchor_phrases || null, // Pass anchor phrases
          searchQuery: variant.enrichedQuery, // For backward compat display
          intentData: variant.intentData || null, // Pass intent data for negative term penalties and anchor phrases
          variantName: variant.name // Pass variant name to determine ranking strategy
        },
        3
      );
      
      return {
        ...variant,
        top3Results: bm25Result.results.slice(0, 3),
        top10Results: bm25Result.results.slice(0, 10), // Keep top 10 for evaluation
        queryInfo: {
          ...bm25Result.queryInfo,
          enrichedQuery: variant.enrichedQuery // Pre-BM25 query from session context (for display)
        }
      };
    });
    
    // Evaluate against ground truth if provided
    let evaluation = null;
    let groundTruthIds = null;
    if (req.body.groundTruthNames && nameToIdMap) {
      groundTruthIds = resolveGroundTruthNames(req.body.groundTruthNames, nameToIdMap);
      if (groundTruthIds && groundTruthIds.length > 0) {
        evaluation = {};
        rankedVariants.forEach(variant => {
          // Use top 10 results for evaluation (if available), otherwise top 3
          const resultsForEvaluation = variant.top10Results || variant.top3Results || [];
          evaluation[variant.name] = evaluateAgainstGroundTruth(
            resultsForEvaluation,
            groundTruthIds,
            5
          );
        });
      } else {
        console.warn('[Test Server] Ground truth names provided but could not resolve to IDs:', req.body.groundTruthNames);
      }
    }
    
    res.json({
      success: true,
      variants: rankedVariants,
      corpusSize: practitioners.length,
      evaluation: evaluation,
      groundTruthIds: groundTruthIds,
      evaluation: evaluation // Evaluation metrics if ground truth provided
    });
  } catch (error) {
    console.error('[Test Server] Error in run-all-variants:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * GET /test/benchmark-cases
 * Get all benchmark test cases
 */
app.get('/test/benchmark-cases', (req, res) => {
  try {
    const benchmarkPath = path.join(__dirname, 'data', 'benchmark-test-cases.json');
    const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
    
    // Resolve ground truth names to IDs
    const casesWithIds = benchmarkData.testCases.map(testCase => {
      let groundTruthIds = null;
      if (testCase.groundTruth && nameToIdMap) {
        groundTruthIds = resolveGroundTruthNames(testCase.groundTruth, nameToIdMap);
      }
      
      return {
        ...testCase,
        groundTruthIds: groundTruthIds
      };
    });
    
    res.json({
      success: true,
      testCases: casesWithIds
    });
  } catch (error) {
    console.error('[Test Server] Error loading benchmark cases:', error);
    res.status(500).json({
      error: 'Failed to load benchmark cases',
      details: error.message
    });
  }
});

/**
 * POST /test/evaluate-benchmark
 * Evaluate a single benchmark test case
 */
app.post('/test/evaluate-benchmark', async (req, res) => {
  try {
    const { testCaseId } = req.body;
    
    // Load benchmark test cases
    const benchmarkPath = path.join(__dirname, 'data', 'benchmark-test-cases.json');
    const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
    const testCase = benchmarkData.testCases.find(tc => tc.id === testCaseId);
    
    if (!testCase) {
      return res.status(404).json({ error: `Test case ${testCaseId} not found` });
    }
    
    // Resolve ground truth
    const groundTruthIds = nameToIdMap ? resolveGroundTruthNames(testCase.groundTruth, nameToIdMap) : null;
    
    // Run all variants
    const messages = testCase.conversation || [{ role: 'user', content: testCase.userQuery }];
    const [algorithmic, parallel, parallelGeneral] = await Promise.all([
      getSessionContextAlgorithmic(testCase.userQuery || '', messages, null)
        .then(result => ({ name: 'algorithmic', ...result })),
      getSessionContextParallel(testCase.userQuery || '', messages, null)
        .then(result => ({ name: 'parallel', ...result })),
      getSessionContextParallelGeneralGoalSpecificity(testCase.userQuery || '', messages, null)
        .then(result => ({ name: 'parallel_general_goal_specificity', ...result }))
    ]);
    
    // Rank practitioners
    const variants = [algorithmic, parallel, parallelGeneral];
    const rankedVariants = variants.map(variant => {
      const bm25Result = getBM25Shortlist(
        practitioners,
        {
          q_patient: variant.q_patient || variant.enrichedQuery,
          safe_lane_terms: variant.safe_lane_terms || [],
          intent_terms: variant.intent_terms || [],
          anchor_phrases: variant.anchor_phrases || variant.intentData?.anchor_phrases || null,
          searchQuery: variant.enrichedQuery,
          intentData: variant.intentData || null,
          variantName: variant.name // Pass variant name for rescoring logic
        },
        10 // Get top 10 for evaluation
      );
      
      return {
        ...variant,
        top3Results: bm25Result.results.slice(0, 3),
        top10Results: bm25Result.results, // For evaluation
        queryInfo: {
          ...bm25Result.queryInfo,
          enrichedQuery: variant.enrichedQuery
        }
      };
    });
    
    // Evaluate against ground truth
    let evaluation = null;
    if (groundTruthIds && groundTruthIds.length > 0) {
      evaluation = {};
      rankedVariants.forEach(variant => {
        // Debug: Log ground truth IDs and result IDs
        if (variant.name === 'algorithmic') { // Only log for one variant to avoid spam
          console.log('[Evaluation Debug] Ground truth IDs:', groundTruthIds);
          console.log('[Evaluation Debug] Result IDs (top 10):', variant.top10Results.slice(0, 10).map(r => {
            const id = r.document?.practitioner_id || r.document?.id || r.practitioner_id || r.id;
            return { name: r.document?.name, id: id };
          }));
        }
        evaluation[variant.name] = evaluateAgainstGroundTruth(
          variant.top10Results,
          groundTruthIds,
          5
        );
      });
    } else {
      console.warn('[Evaluation] No ground truth IDs resolved. Ground truth names:', testCase.groundTruth);
      console.warn('[Evaluation] Name map available:', !!nameToIdMap);
      if (nameToIdMap && testCase.groundTruth) {
        const testResolved = resolveGroundTruthNames(testCase.groundTruth, nameToIdMap);
        console.warn('[Evaluation] Test resolution:', testResolved);
      }
    }
    
    res.json({
      success: true,
      testCase: {
        id: testCase.id,
        name: testCase.name,
        userQuery: testCase.userQuery
      },
      variants: rankedVariants.map(v => ({
        ...v,
        top10Results: undefined // Don't send full top10 in response
      })),
      evaluation: evaluation,
      groundTruth: {
        names: testCase.groundTruth,
        ids: groundTruthIds
      }
    });
  } catch (error) {
    console.error('[Test Server] Error in evaluate-benchmark:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /test/batch-evaluate-benchmark
 * Evaluate all benchmark test cases
 */
app.post('/test/batch-evaluate-benchmark', async (req, res) => {
  try {
    // Load benchmark test cases
    const benchmarkPath = path.join(__dirname, 'data', 'benchmark-test-cases.json');
    const benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
    
    const results = [];
    
    // Evaluate each test case
    for (const testCase of benchmarkData.testCases) {
      const messages = testCase.conversation || [{ role: 'user', content: testCase.userQuery }];
      
      // Run all variants
      const [algorithmic, parallel, parallelGeneral] = await Promise.all([
        getSessionContextAlgorithmic(testCase.userQuery || '', messages, null)
          .then(result => ({ name: 'algorithmic', ...result })),
        getSessionContextParallel(testCase.userQuery || '', messages, null)
          .then(result => ({ name: 'parallel', ...result })),
        getSessionContextParallelGeneralGoalSpecificity(testCase.userQuery || '', messages, null)
          .then(result => ({ name: 'parallel_general_goal_specificity', ...result }))
      ]);
      
      // Rank practitioners
      const variants = [algorithmic, parallel, parallelGeneral];
      const rankedVariants = variants.map(variant => {
        const bm25Result = getBM25Shortlist(
          practitioners,
          {
            q_patient: variant.q_patient || variant.enrichedQuery,
            safe_lane_terms: variant.safe_lane_terms || [],
            intent_terms: variant.intent_terms || [],
            anchor_phrases: variant.anchor_phrases || variant.intentData?.anchor_phrases || null,
            searchQuery: variant.enrichedQuery,
            intentData: variant.intentData || null,
            variantName: variant.name // Pass variant name for rescoring logic
          },
          10 // Get top 10 for evaluation
        );
        
        return {
          ...variant,
          top3Results: bm25Result.results.slice(0, 3),
          top10Results: bm25Result.results
        };
      });
      
      // Resolve ground truth and evaluate
      const groundTruthIds = nameToIdMap ? resolveGroundTruthNames(testCase.groundTruth, nameToIdMap) : null;
      let evaluation = null;
      
      if (groundTruthIds && groundTruthIds.length > 0) {
        evaluation = {};
        rankedVariants.forEach(variant => {
          evaluation[variant.name] = evaluateAgainstGroundTruth(
            variant.top10Results,
            groundTruthIds,
            5
          );
        });
      }
      
      results.push({
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        userQuery: testCase.userQuery,
        variants: rankedVariants.map(v => ({
          name: v.name,
          top3Results: v.top3Results.map(r => ({
            name: r.document?.name,
            id: r.document?.practitioner_id || r.document?.id,
            score: r.score
          }))
        })),
        evaluation: evaluation,
        groundTruth: {
          names: testCase.groundTruth,
          ids: groundTruthIds
        }
      });
    }
    
    // Calculate summary statistics
    const summary = {
      totalTestCases: results.length,
      averagePrecisionAt3: {},
      averagePrecisionAt5: {},
      averageRecallAt5: {},
      averageMRR: {},
      averageNDCG: {}
    };
    
    ['algorithmic', 'parallel', 'parallel_general_goal_specificity'].forEach(variantName => {
      const precisions3 = results
        .map(r => r.evaluation?.[variantName]?.precisionAt3)
        .filter(v => v !== null && v !== undefined && !isNaN(v));
      const precisions5 = results
        .map(r => r.evaluation?.[variantName]?.precisionAt5)
        .filter(v => v !== null && v !== undefined && !isNaN(v));
      const recalls5 = results
        .map(r => r.evaluation?.[variantName]?.recallAt5)
        .filter(v => v !== null && v !== undefined && !isNaN(v));
      const mrrs = results
        .map(r => r.evaluation?.[variantName]?.mrr)
        .filter(v => v !== null && v !== undefined && !isNaN(v));
      const ndcgs = results
        .map(r => r.evaluation?.[variantName]?.ndcg)
        .filter(v => v !== null && v !== undefined && !isNaN(v));
      
      summary.averagePrecisionAt3[variantName] = precisions3.length > 0
        ? precisions3.reduce((a, b) => a + b, 0) / precisions3.length : null;
      summary.averagePrecisionAt5[variantName] = precisions5.length > 0
        ? precisions5.reduce((a, b) => a + b, 0) / precisions5.length : null;
      summary.averageRecallAt5[variantName] = recalls5.length > 0
        ? recalls5.reduce((a, b) => a + b, 0) / recalls5.length : null;
      summary.averageMRR[variantName] = mrrs.length > 0
        ? mrrs.reduce((a, b) => a + b, 0) / mrrs.length : null;
      summary.averageNDCG[variantName] = ndcgs.length > 0
        ? ndcgs.reduce((a, b) => a + b, 0) / ndcgs.length : null;
      
      // Debug logging
      console.log(`[Batch Evaluation] ${variantName}:`, {
        precisionAt3: summary.averagePrecisionAt3[variantName],
        precisionAt5: summary.averagePrecisionAt5[variantName],
        recallAt5: summary.averageRecallAt5[variantName],
        mrr: summary.averageMRR[variantName],
        ndcg: summary.averageNDCG[variantName],
        validTestCases: {
          p3: precisions3.length,
          p5: precisions5.length,
          r5: recalls5.length,
          mrr: mrrs.length,
          ndcg: ndcgs.length
        }
      });
    });
    
    res.json({
      success: true,
      summary: summary,
      results: results
    });
  } catch (error) {
    console.error('[Test Server] Error in batch-evaluate-benchmark:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * GET /test
 * Serve test UI
 */
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`[Test Server] Server running on http://localhost:${PORT}`);
  console.log(`[Test Server] Test UI: http://localhost:${PORT}/test`);
  console.log(`[Test Server] Corpus: ${practitioners ? practitioners.length : 0} practitioners loaded`);
});

module.exports = app;
