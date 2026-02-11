import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { lookupByIsbn } from '@/lib/books/openlibrary';
import { normalizeIsbn } from '@/lib/validations';

export async function GET(
  request: Request,
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
      return NextResponse.json({ book });
    }

    // Lookup from Open Library
    const bookData = await lookupByIsbn(normalizedIsbn);

    if (!bookData) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    // Create book record with subjects (enriched on creation)
    book = await db.book.create({
      data: {
        isbn13: bookData.isbn13,
        title: bookData.title,
        authors: bookData.authors,
        subjects: bookData.subjects,
        coverUrl: bookData.coverUrl,
        metadata: bookData.metadata as Prisma.InputJsonValue,
        lastEnrichedAt: bookData.subjects.length > 0 ? new Date() : null,
      },
    });

    return NextResponse.json({ book });
  } catch (error) {
    console.error('ISBN lookup error:', error);
    return NextResponse.json(
      { error: 'Lookup failed' },
      { status: 500 }
    );
  }
}
