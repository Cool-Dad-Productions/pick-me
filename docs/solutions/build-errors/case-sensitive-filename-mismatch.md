# Case-Sensitive Filename Mismatch on Linux Builds

---
category: build-errors
tags:
  - next.js
  - vercel
  - linux
  - macos
  - case-sensitivity
  - imports
module: components
severity: blocking
date_solved: 2026-02-11
symptoms:
  - Build fails on Vercel/CI but works locally
  - "Module not found" errors for components that exist
  - Import paths appear correct but resolution fails
---

## Problem Symptom

Build succeeds on macOS (local development) but fails on Linux-based CI/CD (Vercel, GitHub Actions) with "Module not found" errors:

```
Module not found: Can't resolve '@/components/ui/button'
```

The file exists and the import path appears correct when inspected.

## Investigation Steps Tried

1. **Verified file exists** - The file was present at `components/ui/Button.tsx`
2. **Checked import path** - Import statement correctly used `@/components/ui/button`
3. **Cleared node_modules** - Reinstalled dependencies, no change
4. **Compared environments** - Realized macOS is case-insensitive, Linux is case-sensitive

## Root Cause Analysis

**macOS uses a case-insensitive filesystem by default (HFS+/APFS).** This means:
- `Button.tsx` and `button.tsx` resolve to the same file
- Imports of `@/components/ui/button` work even when the file is named `Button.tsx`

**Linux uses a case-sensitive filesystem (ext4).** This means:
- `Button.tsx` and `button.tsx` are distinct files
- Import of `@/components/ui/button` fails when file is named `Button.tsx`

Git tracks files case-sensitively, but on macOS it may not detect case-only renames without explicit commands.

## Working Solution

### Step 1: Identify Mismatched Files

Check import statements vs actual filenames:

```bash
# Find imports expecting lowercase
grep -r "from ['\"].*/(button|input|header)['\"]" --include="*.tsx" --include="*.ts"

# List actual filenames
ls components/ui/
```

### Step 2: Rename Files to Match Imports

Use `git mv` to ensure Git tracks the rename:

```bash
git mv components/ui/Button.tsx components/ui/button.tsx
git mv components/ui/Input.tsx components/ui/input.tsx
git mv components/Header.tsx components/header.tsx
```

### Step 3: Verify and Commit

```bash
git status  # Should show renames
git commit -m "Fix case-sensitive filename mismatches for Linux builds"
```

## Prevention Strategies

### 1. Establish Naming Convention

Adopt a consistent casing convention for the project. For Next.js with shadcn/ui:
- **Components**: `kebab-case` or `lowercase` (e.g., `button.tsx`, `alert-dialog.tsx`)
- **Pages**: `lowercase` with hyphens (required by Next.js App Router)

### 2. Configure ESLint

Add a rule to enforce import casing (requires `eslint-plugin-import`):

```json
{
  "rules": {
    "import/no-unresolved": "error"
  },
  "settings": {
    "import/resolver": {
      "typescript": true
    }
  }
}
```

### 3. CI Check

Run a case-sensitivity check in CI:

```bash
# Find potential mismatches (files with uppercase letters imported as lowercase)
find . -name "*.tsx" -o -name "*.ts" | xargs grep -l "^[A-Z]" | head
```

### 4. Use a Case-Sensitive Volume for Development

On macOS, create a case-sensitive APFS volume for development to catch these issues locally.

## Related Issues

- Similar issue may exist with `Card.tsx` (currently uppercase) - verify imports match

## Cross-References

- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment)
- shadcn/ui uses lowercase filenames by convention
- Commit: `b2367e8` - Fix case-sensitive filename mismatches for Linux builds

## Key Takeaway

**When files "work locally but fail in CI", always check filesystem case-sensitivity differences between macOS and Linux.**
