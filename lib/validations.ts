import { z } from 'zod';

export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const ratingSchema = z
  .number()
  .min(1, 'Rating must be at least 1')
  .max(5, 'Rating must be at most 5')
  .multipleOf(0.5, 'Rating must be in 0.5 increments');

export const isbnSchema = z
  .string()
  .regex(/^(?:\d{10}|\d{13})$/, 'ISBN must be 10 or 13 digits');

/**
 * Validates ISBN-13 checksum using the standard algorithm.
 * The check digit (last digit) should make the weighted sum divisible by 10.
 */
export function validateIsbn13Checksum(isbn: string): boolean {
  if (isbn.length !== 13 || !/^\d{13}$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return parseInt(isbn[12]) === expectedCheckDigit;
}

/**
 * Validates that an EAN-13 barcode is a book ISBN (starts with 978 or 979).
 */
export function isBookIsbn(isbn: string): boolean {
  return isbn.startsWith('978') || isbn.startsWith('979');
}

export function normalizeIsbn(isbn: string): string | null {
  const digits = isbn.replace(/[-\s]/g, '');

  if (digits.length === 13) {
    return digits;
  }

  if (digits.length === 10) {
    // Convert ISBN-10 to ISBN-13
    const isbn12 = '978' + digits.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(isbn12[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return isbn12 + checkDigit;
  }

  return null;
}

export function normalizeRating(value: number): number {
  const clamped = Math.max(1, Math.min(5, value));
  return Math.round(clamped * 2) / 2;
}

export const columnMappingSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  rating: z.string().min(1),
  isbn: z.string().optional(),
  date: z.string().optional(),
  tags: z.string().optional(),
});

export const importCommitSchema = z.object({
  batchId: z.string().min(1),
  columnMap: columnMappingSchema,
});

export const predictSchema = z.object({
  bookId: z.string().min(1),
});

export const tagsSchema = z
  .array(
    z.string()
      .trim()
      .min(1, 'Tag must not be empty')
      .max(100, 'Tag must be 100 characters or fewer')
      .transform((s) => s.toLowerCase())
  )
  .max(50, 'Maximum 50 tags per book')
  .transform((tags) => [...new Set(tags.filter((t) => t.length > 0))]);

export const bookSearchSchema = z.object({
  q: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
}).refine(
  (data) => data.q || data.title || data.author,
  { message: 'At least one search parameter is required' }
);
