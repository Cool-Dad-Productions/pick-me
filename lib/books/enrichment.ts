import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { fetchWorkSubjects } from './openlibrary';
import { lookupByIsbn as googleBooksLookup } from './googlebooks';

export interface EnrichmentResult {
  bookId: string;
  success: boolean;
  subjectsAdded: number;
  genresAdded: number;
  pageCountSet: boolean;
  sources: {
    openLibrary: boolean;
    googleBooks: boolean;
  };
  error?: string;
}

export interface BatchEnrichmentStats {
  total: number;
  enriched: number;
  failed: number;
  skipped: number;
  results: EnrichmentResult[];
}

/**
 * Enrich a single book with subjects from Open Library and genres from Google Books.
 * Skips enrichment sources that already have data (unless force is true).
 */
export async function enrichBook(
  bookId: string,
  options?: { force?: boolean }
): Promise<EnrichmentResult> {
  const { force = false } = options || {};

  const result: EnrichmentResult = {
    bookId,
    success: false,
    subjectsAdded: 0,
    genresAdded: 0,
    pageCountSet: false,
    sources: { openLibrary: false, googleBooks: false },
  };

  const book = await db.book.findUnique({
    where: { id: bookId },
  });

  if (!book) {
    result.error = 'Book not found';
    return result;
  }

  // Check what enrichment is needed
  const needsSubjects = book.subjects.length === 0;
  const needsGenres = book.genres.length === 0;
  const needsPageCount = book.pageCount === null;

  console.log(`[Enrichment] Book ${bookId} needs:`, {
    needsSubjects,
    needsGenres,
    needsPageCount,
    hasIsbn: !!book.isbn13,
    isbn: book.isbn13,
    currentGenres: book.genres,
    currentPageCount: book.pageCount,
  });

  // Skip if nothing to do (unless force)
  if (!force && !needsSubjects && !needsGenres && !needsPageCount) {
    console.log(`[Enrichment] Book ${bookId} already enriched, skipping`);
    result.success = true;
    return result;
  }

  const updates: Prisma.BookUpdateInput = {};

  // 1. OpenLibrary enrichment for subjects
  if (needsSubjects || force) {
    const metadata = book.metadata as { works?: { key: string }[] } | null;
    const workKey = metadata?.works?.[0]?.key;

    if (workKey) {
      try {
        const subjects = await fetchWorkSubjects(workKey);
        if (subjects.length > 0) {
          updates.subjects = subjects;
          result.subjectsAdded = subjects.length;
          result.sources.openLibrary = true;
        }
      } catch (error) {
        console.error(`[Enrichment] OpenLibrary failed for book ${bookId}:`, error);
        // Continue with Google Books even if OpenLibrary fails
      }
    }
  }

  // 2. Google Books enrichment for genres and page count
  const shouldCallGoogleBooks = (needsGenres || needsPageCount || force) && book.isbn13;
  console.log(`[Enrichment] Google Books check:`, {
    shouldCall: shouldCallGoogleBooks,
    needsGenres,
    needsPageCount,
    force,
    hasIsbn: !!book.isbn13,
  });

  if (shouldCallGoogleBooks) {
    try {
      console.log(`[Enrichment] Calling Google Books for ISBN: ${book.isbn13}`);
      const gbData = await googleBooksLookup(book.isbn13!);
      console.log(`[Enrichment] Google Books response:`, gbData);
      if (gbData) {
        result.sources.googleBooks = true;

        if (gbData.genres.length > 0 && (needsGenres || force)) {
          updates.genres = gbData.genres;
          result.genresAdded = gbData.genres.length;
        }

        if (gbData.pageCount && (needsPageCount || force)) {
          updates.pageCount = gbData.pageCount;
          result.pageCountSet = true;
        }

        // Use Google Books publication year if not already set
        if (!book.publicationYear && gbData.publishedDate) {
          const year = parseInt(gbData.publishedDate.substring(0, 4), 10);
          if (!isNaN(year)) {
            updates.publicationYear = year;
          }
        }
      }
    } catch (error) {
      console.error(`[Enrichment] Google Books failed for book ${bookId}:`, error);
      // Continue - partial enrichment is still valuable
    }
  }

  // Update book if we have any changes
  if (Object.keys(updates).length > 0) {
    updates.lastEnrichedAt = new Date();
    await db.book.update({
      where: { id: bookId },
      data: updates,
    });

    console.log(`[Enrichment] Book ${bookId} enriched:`, {
      subjectsAdded: result.subjectsAdded,
      genresAdded: result.genresAdded,
      pageCountSet: result.pageCountSet,
    });
  }

  result.success = true;
  return result;
}

/**
 * Enrich multiple books that are missing subjects, genres, or page count.
 * Respects rate limits with configurable delay between requests.
 */
export async function enrichAllBooks(options?: {
  batchSize?: number;
  delayMs?: number;
}): Promise<BatchEnrichmentStats> {
  const { batchSize = 50, delayMs = 1000 } = options || {};

  // Find books that need enrichment (missing subjects, genres, or page count)
  const books = await db.book.findMany({
    where: {
      OR: [
        { subjects: { isEmpty: true } },
        { genres: { isEmpty: true } },
        { pageCount: null },
      ],
      NOT: { metadata: { equals: Prisma.JsonNull } },
    },
    take: batchSize,
    select: { id: true },
  });

  const results: EnrichmentResult[] = [];
  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  for (const book of books) {
    const result = await enrichBook(book.id);
    results.push(result);

    if (result.success) {
      const anyEnriched =
        result.subjectsAdded > 0 || result.genresAdded > 0 || result.pageCountSet;
      if (anyEnriched) {
        enriched++;
      } else {
        skipped++;
      }
    } else {
      failed++;
    }

    // Rate limiting - wait between requests
    if (delayMs > 0 && books.indexOf(book) < books.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const stats: BatchEnrichmentStats = {
    total: books.length,
    enriched,
    failed,
    skipped,
    results,
  };

  // Log coverage stats
  console.log('[Enrichment] Batch complete:', {
    total: stats.total,
    enriched: stats.enriched,
    failed: stats.failed,
    skipped: stats.skipped,
    highSubjectCoverage: results.filter((r) => r.subjectsAdded >= 10).length,
    withGenres: results.filter((r) => r.genresAdded > 0).length,
    withPageCount: results.filter((r) => r.pageCountSet).length,
  });

  return stats;
}

/**
 * Check if a book needs enrichment.
 * Returns true if the book is missing subjects (with work key), genres, or page count (with ISBN).
 */
export function needsEnrichment(book: {
  subjects: string[];
  genres: string[];
  pageCount: number | null;
  isbn13: string | null;
  metadata: unknown;
  lastEnrichedAt: Date | null;
}): boolean {
  // Check if missing subjects and has work key for OpenLibrary
  const metadata = book.metadata as { works?: { key: string }[] } | null;
  const hasWorkKey = Boolean(metadata?.works?.[0]?.key);
  const needsSubjects = book.subjects.length === 0 && hasWorkKey;

  // Check if missing genres/pageCount and has ISBN for Google Books
  const hasIsbn = Boolean(book.isbn13);
  const needsGenres = book.genres.length === 0 && hasIsbn;
  const needsPageCount = book.pageCount === null && hasIsbn;

  return needsSubjects || needsGenres || needsPageCount;
}
