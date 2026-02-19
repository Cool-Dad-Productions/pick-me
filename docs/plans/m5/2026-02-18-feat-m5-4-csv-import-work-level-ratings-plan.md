---
title: "M5.4: Update CSV Import for Work-Level Ratings"
type: feat
date: 2026-02-18
milestone: 5.4
---

# M5.4: Update CSV Import for Work-Level Ratings

## Overview

Update the CSV import flow to create `WorkRating` records instead of `UserRating` records, deduplicating editions of the same work. This ensures that importing multiple editions of the same book (e.g., hardcover and paperback of "Dune") results in a single work-level rating.

## Problem Statement

Currently, the CSV import at [app/api/import/commit/route.ts](app/api/import/commit/route.ts) creates `UserRating` records tied to specific editions (Book records). This means:
- Importing multiple editions of the same work creates duplicate ratings
- Ratings aren't grouped at the work level, inconsistent with the M5.3 rating API changes
- Books created during import lack `openLibraryWorkId`, missing work grouping benefits

## Proposed Solution

Rewrite the import commit logic to:
1. Resolve work IDs for all books (via OpenLibrary API or synthetic generation)
2. Group import rows by `(userId, workId)` to deduplicate editions
3. Create `WorkRating` records using the established upsert pattern from M5.3
4. Return detailed summary with deduplication stats

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Work ID resolution | Always call OpenLibrary API for books with ISBN | Best data quality; user prefers accuracy over speed |
| Duplicate handling | Last occurrence in CSV wins | Follows spreadsheet convention where later rows override |
| Existing ratings | Update via upsert | Import is authoritative source |
| Rate limiting | 1 request/second to OpenLibrary | Respectful API usage per existing patterns |

## Technical Approach

### Current Flow (to be replaced)

```
CSV Row → Parse → Create/Find Book → Create UserRating
```

### New Flow

```
CSV Rows
    │
    ▼
Parse all rows into normalized records
    │
    ▼
For each row:
  ├─ Has ISBN? → Find/Create Book
  │               └─ Has workId? → Use it
  │               └─ No workId? → Call lookupWorkIdByIsbn() (rate-limited)
  │                                └─ Found? → Update book, use workId
  │                                └─ Not found? → Generate synthetic ID
  └─ No ISBN? → Find/Create Book by title+author
                 └─ Generate synthetic workId
    │
    ▼
Group by (userId, workId) - keep last occurrence per group
    │
    ▼
Upsert WorkRating for each unique (userId, workId)
    │
    ▼
Return summary with stats
```

### Implementation Details

#### 1. Rate-Limited OpenLibrary Lookup

Use the existing `lookupWorkIdByIsbn()` from [lib/books/openlibrary.ts:296-331](lib/books/openlibrary.ts) with rate limiting:

```typescript
// Delay between OpenLibrary API calls (1 second)
const OL_DELAY_MS = 1000;

async function resolveWorkIdWithRateLimit(
  book: { id: string; isbn13: string | null; openLibraryWorkId: string | null; title: string; authors: string[] },
  lastCallTime: { value: number }
): Promise<string> {
  // If book already has workId, use it
  if (book.openLibraryWorkId) {
    return book.openLibraryWorkId;
  }

  // If no ISBN, generate synthetic
  if (!book.isbn13) {
    return generateSyntheticWorkId(book.title, book.authors);
  }

  // Rate limit: ensure 1 second between calls
  const now = Date.now();
  const elapsed = now - lastCallTime.value;
  if (elapsed < OL_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, OL_DELAY_MS - elapsed));
  }
  lastCallTime.value = Date.now();

  // Call OpenLibrary API
  const workId = await lookupWorkIdByIsbn(book.isbn13);

  if (workId) {
    // Update book with resolved workId for future use
    await db.book.update({
      where: { id: book.id },
      data: { openLibraryWorkId: workId }
    });
    return workId;
  }

  // Fallback to synthetic
  return generateSyntheticWorkId(book.title, book.authors);
}
```

#### 2. Deduplication Logic

```typescript
interface ImportRow {
  rowIndex: number;
  title: string;
  author: string;
  rating: number;
  isbn: string | null;
  ratedAt: Date | null;
}

interface ResolvedImport {
  workId: string;
  bookId: string;
  rating: number;
  ratedAt: Date | null;
  rowIndex: number;
}

// After resolving all rows, group by workId and keep last
function deduplicateByWork(resolved: ResolvedImport[]): Map<string, ResolvedImport> {
  const workMap = new Map<string, ResolvedImport>();

  // Process in order - later entries override earlier ones
  for (const item of resolved) {
    workMap.set(item.workId, item);
  }

  return workMap;
}
```

#### 3. WorkRating Upsert Pattern

Use the established pattern from [app/api/ratings/route.ts:85-104](app/api/ratings/route.ts):

```typescript
await db.workRating.upsert({
  where: {
    userId_openLibraryWorkId: { userId, openLibraryWorkId: workId }
  },
  update: {
    rating,
    ratedAt: ratedAt || new Date(),
    source: 'import',
    updatedAt: new Date()
  },
  create: {
    userId,
    openLibraryWorkId: workId,
    rating,
    ratedAt: ratedAt || new Date(),
    source: 'import'
  }
});
```

#### 4. Response Schema

```typescript
interface ImportCommitResponse {
  success: true;
  stats: {
    rowsProcessed: number;
    booksCreated: number;
    booksFound: number;
    workRatingsCreated: number;
    workRatingsUpdated: number;
    duplicateEditionsMerged: number;
    apiCallsMade: number;
    syntheticIdsGenerated: number;
    errors: number;
  };
  // First 10 errors with details
  errorDetails?: Array<{
    row: number;
    title: string;
    reason: string;
  }>;
}
```

## Acceptance Criteria

- [x] Importing CSV creates `WorkRating` records (not `UserRating`)
- [x] Books with ISBN get work ID from OpenLibrary API (with 1s rate limiting)
- [x] Books without ISBN or API miss get synthetic work ID
- [x] Duplicate editions in same CSV are deduplicated (last wins)
- [x] Import of previously-rated work updates existing `WorkRating`
- [x] Import summary shows deduplication stats
- [x] Errors are tracked and reported (first 10 with details)

## Files to Modify

| File | Changes |
|------|---------|
| [app/api/import/commit/route.ts](app/api/import/commit/route.ts) | Complete rewrite of commit logic |
| [lib/books/openlibrary.ts](lib/books/openlibrary.ts) | Add timeout handling to `lookupWorkIdByIsbn` if needed |

## Dependencies

- **M5.1** (complete): Book model has `openLibraryWorkId` field
- **M5.2** (complete): `WorkRating` model exists
- **M5.3** (complete): `getWorkIdForBook()` and `generateSyntheticWorkId()` utilities in [lib/books/workId.ts](lib/books/workId.ts)

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Book exists with workId | Use existing workId, skip API call |
| Book exists without workId, has ISBN | Call API, update book if found |
| Book exists without workId, no ISBN | Generate synthetic ID |
| New book with ISBN | Create book, call API for workId |
| New book without ISBN | Create book with synthetic workId |
| API timeout/error | Fall back to synthetic ID, log for later enrichment |
| Same work twice in CSV | Keep last occurrence's rating |
| User already rated work | Update existing WorkRating via upsert |

## Testing Strategy

1. **Unit tests** for deduplication logic
2. **Integration tests** covering all edge cases in the matrix above
3. **Manual test** with CSV containing:
   - Books with ISBNs (should call API)
   - Books without ISBNs (should use synthetic)
   - Duplicate editions of same work (should deduplicate)
   - Previously rated work (should update)

## Performance Considerations

| Import Size | Max API Calls | Estimated Time |
|-------------|---------------|----------------|
| 50 books | 50 | ~1 minute |
| 100 books | 100 | ~2 minutes |
| 500 books | 500 | ~8-9 minutes |

For very large imports (500+ books), the API rate limiting will cause noticeable delays. This is acceptable per the user's preference for data quality over speed. Future enhancement: async import with progress tracking.

## References

### Internal
- [Current import commit logic](app/api/import/commit/route.ts)
- [WorkRating upsert pattern](app/api/ratings/route.ts:85-104)
- [Work ID utilities](lib/books/workId.ts)
- [OpenLibrary work ID lookup](lib/books/openlibrary.ts:296-331)
- [M5 master plan](docs/plans/2026-02-17-m5-improved-metadata-canonical-works-plan.md)

### Learnings Applied
- Synthetic ID generation must match `lib/books/workId.ts` exactly
- Use `upsert` for idempotency
- Track granular stats for user feedback
- Implement per-record error handling (don't fail entire batch)
