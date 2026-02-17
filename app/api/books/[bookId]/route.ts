import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { needsEnrichment, enrichBook } from '@/lib/books/enrichment';

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

    return NextResponse.json({ book });
  } catch (error) {
    console.error('Book fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch book' },
      { status: 500 }
    );
  }
}
