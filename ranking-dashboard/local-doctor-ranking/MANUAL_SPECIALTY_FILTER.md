# Manual Specialty Filtering

## Overview

The manual specialty filter allows you to restrict the ranking search to only doctors whose profiles contain a specific specialty. This significantly improves performance by reducing the dataset before BM25 ranking.

## How It Works

When you provide a manual specialty filter (e.g., "Gynaecology"), the system searches for that specialty in:

1. **Specialty Field** - The primary specialty of the doctor
2. **Subspecialties** - Any subspecialties listed
3. **Clinical Expertise** - The clinical interests/expertise text
4. **Title** - The doctor's professional title

The filter uses case-insensitive, partial matching, so "gynaecology", "Gynaecology", or "GYNAECOLOGY" will all match.

## Usage

### Web UI

1. Enter your query in the search box
2. Optionally enter a specialty in the "Filter by Specialty" field (e.g., "Gynaecology")
3. Click "Search"
4. Results will only include doctors matching that specialty

### API Endpoint

#### POST /api/rank

```json
{
  "query": "I need a consultation",
  "specialty": "Gynaecology",
  "shortlistSize": 10
}
```

#### GET /api/search

```
GET /api/search?q=I%20need%20a%20consultation&specialty=Gynaecology&limit=10
```

## Examples

### Example 1: Filter by Gynaecology

**Request:**
```json
{
  "query": "I need a consultation",
  "specialty": "Gynaecology"
}
```

**Result:** Only doctors with "Gynaecology" in their specialty, subspecialties, clinical expertise, or title will be ranked.

### Example 2: Filter by Cardiology

**Request:**
```json
{
  "query": "I have chest pain",
  "specialty": "Cardiology"
}
```

**Result:** Only cardiologists will be included in the ranking.

### Example 3: No Filter (Automatic)

**Request:**
```json
{
  "query": "I need SVT ablation"
}
```

**Result:** The system automatically infers likely subspecialties from the query and filters accordingly. For "SVT ablation", it would filter to Electrophysiology/Cardiology specialists.

## Behavior

### Manual Filter Takes Precedence

When a manual specialty is provided:
- ✅ Manual filter is applied
- ❌ Automatic intent-based filtering is **disabled**
- The system searches across all profile fields (specialty, subspecialties, clinical expertise, title)

### When No Manual Filter

When no manual specialty is provided:
- ✅ Automatic intent-based filtering is applied
- The system uses AI-inferred subspecialties from the query
- Only practitioners matching inferred subspecialties are ranked

## Performance Benefits

Filtering before BM25 ranking provides significant performance improvements:

| Dataset Size | Without Filter | With Filter (e.g., Gynaecology) | Improvement |
|--------------|----------------|--------------------------------|-------------|
| 11,895 doctors | ~1,500ms | ~200ms | **7.5x faster** |

## Common Specialties

Here are some common specialty names you can use:

- `Gynaecology` / `Gynaecology`
- `Cardiology`
- `General surgery`
- `Orthopaedic surgery`
- `Neurosurgery`
- `Gastroenterology`
- `Dermatology`
- `Urology`
- `Plastic surgery`
- `ENT` / `Otolaryngology`
- `Ophthalmology`
- `Psychiatry`
- `Neurology`
- `Endocrinology`
- `Rheumatology`
- `Respiratory medicine`
- `Clinical oncology`

## Notes

- The filter is case-insensitive
- Partial matches are supported (e.g., "cardio" will match "Cardiology")
- If the filter results in very few matches (< 10), the system may return all practitioners to ensure useful results
- The filter searches across multiple fields, so it's quite flexible

## API Response

When a manual specialty filter is applied, the response includes:

```json
{
  "queryInfo": {
    "manualSpecialtyFilter": "Gynaecology",
    "filteredCount": 234,
    "totalCount": 11895
  }
}
```

This shows how many doctors matched the filter out of the total dataset.
