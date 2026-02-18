---
title: "M5.7: Update Prediction Model with Enriched Features"
type: feat
date: 2026-02-18
milestone: 5.7
---

# M5.7: Update Prediction Model with Enriched Features

## Overview

Enhance the TF-IDF prediction algorithm to incorporate genres, page count, and publication year as features for improved book similarity matching. This completes the metadata enrichment story by using the enriched data (from M5.5/M5.6) to make better predictions.

## Problem Statement

Current prediction model only uses:
- Title (2x weight)
- Authors (1x weight)
- Subjects from OpenLibrary (1x weight)

Missing signals that could improve predictions:
- **Genres**: Google Books categories are more reader-oriented than library subjects
- **Page count**: Users often prefer books of similar length
- **Publication year**: Era preferences exist (classic literature fans vs. contemporary readers)

## Proposed Solution

1. Extend `BookDocument` and `RatedBook` interfaces with new fields
2. Add bucketing functions for numeric features (page count → length bucket, year → era bucket)
3. Update `bookToText()` to include genres and bucketed features in text representation
4. Update API route to fetch enriched book data for corpus building
5. Enhance rationale to explain which new features contributed to similarity

## Technical Approach

### Architecture

The prediction pipeline remains unchanged in structure:

```
Book Data → bookToText() → TF-IDF Vectorizer → Cosine Similarity → Weighted Prediction
```

Changes are localized to:
1. **Data layer**: Fetch additional fields from database
2. **Tokenizer**: Add bucketing functions and expand text representation
3. **Interfaces**: Add new fields to BookDocument and RatedBook
4. **Rationale**: Include new feature matches in explanation

### Feature Engineering Strategy

**Numeric-to-text conversion via bucketing:**

Page count bucketing (from plan spec):
```typescript
function bucketPageCount(pages: number | null): string {
  if (!pages) return '';
  if (pages < 200) return 'short_book';
  if (pages < 400) return 'medium_book';
  return 'long_book';
}
```

Publication year bucketing (from plan spec):
```typescript
function bucketYear(year: number | null): string {
  if (!year) return '';
  if (year < 1950) return 'classic_era';
  if (year < 2000) return 'modern_era';
  return 'contemporary_era';
}
```

**Rationale for buckets:**
- Converts numeric features to categorical tokens that work with TF-IDF
- Buckets are broad enough to create meaningful similarity groups
- Empty string for missing data gracefully degrades (no token added)

### Feature Weighting

Updated `bookToText()` output:

```typescript
// Weight: title 2x, genres 2x (strong signal), subjects 1x, authors 1x, buckets 1x
return `${titleText} ${titleText} ${authorText} ${subjectText} ${genreText} ${genreText} ${lengthBucket} ${eraBucket}`;
```

| Feature | Weight | Rationale |
|---------|--------|-----------|
| Title | 2x | Primary book identifier |
| Genres | 2x | Strong reader preference signal |
| Authors | 1x | Author similarity matters |
| Subjects | 1x | Library classifications add context |
| Length bucket | 1x | Supplementary signal |
| Era bucket | 1x | Supplementary signal |

---

## Implementation Phases

### Phase 1: Interface Updates

**Files to modify:**
- [lib/prediction/tfidf.ts](../../lib/prediction/tfidf.ts) (lines 8-13)
- [lib/prediction/predictor.ts](../../lib/prediction/predictor.ts) (lines 35-42)

**Tasks:**
- [x] Extend `BookDocument` interface with `genres: string[]`, `pageCount: number | null`, `publicationYear: number | null`
- [x] Extend `RatedBook` interface with same fields
- [x] Update any type assertions or casts in predictor.ts

**BookDocument after:**
```typescript
export interface BookDocument {
  id: string;
  title: string;
  authors: string[];
  subjects: string[];
  genres: string[];           // NEW
  pageCount: number | null;   // NEW
  publicationYear: number | null; // NEW
}
```

### Phase 2: Tokenizer Updates

**Files to modify:**
- [lib/prediction/tokenizer.ts](../../lib/prediction/tokenizer.ts) (lines 56-72)

**Tasks:**
- [x] Add `bucketPageCount()` function with boundaries: <200 short, 200-400 medium, >400 long
- [x] Add `bucketYear()` function with boundaries: <1950 classic, 1950-2000 modern, >2000 contemporary
- [x] Update `bookToText()` parameter type to include new fields
- [x] Update `bookToText()` implementation to include genres (2x) and bucket tokens (1x)
- [x] Export bucket functions for testing

**Implementation:**
```typescript
/**
 * Bucket page count into length categories
 */
export function bucketPageCount(pages: number | null): string {
  if (!pages || pages <= 0) return '';
  if (pages < 200) return 'short_book';
  if (pages < 400) return 'medium_book';
  return 'long_book';
}

/**
 * Bucket publication year into era categories
 */
export function bucketYear(year: number | null): string {
  if (!year || year <= 0) return '';
  if (year < 1950) return 'classic_era';
  if (year < 2000) return 'modern_era';
  return 'contemporary_era';
}

/**
 * Create document text from book data
 * Combines title, authors, subjects, genres, and bucket tokens
 * Title and genres weighted 2x by repetition
 */
export function bookToText(book: {
  title: string;
  authors: string[];
  subjects: string[];
  genres: string[];
  pageCount: number | null;
  publicationYear: number | null;
}): string {
  const titleText = book.title;
  const authorText = book.authors.join(' ');
  const subjectText = book.subjects.join(' ');
  const genreText = book.genres.join(' ');
  const lengthBucket = bucketPageCount(book.pageCount);
  const eraBucket = bucketYear(book.publicationYear);

  // Weight: title 2x, genres 2x, subjects 1x, authors 1x, buckets 1x
  return `${titleText} ${titleText} ${authorText} ${subjectText} ${genreText} ${genreText} ${lengthBucket} ${eraBucket}`;
}
```

### Phase 3: API Route Updates

**Files to modify:**
- [app/api/predict/route.ts](../../app/api/predict/route.ts) (lines 60-107)

**Tasks:**
- [x] Update target book construction to include `genres`, `pageCount`, `publicationYear`
- [x] Update Prisma select for rated books to include new fields
- [x] Update book mapping to pass new fields to `BookDocument` and `RatedBook`

**Changes needed:**

1. Target book construction (around line 60):
```typescript
const targetBook: BookDocument = {
  id: book.id,
  title: book.title,
  authors: book.authors,
  subjects: book.subjects,
  genres: book.genres,           // ADD
  pageCount: book.pageCount,     // ADD
  publicationYear: book.publicationYear, // ADD
};
```

2. Prisma select for rated books (around line 80):
```typescript
select: {
  id: true,
  title: true,
  authors: true,
  subjects: true,
  genres: true,           // ADD
  pageCount: true,        // ADD
  publicationYear: true,  // ADD
  openLibraryWorkId: true,
}
```

3. RatedBook mapping (around line 95):
```typescript
return {
  id: b.id,
  title: b.title,
  authors: b.authors,
  subjects: b.subjects,
  genres: b.genres,           // ADD
  pageCount: b.pageCount,     // ADD
  publicationYear: b.publicationYear, // ADD
  rating: wr.rating,
};
```

### Phase 4: Rationale Enhancement

**Files to modify:**
- [app/api/predict/route.ts](../../app/api/predict/route.ts) (lines 128-151)

**Tasks:**
- [x] Matching terms already include all tokens from `bookToText()` - bucket tokens will appear automatically
- [x] Verify `formatMatchingTerm()` in UI handles snake_case bucket tokens (short_book → "Short Book")
- [x] Consider adding rationale message explaining feature types if helpful

**Note:** The existing `matchingTerms` extraction in similarity.ts should already capture bucket tokens since they're part of the tokenized text. The UI's `formatMatchingTerm()` function converts snake_case to Title Case, so `short_book` displays as "Short Book".

### Phase 5: Test Updates

**Files to modify:**
- [lib/prediction/__tests__/tokenizer.test.ts](../../lib/prediction/__tests__/tokenizer.test.ts)
- [lib/prediction/__tests__/predictor.test.ts](../../lib/prediction/__tests__/predictor.test.ts)

**Tasks:**
- [x] Add tests for `bucketPageCount()` with edge cases (null, 0, boundaries, large values)
- [x] Add tests for `bucketYear()` with edge cases (null, 0, boundary years, future years)
- [x] Update `bookToText()` tests to include new fields and verify output format
- [x] Update predictor test fixtures to include genres, pageCount, publicationYear
- [x] Add integration test verifying genre similarity boosts prediction confidence

**Test cases for bucketPageCount:**
```typescript
describe('bucketPageCount', () => {
  it('returns empty string for null', () => {
    expect(bucketPageCount(null)).toBe('');
  });
  it('returns empty string for 0 or negative', () => {
    expect(bucketPageCount(0)).toBe('');
    expect(bucketPageCount(-100)).toBe('');
  });
  it('returns short_book for <200 pages', () => {
    expect(bucketPageCount(199)).toBe('short_book');
    expect(bucketPageCount(1)).toBe('short_book');
  });
  it('returns medium_book for 200-399 pages', () => {
    expect(bucketPageCount(200)).toBe('medium_book');
    expect(bucketPageCount(399)).toBe('medium_book');
  });
  it('returns long_book for >=400 pages', () => {
    expect(bucketPageCount(400)).toBe('long_book');
    expect(bucketPageCount(1000)).toBe('long_book');
  });
});
```

---

## Edge Cases and Handling

| Scenario | Handling |
|----------|----------|
| Book has no genres | Empty array → no genre tokens; subjects still contribute |
| Book has null pageCount | `bucketPageCount(null)` → empty string; no length token added |
| Book has null publicationYear | `bucketYear(null)` → empty string; no era token added |
| Page count is 0 (data error) | Treated as missing (returns empty string) |
| Page count is >5000 (box sets) | Still returns `long_book`; acceptable for similarity |
| Publication year in future | Returns `contemporary_era`; acceptable for pre-orders |
| All new fields missing | Falls back to current behavior (title/author/subjects only) |

---

## Acceptance Criteria

- [x] Predictions consider genre similarity (books with matching genres score higher)
- [x] Books of similar length are weighted slightly higher (matching bucket tokens)
- [x] Era similarity contributes to predictions (matching era tokens)
- [x] Rationale explains which new features contributed (bucket tokens appear in matchingTerms)
- [x] All existing tests pass with updated fixtures
- [x] New tests cover bucketing edge cases
- [x] No regression in prediction quality for books missing new metadata

---

## Files Summary

| File | Changes |
|------|---------|
| `lib/prediction/tfidf.ts` | Extend `BookDocument` interface |
| `lib/prediction/tokenizer.ts` | Add bucket functions, update `bookToText()` |
| `lib/prediction/predictor.ts` | Extend `RatedBook` interface |
| `app/api/predict/route.ts` | Fetch and pass new fields |
| `lib/prediction/__tests__/tokenizer.test.ts` | Add bucket function tests |
| `lib/prediction/__tests__/predictor.test.ts` | Update fixtures with new fields |

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Genre data quality varies | Medium | Low | Genres at 2x weight still won't dominate if sparse |
| Bucket boundaries suboptimal | Medium | Low | Constants are easy to tune later |
| Performance degradation | Low | Low | Only adds 2-4 tokens per book; negligible impact |
| Prediction quality regression | Low | Medium | Keep subjects at 1x; new features are additive |

---

## Testing Strategy

1. **Unit tests**: Bucket functions with edge cases
2. **Integration tests**: Full prediction with enriched books
3. **Manual testing**: Compare predictions before/after for sample books
4. **Regression check**: Ensure books without new metadata still get reasonable predictions

---

## References

### Internal
- [M5 Plan - M5.7 Section](./2026-02-17-m5-improved-metadata-canonical-works-plan.md#m57-update-prediction-model)
- [Current tokenizer](../../lib/prediction/tokenizer.ts)
- [Current TF-IDF implementation](../../lib/prediction/tfidf.ts)
- [Predict API route](../../app/api/predict/route.ts)
- [M2.2 TF-IDF Engine Plan](./2026-02-11-m2-2-tfidf-engine-plan.md)

### Learnings Applied
- Multi-layer enrichment pattern from OpenLibrary integration
- Feature weighting via text repetition from M2.2
- Graceful degradation for missing data from metadata solution
