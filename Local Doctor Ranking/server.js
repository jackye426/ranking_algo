/**
 * Local Doctor Ranking Server
 * 
 * A local server that loads merged doctor data once and provides ranking API endpoints.
 * Optimized for handling large datasets efficiently.
 */

require('dotenv').config({ path: './parallel-ranking-package/.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import V2 ranking package
const { rankPractitioners, rankPractitionersProgressive } = require('./ranking-v2-package');

// Import V5 session context
const { getSessionContextV5 } = require('./parallel-ranking-package/algorithm/session-context-variants');
const { getBM25Shortlist } = require('./parallel-ranking-package/testing/services/local-bm25-service');
const { filterBySpecialty } = require('./specialty-filter');
const { filterByLocation } = require('./location-filter');

// Import production BM25 service (CommonJS version for Node.js)
let productionBM25;
try {
  productionBM25 = require('./bm25Service.cjs');
  console.log('[Server] ✅ Loaded production BM25 service (CommonJS)');
} catch (error) {
  console.error('[Server] ⚠️ Failed to load production BM25 service:', error.message);
  console.error('[Server] ⚠️ Production BM25 features will not be available');
  productionBM25 = null;
}

// Import LLM evaluation module
const { evaluateFit } = require('./ranking-v2-package/evaluate-fit');

// Import transformation function and insurance canonicalization
const { loadMergedData, getCanonicalInsuranceName } = require('./apply-ranking');

// Import specialty filtering (for stats endpoint)
const { getAllSpecialties, getSpecialtyStats } = require('./specialty-filter');

// Import recommendation tracker
const tracker = require('./scripts/recommendation-tracker');

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// Middleware (API routes registered below - static served after so /api/* is never shadowed)
app.use(cors());
app.use(express.json());

// Log every /api request (helps debug "endpoint not found")
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log('[Server] Incoming', req.method, req.path);
  }
  next();
});

// Normalize /api paths: strip trailing slash so /api/rank-production/ matches
app.use((req, res, next) => {
  if (req.path.startsWith('/api') && req.path.length > 4 && req.path.endsWith('/')) {
    req.url = req.path.slice(0, -1) + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
  }
  next();
});

// Global state - loaded once at startup
let practitioners = null;
let dataStats = null;
let loadTime = null;

/**
 * Load merged doctor data (supports async when file is streamed)
 */
const loadData = () => {
  const startTime = Date.now();
  const dataFilePath = path.join(__dirname, 'integrated_practitioners_with_isrctn_latest.json');
  const absolutePath = path.resolve(dataFilePath);
  console.log('[Server] Loading practitioner data from:', absolutePath);
  if (!fs.existsSync(dataFilePath)) {
    console.error('[Server] ❌ Failed to load data:', 
      `Integrated data file not found at ${absolutePath}. Ensure integrated_practitioners_with_isrctn_latest.json is in the server directory.`
    );
    return Promise.resolve(false);
  }
  const result = loadMergedData(dataFilePath);
  const apply = (prac) => {
    practitioners = prac;
    console.log('[Server] Loaded', practitioners.length, 'practitioners from integrated_practitioners_with_isrctn_latest.json');
    dataStats = {
      total: practitioners.length,
      withGMC: practitioners.filter(p => p.gmc_number).length,
      withSpecialty: practitioners.filter(p => p.specialty).length,
      withSubspecialties: practitioners.filter(p => p.subspecialties && p.subspecialties.length > 0).length,
      withProcedures: practitioners.filter(p => p.procedure_groups && p.procedure_groups.length > 0).length,
      uniqueSpecialties: [...new Set(practitioners.map(p => p.specialty).filter(Boolean))].length,
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
    loadTime = Date.now() - startTime;
    console.log('[Server] ✅ Data loaded successfully');
    console.log(`[Server] Total practitioners: ${dataStats.total}`);
    console.log(`[Server] Load time: ${loadTime}ms`);
    console.log(`[Server] Unique specialties: ${dataStats.uniqueSpecialties}`);
    return true;
  };
  return Promise.resolve(result).then(apply).catch((error) => {
    console.error('[Server] ❌ Failed to load data:', error.message);
    console.error(error.stack);
    return false;
  });
};

// Initialize on startup (loadData may be async for large files)
loadData().then((success) => {
  if (!success) {
    console.error('[Server] CRITICAL: Failed to load data. Server will not function correctly.');
    process.exit(1);
  }
  startServer();
}).catch((err) => {
  console.error('[Server] CRITICAL: Load error', err);
  process.exit(1);
});

function startServer() {
  // Start server (data already loaded)
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🏥 Local Doctor Ranking Server');
    console.log('='.repeat(60));
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`📊 Total practitioners: ${dataStats.total}`);
    console.log(`🔍 API endpoint: http://localhost:${PORT}/api/rank`);
    console.log(`📦 Production BM25: http://localhost:${PORT}/api/rank-production (POST)`);
    console.log(`📈 Stats endpoint: http://localhost:${PORT}/api/stats`);
    console.log('='.repeat(60) + '\n');
    console.log('[Server] ✅ Server started successfully - logging is working!');
    console.log('[Server] Ready to receive requests...');
  });
}

/** Format fees object for display (e.g. { new_appointment: 250, follow_up: 175, currency: 'GBP' }) */
function formatFees(fees) {
  if (!fees || typeof fees !== 'object') return null;
  const parts = [];
  const sym = (fees.currency === 'GBP') ? '£' : (fees.currency || '');
  if (fees.new_appointment != null) parts.push(`${sym}${fees.new_appointment} (new)`);
  if (fees.follow_up != null) parts.push(`${sym}${fees.follow_up} (follow-up)`);
  return parts.length ? parts.join(', ') : null;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dataLoaded: practitioners !== null,
    totalPractitioners: practitioners?.length || 0,
    loadTime: loadTime,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/stats
 * Returns data statistics
 */
app.get('/api/stats', (req, res) => {
  if (!practitioners) {
    return res.status(500).json({ error: 'Data not loaded' });
  }
  
  const specialtyStats = getSpecialtyStats(practitioners);
  const allSpecialties = getAllSpecialties(practitioners);
  
  res.json({
    success: true,
    stats: {
      ...dataStats,
      specialtyDistribution: specialtyStats.slice(0, 20) // Top 20 specialties
    },
    allSpecialties: allSpecialties,
    loadTime: loadTime
  });
});

/**
 * POST /api/rank
 * Rank doctors based on query
 * 
 * Body:
 * {
 *   "query": "I need SVT ablation",
 *   "messages": [], // optional conversation history
 *   "location": null, // optional location filter
 *   "specialty": null, // optional manual specialty filter
 *   "patient_age_group": null, // optional: "Adult", "Paediatric", "Child", etc.
 *   "gender": null, // optional: "Male", "Female"
 *   "languages": null, // optional: ["English", "Spanish"], or single string
 *   "shortlistSize": 10, // optional, default 10
 *   "rankingConfig": null, // optional: path to ranking weights JSON file
 *   "evaluateFit": false, // optional: if true, LLM evaluates fit quality (excellent/good/ill-fit)
 *   "variant": "v2", // optional: "v2", "v5", or "v6" (default: "v2")
 *   // V6 specific options:
 *   "maxIterations": 5, // optional, default 5
 *   "maxProfilesReviewed": 30, // optional, default 30
 *   "batchSize": 12, // optional, default 12
 *   "fetchStrategy": "stage-b", // optional: "stage-b" or "stage-a" (default: "stage-b")
 *   "targetTopK": 3, // optional, default 3
 *   "model": "gpt-5.1" // optional LLM model override
 * }
 */
app.post('/api/rank', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      messages = [],
      location = null,
      shortlistSize = 10,
      specialty = null,
      patient_age_group = null,
      gender = null,
      languages = null,
      rankingConfig = null,
      evaluateFit: shouldEvaluateFit = false,
      variant = 'v2',
      locationFilter = null,
      lexiconsDir = null,
      model = null,
      maxIterations = 5,
      maxProfilesReviewed = 30,
      batchSize = 12,
      fetchStrategy = 'stage-b',
      targetTopK = 3,
      insurancePreference: insurancePreferenceRaw = null,
      nhsMode = false,
      mode = null,
    } = body;

    // Robust query extraction (support body.query string or body.query.text or body.text)
    let query = body.query;
    if (query != null && typeof query === 'object' && typeof query.text === 'string') {
      query = query.text;
    } else if (typeof query !== 'string') {
      query = typeof body.text === 'string' ? body.text : '';
    }
    query = (query && typeof query === 'string') ? query.trim() : '';

    if (!query && messages && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last && typeof last.content === 'string') query = last.content.trim();
    }

    if (!query) {
      return res.status(400).json({
        error: 'Query is required',
        message: 'Please provide a non-empty query string',
      });
    }

    // Infer specialty from query when not explicitly provided (so physio/dietitian queries return results)
    let manualSpecialty = (specialty != null && String(specialty).trim() !== '')
      ? String(specialty).trim()
      : null;
    if (!manualSpecialty) {
      const q = query.toLowerCase();
      if (/\bphysiotherapist\b|\bphysiotherapy\b|\bpelvic\s*physio\b|\bphysio\b.*pelvic|pelvic\s+pain\s+physio|seeking\s+a\s+pelvic\s+pain\s+physiotherapist/i.test(q)) {
        manualSpecialty = 'Physiotherapy';
        console.log('[Server] Inferred specialty from query: Physiotherapy');
      } else if (/\bdietitian\b|\bdietetics\b|\bnutrition\s*specialist\b/i.test(q)) {
        manualSpecialty = 'Dietitian';
        console.log('[Server] Inferred specialty from query: Dietitian');
      }
    }

    // Normalize languages (accept array or single string)
    const languagesArray = languages
      ? (Array.isArray(languages) ? languages : [languages])
      : null;
    
    if (!practitioners) {
      return res.status(500).json({ error: 'Data not loaded' });
    }

    const isNhsMode = !!(nhsMode || mode === 'nhs');
    const canonicalInsurance = (insurancePreferenceRaw && String(insurancePreferenceRaw).trim())
      ? getCanonicalInsuranceName(insurancePreferenceRaw)
      : null;
    let practitionersForRanking = practitioners;
    if (isNhsMode) {
      practitionersForRanking = practitioners.filter(
        (p) =>
          (p.nhs_base && String(p.nhs_base).trim()) ||
          (p.nhs_posts && p.nhs_posts.length > 0)
      );
      console.log(`[Server] NHS mode: filtered to ${practitionersForRanking.length} NHS-affiliated practitioners`);
    }
    
    const requestStartTime = Date.now();
    
    // Build filter summary for logging
    const activeFilters = [];
    if (manualSpecialty) activeFilters.push(`specialty:${manualSpecialty}`);
    if (isNhsMode) activeFilters.push('nhsMode:true');
    if (canonicalInsurance) activeFilters.push(`insurance:${canonicalInsurance}`);
    if (locationFilter) {
      if (locationFilter.city) activeFilters.push(`city:${locationFilter.city}`);
      if (locationFilter.postcode) activeFilters.push(`postcode:${locationFilter.postcode}`);
      if (locationFilter.radiusCenter) activeFilters.push(`radius:${locationFilter.radiusMiles || 10}mi from ${locationFilter.radiusCenter}`);
    }
    if (patient_age_group) activeFilters.push(`age:${patient_age_group}`);
    if (gender) activeFilters.push(`gender:${gender}`);
    if (languagesArray) activeFilters.push(`languages:${languagesArray.join(',')}`);
    const filterSummary = activeFilters.length > 0 ? activeFilters.join(' | ') : 'NONE';
    
    console.log(`[Server] ${variant.toUpperCase()} Ranking request: "${query}" | Filters: ${filterSummary}`);
    
    let rankingResult;
    
    if (variant === 'v6') {
      // V6: Progressive ranking with iterative refinement
      try {
        console.log(`[Server] V6: Starting progressive ranking with maxIterations=${maxIterations}, maxProfilesReviewed=${maxProfilesReviewed}`);
        rankingResult = await rankPractitionersProgressive(practitionersForRanking, query, {
          messages,
          location,
          shortlistSize,
          manualSpecialty,
          locationFilter,
          patient_age_group,
          gender,
          languages: languagesArray,
          insurancePreference: canonicalInsurance,
          rankingConfig: rankingConfig || 'best-stage-a-recall-weights-desc-tuned.json',
          maxIterations,
          maxProfilesReviewed,
          batchSize,
          fetchStrategy,
          targetTopK,
          model: model || 'gpt-5.1',
        });
        console.log(`[Server] V6: Completed - iterations=${rankingResult.metadata.iterations}, terminationReason=${rankingResult.metadata.terminationReason}`);
      } catch (v6Error) {
        console.error('[Server] V6 Error:', v6Error);
        console.error('[Server] V6 Error Stack:', v6Error.stack);
        throw new Error(`V6 Progressive Ranking failed: ${v6Error.message}`);
      }
    } else if (variant === 'v5') {
      // V5: Use ideal profile generation
      const lexiconsPath = lexiconsDir || path.join(__dirname, 'lexicons');
      const sessionContext = await getSessionContextV5(
        query,
        messages.length > 0 ? messages : [{ role: 'user', content: query }],
        location,
        {
          specialty: manualSpecialty || null,
          lexiconsDir: fs.existsSync(lexiconsPath) ? lexiconsPath : null,
          model: model || 'gpt-5.1'
        }
      );
      
      // Filter by manual specialty before ranking (if provided); start from NHS-filtered list when in NHS mode
      let filteredPractitioners = practitionersForRanking;
      const initialCount = practitionersForRanking.length;
      if (manualSpecialty && String(manualSpecialty).trim()) {
        filteredPractitioners = filterBySpecialty(practitionersForRanking, { manualSpecialty: String(manualSpecialty).trim() });
      }

      // Apply location filter before ranking (if provided)
      if (locationFilter && typeof locationFilter === 'object') {
        console.log(`[Server] /api/rank: Applying location filter:`, JSON.stringify(locationFilter));
        const beforeCount = filteredPractitioners.length;
        filteredPractitioners = filterByLocation(filteredPractitioners, locationFilter);
        const afterCount = filteredPractitioners.length;
        console.log(`[Server] /api/rank: Location filter result: ${beforeCount} -> ${afterCount} practitioners`);
        if (afterCount === 0 && beforeCount > 0) {
          console.warn(`[Server] /api/rank: ⚠️ WARNING: Location filter filtered out ALL practitioners!`);
        }
      }

      // Load ranking config
      let config = rankingConfig;
      if (typeof rankingConfig === 'string') {
        const configPath = path.isAbsolute(rankingConfig) 
          ? rankingConfig 
          : path.join(__dirname, 'optimization', rankingConfig);
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
          config = null;
        }
      }
      
      // Build filters for V5 (include insurance for BM25 filter)
      const filters = {
        q_patient: sessionContext.q_patient,
        intent_terms: sessionContext.intent_terms || [],
        anchor_phrases: sessionContext.anchor_phrases || [],
        intentData: sessionContext.intentData || null,
        idealProfile: sessionContext.idealProfile,
        variantName: 'v5',
        patient_age_group: patient_age_group || null,
        languages: languagesArray,
        gender: gender || null,
        insurancePreference: canonicalInsurance || null,
        ...(config && { rankingConfig: config }),
      };
      
      // Run BM25 ranking with V5 profile matching
      const bm25Result = getBM25Shortlist(filteredPractitioners, filters, shortlistSize);
      
      // Format results
      const results = (bm25Result.results || []).map((r, index) => ({
        document: r.document,
        score: parseFloat(r.score) || 0,
        rank: index + 1,
        bm25Score: parseFloat(r.bm25Score) || 0,
        rescoringInfo: r.rescoringInfo || null,
      }));
      
      rankingResult = {
        results,
        sessionContext: {
          q_patient: sessionContext.q_patient,
          q_patient_original: sessionContext.q_patient_original,
          enrichedQuery: sessionContext.enrichedQuery,
          intent_terms: sessionContext.intent_terms,
          anchor_phrases: sessionContext.anchor_phrases,
          safe_lane_terms: sessionContext.safe_lane_terms,
          intentData: sessionContext.intentData,
          idealProfile: sessionContext.idealProfile,
          queryClarity: sessionContext.intentData?.isQueryAmbiguous ? 'ambiguous' : 'clear',
        },
        metadata: {
          totalPractitioners: initialCount,
          filteredPractitioners: filteredPractitioners.length,
          stageATopN: config?.stage_a_top_n || 150,
          shortlistSize: results.length,
          query: query,
          filtersApplied: {
            manualSpecialty: manualSpecialty || null,
            locationFilter: locationFilter || null,
            patient_age_group: patient_age_group || null,
            languages: languages || null,
            gender: gender || null,
          },
        },
      };
    } else {
      // V2: Use existing ranking package
      console.log(`[Server] /api/rank: Using V2 ranking with locationFilter:`, JSON.stringify(locationFilter));
      rankingResult = await rankPractitioners(practitionersForRanking, query, {
        messages,
        location,
        shortlistSize,
        manualSpecialty,
        locationFilter,
        patient_age_group,
        gender,
        languages: languagesArray,
        insurancePreference: canonicalInsurance,
        rankingConfig: rankingConfig || 'best-stage-a-recall-weights-desc-tuned.json',
      });
      console.log(`[Server] /api/rank: V2 ranking completed, results: ${rankingResult.results?.length || 0}`);
    }
    
    const rankingTime = Date.now() - requestStartTime;
    
    // Format results for response
    let results = rankingResult.results.map((result) => {
      const doc = result.document;
      return {
        rank: result.rank,
        id: doc.id,
        name: doc.name,
        title: doc.title,
        specialty: doc.specialty,
        subspecialties: doc.subspecialties || [],
        score: result.score,
        bm25Score: result.bm25Score,
        rescoringScore: result.rescoringInfo ? result.score - result.bm25Score : null,
        rescoringInfo: result.rescoringInfo,
        gmc_number: doc.gmc_number,
        clinical_expertise: doc.clinical_expertise ? doc.clinical_expertise.substring(0, 200) + '...' : null,
        clinical_expertise_full: doc.clinical_expertise || null,
        about: doc.about || null,
        procedures: doc.procedure_groups?.map(pg => typeof pg === 'object' ? pg.procedure_group_name : pg) || doc._originalRecord?.procedures || [],
        conditions: doc._originalRecord?.conditions || [],
        locations: doc._originalRecord?.locations || [],
        profile_url: (() => {
          // Handle profile_urls as object or JSON string
          let profileUrlsObj = null;
          if (doc._originalRecord?.profile_urls) {
            if (typeof doc._originalRecord.profile_urls === 'string') {
              try {
                profileUrlsObj = JSON.parse(doc._originalRecord.profile_urls);
              } catch (e) {
                // If parsing fails, skip
              }
            } else if (typeof doc._originalRecord.profile_urls === 'object') {
              profileUrlsObj = doc._originalRecord.profile_urls;
            }
          }
          
          return doc.profile_url 
            || doc._originalRecord?.profile_url 
            || (profileUrlsObj && (profileUrlsObj.cromwell || profileUrlsObj.hca || profileUrlsObj.bupa || profileUrlsObj.spire))
            || (profileUrlsObj && Object.values(profileUrlsObj).find(v => v && v.trim() && v !== 'null'))
            || (doc._originalRecord?.urls && Array.isArray(doc._originalRecord.urls) && doc._originalRecord.urls.length > 0 ? doc._originalRecord.urls[0] : null)
            || null;
        })(),
        pricing: doc._originalRecord?.fees ? formatFees(doc._originalRecord.fees) : null,
        // Display-only: Reddit, ISRCTN, research, PHIN, NHS, procedures (from transform)
        reddit_patient_notes: doc.reddit_patient_notes ?? doc._originalRecord?.reddit_patient_notes ?? null,
        reddit_recommendation_level: doc.reddit_recommendation_level ?? doc._originalRecord?.reddit_recommendation_level ?? null,
        sources: doc.sources ?? [],
        isrctn_trials: doc.isrctn_trials ?? null,
        has_isrctn_trials: doc.has_isrctn_trials ?? !!(doc.isrctn_trials && doc.isrctn_trials.length > 0),
        research_interests: doc.research_interests ?? null,
        phin_patient_feedback: doc.phin_patient_feedback ?? doc._originalRecord?.phin_data?.patient_feedback ?? null,
        phin_patient_satisfaction: doc.phin_patient_satisfaction ?? doc._originalRecord?.patient_satisfaction_phin ?? null,
        nhs_base: doc.nhs_base ?? doc._originalRecord?.nhs_base ?? null,
        nhs_posts: doc.nhs_posts ?? doc._originalRecord?.nhs_posts ?? null,
        procedure_count: (doc.procedure_volumes_display ? doc.procedure_volumes_display.length : null) ?? doc.procedure_count ?? 0,
        procedure_volumes: doc.procedure_volumes_display ?? [],
        // V6 specific fields
        fit_category: result.fit_category || null,
        evaluation_reason: result.evaluation_reason || null,
        iteration_found: result.iteration_found !== undefined ? result.iteration_found : null,
      };
    });

    // Optional: Evaluate fit quality with LLM (skip for V6 as it already includes evaluation)
    let fitEvaluation = null;
    let evaluationTime = 0;
    if (shouldEvaluateFit && variant !== 'v6') {
      try {
        const evalStartTime = Date.now();
        console.log(`[Server] Evaluating fit quality for top ${Math.min(results.length, 12)} results...`);
        
        const topPractitioners = rankingResult.results.slice(0, 12).map(r => r.document);
        fitEvaluation = await evaluateFit(query, topPractitioners, {
          model: 'gpt-5.1',
          maxPractitioners: 12,
        });
        
        evaluationTime = Date.now() - evalStartTime;
        console.log(`[Server] Fit evaluation completed in ${evaluationTime}ms`);
        
        // Merge fit evaluation into results
        const fitByName = new Map();
        fitEvaluation.per_doctor.forEach((eval) => {
          fitByName.set(eval.practitioner_name, {
            fit_category: eval.fit_category,
            brief_reason: eval.brief_reason,
          });
        });
        
        results = results.map((result) => {
          const fitInfo = fitByName.get(result.name);
          return {
            ...result,
            fit_category: fitInfo?.fit_category || null,
            fit_reason: fitInfo?.brief_reason || null,
          };
        });
      } catch (error) {
        console.error('[Server] Fit evaluation failed:', error.message);
        // Continue without fit evaluation - don't fail the entire request
      }
    }
    
    // Record query and top 5 doctors for tracking (non-blocking)
    const top5 = results.slice(0, 5).map(r => ({
      id: r.id,
      name: r.name,
      rank: r.rank,
      score: r.score,
      specialty: r.specialty
    }));
    
    tracker.recordQuery(query, top5).catch(err => {
      console.error('[Tracker] Failed to record query:', err.message);
    });
    
    const totalTime = Date.now() - requestStartTime;
    
    res.json({
      success: true,
      query: query,
      nhsMode: isNhsMode || undefined,
      totalResults: rankingResult.results.length,
      results: results,
      queryInfo: {
        q_patient: rankingResult.sessionContext.q_patient,
        q_patient_original: rankingResult.sessionContext.q_patient_original || null,
        enrichedQuery: rankingResult.sessionContext.enrichedQuery,
        intent_terms: rankingResult.sessionContext.intent_terms,
        anchor_phrases: rankingResult.sessionContext.anchor_phrases,
        safe_lane_terms: rankingResult.sessionContext.safe_lane_terms,
        goal: rankingResult.sessionContext.intentData?.goal,
        specificity: rankingResult.sessionContext.intentData?.specificity,
        confidence: rankingResult.sessionContext.intentData?.confidence,
        isQueryAmbiguous: rankingResult.sessionContext.intentData?.isQueryAmbiguous,
        queryClarity: rankingResult.sessionContext.queryClarity,
        idealProfile: variant === 'v5' ? rankingResult.sessionContext.idealProfile : null,
        variant: variant,
        filteredCount: rankingResult.metadata.filteredPractitioners,
        totalCount: rankingResult.metadata.totalPractitioners,
        manualSpecialtyFilter: manualSpecialty,
        specialtyFilterApplied: manualSpecialty !== null,
        locationFilter: locationFilter || null,
        locationFilterApplied: locationFilter !== null,
        filtersApplied: {
          ...(rankingResult.metadata.filtersApplied ?? {}),
          manualSpecialty: manualSpecialty || null,
          locationFilter: locationFilter || null,
          patient_age_group: patient_age_group || null,
          languages: languagesArray || null,
          gender: gender || null,
          insurancePreference: canonicalInsurance || null,
          nhsMode: isNhsMode || null,
        },
        // V6 specific metadata
        ...(variant === 'v6' ? {
          iterations: rankingResult.metadata.iterations,
          profilesEvaluated: rankingResult.metadata.profilesEvaluated,
          profilesFetched: rankingResult.metadata.profilesFetched,
          terminationReason: rankingResult.metadata.terminationReason,
          qualityBreakdown: rankingResult.metadata.qualityBreakdown,
          top3AllExcellent: results.slice(0, 3).every(r => r.fit_category === 'excellent'),
        } : {}),
      },
      fitEvaluation: variant === 'v6' ? {
        evaluated: true,
        note: 'V6 includes built-in LLM evaluation',
        qualityBreakdown: rankingResult.metadata.qualityBreakdown,
      } : (fitEvaluation ? {
        overall_reason: fitEvaluation.overall_reason,
        evaluated: true,
      } : null),
      processingTime: {
        ranking: rankingTime,
        evaluation: evaluationTime,
        total: totalTime
      }
    });
    
  } catch (error) {
    console.error('[Server] Error in /api/rank:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/search
 * Simple search endpoint (query parameter)
 */
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    const shortlistSize = parseInt(req.query.limit) || 10;
    const specialty = req.query.specialty || null;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    if (!practitioners) {
      return res.status(500).json({ error: 'Data not loaded' });
    }
    
    // Use the same ranking logic as POST /api/rank
    const sessionContext = await getSessionContextParallel(query, [], null);
    
    // Filter by manual specialty before ranking (if provided)
    let filteredPractitioners = practitioners;
    if (specialty) {
      filteredPractitioners = filterBySpecialty(
        practitioners,
        { manualSpecialty: specialty }
      );
    }
    
    const filters = {
      q_patient: sessionContext.q_patient,
      intent_terms: sessionContext.intent_terms,
      anchor_phrases: sessionContext.anchor_phrases,
      intentData: sessionContext.intentData,
      variantName: 'parallel'
    };
    
    const rankingResult = getBM25Shortlist(filteredPractitioners, filters, shortlistSize);
    
    const results = rankingResult.results.map((result) => {
      const doc = result.document;
      return {
        rank: result.rank,
        id: doc.id,
        name: doc.name,
        title: doc.title,
        specialty: doc.specialty,
        score: result.score
      };
    });
    
    res.json({
      success: true,
      query: query,
      results: results
    });
    
  } catch (error) {
    console.error('[Server] Error in /api/search:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/tracker/stats
 * Get recommendation tracker statistics
 */
app.get('/api/tracker/stats', (req, res) => {
  try {
    const stats = tracker.getTrackerStats();
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('[Server] Error in /api/tracker/stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/rank-production - clarify that POST is required
 */
app.get('/api/rank-production', (req, res) => {
  res.set('Allow', 'POST');
  res.status(405).json({
    error: 'Method not allowed',
    message: 'Use POST with JSON body { query, shortlistSize, ... }',
    endpoint: '/api/rank-production'
  });
});

/**
 * POST /api/rank-production (and with trailing slash)
 * Test endpoint for production BM25 service with new features
 */
const handleRankProduction = async (req, res) => {
  try {
    console.log(`[Server] ========== Production BM25 Request Received ==========`);
    console.log(`[Server] Request body keys:`, Object.keys(req.body || {}));
    
    const {
      query,
      specialty,
      location,
      shortlistSize = 10,
      insurancePreference: insurancePreferenceRaw,
      genderPreference,
      patient_age_group,
      languages,
      locationFilter = null,
      // Production BM25 options
      useEquivalenceNormalization = false,
      separateQueryFromFilters = false,
      useTwoStageRetrieval = false,
      // Two-stage filters
      q_patient,
      safe_lane_terms = [],
      intent_terms = [],
      anchor_phrases = [],
      intentData = null,
      rankingConfig = null
    } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!practitioners) {
      return res.status(500).json({ error: 'Data not loaded' });
    }

    // Filter by specialty if provided
    const practitionersBeforeFilters = practitioners.length;
    let filteredPractitioners = practitioners;
    if (specialty) {
      filteredPractitioners = filterBySpecialty(practitioners, { manualSpecialty: specialty });
    }

    // Apply location filter if provided
    if (locationFilter && typeof locationFilter === 'object') {
      const beforeCount = filteredPractitioners.length;
      filteredPractitioners = filterByLocation(filteredPractitioners, locationFilter);
      const afterCount = filteredPractitioners.length;
      console.log(`[Server] Location filter applied: ${beforeCount} -> ${afterCount} practitioners`);
      
      if (afterCount === 0 && beforeCount > 0) {
        console.warn(`[Server] ⚠️ WARNING: Location filter filtered out ALL practitioners!`);
        console.warn(`[Server] Location filter was:`, JSON.stringify(locationFilter));
        console.warn(`[Server] This will result in no ranking results.`);
      }
    }

    // Build filters for production BM25 service
    const filters = {
      specialty: specialty || null,
      location: location || null,
      searchQuery: query,
      q_patient: q_patient || query,
      safe_lane_terms: Array.isArray(safe_lane_terms) ? safe_lane_terms : [],
      intent_terms: Array.isArray(intent_terms) ? intent_terms : [],
      anchor_phrases: Array.isArray(anchor_phrases) ? anchor_phrases : [],
      intentData: intentData || null,
      insurancePreference: (insurancePreferenceRaw && String(insurancePreferenceRaw).trim())
        ? getCanonicalInsuranceName(insurancePreferenceRaw)
        : null,
      genderPreference: genderPreference || null,
      patient_age_group: patient_age_group || null,
      languages: Array.isArray(languages) ? languages : (languages ? [languages] : null),
      gender: genderPreference || null, // For applyFilterConditions
      rankingConfig: rankingConfig || null
    };

    // Production BM25 options
    const options = {
      useEquivalenceNormalization,
      separateQueryFromFilters,
      useTwoStageRetrieval
    };

    // Geocoded (for proximity boost) - simplified for testing
    const geocoded = location && location.match(/^[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}$/i)
      ? { searchType: 'postcode', postcode: location }
      : location
        ? { searchType: 'city', city: location }
        : null;

    if (!productionBM25) {
      return res.status(503).json({
        error: 'Production BM25 service not available',
        message: 'bm25Service.cjs could not be loaded. Check server logs.'
      });
    }

    console.log(`[Server] Production BM25 request: "${query}" | Options:`, options);
    console.log(`[Server] Filters: specialty=${specialty}, insurance=${filters.insurancePreference}, gender=${genderPreference}`);
    console.log(`[Server] LocationFilter received:`, JSON.stringify(locationFilter));
    console.log(`[Server] Practitioners before filtering: ${filteredPractitioners.length}`);

    // Call production BM25 service
    const startTime = Date.now();
    const results = productionBM25.getBM25Shortlist(
      filteredPractitioners,
      filters,
      shortlistSize,
      geocoded,
      null, // semanticOptions
      options
    );
    const duration = Date.now() - startTime;

    // Format results
    const formattedResults = results.map((r, index) => {
      const doc = r.document;
      const orig = doc?._originalRecord;
      // Handle profile_urls as object or JSON string
      let profileUrlsObj = null;
      if (orig?.profile_urls) {
        if (typeof orig.profile_urls === 'string') {
          try {
            profileUrlsObj = JSON.parse(orig.profile_urls);
          } catch (e) {
            // If parsing fails, skip
          }
        } else if (typeof orig.profile_urls === 'object') {
          profileUrlsObj = orig.profile_urls;
        }
      }
      
      const profileUrl = doc?.profile_url || orig?.profile_url
        || (profileUrlsObj && (profileUrlsObj.cromwell || profileUrlsObj.hca || profileUrlsObj.bupa || profileUrlsObj.spire))
        || (profileUrlsObj && Object.values(profileUrlsObj).find(v => v && v.trim() && v !== 'null'))
        || (orig?.urls && Array.isArray(orig.urls) && orig.urls.length > 0 ? orig.urls[0] : null);
      return {
        rank: index + 1,
        name: doc?.name || 'Unknown',
        title: doc?.title || '',
        specialty: doc?.specialty || '',
        score: parseFloat(r.score) || 0,
        bm25Score: r.bm25Score ? parseFloat(r.bm25Score) : null,
        qualityBoost: r.qualityBoost ? parseFloat(r.qualityBoost) : null,
        exactMatchBonus: r.exactMatchBonus ? parseFloat(r.exactMatchBonus) : null,
        proximityBoost: r.proximityBoost && r.proximityBoost !== 1.0 ? parseFloat(r.proximityBoost) : null,
        rescoringInfo: r.rescoringInfo || null,
        profile_url: profileUrl || null,
        locations: orig?.locations || [],
        clinical_expertise_full: doc?.clinical_expertise || null,
        about: doc?.about || null,
        pricing: orig?.fees ? formatFees(orig.fees) : null,
        conditions: orig?.conditions || [],
        procedures: doc?.procedure_groups?.map(pg => typeof pg === 'object' ? pg.procedure_group_name : pg) || orig?.procedures || [],
        subspecialties: doc?.subspecialties || (orig?.specialties || []).filter(s => s && String(s).trim() !== (doc?.specialty || '')),
        // Display-only: Reddit, ISRCTN, research, PHIN, NHS, procedures
        reddit_patient_notes: doc?.reddit_patient_notes ?? orig?.reddit_patient_notes ?? null,
        reddit_recommendation_level: doc?.reddit_recommendation_level ?? orig?.reddit_recommendation_level ?? null,
        sources: doc?.sources ?? [],
        isrctn_trials: doc?.isrctn_trials ?? null,
        has_isrctn_trials: doc?.has_isrctn_trials ?? !!(doc?.isrctn_trials && doc.isrctn_trials.length > 0),
        research_interests: doc?.research_interests ?? null,
        phin_patient_feedback: doc?.phin_patient_feedback ?? orig?.phin_data?.patient_feedback ?? null,
        phin_patient_satisfaction: doc?.phin_patient_satisfaction ?? orig?.patient_satisfaction_phin ?? null,
        nhs_base: doc?.nhs_base ?? orig?.nhs_base ?? null,
        nhs_posts: doc?.nhs_posts ?? orig?.nhs_posts ?? null,
        procedure_count: (doc?.procedure_volumes_display?.length) ?? doc?.procedure_count ?? 0,
        procedure_volumes: doc?.procedure_volumes_display ?? [],
      };
    });

    res.json({
      success: true,
      query,
      results: formattedResults,
      metadata: {
        practitionersBeforeFilters,
        totalPractitioners: filteredPractitioners.length,
        shortlistSize: formattedResults.length,
        duration: `${duration}ms`,
        options,
        filters: {
          specialty,
          location,
          locationFilter,
          insurancePreference: filters.insurancePreference,
          genderPreference,
          patient_age_group,
          languages
        },
        twoStageUsed: useTwoStageRetrieval && (intent_terms.length > 0 || anchor_phrases.length > 0),
        equivalenceNormalizationUsed: useEquivalenceNormalization,
        separateQueryUsed: separateQueryFromFilters
      }
    });

  } catch (error) {
    console.error('[Server] Production BM25 Error:', error);
    console.error('[Server] Error Stack:', error.stack);
    res.status(500).json({
      error: 'Production BM25 ranking failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
app.post('/api/rank-production', handleRankProduction);
app.post('/api/rank-production/', handleRankProduction);

// 404 handler for API routes; also catch POST /api/rank-production if routing missed it
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const pathNorm = req.path.replace(/\/+$/, '') || '/';
  if (req.method === 'POST' && pathNorm === '/api/rank-production') {
    console.log('[Server] POST /api/rank-production (handled via fallback)');
    return handleRankProduction(req, res);
  }
  console.log('[Server] 404 API - no route for', req.method, req.path);
  return res.status(404).json({ error: 'API endpoint not found' });
});

// Static files (after API so /api/rank etc. are never served as files)
app.use(express.static(path.join(__dirname, 'public')));

// Serve UI for all other routes
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      message: 'Local Doctor Ranking Server',
      version: '1.0.0',
      endpoints: {
        'GET /api/health': 'Health check',
        'GET /api/stats': 'Data statistics',
        'POST /api/rank': 'Rank doctors by query',
        'GET /api/search?q=query': 'Simple search (GET)'
      },
      example: {
        method: 'POST',
        url: '/api/rank',
        body: {
          query: 'I need SVT ablation',
          shortlistSize: 10
        }
      }
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received, shutting down gracefully...');
  process.exit(0);
});
