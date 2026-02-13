/**
 * Production Integration Example
 * 
 * Shows how to integrate the parallel ranking algorithm with production ranking system
 * 
 * This is a conceptual example - adapt to your production codebase structure
 */

const { getSessionContextParallel } = require('../algorithm/session-context-variants');

/**
 * Production ranking function
 * Integrates parallel ranking algorithm with BM25 ranking
 */
async function productionRanking(practitioners, userQuery, messages, filters) {
  console.log('[Production Ranking] Starting...');
  
  // Step 1: Get session context using parallel algorithm
  console.log('[Production Ranking] Getting session context...');
  const sessionContext = await getSessionContextParallel(
    userQuery,
    messages,
    filters.location || null
  );
  
  console.log('[Production Ranking] Session context:', {
    q_patient: sessionContext.q_patient,
    intent_terms_count: sessionContext.intent_terms.length,
    anchor_phrases: sessionContext.anchor_phrases,
    isAmbiguous: sessionContext.intentData.isQueryAmbiguous
  });
  
  // Step 2: Stage A - BM25 Retrieval
  // Use q_patient (clean query) for BM25 retrieval
  console.log('[Production Ranking] Stage A: BM25 retrieval with q_patient...');
  
  // TODO: Replace with your production BM25 function
  // const bm25Results = await yourBM25Service.rank(
  //   practitioners,
  //   sessionContext.q_patient,  // Use clean query
  //   { ...filters },
  //   50  // Retrieve top 50 for rescoring
  // );
  
  // Mock BM25 results for example
  const bm25Results = practitioners.slice(0, 50).map((p, idx) => ({
    document: p,
    score: Math.random() * 10,
    rank: idx + 1
  }));
  
  console.log('[Production Ranking] BM25 retrieved:', bm25Results.length, 'candidates');
  
  // Step 3: Stage B - Intent-Based Rescoring
  console.log('[Production Ranking] Stage B: Intent-based rescoring...');
  
  // TODO: Replace with your production rescoring function
  // const rescoredResults = await yourRescoringService.rescore(
  //   bm25Results,
  //   {
  //     intent_terms: sessionContext.intent_terms,
  //     anchor_phrases: sessionContext.anchor_phrases,
  //     negative_terms: sessionContext.intentData.negative_terms,
  //     likely_subspecialties: sessionContext.intentData.likely_subspecialties,
  //     isQueryAmbiguous: sessionContext.intentData.isQueryAmbiguous
  //   }
  // );
  
  // Mock rescoring for example
  const rescoredResults = bm25Results.map(result => {
    const searchableText = JSON.stringify(result.document).toLowerCase();
    
    // Count intent term matches
    const intentMatches = sessionContext.intent_terms.filter(term =>
      searchableText.includes(term.toLowerCase())
    ).length;
    
    // Count anchor phrase matches
    const anchorMatches = sessionContext.anchor_phrases.filter(phrase =>
      searchableText.includes(phrase.toLowerCase())
    ).length;
    
    // Count negative term matches (if enabled)
    let negativePenalty = 0;
    if (sessionContext.intentData.negative_terms.length > 0) {
      const negativeMatches = sessionContext.intentData.negative_terms.filter(term =>
        searchableText.includes(term.toLowerCase())
      ).length;
      
      if (negativeMatches >= 4) negativePenalty = -3.0;
      else if (negativeMatches >= 2) negativePenalty = -2.0;
      else if (negativeMatches === 1) negativePenalty = -1.0;
    }
    
    // Calculate rescoring score
    const rescoringScore = (intentMatches * 0.3) + (anchorMatches * 0.5) + negativePenalty;
    
    // Final score (BM25 + rescoring)
    const finalScore = result.score + rescoringScore;
    
    return {
      ...result,
      score: Math.max(0, finalScore),
      rescoringInfo: {
        intentMatches,
        anchorMatches,
        negativeMatches: sessionContext.intentData.negative_terms.length > 0 
          ? sessionContext.intentData.negative_terms.filter(term =>
              searchableText.includes(term.toLowerCase())
            ).length
          : 0,
        rescoringScore
      }
    };
  });
  
  // Sort by final score
  rescoredResults.sort((a, b) => b.score - a.score);
  
  // Return top N
  const topN = filters.shortlistSize || 15;
  const finalResults = rescoredResults.slice(0, topN);
  
  console.log('[Production Ranking] Final results:', finalResults.length);
  console.log('[Production Ranking] Top 3:', finalResults.slice(0, 3).map(r => ({
    name: r.document.name,
    score: r.score.toFixed(4),
    intentMatches: r.rescoringInfo.intentMatches,
    anchorMatches: r.rescoringInfo.anchorMatches
  })));
  
  return finalResults;
}

/**
 * Example usage
 */
async function example() {
  // Mock practitioners data
  const practitioners = [
    { name: 'Dr A', specialty: 'Cardiology', clinical_expertise: 'arrhythmia electrophysiology' },
    { name: 'Dr B', specialty: 'Cardiology', clinical_expertise: 'coronary angiography' },
    { name: 'Dr C', specialty: 'Cardiology', clinical_expertise: 'arrhythmia ablation' },
  ];
  
  const userQuery = "I need SVT ablation";
  const messages = [
    { role: 'user', content: 'I need SVT ablation' }
  ];
  const filters = {
    specialty: 'Cardiology',
    location: null,
    shortlistSize: 15
  };
  
  const results = await productionRanking(practitioners, userQuery, messages, filters);
  
  console.log('\n=== Integration Complete ===');
  console.log('Results:', results.length);
}

// Run example
if (require.main === module) {
  example().catch(console.error);
}

module.exports = { productionRanking };
