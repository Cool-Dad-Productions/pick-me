---
title: "feat: Environment-Specific Table Prefixes"
type: feat
date: 2026-02-02
brainstorm: docs/brainstorms/2026-02-02-environment-table-prefixes-brainstorm.md
---

# feat: Environment-Specific Table Prefixes

## Overview

Implement build-time schema generation to separate development, preview, and production data within a single Neon PostgreSQL database using table name prefixes.

| Environment | VERCEL_ENV | Prefix | Example Tables |
|-------------|------------|--------|----------------|
| Production | `production` | (none) | `User`, `Book` |
| Preview | `preview` | `preview_` | `preview_User`, `preview_Book` |
| Development | `development` or unset | `dev_` | `dev_User`, `dev_Book` |

## Problem Statement

All environments currently share the same database tables, creating risk of:
- Development changes affecting production data
- Preview deployments polluting production
- No isolation for testing features safely

## Proposed Solution

Create a TypeScript script that preprocesses `schema.prisma` to add `@@map` directives based on the `VERCEL_ENV` environment variable. The script generates `schema.generated.prisma` which Prisma uses for all operations.

### Architecture

```
schema.prisma (source of truth, no @@map)
       │
       ▼
scripts/generate-prisma-schema.ts
       │
       ├── VERCEL_ENV=production → no prefix
       ├── VERCEL_ENV=preview → preview_
       └── VERCEL_ENV=development/unset → dev_
       │
       ▼
prisma/schema.generated.prisma (@@map directives added)
       │
       ▼
prisma generate / prisma db push
```

## Technical Approach

### Phase 1: Schema Generation Script

**File: `scripts/generate-prisma-schema.ts`**

```typescript
// scripts/generate-prisma-schema.ts
import fs from 'fs';
import path from 'path';

const VERCEL_ENV = process.env.VERCEL_ENV || 'development';

const PREFIX_MAP: Record<string, string> = {
  production: '',
  preview: 'preview_',
  development: 'dev_',
};

const prefix = PREFIX_MAP[VERCEL_ENV] ?? 'dev_';

console.log(`[prisma-schema] VERCEL_ENV=${VERCEL_ENV}, using prefix: "${prefix || '(none)'}"`);

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const outputPath = path.join(__dirname, '../prisma/schema.generated.prisma');

let schema = fs.readFileSync(schemaPath, 'utf-8');

// Add @@map to each model
const modelRegex = /^model\s+(\w+)\s*\{/gm;
const models: string[] = [];

schema = schema.replace(modelRegex, (match, modelName) => {
  models.push(modelName);
  return match;
});

// For each model, add @@map before the closing brace
for (const modelName of models) {
  const tableName = prefix ? `${prefix}${modelName}` : modelName;
  const modelBlockRegex = new RegExp(`(model\\s+${modelName}\\s*\\{[\\s\\S]*?)(\\n\\})`, 'm');

  if (prefix) {
    schema = schema.replace(modelBlockRegex, `$1\n  @@map("${tableName}")$2`);
  }
}

fs.writeFileSync(outputPath, schema);
console.log(`[prisma-schema] Generated: prisma/schema.generated.prisma`);
console.log(`[prisma-schema] Tables: ${models.map(m => prefix + m).join(', ')}`);
```

**Tasks:**
- [x] Create `scripts/generate-prisma-schema.ts`
- [x] Add `tsx` as dev dependency (already present)
- [x] Test script locally with different `VERCEL_ENV` values

### Phase 2: Package.json Script Updates

**File: `package.json`**

```json
{
  "scripts": {
    "prisma:generate": "tsx scripts/generate-prisma-schema.ts && prisma generate --schema=prisma/schema.generated.prisma",
    "postinstall": "pnpm prisma:generate",
    "db:push": "tsx scripts/generate-prisma-schema.ts && prisma db push --schema=prisma/schema.generated.prisma",
    "db:seed": "tsx scripts/generate-prisma-schema.ts && tsx prisma/seed.ts",
    "db:studio": "tsx scripts/generate-prisma-schema.ts && prisma studio --schema=prisma/schema.generated.prisma"
  }
}
```

**Tasks:**
- [x] Add `prisma:generate` script
- [x] Update `postinstall` to use new script
- [x] Update `db:push` to preprocess schema first
- [x] Update `db:seed` to ensure correct schema (uses generated client)
- [x] Add `db:studio` script for viewing data

### Phase 3: Git and Editor Configuration

**File: `.gitignore`**

```gitignore
# Generated Prisma schema
prisma/schema.generated.prisma
```

**Tasks:**
- [x] Add generated schema to `.gitignore`
- [x] Remove any committed `schema.generated.prisma` if exists

### Phase 4: Seed Script Update

**File: `prisma/seed.ts`**

The seed script already uses `PrismaClient` directly. Since `prisma generate` will have run with the correct schema, no changes needed. However, ensure the `db:seed` script runs schema generation first (handled in Phase 2).

**Tasks:**
- [x] Verify seed script works with generated schema
- [x] Test seeding in dev environment

### Phase 5: Create Dev Tables

**Tasks:**
- [x] Run `pnpm db:push` locally to create `dev_*` tables
- [x] Verify tables exist in Neon dashboard
- [x] Run `pnpm db:seed` to seed dev tables

### Phase 6: Documentation

**File: `CLAUDE.md`**

Add to Common Commands section:
```markdown
pnpm db:studio    # Open Prisma Studio (auto-detects environment)
```

Add new section:
```markdown
## Environment Table Prefixes

Tables are prefixed based on VERCEL_ENV:
- Production: no prefix (User, Book, etc.)
- Preview: preview_ (preview_User, preview_Book, etc.)
- Development/Local: dev_ (dev_User, dev_Book, etc.)

The schema is auto-generated before Prisma commands. See `scripts/generate-prisma-schema.ts`.
```

**Tasks:**
- [x] Update `CLAUDE.md` with new commands and documentation

## Acceptance Criteria

- [ ] Local `pnpm dev` uses `dev_*` tables
- [ ] Vercel preview deployments use `preview_*` tables
- [ ] Vercel production deployment uses unprefixed tables
- [ ] `pnpm db:push` creates correctly prefixed tables
- [ ] `pnpm db:studio` shows correctly prefixed tables
- [ ] `pnpm db:seed` seeds the correct environment's tables
- [ ] Generated schema is not committed to git
- [ ] Build logs show which prefix is being used

## Key Decisions

1. **Generated schema location**: `prisma/schema.generated.prisma` - gitignored, generated on every build
2. **Source schema unchanged**: `schema.prisma` remains clean, no `@@map` directives
3. **Environment detection**: Uses `VERCEL_ENV` only, defaults to `development` when unset
4. **All Prisma commands wrapped**: Every script that touches Prisma runs schema generation first

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Production data in existing tables | Production uses no prefix, so existing `User` table continues to work |
| VERCEL_ENV not available at build time | Vercel injects env vars before install phase; verified in docs |
| Developer forgets to run schema generation | All scripts auto-run generation first |
| Cross-environment data access | Different prefixes = different tables, no accidental cross-access |

## Testing Plan

1. **Local verification**
   - Run `pnpm install` and check `schema.generated.prisma` has `dev_` prefixes
   - Run `pnpm db:push` and verify `dev_*` tables in Neon
   - Run `pnpm db:seed` and verify data in `dev_User`
   - Run `pnpm dev` and test app functionality

2. **Preview verification**
   - Push branch to GitHub
   - Vercel preview deploys
   - Check build logs for `preview_` prefix message
   - Test preview URL functionality

3. **Production verification** (after preview works)
   - Merge to main
   - Check build logs for no prefix message
   - Verify production functionality unchanged

## References

- Brainstorm: [2026-02-02-environment-table-prefixes-brainstorm.md](../brainstorms/2026-02-02-environment-table-prefixes-brainstorm.md)
- Prisma @@map docs: https://www.prisma.io/docs/orm/prisma-schema/data-model/models#mapping-model-names-to-tables-or-collections
- Current schema: [prisma/schema.prisma](../../prisma/schema.prisma)
- Database config: [lib/db.ts](../../lib/db.ts)
