import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { predictSchema } from '@/lib/validations';
import { predictRating, type BookDocument, type RatedBook } from '@/lib/prediction';
import type { PredictionResult } from '@/types';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = predictSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { bookId } = result.data;

    // Verify book exists and fetch with enriched fields
    const book = await db.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        authors: true,
        subjects: true,
        genres: true,
        pageCount: true,
        publicationYear: true,
      },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    // Count user's work-level ratings to check if we have enough data
    const ratingCount = await db.workRating.count({
      where: { userId: session.user.id },
    });

    if (ratingCount < 5) {
      const prediction: PredictionResult = {
        predictedRating: null,
        confidence: null,
        rationale: [
          {
            type: 'insufficient_data',
            message: `Need at least 5 rated books to make predictions. You have ${ratingCount}.`,
          },
        ],
      };
      return NextResponse.json(prediction);
    }

    // Fetch target book with full metadata
    const targetBook: BookDocument = {
      id: book.id,
      title: book.title,
      authors: book.authors,
      subjects: book.subjects,
      genres: book.genres,
      pageCount: book.pageCount,
      publicationYear: book.publicationYear,
    };

    // Fetch user's work-level ratings
    const workRatings = await db.workRating.findMany({
      where: { userId: session.user.id },
    });

    // Batch fetch books for these work IDs
    const workIds = workRatings.map((r) => r.openLibraryWorkId);
    const books = await db.book.findMany({
      where: { openLibraryWorkId: { in: workIds } },
      select: {
        id: true,
        isbn13: true,
        title: true,
        authors: true,
        subjects: true,
        genres: true,
        pageCount: true,
        publicationYear: true,
        openLibraryWorkId: true,
      },
    });

    // Create lookup map (first book per work)
    const bookByWorkId = new Map<string, (typeof books)[0]>();
    for (const b of books) {
      if (b.openLibraryWorkId && !bookByWorkId.has(b.openLibraryWorkId)) {
        bookByWorkId.set(b.openLibraryWorkId, b);
      }
    }

    // Build rated books array, skipping any without a matching book
    const ratedBooks: RatedBook[] = workRatings
      .map((wr) => {
        const b = bookByWorkId.get(wr.openLibraryWorkId);
        if (!b) return null;
        return {
          id: b.id,
          isbn13: b.isbn13,
          title: b.title,
          authors: b.authors,
          subjects: b.subjects,
          genres: b.genres,
          pageCount: b.pageCount,
          publicationYear: b.publicationYear,
          rating: wr.rating,
        };
      })
      .filter((rb): rb is RatedBook => rb !== null);

    // Run prediction algorithm
    const predictionResult = predictRating({ targetBook, ratedBooks });

    // Build response based on prediction result
    if (predictionResult.reason === 'no_similar_books') {
      const prediction: PredictionResult = {
        predictedRating: null,
        confidence: null,
        rationale: [
          {
            type: 'no_similar_books',
            message:
              'Could not find similar books in your library to make a prediction.',
          },
        ],
      };
      return NextResponse.json(prediction);
    }

    // Build rationale with similar books
    const prediction: PredictionResult = {
      predictedRating: predictionResult.predictedRating,
      confidence: predictionResult.confidence,
      rationale: [
        {
          type: predictionResult.reason === 'low_similarity' ? 'low_confidence' : 'similar_books',
          message:
            predictionResult.reason === 'low_similarity'
              ? 'Prediction based on loosely similar books - take with a grain of salt.'
              : 'Prediction based on similar books you have rated.',
          data: {
            similarBooks: predictionResult.similarBooks.map(sb => ({
              id: sb.id,
              isbn13: sb.isbn13,
              title: sb.title,
              authors: sb.authors,
              yourRating: sb.rating,
              similarityPercent: Math.round(sb.similarity * 100),
              matchingTerms: sb.matchingTerms,
            })),
          },
        },
      ],
    };

    return NextResponse.json(prediction);
  } catch (error) {
    console.error('Prediction error:', error);
    return NextResponse.json(
      { error: 'Prediction failed' },
      { status: 500 }
    );
  }
}
