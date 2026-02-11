---
title: "Open Library Subject Enrichment"
type: api-integration
date: 2026-02-11
status: implemented
category: api-integrations
module: books
symptoms:
  - Books lack subject/genre metadata for similarity matching
  - TF-IDF prediction requires richer text content than title/author
  - Imported books have no enrichment data
tags:
  - open-library
  - metadata-enrichment
  - lazy-loading
  - rate-limiting
  - tfidf-preparation
related:
  - docs/plans/2026-02-11-m2-real-predictor-roadmap.md
  - docs/plans/2026-02-11-m2-1-metadata-enrichment-plan.md
  - docs/brainstorms/2026-02-11-m2-1-metadata-assumptions-brainstorm.md
---

# Open Library Subject Enrichment

## Problem

The prediction engine requires meaningful similarity matching between books. The initial Book model only contained basic metadata (title, authors, ISBN) - insufficient for TF-IDF similarity computation.

**Key discovery:** Open Library's Search API returns `null` for subjects. Subject data must be fetched from the Works API (`/works/{id}.json`) using the work key from the Edition API.

## Solution

Implemented a multi-layered enrichment strategy:

1. **Immediate enrichment** - New books via ISBN lookup get subjects on creation
2. **Lazy enrichment** - Book detail API enriches on access if needed
3. **Batch enrichment** - API endpoint for backfilling existing books

### Data Flow

```
ISBN Lookup → Edition API → Work Key → Works API → Subjects
     │              │             │          │
     └──────────────┴─────────────┴──────────┘
                         ▼
                   Book Record
                   - subjects[] (normalized)
                   - lastEnrichedAt
                   - metadata (raw JSON)
```

## Implementation

### Schema Changes

```prisma
model Book {
  subjects       String[]     @default([])
  lastEnrichedAt DateTime?
}
```

### Key Functions

**Fetch subjects from Works API:**

```typescript
// lib/books/openlibrary.ts
export async function fetchWorkSubjects(workKey: string): Promise<string[]> {
  const url = `https://openlibrary.org${workKey}.json`;
  const response = await fetch(url);

  if (!response.ok) return [];

  const data = await response.json();
  return normalizeSubjects(data.subjects || []);
}
```

**Filter meta-tags that don't represent content:**

```typescript
function isMetaTag(subject: string): boolean {
  const lower = subject.toLowerCase();
  return (
    lower.startsWith('nyt:') ||
    lower.includes('large print') ||
    lower.includes('audiobook') ||
    lower.includes('bestseller') ||
    lower.includes('reading level')
  );
}
```

**Check if enrichment needed:**

```typescript
// lib/books/enrichment.ts
export function needsEnrichment(book: {
  subjects: string[];
  metadata: unknown;
}): boolean {
  if (book.subjects.length > 0) return false;

  const metadata = book.metadata as { works?: { key: string }[] } | null;
  return Boolean(metadata?.works?.[0]?.key);
}
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/books/enrich` | POST | Single book: `{ bookId }` or batch: `{ all: true }` |
| `/api/books/[bookId]` | GET | Lazy enriches if `needsEnrichment()` returns true |
| `/api/books/isbn/[isbn]` | GET | Enriches on book creation |

## Rate Limiting

Open Library has no official rate limits, but be respectful:

```typescript
export async function enrichAllBooks(options?: {
  batchSize?: number;  // Default: 50
  delayMs?: number;    // Default: 1000 (1 request/sec)
}) {
  for (const book of books) {
    await enrichBook(book.id);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}
```

## Confidence Scoring

Subject count affects prediction confidence:

| Subject Count | Confidence | Handling |
|---------------|------------|----------|
| 10+ | High | Reliable similarity matching |
| 3-9 | Medium | Reasonable matching |
| 0-2 | Low | Fallback to title/author only |

**Target:** >70% of books should have 3+ subjects.

## Edge Cases

| Case | Handling |
|------|----------|
| No work key in metadata | Return error, skip enrichment |
| Works API returns 404 | Return empty array, log warning |
| Network failure | Catch error, return empty array |
| Already has subjects | Skip unless `force: true` |

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `subjects[]`, `lastEnrichedAt` |
| `lib/books/openlibrary.ts` | Added `fetchWorkSubjects()`, `isMetaTag()`, `normalizeSubjects()` |
| `lib/books/enrichment.ts` | New enrichment service |
| `app/api/books/enrich/route.ts` | New enrichment endpoint |
| `app/api/books/[bookId]/route.ts` | Added lazy enrichment |
| `types/index.ts` | Added `subjects` to `NormalizedBook` |

## Testing

```typescript
describe('fetchWorkSubjects', () => {
  it('returns normalized subjects from valid work');
  it('returns empty array for 404 response');
  it('filters meta-tags from subjects');
  it('deduplicates case-insensitive subjects');
  it('limits subjects to 20 maximum');
});

describe('enrichBook', () => {
  it('enriches book without subjects');
  it('skips book that already has subjects');
  it('fails gracefully when no work key');
});
```

## Future Improvements

1. **Retry with backoff** - Add exponential backoff for API failures
2. **Circuit breaker** - Stop calling after N consecutive failures
3. **Re-enrichment** - Use `lastEnrichedAt` to refresh stale data
4. **Centralized book factory** - Ensure all book creation paths enrich

## References

- [Open Library Works API](https://openlibrary.org/dev/docs/api/books)
- [M2.1 Plan](../plans/2026-02-11-m2-1-metadata-enrichment-plan.md)
- [Assumptions Brainstorm](../brainstorms/2026-02-11-m2-1-metadata-assumptions-brainstorm.md)
