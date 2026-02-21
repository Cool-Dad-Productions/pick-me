---
title: "feat: Prisma Migrations with Neon Branching"
type: feat
date: 2026-02-02
supersedes: 2026-02-02-feat-prisma-versioned-migrations-cicd-plan.md
---

# Prisma Migrations with Neon Branching

## Overview

Switch from `prisma db push` with table prefixes to **versioned migrations with Neon database branching**. This eliminates the schema generation complexity and uses both Prisma and Neon as designed.

## Problem Statement

The current setup uses a single Neon database with table prefixes (`dev_`, `preview_`, no prefix for prod) to isolate environments. While clever, this creates problems:

1. Migrations store hardcoded SQL - can't work across different prefixes
2. Two schema files to maintain (`schema.prisma` and `schema.generated.prisma`)
3. Custom TypeScript script to generate prefixed schemas
4. Shared database means one environment's issues can affect others
5. No true isolation - a bad query could access wrong prefix

## Proposed Solution

**Use Neon database branching:**

```
main (production)
├── preview (branched from main)
└── dev (branched from main)
```

| Environment | Neon Branch | Sync Method |
|-------------|-------------|-------------|
| Production | `main` | `prisma migrate deploy` |
| Preview | `preview` | `prisma migrate deploy` |
| Development | `dev` | `prisma migrate deploy` |

**Benefits:**
- One schema file, one sync strategy, everywhere
- True data isolation with copy-on-write efficiency
- Standard Prisma workflow - no custom tooling
- Branches inherit production data (useful for testing)
- Reset branches easily without affecting production
- Single Neon project (stays within free tier)

## Technical Approach

### Phase 1: Set Up Neon Branching

**Tasks:**
- [ ] Create `preview` branch from `main` in Neon console
- [ ] Create `dev` branch from `main` in Neon console
- [ ] Get connection strings for each branch
- [ ] Configure Vercel environment variables:
  - Production: `DATABASE_URL` → main branch connection string
  - Preview: `DATABASE_URL` → preview branch connection string
- [ ] Configure local `.env` with dev branch connection string

**Neon Console Steps:**
1. Go to your Neon project → Branches
2. Click "Create Branch"
3. Name: `preview`, Parent: `main`
4. Repeat for `dev` branch
5. Copy connection strings from each branch's dashboard

### Phase 2: Remove Prefix System

**Tasks:**
- [x] Delete `scripts/generate-prisma-schema.ts`
- [x] Delete `prisma/schema.generated.prisma` (if exists) - was gitignored, not in repo
- [x] Remove `@@map` directives from `prisma/schema.prisma` (if any) - none existed
- [x] Update `.gitignore` to remove `schema.generated.prisma` entry

### Phase 3: Baseline Existing Production

**Tasks:**
- [x] Generate baseline migration from current schema
- [ ] Mark baseline as applied on main branch (requires Neon setup)
- [ ] Branches inherit the `_prisma_migrations` table automatically

**Commands:**
```bash
# Create migration directory structure
mkdir -p prisma/migrations/0_init

# Generate baseline SQL
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql

# Mark as applied in production (main branch)
# Use your production DATABASE_URL
npx prisma migrate resolve --applied 0_init

# Branches created AFTER this will inherit the _prisma_migrations table
# If branches already exist, mark baseline on each:
DATABASE_URL="$PREVIEW_URL" npx prisma migrate resolve --applied 0_init
DATABASE_URL="$DEV_URL" npx prisma migrate resolve --applied 0_init
```

**Note:** If you create branches *after* marking the baseline, they automatically inherit the `_prisma_migrations` table with the baseline already marked as applied.

### Phase 4: Simplify Package Scripts

**Tasks:**
- [x] Update `package.json` scripts
- [x] Remove schema generation from all scripts

**package.json:**
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "postinstall": "prisma generate",
    "vercel-build": "prisma migrate deploy && prisma generate && next build",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  }
}
```

**That's it.** Six database-related scripts reduced to four. No TypeScript build orchestrator. No schema generation.

### Phase 5: Update Documentation

**Tasks:**
- [x] Update CLAUDE.md - remove table prefix documentation
- [x] Add migration workflow to CLAUDE.md

**CLAUDE.md changes:**

Remove the "Environment Table Prefixes" section entirely. Replace with:

```markdown
## Database (Neon Branching)

Each environment uses a separate Neon branch:

| Environment | Neon Branch | Vercel Setting |
|-------------|-------------|----------------|
| Production | `main` | Production env var |
| Preview | `preview` | Preview env var |
| Development | `dev` | Local `.env` |

Branches are copy-on-write snapshots. Preview and dev inherit production data but changes are isolated.

## Database Migrations

### Creating a New Migration

1. Edit `prisma/schema.prisma`
2. Run `pnpm db:migrate:dev --name descriptive-name`
3. Review generated SQL in `prisma/migrations/<timestamp>_descriptive-name/`
4. Commit both `schema.prisma` and the migration folder
5. Push - migrations auto-apply on deploy

### Commands

| Command | Description |
|---------|-------------|
| `pnpm db:migrate:dev` | Create new migration (local) |
| `pnpm db:migrate:deploy` | Apply pending migrations |
| `pnpm db:seed` | Seed database |
| `pnpm db:studio` | Open Prisma Studio |
```

## Files Changed

| File | Action |
|------|--------|
| `scripts/generate-prisma-schema.ts` | **Delete** |
| `prisma/schema.generated.prisma` | **Delete** (if exists) |
| `prisma/schema.prisma` | Remove any `@@map` directives |
| `package.json` | Simplify scripts |
| `CLAUDE.md` | Update documentation |
| `.gitignore` | Remove `schema.generated.prisma` line |
| `prisma/migrations/0_init/migration.sql` | **Create** (baseline) |

## Acceptance Criteria

- [ ] Three separate Neon databases configured
- [ ] Vercel environments use correct `DATABASE_URL`
- [ ] `scripts/generate-prisma-schema.ts` deleted
- [ ] All environments use `prisma migrate deploy`
- [ ] Existing production data preserved
- [ ] Local development works with dev database

## Cost Impact

Neon free tier includes:
- 10 branches per project
- Branches are copy-on-write (storage efficient)

**This stays within the free tier.** Branching is a core Neon feature designed for exactly this use case.

## Rollback Strategy

If issues arise:
1. Revert Vercel deployment
2. Use Neon point-in-time recovery on the affected branch
3. Or reset a branch to its parent state (preview → main)
4. Production (main) can be restored independently

## Migration from Current State

### Data Migration

**Branches inherit production data automatically.** When you create a branch from `main`, it gets a copy-on-write snapshot of all production data. No manual data migration needed.

### Cleanup Checklist

After migration is complete:
- [ ] Drop `dev_*` prefixed tables from main branch
- [ ] Drop `preview_*` prefixed tables from main branch
- [ ] Verify only unprefixed tables remain on main branch

```sql
-- Run on main branch to clean up old prefixed tables
DROP TABLE IF EXISTS "dev_User" CASCADE;
DROP TABLE IF EXISTS "dev_Book" CASCADE;
DROP TABLE IF EXISTS "dev_UserRating" CASCADE;
DROP TABLE IF EXISTS "dev_ImportBatch" CASCADE;
DROP TABLE IF EXISTS "preview_User" CASCADE;
DROP TABLE IF EXISTS "preview_Book" CASCADE;
DROP TABLE IF EXISTS "preview_UserRating" CASCADE;
DROP TABLE IF EXISTS "preview_ImportBatch" CASCADE;
```

## References

- [Neon Database Branching](https://neon.tech/docs/introduction/branching)
- [Neon + Vercel Integration](https://neon.tech/docs/guides/vercel)
- [Prisma Migrate Deploy](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy)
- [Prisma + Neon Guide](https://www.prisma.io/docs/orm/overview/databases/neon)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
