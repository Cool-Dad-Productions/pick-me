# Pick Me API Reference

Use this reference when wiring up V0 components to the backend.

## Authentication

Uses NextAuth.js with Credentials provider. Session available via `useSession()` hook.

### POST /api/auth/signin
Standard NextAuth endpoint. Use `signIn('credentials', { email, password })` from `next-auth/react`.

### POST /api/auth/signout
Use `signOut()` from `next-auth/react`.

---

## POST /api/register

Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "id": "cuid",
  "email": "user@example.com"
}
```

**Errors:**
- 400: `{ "error": "Email already registered" }` or validation error
- 500: `{ "error": "Registration failed" }`

---

## GET /api/books/search

Search books by title/author. Requires auth.

**Query Params:**
- `q` - General search query (searches title + author)
- `title` - Search by title only
- `author` - Search by author only

At least one param required.

**Response:**
```ts
{
  results: BookCandidate[]
}

interface BookCandidate {
  externalId: string;    // Open Library work ID
  title: string;
  authors: string[];
  isbn13?: string;
  coverUrl?: string;
}
```

**Example:** `GET /api/books/search?q=project hail mary`

---

## GET /api/books/isbn/[isbn]

Lookup book by ISBN. Creates DB record if not exists. Requires auth.

**Params:**
- `isbn` - ISBN-10 or ISBN-13 (hyphens ok)

**Response:**
```ts
{
  book: {
    id: string;          // DB record ID - use for bookId elsewhere
    isbn13: string;
    title: string;
    authors: string[];
    coverUrl?: string;
    metadata?: object;
  }
}
```

**Errors:**
- 400: `{ "error": "Invalid ISBN format" }`
- 404: `{ "error": "Book not found" }`

---

## GET /api/books/[bookId]

Get book by database ID. Requires auth.

**Response:**
```ts
{
  book: {
    id: string;
    isbn13?: string;
    title: string;
    authors: string[];
    coverUrl?: string;
    metadata?: object;
  }
}
```

**Errors:**
- 404: `{ "error": "Book not found" }`

---

## POST /api/predict

Get rating prediction for a book. Requires auth.

**Request:**
```json
{
  "bookId": "db-book-id"
}
```

**Response:**
```ts
interface PredictionResult {
  predictedRating: number | null;  // 0-5 scale
  confidence: number | null;       // 0-1 scale
  rationale: PredictionRationale[];
}

interface PredictionRationale {
  type: string;      // "existing_rating" | "insufficient_data" | "not_implemented"
  message?: string;
  data?: object;
}
```

**Rationale Types:**
- `existing_rating` - User already rated this book (confidence: 1.0)
- `insufficient_data` - User has < 5 ratings
- `not_implemented` - Prediction algorithm pending (M2)

---

## POST /api/import/csv

Upload CSV file for import. Requires auth. Uses `FormData`.

**Request:**
```ts
const formData = new FormData();
formData.append('file', file);

fetch('/api/import/csv', {
  method: 'POST',
  body: formData
});
```

**Response:**
```ts
interface ImportPreview {
  batchId: string;      // Use this for commit
  filename?: string;
  headers: string[];    // CSV column names
  rows: string[][];     // Preview rows (max 20)
  totalRows: number;    // Total data rows
}
```

---

## POST /api/import/commit

Commit import with column mapping. Requires auth.

**Request:**
```ts
{
  batchId: string;
  columnMap: {
    title: string;    // Required - column name for book title
    author: string;   // Required - column name for author
    rating: string;   // Required - column name for rating
    isbn?: string;    // Optional - column name for ISBN
    date?: string;    // Optional - column name for date read
  }
}
```

**Response:**
```ts
{
  success: true;
  stats: {
    total: number;     // Total rows processed
    imported: number;  // Successfully imported
    errors: number;    // Failed rows
    skipped: number;   // Skipped (missing required fields)
  }
}
```

---

## TypeScript Types

Copy these into your components:

```ts
// For search results
interface BookCandidate {
  externalId: string;
  title: string;
  authors: string[];
  isbn13?: string;
  coverUrl?: string;
}

// For DB book records
interface Book {
  id: string;
  isbn13?: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  metadata?: unknown;
}

// For predictions
interface PredictionResult {
  predictedRating: number | null;
  confidence: number | null;
  rationale: PredictionRationale[];
}

interface PredictionRationale {
  type: string;
  message?: string;
  data?: Record<string, unknown>;
}

// For CSV import
interface ImportPreview {
  batchId: string;
  filename?: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
}

interface ColumnMapping {
  title: string;
  author: string;
  rating: string;
  isbn?: string;
  date?: string;
}

interface ImportStats {
  total: number;
  imported: number;
  errors: number;
  skipped: number;
}
```

---

## Auth Helpers

```ts
// Client-side auth (in components)
import { useSession, signIn, signOut } from 'next-auth/react';

const { data: session, status } = useSession();
// session?.user?.id - user's DB ID
// session?.user?.email - user's email
// status: "loading" | "authenticated" | "unauthenticated"

// Login
await signIn('credentials', {
  email,
  password,
  redirect: false  // Handle redirect manually
});

// Logout
await signOut({ redirect: false });
```

---

## Common Patterns

### Fetch with error handling
```ts
async function fetchBook(bookId: string) {
  const res = await fetch(`/api/books/${bookId}`);
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error);
  }
  const { book } = await res.json();
  return book;
}
```

### ISBN lookup then navigate
```ts
async function lookupIsbn(isbn: string) {
  const res = await fetch(`/api/books/isbn/${encodeURIComponent(isbn)}`);
  if (!res.ok) throw new Error('Book not found');
  const { book } = await res.json();
  router.push(`/books/${book.id}`);
}
```
