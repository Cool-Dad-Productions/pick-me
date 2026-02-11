# M2.1 Metadata Enrichment - Assumption Validation

**Date:** 2026-02-11
**Status:** Validated
**Related Plan:** [M2.1 Metadata Enrichment](../plans/2026-02-11-m2-1-metadata-enrichment-plan.md)

## What We Validated

Before implementing M2.1, we tested key assumptions about Open Library's Works API subject data.

## Key Findings

### Subject Coverage is Inconsistent

| Book Type | Subject Count |
|-----------|---------------|
| Classics/Bestsellers | 30-150+ |
| Modern popular fiction | 10-40 |
| Niche/specialized | 2-5 |
| Self-published/obscure | 0-2 |

**~70% of self-published books tested had zero subjects.**

### Subjects Are Not Normalized

Open Library subjects are free-form user-contributed strings:
- Same concept appears as: "Magic", "MAGIA", "Magie", "Magic in fiction"
- Mixed languages in same book
- Contains meta-tags: "NYT bestseller", "Reading Level-Grade 9", "Large Print"

### API Gotcha

Search API returns `null` for subjects. Must fetch each `/works/{id}.json` individually to get subject data.

## Decisions Made

### 1. Fallback Strategy: Accept Limitations

**Choice:** Use available data, show lower confidence for sparse subjects.

**Rationale:** Adding Google Books or other APIs increases complexity without guaranteed benefit. Better to ship with what we have and iterate.

### 2. Normalization: Minimal (Lowercase + Filter Noise)

**Choice:** Lowercase all subjects, filter obvious meta-tags.

**What to filter:**
- `nyt:*` prefixed subjects
- `Reading Level-*` subjects
- Format tags: "Large Print", "Audiobook"

**What NOT to do (yet):**
- Synonym mapping ("Magic" → "MAGIA")
- Language normalization
- Full taxonomy classification

**Rationale:** TF-IDF naturally handles some variation. Keep MVP simple.

### 3. Confidence Scoring: Factor in Subject Count

**Addition to plan:** Weight prediction confidence by subject availability.

| Subject Count | Confidence Modifier |
|---------------|---------------------|
| 10+ | High confidence |
| 3-9 | Medium confidence |
| 0-2 | Low confidence (flag to user) |

### 4. User Base: Mixed (Mainstream + Niche)

Expect variety of book types. Must handle graceful degradation for books with poor metadata.

## Refinements to M2.1 Plan

1. **Add meta-tag filtering** to `fetchWorkSubjects()` - strip noise before storing
2. **Track coverage stats** - log % of enriched books with 0, 1-3, 3+ subjects
3. **Surface confidence in API response** - include `subjectCount` in prediction rationale

## Open Questions (Deferred)

- Should we add Google Books as fallback? (Revisit if >30% of books have no subjects)
- Synonym normalization needed? (Revisit after seeing TF-IDF results)
- Non-English subject handling? (Revisit based on user feedback)

## Next Steps

Proceed with M2.1 implementation incorporating these validated decisions. The existing plan is sound with minor refinements noted above.
