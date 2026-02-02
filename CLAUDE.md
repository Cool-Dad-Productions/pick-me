# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Description

pick-me (Book Rating Predictor): A tool to predict how much you'll enjoy a book based on your reading history.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma + PostgreSQL (Neon)
- NextAuth.js v4 (Credentials provider)

## Common Commands

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm lint         # Run ESLint
pnpm db:push      # Push schema to database
pnpm db:seed      # Seed database with admin user
pnpm db:studio    # Open Prisma Studio
```

## Environment Table Prefixes

Tables are prefixed based on `VERCEL_ENV` to isolate data per environment:

| Environment | VERCEL_ENV | Prefix | Example |
|-------------|------------|--------|---------|
| Production | `production` | (none) | `User` |
| Preview | `preview` | `preview_` | `preview_User` |
| Development | `development` or unset | `dev_` | `dev_User` |

The schema is auto-generated before Prisma commands. See `scripts/generate-prisma-schema.ts`.

## Project Structure

- `app/` - Next.js App Router pages and API routes
- `components/` - React components (ui/ for primitives)
- `lib/` - Shared utilities (auth, db, validations, books/)
- `prisma/` - Database schema and seed script
- `types/` - TypeScript type definitions

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `NEXTAUTH_SECRET` - Random secret for session encryption
- `NEXTAUTH_URL` - App URL (http://localhost:3000 for dev)

## Next.js Server/Client Boundary Practices

Follow these four practices to prevent accidental exposure of server-side code or secrets to the client bundle:

### 1. Environment Variables Without `NEXT_PUBLIC_` Prefix
Store all secrets (API keys, connection strings, auth secrets) in env vars **without** the `NEXT_PUBLIC_` prefix. Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Unprefixed variables return `undefined` in client code.

### 2. Use `server-only` Guards
Add `import 'server-only'` to any file intended exclusively for server-side execution. This causes a build error if the file is imported into a Client Component, even if the file doesn't currently contain sensitive data. This future-proofs the file and signals intent to other developers.

```tsx
// lib/db.ts
import 'server-only';
import { PrismaClient } from '@prisma/client';
```

### 3. Use `client-only` Guards
Add `import 'client-only'` to files that depend on browser APIs (`window`, `localStorage`, etc.). This prevents accidental use in Server Components where they would fail at runtime.

```tsx
// lib/storage.ts
import 'client-only';
export const savePreference = (key: string, value: string) => localStorage.setItem(key, value);
```

### 4. Architectural Separation of Concerns
Organize server-side code into dedicated files to create natural boundaries:

- `lib/db.ts` - Database connections and queries
- `lib/services/*.ts` - External API integrations
- `lib/validations.ts` - Pure functions safe for both server and client

This separation ensures import errors surface immediately if a client component accidentally imports server-only modules.
