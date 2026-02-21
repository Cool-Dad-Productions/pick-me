import 'server-only';
import {
  TfIdfVectorizer,
  type BookDocument,
  cosineSimilarity,
  getMatchingTerms,
  MIN_SIMILARITY_THRESHOLD,
} from './index';

// ============================================================================
// Configurable Constants
// These can be adjusted to tune prediction behavior
// ============================================================================

/** Number of similar books to use for prediction rationale */
export const TOP_K_SIMILAR = 3;

/** Minimum number of similar books needed for high confidence */
export const MIN_BOOKS_FOR_HIGH_CONFIDENCE = 3;

/** Weight factor for book count in confidence calculation (0-1) */
export const BOOK_COUNT_WEIGHT = 0.3;

/** Weight factor for similarity score in confidence calculation (0-1) */
export const SIMILARITY_WEIGHT = 0.7;

/** Low confidence threshold - below this, predictions are marked as uncertain */
export const LOW_CONFIDENCE_THRESHOLD = 0.3;

// ============================================================================
// Types
// ============================================================================

export interface RatedBook {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  subjects: string[];
  genres: string[];
  tags: string[];
  pageCount: number | null;
  publicationYear: number | null;
  rating: number;
}

export interface SimilarBook {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  rating: number;
  similarity: number;
  matchingTerms: string[];
}

export interface PredictionInput {
  targetBook: BookDocument;
  ratedBooks: RatedBook[];
}

export interface PredictionOutput {
  predictedRating: number | null;
  confidence: number | null;
  similarBooks: SimilarBook[];
  reason: 'success' | 'no_similar_books' | 'low_similarity';
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Round a rating to the nearest 0.5 increment
 * e.g., 3.7 -> 3.5, 3.8 -> 4.0, 4.2 -> 4.0
 */
export function roundToHalfStar(rating: number): number {
  return Math.round(rating * 2) / 2;
}

/**
 * Clamp a rating to the valid range [1.0, 5.0]
 */
function clampRating(rating: number): number {
  return Math.max(1.0, Math.min(5.0, rating));
}

/**
 * Calculate confidence score based on similarity scores and book count
 *
 * Confidence factors:
 * 1. Average similarity of top books (higher = more confident)
 * 2. Number of similar books found (more books = more confident)
 *
 * Formula: confidence = (avgSimilarity * SIMILARITY_WEIGHT) +
 *                       (bookCountFactor * BOOK_COUNT_WEIGHT)
 *
 * Where bookCountFactor = min(numBooks / MIN_BOOKS_FOR_HIGH_CONFIDENCE, 1)
 */
export function calculateConfidence(
  similarities: number[],
  numBooksFound: number
): number {
  if (similarities.length === 0) {
    return 0;
  }

  // Average similarity of the books used
  const avgSimilarity =
    similarities.reduce((sum, s) => sum + s, 0) / similarities.length;

  // Book count factor: scales from 0 to 1 based on how many similar books found
  // If we found MIN_BOOKS_FOR_HIGH_CONFIDENCE or more, factor is 1.0
  const bookCountFactor = Math.min(
    numBooksFound / MIN_BOOKS_FOR_HIGH_CONFIDENCE,
    1.0
  );

  // Weighted combination
  const confidence =
    avgSimilarity * SIMILARITY_WEIGHT + bookCountFactor * BOOK_COUNT_WEIGHT;

  return confidence;
}

// ============================================================================
// Main Prediction Function
// ============================================================================

/**
 * Predict a user's rating for a target book based on their rated books
 *
 * Algorithm:
 * 1. Build TF-IDF vectors for all books (target + rated)
 * 2. Compute cosine similarity between target and each rated book
 * 3. Find top-k most similar books above threshold
 * 4. Calculate predicted rating as weighted average: Σ(sim × rating) / Σ(sim)
 * 5. Calculate confidence based on similarity scores and book count
 *
 * @param input - Target book and user's rated books
 * @returns Prediction with rating, confidence, and similar books for rationale
 */
export function predictRating(input: PredictionInput): PredictionOutput {
  const { targetBook, ratedBooks } = input;

  // Need rated books to make predictions
  if (ratedBooks.length === 0) {
    return {
      predictedRating: null,
      confidence: null,
      similarBooks: [],
      reason: 'no_similar_books',
    };
  }

  // Convert rated books to BookDocument format for TF-IDF
  const ratedBookDocs: BookDocument[] = ratedBooks.map(book => ({
    id: book.id,
    title: book.title,
    authors: book.authors,
    subjects: book.subjects,
    genres: book.genres,
    tags: book.tags,
    pageCount: book.pageCount,
    publicationYear: book.publicationYear,
  }));

  // Build corpus including target book and all rated books
  const allBooks = [targetBook, ...ratedBookDocs];

  // Fit TF-IDF on entire corpus and get vectors
  const vectorizer = new TfIdfVectorizer();
  const vectors = vectorizer.fitTransform(allBooks);

  const targetVector = vectors.get(targetBook.id);
  if (!targetVector) {
    // This shouldn't happen, but handle gracefully
    return {
      predictedRating: null,
      confidence: null,
      similarBooks: [],
      reason: 'no_similar_books',
    };
  }
  vectors.delete(targetBook.id); // we don't want to test similarity to the same book

  // Compute similarity between target and each rated book
  type SimilarityWithRating = {
    book: RatedBook;
    similarity: number;
    matchingTerms: string[];
  };

  const similarities: SimilarityWithRating[] = [];

  for (const ratedBook of ratedBooks) {
    const ratedVector = vectors.get(ratedBook.id);
    if (!ratedVector) continue; // don't include this book in the comparison

    const similarity = cosineSimilarity(targetVector, ratedVector);

    // Only include books above minimum threshold
    if (similarity >= MIN_SIMILARITY_THRESHOLD) {
      const matchingTerms = getMatchingTerms(targetVector, ratedVector, 5);
      similarities.push({
        book: ratedBook,
        similarity,
        matchingTerms,
      });
    }
  }

  // No similar books found above threshold
  if (similarities.length === 0) {
    return {
      predictedRating: null,
      confidence: null,
      similarBooks: [],
      reason: 'no_similar_books',
    };
  }

  // Sort by similarity descending and take top k
  similarities.sort((a, b) => b.similarity - a.similarity);
  const topSimilar = similarities.slice(0, TOP_K_SIMILAR);

  // Calculate weighted average rating
  // predicted_rating = Σ(similarity[i] × rating[i]) / Σ(similarity[i])
  let weightedSum = 0;
  let totalWeight = 0;

  for (const { book, similarity } of topSimilar) {
    weightedSum += similarity * book.rating;
    totalWeight += similarity;
  }

  const rawPrediction = weightedSum / totalWeight;
  const predictedRating = roundToHalfStar(clampRating(rawPrediction));

  // Calculate confidence
  const topSimilarities = topSimilar.map(s => s.similarity);
  const confidence = calculateConfidence(topSimilarities, topSimilar.length);

  // Build similar books array for rationale
  const similarBooks: SimilarBook[] = topSimilar.map(
    ({ book, similarity, matchingTerms }) => ({
      id: book.id,
      isbn13: book.isbn13,
      title: book.title,
      authors: book.authors,
      rating: book.rating,
      similarity,
      matchingTerms,
    })
  );

  // Check if confidence is too low
  const reason =
    confidence < LOW_CONFIDENCE_THRESHOLD ? 'low_similarity' : 'success';

  return {
    predictedRating,
    confidence,
    similarBooks,
    reason,
  };
}
