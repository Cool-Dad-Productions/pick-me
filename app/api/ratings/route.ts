import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ratingSchema } from '@/lib/validations';

const createRatingSchema = z.object({
  bookId: z.string().min(1, 'Book ID is required'),
  rating: ratingSchema,
});

const listRatingsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['ratedAt:desc', 'ratedAt:asc', 'rating:desc', 'rating:asc', 'title:asc', 'title:desc']).default('ratedAt:desc'),
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

    // Verify book exists
    const book = await db.book.findUnique({
      where: { id: bookId },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    // Check if rating already exists
    const existingRating = await db.userRating.findUnique({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId,
        },
      },
    });

    const isUpdate = !!existingRating;

    // Create or update rating
    const userRating = await db.userRating.upsert({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId,
        },
      },
      update: {
        rating,
        ratedAt: new Date(),
        source: 'manual',
        // Clear import batch relationship when manually updating
        importBatchId: null,
      },
      create: {
        userId: session.user.id,
        bookId,
        rating,
        ratedAt: new Date(),
        source: 'manual',
      },
    });

    return NextResponse.json(
      {
        rating: {
          id: userRating.id,
          bookId: userRating.bookId,
          rating: userRating.rating,
          ratedAt: userRating.ratedAt?.toISOString(),
          source: userRating.source,
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
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { page, limit, sort } = result.data;
    const skip = (page - 1) * limit;

    // Parse sort parameter
    const [sortField, sortDirection] = sort.split(':') as [string, 'asc' | 'desc'];

    // Build orderBy based on sort field
    let orderBy: Record<string, unknown>;
    if (sortField === 'title') {
      orderBy = { book: { title: sortDirection } };
    } else {
      orderBy = { [sortField]: sortDirection };
    }

    // Get total count
    const total = await db.userRating.count({
      where: { userId: session.user.id },
    });

    // Get paginated ratings with book details
    const ratings = await db.userRating.findMany({
      where: { userId: session.user.id },
      include: {
        book: {
          select: {
            id: true,
            isbn13: true,
            title: true,
            authors: true,
            coverUrl: true,
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    });

    return NextResponse.json({
      ratings: ratings.map((r) => ({
        id: r.id,
        rating: r.rating,
        ratedAt: r.ratedAt?.toISOString() ?? r.createdAt.toISOString(),
        source: r.source,
        book: {
          id: r.book.id,
          isbn13: r.book.isbn13,
          title: r.book.title,
          authors: r.book.authors,
          coverUrl: r.book.coverUrl,
        },
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
