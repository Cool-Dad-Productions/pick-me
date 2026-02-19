---
title: "M5.3: Update Rating APIs"
type: feat
date: 2026-02-17
milestone: 5.3
parent: docs/plans/2026-02-17-m5-improved-metadata-canonical-works-plan.md
---

# M5.3: Update Rating APIs

## Overview

Modify rating endpoints to use work-level storage (`WorkRating` model) while maintaining edition-based UX. Users continue to rate books by `bookId`, but storage and retrieval happen at the work level via `openLibraryWorkId`.

## Problem Statement

After M5.2 created the `WorkRating` model and migrated existing ratings, the API endpoints still operate on `UserRating`. This creates:

- Inconsistency between storage (work-level) and API (edition-level)
- Duplicate rating risk if user rates different editions
- Inability to show work-level rating on book detail pages

## Proposed Solution

Update four API endpoints to read/write `WorkRating` instead of `UserRating`:

1. **POST /api/ratings** - Upsert `WorkRating` by `(userId, workId)`
2. **GET /api/books/[bookId]** - Fetch rating via book's workId
3. **GET /api/ratings** - Return deduplicated work-level ratings
4. **DELETE /api/ratings/[ratingId]** - Delete from `WorkRating` table

## Technical Approach

### Shared Utility: Work ID Resolution

Create a shared utility for consistent work ID handling across all endpoints.

#### lib/books/workId.ts

```typescript
import 'server-only';
import { createHash } from 'crypto';

/**
 * Generate a synthetic work ID for books without OpenLibrary work data.
 * Format: synthetic:{12-char-hash}
 */
export function generateSyntheticWorkId(title: string, authors: string[]): string {
  // Normalize: lowercase, trim, collapse whitespace
  const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedAuthors = authors
    .map(a => a.toLowerCase().trim().replace(/\s+/g, ' '))
    .sort()
    .join('|');

  const input = `${normalizedTitle}|${normalizedAuthors}`;
  const hash = createHash('md5').update(input).digest('hex').slice(0, 12);
  return `synthetic:${hash}`;
}

/**
 * Get the work ID for a book, generating synthetic ID if needed.
 */
export function getWorkIdForBook(book: {
  openLibraryWorkId: string | null;
  title: string;
  authors: string[];
}): string {
  return book.openLibraryWorkId || generateSyntheticWorkId(book.title, book.authors);
}
```

### Endpoint Changes

#### 1. POST /api/ratings

**Current:** Upserts `UserRating` by `(userId, bookId)`
**New:** Upserts `WorkRating` by `(userId, openLibraryWorkId)`

```typescript
// app/api/ratings/route.ts - POST handler changes

// 1. Lookup book (unchanged)
const book = await db.book.findUnique({
  where: { id: bookId },
  select: { id: true, title: true, authors: true, openLibraryWorkId: true, coverUrl: true },
});

if (!book) {
  return NextResponse.json({ error: 'Book not found' }, { status: 404 });
}

// 2. Get work ID (NEW)
const workId = getWorkIdForBook(book);

// 3. Check for existing rating (for 200 vs 201 response)
const existingRating = await db.workRating.findUnique({
  where: {
    userId_openLibraryWorkId: {
      userId: session.user.id,
      openLibraryWorkId: workId,
    },
  },
});

// 4. Upsert WorkRating (CHANGED from UserRating)
const workRating = await db.workRating.upsert({
  where: {
    userId_openLibraryWorkId: {
      userId: session.user.id,
      openLibraryWorkId: workId,
    },
  },
  update: {
    rating,
    ratedAt: new Date(),
    source: 'manual',
  },
  create: {
    userId: session.user.id,
    openLibraryWorkId: workId,
    rating,
    ratedAt: new Date(),
    source: 'manual',
  },
});

// 5. Return response with book context
return NextResponse.json(
  {
    rating: {
      id: workRating.id,
      workId: workRating.openLibraryWorkId,
      rating: workRating.rating,
      ratedAt: workRating.ratedAt,
      source: workRating.source,
      book: {
        id: book.id,
        title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
      },
    },
  },
  { status: existingRating ? 200 : 201 }
);
```

#### 2. GET /api/books/[bookId]

**Current:** Returns book details only
**New:** Includes `userRating` from `WorkRating` lookup

```typescript
// app/api/books/[bookId]/route.ts - additions

// After fetching book...
const workId = getWorkIdForBook(book);

// Lookup user's work-level rating (if authenticated)
let userRating: number | null = null;
if (session?.user?.id) {
  const workRating = await db.workRating.findUnique({
    where: {
      userId_openLibraryWorkId: {
        userId: session.user.id,
        openLibraryWorkId: workId,
      },
    },
    select: { rating: true },
  });
  userRating = workRating?.rating ?? null;
}

return NextResponse.json({
  book: { ...book, workId },
  userRating,
});
```

#### 3. GET /api/ratings

**Current:** Returns paginated `UserRating` records with book joins
**New:** Returns paginated `WorkRating` records with representative book

```typescript
// app/api/ratings/route.ts - GET handler changes

// 1. Query WorkRating instead of UserRating
const [ratings, total] = await Promise.all([
  db.workRating.findMany({
    where: { userId: session.user.id },
    orderBy: sortField === 'rating'
      ? { rating: sortOrder }
      : { ratedAt: sortOrder },
    skip: (page - 1) * limit,
    take: limit,
  }),
  db.workRating.count({ where: { userId: session.user.id } }),
]);

// 2. Fetch representative books for each work (batch query)
const workIds = ratings.map(r => r.openLibraryWorkId);
const books = await db.book.findMany({
  where: { openLibraryWorkId: { in: workIds } },
  select: { id: true, isbn13: true, title: true, authors: true, coverUrl: true, openLibraryWorkId: true },
});

// Create lookup map (pick first book per work)
const bookByWorkId = new Map<string, typeof books[0]>();
for (const book of books) {
  if (book.openLibraryWorkId && !bookByWorkId.has(book.openLibraryWorkId)) {
    bookByWorkId.set(book.openLibraryWorkId, book);
  }
}

// 3. Handle synthetic workIds (query by title match if needed)
const syntheticWorkIds = workIds.filter(id => id.startsWith('synthetic:'));
if (syntheticWorkIds.length > 0) {
  // For synthetic IDs, we need to find books that would generate that ID
  // This is a known limitation - synthetic-only books may not have representative
  // The migration script should have linked them, but as fallback return null book
}

// 4. Build response
const ratingsWithBooks = ratings.map(r => ({
  id: r.id,
  workId: r.openLibraryWorkId,
  rating: r.rating,
  ratedAt: r.ratedAt,
  source: r.source,
  notes: r.notes,
  book: bookByWorkId.get(r.openLibraryWorkId) || null,
}));

return NextResponse.json({
  ratings: ratingsWithBooks,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
});
```

#### 4. DELETE /api/ratings/[ratingId]

**Current:** Deletes from `UserRating`
**New:** Deletes from `WorkRating`

```typescript
// app/api/ratings/[ratingId]/route.ts - DELETE handler changes

// 1. Find WorkRating instead of UserRating
const rating = await db.workRating.findUnique({
  where: { id: ratingId },
  select: { id: true, userId: true },
});

if (!rating) {
  return NextResponse.json({ error: 'Rating not found' }, { status: 404 });
}

// 2. Verify ownership (unchanged logic)
if (rating.userId !== session.user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// 3. Delete from WorkRating
await db.workRating.delete({
  where: { id: ratingId },
});

return new NextResponse(null, { status: 204 });
```

## Acceptance Criteria

- [x] Rating any edition updates the work-level rating
- [x] Viewing any edition shows the work-level rating
- [x] User's rating list shows deduplicated work ratings
- [x] Books without workId still support ratings via synthetic ID
- [x] POST returns 201 for new, 200 for update
- [x] DELETE properly validates ownership before deletion
- [x] All endpoints use `server-only` guard

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Book has no `openLibraryWorkId` | Generate synthetic ID via `getWorkIdForBook()` |
| User rates edition A, then edition B of same work | Single WorkRating updated (not duplicated) |
| GET /api/ratings has WorkRating with no matching book | Return `book: null` in response |
| Book's workId changes after rating | WorkRating remains with original workId (accepted debt) |
| DELETE rating that doesn't exist | Return 404 |
| Unauthenticated request | Return 401 |

## Implementation Tasks

### Phase 1: Shared Utility

- [x] Create [lib/books/workId.ts](lib/books/workId.ts) with `generateSyntheticWorkId` and `getWorkIdForBook`
- [x] Add `server-only` import guard
- [ ] Add tests for synthetic ID generation consistency

### Phase 2: POST /api/ratings

- [x] Import `getWorkIdForBook` utility
- [x] Change upsert to use `WorkRating` model
- [x] Update composite key to `userId_openLibraryWorkId`
- [x] Update response schema to include `workId` and `book` context
- [x] Verify 200 vs 201 status code logic

### Phase 3: GET /api/books/[bookId]

- [x] Import `getWorkIdForBook` utility
- [x] Add `WorkRating` lookup by workId
- [x] Include `userRating` in response (null if not rated)
- [x] Include `workId` in book response

### Phase 4: GET /api/ratings

- [x] Change query from `UserRating` to `WorkRating`
- [x] Implement batch book lookup by workIds
- [x] Handle synthetic workIds (book may be null)
- [x] Update sort/filter logic for new model
- [x] Verify pagination counts

### Phase 5: DELETE /api/ratings/[ratingId]

- [x] Change lookup from `UserRating` to `WorkRating`
- [x] Change delete from `UserRating` to `WorkRating`
- [x] Verify ownership check still works

### Phase 6: Validation & Cleanup

- [x] Run existing rating tests (expect failures, then fix)
- [x] Test rating flow end-to-end: create, read, update, delete
- [x] Test edition-to-work deduplication
- [x] Verify no regression in prediction API (reads WorkRating)

## Files to Modify

| File | Change |
|------|--------|
| `lib/books/workId.ts` | **NEW** - Synthetic ID generation utility |
| `app/api/ratings/route.ts` | POST/GET handlers → WorkRating |
| `app/api/ratings/[ratingId]/route.ts` | DELETE handler → WorkRating |
| `app/api/books/[bookId]/route.ts` | Add userRating via workId lookup |
| `lib/validations.ts` | No changes needed (rating validation unchanged) |

## Response Schema Changes

### POST /api/ratings Response

```typescript
// Before (UserRating)
{
  rating: {
    id: string;
    bookId: string;
    rating: number;
    ratedAt: string;
    source: string;
  }
}

// After (WorkRating)
{
  rating: {
    id: string;
    workId: string;        // openLibraryWorkId or synthetic
    rating: number;
    ratedAt: string;
    source: string;
    book: {                // The edition that was rated
      id: string;
      title: string;
      authors: string[];
      coverUrl: string | null;
    }
  }
}
```

### GET /api/books/[bookId] Response

```typescript
// Before
{
  book: { ... }
}

// After
{
  book: { ..., workId: string },
  userRating: number | null
}
```

### GET /api/ratings Response

```typescript
// Before (UserRating with book join)
{
  ratings: [{
    id: string;
    bookId: string;
    rating: number;
    book: { ... }
  }],
  pagination: { ... }
}

// After (WorkRating with representative book)
{
  ratings: [{
    id: string;
    workId: string;
    rating: number;
    ratedAt: string;
    source: string;
    notes: string | null;
    book: { ... } | null   // null if no book found for workId
  }],
  pagination: { ... }
}
```

## Dependencies

- **M5.1** (complete): `openLibraryWorkId` field exists on Book model
- **M5.2** (complete): `WorkRating` model exists with migrated data

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Synthetic ID inconsistency | Low | High | Centralize in shared utility, normalize inputs |
| Performance regression on GET /api/ratings | Medium | Medium | Batch book lookup, add index if needed |
| Breaking frontend expectations | Medium | Medium | Keep response shapes backward-compatible where possible |
| Orphaned WorkRatings (no book match) | Low | Low | Return `book: null`, document behavior |

## References

### Internal
- [WorkRating model](../../prisma/schema.prisma:58-74)
- [Current ratings API](../../app/api/ratings/route.ts)
- [Migration script with synthetic ID](../../scripts/migrate-ratings-to-work.ts:22-26)
- [Parent M5 plan](./2026-02-17-m5-improved-metadata-canonical-works-plan.md)

### Patterns
- Upsert pattern: [app/api/ratings/route.ts:77-98](../../app/api/ratings/route.ts#L77-L98)
- Auth check pattern: [app/api/ratings/route.ts:35-38](../../app/api/ratings/route.ts#L35-L38)
- Batch query pattern: Fetch workIds, then batch lookup books
