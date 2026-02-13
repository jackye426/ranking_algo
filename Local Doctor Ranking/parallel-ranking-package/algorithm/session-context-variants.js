/**
 * Three variant implementations for query expansion
 * 1. Algorithmic Expansion Only
 * 2. Sequential AI Expansion
 * 3. Parallel + Constrained AI Expansion
 */

const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// SHARED AI FUNCTIONS
// ============================================================================

/**
 * Strip markdown code blocks from JSON response
 */
const stripMarkdownCodeBlocks = (content) => {
  if (!content) return content;
  let stripped = content.trim();
  // Remove ```json or ``` at start
  if (stripped.startsWith('```json')) {
    stripped = stripped.replace(/^```json\s*/i, '');
  } else if (stripped.startsWith('```')) {
    stripped = stripped.replace(/^```\s*/, '');
  }
  // Remove ``` at end
  stripped = stripped.replace(/\s*```$/, '');
  return stripped.trim();
};

// System message with static instructions for general intent classification
const SYSTEM_MESSAGE_GENERAL_INTENT = `You are a medical search system that classifies queries using specialty-agnostic goal and specificity tags.

IMPORTANT: Do NOT include specialty, location, or insurance information in expansion terms. These are already filtered before ranking and should not influence the ranking algorithm.

Return ONLY a JSON object:
{
  "goal": "diagnostic_workup" | "procedure_intervention" | "ongoing_management" | "second_opinion",
  "specificity": "symptom_only" | "confirmed_diagnosis" | "named_procedure",
  "confidence": 0.0-1.0,
  "expansion_terms": ["term1", "term2", ...],
  "negative_terms": ["term1", "term2", ...],
  "anchor_phrases": ["phrase1", "phrase2", ...],
  "likely_subspecialties": [{"name": "subspecialty_name", "confidence": 0.0-1.0}, ...]
}

Classification Rules:

GOAL (pick single best):
- diagnostic_workup: Patient wants assessment, diagnosis, investigation, workup, testing
- procedure_intervention: Patient wants a specific procedure, intervention, surgery, treatment
- ongoing_management: Patient wants ongoing care, follow-up, long-term management
- second_opinion: Patient wants a second opinion, review, consultation

SPECIFICITY:
- named_procedure: Query explicitly names a procedure/intervention/test (e.g., "ablation", "stent", "angiography", "MRI", "CT scan", "endoscopy", "surgery", "biopsy", "injection", "botox", "CBT")
- confirmed_diagnosis: Query explicitly states a diagnosis (e.g., "diagnosed with ...", "I have AF", "I have endometriosis")
- symptom_only: Otherwise (symptoms, general concerns, unclear)

CONFIDENCE:
- High (>=0.75): named_procedure OR confirmed_diagnosis is explicit
- Medium (0.45-0.74): Strongly implied
- Low (<0.45): symptom_only

EXPANSION_TERMS (8-14 terms): Include terms that match how doctors are described in profiles (procedures, subspecialties, conditions).
- symptom_only: Include "assessment", "consultation", "diagnosis", "workup", "specialist", plus symptom/condition synonyms (e.g. disease, disorders, problems, cancer, GI, gynaecology where relevant)
- confirmed_diagnosis: Include diagnosis synonyms + "management", "treatment", "follow-up", and condition terms (e.g. cancer, disease, disorders) that appear in practitioner profiles
- named_procedure: Include procedure names and synonyms (e.g. laparoscopic, key-hole, excision, repair, hysteroscopy, ablation, surgery) plus "clinic", "specialist", "intervention" as appropriate. Include both the exact procedure name and common variants (e.g. "laparoscopic (key-hole) surgery" → laparoscopic, key-hole, surgery)

NEGATIVE_TERMS (0-6 terms):
- MUST be [] UNLESS specificity = named_procedure AND confidence >= 0.75
- If allowed, 3-6 terms representing the WRONG GOAL MODE (specialty-agnostic):
  - procedure_intervention negatives: ["counselling", "therapy", "coaching", "conservative management"]
  - diagnostic_workup negatives: ["surgery", "operation", "procedure package"]
  - second_opinion negatives: ["routine follow-up", "ongoing care plan", "long-term management"]
  - ongoing_management negatives: ["one-off second opinion", "single consultation only"]

ANCHOR_PHRASES (1-4 phrases):
- Extract explicit conditions, diseases, or procedures stated or clearly implied in the query
- Examples: "atrial fibrillation", "SVT ablation", "chest pain", "coronary angiography", "endometriosis", "laparoscopic surgery", "hysteroscopy", "electrophysiology"
- Include procedure names (e.g. ablation, hysteroscopy, laparoscopic) and condition names (e.g. cancer, endometriosis) that a relevant doctor would have in their profile
- If no explicit or clearly implied anchor exists, return []
- Anchors are the most important terms for matching practitioner profiles

LIKELY_SUBSPECIALTIES (0-3 subspecialties):
- Infer likely subspecialties the patient would benefit from seeing, based on query intent
- Each subspecialty should have a confidence score (0.0-1.0)
- High confidence (>=0.75): Explicitly mentioned or strongly implied (e.g., "ablation" → "Electrophysiology" with 0.9 confidence)
- Medium confidence (0.5-0.74): Reasonably inferred (e.g., "chest pain" → "Interventional cardiology" with 0.65 confidence)
- Low confidence (<0.5): Weakly inferred, only include if >=0.4
- Use standard subspecialty names that match common medical subspecialty terminology
- If no subspecialty can be inferred with confidence >=0.4, return []`;

/**
 * Classify general intent using goal + specificity (specialty-agnostic)
 * Returns: { goal, specificity, confidence, expansion_terms, negative_terms }
 */
const classifyGeneralIntentParallel = async (userQuery, conversationText, specialty, modelOverride) => {
  const model = modelOverride || 'gpt-4o-mini';
  try {
    // User message contains only query-specific content
    const userMessage = `Query: "${userQuery}"${conversationText ? `\nContext: ${conversationText.slice(-500)}` : ''}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_MESSAGE_GENERAL_INTENT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
      max_completion_tokens: 280,
      response_format: { type: "json_object" }
    });

    // Strip markdown code blocks if present (sometimes AI adds them despite response_format)
    const content = stripMarkdownCodeBlocks(response.choices[0].message.content);
    const intentData = JSON.parse(content);
    
    // Validate structure
    if (!intentData.goal || !intentData.specificity || typeof intentData.confidence !== 'number' || 
        !Array.isArray(intentData.expansion_terms) || !Array.isArray(intentData.negative_terms)) {
      throw new Error('Invalid general intent classification structure');
    }
    
    // Ensure anchor_phrases exists and is valid (may be missing in old responses)
    if (!Array.isArray(intentData.anchor_phrases)) {
      intentData.anchor_phrases = [];
    }
    // Cap anchor phrases at 3 (as per requirements)
    if (intentData.anchor_phrases.length > 3) {
      intentData.anchor_phrases = intentData.anchor_phrases.slice(0, 3);
    }
    
    // Ensure likely_subspecialties exists and is valid
    if (!Array.isArray(intentData.likely_subspecialties)) {
      intentData.likely_subspecialties = [];
    }
    // Filter out low-confidence subspecialties (<0.4) and cap at 3
    intentData.likely_subspecialties = intentData.likely_subspecialties
      .filter(sub => sub && sub.name && typeof sub.confidence === 'number' && sub.confidence >= 0.4)
      .slice(0, 3);
    
    // Enforce negative_terms rules: ONLY apply when named_procedure AND high confidence
    if (intentData.specificity !== 'named_procedure' || intentData.confidence < 0.75) {
      intentData.negative_terms = [];
    }
    
    return intentData;
  } catch (error) {
    console.error('[Variant] General intent classification failed:', error);
    // Fallback: return generic intent
    return {
      goal: 'diagnostic_workup',
      specificity: 'symptom_only',
      confidence: 0.3,
      expansion_terms: [],
      negative_terms: []
    };
  }
};

// System message with static instructions for clinical intent classification
const SYSTEM_MESSAGE_CLINICAL_INTENT = `You are a medical search system that routes queries to the correct clinical subspecialty.

IMPORTANT: Do NOT include specialty, location, or insurance information in expansion terms. These are already filtered before ranking and should not influence the ranking algorithm.

For CARDIOLOGY queries, classify into one of these intent lanes:
- coronary_ischaemic (chest pain, angina, coronary artery disease, heart attack)
- arrhythmia_rhythm (palpitations, fainting, SVT, AF, pacemaker, ablation)
- structural_valve (valve problems, murmurs, structural heart disease)
- heart_failure (heart failure, breathlessness, fluid retention)
- prevention_risk (prevention, risk assessment, screening)
- general_cardiology_unclear (general cardiology, unclear intent)

For OTHER specialties, use: general_[specialty]_unclear

Return ONLY a JSON object:
{
  "primary_intent": "coronary_ischaemic",
  "expansion_terms": ["chest pain clinic", "angina", "coronary artery disease", "ischaemic heart disease", "CT coronary angiography", "stress echo", "coronary angiography", "interventional cardiology"],
  "negative_terms": ["electrophysiology", "ablation", "atrial fibrillation", "pacemaker", "ICD", "arrhythmia"],
  "anchor_phrases": ["chest pain", "coronary angiography", "interventional cardiology"],
  "likely_subspecialties": [{"name": "Interventional cardiology", "confidence": 0.8}, {"name": "Coronary angiography", "confidence": 0.7}]
}

Rules:
1. expansion_terms: Intent-specific synonyms and related procedures/tests (8-14 terms). Include procedure names (e.g. laparoscopic, ablation, hysteroscopy, excision, repair), subspecialty-style terms (e.g. electrophysiology, general surgery, gynaecology, reproductive medicine), and condition terms (e.g. cancer, disease, disorders) that match how practitioners are described in searchable profiles.
2. negative_terms: Terms that indicate a DIFFERENT subspecialty (5-8 terms)
3. anchor_phrases: Return 1-3 anchor_phrases - the main procedures, conditions, or subspecialty names that a relevant practitioner would have in their profile (e.g. "atrial fibrillation", "catheter ablation", "Electrophysiology"). If none clearly apply, return [].
4. Be specific - avoid generic terms like "heart", "pain", "thoracic"
5. Focus on clinical pathways and terms that appear in practitioner procedure_groups, clinical_expertise, and subspecialties
6. For non-Cardiology specialties (General surgery, Gynaecology, Ophthalmology, Trauma & orthopaedics): include relevant procedure names (e.g. laparoscopic, key-hole, hysteroscopy, excision), subspecialty names, and condition terms in expansion_terms
7. likely_subspecialties: Infer 0-3 subspecialties with confidence scores (0.0-1.0). Use standard subspecialty names matching common medical terminology.`;

/**
 * Classify clinical intent from query
 * Returns: { primary_intent, expansion_terms, negative_terms }
 */
const classifyClinicalIntent = async (userQuery, conversationText, specialty, modelOverride) => {
  const model = modelOverride || 'gpt-4o-mini';
  try {
    // User message contains only query-specific content
    const userMessage = `Query: "${userQuery}"${conversationText ? `\nContext: ${conversationText.slice(-500)}` : ''}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_MESSAGE_CLINICAL_INTENT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
      max_completion_tokens: 200,
      response_format: { type: "json_object" }
    });

    // Strip markdown code blocks if present (sometimes AI adds them despite response_format)
    const content = stripMarkdownCodeBlocks(response.choices[0].message.content);
    const intentData = JSON.parse(content);
    
    // Validate structure
    if (!intentData.primary_intent || !intentData.expansion_terms || !intentData.negative_terms) {
      throw new Error('Invalid intent classification structure');
    }
    
    // Ensure likely_subspecialties exists and is valid
    if (!Array.isArray(intentData.likely_subspecialties)) {
      intentData.likely_subspecialties = [];
    }
    // Filter out low-confidence subspecialties (<0.4) and cap at 3
    intentData.likely_subspecialties = intentData.likely_subspecialties
      .filter(sub => sub && sub.name && typeof sub.confidence === 'number' && sub.confidence >= 0.4)
      .slice(0, 3);
    // Ensure anchor_phrases exists (clinical v2 and static prompt)
    if (!Array.isArray(intentData.anchor_phrases)) {
      intentData.anchor_phrases = [];
    }
    intentData.anchor_phrases = intentData.anchor_phrases.slice(0, 5);
    
    return intentData;
  } catch (error) {
    console.error('[Variant] Intent classification failed:', error);
    // Fallback: return generic intent
    return {
      primary_intent: 'general_unclear',
      expansion_terms: [],
      negative_terms: [],
      anchor_phrases: [],
      likely_subspecialties: []
    };
  }
};

/**
 * Load pre-fixed lexicons from Phase 1 output files (subspecialties, procedures, conditions).
 * @param {string} baseDir - Directory containing subspecialties-from-data.json, procedures-from-data.json, conditions-from-data.json
 * @returns {{ subspecialties: object, procedures: string[], conditions: string[] } | null}
 */
function loadLexicons(baseDir) {
  if (!baseDir || typeof baseDir !== 'string') return null;
  try {
    const subsPath = path.join(baseDir, 'subspecialties-from-data.json');
    const procPath = path.join(baseDir, 'procedures-from-data.json');
    const condPath = path.join(baseDir, 'conditions-from-data.json');
    if (!fs.existsSync(subsPath) || !fs.existsSync(procPath) || !fs.existsSync(condPath)) {
      return null;
    }
    const subspecialties = JSON.parse(fs.readFileSync(subsPath, 'utf8'));
    const procedures = JSON.parse(fs.readFileSync(procPath, 'utf8'));
    const conditions = JSON.parse(fs.readFileSync(condPath, 'utf8'));
    return {
      subspecialties: subspecialties.global ? subspecialties : { global: [], bySpecialty: {} },
      procedures: procedures.procedures || [],
      conditions: conditions.conditions || [],
    };
  } catch (e) {
    return null;
  }
}

/**
 * Build clinical intent system message v2: inject subspecialty list for specialty, prefer procedures/conditions from data.
 */
function buildClinicalIntentSystemMessageV2(specialty, lexicons) {
  let subsList = [];
  if (lexicons.subspecialties && lexicons.subspecialties.bySpecialty && specialty) {
    subsList = lexicons.subspecialties.bySpecialty[specialty] || lexicons.subspecialties.global || [];
  } else if (lexicons.subspecialties && lexicons.subspecialties.global) {
    subsList = lexicons.subspecialties.global;
  }
  const subsText = subsList.length > 0
    ? `Subspecialties MUST be chosen from this list (use exact names): ${subsList.slice(0, 80).join(', ')}${subsList.length > 80 ? ' ...' : ''}.`
    : 'Use standard subspecialty names matching common medical terminology.';
  const topProcedures = (lexicons.procedures || []).slice(0, 100).join(', ');
  const topConditions = (lexicons.conditions || []).slice(0, 80).join(', ');
  const preferText = (topProcedures || topConditions)
    ? `When choosing expansion_terms and anchor_phrases, prefer phrases from practitioner vocabulary. Example procedures: ${topProcedures || 'N/A'}. Example conditions: ${topConditions || 'N/A'}.`
    : '';

  return `You are a medical search system that routes queries to the correct clinical subspecialty.

IMPORTANT: Do NOT include specialty, location, or insurance information in expansion terms. These are already filtered before ranking.

${specialty ? `The user is already in **${specialty}**. Classify intent within this specialty and return terms that match practitioners' subspecialties, procedure_groups, and clinical_expertise.` : ''}

For CARDIOLOGY queries, classify into one of these intent lanes:
- coronary_ischaemic (chest pain, angina, coronary artery disease, heart attack)
- arrhythmia_rhythm (palpitations, fainting, SVT, AF, pacemaker, ablation)
- structural_valve (valve problems, murmurs, structural heart disease)
- heart_failure (heart failure, breathlessness, fluid retention)
- prevention_risk (prevention, risk assessment, screening)
- general_cardiology_unclear (general cardiology, unclear intent)

For OTHER specialties, use: general_[specialty]_unclear

${subsText}
${preferText}

Few-shot examples (use exact names from the subspecialty list and procedure/condition vocabulary where possible):

Example 1 - Cardiology, chest pain / coronary:
Query: "I've been having chest tightness and my GP said I should see a cardiologist."
{
  "primary_intent": "coronary_ischaemic",
  "expansion_terms": ["chest pain clinic", "angina", "coronary artery disease", "ischaemic heart disease", "CT coronary angiography", "stress echo", "coronary angiography", "interventional cardiology"],
  "negative_terms": ["electrophysiology", "ablation", "pacemaker", "ICD", "arrhythmia"],
  "anchor_phrases": ["chest pain", "coronary angiography", "Interventional Cardiology"],
  "likely_subspecialties": [{"name": "Interventional Cardiology", "confidence": 0.8}, {"name": "General cardiology", "confidence": 0.5}]
}

Example 2 - Cardiology, AF / ablation:
Query: "I've been diagnosed with atrial fibrillation and need someone who does ablations."
{
  "primary_intent": "arrhythmia_rhythm",
  "expansion_terms": ["atrial fibrillation", "catheter ablation", "cardiac ablation", "electrophysiology", "holter monitoring", "cardioversion", "antiarrhythmic", "heart rhythm"],
  "negative_terms": ["heart failure", "coronary artery disease", "valve", "structural heart"],
  "anchor_phrases": ["atrial fibrillation", "Catheter Ablation", "Electrophysiology"],
  "likely_subspecialties": [{"name": "Electrophysiology", "confidence": 0.95}]
}

Return ONLY a JSON object (same keys as above) for the given Query. No other text.

Rules:
1. expansion_terms: 8-14 terms. Choose from or very close to the procedure/condition lists above when possible.
2. negative_terms: 5-8 terms that indicate a DIFFERENT subspecialty.
3. anchor_phrases: 1-3 phrases - main procedures, conditions, or subspecialty names a relevant practitioner would have. Prefer terms from the subspecialty and procedure/condition lists above.
4. likely_subspecialties: 0-3 with confidence. Names MUST be from the subspecialty list above.
5. Be specific - avoid generic terms like "heart", "pain", "thoracic".`;
}

/**
 * Classify clinical intent (v2 when options.lexiconsDir provided: data-aligned prompt, specialty context, anchor_phrases, higher max_tokens).
 * @param {string} userQuery
 * @param {string} conversationText
 * @param {string|null} specialty - e.g. from benchmark expectedSpecialty or production routing
 * @param {{ lexiconsDir?: string }} options - optional; when lexiconsDir is set, use v2 prompt and lexicons
 */
const classifyClinicalIntentWithOptions = async (userQuery, conversationText, specialty, options) => {
  const useV2 = options && options.lexiconsDir;
  const lexicons = useV2 ? loadLexicons(options.lexiconsDir) : null;
  const systemContent = useV2 && lexicons
    ? buildClinicalIntentSystemMessageV2(specialty || null, lexicons)
    : SYSTEM_MESSAGE_CLINICAL_INTENT;
  const maxTokens = useV2 ? 320 : 200;
  const model = (options && options.model) || 'gpt-4o-mini';

  try {
    const userMessage = `Query: "${userQuery}"${conversationText ? `\nContext: ${conversationText.slice(-500)}` : ''}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" }
    });

    const content = stripMarkdownCodeBlocks(response.choices[0].message.content);
    const intentData = JSON.parse(content);

    if (!intentData.primary_intent || !intentData.expansion_terms || !intentData.negative_terms) {
      throw new Error('Invalid intent classification structure');
    }

    if (!Array.isArray(intentData.likely_subspecialties)) {
      intentData.likely_subspecialties = [];
    }
    intentData.likely_subspecialties = intentData.likely_subspecialties
      .filter(sub => sub && sub.name && typeof sub.confidence === 'number' && sub.confidence >= 0.4)
      .slice(0, 3);
    if (!Array.isArray(intentData.anchor_phrases)) {
      intentData.anchor_phrases = [];
    }
    intentData.anchor_phrases = intentData.anchor_phrases.slice(0, 5);

    return intentData;
  } catch (error) {
    console.error('[Variant] Intent classification failed:', error);
    return {
      primary_intent: 'general_unclear',
      expansion_terms: [],
      negative_terms: [],
      anchor_phrases: [],
      likely_subspecialties: []
    };
  }
};

// System message with static instructions for insights extraction
const SYSTEM_MESSAGE_INSIGHTS = `You are a medical search system that extracts structured insights from healthcare conversations.

Extract and return ONLY a JSON object:
{
  "symptoms": ["symptom1", "symptom2"],
  "preferences": ["preference1", "preference2"],
  "urgency": "routine|urgent|emergency",
  "specialty": "specialty_name_or_null",
  "location": "location_or_null",
  "summary": "brief_summary_of_conversation"
}

Rules:
- Only extract information explicitly mentioned
- If not mentioned, use null
- Keep symptoms and preferences as arrays
- Be conservative - don't infer information

Medical Context:
- "cardiac arrest", "heart attack", "stroke", "severe chest pain" = urgent/emergency
- "cardiology", "cardiologist", "heart specialist" = specialty: "Cardiology"
- Extract symptoms from medical terms mentioned
- Recognize medical emergencies and set appropriate urgency`;

/**
 * Extract insights from conversation using AI (Authoritative)
 */
const extractInsightsWithAI = async (messages, modelOverride) => {
  const model = modelOverride || 'gpt-4o-mini';
  try {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // User message contains only the conversation text
    const userMessage = `Conversation:\n${conversationText}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_MESSAGE_INSIGHTS },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_completion_tokens: 300
    });

    // Strip markdown code blocks if present
    const content = stripMarkdownCodeBlocks(response.choices[0].message.content);
    const insights = JSON.parse(content);
    return insights;
  } catch (error) {
    console.error('[Variant] AI summarization failed:', error);
    return {
      symptoms: [],
      preferences: [],
      urgency: 'routine',
      specialty: null,
      location: null,
      summary: 'Analysis failed'
    };
  }
};

/**
 * Medical stopwords to filter out
 */
const MEDICAL_STOPWORDS = new Set([
  'doctor', 'doctors', 'specialist', 'specialists', 'clinic', 'clinics',
  'medical', 'healthcare', 'health', 'care', 'treatment', 'treatments',
  'patient', 'patients', 'appointment', 'appointments', 'visit', 'visits'
]);

/**
 * Validate and clean expansion output
 */
const validateAndCleanExpansion = (rawOutput, requiredTerms) => {
  try {
    // Reject if contains JSON markers, newlines, or control chars
    if (/[{}\[\]:\n\r]/.test(rawOutput)) {
      console.warn('[Variant] Rejected: Contains JSON/newline markers');
      return null;
    }

    // Reject if empty or too short
    if (!rawOutput || rawOutput.trim().length < 3) {
      console.warn('[Variant] Rejected: Too short');
      return null;
    }

    // Split into tokens and normalize
    const tokens = rawOutput
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .map(t => t.replace(/[^\w-]/g, ''))
      .filter(t => t.length >= 2);

    if (tokens.length === 0) {
      console.warn('[Variant] Rejected: No valid tokens');
      return null;
    }

    // Deduplicate
    const uniqueTokens = [...new Set(tokens)];

    // Remove stopwords
    const filteredTokens = uniqueTokens.filter(t => !MEDICAL_STOPWORDS.has(t));

    // Enforce max tokens (50)
    const cappedTokens = filteredTokens.slice(0, 50);

    // Ensure required terms are present
    const requiredLower = requiredTerms.map(t => t.toLowerCase());
    const missingRequired = requiredLower.filter(rt => 
      !cappedTokens.some(t => t.includes(rt) || rt.includes(t))
    );

    if (missingRequired.length > 0) {
      cappedTokens.push(...missingRequired);
    }

    // Final deduplication
    const finalTokens = [...new Set(cappedTokens)];

    return finalTokens;
  } catch (error) {
    console.error('[Variant] Validation error:', error);
    return null;
  }
};

/**
 * Expand query with AI using intent-aware expansion
 * Returns: { expansionTerms, intentData }
 */
const expandQueryWithAI = async (userQuery, conversationText, location, insights) => {
  try {
    // First, classify clinical intent
    // NOTE: specialty is not passed because it's already filtered before ranking.
    // The LLM prompt instructs not to include specialty/location/insurance in expansion terms.
    const intentData = await classifyClinicalIntent(
      userQuery,
      conversationText,
      null // Specialty already filtered, don't pass it
    );
    
    // Use intent-specific expansion terms (already validated by classification)
    const expansionTerms = intentData.expansion_terms || [];
    
    // Filter out stopwords and validate
    const filteredTerms = expansionTerms
      .filter(term => term.length >= 2)
      .filter(term => !MEDICAL_STOPWORDS.has(term.toLowerCase()))
      .slice(0, 50);
    
    return {
      expansionTerms: filteredTerms,
      intentData: {
        primary_intent: intentData.primary_intent,
        negative_terms: intentData.negative_terms || [],
        likely_subspecialties: intentData.likely_subspecialties || []
      }
    };
  } catch (error) {
    console.error('[Variant] AI expansion failed:', error);
    return {
      expansionTerms: null,
      intentData: null
    };
  }
};

/**
 * Extract safe lane terms from intent_terms (2-4 high-signal terms for BM25 query)
 * Prefers symptoms/conditions, excludes procedure-heavy terms
 */
const extractSafeLaneTerms = (intent_terms, maxTerms = 4) => {
  if (!intent_terms || intent_terms.length === 0) {
    return [];
  }
  
  // Define safe term patterns (symptoms/conditions, not procedures)
  const safeTermPatterns = [
    /chest pain/i,
    /angina/i,
    /coronary(?!\s+(angiography|intervention|stent|bypass))/i, // "coronary" but not "coronary angiography"
    /ischaemic/i,
    /heart disease/i,
    /palpitation/i,
    /arrhythmia/i,
    /breathless/i,
    /dyspnea/i
  ];
  
  // Exclude procedure-heavy terms
  const procedurePatterns = [
    /interventional/i,
    /angiography/i,
    /pci/i,
    /stent/i,
    /surgery/i,
    /procedure/i,
    /bypass/i,
    /catheter/i
  ];
  
  const safeTerms = intent_terms.filter(term => {
    const termLower = term.toLowerCase();
    // Must match safe pattern
    const isSafe = safeTermPatterns.some(pattern => pattern.test(term));
    // Must NOT match procedure pattern
    const isProcedure = procedurePatterns.some(pattern => pattern.test(term));
    return isSafe && !isProcedure;
  });
  
  return safeTerms.slice(0, maxTerms);
};

/**
 * Clean user query to get q_patient (verbatim, cleaned)
 */
const cleanPatientQuery = (userQuery) => {
  if (!userQuery) return '';
  // Keep original query verbatim, just trim whitespace
  return userQuery.trim();
};

/**
 * Extract required terms from insights
 */
const extractRequiredTerms = (userQuery, insights) => {
  const requiredTerms = new Set();

  if (userQuery) {
    userQuery.split(/\s+/).forEach(term => {
      if (term.length >= 2) requiredTerms.add(term.toLowerCase());
    });
  }

  // NOTE: specialty and location are NOT added to required terms because they are already
  // filtered in production infrastructure before ranking. Adding them would double-weight
  // these factors and distort ranking.

  if (insights.symptoms && Array.isArray(insights.symptoms)) {
    insights.symptoms.forEach(symptom => {
      symptom.split(/\s+/).forEach(term => {
        if (term.length >= 2) requiredTerms.add(term.toLowerCase());
      });
    });
  }

  return Array.from(requiredTerms);
};

/**
 * Merge required terms with optional synonyms
 */
const mergeQueryTerms = (requiredTerms, optionalSynonyms) => {
  const merged = new Set(requiredTerms);

  if (optionalSynonyms && Array.isArray(optionalSynonyms)) {
    optionalSynonyms.forEach(synonym => {
      const synonymLower = synonym.toLowerCase();
      
      if (!merged.has(synonymLower)) {
        const conflicts = requiredTerms.some(required => {
          const reqLower = required.toLowerCase();
          return synonymLower.includes(reqLower) || reqLower.includes(synonymLower);
        });

        if (!conflicts) {
          merged.add(synonymLower);
        }
      }
    });
  }

  const finalTerms = Array.from(merged).slice(0, 60);
  return finalTerms.join(' ');
};

// ============================================================================
// VARIANT 1: ALGORITHMIC EXPANSION ONLY
// ============================================================================

const getSessionContextAlgorithmic = async (userQuery, messages, location) => {
  const startTime = Date.now();
  
  // Extract insights (still need AI for this)
  const insights = await extractInsightsWithAI(messages);
  
  // Build enriched query algorithmically (no AI expansion)
  const enrichedParts = [userQuery];
  
  if (insights.symptoms && insights.symptoms.length > 0) {
    enrichedParts.push(insights.symptoms.join(' '));
  }
  
  if (insights.preferences && insights.preferences.length > 0) {
    enrichedParts.push(insights.preferences.join(' '));
  }

  // NOTE: specialty and location are NOT added to enriched query because they are already
  // filtered in production infrastructure before ranking. Adding them would double-weight
  // these factors and distort ranking.

  if (insights.urgency && insights.urgency !== 'routine') {
    enrichedParts.push(insights.urgency);
  }
  
  const enrichedQuery = enrichedParts.filter(Boolean).join(' ');
  const processingTime = Date.now() - startTime;
  
  // Algorithmic variant: no intent terms, q_patient = enriched query
  const q_patient = cleanPatientQuery(enrichedQuery);
  
  return {
    q_patient,
    safe_lane_terms: [], // No safe terms for algorithmic
    intent_terms: [], // No intent terms for algorithmic
    enrichedQuery, // For display/logging
    insights,
    expansionTerms: null,
    processingTime
  };
};

// ============================================================================
// VARIANT 2: SEQUENTIAL AI EXPANSION
// ============================================================================

const getSessionContextSequential = async (userQuery, messages, location) => {
  const startTime = Date.now();
  
  // Step 1: Extract insights (Authoritative)
  const insights = await extractInsightsWithAI(messages);
  
  // Step 2: Expand query with AI using intent-aware expansion (Sequential - after insights)
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  
  const expansionResult = await expandQueryWithAI(userQuery, conversationText, location, insights);
  
  // Separate queries for two-stage retrieval
  const q_patient = cleanPatientQuery(userQuery);
  const intent_terms = expansionResult.expansionTerms || [];
  // For sequential/parallel: BM25 uses ONLY q_patient (no safe_lane_terms)
  // Intent terms are used only for Stage B rescoring, not BM25 query
  const safe_lane_terms = [];
  
  // Build enriched query for display/logging (backward compatibility)
  const requiredTerms = extractRequiredTerms(userQuery, insights);
  const enrichedQuery = mergeQueryTerms(requiredTerms, expansionResult.expansionTerms);
  
  const processingTime = Date.now() - startTime;
  
  return {
    q_patient,
    safe_lane_terms, // Empty for sequential/parallel - BM25 uses only q_patient
    intent_terms,
    enrichedQuery, // For display/logging (backward compat)
    insights,
    expansionTerms: intent_terms, // For backward compat
    intentData: expansionResult.intentData,
    processingTime
  };
};

// ============================================================================
// VARIANT 3: PARALLEL + CONSTRAINED AI EXPANSION
// ============================================================================

const getSessionContextParallel = async (userQuery, messages, location) => {
  const startTime = Date.now();
  
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  
  // Run three AI calls in parallel: insights, general intent (goal/specificity), and clinical intent
  // Note: Clinical intent can work without specialty (it's optional), so we run all three in parallel
  // This is a copy of getSessionContextParallelGeneralGoalSpecificity but with negative terms DISABLED
  const [insights, generalIntentResult, clinicalIntentResult] = await Promise.all([
    extractInsightsWithAI(messages),
    classifyGeneralIntentParallel(userQuery, conversationText, null) // Specialty-agnostic, so null is fine
      .catch(err => {
        console.warn('[Variant] General intent classification failed, using fallback:', err.message);
        return {
          goal: 'diagnostic_workup',
          specificity: 'symptom_only',
          confidence: 0.3,
          expansion_terms: [],
          negative_terms: [],
          anchor_phrases: [],
          likely_subspecialties: []
        };
      }),
    classifyClinicalIntent(userQuery, conversationText, null) // Run in parallel, specialty optional
      .catch(err => {
        console.warn('[Variant] Clinical intent classification failed, using fallback:', err.message);
        return {
          primary_intent: 'general_cardiology_unclear',
          expansion_terms: [],
          negative_terms: [],
          anchor_phrases: [],
          likely_subspecialties: []
        };
      })
  ]);
  
  // Separate queries for two-stage retrieval
  const q_patient = cleanPatientQuery(userQuery);
  
  // Merge expansion terms from both general intent and clinical intent
  // Clinical intent terms are more specific and should take precedence
  const generalExpansionTerms = generalIntentResult.expansion_terms || [];
  const clinicalExpansionTerms = clinicalIntentResult.expansion_terms || [];
  
  // Combine expansion terms: clinical intent terms first (more specific), then general intent terms
  // Deduplicate to avoid repetition
  const allExpansionTerms = [...clinicalExpansionTerms];
  generalExpansionTerms.forEach(term => {
    if (!allExpansionTerms.includes(term)) {
      allExpansionTerms.push(term);
    }
  });
  const intent_terms = allExpansionTerms;
  
  // BM25 uses ONLY q_patient (no safe_lane_terms)
  const safe_lane_terms = [];
  
  // Build enriched query for display/logging (backward compatibility)
  const requiredTerms = extractRequiredTerms(userQuery, insights);
  const enrichedQuery = mergeQueryTerms(requiredTerms, intent_terms);
  
  const processingTime = Date.now() - startTime;
  
  // Determine if query is ambiguous or clear
  // Query is CLEAR if: high confidence (>=0.75) AND (named_procedure OR confirmed_diagnosis)
  // Query is AMBIGUOUS if: low confidence OR symptom_only
  const isQueryClear = generalIntentResult.confidence >= 0.75 && 
                       (generalIntentResult.specificity === 'named_procedure' || 
                        generalIntentResult.specificity === 'confirmed_diagnosis');
  
  // Merge negative terms: ENABLED when query is CLEAR, DISABLED when query is AMBIGUOUS
  const mergedNegativeTerms = [];
  if (isQueryClear) {
    // When query is clear, merge negative terms from both sources (like goal/specificity variant)
    if (clinicalIntentResult.negative_terms && clinicalIntentResult.negative_terms.length > 0) {
      mergedNegativeTerms.push(...clinicalIntentResult.negative_terms);
    }
    if (generalIntentResult.negative_terms && generalIntentResult.negative_terms.length > 0) {
      generalIntentResult.negative_terms.forEach(term => {
        if (!mergedNegativeTerms.includes(term)) {
          mergedNegativeTerms.push(term);
        }
      });
    }
  }
  // When query is ambiguous, negative terms remain empty (disabled)
  
  // Merge likely subspecialties: combine both sources, prioritizing higher confidence
  const mergedSubspecialties = [];
  const subspecialtyMap = new Map(); // Use map to deduplicate by name, keep highest confidence
  [...(clinicalIntentResult.likely_subspecialties || []), ...(generalIntentResult.likely_subspecialties || [])].forEach(sub => {
    if (sub && sub.name && typeof sub.confidence === 'number' && sub.confidence >= 0.4) {
      const existing = subspecialtyMap.get(sub.name.toLowerCase());
      if (!existing || sub.confidence > existing.confidence) {
        subspecialtyMap.set(sub.name.toLowerCase(), sub);
      }
    }
  });
  mergedSubspecialties.push(...Array.from(subspecialtyMap.values()));
  mergedSubspecialties.sort((a, b) => b.confidence - a.confidence); // Sort by confidence descending
  const finalSubspecialties = mergedSubspecialties.slice(0, 3); // Cap at 3
  
  // Format intentData to include both goal/specificity AND clinical intent
  const intentData = {
    // General intent (goal/specificity)
    goal: generalIntentResult.goal,
    specificity: generalIntentResult.specificity,
    confidence: generalIntentResult.confidence,
    // Clinical intent (specialty-specific)
    primary_intent: clinicalIntentResult.primary_intent,
    // Merged data (negative terms conditionally enabled)
    negative_terms: mergedNegativeTerms, // Enabled when query is clear, disabled when ambiguous
    anchor_phrases: generalIntentResult.anchor_phrases || [], // Anchor phrases from general intent
    likely_subspecialties: finalSubspecialties, // Merged subspecialties from both sources
    // Ambiguity flag for ranking strategy
    isQueryAmbiguous: !isQueryClear // If query is clear, use modified BM25; if ambiguous, use rescoring score
  };
  
  return {
    q_patient,
    safe_lane_terms, // Empty - BM25 uses only q_patient
    intent_terms,
    enrichedQuery, // For display/logging (backward compat)
    insights,
    expansionTerms: intent_terms, // For backward compat
    intentData: intentData,
    anchor_phrases: intentData.anchor_phrases, // Also pass separately for easy access
    processingTime
  };
};

/**
 * Session context v2: merge anchors from general + clinical, safe_lane_terms, subspecialty names in intent_terms, anchor cap 5.
 * Options: { lexiconsDir, specialty } - when lexiconsDir is set, clinical intent uses data-aligned prompt and specialty.
 */
const getSessionContextParallelV2 = async (userQuery, messages, location, options = {}) => {
  const startTime = Date.now();
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  const lexiconsDir = options.lexiconsDir || null;
  const specialty = options.specialty || null;
  const modelOverride = options.model || null;
  const clinicalOptions = lexiconsDir ? { lexiconsDir } : undefined;
  if (modelOverride && clinicalOptions) clinicalOptions.model = modelOverride;

  const [insights, generalIntentResult, clinicalIntentResult] = await Promise.all([
    extractInsightsWithAI(messages, modelOverride),
    classifyGeneralIntentParallel(userQuery, conversationText, null, modelOverride)
      .catch(err => {
        console.warn('[Variant] General intent classification failed, using fallback:', err.message);
        return {
          goal: 'diagnostic_workup',
          specificity: 'symptom_only',
          confidence: 0.3,
          expansion_terms: [],
          negative_terms: [],
          anchor_phrases: [],
          likely_subspecialties: []
        };
      }),
    (clinicalOptions
      ? classifyClinicalIntentWithOptions(userQuery, conversationText, specialty, clinicalOptions)
      : classifyClinicalIntent(userQuery, conversationText, specialty, modelOverride)
    ).catch(err => {
      console.warn('[Variant] Clinical intent classification failed, using fallback:', err.message);
      return {
        primary_intent: 'general_cardiology_unclear',
        expansion_terms: [],
        negative_terms: [],
        anchor_phrases: [],
        likely_subspecialties: []
      };
    })
  ]);

  const q_patient = cleanPatientQuery(userQuery);
  const generalExpansionTerms = generalIntentResult.expansion_terms || [];
  const clinicalExpansionTerms = clinicalIntentResult.expansion_terms || [];
  const allExpansionTerms = [...clinicalExpansionTerms];
  generalExpansionTerms.forEach(term => {
    if (!allExpansionTerms.includes(term)) allExpansionTerms.push(term);
  });

  // Normalize intent_terms: lowercase, trim
  let intent_terms = allExpansionTerms.map(t => (t && typeof t === 'string' ? t.trim().toLowerCase() : t)).filter(Boolean);
  // Append likely_subspecialties names (top 2-3), skip if already in intent_terms
  const intentTermsSet = new Set(intent_terms);
  const subsToAdd = (clinicalIntentResult.likely_subspecialties || [])
    .concat(generalIntentResult.likely_subspecialties || [])
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 3);
  subsToAdd.forEach(sub => {
    if (sub && sub.name) {
      const name = sub.name.trim().toLowerCase();
      if (name && !intentTermsSet.has(name)) {
        intent_terms.push(name);
        intentTermsSet.add(name);
      }
    }
  });

  // Merge anchor_phrases from general + clinical, dedupe by lowercase, cap 5
  const anchorSet = new Set();
  const anchorList = [];
  const addAnchors = (list) => {
    if (!Array.isArray(list)) return;
    for (const a of list) {
      const key = (a && typeof a === 'string' ? a.trim() : '').toLowerCase();
      if (key && !anchorSet.has(key) && anchorList.length < 5) {
        anchorSet.add(key);
        anchorList.push((a && typeof a === 'string' ? a.trim() : a));
      }
    }
  };
  addAnchors(clinicalIntentResult.anchor_phrases);
  addAnchors(generalIntentResult.anchor_phrases || []);
  const merged_anchor_phrases = anchorList;

  // Safe lane terms from intent_terms (max 4)
  const safe_lane_terms = extractSafeLaneTerms(intent_terms, 4);

  const requiredTerms = extractRequiredTerms(userQuery, insights);
  const enrichedQuery = mergeQueryTerms(requiredTerms, intent_terms);
  const processingTime = Date.now() - startTime;

  const isQueryClear = generalIntentResult.confidence >= 0.75 &&
    (generalIntentResult.specificity === 'named_procedure' || generalIntentResult.specificity === 'confirmed_diagnosis');
  const mergedNegativeTerms = [];
  if (isQueryClear) {
    if (clinicalIntentResult.negative_terms && clinicalIntentResult.negative_terms.length > 0) {
      mergedNegativeTerms.push(...clinicalIntentResult.negative_terms);
    }
    if (generalIntentResult.negative_terms && generalIntentResult.negative_terms.length > 0) {
      generalIntentResult.negative_terms.forEach(term => {
        if (!mergedNegativeTerms.includes(term)) mergedNegativeTerms.push(term);
      });
    }
  }

  const mergedSubspecialties = [];
  const subspecialtyMap = new Map();
  [...(clinicalIntentResult.likely_subspecialties || []), ...(generalIntentResult.likely_subspecialties || [])].forEach(sub => {
    if (sub && sub.name && typeof sub.confidence === 'number' && sub.confidence >= 0.4) {
      const existing = subspecialtyMap.get(sub.name.toLowerCase());
      if (!existing || sub.confidence > existing.confidence) {
        subspecialtyMap.set(sub.name.toLowerCase(), sub);
      }
    }
  });
  mergedSubspecialties.push(...Array.from(subspecialtyMap.values()));
  mergedSubspecialties.sort((a, b) => b.confidence - a.confidence);
  const finalSubspecialties = mergedSubspecialties.slice(0, 3);

  const intentData = {
    goal: generalIntentResult.goal,
    specificity: generalIntentResult.specificity,
    confidence: generalIntentResult.confidence,
    primary_intent: clinicalIntentResult.primary_intent,
    negative_terms: mergedNegativeTerms,
    anchor_phrases: merged_anchor_phrases,
    likely_subspecialties: finalSubspecialties,
    isQueryAmbiguous: !isQueryClear
  };

  return {
    q_patient,
    safe_lane_terms,
    intent_terms,
    enrichedQuery,
    insights,
    expansionTerms: intent_terms,
    intentData,
    anchor_phrases: merged_anchor_phrases,
    processingTime
  };
};

/**
 * Parallel variant using general goal + specificity classification (specialty-agnostic)
 */
const getSessionContextParallelGeneralGoalSpecificity = async (userQuery, messages, location) => {
  const startTime = Date.now();
  
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  
  // Run three AI calls in parallel: insights, general intent (goal/specificity), and clinical intent
  // Note: Clinical intent can work without specialty (it's optional), so we run all three in parallel
  const [insights, generalIntentResult, clinicalIntentResult] = await Promise.all([
    extractInsightsWithAI(messages),
    classifyGeneralIntentParallel(userQuery, conversationText, null) // Specialty-agnostic, so null is fine
      .catch(err => {
        console.warn('[Variant] General intent classification failed, using fallback:', err.message);
        return {
          goal: 'diagnostic_workup',
          specificity: 'symptom_only',
          confidence: 0.3,
          expansion_terms: [],
          negative_terms: [],
          anchor_phrases: [],
          likely_subspecialties: []
        };
      }),
    classifyClinicalIntent(userQuery, conversationText, null) // Run in parallel, specialty optional
      .catch(err => {
        console.warn('[Variant] Clinical intent classification failed, using fallback:', err.message);
        return {
          primary_intent: 'general_cardiology_unclear',
          expansion_terms: [],
          negative_terms: [],
          likely_subspecialties: []
        };
      })
  ]);
  
  // Separate queries for two-stage retrieval
  const q_patient = cleanPatientQuery(userQuery);
  
  // Merge expansion terms from both general intent and clinical intent
  // Clinical intent terms are more specific and should take precedence
  const generalExpansionTerms = generalIntentResult.expansion_terms || [];
  const clinicalExpansionTerms = clinicalIntentResult.expansion_terms || [];
  
  // Combine expansion terms: clinical intent terms first (more specific), then general intent terms
  // Deduplicate to avoid repetition
  const allExpansionTerms = [...clinicalExpansionTerms];
  generalExpansionTerms.forEach(term => {
    if (!allExpansionTerms.includes(term)) {
      allExpansionTerms.push(term);
    }
  });
  const intent_terms = allExpansionTerms;
  
  // BM25 uses ONLY q_patient (no safe_lane_terms)
  const safe_lane_terms = [];
  
  // Build enriched query for display/logging (backward compatibility)
  const requiredTerms = extractRequiredTerms(userQuery, insights);
  const enrichedQuery = mergeQueryTerms(requiredTerms, intent_terms);
  
  const processingTime = Date.now() - startTime;
  
  // Merge negative terms: use clinical intent negatives (more specific) if available, otherwise general intent
  // Clinical intent negatives are specialty-specific (e.g., "electrophysiology" for coronary queries)
  // General intent negatives are goal-mode specific (e.g., "counselling" for procedure queries)
  const mergedNegativeTerms = [];
  if (clinicalIntentResult.negative_terms && clinicalIntentResult.negative_terms.length > 0) {
    mergedNegativeTerms.push(...clinicalIntentResult.negative_terms);
  }
  if (generalIntentResult.negative_terms && generalIntentResult.negative_terms.length > 0) {
    generalIntentResult.negative_terms.forEach(term => {
      if (!mergedNegativeTerms.includes(term)) {
        mergedNegativeTerms.push(term);
      }
    });
  }
  
  // Merge likely subspecialties: combine both sources, prioritizing higher confidence
  const mergedSubspecialties = [];
  const subspecialtyMap = new Map(); // Use map to deduplicate by name, keep highest confidence
  [...(clinicalIntentResult.likely_subspecialties || []), ...(generalIntentResult.likely_subspecialties || [])].forEach(sub => {
    if (sub && sub.name && typeof sub.confidence === 'number' && sub.confidence >= 0.4) {
      const existing = subspecialtyMap.get(sub.name.toLowerCase());
      if (!existing || sub.confidence > existing.confidence) {
        subspecialtyMap.set(sub.name.toLowerCase(), sub);
      }
    }
  });
  mergedSubspecialties.push(...Array.from(subspecialtyMap.values()));
  mergedSubspecialties.sort((a, b) => b.confidence - a.confidence); // Sort by confidence descending
  const finalSubspecialties = mergedSubspecialties.slice(0, 3); // Cap at 3
  
  // Format intentData to include both goal/specificity AND clinical intent
  const intentData = {
    // General intent (goal/specificity)
    goal: generalIntentResult.goal,
    specificity: generalIntentResult.specificity,
    confidence: generalIntentResult.confidence,
    // Clinical intent (specialty-specific)
    primary_intent: clinicalIntentResult.primary_intent,
    // Merged data
    negative_terms: mergedNegativeTerms,
    anchor_phrases: generalIntentResult.anchor_phrases || [], // Anchor phrases from general intent
    likely_subspecialties: finalSubspecialties // Merged subspecialties from both sources
  };
  
  return {
    q_patient,
    safe_lane_terms, // Empty - BM25 uses only q_patient
    intent_terms,
    enrichedQuery, // For display/logging (backward compat)
    insights,
    expansionTerms: intent_terms, // For backward compat
    intentData: intentData,
    anchor_phrases: intentData.anchor_phrases, // Also pass separately for easy access
    processingTime
  };
};

// ============================================================================
// VARIANT 5: IDEAL PROFILE GENERATION
// ============================================================================

/**
 * Build system message for ideal doctor profile generation
 */
function buildIdealProfileSystemMessage(specialty, lexicons) {
  let subsList = [];
  if (lexicons && lexicons.subspecialties) {
    if (lexicons.subspecialties.bySpecialty && specialty) {
      subsList = lexicons.subspecialties.bySpecialty[specialty] || lexicons.subspecialties.global || [];
    } else if (lexicons.subspecialties.global) {
      subsList = lexicons.subspecialties.global;
    }
  }
  const subsText = subsList.length > 0
    ? `Subspecialties MUST be chosen from this list (use exact names): ${subsList.slice(0, 80).join(', ')}${subsList.length > 80 ? ' ...' : ''}.`
    : 'Use standard subspecialty names matching common medical terminology.';
  
  const topProcedures = (lexicons && lexicons.procedures) ? lexicons.procedures.slice(0, 100).join(', ') : '';
  const topConditions = (lexicons && lexicons.conditions) ? lexicons.conditions.slice(0, 80).join(', ') : '';
  const preferText = (topProcedures || topConditions)
    ? `When choosing procedures and conditions, prefer terms from practitioner vocabulary. Example procedures: ${topProcedures || 'N/A'}. Example conditions: ${topConditions || 'N/A'}.`
    : '';

  return `You are a medical search system that generates an "ideal doctor profile" based on patient queries. Think holistically about what characteristics the perfect matching doctor would have.

${specialty ? `The user is already in **${specialty}**. Generate an ideal profile within this specialty.` : ''}

${subsText}
${preferText}

Your task: Generate a structured ideal doctor profile that describes what the perfect matching practitioner would look like.

Return ONLY a JSON object:
{
  "subspecialties": [
    {"name": "Electrophysiology", "importance": "required", "confidence": 0.95}
  ],
  "procedures": [
    {"name": "Catheter Ablation", "importance": "required", "confidence": 0.9},
    {"name": "Electrophysiology Studies", "importance": "preferred", "confidence": 0.8}
  ],
  "conditions": [
    {"name": "Supraventricular Tachycardia", "importance": "required", "confidence": 0.9}
  ],
  "clinical_expertise_areas": [
    "Cardiac rhythm disorders",
    "Electrophysiology",
    "Arrhythmia management"
  ],
  "preferred_qualifications": ["FRCP", "MD"],
  "patient_age_group": ["Adults"],
  "languages": [],
  "gender_preference": null,
  "description_keywords": [
    "specializes in electrophysiology",
    "expertise in arrhythmia",
    "focuses on cardiac rhythm disorders"
  ],
  "avoid_subspecialties": ["Interventional Cardiology"],
  "avoid_procedures": ["Coronary Angiography"],
  "reasoning": "Brief explanation of why this profile matches the query"
}

Rules:
1. **subspecialties**: 0-3 subspecialties with importance ("required" | "preferred" | "optional") and confidence (0.0-1.0). Use exact names from the subspecialty list above when possible.
2. **procedures**: 2-6 procedures the ideal doctor should perform. Use exact names from procedure vocabulary when possible. Mark as "required" if explicitly mentioned, "preferred" if strongly implied.
3. **conditions**: 1-4 conditions the ideal doctor should treat. Use exact names from condition vocabulary when possible.
4. **clinical_expertise_areas**: 2-5 free-form areas describing clinical focus (e.g., "Cardiac rhythm disorders").
5. **preferred_qualifications**: Optional array of qualifications (e.g., ["FRCP", "MD"]) if mentioned or strongly implied.
6. **patient_age_group**: Optional array (["Adults"] | ["Children"] | ["Adults", "Children"]) if mentioned.
7. **languages**: Optional array of languages if mentioned (e.g., ["Cantonese", "English"]).
8. **gender_preference**: Optional ("Male" | "Female" | null) if mentioned.
9. **description_keywords**: 2-5 phrases/keywords that should appear in the doctor's description/about text.
10. **avoid_subspecialties**: 0-3 subspecialties that would NOT be a good fit (wrong lane).
11. **avoid_procedures**: 0-3 procedures that indicate wrong specialty/subspecialty.
12. **reasoning**: Brief explanation (1-2 sentences) of why this profile matches the query.

Importance levels:
- "required": Must have this characteristic (explicitly mentioned or absolutely necessary)
- "preferred": Strongly preferred but not absolutely required
- "optional": Nice to have but not critical

Be specific and match how practitioners are actually described in profiles (subspecialties, procedure_groups, clinical_expertise).`;
}

/**
 * Generate ideal doctor profile using advanced model (GPT-5.1)
 * @param {string} userQuery - Patient query
 * @param {Array} messages - Conversation history
 * @param {string|null} specialty - Known specialty (if any)
 * @param {Object} options - { lexiconsDir, model }
 * @returns {Promise<Object>} Ideal profile structure
 */
async function generateIdealDoctorProfile(userQuery, messages, specialty, options = {}) {
  const model = options.model || 'gpt-5.1'; // Use GPT-5.1 by default for best reasoning
  const lexiconsDir = options.lexiconsDir || null;
  const lexicons = lexiconsDir ? loadLexicons(lexiconsDir) : null;
  
  const systemMessage = buildIdealProfileSystemMessage(specialty || null, lexicons);
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  
  const userMessage = `Query: "${userQuery}"${conversationText ? `\n\nConversation context:\n${conversationText.slice(-1000)}` : ''}`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
      max_completion_tokens: 600, // More tokens for structured profile
      response_format: { type: "json_object" }
    });

    const content = stripMarkdownCodeBlocks(response.choices[0].message.content);
    const idealProfile = JSON.parse(content);
    
    // Validate and normalize structure
    if (!idealProfile.subspecialties) idealProfile.subspecialties = [];
    if (!idealProfile.procedures) idealProfile.procedures = [];
    if (!idealProfile.conditions) idealProfile.conditions = [];
    if (!idealProfile.clinical_expertise_areas) idealProfile.clinical_expertise_areas = [];
    if (!idealProfile.description_keywords) idealProfile.description_keywords = [];
    if (!idealProfile.avoid_subspecialties) idealProfile.avoid_subspecialties = [];
    if (!idealProfile.avoid_procedures) idealProfile.avoid_procedures = [];
    
    // Ensure importance values are valid
    ['subspecialties', 'procedures', 'conditions'].forEach(key => {
      if (Array.isArray(idealProfile[key])) {
        idealProfile[key] = idealProfile[key].map(item => {
          if (item && typeof item === 'object') {
            if (!['required', 'preferred', 'optional'].includes(item.importance)) {
              item.importance = 'preferred';
            }
            if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) {
              item.confidence = 0.8;
            }
          }
          return item;
        });
      }
    });
    
    return idealProfile;
  } catch (error) {
    console.error('[V5] Ideal profile generation failed:', error);
    // Fallback: return minimal profile
    return {
      subspecialties: [],
      procedures: [],
      conditions: [],
      clinical_expertise_areas: [],
      preferred_qualifications: [],
      patient_age_group: [],
      languages: [],
      gender_preference: null,
      description_keywords: [],
      avoid_subspecialties: [],
      avoid_procedures: [],
      reasoning: 'Profile generation failed'
    };
  }
}

/**
 * Convert ideal profile to BM25 query (hybrid: natural language + structured terms)
 */
function idealProfileToBM25Query(idealProfile) {
  const parts = [];
  
  // Natural language description
  const naturalParts = [];
  if (idealProfile.subspecialties && idealProfile.subspecialties.length > 0) {
    const requiredSubs = idealProfile.subspecialties
      .filter(s => s.importance === 'required')
      .map(s => s.name);
    if (requiredSubs.length > 0) {
      naturalParts.push(`${requiredSubs.join(' and ')} specialist`);
    }
  }
  
  if (idealProfile.procedures && idealProfile.procedures.length > 0) {
    const requiredProcs = idealProfile.procedures
      .filter(p => p.importance === 'required')
      .map(p => p.name);
    if (requiredProcs.length > 0) {
      naturalParts.push(`who performs ${requiredProcs.join(' and ')}`);
    }
  }
  
  if (idealProfile.conditions && idealProfile.conditions.length > 0) {
    const requiredConds = idealProfile.conditions
      .filter(c => c.importance === 'required')
      .map(c => c.name);
    if (requiredConds.length > 0) {
      naturalParts.push(`specializes in ${requiredConds.join(' and ')}`);
    }
  }
  
  if (idealProfile.clinical_expertise_areas && idealProfile.clinical_expertise_areas.length > 0) {
    naturalParts.push(`with expertise in ${idealProfile.clinical_expertise_areas.slice(0, 3).join(', ')}`);
  }
  
  if (naturalParts.length > 0) {
    parts.push(naturalParts.join(', '));
  }
  
  // Structured terms (for BM25 field matching)
  const structuredTerms = [];
  
  // Required subspecialties (high weight)
  if (idealProfile.subspecialties) {
    idealProfile.subspecialties
      .filter(s => s.importance === 'required')
      .forEach(s => structuredTerms.push(s.name));
  }
  
  // Required procedures (high weight)
  if (idealProfile.procedures) {
    idealProfile.procedures
      .filter(p => p.importance === 'required')
      .forEach(p => structuredTerms.push(p.name));
  }
  
  // Required conditions
  if (idealProfile.conditions) {
    idealProfile.conditions
      .filter(c => c.importance === 'required')
      .forEach(c => structuredTerms.push(c.name));
  }
  
  // Preferred subspecialties and procedures
  if (idealProfile.subspecialties) {
    idealProfile.subspecialties
      .filter(s => s.importance === 'preferred')
      .slice(0, 2)
      .forEach(s => structuredTerms.push(s.name));
  }
  
  if (idealProfile.procedures) {
    idealProfile.procedures
      .filter(p => p.importance === 'preferred')
      .slice(0, 3)
      .forEach(p => structuredTerms.push(p.name));
  }
  
  // Clinical expertise areas
  if (idealProfile.clinical_expertise_areas) {
    structuredTerms.push(...idealProfile.clinical_expertise_areas.slice(0, 3));
  }
  
  if (structuredTerms.length > 0) {
    parts.push(structuredTerms.join(' '));
  }
  
  return parts.join(' ').trim();
}

/**
 * Extract structured terms from ideal profile for backward compatibility
 */
function idealProfileToIntentTerms(idealProfile) {
  const terms = [];
  
  // Subspecialties
  if (idealProfile.subspecialties) {
    idealProfile.subspecialties.forEach(s => {
      if (s.name) terms.push(s.name.toLowerCase());
    });
  }
  
  // Procedures
  if (idealProfile.procedures) {
    idealProfile.procedures.forEach(p => {
      if (p.name) terms.push(p.name.toLowerCase());
    });
  }
  
  // Conditions
  if (idealProfile.conditions) {
    idealProfile.conditions.forEach(c => {
      if (c.name) terms.push(c.name.toLowerCase());
    });
  }
  
  // Clinical expertise areas
  if (idealProfile.clinical_expertise_areas) {
    idealProfile.clinical_expertise_areas.forEach(area => {
      const words = area.toLowerCase().split(/\s+/);
      terms.push(...words.filter(w => w.length > 3));
    });
  }
  
  return [...new Set(terms)]; // Deduplicate
}

/**
 * Extract anchor phrases from ideal profile
 */
function idealProfileToAnchorPhrases(idealProfile) {
  const anchors = [];
  
  // Required procedures and conditions are anchor phrases
  if (idealProfile.procedures) {
    idealProfile.procedures
      .filter(p => p.importance === 'required')
      .forEach(p => anchors.push(p.name));
  }
  
  if (idealProfile.conditions) {
    idealProfile.conditions
      .filter(c => c.importance === 'required')
      .forEach(c => anchors.push(c.name));
  }
  
  // Required subspecialties
  if (idealProfile.subspecialties) {
    idealProfile.subspecialties
      .filter(s => s.importance === 'required')
      .forEach(s => anchors.push(s.name));
  }
  
  return anchors.slice(0, 5); // Cap at 5
}

/**
 * Session context V5: Generate ideal doctor profile and convert to session context format
 */
async function getSessionContextV5(userQuery, messages, location, options = {}) {
  const startTime = Date.now();
  const specialty = options.specialty || null;
  const lexiconsDir = options.lexiconsDir || null;
  const model = options.model || 'gpt-5.1';
  
  // Generate ideal profile
  const idealProfile = await generateIdealDoctorProfile(userQuery, messages, specialty, {
    lexiconsDir,
    model
  });
  
  // Extract insights (still useful for urgency, preferences, etc.)
  const insights = await extractInsightsWithAI(messages, model).catch(() => ({
    symptoms: [],
    preferences: [],
    urgency: 'routine',
    specialty: specialty || null,
    location: location || null,
    summary: 'Analysis failed'
  }));
  
  // Convert ideal profile to BM25 query
  const q_patient = cleanPatientQuery(userQuery);
  const q_ideal_profile = idealProfileToBM25Query(idealProfile);
  
  // Log ideal profile generation for debugging
  console.log('[V5] Ideal profile generated:', {
    subspecialties: idealProfile.subspecialties?.length || 0,
    procedures: idealProfile.procedures?.length || 0,
    conditions: idealProfile.conditions?.length || 0,
    q_ideal_profile_length: q_ideal_profile.length,
    q_ideal_profile_preview: q_ideal_profile.substring(0, 150)
  });
  
  // Extract intent terms and anchor phrases for backward compatibility
  const intent_terms = idealProfileToIntentTerms(idealProfile);
  const anchor_phrases = idealProfileToAnchorPhrases(idealProfile);
  
  // Extract safe lane terms (symptom/condition oriented)
  const safe_lane_terms = extractSafeLaneTerms(intent_terms, 4);
  
  // Build enriched query for display/logging
  const requiredTerms = extractRequiredTerms(userQuery, insights);
  const enrichedQuery = mergeQueryTerms(requiredTerms, intent_terms);
  
  const processingTime = Date.now() - startTime;
  
  // Build intentData structure (backward compatible)
  const intentData = {
    goal: 'ideal_profile_match', // V5 specific
    specificity: idealProfile.subspecialties?.some(s => s.importance === 'required') ? 'named_procedure' : 'symptom_only',
    confidence: idealProfile.subspecialties?.length > 0 
      ? Math.max(...idealProfile.subspecialties.map(s => s.confidence || 0.8))
      : 0.7,
    primary_intent: 'ideal_profile_match',
    negative_terms: [
      ...(idealProfile.avoid_subspecialties || []),
      ...(idealProfile.avoid_procedures || [])
    ],
    anchor_phrases,
    likely_subspecialties: (idealProfile.subspecialties || []).map(s => ({
      name: s.name,
      confidence: s.confidence || 0.8
    })).slice(0, 3),
    idealProfile, // Store full ideal profile for Stage B matching
    isQueryAmbiguous: !idealProfile.subspecialties?.some(s => s.importance === 'required')
  };
  
  // Use ideal profile query, but fallback to original query if empty
  const final_q_patient = (q_ideal_profile && q_ideal_profile.trim().length > 0) 
    ? q_ideal_profile 
    : q_patient;
  
  if (!q_ideal_profile || q_ideal_profile.trim().length === 0) {
    console.warn('[V5] WARNING: Ideal profile query is empty, using original query:', q_patient);
  }
  
  return {
    q_patient: final_q_patient, // Use ideal profile query if available, fallback to clean query
    q_patient_original: q_patient, // Keep original for reference
    safe_lane_terms,
    intent_terms,
    enrichedQuery,
    insights,
    expansionTerms: intent_terms,
    intentData,
    anchor_phrases,
    idealProfile, // Full ideal profile for Stage B
    processingTime,
    variantName: 'v5'
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getSessionContextAlgorithmic,
  getSessionContextSequential,
  getSessionContextParallel,
  getSessionContextParallelV2,
  getSessionContextParallelGeneralGoalSpecificity,
  getSessionContextV5,
  classifyClinicalIntent,
  classifyClinicalIntentWithOptions,
  loadLexicons,
  generateIdealDoctorProfile,
  idealProfileToBM25Query,
  idealProfileToIntentTerms,
  idealProfileToAnchorPhrases,
};
