import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { fetchWorkSubjects } from './openlibrary';

export interface EnrichmentResult {
  bookId: string;
  success: boolean;
  subjectsAdded: number;
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
 * Enrich a single book with subjects from Open Library.
 * Skips books that already have subjects (unless force is true).
 */
export async function enrichBook(
  bookId: string,
  options?: { force?: boolean }
): Promise<EnrichmentResult> {
  const { force = false } = options || {};

  const book = await db.book.findUnique({
    where: { id: bookId },
  });

  if (!book) {
    return { bookId, success: false, subjectsAdded: 0, error: 'Book not found' };
  }

  // Skip if already has subjects (unless force)
  if (!force && book.subjects.length > 0) {
    return { bookId, success: true, subjectsAdded: 0 };
  }

  // Extract work key from metadata
  const metadata = book.metadata as { works?: { key: string }[] } | null;
  const workKey = metadata?.works?.[0]?.key;

  if (!workKey) {
    return {
      bookId,
      success: false,
      subjectsAdded: 0,
      error: 'No work key in metadata',
    };
  }

  try {
    const subjects = await fetchWorkSubjects(workKey);

    await db.book.update({
      where: { id: bookId },
      data: {
        subjects,
        lastEnrichedAt: new Date(),
      },
    });

    console.log(
      `[Enrichment] Book ${bookId} enriched with ${subjects.length} subjects`
    );

    return { bookId, success: true, subjectsAdded: subjects.length };
  } catch (error) {
    console.error(`[Enrichment] Failed to enrich book ${bookId}:`, error);
    return {
      bookId,
      success: false,
      subjectsAdded: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Enrich multiple books that are missing subjects.
 * Respects rate limits with configurable delay between requests.
 */
export async function enrichAllBooks(options?: {
  batchSize?: number;
  delayMs?: number;
}): Promise<BatchEnrichmentStats> {
  const { batchSize = 50, delayMs = 1000 } = options || {};

  // Find books without subjects that have metadata with work keys
  const books = await db.book.findMany({
    where: {
      subjects: { isEmpty: true },
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
      if (result.subjectsAdded > 0) {
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
    highCoverage: results.filter((r) => r.subjectsAdded >= 10).length,
    noCoverage: results.filter((r) => r.subjectsAdded === 0 && r.success).length,
  });

  return stats;
}

/**
 * Check if a book needs enrichment.
 * Returns true if the book has no subjects and has a work key in metadata.
 */
export function needsEnrichment(book: {
  subjects: string[];
  metadata: unknown;
  lastEnrichedAt: Date | null;
}): boolean {
  // Already has subjects
  if (book.subjects.length > 0) {
    return false;
  }

  // Check if metadata has work key
  const metadata = book.metadata as { works?: { key: string }[] } | null;
  const hasWorkKey = Boolean(metadata?.works?.[0]?.key);

  return hasWorkKey;
}
