# SPEC: Personal Book Rating Predictor (Skeleton App)

## 0) Metadata
- **Project name:** `book-rating-predictor`
- **Primary user:** single personal user (you), but design supports multi-user later.
- **Goal (MVP):** given **ISBN** or **title/author**, return a **predicted star rating** (1.0–5.0 in 0.5 increments) based on imported historical ratings.
- **Hosting:** Vercel
- **DB:** Neon Postgres (use pooled connection string for serverless)
- **Framework:** Next.js App Router + Route Handlers
- **Frontend:** React + TypeScript + TSX
- **Styling:** Tailwind CSS
- **Language:** TypeScript (client + server)

---

## 1) Scope

### 1.1 MVP (Implement now)
1) **Auth (minimal):** Credentials login (email/password) via NextAuth/Auth.js (App Router).
2) **Import ratings:** upload CSV (Goodreads / StoryGraph / generic) and map columns to `{title, author, rating, isbn(optional)}`.
3) **Book lookup:**
   - ISBN → metadata lookup (Open Library first)
   - Title/author → search + disambiguation list
4) **Prediction endpoint:** returns `{predictedRating, confidence, rationale[]}`.
   - Prediction algorithm can be a **placeholder** initially (returns `null` w/ reason) BUT structure must exist.
5) **Core pages:** Login, Import, Search/Scan, Book Detail w/ prediction.

### 1.2 Future milestones (Outline only, do NOT implement fully now)
- M2: Real predictor (TF-IDF similarity; explain “why”)
- M3: Barcode scanning UX (mobile camera)
- M4: Save prediction + later record actual rating; feed back into model
- M5: Optional Google Books fallback
- M6: Photo of pile of books (OCR/barcode batch)
- M7: Facet annotation UI (tags, mood, pace, etc.)

---

## 2) External APIs

### 2.1 Open Library
- **Search:** `https://openlibrary.org/search.json?q=...` or `?title=` / `?author=`
- **ISBN lookup:** Open Library Books API supports ISBN keys; treat as potentially “legacy” and keep wrapper isolated.

### 2.2 Google Books (Future fallback)
- Include optional env var for API key; do not require it for MVP.

---

## 3) Data model (Prisma schema)

### 3.1 Tables

CLAUDE: provide recommended table structure

### 3.2 JSONB conventions
- JSONB columns should store:
  - raw third-party API payloads
  - import mapping + stats
  - rationale arrays / feature flags
- Do not over-normalize early.

---

## 4) App routes (Next.js App Router)

### 4.1 Pages
- `app/(auth)/login/page.tsx`
- `app/import/page.tsx`
- `app/search/page.tsx` (title/author search + ISBN input)
- `app/books/[bookId]/page.tsx` (book detail + predicted rating display)
- `app/page.tsx` → redirect to `/search` if authed else `/login`

### 4.2 API route handlers

#### Auth
- `app/api/auth/[...nextauth]/route.ts` (NextAuth/Auth.js handlers)

#### Import
- `app/api/import/csv/route.ts`
  - POST: multipart upload OR text CSV payload (choose simplest)
  - Response: import batch id + preview rows (first N rows) + inferred columns

- `app/api/import/commit/route.ts`
  - POST: `{ batchId, columnMap }`
  - Creates/updates Book + RatingEvent rows

#### Books
- `app/api/books/search/route.ts`
  - GET: `?q=...` or `?title=...&author=...`
  - Returns list of candidates: `{ externalId, title, authors, isbn13?, coverUrl? }`

- `app/api/books/isbn/[isbn]/route.ts`
  - GET: returns canonical book object; creates/updates Book row in DB

#### Prediction
- `app/api/predict/route.ts`
  - POST: `{ bookId }`
  - Response: `{ predictedRating: number|null, confidence: number|null, rationale: any[] }`
  - MVP: may return nulls with `rationale: [{type:"not_implemented"}]` but must exist.

---

## 5) UI requirements (MVP)

### 5.1 Login page
- Email + password form
- Tailwind styling
- Error states (invalid login)

### 5.2 Import page (2-step)
1) Upload CSV → show preview table of first ~20 rows
2) Column mapping UI:
   - dropdowns for Title, Author, Rating, ISBN(optional), Date(optional)
   - “Commit Import” button
3) Import result summary (counts)

### 5.3 Search page
- Two inputs:
  - ISBN input + “Lookup”
  - Title/Author search + “Search”
- Search results list (cards) → click to open `/books/[bookId]`

### 5.4 Book detail page
- Displays title/author/cover
- Button: “Predict my rating”
- Shows prediction block:
  - predicted rating (or “Not available yet”)
  - confidence (if present)
  - rationale list (if present)

---

## 6) Implementation details (agent guidance)

### 6.1 Packages
- Next.js (App Router)
- React
- TypeScript
- Tailwind
- Prisma + `@prisma/client`
- NextAuth/Auth.js (Next.js integration)
- zod (request validation)
- papaparse (CSV parsing) OR a simple server-side CSV parser
- bcrypt (password hashing for credentials)


### 6.2 Environment variables
Required:
- `DATABASE_URL` (Neon pooled connection string recommended)
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` (seed script will hash and store)

Optional:
- `GOOGLE_BOOKS_API_KEY`

### 6.3 Prisma / migrations
- Provide:
  - `prisma/schema.prisma` with models above
  - `prisma/seed.ts`:
    - upsert admin user using `ADMIN_EMAIL`
    - bcrypt-hash `ADMIN_PASSWORD`

### 6.4 Open Library integration wrapper
- `lib/books/openlibrary.ts` exposes:
  - `searchBooks({q|title, author}) -> Candidate[]`
  - `lookupByIsbn(isbn: string) -> NormalizedBook`
- Keep normalization logic isolated.

### 6.5 Validation + rounding rules
- Rating inputs must be coerced to:
  - `min=1.0`, `max=5.0`
  - increments of `0.5`
- ISBN normalization:
  - accept ISBN-10 or ISBN-13 input
  - store canonical `isbn13` if possible

---

## 7) Skeleton acceptance criteria (what the agent must deliver)
1) `pnpm dev` starts the app locally.
2) Prisma schema + migration works against a local or Neon Postgres.
3) Login flow works (seeded admin user).
4) Import page accepts CSV, shows preview, allows column mapping, commits import.
5) Search page can:
   - query Open Library search
   - select a result and persist a Book row
6) ISBN lookup route works and persists a Book row.
7) Predict endpoint exists and returns a well-typed response (even if stubbed).

---

## 8) Milestones (future, not detailed)
- **M2 (Real predictor):** implement TF-IDF similarity across user-rated books using metadata text; return top 3 nearest neighbors in rationale.
- **M3 (Bookstore UX):** add barcode scanning on mobile; one-tap lookup + predict.
- **M4 (Feedback loop):** store PredictionEvent, allow actual rating entry later; incorporate into model.
- **M5 (Improved metadata):** Seed book database with data from OpenLibrary, Google Books, and Wikidata. Normalize all editions of the same book based on a canonical Works ID. Implement CSV uploads for bulk data import, and API integration for one off requests for missing books. Update prediction model to incorporate new data dimensions (e.g., author, approximate book length, genres).
- **M6 (Pile photo):** detect multiple books (barcode/OCR) and choose best.
