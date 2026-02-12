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

    // Check if user already has a rating for this book
    const existingRating = await db.userRating.findUnique({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId,
        },
      },
    });

    if (existingRating) {
      const prediction: PredictionResult = {
        predictedRating: existingRating.rating,
        confidence: 1.0,
        rationale: [
          {
            type: 'existing_rating',
            message: 'You have already rated this book',
          },
        ],
      };
      return NextResponse.json(prediction);
    }

    // Count user's ratings to check if we have enough data
    const ratingCount = await db.userRating.count({
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
    };

    // Fetch user's rated books with ratings and metadata
    const userRatings = await db.userRating.findMany({
      where: { userId: session.user.id },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            authors: true,
            subjects: true,
          },
        },
      },
    });

    const ratedBooks: RatedBook[] = userRatings.map(ur => ({
      id: ur.book.id,
      title: ur.book.title,
      authors: ur.book.authors,
      subjects: ur.book.subjects,
      rating: ur.rating,
    }));

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
