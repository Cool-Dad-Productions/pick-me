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
