---
title: "M5.5: Google Books API Integration"
type: feat
date: 2026-02-17
milestone: 5.5
---

# M5.5: Google Books API Integration

## Overview

Add Google Books API integration to fetch genres, page counts, and publication dates for books. This enriches the metadata available for predictions beyond what OpenLibrary provides, particularly for curated genre/category data.

## Problem Statement

Currently:
- OpenLibrary subjects are unstructured (mix of genres, themes, settings, formats)
- No reliable page count data for many books
- Publication dates sometimes missing or inconsistent
- Prediction model has limited signals for similarity matching

Google Books provides curated categories and reliable metadata that improves prediction quality.

## Proposed Solution

1. Create `lib/books/googlebooks.ts` with ISBN and title/author lookup functions
2. Implement daily quota-based rate limiting (100/day without key, 1000/day with key)
3. Update enrichment service to call both OpenLibrary and Google Books
4. Normalize Google Books categories to genres array

## Technical Approach

### API Integration

**Endpoint:** `GET https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}`

**Key Response Fields:**
```json
{
  "items": [{
    "volumeInfo": {
      "categories": ["Fiction / Literary", "Fiction / Classics"],
      "pageCount": 320,
      "publishedDate": "2003-05-15",
      "description": "..."
    }
  }]
}
```

### Architecture Decisions

**Rate Limiting Strategy:** In-memory singleton with daily reset at midnight UTC. For this personal-scale application, this is sufficient. If quota is exceeded, Google Books enrichment is skipped gracefully (OpenLibrary still runs).

**Call Pattern:** Sequential (OpenLibrary first, then Google Books). This allows early-exit optimization and simpler error handling.

**Category Normalization:** Split hierarchical categories on " / ", lowercase, trim, dedupe, limit to 20 genres max.

**Multiple Results Handling:** Match by exact ISBN in `industryIdentifiers`, fallback to first result.

---

## Implementation Tasks

### Task 1: Create Google Books Client Library

**File:** `lib/books/googlebooks.ts`

```typescript
import 'server-only';

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1';

export interface GoogleBooksMetadata {
  genres: string[];
  pageCount: number | null;
  publishedDate: string | null;
  description: string | null;
}

interface GoogleBooksVolume {
  volumeInfo: {
    title?: string;
    authors?: string[];
    categories?: string[];
    pageCount?: number;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
  };
}

interface GoogleBooksSearchResponse {
  totalItems: number;
  items?: GoogleBooksVolume[];
}

// Rate limiting - simple in-memory counter
let dailyRequestCount = 0;
let lastResetDate = new Date().toISOString().split('T')[0];

function checkAndIncrementQuota(): boolean {
  const today = new Date().toISOString().split('T')[0];
  if (today !== lastResetDate) {
    dailyRequestCount = 0;
    lastResetDate = today;
  }

  const limit = process.env.GOOGLE_BOOKS_API_KEY ? 1000 : 100;
  if (dailyRequestCount >= limit) {
    console.warn(`[GoogleBooks] Daily quota exhausted (${limit} requests)`);
    return false;
  }

  dailyRequestCount++;
  return true;
}

export function getQuotaStatus(): { used: number; limit: number; remaining: number } {
  const limit = process.env.GOOGLE_BOOKS_API_KEY ? 1000 : 100;
  return {
    used: dailyRequestCount,
    limit,
    remaining: Math.max(0, limit - dailyRequestCount),
  };
}

function normalizeCategories(categories: string[] | undefined): string[] {
  if (!categories || categories.length === 0) return [];

  const normalized = new Set<string>();
  for (const category of categories) {
    // Split hierarchical categories like "Fiction / Literary"
    const parts = category.split(' / ').map(p => p.toLowerCase().trim());
    parts.forEach(p => {
      if (p && p.length > 1) normalized.add(p);
    });
  }

  return Array.from(normalized).slice(0, 20);
}

function extractYear(publishedDate: string | undefined): number | null {
  if (!publishedDate) return null;
  const match = publishedDate.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function findVolumeByIsbn(items: GoogleBooksVolume[], isbn: string): GoogleBooksVolume | null {
  // Try exact ISBN match first
  const normalizedIsbn = isbn.replace(/-/g, '');
  for (const item of items) {
    const identifiers = item.volumeInfo.industryIdentifiers || [];
    for (const id of identifiers) {
      if (id.identifier.replace(/-/g, '') === normalizedIsbn) {
        return item;
      }
    }
  }
  // Fallback to first result
  return items[0] || null;
}

export async function lookupByIsbn(isbn: string): Promise<GoogleBooksMetadata | null> {
  if (!checkAndIncrementQuota()) {
    return null;
  }

  const normalizedIsbn = isbn.replace(/-/g, '');
  const params = new URLSearchParams({ q: `isbn:${normalizedIsbn}` });

  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }

  const url = `${GOOGLE_BOOKS_API}/volumes?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[GoogleBooks] Rate limited by API');
        return null;
      }
      console.error(`[GoogleBooks] API error: ${response.status}`);
      return null;
    }

    const data: GoogleBooksSearchResponse = await response.json();

    console.log('[GoogleBooks] ISBN lookup:', {
      isbn: normalizedIsbn,
      totalItems: data.totalItems,
    });

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const volume = findVolumeByIsbn(data.items, normalizedIsbn);
    if (!volume) return null;

    const { volumeInfo } = volume;

    return {
      genres: normalizeCategories(volumeInfo.categories),
      pageCount: volumeInfo.pageCount ?? null,
      publishedDate: volumeInfo.publishedDate ?? null,
      description: volumeInfo.description ?? null,
    };
  } catch (error) {
    console.error('[GoogleBooks] Lookup failed:', error);
    return null;
  }
}

export async function lookupByTitle(
  title: string,
  author?: string
): Promise<GoogleBooksMetadata | null> {
  if (!checkAndIncrementQuota()) {
    return null;
  }

  let query = `intitle:${title}`;
  if (author) {
    query += `+inauthor:${author}`;
  }

  const params = new URLSearchParams({ q: query, maxResults: '5' });

  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }

  const url = `${GOOGLE_BOOKS_API}/volumes?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[GoogleBooks] API error: ${response.status}`);
      return null;
    }

    const data: GoogleBooksSearchResponse = await response.json();

    console.log('[GoogleBooks] Title lookup:', {
      title,
      author,
      totalItems: data.totalItems,
    });

    if (!data.items || data.items.length === 0) {
      return null;
    }

    // Take first result for title search
    const { volumeInfo } = data.items[0];

    return {
      genres: normalizeCategories(volumeInfo.categories),
      pageCount: volumeInfo.pageCount ?? null,
      publishedDate: volumeInfo.publishedDate ?? null,
      description: volumeInfo.description ?? null,
    };
  } catch (error) {
    console.error('[GoogleBooks] Title lookup failed:', error);
    return null;
  }
}
```

### Task 2: Update Types

**File:** `types/index.ts`

Add the `GoogleBooksMetadata` export if not already present (it's defined in the client, but re-export for convenience):

```typescript
export type { GoogleBooksMetadata } from '@/lib/books/googlebooks';
```

### Task 3: Update Enrichment Service

**File:** `lib/books/enrichment.ts`

Update `enrichBook()` to call Google Books after OpenLibrary:

```typescript
import { lookupByIsbn as googleBooksLookup } from './googlebooks';

export interface EnrichmentResult {
  bookId: string;
  success: boolean;
  subjectsAdded: number;
  genresAdded: number;        // NEW
  pageCountSet: boolean;      // NEW
  sources: {                  // NEW
    openLibrary: boolean;
    googleBooks: boolean;
  };
  error?: string;
}

export async function enrichBook(
  bookId: string,
  options?: { force?: boolean }
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    bookId,
    success: false,
    subjectsAdded: 0,
    genresAdded: 0,
    pageCountSet: false,
    sources: { openLibrary: false, googleBooks: false },
  };

  try {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      result.error = 'Book not found';
      return result;
    }

    // Check if enrichment needed
    const needsSubjects = book.subjects.length === 0;
    const needsGenres = book.genres.length === 0;
    const needsPageCount = book.pageCount === null;

    if (!options?.force && !needsSubjects && !needsGenres && !needsPageCount) {
      result.success = true;
      return result;
    }

    const updates: Partial<Book> = {};

    // 1. OpenLibrary enrichment (existing logic for subjects)
    if (needsSubjects || options?.force) {
      // ... existing OpenLibrary logic ...
      result.sources.openLibrary = true;
    }

    // 2. Google Books enrichment (NEW)
    if ((needsGenres || needsPageCount) && book.isbn13) {
      const gbData = await googleBooksLookup(book.isbn13);
      if (gbData) {
        result.sources.googleBooks = true;

        if (gbData.genres.length > 0 && (needsGenres || options?.force)) {
          updates.genres = gbData.genres;
          result.genresAdded = gbData.genres.length;
        }

        if (gbData.pageCount && (needsPageCount || options?.force)) {
          updates.pageCount = gbData.pageCount;
          result.pageCountSet = true;
        }

        // Use Google Books publication year if OpenLibrary didn't provide it
        if (!book.publicationYear && gbData.publishedDate) {
          const year = parseInt(gbData.publishedDate.substring(0, 4), 10);
          if (!isNaN(year)) {
            updates.publicationYear = year;
          }
        }
      }
    }

    // Update book if we have changes
    if (Object.keys(updates).length > 0) {
      updates.lastEnrichedAt = new Date();
      await prisma.book.update({
        where: { id: bookId },
        data: updates,
      });
    }

    result.success = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}
```

### Task 4: Update Environment Variables

**File:** `.env.example`

Already has the placeholder:
```bash
# Optional: Google Books API (higher rate limits)
GOOGLE_BOOKS_API_KEY=
```

No changes needed.

---

## Acceptance Criteria

- [x] `lib/books/googlebooks.ts` created with `lookupByIsbn()` and `lookupByTitle()` functions
- [x] Google Books API called during enrichment when book has ISBN
- [x] Genres populated from Google Books categories (normalized, deduped)
- [x] Page count populated when available from Google Books
- [x] Publication year falls back to Google Books if OpenLibrary didn't provide it
- [x] Rate limiting enforces 100 requests/day without API key, 1000/day with key
- [x] Graceful fallback when Google Books has no data (OpenLibrary enrichment still succeeds)
- [x] Quota status available via `getQuotaStatus()` for monitoring
- [x] Console logging follows `[GoogleBooks]` prefix pattern

---

## Testing Checklist

- [ ] ISBN lookup returns genres, pageCount, publishedDate for known book
- [ ] ISBN lookup returns null for unknown ISBN (graceful handling)
- [ ] Title/author lookup returns results for popular book
- [ ] Rate limit counter increments correctly
- [ ] Rate limit blocks requests after quota exhausted
- [ ] Rate limit resets at midnight UTC
- [ ] API key presence increases quota from 100 to 1000
- [ ] Enrichment service calls Google Books after OpenLibrary
- [ ] Partial failures don't block other enrichment sources
- [ ] `server-only` guard prevents client-side import

---

## Dependencies

- **M5.1 (Complete):** Book model has `genres`, `pageCount`, `publicationYear` fields
- **M5.2 (Complete):** WorkRating model exists (not directly needed but part of milestone)
- **No blockers:** This milestone can proceed independently

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/books/googlebooks.ts` | Create | Google Books API client with rate limiting |
| `lib/books/enrichment.ts` | Modify | Add Google Books call after OpenLibrary |
| `types/index.ts` | Modify | Re-export GoogleBooksMetadata type (optional) |

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Google Books rate limiting | Medium | Low | In-memory quota tracking, graceful degradation |
| Missing categories for some books | Medium | Low | Fall back to OpenLibrary subjects for prediction |
| API response format changes | Low | Medium | Type-safe parsing with null checks |
| Serverless quota state loss | Medium | Low | Accept occasional over-quota for simplicity |

---

## References

### Internal
- [OpenLibrary integration](../../lib/books/openlibrary.ts) - Pattern reference
- [Enrichment service](../../lib/books/enrichment.ts) - Service to update
- [M5 plan](./2026-02-17-m5-improved-metadata-canonical-works-plan.md) - Parent milestone

### External
- [Google Books API docs](https://developers.google.com/books/docs/v1/using)
- [Volumes API reference](https://developers.google.com/books/docs/v1/reference/volumes)
