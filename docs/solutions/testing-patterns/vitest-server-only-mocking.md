---
title: Testing server-only modules with Vitest
category: testing-patterns
tags: [vitest, server-only, mocking, next.js, testing]
module: prediction
symptoms:
  - "Error: This module cannot be imported from a Client Component module"
  - "server-only module throws during test"
  - "Vitest fails on import 'server-only'"
date: 2026-02-11
---

# Testing server-only modules with Vitest

## Problem

When testing modules that use `import 'server-only'` (per Next.js best practices), Vitest throws an error because the `server-only` package is designed to fail at runtime in non-server contexts.

```
Error: This module cannot be imported from a Client Component module.
It should only be used from a Server Component.
```

## Root Cause

The `server-only` package is a runtime guard that throws an error when imported outside of a React Server Component context. Vitest runs in Node.js but doesn't have the Next.js server component runtime, so the guard triggers.

## Solution

Mock the `server-only` module before importing the module under test:

```typescript
// lib/prediction/__tests__/tokenizer.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock server-only BEFORE importing the module under test
vi.mock('server-only', () => ({}));

// Now import the module that uses 'server-only'
import { tokenize, bookToText } from '../tokenizer';

describe('tokenize', () => {
  it('lowercases and splits text', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });
});
```

### Key Points

1. **Import order matters**: The `vi.mock()` call must come before importing the module under test
2. **Empty object mock**: Return an empty object `() => ({})` since `server-only` exports nothing
3. **Single import for vi**: Combine `vi` with other vitest imports to avoid duplicate import warnings

## Vitest Configuration

Ensure your `vitest.config.ts` has the path alias configured to match your `tsconfig.json`:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

## Prevention

When creating new server-only modules:

1. Always add the `server-only` import as the first line
2. Create corresponding test files with the mock pattern above
3. Consider creating a shared test setup file if you have many server-only modules

## Related

- [Next.js server-only documentation](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment)
- CLAUDE.md section on "Next.js Server/Client Boundary Practices"
