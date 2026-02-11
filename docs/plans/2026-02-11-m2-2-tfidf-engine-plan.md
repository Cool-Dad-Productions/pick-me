---
title: "M2.2: TF-IDF Engine"
type: feat
date: 2026-02-11
parent: 2026-02-11-m2-real-predictor-roadmap.md
status: draft
---

# M2.2: TF-IDF Engine

## Overview

Build a pure TypeScript TF-IDF (Term Frequency-Inverse Document Frequency) implementation for computing book similarity. This engine will power the prediction algorithm by finding books with similar textual content.

## Problem Statement

To predict how much a user will like a book, we need to find similar books they've already rated. TF-IDF is a well-established technique for measuring text similarity that works well for our use case: comparing book metadata (title, authors, subjects).

## Proposed Solution

Implement a self-contained TF-IDF engine in TypeScript with:
1. Text tokenizer with stop word removal
2. TF-IDF vectorizer that builds document vectors
3. Cosine similarity calculator for comparing vectors

No external NLP libraries required - pure TypeScript for simplicity and control.

## Technical Approach

### TF-IDF Explained

**TF (Term Frequency):** How often a term appears in a document
```
TF(t, d) = count(t in d) / total_terms(d)
```

**IDF (Inverse Document Frequency):** How rare a term is across all documents
```
IDF(t) = log(total_docs / docs_containing(t))
```

**TF-IDF Score:** Importance of term in document relative to corpus
```
TF-IDF(t, d) = TF(t, d) × IDF(t)
```

### Similarity Flow

```
Book A                          Book B
   │                               │
   ▼                               ▼
┌─────────┐                  ┌─────────┐
│Tokenize │                  │Tokenize │
└────┬────┘                  └────┬────┘
     │                            │
     ▼                            ▼
┌──────────┐                ┌──────────┐
│TF-IDF Vec│                │TF-IDF Vec│
└────┬─────┘                └─────┬────┘
     │                            │
     └──────────┬─────────────────┘
                ▼
         ┌──────────────┐
         │Cosine Similar│
         └──────┬───────┘
                ▼
           0.0 - 1.0
```

## Acceptance Criteria

### Functional Requirements
- [ ] Tokenizer splits text into normalized terms
- [ ] Stop words (the, a, and, etc.) are removed
- [ ] TF-IDF vectors computed for book corpus
- [ ] Cosine similarity returns value 0.0-1.0
- [ ] Similar books return high similarity (>0.7)

### Non-Functional Requirements
- [ ] Vectorize 500 books in <100ms
- [ ] Single similarity calculation in <1ms
- [ ] Zero external NLP dependencies
- [ ] 100% unit test coverage for core functions

## Implementation Plan

### Phase 1: Tokenizer

**File:** `lib/prediction/tokenizer.ts` (NEW)

```typescript
// lib/prediction/tokenizer.ts
import 'server-only';

// Common English stop words
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'now', 'book', 'novel', 'story', 'fiction',
]);

/**
 * Tokenize text into normalized terms
 * - Lowercase
 * - Remove punctuation
 * - Split on whitespace
 * - Remove stop words
 * - Filter short tokens (<2 chars)
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .split(/\s+/)              // Split on whitespace
    .filter(token =>
      token.length >= 2 &&     // Min length
      !STOP_WORDS.has(token) && // Not a stop word
      !/^\d+$/.test(token)     // Not purely numeric
    );
}

/**
 * Create document text from book data
 * Combines title, authors, and subjects into single text
 */
export function bookToText(book: {
  title: string;
  authors: string[];
  subjects: string[];
}): string {
  // Weight title more heavily by repeating
  const titleText = book.title;
  const authorText = book.authors.join(' ');
  // Subjects are already good keywords, include as-is
  const subjectText = book.subjects.join(' ');

  return `${titleText} ${titleText} ${authorText} ${subjectText}`;
}
```

### Phase 2: TF-IDF Vectorizer

**File:** `lib/prediction/tfidf.ts` (NEW)

```typescript
// lib/prediction/tfidf.ts
import 'server-only';
import { tokenize, bookToText } from './tokenizer';

export interface TfIdfVector {
  [term: string]: number;
}

export interface BookDocument {
  id: string;
  title: string;
  authors: string[];
  subjects: string[];
}

/**
 * Compute term frequency for a document
 */
function computeTf(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const totalTerms = tokens.length;

  if (totalTerms === 0) return tf;

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Normalize by document length
  for (const [term, count] of tf) {
    tf.set(term, count / totalTerms);
  }

  return tf;
}

/**
 * Compute inverse document frequency for corpus
 */
function computeIdf(documents: string[][]): Map<string, number> {
  const idf = new Map<string, number>();
  const totalDocs = documents.length;
  const docFreq = new Map<string, number>();

  // Count documents containing each term
  for (const tokens of documents) {
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  // Compute IDF with smoothing
  for (const [term, freq] of docFreq) {
    // Add 1 to avoid division by zero, log base e
    idf.set(term, Math.log((totalDocs + 1) / (freq + 1)) + 1);
  }

  return idf;
}

/**
 * TF-IDF Vectorizer class
 * Fits on a corpus and transforms documents to vectors
 */
export class TfIdfVectorizer {
  private idf: Map<string, number> = new Map();
  private vocabulary: Set<string> = new Set();
  private fitted = false;

  /**
   * Fit the vectorizer on a corpus of books
   */
  fit(books: BookDocument[]): void {
    const documents = books.map(book =>
      tokenize(bookToText(book))
    );

    // Build vocabulary
    for (const tokens of documents) {
      for (const token of tokens) {
        this.vocabulary.add(token);
      }
    }

    // Compute IDF
    this.idf = computeIdf(documents);
    this.fitted = true;
  }

  /**
   * Transform a book to a TF-IDF vector
   */
  transform(book: BookDocument): TfIdfVector {
    if (!this.fitted) {
      throw new Error('Vectorizer must be fitted before transform');
    }

    const tokens = tokenize(bookToText(book));
    const tf = computeTf(tokens);
    const vector: TfIdfVector = {};

    for (const [term, tfValue] of tf) {
      const idfValue = this.idf.get(term) || 0;
      if (idfValue > 0) {
        vector[term] = tfValue * idfValue;
      }
    }

    return vector;
  }

  /**
   * Fit and transform in one step
   */
  fitTransform(books: BookDocument[]): Map<string, TfIdfVector> {
    this.fit(books);

    const vectors = new Map<string, TfIdfVector>();
    for (const book of books) {
      vectors.set(book.id, this.transform(book));
    }

    return vectors;
  }

  /**
   * Get vocabulary size (for debugging)
   */
  get vocabularySize(): number {
    return this.vocabulary.size;
  }
}
```

### Phase 3: Cosine Similarity

**File:** `lib/prediction/similarity.ts` (NEW)

```typescript
// lib/prediction/similarity.ts
import 'server-only';
import type { TfIdfVector } from './tfidf';

/**
 * Compute cosine similarity between two TF-IDF vectors
 * Returns value between 0 (no similarity) and 1 (identical)
 */
export function cosineSimilarity(vecA: TfIdfVector, vecB: TfIdfVector): number {
  // Find common terms
  const termsA = Object.keys(vecA);
  const termsB = new Set(Object.keys(vecB));

  if (termsA.length === 0 || termsB.size === 0) {
    return 0;
  }

  // Compute dot product
  let dotProduct = 0;
  for (const term of termsA) {
    if (termsB.has(term)) {
      dotProduct += vecA[term] * vecB[term];
    }
  }

  // Compute magnitudes
  const magA = Math.sqrt(
    Object.values(vecA).reduce((sum, val) => sum + val * val, 0)
  );
  const magB = Math.sqrt(
    Object.values(vecB).reduce((sum, val) => sum + val * val, 0)
  );

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dotProduct / (magA * magB);
}

/**
 * Find top-k most similar documents to a query document
 */
export function findMostSimilar(
  queryVector: TfIdfVector,
  corpus: Map<string, TfIdfVector>,
  k: number = 3,
  excludeIds: Set<string> = new Set()
): Array<{ id: string; similarity: number }> {
  const similarities: Array<{ id: string; similarity: number }> = [];

  for (const [id, vector] of corpus) {
    if (excludeIds.has(id)) continue;

    const similarity = cosineSimilarity(queryVector, vector);
    similarities.push({ id, similarity });
  }

  // Sort by similarity descending, take top k
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/**
 * Get matching terms between two vectors (for explainability)
 */
export function getMatchingTerms(
  vecA: TfIdfVector,
  vecB: TfIdfVector,
  limit: number = 5
): string[] {
  const termsB = new Set(Object.keys(vecB));

  // Find common terms, sorted by combined weight
  const matches = Object.entries(vecA)
    .filter(([term]) => termsB.has(term))
    .map(([term, weight]) => ({
      term,
      combinedWeight: weight + vecB[term],
    }))
    .sort((a, b) => b.combinedWeight - a.combinedWeight)
    .slice(0, limit)
    .map(m => m.term);

  return matches;
}
```

### Phase 4: Index File

**File:** `lib/prediction/index.ts` (NEW)

```typescript
// lib/prediction/index.ts
export { tokenize, bookToText } from './tokenizer';
export { TfIdfVectorizer, type TfIdfVector, type BookDocument } from './tfidf';
export { cosineSimilarity, findMostSimilar, getMatchingTerms } from './similarity';
```

### Phase 5: Unit Tests

**File:** `lib/prediction/__tests__/tokenizer.test.ts` (NEW)

```typescript
import { tokenize, bookToText } from '../tokenizer';

describe('tokenize', () => {
  it('lowercases and splits text', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('removes punctuation', () => {
    expect(tokenize("It's a test!")).toEqual(['test']);
  });

  it('removes stop words', () => {
    expect(tokenize('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('filters short tokens', () => {
    expect(tokenize('a ab abc')).toEqual(['abc']);
  });

  it('filters numeric tokens', () => {
    expect(tokenize('2024 edition 3rd')).toEqual(['edition', '3rd']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('bookToText', () => {
  it('combines book fields', () => {
    const book = {
      title: 'The Name of the Wind',
      authors: ['Patrick Rothfuss'],
      subjects: ['fantasy', 'magic'],
    };

    const text = bookToText(book);
    expect(text).toContain('Name of the Wind');
    expect(text).toContain('Patrick Rothfuss');
    expect(text).toContain('fantasy');
    expect(text).toContain('magic');
  });

  it('handles empty arrays', () => {
    const book = { title: 'Test', authors: [], subjects: [] };
    expect(bookToText(book)).toBe('Test Test  ');
  });
});
```

**File:** `lib/prediction/__tests__/tfidf.test.ts` (NEW)

```typescript
import { TfIdfVectorizer } from '../tfidf';

describe('TfIdfVectorizer', () => {
  const books = [
    { id: '1', title: 'Fantasy Magic Adventure', authors: ['Author A'], subjects: ['fantasy', 'magic'] },
    { id: '2', title: 'Fantasy Dragons Quest', authors: ['Author B'], subjects: ['fantasy', 'dragons'] },
    { id: '3', title: 'Science Robot Future', authors: ['Author C'], subjects: ['science fiction', 'robots'] },
  ];

  it('fits without error', () => {
    const vectorizer = new TfIdfVectorizer();
    expect(() => vectorizer.fit(books)).not.toThrow();
  });

  it('transforms to non-empty vector', () => {
    const vectorizer = new TfIdfVectorizer();
    vectorizer.fit(books);

    const vector = vectorizer.transform(books[0]);
    expect(Object.keys(vector).length).toBeGreaterThan(0);
  });

  it('gives higher weight to rare terms', () => {
    const vectorizer = new TfIdfVectorizer();
    vectorizer.fit(books);

    const vector = vectorizer.transform(books[0]);
    // 'magic' appears in 1 doc, 'fantasy' in 2 - magic should have higher weight
    expect(vector['magic']).toBeGreaterThan(vector['fantasy'] || 0);
  });

  it('fitTransform returns map of vectors', () => {
    const vectorizer = new TfIdfVectorizer();
    const vectors = vectorizer.fitTransform(books);

    expect(vectors.size).toBe(3);
    expect(vectors.has('1')).toBe(true);
  });

  it('throws if transform called before fit', () => {
    const vectorizer = new TfIdfVectorizer();
    expect(() => vectorizer.transform(books[0])).toThrow();
  });
});
```

**File:** `lib/prediction/__tests__/similarity.test.ts` (NEW)

```typescript
import { cosineSimilarity, findMostSimilar, getMatchingTerms } from '../similarity';
import { TfIdfVectorizer } from '../tfidf';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const vec = { fantasy: 0.5, magic: 0.3 };
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const vecA = { fantasy: 1 };
    const vecB = { scifi: 1 };
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });

  it('returns value between 0 and 1', () => {
    const vecA = { fantasy: 0.5, magic: 0.3 };
    const vecB = { fantasy: 0.4, dragons: 0.2 };
    const sim = cosineSimilarity(vecA, vecB);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('handles empty vectors', () => {
    expect(cosineSimilarity({}, { a: 1 })).toBe(0);
    expect(cosineSimilarity({ a: 1 }, {})).toBe(0);
    expect(cosineSimilarity({}, {})).toBe(0);
  });
});

describe('findMostSimilar', () => {
  it('returns top k similar documents', () => {
    const query = { fantasy: 0.5, magic: 0.3 };
    const corpus = new Map([
      ['1', { fantasy: 0.5, magic: 0.3 }],  // Most similar
      ['2', { fantasy: 0.4 }],               // Medium
      ['3', { scifi: 0.5 }],                 // Not similar
    ]);

    const results = findMostSimilar(query, corpus, 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[0].similarity).toBeCloseTo(1, 3);
  });

  it('excludes specified IDs', () => {
    const query = { fantasy: 0.5 };
    const corpus = new Map([
      ['1', { fantasy: 0.5 }],
      ['2', { fantasy: 0.4 }],
    ]);

    const results = findMostSimilar(query, corpus, 2, new Set(['1']));
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('2');
  });
});

describe('getMatchingTerms', () => {
  it('returns common terms sorted by weight', () => {
    const vecA = { fantasy: 0.5, magic: 0.8, adventure: 0.1 };
    const vecB = { fantasy: 0.4, magic: 0.2, dragons: 0.3 };

    const matches = getMatchingTerms(vecA, vecB, 2);
    expect(matches).toEqual(['magic', 'fantasy']);
  });

  it('returns empty for no matches', () => {
    const vecA = { fantasy: 0.5 };
    const vecB = { scifi: 0.5 };
    expect(getMatchingTerms(vecA, vecB)).toEqual([]);
  });
});
```

## Performance Considerations

### Benchmarks Target

| Operation | Target | Notes |
|-----------|--------|-------|
| Tokenize single book | <1ms | Simple string operations |
| Fit 500 books | <50ms | One-time corpus processing |
| Transform single book | <1ms | Uses pre-computed IDF |
| Find top-3 similar (500 corpus) | <10ms | 500 cosine comparisons |

### Optimization Notes

1. **IDF is computed once** during `fit()`, not per-transform
2. **Vectors are sparse** - only non-zero terms stored
3. **Set operations** for finding common terms in cosine similarity
4. **No stemming in MVP** - can add Porter stemmer later if needed

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `lib/prediction/tokenizer.ts` | Create | Text tokenization and stop words |
| `lib/prediction/tfidf.ts` | Create | TF-IDF vectorizer class |
| `lib/prediction/similarity.ts` | Create | Cosine similarity functions |
| `lib/prediction/index.ts` | Create | Public API exports |
| `lib/prediction/__tests__/*.test.ts` | Create | Unit tests |

## Dependencies

- None (pure TypeScript implementation)

## Testing Strategy

1. **Unit tests** for each function (tokenizer, vectorizer, similarity)
2. **Property-based testing** for similarity (symmetric, bounded 0-1)
3. **Benchmark tests** to verify performance targets
4. **Integration test** with real book data in M2.3

## References

- [TF-IDF Wikipedia](https://en.wikipedia.org/wiki/Tf%E2%80%93idf)
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
- [sklearn TfidfVectorizer](https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html) - Reference implementation
