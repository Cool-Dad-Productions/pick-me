---
title: "M2.1: Metadata Enrichment"
type: feat
date: 2026-02-11
parent: 2026-02-11-m2-real-predictor-roadmap.md
status: draft
---

# M2.1: Metadata Enrichment

## Overview

Extend the Open Library integration to fetch and store subjects/genres for books, enabling meaningful TF-IDF similarity matching in the prediction engine.

## Problem Statement

The current book data only includes title, authors, and ISBN. For TF-IDF similarity to work effectively, we need richer text content. Open Library's Works API provides subjects, genres, and descriptions that can dramatically improve similarity matching.

## Proposed Solution

1. Extend `lookupByIsbn` to fetch work-level subjects from Open Library
2. Add a `subjects` column to the Book model for efficient querying
3. Create an enrichment service that can backfill existing books
4. Handle missing data gracefully (some books have sparse metadata)

## Technical Approach

### Open Library Data Flow

```
ISBN Lookup → Edition Data → Work Key → Work Data (subjects)
     │              │              │           │
     └──────────────┴──────────────┴───────────┘
                          ▼
                    Book Record
                    - title
                    - authors
                    - subjects ← NEW
                    - metadata (raw JSON)
```

### API Endpoints Used

1. **Edition API** (existing): `https://openlibrary.org/isbn/{isbn}.json`
   - Returns: `works: [{ key: "/works/OL123W" }]`

2. **Works API** (new): `https://openlibrary.org/works/{id}.json`
   - Returns: `subjects: ["Fantasy", "Magic", "Dragons"]`

## Acceptance Criteria

### Functional Requirements
- [ ] New books fetched via ISBN include subjects from Works API
- [ ] Existing books can be enriched via new API endpoint
- [ ] Books with no subjects in Open Library return empty array (not error)
- [ ] Subjects are stored both in `subjects` column AND raw in `metadata`

### Non-Functional Requirements
- [ ] Enrichment of single book completes in <2s
- [ ] Batch enrichment respects rate limits (1 req/sec)
- [ ] No breaking changes to existing book lookup flow

## Implementation Plan

### Phase 1: Schema Migration

**File:** `prisma/schema.prisma`

Add subjects column to Book model:

```prisma
model Book {
  id        String       @id @default(cuid())
  isbn13    String?      @unique
  title     String
  authors   String[]
  subjects  String[]     @default([])  // NEW
  coverUrl  String?
  metadata  Json?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  ratings   UserRating[]
}
```

Run migration:
```bash
pnpm db:migrate:dev --name add-book-subjects
```

### Phase 2: Open Library Work Fetching

**File:** `lib/books/openLibrary.ts`

Add new function to fetch work data:

```typescript
// lib/books/openLibrary.ts

interface OpenLibraryWorkData {
  subjects?: string[];
  subject_places?: string[];
  subject_times?: string[];
  description?: string | { value: string };
}

export async function fetchWorkSubjects(workKey: string): Promise<string[]> {
  // workKey format: "/works/OL123W"
  const url = `${OPEN_LIBRARY_API}${workKey}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`[OpenLibrary] Failed to fetch work ${workKey}`);
    return [];
  }

  const data: OpenLibraryWorkData = await response.json();

  // Combine subjects, normalize, and dedupe
  const subjects = [
    ...(data.subjects || []),
    // Optionally include places/times for richer matching
  ];

  // Normalize: lowercase, trim, limit to 20 subjects
  return [...new Set(
    subjects
      .slice(0, 20)
      .map(s => s.toLowerCase().trim())
  )];
}
```

Update `lookupByIsbn` to include subjects:

```typescript
// lib/books/openLibrary.ts

export async function lookupByIsbn(isbn: string): Promise<NormalizedBook | null> {
  // ... existing code ...

  // Fetch subjects from work
  let subjects: string[] = [];
  if (data.works && data.works.length > 0) {
    subjects = await fetchWorkSubjects(data.works[0].key);
  }

  return {
    isbn13,
    title,
    authors: authorNames,
    subjects,  // NEW
    coverUrl: coverId ? `${COVERS_API}/b/id/${coverId}-M.jpg` : undefined,
    metadata: data,
  };
}
```

### Phase 3: Update Types

**File:** `types/index.ts`

```typescript
export interface NormalizedBook {
  isbn13: string;
  title: string;
  authors: string[];
  subjects: string[];  // NEW
  coverUrl?: string;
  metadata?: unknown;
}
```

### Phase 4: Enrichment Service

**File:** `lib/books/enrichment.ts` (NEW)

```typescript
// lib/books/enrichment.ts
import 'server-only';
import { db } from '@/lib/db';
import { fetchWorkSubjects } from './openLibrary';

export interface EnrichmentResult {
  bookId: string;
  success: boolean;
  subjectsAdded: number;
  error?: string;
}

export async function enrichBook(bookId: string): Promise<EnrichmentResult> {
  const book = await db.book.findUnique({
    where: { id: bookId },
  });

  if (!book) {
    return { bookId, success: false, subjectsAdded: 0, error: 'Book not found' };
  }

  // Skip if already has subjects
  if (book.subjects.length > 0) {
    return { bookId, success: true, subjectsAdded: 0 };
  }

  // Extract work key from metadata
  const metadata = book.metadata as { works?: { key: string }[] } | null;
  const workKey = metadata?.works?.[0]?.key;

  if (!workKey) {
    return { bookId, success: false, subjectsAdded: 0, error: 'No work key in metadata' };
  }

  const subjects = await fetchWorkSubjects(workKey);

  await db.book.update({
    where: { id: bookId },
    data: { subjects },
  });

  return { bookId, success: true, subjectsAdded: subjects.length };
}

export async function enrichAllBooks(options?: {
  batchSize?: number;
  delayMs?: number;
}): Promise<EnrichmentResult[]> {
  const { batchSize = 50, delayMs = 1000 } = options || {};

  // Find books without subjects
  const books = await db.book.findMany({
    where: { subjects: { isEmpty: true } },
    take: batchSize,
    select: { id: true },
  });

  const results: EnrichmentResult[] = [];

  for (const book of books) {
    const result = await enrichBook(book.id);
    results.push(result);

    // Rate limiting
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
```

### Phase 5: API Endpoint for Enrichment

**File:** `app/api/books/enrich/route.ts` (NEW)

```typescript
// app/api/books/enrich/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { enrichBook, enrichAllBooks } from '@/lib/books/enrichment';

// Enrich a single book
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookId, all } = await request.json();

  if (all) {
    // Enrich all books (admin/background operation)
    const results = await enrichAllBooks({ batchSize: 20, delayMs: 1000 });
    return NextResponse.json({
      enriched: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  }

  if (!bookId) {
    return NextResponse.json({ error: 'bookId required' }, { status: 400 });
  }

  const result = await enrichBook(bookId);
  return NextResponse.json(result);
}
```

### Phase 6: Update Book Creation Flow

**File:** `app/api/books/isbn/[isbn]/route.ts`

Ensure new books get subjects on creation:

```typescript
// When creating/updating book from ISBN lookup
const book = await db.book.upsert({
  where: { isbn13: normalizedBook.isbn13 },
  create: {
    isbn13: normalizedBook.isbn13,
    title: normalizedBook.title,
    authors: normalizedBook.authors,
    subjects: normalizedBook.subjects,  // NEW
    coverUrl: normalizedBook.coverUrl,
    metadata: normalizedBook.metadata,
  },
  update: {
    title: normalizedBook.title,
    authors: normalizedBook.authors,
    subjects: normalizedBook.subjects,  // NEW - backfill on re-lookup
    coverUrl: normalizedBook.coverUrl,
    metadata: normalizedBook.metadata,
  },
});
```

## Testing Plan

### Unit Tests

```typescript
// lib/books/__tests__/openLibrary.test.ts

describe('fetchWorkSubjects', () => {
  it('returns subjects from work data', async () => {
    // Mock Open Library response
    const subjects = await fetchWorkSubjects('/works/OL123W');
    expect(subjects).toContain('fantasy');
  });

  it('returns empty array for missing work', async () => {
    const subjects = await fetchWorkSubjects('/works/INVALID');
    expect(subjects).toEqual([]);
  });

  it('normalizes and dedupes subjects', async () => {
    // Given work with ["Fantasy", "FANTASY", "  fantasy  "]
    // Should return ["fantasy"]
  });
});
```

### Integration Tests

```typescript
// app/api/books/enrich/__tests__/route.test.ts

describe('POST /api/books/enrich', () => {
  it('enriches a book without subjects', async () => {
    // Create book without subjects
    // Call enrich endpoint
    // Verify subjects populated
  });

  it('skips books that already have subjects', async () => {
    // Create book WITH subjects
    // Call enrich endpoint
    // Verify subjectsAdded: 0
  });
});
```

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Edit | Add `subjects String[]` to Book |
| `lib/books/openLibrary.ts` | Edit | Add `fetchWorkSubjects`, update `lookupByIsbn` |
| `lib/books/enrichment.ts` | Create | Enrichment service for backfilling |
| `app/api/books/enrich/route.ts` | Create | API endpoint for triggering enrichment |
| `app/api/books/isbn/[isbn]/route.ts` | Edit | Include subjects on book creation |
| `types/index.ts` | Edit | Add `subjects` to `NormalizedBook` |

## Dependencies

- None (uses existing Open Library integration)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Open Library rate limiting | Add 1s delay between requests in batch mode |
| Books with no subjects in OL | Return empty array, algorithm handles gracefully |
| Work key missing in metadata | Log warning, skip enrichment for that book |

## References

- [Open Library Works API](https://openlibrary.org/dev/docs/api/books)
- Current Open Library wrapper: [lib/books/openLibrary.ts](lib/books/openLibrary.ts)
