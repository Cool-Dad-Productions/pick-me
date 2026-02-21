---
title: "feat: Prisma Versioned Migrations with CI/CD"
type: feat
date: 2026-02-02
---

# Prisma Versioned Migrations with CI/CD

## Overview

Switch from `prisma db push` to versioned migrations (`prisma migrate deploy`) for production deployments, with CI/CD automation via GitHub Actions and Vercel build integration.

**Key Decision:** Use a hybrid approach where:
- **Production:** Versioned migrations via `prisma migrate deploy`
- **Preview/Development:** Continue using `prisma db push` with environment-specific table prefixes

This preserves the existing multi-environment isolation (single Neon database with `dev_`/`preview_` prefixes) while gaining migration history and safety for production.

## Problem Statement

Currently, database schema changes are applied via `prisma db push`, which:
- Has no migration history or audit trail
- Requires `--accept-data-loss` flag for destructive changes
- Provides no rollback capability
- Makes it difficult to coordinate schema changes across team members

Production deployments need the safety and traceability of versioned migrations.

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HYBRID MIGRATION STRATEGY                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   schema.prisma (source of truth - NO @@map directives)             │
│         │                                                            │
│         ├──► prisma migrate dev ──► migrations/*.sql (production)   │
│         │                                                            │
│         └──► generate-prisma-schema.ts ──► schema.generated.prisma  │
│                     │                                                │
│                     ├──► dev_ prefix (VERCEL_ENV=development)       │
│                     └──► preview_ prefix (VERCEL_ENV=preview)       │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  ENVIRONMENT        │  SCHEMA FILE              │  SYNC METHOD      │
├─────────────────────┼───────────────────────────┼───────────────────┤
│  Production         │  schema.prisma            │  migrate deploy   │
│  Preview            │  schema.generated.prisma  │  db push          │
│  Development        │  schema.generated.prisma  │  db push          │
└─────────────────────┴───────────────────────────┴───────────────────┘
```

### Why This Approach

1. **Production safety:** Versioned migrations with history tracking
2. **Preserves isolation:** Dev/preview continue using prefixed tables in shared database
3. **No Neon cost increase:** Single database, multiple environments
4. **Minimal migration risk:** Only production changes how it syncs schema

## Technical Approach

### Phase 1: Baseline Production Database

Before enabling migrations, create a baseline that matches the existing production schema.

**Tasks:**

- [ ] Create initial migration from current schema without applying it
  - `prisma/migrations/0_init/migration.sql`
- [ ] Mark baseline as applied in production using `prisma migrate resolve`
- [ ] Verify `_prisma_migrations` table exists in production

**Files:**
- `prisma/migrations/0_init/migration.sql` (generated, then committed)

### Phase 2: Update Package Scripts

Add new scripts for the hybrid migration workflow.

**Tasks:**

- [ ] Add `db:migrate:deploy` script for production migrations
- [ ] Add `db:migrate:dev` script for creating new migrations locally
- [ ] Add `db:migrate:status` script to check migration state
- [ ] Update `vercel-build` script to run migrations in production only
- [ ] Keep existing `db:push` script for dev/preview

**package.json changes:**

```json
{
  "scripts": {
    "prisma:generate": "tsx scripts/generate-prisma-schema.ts && prisma generate --schema=prisma/schema.generated.prisma",
    "postinstall": "pnpm prisma:generate",
    "build": "next build",
    "vercel-build": "pnpm vercel-build:schema && next build",
    "vercel-build:schema": "tsx scripts/vercel-build-schema.ts",
    "db:push": "tsx scripts/generate-prisma-schema.ts && prisma db push --schema=prisma/schema.generated.prisma",
    "db:migrate:dev": "prisma migrate dev --schema=prisma/schema.prisma",
    "db:migrate:deploy": "prisma migrate deploy --schema=prisma/schema.prisma",
    "db:migrate:status": "prisma migrate status --schema=prisma/schema.prisma",
    "db:seed": "tsx scripts/generate-prisma-schema.ts && tsx prisma/seed.ts",
    "db:studio": "tsx scripts/generate-prisma-schema.ts && prisma studio --schema=prisma/schema.generated.prisma"
  }
}
```

### Phase 3: Create Vercel Build Script

Create a build script that detects environment and runs the appropriate schema sync.

**Tasks:**

- [ ] Create `scripts/vercel-build-schema.ts`
- [ ] Production: Run `prisma migrate deploy` against `schema.prisma`
- [ ] Preview/Development: Run `prisma db push` against `schema.generated.prisma`
- [ ] Always run `prisma generate` for client generation

**scripts/vercel-build-schema.ts:**

```typescript
import { execSync } from 'child_process';

const env = process.env.VERCEL_ENV || 'development';

console.log(`[vercel-build-schema] Environment: ${env}`);

if (env === 'production') {
  // Production: use versioned migrations
  console.log('[vercel-build-schema] Running prisma migrate deploy...');
  execSync('npx prisma migrate deploy --schema=prisma/schema.prisma', {
    stdio: 'inherit'
  });
  execSync('npx prisma generate --schema=prisma/schema.prisma', {
    stdio: 'inherit'
  });
} else {
  // Preview/Development: use db push with generated schema
  console.log('[vercel-build-schema] Generating prefixed schema...');
  execSync('npx tsx scripts/generate-prisma-schema.ts', { stdio: 'inherit' });

  console.log('[vercel-build-schema] Running prisma db push...');
  execSync('npx prisma db push --schema=prisma/schema.generated.prisma --accept-data-loss', {
    stdio: 'inherit'
  });
  execSync('npx prisma generate --schema=prisma/schema.generated.prisma', {
    stdio: 'inherit'
  });
}

console.log('[vercel-build-schema] Done!');
```

### Phase 4: GitHub Actions Workflow

Add CI workflow to validate migrations on PRs.

**Tasks:**

- [ ] Create `.github/workflows/validate-migrations.yml`
- [ ] Run `prisma validate` to check schema syntax
- [ ] Run `prisma migrate diff --exit-code` to detect drift
- [ ] Trigger on changes to `prisma/` directory

**.github/workflows/validate-migrations.yml:**

```yaml
name: Validate Prisma Migrations

on:
  pull_request:
    paths:
      - 'prisma/**'
      - 'package.json'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Validate Prisma schema
        run: npx prisma validate --schema=prisma/schema.prisma

      - name: Check for schema drift
        run: npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code
        continue-on-error: false
```

### Phase 5: Update Documentation

**Tasks:**

- [ ] Update CLAUDE.md with migration workflow
- [ ] Document the hybrid approach (migrations for prod, db push for dev/preview)
- [ ] Add migration creation guide for developers

**CLAUDE.md additions:**

```markdown
## Database Migrations

### Hybrid Approach

- **Production:** Uses versioned migrations (`prisma migrate deploy`)
- **Preview/Development:** Uses `prisma db push` with table prefixes

### Creating a New Migration

1. Edit `prisma/schema.prisma` (the source of truth, no `@@map` directives)
2. Run `pnpm db:migrate:dev --name descriptive-name`
3. Review generated SQL in `prisma/migrations/<timestamp>_descriptive-name/`
4. Commit both `schema.prisma` and the new migration folder
5. Push to trigger CI validation

### Common Commands

| Command | Environment | Description |
|---------|-------------|-------------|
| `pnpm db:migrate:dev` | Local | Create new migration |
| `pnpm db:migrate:deploy` | CI/Prod | Apply pending migrations |
| `pnpm db:migrate:status` | Any | Check migration status |
| `pnpm db:push` | Dev/Preview | Sync schema without migrations |
```

## Acceptance Criteria

### Functional Requirements

- [ ] Production deployments apply versioned migrations automatically
- [ ] Preview deployments continue using `db push` with `preview_` prefix
- [ ] Local development continues using `db push` with `dev_` prefix
- [ ] New migrations can be created locally with `pnpm db:migrate:dev`
- [ ] GitHub Actions validates schema and migration consistency on PRs

### Non-Functional Requirements

- [ ] Build time increase < 10 seconds for migration step
- [ ] Migration failures block deployment (no partial deploys)
- [ ] CI validation completes in < 2 minutes

### Quality Gates

- [ ] Existing production data preserved during baseline
- [ ] All existing functionality works after migration switch
- [ ] CLAUDE.md updated with migration workflow

## Dependencies & Prerequisites

- Neon PostgreSQL database with existing tables (created via `db push`)
- Vercel deployment configured with `DATABASE_URL` per environment
- GitHub repository with Actions enabled

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Baseline migration misses existing schema | Low | High | Generate with `prisma migrate diff`, verify SQL manually |
| Production deploy fails on first migration | Medium | High | Test baseline on preview first, use Neon PITR as backup |
| Developer creates migration with wrong schema | Medium | Low | CI validates migrations against `schema.prisma` |
| Preview and production schema drift | Low | Medium | CI detects drift; hybrid approach limits blast radius |

## Rollback Strategy

If migrations cause issues in production:

1. **Immediate:** Revert to previous Vercel deployment (uses previous code + schema state)
2. **Database:** Use Neon's point-in-time recovery to restore to pre-migration state
3. **Forward fix:** Create a new migration that reverses the problematic changes

## Migration Workflow Diagram

```
Developer Flow:
──────────────
1. Edit schema.prisma
2. pnpm db:migrate:dev --name add-feature
3. Review migrations/<timestamp>_add-feature/migration.sql
4. git add prisma/ && git commit
5. git push origin feature-branch

CI Flow (on PR):
────────────────
1. Checkout code
2. pnpm install (runs postinstall → prisma:generate)
3. prisma validate --schema=prisma/schema.prisma
4. prisma migrate diff --exit-code (detect drift)
5. ✅ Pass or ❌ Fail PR

Vercel Production Build:
────────────────────────
1. pnpm install (postinstall → prisma:generate)
2. vercel-build script detects VERCEL_ENV=production
3. prisma migrate deploy --schema=prisma/schema.prisma
4. prisma generate --schema=prisma/schema.prisma
5. next build

Vercel Preview Build:
─────────────────────
1. pnpm install (postinstall → prisma:generate)
2. vercel-build script detects VERCEL_ENV=preview
3. generate-prisma-schema.ts → schema.generated.prisma (preview_ prefix)
4. prisma db push --schema=prisma/schema.generated.prisma
5. prisma generate --schema=prisma/schema.generated.prisma
6. next build
```

## References

### Internal References
- [scripts/generate-prisma-schema.ts](scripts/generate-prisma-schema.ts) - Environment prefix generator
- [prisma/schema.prisma](prisma/schema.prisma) - Source schema
- [CLAUDE.md](CLAUDE.md) - Project conventions

### External References
- [Prisma Migrate Deploy](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy)
- [Prisma CI/CD Best Practices](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
- [Vercel + Prisma Guide](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel)
- [Neon Point-in-Time Recovery](https://neon.tech/docs/introduction/point-in-time-restore)
