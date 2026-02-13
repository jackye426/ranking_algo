# V5 Ideal Profile Generation: Prompt Guidelines & Structure

## Why GPT-5.1 Instead of GPT-4o?

**Default changed from GPT-4o to GPT-5.1** because:
- **Better reasoning**: GPT-5.1 has superior reasoning capabilities for holistic understanding
- **Structured output**: Better at generating complex structured JSON with relationships
- **Medical domain**: Improved medical knowledge and terminology understanding
- **Future-proof**: GPT-5.1 is the latest model, designed for complex reasoning tasks

**Note**: If GPT-5.1 is not available, the system will fall back gracefully. You can override with `model: 'gpt-4o'` or `model: 'gpt-4o-mini'` if needed.

---

## Prompt Structure

### System Message Components

The system message (`buildIdealProfileSystemMessage`) consists of:

1. **Role Definition**: "You are a medical search system that generates an 'ideal doctor profile'..."
2. **Specialty Context**: If specialty is known, adds context: "The user is already in **{specialty}**..."
3. **Lexicon Injection**: 
   - Subspecialties list (up to 80 shown)
   - Procedures vocabulary (up to 100 shown)
   - Conditions vocabulary (up to 80 shown)
4. **Task Definition**: "Generate a structured ideal doctor profile..."
5. **JSON Schema**: Complete example JSON structure
6. **Rules**: 12 detailed rules for each field
7. **Importance Levels**: Explanation of required/preferred/optional

### User Message Format

```
Query: "{userQuery}"

Conversation context:
{last 1000 characters of conversation}
```

**Token limits**:
- Conversation context: **Last 1000 characters** (to stay within context window)
- System message: ~2000-3000 tokens (depends on lexicon size)
- User message: ~50-200 tokens (query + truncated conversation)

---

## JSON Schema & Structure

### Complete Schema

```json
{
  "subspecialties": [
    {
      "name": "Electrophysiology",
      "importance": "required" | "preferred" | "optional",
      "confidence": 0.0-1.0
    }
  ],
  "procedures": [
    {
      "name": "Catheter Ablation",
      "importance": "required" | "preferred" | "optional",
      "confidence": 0.0-1.0
    }
  ],
  "conditions": [
    {
      "name": "Supraventricular Tachycardia",
      "importance": "required" | "preferred" | "optional",
      "confidence": 0.0-1.0
    }
  ],
  "clinical_expertise_areas": [
    "Cardiac rhythm disorders",
    "Electrophysiology"
  ],
  "preferred_qualifications": ["FRCP", "MD"],
  "patient_age_group": ["Adults"] | ["Children"] | ["Adults", "Children"],
  "languages": ["Cantonese", "English"],
  "gender_preference": "Male" | "Female" | null,
  "description_keywords": [
    "specializes in electrophysiology",
    "expertise in arrhythmia"
  ],
  "avoid_subspecialties": ["Interventional Cardiology"],
  "avoid_procedures": ["Coronary Angiography"],
  "reasoning": "Brief explanation..."
}
```

---

## Field Rules & Guidelines

### 1. Subspecialties (0-3 items)

**Rules**:
- Use exact names from lexicon when available
- Importance: "required" if explicitly mentioned or absolutely necessary
- Confidence: 0.9+ for required, 0.7-0.9 for preferred, 0.5-0.7 for optional

**Example**:
```json
[
  {"name": "Electrophysiology", "importance": "required", "confidence": 0.95},
  {"name": "General Cardiology", "importance": "preferred", "confidence": 0.7}
]
```

### 2. Procedures (2-6 items)

**Rules**:
- Use exact names from procedure vocabulary when possible
- "required" if explicitly mentioned in query
- "preferred" if strongly implied
- Include procedure variants (e.g., "Catheter Ablation" and "SVT Ablation")

**Example**:
```json
[
  {"name": "Catheter Ablation", "importance": "required", "confidence": 0.9},
  {"name": "Electrophysiology Studies", "importance": "preferred", "confidence": 0.8}
]
```

### 3. Conditions (1-4 items)

**Rules**:
- Use exact names from condition vocabulary when possible
- "required" if explicitly mentioned
- Include condition synonyms if relevant

**Example**:
```json
[
  {"name": "Supraventricular Tachycardia", "importance": "required", "confidence": 0.9},
  {"name": "Arrhythmia", "importance": "preferred", "confidence": 0.75}
]
```

### 4. Clinical Expertise Areas (2-5 items)

**Rules**:
- Free-form text describing clinical focus
- Should match how doctors describe their expertise
- Examples: "Cardiac rhythm disorders", "Electrophysiology", "Arrhythmia management"

### 5. Preferred Qualifications (0-3 items)

**Rules**:
- Only include if mentioned or strongly implied
- Examples: ["FRCP", "MD", "PhD"]
- Use standard qualification abbreviations

### 6. Patient Age Group (0-1 array)

**Rules**:
- Only include if mentioned
- Options: ["Adults"], ["Children"], ["Adults", "Children"]
- Critical for paediatric vs adult matching

### 7. Languages (0-3 items)

**Rules**:
- Only include if mentioned
- Examples: ["Cantonese", "English", "Mandarin"]
- Use standard language names

### 8. Gender Preference (null or string)

**Rules**:
- Only include if explicitly mentioned
- Options: "Male", "Female", or null
- Example: "I need a female cardiologist" → "Female"

### 9. Description Keywords (2-5 items)

**Rules**:
- Phrases/keywords that should appear in doctor's description/about text
- Should match natural language descriptions
- Examples: "specializes in electrophysiology", "expertise in arrhythmia"

### 10. Avoid Subspecialties (0-3 items)

**Rules**:
- Subspecialties that would NOT be a good fit
- Used for negative matching in Stage B
- Example: Query for "SVT ablation" → avoid ["Interventional Cardiology"]

### 11. Avoid Procedures (0-3 items)

**Rules**:
- Procedures that indicate wrong specialty/subspecialty
- Used for negative matching
- Example: Query for "arrhythmia" → avoid ["Coronary Angiography"]

### 12. Reasoning (string)

**Rules**:
- Brief explanation (1-2 sentences)
- Explains why this profile matches the query
- Useful for debugging and understanding model decisions

---

## Examples Provided in Prompt

The prompt includes **one complete example** showing:

**Query**: "I need SVT ablation"

**Ideal Profile**:
```json
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
  "reasoning": "Patient needs SVT ablation, which requires an electrophysiologist..."
}
```

**Note**: The prompt uses **one example** (not few-shot) because:
- GPT-5.1 is strong enough to understand from structure + rules
- More examples would increase token usage
- The JSON schema + rules provide sufficient guidance

---

## Token Limits & Configuration

### Model Configuration

```javascript
{
  model: 'gpt-5.1', // Default
  temperature: 0.2, // Low for consistent structured output
  max_completion_tokens: 600, // Enough for full profile
  response_format: { type: "json_object" } // Enforce JSON
}
```

### Token Breakdown (Approximate)

- **System message**: ~2000-3000 tokens
  - Base prompt: ~500 tokens
  - Lexicons (if provided): ~1500-2500 tokens
    - Subspecialties (80): ~400 tokens
    - Procedures (100): ~800 tokens
    - Conditions (80): ~600 tokens
  
- **User message**: ~50-200 tokens
  - Query: ~20-50 tokens
  - Conversation context (last 1000 chars): ~150-200 tokens

- **Completion**: ~400-600 tokens
  - Full ideal profile: ~400-500 tokens
  - Reasoning: ~50-100 tokens

**Total per request**: ~2500-3800 tokens

### Why 600 max_completion_tokens?

- Full ideal profile typically needs ~400-500 tokens
- Reasoning adds ~50-100 tokens
- Buffer for edge cases
- Prevents truncation of important fields

---

## Lexicon Integration

### When Lexicons Are Provided

If `lexiconsDir` is provided, the prompt includes:

1. **Subspecialties list**: "Subspecialties MUST be chosen from this list (use exact names): [list]"
2. **Procedures vocabulary**: "Example procedures: [list]"
3. **Conditions vocabulary**: "Example conditions: [list]"

**Benefits**:
- Ensures outputs match actual practitioner data
- Reduces hallucination of non-existent subspecialties/procedures
- Improves matching accuracy in Stage B

### Lexicon Format

Expected files in `lexiconsDir`:
- `subspecialties-from-data.json`: `{ global: [...], bySpecialty: { "Cardiology": [...] } }`
- `procedures-from-data.json`: `{ procedures: [...] }`
- `conditions-from-data.json`: `{ conditions: [...] }`

---

## Importance Levels Explained

### "required"
- **When**: Explicitly mentioned OR absolutely necessary for the query
- **Example**: Query "I need SVT ablation" → Electrophysiology subspecialty is REQUIRED
- **Matching weight**: +5.0 (subspecialties), +4.0 (procedures), +3.0 (conditions)
- **Penalty**: -2.0 if missing required subspecialty

### "preferred"
- **When**: Strongly implied but not explicitly mentioned
- **Example**: Query "arrhythmia" → Electrophysiology is PREFERRED (could also see general cardiologist)
- **Matching weight**: +3.0 (subspecialties), +2.0 (procedures), +1.5 (conditions)
- **No penalty**: Missing preferred items doesn't penalize

### "optional"
- **When**: Nice to have but not critical
- **Example**: Query "cardiac checkup" → Various subspecialties are OPTIONAL
- **Matching weight**: +1.0 (subspecialties), +0.5 (procedures)
- **No penalty**: Missing optional items doesn't matter

---

## Validation & Normalization

After generation, the code validates and normalizes:

1. **Missing arrays**: Defaults to `[]` if missing
2. **Invalid importance**: Converts to "preferred" if not in ["required", "preferred", "optional"]
3. **Invalid confidence**: Clamps to 0.0-1.0, defaults to 0.8 if invalid
4. **Type checking**: Ensures arrays are arrays, strings are strings, etc.

---

## Error Handling

### Fallback Profile

If generation fails, returns minimal profile:
```json
{
  "subspecialties": [],
  "procedures": [],
  "conditions": [],
  "clinical_expertise_areas": [],
  "preferred_qualifications": [],
  "patient_age_group": [],
  "languages": [],
  "gender_preference": null,
  "description_keywords": [],
  "avoid_subspecialties": [],
  "avoid_procedures": [],
  "reasoning": "Profile generation failed"
}
```

This ensures the system continues to work even if AI call fails.

---

## Why This Approach Works

1. **Structured Output**: JSON schema + `response_format: "json_object"` ensures consistent structure
2. **Lexicon Alignment**: Using actual practitioner vocabulary improves matching
3. **Importance Weighting**: Required vs preferred vs optional enables nuanced matching
4. **Holistic Understanding**: Single model call reasons about entire profile, not just terms
5. **Negative Matching**: Explicit "avoid" elements improve precision

---

## Future Improvements

Potential enhancements:
1. **Few-shot examples**: Add 2-3 complete examples for complex queries
2. **Dynamic token limits**: Adjust based on query complexity
3. **Multi-turn refinement**: Allow model to refine profile based on initial results
4. **Confidence calibration**: Better confidence scoring based on query clarity
