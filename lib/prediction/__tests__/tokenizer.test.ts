import { describe, it, expect, vi } from 'vitest';

// Mock server-only to avoid runtime errors in tests
vi.mock('server-only', () => ({}));

import { tokenize, bookToText, bucketPageCount, bucketYear } from '../tokenizer';

describe('tokenize', () => {
  it('lowercases and splits text', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('removes punctuation', () => {
    expect(tokenize("It's a test!")).toEqual(['test']);
  });

  it('removes stop words', () => {
    expect(tokenize('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('filters short tokens (< 2 chars)', () => {
    // Tokens with length >= 2 are kept
    expect(tokenize('a ab abc')).toEqual(['ab', 'abc']);
  });

  it('filters purely numeric tokens', () => {
    expect(tokenize('2024 edition 3rd')).toEqual(['3rd']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('removes domain-specific stop words', () => {
    expect(tokenize('A great book novel story')).toEqual(['great']);
  });

  it('filters series indicators', () => {
    expect(tokenize('Fantasy Book1 Volume2')).toEqual(['fantasy']);
  });

  it('normalizes accented characters to ASCII', () => {
    expect(tokenize('Café naïve résumé')).toEqual(['cafe', 'naive', 'resume']);
  });

  it('handles mixed content', () => {
    const text = 'The Lord of the Rings: Book 1 - Fantasy Adventure';
    const tokens = tokenize(text);
    expect(tokens).toContain('lord');
    expect(tokens).toContain('rings');
    expect(tokens).toContain('fantasy');
    expect(tokens).toContain('adventure');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('of');
    expect(tokens).not.toContain('book');
  });
});

describe('bucketPageCount', () => {
  it('returns empty string for null', () => {
    expect(bucketPageCount(null)).toBe('');
  });

  it('returns empty string for 0 or negative', () => {
    expect(bucketPageCount(0)).toBe('');
    expect(bucketPageCount(-100)).toBe('');
  });

  it('returns short_book for <200 pages', () => {
    expect(bucketPageCount(1)).toBe('short_book');
    expect(bucketPageCount(100)).toBe('short_book');
    expect(bucketPageCount(199)).toBe('short_book');
  });

  it('returns medium_book for 200-399 pages', () => {
    expect(bucketPageCount(200)).toBe('medium_book');
    expect(bucketPageCount(300)).toBe('medium_book');
    expect(bucketPageCount(399)).toBe('medium_book');
  });

  it('returns long_book for >=400 pages', () => {
    expect(bucketPageCount(400)).toBe('long_book');
    expect(bucketPageCount(500)).toBe('long_book');
    expect(bucketPageCount(1000)).toBe('long_book');
  });
});

describe('bucketYear', () => {
  it('returns empty string for null', () => {
    expect(bucketYear(null)).toBe('');
  });

  it('returns empty string for 0 or negative', () => {
    expect(bucketYear(0)).toBe('');
    expect(bucketYear(-100)).toBe('');
  });

  it('returns classic_era for <1950', () => {
    expect(bucketYear(1800)).toBe('classic_era');
    expect(bucketYear(1900)).toBe('classic_era');
    expect(bucketYear(1949)).toBe('classic_era');
  });

  it('returns modern_era for 1950-1999', () => {
    expect(bucketYear(1950)).toBe('modern_era');
    expect(bucketYear(1975)).toBe('modern_era');
    expect(bucketYear(1999)).toBe('modern_era');
  });

  it('returns contemporary_era for >=2000', () => {
    expect(bucketYear(2000)).toBe('contemporary_era');
    expect(bucketYear(2020)).toBe('contemporary_era');
    expect(bucketYear(2026)).toBe('contemporary_era');
  });
});

describe('bookToText', () => {
  it('combines book fields with title and genres weighted 2x', () => {
    const book = {
      title: 'The Name of the Wind',
      authors: ['Patrick Rothfuss'],
      subjects: ['fantasy', 'magic'],
      genres: ['Fantasy', 'Epic'],
      pageCount: 300,
      publicationYear: 2007,
    };

    const text = bookToText(book);
    expect(text).toContain('The Name of the Wind');
    expect(text).toContain('Patrick Rothfuss');
    expect(text).toContain('fantasy');
    expect(text).toContain('magic');
    expect(text).toContain('Fantasy');
    expect(text).toContain('Epic');
    expect(text).toContain('medium_book');
    expect(text).toContain('contemporary_era');

    // Title should appear twice (weighted 2x)
    const titleCount = (text.match(/The Name of the Wind/g) || []).length;
    expect(titleCount).toBe(2);

    // Genres should appear twice (weighted 2x)
    const fantasyGenreCount = (text.match(/Fantasy/g) || []).length;
    expect(fantasyGenreCount).toBe(2);
  });

  it('handles empty arrays and null values', () => {
    const book = {
      title: 'Test',
      authors: [],
      subjects: [],
      genres: [],
      pageCount: null,
      publicationYear: null,
    };
    const text = bookToText(book);
    // Format: title title authors subjects genres genres lengthBucket eraBucket
    // With empty values: 'Test Test      ' (6 spaces for empty parts)
    expect(text).toBe('Test Test      ');
  });

  it('handles multiple authors', () => {
    const book = {
      title: 'Book',
      authors: ['Author One', 'Author Two'],
      subjects: [],
      genres: [],
      pageCount: null,
      publicationYear: null,
    };
    const text = bookToText(book);
    expect(text).toContain('Author One Author Two');
  });

  it('handles multiple subjects', () => {
    const book = {
      title: 'Book',
      authors: [],
      subjects: ['fantasy', 'magic', 'adventure'],
      genres: [],
      pageCount: null,
      publicationYear: null,
    };
    const text = bookToText(book);
    expect(text).toContain('fantasy magic adventure');
  });

  it('includes bucket tokens for page count and year', () => {
    const book = {
      title: 'Classic Novel',
      authors: ['Old Author'],
      subjects: [],
      genres: [],
      pageCount: 150,
      publicationYear: 1925,
    };
    const text = bookToText(book);
    expect(text).toContain('short_book');
    expect(text).toContain('classic_era');
  });

  it('handles missing page count gracefully', () => {
    const book = {
      title: 'Book',
      authors: [],
      subjects: [],
      genres: ['Fiction'],
      pageCount: null,
      publicationYear: 2020,
    };
    const text = bookToText(book);
    expect(text).not.toContain('short_book');
    expect(text).not.toContain('medium_book');
    expect(text).not.toContain('long_book');
    expect(text).toContain('contemporary_era');
  });

  it('handles missing publication year gracefully', () => {
    const book = {
      title: 'Book',
      authors: [],
      subjects: [],
      genres: ['Fiction'],
      pageCount: 500,
      publicationYear: null,
    };
    const text = bookToText(book);
    expect(text).toContain('long_book');
    expect(text).not.toContain('classic_era');
    expect(text).not.toContain('modern_era');
    expect(text).not.toContain('contemporary_era');
  });
});
