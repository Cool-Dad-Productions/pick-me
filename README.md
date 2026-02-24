# pick-me

Book rating predictor — given your reading history, predict how much you'll enjoy a book.

## How It Works

pick-me learns from your past ratings to predict how much you'll enjoy a new book. You import your reading history (via CSV or barcode scan), and the app uses a TF-IDF similarity engine to find books you've already rated that are most similar to the one you're considering. It computes a weighted average of those ratings, scaled by how similar each comparison book is, and returns a predicted score with a confidence level.

Ratings are tracked at the **work level** — a single intellectual work that may have many editions — so rating the paperback and the hardcover don't create duplicates.

## Tech Stack

- **Next.js 14** (App Router) — pages and API routes
- **TypeScript**
- **Tailwind CSS** + shadcn/ui (Radix primitives)
- **Prisma 6** + **PostgreSQL** via [Neon](https://neon.tech) (branched per environment)
- **NextAuth.js v4** — Credentials provider (email + password)
- **Vitest** — unit tests for the prediction engine
- **Open Library API** — work IDs, subjects, author metadata
- **Google Books API** — genres, page counts, cover images

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- A [Neon](https://neon.tech) account with a project and three branches: `main`, `preview`, `dev`

### Installation

```bash
git clone https://github.com/Cool-Dad-Productions/pick-me.git
cd pick-me
pnpm install
cp .env.example .env
```

Fill in `.env` (see [Environment Variables](#environment-variables) below), then:

```bash
pnpm db:migrate:deploy   # Apply migrations to your dev database
pnpm db:seed             # Create the initial admin user
pnpm dev                 # Start on http://localhost:3000
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon connection string for your `dev` branch |
| `NEXTAUTH_SECRET` | Random string for JWT signing (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | `http://localhost:3000` for local development |
| `ENABLE_SIGN_UP` | Set to `"true"` to allow new registrations; omit or set to any other value to disable sign ups |

> Variables **without** a `NEXT_PUBLIC_` prefix are never sent to the browser. Keep all secrets unprefixed.

## Architecture

### Project Structure

```
pick-me/
├── app/
│   ├── api/              # REST API endpoints
│   ├── book/[isbn]/      # Book detail page
│   ├── import/           # CSV import wizard
│   ├── ratings/          # User ratings list
│   └── search/           # Book search page
├── components/           # React components (ui/ for shadcn primitives)
├── lib/
│   ├── prediction/       # TF-IDF prediction engine
│   ├── books/            # Open Library + Google Books wrappers
│   ├── auth.ts           # NextAuth config
│   ├── db.ts             # Prisma client singleton
│   ├── validations.ts    # Zod schemas
│   └── utils.ts
├── prisma/               # Schema, migrations, seed
├── scripts/              # One-off data migration scripts
├── docs/                 # API reference, plans, brainstorms
├── middleware.ts          # Route auth guard
└── vitest.config.ts
```

### Server / Client Boundary

All files in `lib/` that access the database, secrets, or external APIs use `import 'server-only'` to prevent accidental inclusion in the client bundle. Files that depend on browser APIs (`window`, `localStorage`) use `import 'client-only'`. See [CLAUDE.md](CLAUDE.md) for the full policy.

### Book Identity (Work IDs)

A "work" is a single intellectual creation (e.g., *The Great Gatsby*) that may have hundreds of editions. pick-me stores ratings at the work level so the same book isn't rated multiple times across editions.

Work IDs come in two forms:

- **Real IDs** — fetched from Open Library, formatted `OL123456W`. Authoritative and globally unique.
- **Synthetic IDs** — generated when Open Library doesn't have a match. Formatted `synthetic:<12-char MD5 hash>`, derived deterministically from the normalized title + authors. The import pipeline and `lib/books/workId.ts` must use the same normalization logic to ensure consistency.

### Book Enrichment & Metadata

Books are enriched lazily on demand (and can be force-refreshed). `lib/books/enrichment.ts` orchestrates two sources:

- **Open Library** (`openlibrary.ts`) — subjects, publication year
- **Google Books** (`googlebooks.ts`) — genres/categories, page count, cover image

Google Books has a 1,000 requests/day quota when using an API key. The client tracks usage in memory with a daily reset and skips the call when the quota is exhausted.

## Prediction Engine

The engine lives entirely in `lib/prediction/` and has no dependencies on the database or HTTP — it operates on plain objects and is fully unit-tested.

### Algorithm Overview

1. **Tokenize** each book's title, authors, genres, subjects, and tags into a bag of normalized terms. Stop words and series indicators are removed. Title and genre tokens are weighted 2× by repetition. Page count and publication year are bucketed into categorical tokens (`short`, `medium`, `long`; `classic`, `modern`, `contemporary`).

2. **Vectorize** using TF-IDF across the user's entire rated corpus. Each book becomes a sparse vector where higher values mean more distinctive terms.

3. **Compute cosine similarity** between the target book and every rated book. Books below a minimum threshold (0.1) are excluded.

4. **Predict** using a similarity-weighted average of the top 3 most similar books' ratings, rounded to the nearest 0.5.

### Similarity Scoring

Cosine similarity ranges from 0 (no overlap) to 1 (identical). The top 5 overlapping terms are surfaced per comparison pair and shown to the user as the prediction rationale ("because you liked *X*, which shares themes Y and Z").

### Confidence

```
confidence = (avgSimilarity × 0.7) + (bookCountFactor × 0.3)
bookCountFactor = min(numSimilarBooks / 3, 1.0)
```

Confidence below 0.3 is flagged as uncertain — this happens when the user has few rated books or none are similar to the target. At least 5 work-level ratings are required before any prediction is returned.

## Database

### Schema

| Table | Purpose |
|-------|---------|
| `User` | Account credentials (bcrypt-hashed password) |
| `Book` | Canonical book records keyed by ISBN-13, enriched lazily |
| `WorkRating` | **Primary ratings table** — one rating per user per work ID |
| `UserRating` | Legacy edition-level ratings, kept for historical reference |
| `ImportBatch` | Tracks CSV uploads through the two-phase import flow |

`Book` stores arrays for `authors`, `subjects`, `genres`, and `tags`. `WorkRating.openLibraryWorkId` is indexed for fast prediction lookups.

### Neon Branching Strategy

| Environment | Neon Branch | Set In |
|-------------|-------------|--------|
| Production | `main` | Vercel production env vars |
| Preview / Staging | `preview` | Vercel preview env vars |
| Development | `dev` | Local `.env` |

Each branch is a copy-on-write snapshot of production. Changes are isolated — dev and preview share production's data at branch time but diverge independently.

### Migrations

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate and review migration SQL
pnpm db:migrate:dev --name descriptive-name
# 3. Commit prisma/schema.prisma and prisma/migrations/<timestamp>_descriptive-name/
# 4. Migrations are applied automatically on Vercel deploy
```

The Vercel build command runs `prisma migrate deploy` before `next build`.

### Seeding

```bash
pnpm db:seed   # Creates the initial admin user defined in prisma/seed.ts
```

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/register` | POST | No | Create a new user account |
| `/api/auth/[...nextauth]` | GET/POST | — | NextAuth session handler |
| `/api/books/search` | GET | Yes | Search books via Open Library (`?q=`, `?title=`, `?author=`) |
| `/api/books/isbn/[isbn]` | GET | Yes | Look up by ISBN, create/enrich DB record |
| `/api/books/[bookId]` | GET | Yes | Fetch a book by internal ID |
| `/api/books/enrich` | POST | Yes | Trigger metadata enrichment for a book |
| `/api/ratings` | GET | Yes | List user's work ratings (paginated, sortable) |
| `/api/ratings` | POST | Yes | Create or update a work-level rating |
| `/api/ratings/[ratingId]` | DELETE | Yes | Delete a rating |
| `/api/predict` | POST | Yes | Predict rating for a book (`{ bookId }`) |
| `/api/import/csv` | POST | Yes | Upload CSV — returns preview and `batchId` |
| `/api/import/commit` | POST | Yes | Commit import with column mapping |

Full request/response shapes are documented in [docs/API_REFERENCE.md](docs/API_REFERENCE.md).

## Importing Books

### CSV Import

The import flow is two-phase to give users a chance to map columns before committing.

**Phase 1 — Upload (`POST /api/import/csv`):** The CSV is parsed, stored as a pending `ImportBatch`, and a preview of the first 20 rows is returned.

**Phase 2 — Commit (`POST /api/import/commit`):** The client sends a column mapping (e.g., which column is the title, rating, ISBN). The server:
1. Parses and validates each row
2. Matches or creates `Book` records (by ISBN, then by title + author)
3. Resolves a work ID for each book (Open Library lookup, or synthetic fallback)
4. Deduplicates by work ID — if two rows map to the same work, the last one wins
5. Upserts `WorkRating` records

Import stats (rows processed, books created, duplicates merged, API calls made) are returned on completion.

### Barcode Scanner

The search page includes a camera-based barcode scanner powered by `html5-qrcode`. It detects EAN-13 barcodes, validates that the ISBN starts with `978` or `979`, and automatically triggers an ISBN lookup. Successful scans produce haptic feedback on supported devices.

## Testing

Tests cover the prediction engine end-to-end (tokenizer → TF-IDF → similarity → predictor).

```bash
pnpm test             # Run all tests
pnpm test:coverage    # Coverage report
```

Tests are in `lib/prediction/__tests__/`. Each module has its own test file. `server-only` is mocked via `vi.mock('server-only', () => ({}))` to avoid Node runtime errors.

## Deployment

The app is deployed on [Vercel](https://vercel.com). The build command is:

```bash
prisma migrate deploy && prisma generate && next build
```

Set the following environment variables in the Vercel dashboard, scoped per environment (production → `main` Neon branch, preview → `preview` branch):

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `ENABLE_SIGN_UP` (optional — omit to keep sign ups closed)

`next.config.js` whitelists `covers.openlibrary.org` as a trusted image host. Next.js image optimization is disabled (`unoptimized: true`) to avoid Vercel bandwidth costs on cover images.

## Contributing

```bash
pnpm dev          # Development server with hot reload
pnpm lint         # ESLint
pnpm test         # Vitest
pnpm build        # Production build (runs locally against dev DB)
pnpm db:studio    # Prisma Studio — browse/edit the dev database
```

Branch off `main`, open a PR, and Vercel will deploy a preview automatically against the `preview` Neon branch.

## Further Reading

- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) — full API documentation with TypeScript types and examples
- [docs/plans/](docs/plans/) — per-milestone architecture decisions and implementation notes (M0 through M7+)
- [docs/brainstorms/](docs/brainstorms/) — design exploration and early thinking
- [CLAUDE.md](CLAUDE.md) — AI coding assistant instructions and server/client boundary policy
