---
title: "M2.4: Prediction Rationale UI Enhancements"
type: feat
date: 2026-02-12
status: complete
---

# M2.4: Prediction Rationale UI Enhancements

## Overview

Enhance the book detail page to display prediction rationale in a user-friendly way, showing similar books the user has rated, match percentages, matching subjects, and confidence indicators with graceful fallbacks for edge cases.

## Problem Statement / Motivation

Currently, the prediction endpoint returns rich rationale data including similar books, match percentages, and matching terms, but the UI only displays a numbered list of text messages. Users cannot see:
- Which of their rated books influenced the prediction
- Why those books are considered similar
- How confident the prediction is (visually)

This makes the prediction feel like a "black box" and reduces user trust in the system.

## Proposed Solution

Create a new "Similar Books" section on the book detail page that visually displays:
1. Top 3 similar books the user has rated
2. Each book's title, the user's rating, and similarity percentage
3. Matching subjects/terms as badges for transparency
4. A visual confidence indicator with semantic labels (High/Medium/Low)
5. Graceful fallbacks for low confidence, no similar books, and edge cases

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ app/book/[isbn]/page.tsx (Server Component)                    │
│   └── Fetches prediction data, passes to client components     │
├─────────────────────────────────────────────────────────────────┤
│ components/prediction-display.tsx (Client Component)           │
│   ├── ConfidenceIndicator - Visual bar + label                 │
│   ├── SimilarBooksSection - Container for similar books        │
│   │   └── SimilarBookCard - Individual similar book display    │
│   └── Fallback states (low confidence, no similar books)       │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. `components/prediction-display.tsx`

Main client component that orchestrates the prediction display:

```tsx
// components/prediction-display.tsx
"use client";

interface PredictionDisplayProps {
  prediction: PredictionResult;
  bookTitle: string;
}

// Confidence thresholds
const CONFIDENCE_LEVELS = {
  high: { min: 0.7, label: "High", color: "success" },
  medium: { min: 0.3, label: "Medium", color: "warning" },
  low: { min: 0, label: "Low", color: "muted" },
};
```

**Responsibilities:**
- Render predicted rating with StarRating component
- Render ConfidenceIndicator
- Conditionally render SimilarBooksSection or fallback states
- Handle all rationale types gracefully

#### 2. `components/confidence-indicator.tsx`

Visual confidence display:

```tsx
// components/confidence-indicator.tsx
"use client";

interface ConfidenceIndicatorProps {
  confidence: number; // 0-1 scale
  className?: string;
}
```

**Design decisions:**
- Use existing `Progress` component (consistent with codebase)
- Add semantic label: "High (82%)", "Medium (45%)", "Low (18%)"
- Color-coded: success (green) for high, warning (yellow) for medium, muted for low
- Include subtle background color shift based on confidence level

#### 3. `components/similar-books-section.tsx`

Container for similar books:

```tsx
// components/similar-books-section.tsx
"use client";

interface SimilarBooksSectionProps {
  similarBooks: SimilarBook[];
  isLowConfidence?: boolean;
}

interface SimilarBook {
  id: string;
  title: string;
  authors: string[];
  yourRating: number;
  similarityPercent: number;
  matchingTerms: string[];
}
```

**Responsive layout:**
- Mobile (`<640px`): Single column, stacked cards
- Tablet (`640px-1024px`): 2-column grid
- Desktop (`>1024px`): 3-column grid (or flex row)

#### 4. `components/similar-book-card.tsx`

Individual similar book display:

```tsx
// components/similar-book-card.tsx
"use client";

interface SimilarBookCardProps {
  book: SimilarBook;
}
```

**Design:**
```
┌─────────────────────────────────────────────┐
│ 📚 The Name of the Wind      ★★★★★ (93%)   │
│    Matching: Fantasy, Magic, Coming of Age  │
└─────────────────────────────────────────────┘
```

**Implementation details:**
- Book emoji or small icon (no cover images - API doesn't return them)
- Title truncated at ~40 chars with ellipsis
- StarRating component (size="sm")
- Similarity percentage in parentheses
- Matching terms as Badge components (max 3, then "+N more")
- Cards are NOT clickable links (ISBN not in response data)

### Data Flow

1. **Server Component** (`app/book/[isbn]/page.tsx`):
   - Fetches prediction via API call
   - Passes prediction result to PredictionDisplay

2. **PredictionDisplay** parses rationale:
   - Finds `similar_books` or `low_confidence` rationale type
   - Extracts `similarBooks` array from rationale data
   - Determines confidence level and appropriate styling

3. **Rendering logic**:
   ```
   if (rationale.type === 'existing_rating') → Show existing rating
   if (rationale.type === 'insufficient_data') → Show import CTA
   if (rationale.type === 'no_similar_books') → Show "no similar books" message
   if (rationale.type === 'low_confidence') → Show prediction with warning styling
   if (rationale.type === 'similar_books') → Show full prediction UI
   ```

### Term Formatting

Matching terms from the TF-IDF engine may be normalized/tokenized. Apply these transformations:

```tsx
function formatMatchingTerm(term: string): string {
  return term
    .replace(/_/g, " ")           // coming_of_age → coming of age
    .replace(/\b\w/g, c => c.toUpperCase()); // coming of age → Coming Of Age
}
```

### Confidence Level Thresholds

| Confidence | Label | Color | Visual Treatment |
|------------|-------|-------|------------------|
| ≥70% | High | Success (green) | Solid progress bar, positive messaging |
| 30-69% | Medium | Warning (amber) | Progress bar, neutral messaging |
| <30% | Low | Muted (gray) | De-emphasized bar, caveat messaging |

### Mobile Responsive Breakpoints

Following existing codebase patterns:

```css
/* Mobile (default) */
.similar-books-grid {
  @apply grid grid-cols-1 gap-4;
}

/* Tablet */
@screen sm {
  .similar-books-grid {
    @apply grid-cols-2;
  }
}

/* Desktop */
@screen lg {
  .similar-books-grid {
    @apply grid-cols-3;
  }
}
```

## Acceptance Criteria

### Functional Requirements

- [x] **Similar books displayed**: Show top 3 similar books with title, user's rating, and match percentage
- [x] **Matching subjects shown**: Display matching terms as badges for each similar book
- [x] **Confidence indicator**: Visual progress bar with percentage and semantic label (High/Medium/Low)
- [x] **Graceful fallbacks**:
  - [x] Low confidence: Warning styling with caveat message
  - [x] No similar books: Helpful message explaining the situation
  - [x] Existing rating: Show existing rating (no prediction needed)
  - [x] Insufficient data: Import CTA (already implemented)

### Non-Functional Requirements

- [x] **Mobile-responsive**: Stacked layout on mobile, grid on larger screens
- [x] **Accessibility**: Proper ARIA labels for star ratings and confidence
- [x] **Performance**: No additional API calls (uses existing prediction response)
- [x] **Consistency**: Uses existing UI primitives (Badge, Progress, StarRating, Card)

### Quality Gates

- [x] Component renders correctly for all rationale types
- [x] Mobile layout verified at 320px, 375px, 768px widths
- [x] Screen reader announces ratings and confidence appropriately
- [x] No layout shifts when content loads

## Implementation Phases

### Phase 1: Core Components

**Files to create:**
- `components/prediction-display.tsx` - Main orchestration component
- `components/confidence-indicator.tsx` - Confidence bar with label
- `components/similar-books-section.tsx` - Container for similar books
- `components/similar-book-card.tsx` - Individual similar book card

**Tasks:**
1. Create ConfidenceIndicator component with Progress bar and semantic label
2. Create SimilarBookCard component with title, rating, similarity, terms
3. Create SimilarBooksSection container with responsive grid
4. Create PredictionDisplay that composes all pieces

### Phase 2: Integration

**Files to modify:**
- `app/book/[isbn]/page.tsx` - Replace current rationale display

**Tasks:**
1. Import PredictionDisplay component
2. Replace numbered rationale list with new component
3. Ensure all existing edge cases still work
4. Add loading/skeleton state if needed

### Phase 3: Polish & Edge Cases

**Tasks:**
1. Verify low confidence styling looks appropriate
2. Test with various book title lengths
3. Test with 0, 1, 2, 3 similar books
4. Test with 0, 1, 3, 5 matching terms
5. Mobile testing across device sizes
6. Add accessibility attributes (aria-label, etc.)

## Edge Cases & Handling

| Edge Case | Handling |
|-----------|----------|
| Long book title (50+ chars) | Truncate with ellipsis, use `line-clamp-1` |
| No matching terms | Hide "Matching:" line entirely |
| 1-2 similar books | Show available books, adjust grid |
| Very low similarity (10-30%) | Still show, but with low confidence styling |
| 4+ matching terms | Show first 3, then "+N more" badge |

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `components/prediction-display.tsx` | Create | Main prediction UI component |
| `components/confidence-indicator.tsx` | Create | Visual confidence display |
| `components/similar-books-section.tsx` | Create | Container for similar books grid |
| `components/similar-book-card.tsx` | Create | Individual similar book card |
| `app/book/[isbn]/page.tsx` | Modify | Integrate new prediction display |

## Design Mockup

### Desktop (Full Width)

```
┌─────────────────────────────────────────────────────────────────┐
│  Predicted Rating: ★★★★☆ (4.0)                                  │
│                                                                 │
│  Confidence: [████████████████░░░░] High (82%)                  │
│                                                                 │
│  Based on similar books you've rated:                           │
│  ┌───────────────────┬───────────────────┬───────────────────┐ │
│  │ 📚 The Name of    │ 📚 Mistborn       │ 📚 The Way of     │ │
│  │    the Wind       │                   │    Kings          │ │
│  │ ★★★★★  93% match  │ ★★★★☆  87% match  │ ★★★★★  79% match  │ │
│  │ Fantasy, Magic,   │ Fantasy, Magic    │ Fantasy, Epic     │ │
│  │ Coming of Age     │ Systems           │                   │ │
│  └───────────────────┴───────────────────┴───────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile (Stacked)

```
┌─────────────────────────────┐
│ Predicted Rating: ★★★★☆    │
│ (4.0)                       │
│                             │
│ Confidence:                 │
│ [████████████░░░] High 82%  │
│                             │
│ Based on similar books:     │
│ ┌─────────────────────────┐ │
│ │ 📚 The Name of the Wind │ │
│ │ ★★★★★  93% match        │ │
│ │ Fantasy, Magic, +1 more │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 📚 Mistborn             │ │
│ │ ★★★★☆  87% match        │ │
│ │ Fantasy, Magic Systems  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 📚 The Way of Kings     │ │
│ │ ★★★★★  79% match        │ │
│ │ Fantasy, Epic           │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Low Confidence Fallback

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ Predicted Rating: ★★★☆☆ (3.0)                               │
│                                                                 │
│  Confidence: [████░░░░░░░░░░░░░░░░] Low (22%)                   │
│                                                                 │
│  ⚠️ This prediction is based on loosely similar books.          │
│     Take it with a grain of salt!                               │
│                                                                 │
│  Based on what we found:                                        │
│  [Similar books shown with warning-tinted cards]                │
└─────────────────────────────────────────────────────────────────┘
```

## Dependencies & Prerequisites

- ✅ Prediction API returns `similarBooks` data (completed in M2.3)
- ✅ StarRating component exists (completed)
- ✅ Progress component exists (shadcn/ui)
- ✅ Badge component exists (shadcn/ui)

## Success Metrics

| Metric | Target |
|--------|--------|
| All rationale types render correctly | 100% |
| Mobile layout works at 320px | Pass |
| Accessibility audit (axe) | No critical issues |
| No additional API latency | 0ms added |

## References

### Internal References

- Prediction API: [app/api/predict/route.ts](app/api/predict/route.ts)
- Predictor logic: [lib/prediction/predictor.ts](lib/prediction/predictor.ts)
- Book detail page: [app/book/[isbn]/page.tsx](app/book/[isbn]/page.tsx)
- StarRating component: [components/star-rating.tsx](components/star-rating.tsx)
- UI primitives: [components/ui/](components/ui/)

### Related Milestones

- M2.1: Metadata Enrichment ✅
- M2.2: TF-IDF Engine ✅
- M2.3: Prediction Algorithm ✅
- **M2.4: UI Enhancements** ← This plan
