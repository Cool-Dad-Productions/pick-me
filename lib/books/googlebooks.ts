import 'server-only';

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1';

export interface GoogleBooksMetadata {
  genres: string[];
  pageCount: number | null;
  publishedDate: string | null;
  description: string | null;
}

interface GoogleBooksVolume {
  volumeInfo: {
    title?: string;
    authors?: string[];
    categories?: string[];
    pageCount?: number;
    publishedDate?: string;
    description?: string;
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
    // Split hierarchical categories like "Fiction / Literary"
    const parts = category.split(' / ').map((p) => p.toLowerCase().trim());
    parts.forEach((p) => {
      if (p && p.length > 1) normalized.add(p);
    });
  }

  return Array.from(normalized).slice(0, 20);
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
