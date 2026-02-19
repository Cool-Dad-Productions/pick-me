import 'server-only';

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1';

export interface GoogleBooksMetadata {
  genres: string[];
  pageCount: number | null;
  publishedDate: string | null;
  description: string | null;
}

/**
 * Full book data from Google Books for primary lookups.
 * Used when Google Books is the primary data source.
 */
export interface GoogleBooksBook {
  googleBooksVolumeId: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  coverUrl: string | null;
  genres: string[];
  pageCount: number | null;
  publishedDate: string | null;
  description: string | null;
  publicationYear: number | null;
}

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    categories?: string[];
    pageCount?: number;
    publishedDate?: string;
    description?: string;
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
      small?: string;
      medium?: string;
      large?: string;
    };
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
  };
}

interface GoogleBooksSearchResponse {
  totalItems: number;
  items?: GoogleBooksVolume[];
}

// Rate limiting - simple in-memory counter
let dailyRequestCount = 0;
let lastResetDate = new Date().toISOString().split('T')[0];

function checkAndIncrementQuota(): boolean {
  const today = new Date().toISOString().split('T')[0];
  if (today !== lastResetDate) {
    dailyRequestCount = 0;
    lastResetDate = today;
  }

  const limit = process.env.GOOGLE_BOOKS_API_KEY ? 1000 : 100;
  if (dailyRequestCount >= limit) {
    console.warn(`[GoogleBooks] Daily quota exhausted (${limit} requests)`);
    return false;
  }

  dailyRequestCount++;
  return true;
}

export function getQuotaStatus(): { used: number; limit: number; remaining: number } {
  const limit = process.env.GOOGLE_BOOKS_API_KEY ? 1000 : 100;
  return {
    used: dailyRequestCount,
    limit,
    remaining: Math.max(0, limit - dailyRequestCount),
  };
}

function normalizeCategories(categories: string[] | undefined): string[] {
  if (!categories || categories.length === 0) return [];

  const normalized = new Set<string>();
  for (const category of categories) {
    // Normalize the full hierarchical path (e.g., "Humor / Form / Essays")
    const fullPath = category
      .split(' / ')
      .map((p) => p.toLowerCase().trim())
      .filter((p) => p.length > 1)
      .join(' / ');
    if (fullPath) {
      normalized.add(fullPath);
    }

    // Also extract individual terms for broad matching
    const parts = category.split(' / ').map((p) => p.toLowerCase().trim());
    parts.forEach((p) => {
      if (p && p.length > 1) normalized.add(p);
    });
  }

  return Array.from(normalized).slice(0, 30);
}

function findVolumeByIsbn(
  items: GoogleBooksVolume[],
  isbn: string
): GoogleBooksVolume | null {
  // Try exact ISBN match first
  const normalizedIsbn = isbn.replace(/-/g, '');
  for (const item of items) {
    const identifiers = item.volumeInfo.industryIdentifiers || [];
    for (const id of identifiers) {
      if (id.identifier.replace(/-/g, '') === normalizedIsbn) {
        return item;
      }
    }
  }
  // Fallback to first result
  return items[0] || null;
}

export async function lookupByIsbn(
  isbn: string
): Promise<GoogleBooksMetadata | null> {
  if (!checkAndIncrementQuota()) {
    return null;
  }

  const normalizedIsbn = isbn.replace(/-/g, '');
  const params = new URLSearchParams({ q: `isbn:${normalizedIsbn}` });

  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }

  const url = `${GOOGLE_BOOKS_API}/volumes?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[GoogleBooks] Rate limited by API');
        return null;
      }
      console.error(`[GoogleBooks] API error: ${response.status}`);
      return null;
    }

    const data: GoogleBooksSearchResponse = await response.json();

    console.log('[GoogleBooks] ISBN lookup:', {
      isbn: normalizedIsbn,
      totalItems: data.totalItems,
    });

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const volume = findVolumeByIsbn(data.items, normalizedIsbn);
    if (!volume) return null;

    const { volumeInfo } = volume;

    return {
      genres: normalizeCategories(volumeInfo.categories),
      pageCount: volumeInfo.pageCount ?? null,
      publishedDate: volumeInfo.publishedDate ?? null,
      description: volumeInfo.description ?? null,
    };
  } catch (error) {
    console.error('[GoogleBooks] Lookup failed:', error);
    return null;
  }
}

/**
 * Extract publication year from publishedDate string.
 * Google Books returns dates in formats like "2023", "2023-05", or "2023-05-15".
 */
function extractPublicationYear(publishedDate: string | undefined): number | null {
  if (!publishedDate) return null;
  const match = publishedDate.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract ISBN-13 from industry identifiers, converting ISBN-10 if needed.
 */
function extractIsbn13(
  identifiers: Array<{ type: string; identifier: string }> | undefined
): string | null {
  if (!identifiers) return null;

  // Prefer ISBN-13
  const isbn13 = identifiers.find((id) => id.type === 'ISBN_13');
  if (isbn13) return isbn13.identifier;

  // Convert ISBN-10 to ISBN-13 if available
  const isbn10 = identifiers.find((id) => id.type === 'ISBN_10');
  if (isbn10) {
    return convertIsbn10To13(isbn10.identifier);
  }

  return null;
}

/**
 * Convert ISBN-10 to ISBN-13.
 */
function convertIsbn10To13(isbn10: string): string {
  const digits = isbn10.replace(/-/g, '').slice(0, 9);
  const prefix = '978' + digits;

  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(prefix[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return prefix + checkDigit;
}

/**
 * Full book lookup from Google Books API.
 * Returns complete book data suitable for creating a new Book record.
 * Used as the primary data source for ISBN lookups.
 */
export async function lookupBookByIsbn(
  isbn: string
): Promise<GoogleBooksBook | null> {
  if (!checkAndIncrementQuota()) {
    return null;
  }

  const normalizedIsbn = isbn.replace(/-/g, '');
  const params = new URLSearchParams({ q: `isbn:${normalizedIsbn}` });

  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }

  const url = `${GOOGLE_BOOKS_API}/volumes?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[GoogleBooks] Rate limited by API');
        return null;
      }
      console.error(`[GoogleBooks] API error: ${response.status}`);
      return null;
    }

    const data: GoogleBooksSearchResponse = await response.json();

    console.log('[GoogleBooks] Full book lookup:', {
      isbn: normalizedIsbn,
      totalItems: data.totalItems,
    });

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const volume = findVolumeByIsbn(data.items, normalizedIsbn);
    if (!volume) return null;

    const { volumeInfo } = volume;

    // Get cover URL - prefer larger sizes, upgrade HTTP to HTTPS
    let coverUrl: string | null = null;
    if (volumeInfo.imageLinks) {
      const imageUrl =
        volumeInfo.imageLinks.medium ||
        volumeInfo.imageLinks.small ||
        volumeInfo.imageLinks.thumbnail ||
        volumeInfo.imageLinks.smallThumbnail;
      if (imageUrl) {
        coverUrl = imageUrl.replace('http://', 'https://');
      }
    }

    return {
      googleBooksVolumeId: volume.id,
      isbn13: extractIsbn13(volumeInfo.industryIdentifiers),
      title: volumeInfo.title || 'Unknown Title',
      authors: volumeInfo.authors || [],
      coverUrl,
      genres: normalizeCategories(volumeInfo.categories),
      pageCount: volumeInfo.pageCount ?? null,
      publishedDate: volumeInfo.publishedDate ?? null,
      description: volumeInfo.description ?? null,
      publicationYear: extractPublicationYear(volumeInfo.publishedDate),
    };
  } catch (error) {
    console.error('[GoogleBooks] Full book lookup failed:', error);
    return null;
  }
}

/**
 * Check if Google Books quota is available.
 * Returns true if quota is available, false if exhausted.
 */
export function isQuotaAvailable(): boolean {
  const today = new Date().toISOString().split('T')[0];
  if (today !== lastResetDate) {
    return true; // New day, quota resets
  }

  const limit = process.env.GOOGLE_BOOKS_API_KEY ? 1000 : 100;
  return dailyRequestCount < limit;
}

export async function lookupByTitle(
  title: string,
  author?: string
): Promise<GoogleBooksMetadata | null> {
  if (!checkAndIncrementQuota()) {
    return null;
  }

  let query = `intitle:${title}`;
  if (author) {
    query += `+inauthor:${author}`;
  }

  const params = new URLSearchParams({ q: query, maxResults: '5' });

  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }

  const url = `${GOOGLE_BOOKS_API}/volumes?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[GoogleBooks] API error: ${response.status}`);
      return null;
    }

    const data: GoogleBooksSearchResponse = await response.json();

    console.log('[GoogleBooks] Title lookup:', {
      title,
      author,
      totalItems: data.totalItems,
    });

    if (!data.items || data.items.length === 0) {
      return null;
    }

    // Take first result for title search
    const { volumeInfo } = data.items[0];

    return {
      genres: normalizeCategories(volumeInfo.categories),
      pageCount: volumeInfo.pageCount ?? null,
      publishedDate: volumeInfo.publishedDate ?? null,
      description: volumeInfo.description ?? null,
    };
  } catch (error) {
    console.error('[GoogleBooks] Title lookup failed:', error);
    return null;
  }
}
