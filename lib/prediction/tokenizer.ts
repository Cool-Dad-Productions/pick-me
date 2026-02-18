import 'server-only';

// Common English stop words plus domain-specific terms
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'now',
  // Domain-specific stop words for book metadata
  'book', 'novel', 'story', 'fiction', 'nonfiction', 'edition', 'series',
]);

/**
 * Normalize accented characters to ASCII
 * "Café" → "Cafe", "naïve" → "naive"
 */
function normalizeToAscii(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check if a token is a series indicator like "book 1", "volume 2"
 */
function isSeriesIndicator(token: string): boolean {
  return /^(book|vol|volume|part|chapter)\d*$/i.test(token);
}

/**
 * Tokenize text into normalized terms
 * - Normalize accented characters to ASCII
 * - Lowercase
 * - Remove punctuation
 * - Split on whitespace
 * - Remove stop words
 * - Filter short tokens (<2 chars)
 * - Filter series indicators
 */
export function tokenize(text: string): string[] {
  return normalizeToAscii(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .split(/\s+/)              // Split on whitespace
    .filter(token =>
      token.length >= 2 &&           // Min length
      !STOP_WORDS.has(token) &&      // Not a stop word
      !/^\d+$/.test(token) &&        // Not purely numeric
      !isSeriesIndicator(token)      // Not a series indicator
    );
}

/**
 * Bucket page count into length categories
 * <200 = short, 200-399 = medium, >=400 = long
 */
export function bucketPageCount(pages: number | null): string {
  if (!pages || pages <= 0) return '';
  if (pages < 200) return 'short_book';
  if (pages < 400) return 'medium_book';
  return 'long_book';
}

/**
 * Bucket publication year into era categories
 * <1950 = classic, 1950-1999 = modern, >=2000 = contemporary
 */
export function bucketYear(year: number | null): string {
  if (!year || year <= 0) return '';
  if (year < 1950) return 'classic_era';
  if (year < 2000) return 'modern_era';
  return 'contemporary_era';
}

/**
 * Create document text from book data
 * Combines title, authors, subjects, genres, and bucket tokens
 * Title and genres weighted 2x by repetition
 */
export function bookToText(book: {
  title: string;
  authors: string[];
  subjects: string[];
  genres: string[];
  pageCount: number | null;
  publicationYear: number | null;
}): string {
  const titleText = book.title;
  const authorText = book.authors.join(' ');
  const subjectText = book.subjects.join(' ');
  const genreText = book.genres.join(' ');
  const lengthBucket = bucketPageCount(book.pageCount);
  const eraBucket = bucketYear(book.publicationYear);

  // Weight: title 2x, genres 2x, subjects 1x, authors 1x, buckets 1x
  return `${titleText} ${titleText} ${authorText} ${subjectText} ${genreText} ${genreText} ${lengthBucket} ${eraBucket}`;
}
