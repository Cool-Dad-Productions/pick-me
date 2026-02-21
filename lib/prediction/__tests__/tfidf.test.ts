import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock server-only to avoid runtime errors in tests
vi.mock('server-only', () => ({}));

import { TfIdfVectorizer, type BookDocument } from '../tfidf';

describe('TfIdfVectorizer', () => {
  const books: BookDocument[] = [
    {
      id: '1',
      title: 'Fantasy Magic Adventure',
      authors: ['Author A'],
      subjects: ['fantasy', 'magic'],
      genres: ['Fantasy', 'Adventure'],
      tags: [],
      pageCount: 350,
      publicationYear: 2015,
    },
    {
      id: '2',
      title: 'Fantasy Dragons Quest',
      authors: ['Author B'],
      subjects: ['fantasy', 'dragons'],
      genres: ['Fantasy', 'Epic'],
      tags: [],
      pageCount: 500,
      publicationYear: 2018,
    },
    {
      id: '3',
      title: 'Science Robot Future',
      authors: ['Author C'],
      subjects: ['science fiction', 'robots'],
      genres: ['Science Fiction', 'Technology'],
      tags: [],
      pageCount: 280,
      publicationYear: 1985,
    },
  ];

  let vectorizer: TfIdfVectorizer;

  beforeEach(() => {
    vectorizer = new TfIdfVectorizer();
  });

  describe('fit', () => {
    it('fits without error', () => {
      expect(() => vectorizer.fit(books)).not.toThrow();
    });

    it('sets fitted flag', () => {
      expect(vectorizer.isFitted).toBe(false);
      vectorizer.fit(books);
      expect(vectorizer.isFitted).toBe(true);
    });

    it('builds vocabulary from all books', () => {
      vectorizer.fit(books);
      expect(vectorizer.vocabularySize).toBeGreaterThan(0);
    });

    it('handles empty array', () => {
      expect(() => vectorizer.fit([])).not.toThrow();
      expect(vectorizer.isFitted).toBe(true);
      expect(vectorizer.vocabularySize).toBe(0);
    });

    it('handles single book', () => {
      vectorizer.fit([books[0]]);
      expect(vectorizer.isFitted).toBe(true);
      expect(vectorizer.vocabularySize).toBeGreaterThan(0);
    });
  });

  describe('transform', () => {
    it('transforms to non-empty vector', () => {
      vectorizer.fit(books);
      const vector = vectorizer.transform(books[0]);
      expect(Object.keys(vector).length).toBeGreaterThan(0);
    });

    it('gives higher weight to rare terms', () => {
      vectorizer.fit(books);
      const vector = vectorizer.transform(books[0]);

      // 'adventure' appears only in book 1, 'contemporary_era' appears in 2 of 3 docs
      // Adventure should have higher weight as it's more rare
      expect(vector['adventure']).toBeDefined();
      expect(vector['contemporary_era']).toBeDefined();
      expect(vector['adventure']).toBeGreaterThan(vector['contemporary_era']);
    });

    it('throws if transform called before fit', () => {
      expect(() => vectorizer.transform(books[0])).toThrow(
        'Vectorizer must be fitted before transform'
      );
    });

    it('handles book with no matching vocabulary terms', () => {
      vectorizer.fit(books);
      const newBook: BookDocument = {
        id: '99',
        title: 'Completely Different',
        authors: ['Unknown'],
        subjects: ['unrelated', 'topics'],
        genres: ['Unique Genre'],
        tags: [],
        pageCount: 100,
        publicationYear: 1920,
      };
      const vector = vectorizer.transform(newBook);
      // Should return a vector (possibly sparse/empty for unknown terms)
      expect(vector).toBeDefined();
    });

    it('returns same vector for same book', () => {
      vectorizer.fit(books);
      const vector1 = vectorizer.transform(books[0]);
      const vector2 = vectorizer.transform(books[0]);

      expect(Object.keys(vector1)).toEqual(Object.keys(vector2));
      for (const term of Object.keys(vector1)) {
        expect(vector1[term]).toBeCloseTo(vector2[term], 10);
      }
    });
  });

  describe('fitTransform', () => {
    it('returns map of vectors', () => {
      const vectors = vectorizer.fitTransform(books);

      expect(vectors.size).toBe(3);
      expect(vectors.has('1')).toBe(true);
      expect(vectors.has('2')).toBe(true);
      expect(vectors.has('3')).toBe(true);
    });

    it('each vector is non-empty', () => {
      const vectors = vectorizer.fitTransform(books);

      for (const [, vector] of vectors) {
        expect(Object.keys(vector).length).toBeGreaterThan(0);
      }
    });

    it('sets fitted flag', () => {
      vectorizer.fitTransform(books);
      expect(vectorizer.isFitted).toBe(true);
    });
  });

  describe('vocabulary', () => {
    it('contains expected terms', () => {
      vectorizer.fit(books);

      // Vocabulary should include terms from all books
      // Note: stop words are filtered, so 'the', 'and' won't be there
      expect(vectorizer.vocabularySize).toBeGreaterThan(5);
    });
  });
});
