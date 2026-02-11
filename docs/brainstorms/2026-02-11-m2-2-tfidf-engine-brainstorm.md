---
title: "M2.2: TF-IDF Engine Assumptions & Design Decisions"
date: 2026-02-11
plan: ../plans/2026-02-11-m2-2-tfidf-engine-plan.md
status: draft
---

# M2.2: TF-IDF Engine Brainstorm

## Purpose

Explore assumptions, edge cases, and design decisions before implementing the TF-IDF similarity engine. This document validates the approach in the plan and identifies potential issues.

---

## Key Assumptions to Validate

### 1. Subject Data Quality

**Assumption:** Most books will have sufficient subjects for meaningful similarity matching.

**From M2.1 Learnings:**
- Target: >70% of books should have 3+ subjects
- Confidence tiers: 10+ subjects = High, 3-9 = Medium, 0-2 = Low
- Meta-tags (NYT, format tags) are already filtered in enrichment

**Questions:**
- [ ] What happens when comparing a book with 10 subjects to one with only 2?
- [ ] Should we weight similarity scores by subject count confidence?

**Decision:** Start simple - compute similarity regardless of subject count. Add confidence weighting in M2.3 prediction algorithm if needed.

---

### 2. Stop Words List

**Assumption:** A static English stop words list is sufficient for book metadata.

**Current Plan (tokenizer.ts:99-109):**
```typescript
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', ...
  'book', 'novel', 'story', 'fiction',  // domain-specific
]);
```

**Questions:**
- [ ] Are domain-specific stop words (book, novel, story, fiction) appropriate?
- [ ] Should we remove common genre terms that appear in most books?
- [ ] What about series indicators ("book 1", "volume 2")?

**Analysis:**
- "fiction" appears in subject lists for most fiction books - removing it improves signal
- "book", "novel", "story" are generic - good to remove
- Series indicators add noise - but "trilogy" might be meaningful

**Decision:** Include domain-specific stop words. Add series pattern filtering:
```typescript
// Filter patterns like "book 1", "volume 2", etc.
.filter(token => !/^(book|vol|volume|part)\s*\d+$/i.test(token))
```

---

### 3. Text Weighting Strategy

**Assumption:** Title should be weighted more heavily than subjects.

**Current Plan (tokenizer.ts:141-147):**
```typescript
// Weight title more heavily by repeating
return `${titleText} ${titleText} ${authorText} ${subjectText}`;
```

**Questions:**
- [ ] Is 2x title weight appropriate?
- [ ] Should authors be weighted differently?
- [ ] What about very long subject lists diluting title importance?

**Analysis:**
- Title is user's primary identifier of a book
- Authors carry genre/style signal (Brandon Sanderson = epic fantasy)
- Subjects from Open Library can be 20 items - may overwhelm title

**Options:**
1. **Fixed repetition** (current): Title 2x, Author 1x, Subjects 1x
2. **Normalized weighting**: Repeat title based on subject count
3. **Separate vectors**: Compute title, author, subject similarity separately, combine

**Decision:** Start with option 1 (fixed repetition). It's simple and we can tune after seeing real results. Consider option 3 for future enhancement.

---

### 4. Stemming vs. No Stemming

**Assumption:** Stemming is not needed for MVP.

**Trade-offs:**

| Approach | Pros | Cons |
|----------|------|------|
| No stemming | Simple, no library needed | "fantasy" ≠ "fantastical" |
| Porter stemmer | Better term matching | Adds complexity, can over-stem |

**Examples where stemming helps:**
- "adventure" / "adventurous" → "adventur"
- "mystery" / "mysteries" → "mysteri"

**Examples where stemming hurts:**
- "universe" / "university" → "univers" (false match!)

**Decision:** Skip stemming for MVP. Book subjects are already normalized nouns ("fantasy" not "fantastical"). Can add later if similarity quality is poor.

---

### 5. Performance Targets

**Assumption:** The plan's performance targets are achievable with pure TypeScript.

**Targets from plan:**
- Tokenize single book: <1ms
- Fit 500 books: <50ms
- Transform single book: <1ms
- Find top-3 similar (500 corpus): <10ms

**Questions:**
- [ ] What's a realistic user library size? 500? 5000?
- [ ] Should we pre-compute and cache vectors?
- [ ] How does performance scale with vocabulary size?

**Analysis:**
- Typical avid reader: 100-300 books rated
- Power user: 500-1000 books
- Vocabulary from 500 books: ~2000-5000 unique terms
- Cosine similarity: O(min(|V1|, |V2|)) per comparison
- 500 comparisons × ~100 terms/vector = 50,000 operations

**Decision:** The targets are reasonable for MVP. Add performance tests to validate. If slow, consider:
1. Sparse vector representation (already planned - only non-zero terms)
2. Pre-compute user's library vectors on rating change
3. Cache vectors in database if memory is an issue

---

## Edge Cases

### 1. Empty/Minimal Data

| Scenario | Current Handling | Should We Change? |
|----------|------------------|-------------------|
| Book with no subjects | Falls back to title + author | No - good fallback |
| Book with no authors | Uses empty string | No - subjects still work |
| Book with 1-word title | Gets tokenized as single term | Consider: might need special handling |
| Identical books (same ISBN) | Cosine = 1.0 | Exclude self from similarity search |

### 2. Non-English Content

**Assumption:** All content is English.

**Reality:**
- Some book titles include non-English words
- Open Library subjects may include translations

**Current tokenizer behavior:**
```typescript
.replace(/[^\w\s]/g, ' ')  // Removes accented characters!
```

**Issue:** "Café" becomes "Caf" which is meaningless.

**Options:**
1. Use Unicode word boundaries: `\p{L}` instead of `\w`
2. Normalize to ASCII: "Café" → "Cafe"
3. Keep as-is for MVP

**Decision:** Option 2 - add simple ASCII normalization. Most users will have English libraries, but we shouldn't break on common accented words.

```typescript
// Add before tokenization
text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
```

### 3. Duplicate/Similar Terms

**Scenario:** Subject list contains "Science Fiction" and "Science-Fiction" and "SciFi".

**Current handling:**
- Tokenizer splits on spaces → ["science", "fiction", "science", "fiction", "scifi"]
- "science" and "fiction" get double-counted

**Impact:** Not necessarily bad - reinforces that this is science fiction.

**Decision:** Accept this behavior. It naturally weights repeated concepts higher.

### 4. Very Long Subject Lists

**Constraint:** Open Library subjects are already limited to 20 in enrichment.

**Impact on TF-IDF:**
- More subjects = more terms per document
- More terms = higher vocabulary size
- Cosine similarity normalizes by magnitude, so length doesn't bias similarity

**Decision:** No special handling needed.

---

## Testing Strategy

### Unit Test Coverage

| Component | Key Test Cases |
|-----------|---------------|
| `tokenize()` | Empty string, punctuation, stop words, accents, numbers |
| `bookToText()` | Empty arrays, long titles, special characters |
| `TfIdfVectorizer.fit()` | 0 books, 1 book, many books |
| `TfIdfVectorizer.transform()` | Before fit (error), unknown terms, empty result |
| `cosineSimilarity()` | Identical vectors, orthogonal, empty, single term |
| `findMostSimilar()` | Exclude IDs, k > corpus size, all zero similarity |

### Integration Test Scenarios

1. **Fantasy books cluster together**
   - Given: "Name of the Wind", "Mistborn", "Way of Kings" (fantasy)
   - And: "1984", "Brave New World" (dystopian)
   - Expect: Fantasy books have higher mutual similarity

2. **Same author signal**
   - Given: Two Brandon Sanderson books
   - Expect: Higher similarity than random pair

3. **Low-data graceful degradation**
   - Given: Book with only title (no subjects, no author)
   - Expect: Still computes similarity (may be 0)

### Performance Benchmarks

Add benchmark tests that fail if performance regresses:

```typescript
describe('Performance benchmarks', () => {
  it('vectorizes 500 books in under 100ms', () => {
    const start = performance.now();
    vectorizer.fitTransform(generate500Books());
    expect(performance.now() - start).toBeLessThan(100);
  });
});
```

---

## Test Framework Setup

**Finding:** No test framework currently installed in the project.

**Recommendation:** Use Vitest (modern, fast, ESM-native, good Next.js support).

**Setup required before implementing tests:**
```bash
pnpm add -D vitest @vitest/coverage-v8
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  }
}
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

---

## Architecture Decisions

### 1. Barrel Export (New Pattern)

**Decision:** Introduce `lib/prediction/index.ts` as barrel export.

This is a new pattern for this codebase but improves API ergonomics:

```typescript
// Instead of:
import { tokenize } from '@/lib/prediction/tokenizer';
import { TfIdfVectorizer } from '@/lib/prediction/tfidf';
import { cosineSimilarity } from '@/lib/prediction/similarity';

// Use:
import { tokenize, TfIdfVectorizer, cosineSimilarity } from '@/lib/prediction';
```

### 2. Class vs. Functions

**Current plan:** `TfIdfVectorizer` is a class with `fit()` and `transform()` methods.

**Rationale:**
- Matches sklearn's API (familiar pattern)
- Encapsulates IDF state that needs to persist across transforms
- Cleaner than passing IDF map as function parameter

**Keep as planned.**

### 3. Server-Only Enforcement

All files in `lib/prediction/` should have:
```typescript
import 'server-only';
```

This prevents accidental client-side bundling of the TF-IDF engine.

---

## Open Questions

1. **Should we persist TF-IDF vectors in the database?**
   - Pro: Faster predictions (no recomputation)
   - Con: Storage overhead, stale vectors when subjects update
   - **Decision:** Defer to M2.3 if performance is an issue

2. **How do we handle prediction for a book not in the user's library?**
   - The target book needs to be vectorized against the user's corpus
   - Requires fitting on user's books, then transforming target book
   - **Answered:** Plan already handles this - fit on rated books, transform target

3. **What's the minimum similarity threshold for "similar"?**
   - Below some threshold, books aren't really similar
   - **Decision:** Use 0.1 as minimum. Below that, don't include in rationale.

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Subject count weighting | Skip for now, add in M2.3 if needed |
| Domain stop words | Include (book, novel, story, fiction) |
| Series pattern filtering | Add regex filter for "book 1", "volume 2" |
| Text weighting | Title 2x, Author 1x, Subjects 1x |
| Stemming | Skip for MVP |
| Non-English text | Add ASCII normalization |
| Test framework | Use Vitest |
| Minimum similarity | 0.1 threshold |
| Vector persistence | Defer decision to M2.3 |

---

## Next Steps

1. Set up Vitest test framework
2. Implement tokenizer with decisions above
3. Implement TF-IDF vectorizer
4. Implement cosine similarity
5. Write comprehensive tests
6. Benchmark performance

Ready to proceed with implementation via `/workflows:work`.
