import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { enrichBook, enrichAllBooks } from '@/lib/books/enrichment';

const enrichRequestSchema = z.object({
  bookId: z.string().optional(),
  all: z.boolean().optional(),
  batchSize: z.number().min(1).max(100).optional(),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = enrichRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { bookId, all, batchSize, force } = parsed.data;

    // Batch enrichment
    if (all) {
      const stats = await enrichAllBooks({
        batchSize: batchSize || 20,
        delayMs: 1000,
      });

      return NextResponse.json({
        message: 'Batch enrichment complete',
        stats: {
          total: stats.total,
          enriched: stats.enriched,
          failed: stats.failed,
          skipped: stats.skipped,
        },
      });
    }

    // Single book enrichment
    if (!bookId) {
      return NextResponse.json(
        { error: 'bookId required when not using all: true' },
        { status: 400 }
      );
    }

    const result = await enrichBook(bookId, { force });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Enrichment error:', error);
    return NextResponse.json(
      { error: 'Enrichment failed' },
      { status: 500 }
    );
  }
}
