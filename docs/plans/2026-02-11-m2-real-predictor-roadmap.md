---
title: "M2: Real Predictor Roadmap"
type: roadmap
date: 2026-02-11
status: draft
---

# M2: Real Predictor Roadmap

## Overview

Transform the placeholder prediction endpoint into a working TF-IDF-based recommendation engine that predicts book ratings based on similarity to previously rated books.

**Goal:** Given a book the user hasn't rated, predict their rating by finding similar books they *have* rated and weighting by similarity.

**Architecture Decision:** Server-side TypeScript implementation with enriched metadata (subjects/genres) from Open Library.

---

## Current State (M1 Complete)

- ✅ Prediction endpoint exists at `app/api/predict/route.ts`
- ✅ Returns stub response with `not_implemented` rationale
- ✅ Already checks: auth, existing ratings, minimum 5-book threshold
- ✅ Books table has `metadata: Json?` storing raw Open Library data
- ✅ UserRating table tracks user's book ratings (1.0-5.0 scale)

**Gap:** No similarity computation, no enriched metadata for comparison.

---

## Sub-Milestones

### M2.1: Metadata Enrichment

**Goal:** Fetch and store subjects/genres for all books to enable meaningful similarity matching.

**Scope:**
- Extend Open Library integration to fetch work-level subjects
- Add `subjects: string[]` field to Book model (or extract from metadata JSONB)
- Create enrichment logic (on-demand or background) for existing books
- Handle books with missing subjects gracefully

**Key Files:**
- [lib/books/openLibrary.ts](lib/books/openLibrary.ts) - Add subject fetching
- [prisma/schema.prisma](prisma/schema.prisma) - Consider adding subjects column
- New: `lib/books/enrichment.ts` - Enrichment orchestration

**Acceptance Criteria:**
- [x] Books have subjects populated from Open Library works API
- [x] Existing imported books can be enriched on-demand
- [x] New books fetched via ISBN/search include subjects

---

### M2.2: TF-IDF Engine

**Goal:** Build a pure TypeScript TF-IDF implementation for computing book similarity.

**Scope:**
- Text preprocessing: tokenization, lowercasing, stop word removal
- TF-IDF vectorization of book text (title + authors + subjects)
- Cosine similarity calculation between vectors
- Efficient computation for user's book collection (target: <100ms for 500 books)

**Key Files:**
- New: `lib/prediction/tokenizer.ts` - Text preprocessing
- New: `lib/prediction/tfidf.ts` - TF-IDF vectorization
- New: `lib/prediction/similarity.ts` - Cosine similarity
- New: `lib/prediction/__tests__/` - Unit tests

**Technical Notes:**
- No external NLP libraries needed for MVP
- Simple stop words list (English common words)
- Optional: basic stemming (Porter stemmer) for better matching

**Acceptance Criteria:**
- [x] Can tokenize book text into normalized terms
- [x] Can compute TF-IDF vectors for a set of books
- [x] Can calculate cosine similarity between two book vectors
- [x] Unit tests cover edge cases (empty subjects, special characters)

---

### M2.3: Prediction Algorithm

**Goal:** Integrate TF-IDF engine with the prediction endpoint to return real predictions.

**Scope:**
- Fetch user's rated books with full metadata
- Compute similarity between target book and all rated books
- Find top-k most similar books (k=3 for rationale)
- Calculate predicted rating as weighted average by similarity
- Return confidence score based on similarity distribution

**Algorithm (pseudocode):**
```
1. Get target book B
2. Get user's rated books R[] with ratings
3. For each r in R: compute similarity(B, r)
4. Sort by similarity, take top 3 as neighbors
5. predicted_rating = Σ(similarity[i] × rating[i]) / Σ(similarity[i])
6. confidence = avg(top 3 similarities)
7. Return { predictedRating, confidence, rationale: neighbors }
```

**Key Files:**
- [app/api/predict/route.ts](app/api/predict/route.ts) - Replace stub with real logic
- New: `lib/prediction/predictor.ts` - Prediction orchestration

**Acceptance Criteria:**
- [x] Prediction returns real rating (1.0-5.0 in 0.5 increments)
- [x] Rationale includes top 3 similar books with similarity scores
- [x] Handles edge cases: no similar books, all low similarity
- [x] Performance: <500ms for typical user library

---

### M2.4: UI Enhancements

**Goal:** Display prediction rationale in a user-friendly way.

**Scope:**
- Show "Similar books you've rated" section with the 3 neighbors
- Display each neighbor's: title, your rating, similarity %
- Visual confidence indicator (e.g., confidence bar or stars)
- Explain *why* books are similar (matching subjects)

**Key Files:**
- [app/books/[bookId]/page.tsx](app/books/[bookId]/page.tsx) - Enhanced prediction display
- [components/](components/) - New prediction result component

**Mockup:**
```
┌─────────────────────────────────────────────────────┐
│  Predicted Rating: ★★★★☆ (4.0)                      │
│  Confidence: ●●●●○ High (82%)                       │
│                                                     │
│  Based on similar books you've rated:               │
│  ┌─────────────────────────────────────────────────┐│
│  │ 📚 The Name of the Wind     ★★★★★  (93% match) ││
│  │    Matching: Fantasy, Magic, Coming of Age      ││
│  ├─────────────────────────────────────────────────┤│
│  │ 📚 Mistborn                  ★★★★☆  (87% match) ││
│  │    Matching: Fantasy, Magic Systems             ││
│  ├─────────────────────────────────────────────────┤│
│  │ 📚 The Way of Kings          ★★★★★  (79% match) ││
│  │    Matching: Fantasy, Epic                      ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Similar books displayed with ratings and match percentage
- [ ] Matching subjects shown for transparency
- [ ] Graceful fallback when confidence is low
- [ ] Mobile-responsive layout

---

## Implementation Order

```
M2.1 (Metadata) ──┐
                  ├──→ M2.3 (Prediction) ──→ M2.4 (UI)
M2.2 (TF-IDF) ────┘
```

**M2.1 and M2.2 can be developed in parallel** - they have no dependencies on each other.

**M2.3 depends on both** - needs enriched metadata AND the TF-IDF engine.

**M2.4 depends on M2.3** - needs working prediction to display results.

---

## Technical Considerations

### Performance
- TF-IDF computation for 500 books should complete in <100ms
- Consider caching TF-IDF vectors in memory or DB if needed
- Lazy enrichment: don't block book creation on subject fetching

### Open Library Rate Limits
- Open Library has no official rate limits but be respectful
- Batch enrichment should add delays between requests
- Cache work-level data to avoid redundant fetches

### Edge Cases
- Books with no subjects: fall back to title+author similarity only
- Very new books: may have sparse Open Library data
- User with <5 ratings: already handled (returns insufficient_data)

### Testing Strategy
- Unit tests for TF-IDF engine (tokenizer, vectorizer, similarity)
- Integration tests for prediction endpoint
- Manual testing with real Goodreads/StoryGraph import data

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Prediction latency (p95) | <500ms |
| Subject coverage | >80% of books have subjects |
| User satisfaction | Predictions "feel right" for known books |

---

## Future Considerations (Post-M2)

- **M4 Feedback Loop:** Store predictions, compare to actual ratings, improve model
- **Collaborative Filtering:** Use other users' ratings if multi-user is added
- **Hybrid Approach:** Combine TF-IDF with author/series signals
- **Caching:** Pre-compute similarity matrix for frequent predictions

---

## References

- [Open Library Works API](https://openlibrary.org/dev/docs/api/books) - Subject data
- [TF-IDF Wikipedia](https://en.wikipedia.org/wiki/Tf%E2%80%93idf) - Algorithm reference
- Current prediction stub: [app/api/predict/route.ts:82](app/api/predict/route.ts#L82)
