import { describe, it, expect, vi } from 'vitest';

// Mock server-only to avoid runtime errors in tests
vi.mock('server-only', () => ({}));

import {
  roundToHalfStar,
  calculateConfidence,
  predictRating,
  TOP_K_SIMILAR,
  MIN_BOOKS_FOR_HIGH_CONFIDENCE,
  LOW_CONFIDENCE_THRESHOLD,
  type RatedBook,
  type PredictionInput,
} from '../predictor';
import type { BookDocument } from '../tfidf';

describe('roundToHalfStar', () => {
  it('rounds down to 0.5 increment', () => {
    expect(roundToHalfStar(3.2)).toBe(3.0);
    expect(roundToHalfStar(3.7)).toBe(3.5);
    expect(roundToHalfStar(4.1)).toBe(4.0);
  });

  it('rounds up to 0.5 increment', () => {
    expect(roundToHalfStar(3.3)).toBe(3.5);
    expect(roundToHalfStar(3.8)).toBe(4.0);
    expect(roundToHalfStar(4.9)).toBe(5.0);
  });

  it('preserves exact 0.5 increments', () => {
    expect(roundToHalfStar(1.0)).toBe(1.0);
    expect(roundToHalfStar(1.5)).toBe(1.5);
    expect(roundToHalfStar(2.0)).toBe(2.0);
    expect(roundToHalfStar(4.5)).toBe(4.5);
    expect(roundToHalfStar(5.0)).toBe(5.0);
  });

  it('handles edge case at 0.25 (midpoint)', () => {
    // 3.25 should round to 3.5 (round half up)
    expect(roundToHalfStar(3.25)).toBe(3.5);
    // 3.75 should round to 4.0
    expect(roundToHalfStar(3.75)).toBe(4.0);
  });
});

describe('calculateConfidence', () => {
  it('returns 0 for empty similarities array', () => {
    expect(calculateConfidence([], 0)).toBe(0);
  });

  it('returns higher confidence with more books', () => {
    const singleBook = calculateConfidence([0.8], 1);
    const threeBooks = calculateConfidence([0.8, 0.8, 0.8], 3);

    expect(threeBooks).toBeGreaterThan(singleBook);
  });

  it('returns higher confidence with higher similarities', () => {
    const lowSim = calculateConfidence([0.3, 0.3, 0.3], 3);
    const highSim = calculateConfidence([0.9, 0.9, 0.9], 3);

    expect(highSim).toBeGreaterThan(lowSim);
  });

  it('caps book count factor at 1.0 when exceeding MIN_BOOKS_FOR_HIGH_CONFIDENCE', () => {
    // More books than minimum should not increase book count factor above 1
    const atMin = calculateConfidence([0.8, 0.8, 0.8], MIN_BOOKS_FOR_HIGH_CONFIDENCE);
    const overMin = calculateConfidence([0.8, 0.8, 0.8, 0.8, 0.8], MIN_BOOKS_FOR_HIGH_CONFIDENCE + 2);

    // Confidence should be the same since avg similarity is the same and book factor is capped
    expect(atMin).toBeCloseTo(overMin, 5);
  });

  it('uses configured weights for calculation', () => {
    // With 3 books at 100% similarity, confidence should be near maximum
    const maxConfidence = calculateConfidence([1.0, 1.0, 1.0], 3);
    expect(maxConfidence).toBeCloseTo(1.0, 5);
  });
});

describe('predictRating', () => {
  const createBook = (
    id: string,
    title: string,
    subjects: string[],
    options?: { genres?: string[]; pageCount?: number | null; publicationYear?: number | null }
  ): BookDocument => ({
    id,
    title,
    authors: ['Author'],
    subjects,
    genres: options?.genres ?? [],
    pageCount: options?.pageCount ?? null,
    publicationYear: options?.publicationYear ?? null,
  });

  const createRatedBook = (
    id: string,
    title: string,
    subjects: string[],
    rating: number,
    options?: { genres?: string[]; pageCount?: number | null; publicationYear?: number | null }
  ): RatedBook => ({
    id,
    title,
    authors: ['Author'],
    subjects,
    genres: options?.genres ?? [],
    pageCount: options?.pageCount ?? null,
    publicationYear: options?.publicationYear ?? null,
    rating,
  });

  it('returns no_similar_books when ratedBooks is empty', () => {
    const input: PredictionInput = {
      targetBook: createBook('target', 'Target Book', ['fantasy']),
      ratedBooks: [],
    };

    const result = predictRating(input);

    expect(result.reason).toBe('no_similar_books');
    expect(result.predictedRating).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.similarBooks).toEqual([]);
  });

  it('returns no_similar_books when no books are above similarity threshold', () => {
    const input: PredictionInput = {
      targetBook: createBook('target', 'Fantasy Adventure', ['fantasy', 'adventure']),
      ratedBooks: [
        // Completely different subjects
        createRatedBook('1', 'Science Report', ['science', 'research'], 4.0),
        createRatedBook('2', 'History Book', ['history', 'ancient'], 3.5),
      ],
    };

    const result = predictRating(input);

    expect(result.reason).toBe('no_similar_books');
    expect(result.predictedRating).toBeNull();
  });

  it('predicts rating based on similar books', () => {
    const input: PredictionInput = {
      targetBook: createBook('target', 'Fantasy Quest', ['fantasy', 'magic', 'adventure']),
      ratedBooks: [
        createRatedBook('1', 'Magic World', ['fantasy', 'magic'], 5.0),
        createRatedBook('2', 'Adventure Time', ['adventure', 'fantasy'], 4.0),
        createRatedBook('3', 'Spell Book', ['magic', 'spells'], 4.5),
      ],
    };

    const result = predictRating(input);

    expect(result.reason).toBe('success');
    expect(result.predictedRating).not.toBeNull();
    expect(result.predictedRating).toBeGreaterThanOrEqual(1.0);
    expect(result.predictedRating).toBeLessThanOrEqual(5.0);
    expect(result.similarBooks.length).toBeGreaterThan(0);
    expect(result.similarBooks.length).toBeLessThanOrEqual(TOP_K_SIMILAR);
  });

  it('returns rating in 0.5 increments', () => {
    const input: PredictionInput = {
      targetBook: createBook('target', 'Fantasy Quest', ['fantasy', 'magic']),
      ratedBooks: [
        createRatedBook('1', 'Magic World', ['fantasy', 'magic'], 4.7),
        createRatedBook('2', 'Fantasy Land', ['fantasy'], 3.2),
      ],
    };

    const result = predictRating(input);

    if (result.predictedRating !== null) {
      // Check it's a valid 0.5 increment
      const remainder = (result.predictedRating * 2) % 1;
      expect(remainder).toBeCloseTo(0, 5);
    }
  });

  it('clamps rating to valid range [1.0, 5.0]', () => {
    // Even with extreme ratings, result should be clamped
    const input: PredictionInput = {
      targetBook: createBook('target', 'Test Book', ['test']),
      ratedBooks: [
        createRatedBook('1', 'Test Similar', ['test'], 5.0),
      ],
    };

    const result = predictRating(input);

    if (result.predictedRating !== null) {
      expect(result.predictedRating).toBeGreaterThanOrEqual(1.0);
      expect(result.predictedRating).toBeLessThanOrEqual(5.0);
    }
  });

  it('weighs rating by similarity (more similar = more weight)', () => {
    // Book with higher similarity should have more influence
    const input: PredictionInput = {
      targetBook: createBook('target', 'Fantasy Magic Quest', ['fantasy', 'magic']),
      ratedBooks: [
        // Very similar (shares both terms) - rated 5.0
        createRatedBook('1', 'Fantasy Magic World', ['fantasy', 'magic'], 5.0),
        // Less similar (shares one term) - rated 1.0
        createRatedBook('2', 'Fantasy Adventure', ['fantasy', 'adventure'], 1.0),
      ],
    };

    const result = predictRating(input);

    // Prediction should be closer to 5.0 (the more similar book's rating)
    // than to 3.0 (the simple average)
    expect(result.predictedRating).toBeGreaterThan(3.0);
  });

  it('includes matching terms in similar books', () => {
    const input: PredictionInput = {
      targetBook: createBook('target', 'Fantasy Quest', ['fantasy', 'magic', 'adventure']),
      ratedBooks: [
        createRatedBook('1', 'Magic World', ['fantasy', 'magic'], 4.0),
      ],
    };

    const result = predictRating(input);

    expect(result.similarBooks.length).toBe(1);
    expect(result.similarBooks[0].matchingTerms).toBeDefined();
    expect(result.similarBooks[0].matchingTerms.length).toBeGreaterThan(0);
  });

  it('returns low_similarity when confidence is below threshold', () => {
    // This is tricky to test because it depends on the threshold
    // We need books that are similar enough to pass MIN_SIMILARITY_THRESHOLD
    // but result in low enough confidence
    const input: PredictionInput = {
      targetBook: createBook('target', 'Unique Book Title', ['rare', 'unique', 'special']),
      ratedBooks: [
        // Only one book with minimal overlap
        createRatedBook('1', 'Slightly Rare', ['rare', 'common', 'typical'], 3.0),
      ],
    };

    const result = predictRating(input);

    // Depending on exact similarity, this could be either success or low_similarity
    // What we're testing is that the reason reflects confidence level
    if (result.confidence !== null && result.confidence < LOW_CONFIDENCE_THRESHOLD) {
      expect(result.reason).toBe('low_similarity');
    }
  });

  it('sorts similar books by similarity descending', () => {
    const input: PredictionInput = {
      targetBook: createBook('target', 'Fantasy Magic', ['fantasy', 'magic']),
      ratedBooks: [
        createRatedBook('1', 'Some Fantasy', ['fantasy'], 4.0), // Less similar
        createRatedBook('2', 'Fantasy Magic Book', ['fantasy', 'magic'], 5.0), // More similar
        createRatedBook('3', 'Magic Tales', ['magic'], 3.0), // Less similar
      ],
    };

    const result = predictRating(input);

    // Similar books should be sorted by similarity descending
    for (let i = 1; i < result.similarBooks.length; i++) {
      expect(result.similarBooks[i - 1].similarity).toBeGreaterThanOrEqual(
        result.similarBooks[i].similarity
      );
    }
  });

  it('limits similar books to TOP_K_SIMILAR', () => {
    const input: PredictionInput = {
      targetBook: createBook('target', 'Fantasy', ['fantasy']),
      ratedBooks: [
        createRatedBook('1', 'Fantasy 1', ['fantasy'], 4.0),
        createRatedBook('2', 'Fantasy 2', ['fantasy'], 4.5),
        createRatedBook('3', 'Fantasy 3', ['fantasy'], 3.5),
        createRatedBook('4', 'Fantasy 4', ['fantasy'], 4.2),
        createRatedBook('5', 'Fantasy 5', ['fantasy'], 3.8),
      ],
    };

    const result = predictRating(input);

    expect(result.similarBooks.length).toBeLessThanOrEqual(TOP_K_SIMILAR);
  });
});

describe('configuration constants', () => {
  it('exports expected constants', () => {
    expect(TOP_K_SIMILAR).toBeDefined();
    expect(typeof TOP_K_SIMILAR).toBe('number');

    expect(MIN_BOOKS_FOR_HIGH_CONFIDENCE).toBeDefined();
    expect(typeof MIN_BOOKS_FOR_HIGH_CONFIDENCE).toBe('number');

    expect(LOW_CONFIDENCE_THRESHOLD).toBeDefined();
    expect(typeof LOW_CONFIDENCE_THRESHOLD).toBe('number');
    expect(LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(LOW_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });
});
