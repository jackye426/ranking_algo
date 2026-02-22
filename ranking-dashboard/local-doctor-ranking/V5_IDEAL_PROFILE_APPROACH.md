# V5: Ideal Doctor Profile Approach

## Concept Overview

Instead of parsing/processing the query to extract terms, V5 uses an **advanced model** (e.g., GPT-4o) to generate a structured **"ideal doctor profile"** that describes what the perfect match would look like. This ideal profile is then used to drive both Stage A (BM25 retrieval) and Stage B (rescoring/matching).

---

## Current Approach (V1-V4) vs V5

### Current: Query → Parse → Extract Terms → Match Terms

```
Query: "I need SVT ablation"
    ↓
Parse query → Extract terms:
  - intent_terms: ["arrhythmia", "electrophysiology", ...]
  - anchor_phrases: ["SVT ablation"]
  - negative_terms: [...]
    ↓
Stage A: BM25("I need SVT ablation" + safe_lane_terms)
Stage B: Rescore by counting term matches
```

**Limitations:**
- Terms are extracted independently
- No holistic understanding of what makes a "good fit"
- Matching is term-based, not profile-based

### V5: Query → Generate Ideal Profile → Match Profiles

```
Query: "I need SVT ablation"
    ↓
Generate ideal doctor profile:
  {
    subspecialties: ["Electrophysiology"],
    procedures: ["Catheter Ablation", "SVT Ablation", "Electrophysiology Studies"],
    conditions: ["Supraventricular Tachycardia", "Arrhythmia"],
    clinical_expertise_areas: ["Cardiac rhythm disorders", "Electrophysiology"],
    preferred_qualifications: ["FRCP", "MD"],
    patient_age_group: ["Adults"],
    description_keywords: ["specializes in", "expertise in", "focuses on"]
  }
    ↓
Stage A: BM25(ideal_profile_description)
Stage B: Match actual profiles against ideal profile (semantic/structure matching)
```

**Benefits:**
- Holistic understanding of "ideal fit"
- Can capture nuanced requirements (qualifications, patient age, etc.)
- Profile-to-profile matching (more natural)
- Can leverage advanced models' reasoning about "what makes a good match"

---

## Implementation Architecture

### Phase 1: Ideal Profile Generation

**Function**: `generateIdealDoctorProfile(userQuery, messages, specialty, options)`

**Model**: GPT-4o (or GPT-4o-mini with structured output)

**Input**:
```javascript
{
  userQuery: "I need SVT ablation",
  messages: [...], // Full conversation
  specialty: "Cardiology", // If known
  lexicons: { // From Phase 1 of V2
    subspecialties: [...],
    procedures: [...],
    conditions: [...]
  }
}
```

**Output Schema**:
```javascript
{
  // Core clinical matching
  subspecialties: [
    { name: "Electrophysiology", importance: "required" | "preferred" | "optional", confidence: 0.9 }
  ],
  procedures: [
    { name: "Catheter Ablation", importance: "required", confidence: 0.95 },
    { name: "Electrophysiology Studies", importance: "preferred", confidence: 0.8 }
  ],
  conditions: [
    { name: "Supraventricular Tachycardia", importance: "required", confidence: 0.9 }
  ],
  
  // Clinical expertise areas (free-form)
  clinical_expertise_areas: [
    "Cardiac rhythm disorders",
    "Electrophysiology",
    "Arrhythmia management"
  ],
  
  // Profile characteristics
  preferred_qualifications: ["FRCP", "MD"], // Optional
  patient_age_group: ["Adults"], // Optional
  languages: [], // Optional
  gender_preference: null, // Optional
  
  // Description keywords/phrases that should appear
  description_keywords: [
    "specializes in",
    "expertise in electrophysiology",
    "focuses on arrhythmia"
  ],
  
  // What to avoid (negative profile elements)
  avoid_subspecialties: ["Interventional Cardiology"],
  avoid_procedures: ["Coronary Angiography"],
  
  // Reasoning (for debugging)
  reasoning: "Patient needs SVT ablation, which requires an electrophysiologist..."
}
```

**Prompt Strategy**:
- Use lexicons (subspecialties, procedures, conditions) to constrain outputs
- Instruct model to think: "What would the ideal doctor profile look like?"
- Include few-shot examples showing ideal profiles for different query types
- Emphasize matching against actual profile structure (subspecialties, procedure_groups, clinical_expertise)

---

### Phase 2: Stage A - BM25 with Ideal Profile

**Current**: BM25 uses `q_patient` + `safe_lane_terms` + `anchor_phrases`

**V5**: BM25 uses **ideal profile description**

**Approach Options**:

#### Option A: Generate Natural Language Description
Convert ideal profile to natural language:
```
"Electrophysiology specialist who performs catheter ablation and SVT ablation procedures, 
specializes in cardiac rhythm disorders and arrhythmia management, 
with expertise in supraventricular tachycardia. Preferred qualifications: FRCP, MD."
```

Use this as BM25 query (instead of `q_patient`).

**Pros**: Natural language works well with BM25
**Cons**: Loses structured information

#### Option B: Structured Query Expansion
Extract key terms from ideal profile:
- Required subspecialties
- Required procedures
- Required conditions
- Clinical expertise areas
- Description keywords

Build BM25 query as weighted combination:
```
q_bm25 = [
  ...required_subspecialties (weight: 3.0),
  ...required_procedures (weight: 2.8),
  ...required_conditions (weight: 2.0),
  ...clinical_expertise_areas (weight: 1.5),
  ...description_keywords (weight: 1.0)
].join(' ')
```

**Pros**: Leverages existing BM25 field weights
**Cons**: Still term-based (but better terms)

#### Option C: Hybrid Approach (Recommended)
1. Generate natural language ideal profile description
2. Extract structured terms from ideal profile
3. BM25 query = natural description + structured terms (with field-specific weighting)

```javascript
const idealProfileDescription = generateNaturalLanguageProfile(idealProfile);
const structuredTerms = extractStructuredTerms(idealProfile);
const q_bm25 = `${idealProfileDescription} ${structuredTerms.subspecialties.join(' ')} ${structuredTerms.procedures.join(' ')}`;
```

---

### Phase 3: Stage B - Profile-to-Profile Matching

**Current**: Count term matches (intent_terms, anchor_phrases, etc.)

**V5**: Match actual profile against ideal profile using structured matching

**Matching Strategy**:

```javascript
function matchProfileAgainstIdeal(actualProfile, idealProfile) {
  let score = 0;
  
  // 1. Subspecialty matching (weighted by importance)
  for (const idealSub of idealProfile.subspecialties) {
    const match = actualProfile.subspecialties.some(
      sub => sub.toLowerCase() === idealSub.name.toLowerCase()
    );
    if (match) {
      if (idealSub.importance === 'required') score += 5.0;
      else if (idealSub.importance === 'preferred') score += 3.0;
      else score += 1.0;
    } else if (idealSub.importance === 'required') {
      score -= 2.0; // Penalty for missing required
    }
  }
  
  // 2. Procedure matching (weighted by importance)
  const actualProcedures = extractProcedures(actualProfile);
  for (const idealProc of idealProfile.procedures) {
    const match = actualProcedures.some(
      proc => fuzzyMatch(proc, idealProc.name)
    );
    if (match) {
      if (idealProc.importance === 'required') score += 4.0;
      else if (idealProc.importance === 'preferred') score += 2.0;
      else score += 0.5;
    }
  }
  
  // 3. Condition matching
  const actualConditions = extractConditions(actualProfile);
  for (const idealCond of idealProfile.conditions) {
    const match = actualConditions.some(
      cond => fuzzyMatch(cond, idealCond.name)
    );
    if (match) {
      score += idealCond.importance === 'required' ? 3.0 : 1.5;
    }
  }
  
  // 4. Clinical expertise area matching (semantic)
  const actualExpertise = actualProfile.clinical_expertise || '';
  for (const area of idealProfile.clinical_expertise_areas) {
    if (actualExpertise.toLowerCase().includes(area.toLowerCase())) {
      score += 2.0;
    }
  }
  
  // 5. Description keyword matching
  const description = (actualProfile.description || actualProfile.about || '').toLowerCase();
  for (const keyword of idealProfile.description_keywords) {
    if (description.includes(keyword.toLowerCase())) {
      score += 1.0;
    }
  }
  
  // 6. Negative matching (avoid elements)
  for (const avoidSub of idealProfile.avoid_subspecialties || []) {
    if (actualProfile.subspecialties.some(s => s.toLowerCase() === avoidSub.toLowerCase())) {
      score -= 3.0;
    }
  }
  
  // 7. Optional preferences (qualifications, age group, etc.)
  if (idealProfile.preferred_qualifications?.length > 0) {
    const hasQual = actualProfile.qualifications?.some(q => 
      idealProfile.preferred_qualifications.includes(q)
    );
    if (hasQual) score += 1.0;
  }
  
  if (idealProfile.patient_age_group?.length > 0) {
    const matchesAge = idealProfile.patient_age_group.some(age =>
      actualProfile.patient_age_group?.includes(age)
    );
    if (matchesAge) score += 1.5;
  }
  
  return score;
}
```

**Key Differences from Current Approach**:
- **Structured matching**: Matches against profile structure (subspecialties, procedures, conditions) rather than just counting term occurrences
- **Importance weighting**: Required vs preferred vs optional elements
- **Semantic matching**: Clinical expertise areas matched semantically
- **Negative matching**: Explicit "avoid" elements
- **Optional preferences**: Qualifications, age group, etc.

---

## Advantages of V5 Approach

### 1. Holistic Understanding
- Model reasons about "what makes a good fit" holistically
- Captures relationships between requirements (e.g., SVT ablation → needs EP specialist → needs ablation procedures)

### 2. Better Handling of Complex Queries
- "I need a female cardiologist who speaks Cantonese and specializes in arrhythmia"
  - Current: Might miss language/gender requirements
  - V5: Explicitly captures language, gender, and clinical requirements

### 3. Profile-to-Profile Matching
- More natural than term counting
- Can leverage structured profile data (subspecialties, procedure_groups)
- Better alignment with how profiles are actually structured

### 4. Captures Nuanced Requirements
- Qualifications (FRCP, MD)
- Patient age group (paediatric vs adult)
- Languages
- Gender preferences
- Hospital affiliations

### 5. Better Negative Matching
- Explicit "avoid" elements in ideal profile
- More precise than negative_terms list

---

## Implementation Plan

### Step 1: Ideal Profile Generation Function
- Create `generateIdealDoctorProfile()` function
- Use GPT-4o with structured output
- Inject lexicons (subspecialties, procedures, conditions)
- Add few-shot examples
- Return structured ideal profile

### Step 2: Stage A Integration
- Modify `getBM25Shortlist()` to accept ideal profile
- Generate BM25 query from ideal profile (hybrid approach)
- Test retrieval quality vs current approach

### Step 3: Stage B Integration
- Create `matchProfileAgainstIdeal()` function
- Replace term-counting rescoring with profile matching
- Tune matching weights
- Test ranking quality

### Step 4: Session Context V5
- Create `getSessionContextV5()` function
- Single AI call: generate ideal profile
- Return ideal profile structure
- Backward compatible with existing filters structure

### Step 5: Evaluation
- Compare V5 vs V2/V4 on benchmark
- Metrics: NDCG@12, Recall@12, MRR, Excellent Fit Top 3
- Analyze where V5 improves/degrades

---

## Open Questions

1. **Model Choice**: GPT-4o vs GPT-4o-mini?
   - GPT-4o: Better reasoning, more expensive
   - GPT-4o-mini: Faster, cheaper, might be sufficient

2. **Stage A Query Format**: Natural language vs structured terms vs hybrid?
   - Need to test which works best with BM25

3. **Matching Weights**: How to weight required vs preferred vs optional?
   - Start with reasonable defaults, tune via evaluation

4. **Performance**: Single AI call (ideal profile) vs current (3 parallel calls)?
   - V5: 1 call (slower model) vs V2: 3 calls (faster model)
   - Need to measure latency impact

5. **Backward Compatibility**: Can V5 coexist with V2/V4?
   - Yes, via `variantName: 'v5'` flag

---

## Example: V5 Flow

### Query: "I need SVT ablation"

#### Step 1: Generate Ideal Profile
```javascript
{
  subspecialties: [
    { name: "Electrophysiology", importance: "required", confidence: 0.95 }
  ],
  procedures: [
    { name: "Catheter Ablation", importance: "required", confidence: 0.9 },
    { name: "SVT Ablation", importance: "required", confidence: 0.95 }
  ],
  conditions: [
    { name: "Supraventricular Tachycardia", importance: "required", confidence: 0.9 }
  ],
  clinical_expertise_areas: [
    "Cardiac rhythm disorders",
    "Electrophysiology",
    "Arrhythmia management"
  ],
  avoid_subspecialties: ["Interventional Cardiology"],
  avoid_procedures: ["Coronary Angiography"]
}
```

#### Step 2: Stage A BM25
```javascript
q_bm25 = "Electrophysiology specialist who performs catheter ablation and SVT ablation procedures, 
          specializes in cardiac rhythm disorders and arrhythmia management, 
          with expertise in supraventricular tachycardia. 
          Electrophysiology Catheter Ablation SVT Ablation Supraventricular Tachycardia"
```

#### Step 3: Stage B Matching
For each practitioner in Stage A top 50:
- Match subspecialties: "Electrophysiology" → +5.0 (required)
- Match procedures: "Catheter Ablation" → +4.0 (required)
- Match conditions: "Supraventricular Tachycardia" → +3.0 (required)
- Avoid check: "Interventional Cardiology" → -3.0 if present
- Final score = BM25_score + profile_match_score

---

## Next Steps

1. **Prototype ideal profile generation** (single function)
2. **Test ideal profile quality** (manual review of outputs)
3. **Implement Stage A integration** (BM25 with ideal profile)
4. **Implement Stage B matching** (profile-to-profile matching)
5. **Benchmark V5 vs V2/V4**
6. **Iterate based on results**

---

## Related Files

- `session-context-variants.js` - Current session context generation
- `local-bm25-service.js` - BM25 retrieval and rescoring
- `V2_RANKING_AND_CLINICAL_INTENT_PLAN.md` - V2 approach (for comparison)
