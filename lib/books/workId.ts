import 'server-only';
import { createHash } from 'crypto';

/**
 * Generate a synthetic work ID for books without OpenLibrary work data.
 * Format: synthetic:{12-char-hash}
 *
 * The ID is deterministic based on normalized title and authors.
 * NOTE: This must match the logic in scripts/migrate-ratings-to-work.ts
 */
export function generateSyntheticWorkId(
  title: string,
  authors: string[]
): string {
  // Must match migration script: (title + authors.join(',')).toLowerCase()
  const normalized = (title + authors.join(',')).toLowerCase();
  const hash = createHash('md5').update(normalized).digest('hex').slice(0, 12);
  return `synthetic:${hash}`;
}

/**
 * Get the work ID for a book, generating synthetic ID if needed.
 */
export function getWorkIdForBook(book: {
  openLibraryWorkId: string | null;
  title: string;
  authors: string[];
}): string {
  return (
    book.openLibraryWorkId || generateSyntheticWorkId(book.title, book.authors)
  );
}
