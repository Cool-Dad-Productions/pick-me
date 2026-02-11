import { describe, it, expect, vi } from 'vitest';

// Mock server-only to avoid runtime errors in tests
vi.mock('server-only', () => ({}));

import {
  cosineSimilarity,
  findMostSimilar,
  getMatchingTerms,
  MIN_SIMILARITY_THRESHOLD,
} from '../similarity';
import type { TfIdfVector } from '../tfidf';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const vec: TfIdfVector = { fantasy: 0.5, magic: 0.3 };
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors (no common terms)', () => {
    const vecA: TfIdfVector = { fantasy: 1 };
    const vecB: TfIdfVector = { scifi: 1 };
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });

  it('returns value between 0 and 1 for partial overlap', () => {
    const vecA: TfIdfVector = { fantasy: 0.5, magic: 0.3 };
    const vecB: TfIdfVector = { fantasy: 0.4, dragons: 0.2 };
    const sim = cosineSimilarity(vecA, vecB);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('handles empty vectors', () => {
    expect(cosineSimilarity({}, { a: 1 })).toBe(0);
    expect(cosineSimilarity({ a: 1 }, {})).toBe(0);
    expect(cosineSimilarity({}, {})).toBe(0);
  });

  it('is symmetric (A,B) = (B,A)', () => {
    const vecA: TfIdfVector = { fantasy: 0.5, magic: 0.3 };
    const vecB: TfIdfVector = { fantasy: 0.4, dragons: 0.2 };
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(
      cosineSimilarity(vecB, vecA),
      10
    );
  });

  it('handles single term vectors', () => {
    const vecA: TfIdfVector = { fantasy: 0.5 };
    const vecB: TfIdfVector = { fantasy: 0.8 };
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1, 5); // Same direction
  });

  it('handles vectors with different magnitudes', () => {
    const vecA: TfIdfVector = { fantasy: 1 };
    const vecB: TfIdfVector = { fantasy: 100 };
    // Cosine similarity should be 1 (same direction, different magnitude)
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1, 5);
  });
});

describe('findMostSimilar', () => {
  it('returns top k similar documents', () => {
    const query: TfIdfVector = { fantasy: 0.5, magic: 0.3 };
    const corpus = new Map<string, TfIdfVector>([
      ['1', { fantasy: 0.5, magic: 0.3 }], // Most similar (identical)
      ['2', { fantasy: 0.4 }], // Medium
      ['3', { scifi: 0.5 }], // Not similar
    ]);

    const results = findMostSimilar(query, corpus, 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[0].similarity).toBeCloseTo(1, 3);
  });

  it('excludes specified IDs', () => {
    const query: TfIdfVector = { fantasy: 0.5 };
    const corpus = new Map<string, TfIdfVector>([
      ['1', { fantasy: 0.5 }],
      ['2', { fantasy: 0.4 }],
    ]);

    const results = findMostSimilar(query, corpus, 2, new Set(['1']));
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('2');
  });

  it('returns empty array when no documents above threshold', () => {
    const query: TfIdfVector = { fantasy: 0.5 };
    const corpus = new Map<string, TfIdfVector>([
      ['1', { scifi: 0.5 }], // No overlap
      ['2', { mystery: 0.4 }], // No overlap
    ]);

    const results = findMostSimilar(query, corpus, 3);
    expect(results).toEqual([]);
  });

  it('respects MIN_SIMILARITY_THRESHOLD', () => {
    // Create vectors with very low similarity
    const query: TfIdfVector = { fantasy: 0.5, magic: 0.3, adventure: 0.2 };
    const corpus = new Map<string, TfIdfVector>([
      ['1', { fantasy: 0.01, scifi: 0.99 }], // Very low overlap
    ]);

    const results = findMostSimilar(query, corpus, 3);
    // Should filter out results below threshold
    results.forEach((r) => {
      expect(r.similarity).toBeGreaterThanOrEqual(MIN_SIMILARITY_THRESHOLD);
    });
  });

  it('handles k larger than corpus size', () => {
    const query: TfIdfVector = { fantasy: 0.5 };
    const corpus = new Map<string, TfIdfVector>([
      ['1', { fantasy: 0.5 }],
      ['2', { fantasy: 0.4 }],
    ]);

    const results = findMostSimilar(query, corpus, 10);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns results sorted by similarity descending', () => {
    const query: TfIdfVector = { fantasy: 0.5, magic: 0.5 };
    const corpus = new Map<string, TfIdfVector>([
      ['1', { fantasy: 0.3 }], // Lower
      ['2', { fantasy: 0.5, magic: 0.5 }], // Highest
      ['3', { fantasy: 0.4, magic: 0.3 }], // Medium
    ]);

    const results = findMostSimilar(query, corpus, 3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(
        results[i].similarity
      );
    }
  });
});

describe('getMatchingTerms', () => {
  it('returns common terms sorted by combined weight', () => {
    const vecA: TfIdfVector = { fantasy: 0.5, magic: 0.8, adventure: 0.1 };
    const vecB: TfIdfVector = { fantasy: 0.4, magic: 0.2, dragons: 0.3 };

    const matches = getMatchingTerms(vecA, vecB, 2);
    expect(matches).toEqual(['magic', 'fantasy']);
  });

  it('returns empty array for no matches', () => {
    const vecA: TfIdfVector = { fantasy: 0.5 };
    const vecB: TfIdfVector = { scifi: 0.5 };
    expect(getMatchingTerms(vecA, vecB)).toEqual([]);
  });

  it('respects limit parameter', () => {
    const vecA: TfIdfVector = { a: 0.5, b: 0.4, c: 0.3 };
    const vecB: TfIdfVector = { a: 0.5, b: 0.4, c: 0.3 };

    const matches = getMatchingTerms(vecA, vecB, 2);
    expect(matches).toHaveLength(2);
  });

  it('handles empty vectors', () => {
    expect(getMatchingTerms({}, { a: 1 })).toEqual([]);
    expect(getMatchingTerms({ a: 1 }, {})).toEqual([]);
    expect(getMatchingTerms({}, {})).toEqual([]);
  });

  it('uses default limit of 5', () => {
    const vec: TfIdfVector = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 };
    const matches = getMatchingTerms(vec, vec);
    expect(matches.length).toBeLessThanOrEqual(5);
  });
});

describe('MIN_SIMILARITY_THRESHOLD', () => {
  it('is exported and has expected value', () => {
    expect(MIN_SIMILARITY_THRESHOLD).toBe(0.1);
  });
});
