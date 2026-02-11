import { describe, it, expect, vi } from 'vitest';

// Mock server-only to avoid runtime errors in tests
vi.mock('server-only', () => ({}));

import { tokenize, bookToText } from '../tokenizer';

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

describe('bookToText', () => {
  it('combines book fields with title weighted 2x', () => {
    const book = {
      title: 'The Name of the Wind',
      authors: ['Patrick Rothfuss'],
      subjects: ['fantasy', 'magic'],
    };

    const text = bookToText(book);
    expect(text).toContain('The Name of the Wind');
    expect(text).toContain('Patrick Rothfuss');
    expect(text).toContain('fantasy');
    expect(text).toContain('magic');

    // Title should appear twice (weighted 2x)
    const titleCount = (text.match(/The Name of the Wind/g) || []).length;
    expect(titleCount).toBe(2);
  });

  it('handles empty arrays', () => {
    const book = { title: 'Test', authors: [], subjects: [] };
    expect(bookToText(book)).toBe('Test Test  ');
  });

  it('handles multiple authors', () => {
    const book = {
      title: 'Book',
      authors: ['Author One', 'Author Two'],
      subjects: [],
    };
    const text = bookToText(book);
    expect(text).toContain('Author One Author Two');
  });

  it('handles multiple subjects', () => {
    const book = {
      title: 'Book',
      authors: [],
      subjects: ['fantasy', 'magic', 'adventure'],
    };
    const text = bookToText(book);
    expect(text).toContain('fantasy magic adventure');
  });
});
