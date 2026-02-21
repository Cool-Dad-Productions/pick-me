import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { needsEnrichment, enrichBook } from '@/lib/books/enrichment';
import { getWorkIdForBook } from '@/lib/books/workId';
import { tagsSchema } from '@/lib/validations';
import { z } from 'zod';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId } = await params;

    let book = await db.book.findUnique({
      where: { id: bookId },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    // Lazy enrichment: fetch subjects/genres if not already enriched
    if (needsEnrichment(book)) {
      console.log(`[BookDetail] Lazy enriching book ${bookId}`);
      const result = await enrichBook(bookId);

      // Refetch if any enrichment occurred (subjects, genres, or page count)
      const anyEnriched =
        result.success &&
        (result.subjectsAdded > 0 || result.genresAdded > 0 || result.pageCountSet);

      if (anyEnriched) {
        // Refetch the updated book
        book = await db.book.findUnique({
          where: { id: bookId },
        });

        if (!book) {
          return NextResponse.json(
            { error: 'Book not found after enrichment' },
            { status: 404 }
          );
        }
      }
    }

    // Get work ID for rating lookup
    const workId = getWorkIdForBook(book);

    // Lookup user's work-level rating
    let userRating: number | null = null;
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

    return NextResponse.json({
      book: { ...book, workId },
      userRating,
    });
  } catch (error) {
    console.error('Book fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch book' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId } = await params;

    const body = await request.json();
    const result = z.object({ tags: tagsSchema }).safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    const book = await db.book.findUnique({
      where: { id: bookId },
      select: { openLibraryWorkId: true },
    });

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Work-level propagation: update all editions sharing the same work ID
    if (book.openLibraryWorkId) {
      await db.book.updateMany({
        where: { openLibraryWorkId: book.openLibraryWorkId },
        data: { tags: result.data.tags },
      });
    } else {
      await db.book.update({
        where: { id: bookId },
        data: { tags: result.data.tags },
      });
    }

    return NextResponse.json({ tags: result.data.tags });
  } catch (error) {
    console.error('Tag update error:', error);
    return NextResponse.json(
      { error: 'Failed to update tags' },
      { status: 500 }
    );
  }
}
