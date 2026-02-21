---
title: "M7.6: Import Tags Column Support"
type: feat
milestone: M7.6
date: 2026-02-21
---

# M7.6: Import Tags Column Support

## Overview

M7 shipped user-editable tags on book detail pages. M7.6 extends the CSV import wizard to accept an optional **Tags** column, allowing users to bulk-import their tags alongside ratings in one pass.

---

## Problem Statement

Users who maintain tags externally (e.g., in a Goodreads shelf, a spreadsheet, or a StoryGraph custom shelf column) have no way to import that signal into pick-me. They must visit each book detail page individually and type tags by hand after importing ratings. This creates friction and leaves the TF-IDF corpus tag-sparse for bulk importers.

---

## Proposed Solution

Add `tags` as an optional column to the existing 4-step import wizard. The column value is comma-delimited (e.g. `slow burn, coming of age, unreliable narrator`), matching the existing inline-edit input convention. When mapped, tags are normalized and persisted to the book record with work-level propagation — the same logic already used by `PATCH /api/books/[bookId]`.

**Behavioural contract:**
- Column is optional — existing imports without a Tags column are unaffected
- If a row's tags cell is empty, the book's existing tags are **left unchanged** (no-op)
- If a row has tags, they **replace** the book's current tags (last-write-wins, consistent with rating deduplication)
- Work-level propagation applies: if the book has an `openLibraryWorkId`, all editions sharing that ID are updated

---

## Technical Approach

### Architecture

```
Import Wizard (Client)
  └─ REQUIRED_FIELDS ← add { key: "tags", label: "Tags", required: false }
  └─ auto-map: match header containing "tag"
  └─ columnMap: { ...existing, tags?: string }
        └─ POST /api/import/commit { batchId, columnMap }
              └─ parse tags column (comma-split → tagsSchema)
              └─ Phase 1: extract tags per row → ResolvedImport.tags
              └─ Phase 2: dedup by workId (last row wins, tags included)
              └─ Phase 3: after WorkRating upsert, if tags present:
                    └─ updateMany by openLibraryWorkId (or update by id)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Empty cell behaviour | Skip (no-op) | Preserves hand-entered tags for books where the CSV has no tag data |
| Non-empty cell behaviour | Replace | Consistent with import philosophy — importing is authoritative |
| Tag parsing | Same comma-split as UI input | Reuses `tagsSchema`; no new parsing logic |
| Deduplication | Last occurrence wins | Consistent with existing rating dedup in Phase 2 |
| Work-level propagation | Reuse same `updateMany` pattern as PATCH endpoint | DRY |

---

## Files to Change

| File | Change |
|---|---|
| `lib/types.ts` | Add `tags?: string` to `ColumnMapping` interface |
| `lib/validations.ts` | Add `tags: z.string().optional()` to `columnMappingSchema` |
| `app/import/page.tsx` | Add tags entry to `REQUIRED_FIELDS`; include in `columnMap` build; update auto-map hint |
| `app/api/import/commit/route.ts` | Get `tagsIdx`; add `tags` to `ResolvedImport`; parse + validate per row; update book in Phase 3 |

---

## Implementation Phases

### Phase 1: Types & Validation Schema

**File: `lib/types.ts`**

```typescript
// lib/types.ts
export interface ColumnMapping {
  title: string
  author: string
  rating: string
  isbn?: string
  date?: string
  tags?: string    // ← new
}
```

**File: `lib/validations.ts`** — extend `columnMappingSchema`:

```typescript
export const columnMappingSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  rating: z.string().min(1),
  isbn: z.string().optional(),
  date: z.string().optional(),
  tags: z.string().optional(),   // ← new
});
```

No changes to `tagsSchema` — it will be reused as-is in the commit route.

---

### Phase 2: Import Page UI

**File: `app/import/page.tsx`**

Add tags to `REQUIRED_FIELDS` array (after `date`):

```typescript
const REQUIRED_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "title",  label: "Title",     required: true  },
  { key: "author", label: "Author",    required: true  },
  { key: "rating", label: "Rating",    required: true  },
  { key: "isbn",   label: "ISBN",      required: false },
  { key: "date",   label: "Date Read", required: false },
  { key: "tags",   label: "Tags",      required: false }, // ← new
]
```

Update `handleImport` to include `tags` in `columnMap`:

```typescript
const columnMap: ColumnMapping = {
  title:  mapping.title,
  author: mapping.author,
  rating: mapping.rating,
  isbn:   mapping.isbn,
  date:   mapping.date,
  tags:   mapping.tags,   // ← new (undefined if not mapped)
}
```

Auto-map logic already iterates `REQUIRED_FIELDS` matching `field.key` against header names — adding the entry is sufficient. Headers containing "tag" or "tags" will auto-match.

---

### Phase 3: Commit Route

**File: `app/api/import/commit/route.ts`**

**3a. Extend `ResolvedImport` interface:**

```typescript
interface ResolvedImport {
  workId:   string;
  bookId:   string;
  rating:   number;
  rowIndex: number;
  tags:     string[] | null;  // ← new; null = column not mapped or cell empty
}
```

**3b. Get column index after existing `isbnIdx` line:**

```typescript
const tagsIdx = columnMap.tags ? headers.indexOf(columnMap.tags) : -1;
```

**3c. Parse tags in Phase 1 loop (after extracting `isbn`, before creating `ResolvedImport`):**

```typescript
// Parse tags if column is mapped and cell is non-empty
let importedTags: string[] | null = null;
if (tagsIdx >= 0) {
  const rawTags = row[tagsIdx]?.trim();
  if (rawTags) {
    const parsed = rawTags.split(',').map((t) => t.trim()).filter(Boolean);
    const tagResult = tagsSchema.safeParse(parsed);
    if (tagResult.success) {
      importedTags = tagResult.data;
    }
  }
}

resolved.push({
  workId,
  bookId: book.id,
  rating,
  rowIndex,
  tags: importedTags,  // ← new
});
```

**3d. Update Phase 3 loop — after WorkRating upsert, apply tags if present:**

```typescript
// Update book tags if tags column was mapped and row had tag data
if (item.tags !== null) {
  if (book.openLibraryWorkId) {
    await db.book.updateMany({
      where: { openLibraryWorkId: book.openLibraryWorkId },
      data: { tags: item.tags },
    });
  } else {
    await db.book.update({
      where: { id: item.bookId },
      data: { tags: item.tags },
    });
  }
}
```

Note: `book` in Phase 3 only has `workId` and `bookId` from `ResolvedImport`. We need to look up `openLibraryWorkId` — it's already available on the `book` object fetched in Phase 1. We need to carry it through `ResolvedImport`:

```typescript
interface ResolvedImport {
  workId:             string;
  bookId:             string;
  openLibraryWorkId:  string | null;  // ← also add this
  rating:             number;
  rowIndex:           number;
  tags:               string[] | null;
}
```

And populate it:
```typescript
resolved.push({
  workId,
  bookId: book.id,
  openLibraryWorkId: book.openLibraryWorkId,  // ← new
  rating,
  rowIndex,
  tags: importedTags,
});
```

---

## Acceptance Criteria

### Functional

- [x] Tags column appears in the column mapping step as an optional field
- [x] Auto-map correctly detects CSV headers containing "tag" (case-insensitive)
- [x] Importing a CSV with a tags column updates `Book.tags` for each mapped row with a non-empty cell
- [x] Tags are normalized: trimmed, lowercased, deduplicated (via `tagsSchema`)
- [x] Rows with an empty tags cell do not overwrite existing `Book.tags` (no-op)
- [x] Work-level propagation: all editions sharing `openLibraryWorkId` receive the updated tags
- [x] Importing without a tags column mapping behaves identically to pre-M7.6 (no regressions)
- [x] Tags exceeding 100 chars or batches exceeding 50 tags are silently dropped per `tagsSchema` validation (or row is skipped gracefully)

### UI

- [x] Tags field appears in the mapping UI with "(optional)" visual treatment matching ISBN and Date Read
- [x] Preview table shows tags column when mapped
- [x] Auto-map populates the Tags selector when a "tags" header is detected

### Edge Cases

- [x] CSV with a tags column but all cells empty → no book tags updated
- [x] Multi-edition dedup: if two rows map to the same work, last row's tags win (consistent with rating dedup)
- [x] Tags with internal commas in quoted CSV cells are parsed correctly (PapaParse handles quoting; we split the raw cell value, so a cell like `"dystopia, sci-fi"` becomes `["dystopia", "sci-fi"]` correctly)

---

## References

### Internal

- Import page: [app/import/page.tsx](../../app/import/page.tsx)
- Import commit route: [app/api/import/commit/route.ts](../../app/api/import/commit/route.ts)
- Column mapping type: [lib/types.ts:24](../../lib/types.ts#L24)
- Column mapping schema: [lib/validations.ts:77](../../lib/validations.ts#L77)
- Tags schema: [lib/validations.ts:94](../../lib/validations.ts#L94)
- Book PATCH (work-level propagation reference): [app/api/books/[bookId]/route.ts](../../app/api/books/%5BbookId%5D/route.ts)
- M7 tags plan: [docs/plans/m7/2026-02-21-m7-feat-user-tags-work-metadata-plan.md](./2026-02-21-m7-feat-user-tags-work-metadata-plan.md)
