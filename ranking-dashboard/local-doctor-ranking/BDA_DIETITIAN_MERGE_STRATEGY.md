# BDA Dietitian Merge Strategy

## Database Schema

```sql
create table public.bda_dietitians (
  id uuid not null default gen_random_uuid(),
  name text null,
  title text null,
  contact_address text null,
  company_name text null,
  bio text null,
  industry_services text null,
  clinical_expertise text null,
  geographical_areas_served text null,
  profile_url character varying null,
  constraint bda_dietitians_pkey primary key (id)
)
```

## Field Mapping Strategy

### Core Fields (Direct Mapping)

| BDA Field | Practitioner Field | Usage | Notes |
|-----------|-------------------|-------|-------|
| `name` | `name` | Searchable, Display | Primary identifier |
| `title` | `title` | Searchable, Display | e.g., "Dr", "Ms", "RD" |
| `id` | `id` | Unique identifier | UUID from database |
| `clinical_expertise` | `clinical_expertise` | **Highly weighted in BM25** | Comma-separated list (e.g., "Diabetes, IBS, Obesity") |

### Bio/Description Fields (Combined for Richness)

| BDA Field | Practitioner Field | Strategy |
|-----------|-------------------|----------|
| `bio` | `about` | Primary bio content |
| `industry_services` | Included in `about` | Appended to bio: `"{bio}\n\nServices: {industry_services}"` |
| `bio` + `industry_services` | `description` | Same as `about` |

**Rationale**: Combining `bio` and `industry_services` provides richer searchable content. The `about` field is weighted in BM25, so including services here improves discoverability.

### Location Fields (Structured Array)

| BDA Field | Practitioner Field | Structure |
|-----------|-------------------|-----------|
| `contact_address` | `locations[0].address` | `{ address: "...", type: "practice_address" }` |
| `geographical_areas_served` | `locations[].address` | Multiple entries: `{ address: "...", type: "service_area", geographical_area: true }` |

**Rationale**: 
- `contact_address` = physical practice location
- `geographical_areas_served` = service areas (comma-separated, parsed into multiple location entries)
- Both stored in `locations` array for location filtering/search

### Reference Fields (Stored but Not Searchable)

| BDA Field | Practitioner Field | Usage |
|-----------|-------------------|-------|
| `company_name` | `company_name` | Reference only (not in BM25) |
| `profile_url` | `profile_url` | Link to BDA profile |

### Metadata Fields (Auto-generated)

| Field | Value | Purpose |
|-------|-------|---------|
| `specialty` | `"Dietitian"` | Required for filtering |
| `specialty_source` | `"BDA Dietitian File"` | Track data source |
| `sources` | `["BDA Dietitian File"]` | Array of sources |
| `clinical_interests` | Same as `clinical_expertise` | Backward compatibility |

## BM25 Searchable Text Generation

The `createWeightedSearchableText` function uses these fields (in order of weight):

1. **`clinical_expertise`** (weight: 2.0) - **Most important**
   - BDA format: `"Diabetes, Diverticulosis, IBS, Obesity"`
   - Handled as unstructured text (not parsed into procedures/conditions)
   - Included directly in searchable text if no structured data extracted

2. **`about`** (weight: 1.0) - Contains bio + industry_services
3. **`description`** (weight: 1.0) - Same as about
4. **`specialty`** (weight: 1.5) - "Dietitian"
5. **`name`** (weight: 1.0)
6. **`title`** (weight: 1.0)

## Key Improvements Made

1. **Direct `clinical_expertise` mapping**: BDA schema has `clinical_expertise` directly (not `clinical_interests`), so we prioritize it.

2. **Rich `about` field**: Combines `bio` + `industry_services` for better searchability.

3. **Structured locations**: Parses `geographical_areas_served` into multiple location entries for better location filtering.

4. **Preserved reference fields**: Stores `company_name` and `profile_url` for future use.

5. **Backward compatibility**: Also stores `clinical_expertise` in `clinical_interests` field for code that expects that field name.

## Example Transformation

**Input (BDA Schema):**
```json
{
  "id": "uuid-123",
  "name": "Jane Smith",
  "title": "RD",
  "bio": "Experienced dietitian specializing in...",
  "clinical_expertise": "Diabetes, IBS, Obesity",
  "industry_services": "Corporate wellness, Media consulting",
  "contact_address": "123 Main St, London",
  "geographical_areas_served": "London, Surrey, Kent",
  "company_name": "Nutrition Solutions Ltd",
  "profile_url": "https://bda.org/profile/jane-smith"
}
```

**Output (Merged Format):**
```json
{
  "id": "uuid-123",
  "name": "Jane Smith",
  "title": "RD",
  "specialty": "Dietitian",
  "specialty_source": "BDA Dietitian File",
  "clinical_expertise": "Diabetes, IBS, Obesity",
  "clinical_interests": "Diabetes, IBS, Obesity",
  "about": "Experienced dietitian specializing in...\n\nServices: Corporate wellness, Media consulting",
  "description": "Experienced dietitian specializing in...\n\nServices: Corporate wellness, Media consulting",
  "locations": [
    { "address": "123 Main St, London", "type": "practice_address" },
    { "address": "London", "type": "service_area", "geographical_area": true },
    { "address": "Surrey", "type": "service_area", "geographical_area": true },
    { "address": "Kent", "type": "service_area", "geographical_area": true }
  ],
  "company_name": "Nutrition Solutions Ltd",
  "profile_url": "https://bda.org/profile/jane-smith",
  "sources": ["BDA Dietitian File"]
}
```

## BM25 Search Behavior

When searching for "IBS dietitian":
- **`clinical_expertise`** contains "IBS" → High score (weight 2.0)
- **`about`** contains "IBS" → Medium score (weight 1.0)
- **`specialty`** contains "Dietitian" → Medium score (weight 1.5)

The unstructured `clinical_expertise` format (comma-separated) works well with BM25 tokenization, as each condition (e.g., "IBS", "Diabetes") becomes a searchable token.

## Testing Recommendations

1. **Verify field mapping**: Check that all BDA fields are correctly mapped
2. **Test BM25 search**: Ensure dietitians appear in search results for relevant queries
3. **Test location filtering**: Verify `geographical_areas_served` works for location-based searches
4. **Test specialty filter**: Ensure filtering by "Dietitian" returns BDA dietitians
5. **Verify no duplicates**: Check that existing dietitians aren't duplicated
