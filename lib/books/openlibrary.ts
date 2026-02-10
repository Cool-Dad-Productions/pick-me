import type { BookCandidate, NormalizedBook } from '@/types';
import { normalizeIsbn } from '@/lib/validations';

const OPEN_LIBRARY_API = 'https://openlibrary.org';
const COVERS_API = 'https://covers.openlibrary.org';

interface OpenLibrarySearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  first_publish_year?: number;
}

interface OpenLibrarySearchResponse {
  numFound: number;
  docs: OpenLibrarySearchDoc[];
}

interface OpenLibraryBookData {
  title?: string;
  authors?: { key: string }[];
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
}

export async function searchBooks(params: {
  q?: string;
  title?: string;
  author?: string;
}): Promise<BookCandidate[]> {
  const searchParams = new URLSearchParams();

  if (params.q) {
    searchParams.set('q', params.q);
  } else {
    if (params.title) searchParams.set('title', params.title);
    if (params.author) searchParams.set('author', params.author);
  }

  searchParams.set('limit', '20');
  searchParams.set('fields', 'key,title,author_name,isbn,cover_i');

  const url = `${OPEN_LIBRARY_API}/search.json?${searchParams.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open Library search failed: ${response.status}`);
  }

  const data: OpenLibrarySearchResponse = await response.json();

  return data.docs.map((doc) => {
    const isbn13 = doc.isbn?.find((i) => i.length === 13);
    const isbn10 = doc.isbn?.find((i) => i.length === 10);
    const normalizedIsbn = isbn13 || (isbn10 ? normalizeIsbn(isbn10) : undefined);

    // Ensure title is always a string (Open Library may return unexpected types)
    const title = typeof doc.title === 'string' ? doc.title : String(doc.title || 'Unknown Title');

    // Ensure authors is always a string array
    const authors = Array.isArray(doc.author_name)
      ? doc.author_name.filter((a): a is string => typeof a === 'string')
      : [];

    return {
      externalId: doc.key,
      title,
      authors,
      isbn13: normalizedIsbn || undefined,
      coverUrl: doc.cover_i
        ? `${COVERS_API}/b/id/${doc.cover_i}-M.jpg`
        : undefined,
    };
  });
}

export async function lookupByIsbn(isbn: string): Promise<NormalizedBook | null> {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!normalizedIsbn) {
    return null;
  }

  const url = `${OPEN_LIBRARY_API}/isbn/${normalizedIsbn}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Open Library ISBN lookup failed: ${response.status}`);
  }

  const data: OpenLibraryBookData = await response.json();

  // Fetch author names if we have author keys
  let authorNames: string[] = [];
  if (data.authors && data.authors.length > 0) {
    authorNames = await fetchAuthorNames(data.authors.map((a) => a.key));
  }

  const isbn13 = data.isbn_13?.[0] || normalizedIsbn;
  const coverId = data.covers?.[0];

  // Ensure title is always a string
  const title = typeof data.title === 'string' ? data.title : 'Unknown Title';

  return {
    isbn13,
    title,
    authors: authorNames,
    coverUrl: coverId ? `${COVERS_API}/b/id/${coverId}-M.jpg` : undefined,
    metadata: data,
  };
}

async function fetchAuthorNames(authorKeys: string[]): Promise<string[]> {
  const names: string[] = [];

  for (const key of authorKeys.slice(0, 5)) {
    try {
      const response = await fetch(`${OPEN_LIBRARY_API}${key}.json`);
      if (response.ok) {
        const data = await response.json();
        // Ensure name is a string before adding to array
        if (typeof data.name === 'string') {
          names.push(data.name);
        }
      }
    } catch {
      // Skip author if fetch fails
    }
  }

  return names;
}
