import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { importCommitSchema, normalizeRating, normalizeIsbn } from '@/lib/validations';
import { generateSyntheticWorkId } from '@/lib/books/workId';
import { lookupWorkIdByIsbn } from '@/lib/books/openlibrary';

interface RawData {
  headers: string[];
  rows: string[][];
}

interface ImportStats {
  rowsProcessed: number;
  booksCreated: number;
  booksFound: number;
  workRatingsCreated: number;
  workRatingsUpdated: number;
  duplicateEditionsMerged: number;
  apiCallsMade: number;
  syntheticIdsGenerated: number;
  errors: number;
}

interface ErrorDetail {
  row: number;
  title: string;
  reason: string;
}

interface ResolvedImport {
  workId: string;
  bookId: string;
  rating: number;
  rowIndex: number;
}

// Delay between OpenLibrary API calls (1 second)
const OL_DELAY_MS = 1000;

/**
 * Resolve work ID for a book, with rate limiting for OpenLibrary API calls.
 * Updates the book record if we fetch a new work ID from OpenLibrary.
 */
async function resolveWorkIdWithRateLimit(
  book: {
    id: string;
    isbn13: string | null;
    openLibraryWorkId: string | null;
    title: string;
    authors: string[];
  },
  lastCallTime: { value: number },
  stats: ImportStats
): Promise<string> {
  // If book already has workId, use it
  if (book.openLibraryWorkId) {
    return book.openLibraryWorkId;
  }

  // If no ISBN, generate synthetic
  if (!book.isbn13) {
    stats.syntheticIdsGenerated++;
    return generateSyntheticWorkId(book.title, book.authors);
  }

  // Rate limit: ensure 1 second between calls
  const now = Date.now();
  const elapsed = now - lastCallTime.value;
  if (elapsed < OL_DELAY_MS && lastCallTime.value > 0) {
    await new Promise((resolve) => setTimeout(resolve, OL_DELAY_MS - elapsed));
  }
  lastCallTime.value = Date.now();
  stats.apiCallsMade++;

  // Call OpenLibrary API with timeout
  try {
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000)
    );
    const workId = await Promise.race([
      lookupWorkIdByIsbn(book.isbn13),
      timeoutPromise,
    ]);

    if (workId) {
      // Update book with resolved workId for future use
      await db.book.update({
        where: { id: book.id },
        data: { openLibraryWorkId: workId },
      });
      return workId;
    }
  } catch (error) {
    console.warn(`[Import] OpenLibrary lookup failed for ISBN ${book.isbn13}:`, error);
  }

  // Fallback to synthetic
  stats.syntheticIdsGenerated++;
  return generateSyntheticWorkId(book.title, book.authors);
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = importCommitSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { batchId, columnMap } = result.data;

    const batch = await db.importBatch.findFirst({
      where: {
        id: batchId,
        userId: session.user.id,
        status: 'pending',
      },
    });

    if (!batch || !batch.rawData) {
      return NextResponse.json(
        { error: 'Import batch not found or already processed' },
        { status: 404 }
      );
    }

    const rawData = batch.rawData as unknown as RawData;
    const { headers, rows } = rawData;

    // Get column indices
    const titleIdx = headers.indexOf(columnMap.title);
    const authorIdx = headers.indexOf(columnMap.author);
    const ratingIdx = headers.indexOf(columnMap.rating);
    const isbnIdx = columnMap.isbn ? headers.indexOf(columnMap.isbn) : -1;

    if (titleIdx === -1 || authorIdx === -1 || ratingIdx === -1) {
      return NextResponse.json(
        { error: 'Invalid column mapping' },
        { status: 400 }
      );
    }

    const stats: ImportStats = {
      rowsProcessed: 0,
      booksCreated: 0,
      booksFound: 0,
      workRatingsCreated: 0,
      workRatingsUpdated: 0,
      duplicateEditionsMerged: 0,
      apiCallsMade: 0,
      syntheticIdsGenerated: 0,
      errors: 0,
    };

    const errorDetails: ErrorDetail[] = [];
    const resolved: ResolvedImport[] = [];
    const lastCallTime = { value: 0 };

    // Phase 1: Process all rows - find/create books and resolve work IDs
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      try {
        const title = row[titleIdx]?.trim();
        const author = row[authorIdx]?.trim();
        const ratingStr = row[ratingIdx]?.trim();
        const isbn = isbnIdx >= 0 ? row[isbnIdx]?.trim() : null;

        if (!title || !author || !ratingStr) {
          // Skip rows with missing required fields (don't count as error)
          continue;
        }

        const ratingNum = parseFloat(ratingStr);
        if (isNaN(ratingNum)) {
          if (errorDetails.length < 10) {
            errorDetails.push({
              row: rowIndex + 1,
              title: title || 'Unknown',
              reason: 'Invalid rating value',
            });
          }
          stats.errors++;
          continue;
        }

        const rating = normalizeRating(ratingNum);
        const isbn13 = isbn ? normalizeIsbn(isbn) : null;

        stats.rowsProcessed++;

        // Find or create book
        let book = isbn13
          ? await db.book.findUnique({
              where: { isbn13 },
              select: {
                id: true,
                isbn13: true,
                title: true,
                authors: true,
                openLibraryWorkId: true,
              },
            })
          : await db.book.findFirst({
              where: {
                title: { equals: title, mode: 'insensitive' },
                authors: { has: author },
              },
              select: {
                id: true,
                isbn13: true,
                title: true,
                authors: true,
                openLibraryWorkId: true,
              },
            });

        if (book) {
          stats.booksFound++;
        } else {
          book = await db.book.create({
            data: {
              title,
              authors: [author],
              isbn13,
            },
            select: {
              id: true,
              isbn13: true,
              title: true,
              authors: true,
              openLibraryWorkId: true,
            },
          });
          stats.booksCreated++;
        }

        // Resolve work ID (with rate limiting for OpenLibrary calls)
        const workId = await resolveWorkIdWithRateLimit(book, lastCallTime, stats);

        resolved.push({
          workId,
          bookId: book.id,
          rating,
          rowIndex,
        });
      } catch (err) {
        console.error('Row import error:', err);
        if (errorDetails.length < 10) {
          const title = row[titleIdx]?.trim() || 'Unknown';
          errorDetails.push({
            row: rowIndex + 1,
            title,
            reason: err instanceof Error ? err.message : 'Unknown error',
          });
        }
        stats.errors++;
      }
    }

    // Phase 2: Deduplicate by workId - keep last occurrence (later entries override)
    const workMap = new Map<string, ResolvedImport>();
    for (const item of resolved) {
      if (workMap.has(item.workId)) {
        stats.duplicateEditionsMerged++;
      }
      workMap.set(item.workId, item);
    }

    // Phase 3: Create/update WorkRating records
    for (const [workId, item] of workMap) {
      try {
        // Check if rating already exists (for stats tracking)
        const existingRating = await db.workRating.findUnique({
          where: {
            userId_openLibraryWorkId: {
              userId: session.user.id,
              openLibraryWorkId: workId,
            },
          },
        });

        await db.workRating.upsert({
          where: {
            userId_openLibraryWorkId: {
              userId: session.user.id,
              openLibraryWorkId: workId,
            },
          },
          update: {
            rating: item.rating,
            ratedAt: new Date(),
            source: 'import',
          },
          create: {
            userId: session.user.id,
            openLibraryWorkId: workId,
            rating: item.rating,
            ratedAt: new Date(),
            source: 'import',
          },
        });

        if (existingRating) {
          stats.workRatingsUpdated++;
        } else {
          stats.workRatingsCreated++;
        }
      } catch (err) {
        console.error(`Error creating WorkRating for work ${workId}:`, err);
        stats.errors++;
      }
    }

    // Update batch status
    await db.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'committed',
        columnMap,
        stats: stats as unknown as Prisma.InputJsonValue,
        rawData: Prisma.JsonNull, // Clear raw data after commit
      },
    });

    return NextResponse.json({
      success: true,
      stats,
      ...(errorDetails.length > 0 && { errorDetails }),
    });
  } catch (error) {
    console.error('Import commit error:', error);
    return NextResponse.json(
      { error: 'Failed to commit import' },
      { status: 500 }
    );
  }
}
