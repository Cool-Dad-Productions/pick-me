---
title: "M5: Improved Metadata with Canonical Works"
type: feat
date: 2026-02-17
milestone: 5
---

# M5: Improved Metadata with Canonical Works

## Overview

Transform the book rating system from edition-centric to work-centric. Ratings will be stored at the work level (using OpenLibrary Work IDs), making all editions of "The Great Gatsby" share a single rating. Additionally, enrich book metadata with Google Books API for genres and page counts to improve prediction accuracy.

## Problem Statement

Currently:
- Ratings are tied to specific editions (Book records by ISBN)
- User could rate hardcover and paperback of same book separately
- Predictions miss signal when same work exists under different ISBNs
- Limited metadata (only OpenLibrary subjects) constrains prediction quality

## Proposed Solution

1. Add `openLibraryWorkId` field to Book model
2. Create new `WorkRating` model to store ratings at work level
3. Migrate existing `UserRating` records to `WorkRating`
4. Integrate Google Books API for genres and page counts
5. Update prediction model to use enriched metadata

## Architecture Decision Records

### ADR-1: Work as Field vs Separate Model

**Decision:** Add `openLibraryWorkId` as a field on Book model (not a separate Work table)

**Rationale:**
- Personal library scale (hundreds to thousands of books)
- Most queries need book details, not just work metadata
- Simpler migration path
- Work metadata can be denormalized onto Book or stored in metadata JSON

### ADR-2: Rating Scope

**Decision:** Move ratings to work level via new `WorkRating` model

**Rationale:**
- User intent: "I rate The Great Gatsby 5 stars" regardless of edition
- Cleaner semantics for predictions
- Prevents duplicate rating confusion

**Migration:** Existing `UserRating` records will be migrated to `WorkRating`. For books without workId, create synthetic work ID based on title+author hash.

### ADR-3: Genre Source

**Decision:** Use Google Books API for genre/category data

**Rationale:**
- OpenLibrary subjects are unstructured (mix of genres, themes, settings)
- Google Books provides curated categories
- Better signal for prediction model

---

## Sub-Milestones

### M5.1: Schema Migration - Add Work ID Field

**Goal:** Add `openLibraryWorkId` to Book model and backfill existing data

**Changes:**

```prisma
// prisma/schema.prisma
model Book {
  // ... existing fields
  openLibraryWorkId  String?
  pageCount          Int?
  publicationYear    Int?      // Original publication year from work
  genres             String[]  @default([])

  @@index([openLibraryWorkId])
}
```

**Tasks:**
- [x] Create migration adding `openLibraryWorkId`, `pageCount`, `publicationYear`, `genres` fields
- [x] Add index on `openLibraryWorkId` for efficient lookups
- [x] Write backfill script to extract workId from existing `metadata.works[0].key`
- [x] Update `NormalizedBook` type in [types/index.ts](types/index.ts)
- [x] Update OpenLibrary lookup to return workId as first-class field

**Files to modify:**
- `prisma/schema.prisma`
- `prisma/migrations/YYYYMMDD_add_work_id/migration.sql`
- `types/index.ts`
- `lib/books/openlibrary.ts`

**Acceptance criteria:**
- [x] All existing books with `metadata.works[0].key` have `openLibraryWorkId` populated
- [x] New ISBN lookups store workId directly on Book record
- [x] Database index exists on `openLibraryWorkId`

---

### M5.2: Work-Level Ratings Model

**Goal:** Create `WorkRating` model and migrate existing ratings

**Schema change:**

```prisma
// prisma/schema.prisma
model WorkRating {
  id                  String    @id @default(cuid())
  userId              String
  openLibraryWorkId   String    // The canonical work identifier
  rating              Float     // 1.0-5.0 in 0.5 increments
  ratedAt             DateTime?
  source              String?   // 'import', 'manual', 'scan'
  notes               String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, openLibraryWorkId])
  @@index([userId])
  @@index([openLibraryWorkId])
}

// Keep UserRating for migration period, mark as deprecated
model UserRating {
  // ... existing fields
  migratedToWorkRating  Boolean @default(false)
}
```

**Tasks:**
- [x] Create `WorkRating` model with unique constraint on `[userId, openLibraryWorkId]`
- [x] Add `migratedToWorkRating` flag to `UserRating` for tracking migration
- [x] Write migration script:
  1. For each `UserRating`, lookup book's `openLibraryWorkId`
  2. If workId exists, create/update `WorkRating`
  3. If no workId, generate synthetic ID: `synthetic:${hash(title+authors)}`
  4. Mark `UserRating` as migrated
- [x] Handle conflicts: if user rated multiple editions of same work, keep highest rating or most recent
- [x] Update User model to add `workRatings` relation

**Files to modify:**
- `prisma/schema.prisma`
- `prisma/migrations/YYYYMMDD_add_work_rating/migration.sql`
- `prisma/seed.ts` (if seeding test ratings)
- New file: `scripts/migrate-ratings-to-work.ts`

**Acceptance criteria:**
- [x] All existing `UserRating` records have corresponding `WorkRating` records
- [x] Duplicate edition ratings for same work are consolidated
- [x] `WorkRating` unique constraint prevents duplicate work ratings per user

---

### M5.3: Update Rating APIs

**Goal:** Modify rating endpoints to use work-level storage while maintaining edition-based UX

**API changes:**

```typescript
// POST /api/ratings - Create/update rating
// Input: { bookId: string, rating: number }
// Behavior:
//   1. Lookup book's openLibraryWorkId
//   2. Upsert WorkRating by (userId, workId)
//   3. Return rating with work context

// GET /api/books/[bookId] - Get book details
// Response includes: { ..., userRating: number | null }
// Behavior: Lookup WorkRating by book's workId

// GET /api/ratings - List user's ratings
// Returns WorkRating records joined with a representative Book for each work
```

**Tasks:**
- [x] Update `POST /api/ratings` to upsert `WorkRating` instead of `UserRating`
- [x] Handle books without workId: generate synthetic work ID on-the-fly
- [x] Update `GET /api/books/[bookId]` to fetch rating via workId lookup
- [x] Update `GET /api/ratings` to return work-level ratings with book info
- [x] Add migration endpoint or script to handle edge cases
- [x] Update rating validation (still 1.0-5.0 in 0.5 increments)

**Files to modify:**
- `app/api/ratings/route.ts`
- `app/api/books/[bookId]/route.ts`
- `lib/validations.ts` (if rating validation changes)

**Acceptance criteria:**
- [x] Rating any edition updates the work-level rating
- [x] Viewing any edition shows the work-level rating
- [x] User's rating list shows deduplicated work ratings
- [x] Books without workId still support ratings via synthetic ID

---

### M5.4: Update CSV Import for Work-Level Ratings

**Goal:** Import flow creates work-level ratings, deduplicating editions

**Behavior change:**

```
CSV row: "The Great Gatsby", "F. Scott Fitzgerald", 5, 9780743273565
                                                      |
                                                      v
1. Lookup/create Book by ISBN → get openLibraryWorkId
2. Upsert WorkRating by (userId, workId)
3. If workId collision (user already rated this work), update rating
```

**Tasks:**
- [x] Update import commit logic to create `WorkRating` instead of `UserRating`
- [x] Add workId resolution during import (may require OpenLibrary lookups)
- [x] Handle import rows without ISBN: match by title+author, generate synthetic workId
- [x] Add import summary showing: "X books imported, Y work ratings created, Z duplicates merged"
- [x] Consider rate limiting for OpenLibrary lookups during import

**Files to modify:**
- `app/api/import/commit/route.ts`
- `lib/books/openlibrary.ts` (batch lookup helper)

**Acceptance criteria:**
- [x] Importing CSV creates `WorkRating` records
- [x] Duplicate editions in same import are deduplicated
- [x] Import of previously-rated work updates existing rating (or warns user)
- [x] Import summary shows deduplication stats

---

### M5.5: Google Books API Integration

**Goal:** Fetch genres, page counts, and publication year from Google Books

**New integration:**

```typescript
// lib/books/googlebooks.ts
export interface GoogleBooksMetadata {
  genres: string[];           // categories array
  pageCount: number | null;
  publishedDate: string | null;
  description: string | null;
}

export async function lookupByIsbn(isbn: string): Promise<GoogleBooksMetadata | null>;
export async function lookupByTitle(title: string, author?: string): Promise<GoogleBooksMetadata | null>;
```

**Tasks:**
- [ ] Create `lib/books/googlebooks.ts` with ISBN and title/author lookup
- [ ] Add `GOOGLE_BOOKS_API_KEY` to environment (optional - works without key at lower rate limits)
- [ ] Map Google Books `categories` to `genres` field (normalize casing, dedupe)
- [ ] Extract `pageCount` and `publishedDate` from response
- [ ] Add rate limiting (100 requests/day without key, 1000/day with key)
- [ ] Create combined enrichment function that fetches from both OpenLibrary and Google Books

**Files to create/modify:**
- New: `lib/books/googlebooks.ts`
- Update: `lib/books/enrichment.ts` (combine sources)
- Update: `.env.example` (add `GOOGLE_BOOKS_API_KEY`)

**Acceptance criteria:**
- [ ] Books enriched via ISBN have genres from Google Books
- [ ] Page count populated when available
- [ ] Graceful fallback when Google Books has no data
- [ ] Rate limiting prevents API quota exhaustion

---

### M5.6: Update Enrichment Service

**Goal:** Combined enrichment from OpenLibrary + Google Books

**Enrichment strategy:**

```
Book needs enrichment?
    |
    +-- Has ISBN → Fetch OpenLibrary (workId, subjects)
    |               + Google Books (genres, pageCount)
    |
    +-- No ISBN → Try title/author search on both APIs
    |
    v
Merge results:
  - workId: OpenLibrary
  - subjects: OpenLibrary
  - genres: Google Books
  - pageCount: Google Books (fallback: OpenLibrary if available)
  - publicationYear: OpenLibrary work.first_publish_date
```

**Tasks:**
- [ ] Update `enrichBook()` to call both OpenLibrary and Google Books
- [ ] Add `enrichmentSources` tracking (which APIs succeeded)
- [ ] Update `needsEnrichment()` to check for missing genres/pageCount
- [ ] Add batch enrichment endpoint for backfilling existing books
- [ ] Implement respectful rate limiting for both APIs

**Files to modify:**
- `lib/books/enrichment.ts`
- `app/api/books/enrich/route.ts`

**Acceptance criteria:**
- [ ] Enrichment populates workId, subjects, genres, pageCount, publicationYear
- [ ] Partial enrichment succeeds (e.g., OpenLibrary works but Google Books fails)
- [ ] Batch enrichment can process existing books without overwhelming APIs

---

### M5.7: Update Prediction Model

**Goal:** Incorporate genres, page count, and publication year into TF-IDF similarity

**Algorithm changes:**

```typescript
// lib/prediction/tokenizer.ts
export function bookToText(book: {
  title: string;
  authors: string[];
  subjects: string[];
  genres: string[];           // NEW
  pageCount: number | null;   // NEW
  publicationYear: number | null; // NEW
}): string {
  const titleText = book.title;
  const authorText = book.authors.join(' ');
  const subjectText = book.subjects.join(' ');
  const genreText = book.genres.join(' ');  // NEW

  // Bucket page count
  const lengthBucket = bucketPageCount(book.pageCount); // 'short' | 'medium' | 'long' | ''

  // Bucket publication year
  const eraBucket = bucketYear(book.publicationYear); // 'classic' | 'modern' | 'contemporary' | ''

  // Weight: title 2x, genres 2x (strong signal), length/era 1x
  return `${titleText} ${titleText} ${authorText} ${subjectText} ${genreText} ${genreText} ${lengthBucket} ${eraBucket}`;
}

function bucketPageCount(pages: number | null): string {
  if (!pages) return '';
  if (pages < 200) return 'short_book';
  if (pages < 400) return 'medium_book';
  return 'long_book';
}

function bucketYear(year: number | null): string {
  if (!year) return '';
  if (year < 1950) return 'classic_era';
  if (year < 2000) return 'modern_era';
  return 'contemporary_era';
}
```

**Tasks:**
- [x] Update `BookDocument` interface to include genres, pageCount, publicationYear
- [x] Update `bookToText()` with bucketed features
- [x] Update `buildCorpus()` to fetch enriched book data
- [x] Consider feature weighting adjustments based on testing
- [x] Update prediction rationale to explain genre/length/era matches

**Files to modify:**
- `lib/prediction/tfidf.ts`
- `lib/prediction/tokenizer.ts`
- `lib/prediction/predictor.ts`

**Acceptance criteria:**
- [x] Predictions consider genre similarity
- [x] Books of similar length are weighted slightly higher
- [x] Era similarity contributes to predictions
- [x] Rationale explains which new features contributed

---

### M5.8: Update Frontend for Work-Level Ratings

**Goal:** UI shows work-level ratings transparently across editions

**Changes:**

1. **Book detail page**: Shows rating that applies to all editions
2. **Rating component**: When rating, show "This rating applies to all editions"
3. **Search results**: If user has rated any edition of a work, show star on all editions
4. **My ratings page**: List by work, not by edition

**Tasks:**
- [x] Update book detail page to fetch/display work-level rating
- [x] Add subtle indicator that rating is work-level (tooltip or small text)
- [x] Update search results to show rated status by workId
- [x] Create/update "My Ratings" page to list work ratings with representative edition
- [x] Handle edge case: book without workId still shows edition-level rating

**Files to modify:**
- `app/book/[isbn]/page.tsx`
- `components/rating-input.tsx`
- `components/book-card.tsx`
- `app/search/page.tsx`
- `app/ratings/page.tsx`
- `app/api/books/isbn/[isbn]/route.ts`

**Acceptance criteria:**
- [x] User sees same rating on all editions of a work
- [x] Clear indication that ratings are work-level
- [x] My Ratings shows deduplicated list

---

## Data Model (ERD)

```mermaid
erDiagram
    User ||--o{ WorkRating : "rates works"
    User ||--o{ UserRating : "legacy ratings"
    Book ||--o{ UserRating : "has legacy ratings"

    User {
        string id PK
        string email
        string passwordHash
    }

    Book {
        string id PK
        string isbn13 UK
        string openLibraryWorkId IX
        string title
        string[] authors
        string[] subjects
        string[] genres
        int pageCount
        int publicationYear
        string coverUrl
        json metadata
        datetime lastEnrichedAt
    }

    WorkRating {
        string id PK
        string userId FK
        string openLibraryWorkId IX
        float rating
        datetime ratedAt
        string source
        string notes
    }

    UserRating {
        string id PK
        string userId FK
        string bookId FK
        float rating
        boolean migratedToWorkRating
    }
```

---

## Migration Strategy

### Phase 1: Non-Breaking Changes (M5.1)
- Add new fields to Book model (nullable)
- Backfill workId from existing metadata
- No API changes yet

### Phase 2: New Model + Dual Write (M5.2-M5.3)
- Create WorkRating model
- Migrate existing UserRating → WorkRating
- Update APIs to write to both models during transition
- Read from WorkRating, fall back to UserRating

### Phase 3: Complete Migration (M5.4-M5.8)
- Remove dual write
- Deprecate UserRating reads
- Full work-level UX
- Eventually: remove UserRating model (future cleanup)

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OpenLibrary work matching errors | Medium | Medium | Allow manual work ID override; synthetic IDs for unmatched |
| Google Books rate limiting | Medium | Low | Implement backoff; works without API key at lower limits |
| Data loss during rating migration | Low | High | Keep UserRating as backup; validate migration counts |
| Prediction quality regression | Medium | Medium | A/B test new features; feature flags for rollback |
| User confusion about work-level ratings | Medium | Low | Clear UI messaging; help tooltips |

---

## Dependencies

- **M5.1** is independent (can start immediately)
- **M5.2** depends on M5.1 (needs workId field)
- **M5.3** depends on M5.2 (needs WorkRating model)
- **M5.4** depends on M5.2 + M5.3
- **M5.5** is independent (can parallel with M5.1-M5.2)
- **M5.6** depends on M5.5 (needs Google Books integration)
- **M5.7** depends on M5.6 (needs enriched data)
- **M5.8** depends on M5.3 (needs work-level rating APIs)

**Suggested order:**
1. M5.1 (schema) + M5.5 (Google Books) in parallel
2. M5.2 (WorkRating model)
3. M5.3 (rating APIs) + M5.6 (enrichment) in parallel
4. M5.4 (import)
5. M5.7 (prediction) + M5.8 (frontend) in parallel

---

## Success Metrics

- [ ] 100% of books with OpenLibrary data have `openLibraryWorkId` populated
- [ ] 0 duplicate work ratings per user (enforced by unique constraint)
- [ ] >80% of books have genres populated (via Google Books)
- [ ] >70% of books have page count populated
- [ ] Prediction accuracy maintains or improves (measure via saved predictions)

---

## References

### Internal
- [OpenLibrary enrichment learning](../solutions/api-integrations/open-library-subject-enrichment.md)
- [Current Book model](../../prisma/schema.prisma:20-32)
- [Current prediction tokenizer](../../lib/prediction/tokenizer.ts:61-72)
- [OpenLibrary integration](../../lib/books/openlibrary.ts:101-161)

### External
- [OpenLibrary Works API](https://openlibrary.org/dev/docs/api/books)
- [Google Books API](https://developers.google.com/books/docs/v1/using)
