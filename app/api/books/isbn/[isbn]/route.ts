import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  lookupByIsbn as lookupByIsbnOpenLibrary,
  lookupWorkIdByIsbn,
} from '@/lib/books/openlibrary';
import {
  lookupBookByIsbn as lookupBookByIsbnGoogleBooks,
  isQuotaAvailable,
} from '@/lib/books/googlebooks';
import { normalizeIsbn } from '@/lib/validations';
import { needsEnrichment, enrichBook } from '@/lib/books/enrichment';
import { generateSyntheticWorkId, getWorkIdForBook } from '@/lib/books/workId';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ isbn: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { isbn } = await params;
    const normalizedIsbn = normalizeIsbn(isbn);

    if (!normalizedIsbn) {
      return NextResponse.json(
        { error: 'Invalid ISBN format' },
        { status: 400 }
      );
    }

    // Check if book already exists in DB
    let book = await db.book.findUnique({
      where: { isbn13: normalizedIsbn },
    });

    if (book) {
      // Lazy enrichment for existing books
      if (needsEnrichment(book)) {
        console.log(`[ISBN Route] Lazy enriching existing book ${book.id}`);
        const result = await enrichBook(book.id);
        if (result.success && (result.genresAdded > 0 || result.pageCountSet)) {
          book = await db.book.findUnique({
            where: { isbn13: normalizedIsbn },
          });
        }
      }

      // Lookup user's work-level rating
      const userRating = await getUserWorkRating(session.user.id, book);
      return NextResponse.json({ book, userRating });
    }

    // NEW: Google Books as primary source (with Open Library fallback)
    book = await lookupAndCreateBook(normalizedIsbn);

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Lookup user's work-level rating (may be null for new books)
    const userRating = await getUserWorkRating(session.user.id, book);
    return NextResponse.json({ book, userRating });
  } catch (error) {
    console.error('ISBN lookup error:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}

/**
 * Lookup book using Google Books as primary, Open Library as fallback.
 *
 * Flow:
 * 1. If Google Books quota available: Call Google Books first
 *    - If found: Also call Open Library for work ID (parallel)
 *    - Create book with GB data + OL work ID (or synthetic)
 * 2. If Google Books fails or quota exhausted: Fall back to Open Library
 * 3. Enrich book with any missing data
 */
async function lookupAndCreateBook(isbn: string) {
  // Check if Google Books quota is available
  if (isQuotaAvailable()) {
    console.log(`[ISBN Route] Trying Google Books first for ISBN ${isbn}`);
    const gbResult = await lookupBookByIsbnGoogleBooks(isbn);

    if (gbResult) {
      console.log(`[ISBN Route] Found in Google Books: "${gbResult.title}"`);

      // Fetch Open Library work ID in parallel (don't block on failure)
      const workIdPromise = lookupWorkIdByIsbn(isbn);

      // Determine the ISBN to use (prefer what Google Books found, fallback to input)
      const bookIsbn = gbResult.isbn13 || isbn;

      // Wait for work ID (with timeout protection)
      let openLibraryWorkId: string | null = null;
      try {
        openLibraryWorkId = await Promise.race([
          workIdPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
      } catch {
        console.warn(`[ISBN Route] Open Library work ID lookup failed`);
      }

      // Generate synthetic work ID if Open Library doesn't have this book
      const workId =
        openLibraryWorkId ||
        generateSyntheticWorkId(gbResult.title, gbResult.authors);

      if (!openLibraryWorkId) {
        console.log(
          `[ISBN Route] Using synthetic work ID: ${workId} (book not in Open Library)`
        );
      }

      // Create book with Google Books data + work ID
      const createData: Prisma.BookCreateInput = {
        isbn13: bookIsbn,
        title: gbResult.title,
        authors: gbResult.authors,
        coverUrl: gbResult.coverUrl,
        genres: gbResult.genres,
        pageCount: gbResult.pageCount,
        publicationYear: gbResult.publicationYear,
        googleBooksVolumeId: gbResult.googleBooksVolumeId,
        openLibraryWorkId: workId,
        // Google Books doesn't provide subjects (they call them categories/genres)
        // We already captured genres above, subjects will come from OL enrichment
        subjects: [],
        lastEnrichedAt: new Date(),
      };

      const book = await db.book.upsert({
        where: { isbn13: bookIsbn },
        create: createData,
        update: {},
      });

      // Enrich with Open Library subjects if we got a valid work ID
      if (openLibraryWorkId && needsEnrichment(book)) {
        console.log(
          `[ISBN Route] Enriching with Open Library subjects for ${book.id}`
        );
        await enrichBook(book.id);
        return db.book.findUnique({ where: { id: book.id } });
      }

      return book;
    }

    console.log(
      `[ISBN Route] Not found in Google Books, falling back to Open Library`
    );
  } else {
    console.log(
      `[ISBN Route] Google Books quota exhausted, using Open Library directly`
    );
  }

  // Fallback: Use Open Library as primary (original behavior)
  const olResult = await lookupByIsbnOpenLibrary(isbn);

  if (!olResult) {
    return null;
  }

  console.log(
    `[ISBN Route] Found in Open Library: "${olResult.title}" (work: ${olResult.openLibraryWorkId || 'none'})`
  );

  // Create book with Open Library data
  const book = await db.book.upsert({
    where: { isbn13: olResult.isbn13 },
    create: {
      isbn13: olResult.isbn13,
      title: olResult.title,
      authors: olResult.authors,
      subjects: olResult.subjects,
      coverUrl: olResult.coverUrl,
      metadata: olResult.metadata as Prisma.InputJsonValue,
      openLibraryWorkId:
        olResult.openLibraryWorkId ||
        generateSyntheticWorkId(olResult.title, olResult.authors),
      publicationYear: olResult.publicationYear,
      lastEnrichedAt: olResult.subjects.length > 0 ? new Date() : null,
    },
    update: {},
  });

  // Enrich with Google Books data (genres, pageCount)
  if (needsEnrichment(book)) {
    console.log(
      `[ISBN Route] Enriching Open Library book ${book.id} with Google Books`
    );
    const result = await enrichBook(book.id);
    if (result.success && (result.genresAdded > 0 || result.pageCountSet)) {
      return db.book.findUnique({ where: { id: book.id } });
    }
  }

  return book;
}

/**
 * Lookup user's work-level rating for a book.
 */
async function getUserWorkRating(
  userId: string,
  book: { openLibraryWorkId: string | null; title: string; authors: string[] } | null
): Promise<number | null> {
  if (!book) return null;

  const workId = getWorkIdForBook(book);

  const workRating = await db.workRating.findUnique({
    where: {
      userId_openLibraryWorkId: {
        userId,
        openLibraryWorkId: workId,
      },
    },
    select: { rating: true },
  });

  return workRating?.rating ?? null;
}
