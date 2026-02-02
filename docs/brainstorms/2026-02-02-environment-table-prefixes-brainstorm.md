# Environment-Specific Table Prefixes

**Date:** 2026-02-02
**Status:** Ready for planning

## What We're Building

A system to separate development, preview, and production data within a single PostgreSQL database using table name prefixes:

| Environment | Prefix | Example Table |
|-------------|--------|---------------|
| Production | (none) | `User` |
| Preview | `preview_` | `preview_User` |
| Development | `dev_` | `dev_User` |

This allows a hobby project to use one Neon database while maintaining data isolation between environments.

## Why This Approach

**Build-time schema generation** was chosen over alternatives because:

1. **Single source of truth** - One schema file to maintain
2. **Type safety** - Prisma generates correct types for each environment
3. **Standard tooling** - Works with Prisma Studio, migrations, and all Prisma features
4. **Automatic** - Integrates into existing `pnpm` scripts seamlessly

## Key Decisions

1. **Environment detection**: Use `VERCEL_ENV` (set automatically by Vercel). Defaults to `development` when not set (local dev).

2. **Preview scope**: All preview deployments share `preview_` tables. Simpler than per-branch isolation.

3. **Local development**: Always uses `dev_` prefix. No option to override - keeps production data safe.

4. **Implementation**: Script generates `@@map` directives in Prisma schema before `prisma generate` runs.

## Prefix Mapping

```
VERCEL_ENV=production  → no prefix (tables: User, Book, UserRating, ImportBatch)
VERCEL_ENV=preview     → preview_   (tables: preview_User, preview_Book, ...)
VERCEL_ENV=development → dev_       (tables: dev_User, dev_Book, ...)
(unset/local)          → dev_       (same as development)
```

## Open Questions

None - design is complete and ready for implementation planning.

## Next Steps

Run `/workflows:plan` to create the implementation plan.
