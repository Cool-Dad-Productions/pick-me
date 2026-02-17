import 'server-only';
import { createHash } from 'crypto';

/**
 * Generate a synthetic work ID for books without OpenLibrary work data.
 * Format: synthetic:{12-char-hash}
 *
 * The ID is deterministic based on normalized title and authors.
 */
export function generateSyntheticWorkId(
  title: string,
  authors: string[]
): string {
  // Normalize: lowercase, trim, collapse whitespace
  const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedAuthors = authors
    .map((a) => a.toLowerCase().trim().replace(/\s+/g, ' '))
    .sort()
    .join('|');

  const input = `${normalizedTitle}|${normalizedAuthors}`;
  const hash = createHash('md5').update(input).digest('hex').slice(0, 12);
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
