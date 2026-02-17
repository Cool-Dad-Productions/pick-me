/**
 * Backfill script to extract openLibraryWorkId from existing Book metadata.
 *
 * This script reads the metadata.works[0].key field from existing books and
 * populates the new openLibraryWorkId field.
 *
 * Usage: npx tsx scripts/backfill-work-ids.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface BookMetadata {
  works?: Array<{ key: string }>;
}

async function backfillWorkIds() {
  console.log('Starting work ID backfill...');

  // Find all books that have metadata but no openLibraryWorkId
  const books = await prisma.book.findMany({
    where: {
      openLibraryWorkId: null,
      NOT: { metadata: { equals: Prisma.JsonNull } },
    },
    select: {
      id: true,
      title: true,
      metadata: true,
    },
  });

  console.log(`Found ${books.length} books to process`);

  let updated = 0;
  let skipped = 0;

  for (const book of books) {
    const metadata = book.metadata as BookMetadata | null;
    const workKey = metadata?.works?.[0]?.key;

    if (workKey) {
      // Extract work ID (e.g., "/works/OL123W" -> "OL123W")
      const openLibraryWorkId = workKey.replace('/works/', '');

      await prisma.book.update({
        where: { id: book.id },
        data: { openLibraryWorkId },
      });

      console.log(`Updated "${book.title}" with workId: ${openLibraryWorkId}`);
      updated++;
    } else {
      console.log(`Skipped "${book.title}" - no work key in metadata`);
      skipped++;
    }
  }

  console.log('\nBackfill complete!');
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total processed: ${books.length}`);
}

backfillWorkIds()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
