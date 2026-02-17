import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ratingSchema } from '@/lib/validations';
import { getWorkIdForBook } from '@/lib/books/workId';

const createRatingSchema = z.object({
  bookId: z.string().min(1, 'Book ID is required'),
  rating: ratingSchema,
});

const listRatingsSchema = z.object({
  page: z.preprocess(
    (val) => (val === null || val === '' ? undefined : Number(val)),
    z.number().int().positive().default(1)
  ),
  limit: z.preprocess(
    (val) => (val === null || val === '' ? undefined : Number(val)),
    z.number().int().positive().max(100).default(20)
  ),
  sort: z.preprocess(
    (val) => (val === null || val === '' ? undefined : val),
    z.enum(['ratedAt:desc', 'ratedAt:asc', 'rating:desc', 'rating:asc']).default('ratedAt:desc')
  ),
  workId: z.preprocess(
    (val) => (val === null || val === '' ? undefined : val),
    z.string().optional()
  ),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = createRatingSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { bookId, rating } = result.data;

    // Verify book exists and get fields needed for work ID
    const book = await db.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        authors: true,
        openLibraryWorkId: true,
        coverUrl: true,
      },
    });

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Get work ID (real or synthetic)
    const workId = getWorkIdForBook(book);

    // Check if rating already exists (for 200 vs 201 response)
    const existingRating = await db.workRating.findUnique({
      where: {
        userId_openLibraryWorkId: {
          userId: session.user.id,
          openLibraryWorkId: workId,
        },
      },
    });

    const isUpdate = !!existingRating;

    // Create or update work-level rating
    const workRating = await db.workRating.upsert({
      where: {
        userId_openLibraryWorkId: {
          userId: session.user.id,
          openLibraryWorkId: workId,
        },
      },
      update: {
        rating,
        ratedAt: new Date(),
        source: 'manual',
      },
      create: {
        userId: session.user.id,
        openLibraryWorkId: workId,
        rating,
        ratedAt: new Date(),
        source: 'manual',
      },
    });

    return NextResponse.json(
      {
        rating: {
          id: workRating.id,
          workId: workRating.openLibraryWorkId,
          rating: workRating.rating,
          ratedAt: workRating.ratedAt?.toISOString(),
          source: workRating.source,
          book: {
            id: book.id,
            title: book.title,
            authors: book.authors,
            coverUrl: book.coverUrl,
          },
        },
      },
      { status: isUpdate ? 200 : 201 }
    );
  } catch (error) {
    console.error('Create rating error:', error);
    return NextResponse.json(
      { error: 'Failed to save rating' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const result = listRatingsSchema.safeParse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      sort: searchParams.get('sort'),
      workId: searchParams.get('workId') ?? undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { page, limit, sort, workId } = result.data;
    const skip = (page - 1) * limit;

    // Parse sort parameter
    const [sortField, sortDirection] = sort.split(':') as [string, 'asc' | 'desc'];

    // Build orderBy for WorkRating fields
    const orderBy = { [sortField]: sortDirection };

    // Build where clause with optional workId filter
    const where = {
      userId: session.user.id,
      ...(workId && { openLibraryWorkId: workId }),
    };

    // Get total count and paginated work ratings
    const [total, ratings] = await Promise.all([
      db.workRating.count({ where }),
      db.workRating.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    // Batch fetch representative books for each work
    const workIds = ratings.map((r) => r.openLibraryWorkId);
    const books = await db.book.findMany({
      where: { openLibraryWorkId: { in: workIds } },
      select: {
        id: true,
        isbn13: true,
        title: true,
        authors: true,
        coverUrl: true,
        openLibraryWorkId: true,
      },
    });

    // Create lookup map (pick first book per work)
    const bookByWorkId = new Map<string, (typeof books)[0]>();
    for (const book of books) {
      if (book.openLibraryWorkId && !bookByWorkId.has(book.openLibraryWorkId)) {
        bookByWorkId.set(book.openLibraryWorkId, book);
      }
    }

    return NextResponse.json({
      ratings: ratings.map((r) => ({
        id: r.id,
        workId: r.openLibraryWorkId,
        rating: r.rating,
        ratedAt: r.ratedAt?.toISOString() ?? r.createdAt.toISOString(),
        source: r.source,
        notes: r.notes,
        book: bookByWorkId.get(r.openLibraryWorkId) ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List ratings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ratings' },
      { status: 500 }
    );
  }
}
