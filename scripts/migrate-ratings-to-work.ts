/**
 * Migration script to move UserRating records to WorkRating model.
 *
 * This script:
 * 1. Reads all unmigrated UserRating records
 * 2. Groups them by (userId, openLibraryWorkId)
 * 3. For conflicts (same user rated multiple editions), keeps most recent
 * 4. Creates WorkRating records
 * 5. Marks UserRating records as migrated
 *
 * For books without openLibraryWorkId, generates a synthetic ID:
 *   synthetic:{md5(lowercase(title + authors.join(',')))}
 *
 * Usage: npx tsx scripts/migrate-ratings-to-work.ts
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function generateSyntheticWorkId(title: string, authors: string[]): string {
  const normalized = (title + authors.join(',')).toLowerCase();
  const hash = createHash('md5').update(normalized).digest('hex').slice(0, 12);
  return `synthetic:${hash}`;
}

interface RatingWithBook {
  id: string;
  userId: string;
  rating: number;
  ratedAt: Date | null;
  source: string | null;
  createdAt: Date;
  book: {
    id: string;
    title: string;
    authors: string[];
    openLibraryWorkId: string | null;
  };
}

async function migrateRatingsToWork() {
  console.log('Starting rating migration to work level...\n');

  // Find all unmigrated UserRating records with their books
  const userRatings = await prisma.userRating.findMany({
    where: { migratedToWorkRating: false },
    include: {
      book: {
        select: {
          id: true,
          title: true,
          authors: true,
          openLibraryWorkId: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' }, // Most recent first for conflict resolution
  });

  console.log(`Found ${userRatings.length} UserRating records to migrate\n`);

  if (userRatings.length === 0) {
    console.log('No ratings to migrate. Done!');
    return;
  }

  // Group by (userId, workId) - keeping only the most recent (first in array due to ordering)
  const workRatingMap = new Map<string, RatingWithBook>();
  let duplicatesSkipped = 0;

  for (const rating of userRatings) {
    const workId =
      rating.book.openLibraryWorkId ||
      generateSyntheticWorkId(rating.book.title, rating.book.authors);

    const key = `${rating.userId}:${workId}`;

    if (!workRatingMap.has(key)) {
      workRatingMap.set(key, {
        ...rating,
        book: {
          ...rating.book,
          openLibraryWorkId: workId, // Ensure we have the resolved workId
        },
      });
    } else {
      // Duplicate - skip (we already have a more recent one)
      duplicatesSkipped++;
      console.log(
        `  Duplicate: "${rating.book.title}" (keeping more recent rating)`
      );
    }
  }

  console.log(`\nUnique work ratings to create: ${workRatingMap.size}`);
  console.log(`Duplicates consolidated: ${duplicatesSkipped}\n`);

  // Create WorkRating records and mark UserRatings as migrated
  let created = 0;
  let errors = 0;

  for (const [_key, rating] of workRatingMap) {
    const userId = rating.userId;
    const workId = rating.book.openLibraryWorkId!;

    try {
      // Use upsert in case we're re-running after partial migration
      await prisma.workRating.upsert({
        where: {
          userId_openLibraryWorkId: { userId, openLibraryWorkId: workId },
        },
        create: {
          userId,
          openLibraryWorkId: workId,
          rating: rating.rating,
          ratedAt: rating.ratedAt,
          source: rating.source,
        },
        update: {
          rating: rating.rating,
          ratedAt: rating.ratedAt,
          source: rating.source,
        },
      });

      created++;
    } catch (error) {
      console.error(`  Error creating WorkRating for "${userId}:${workId}":`, error);
      errors++;
    }
  }

  // Mark all processed UserRatings as migrated
  const migratedIds = userRatings.map((r) => r.id);
  await prisma.userRating.updateMany({
    where: { id: { in: migratedIds } },
    data: { migratedToWorkRating: true },
  });

  console.log('\nMigration complete!');
  console.log(`  WorkRatings created/updated: ${created}`);
  console.log(`  Duplicates consolidated: ${duplicatesSkipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  UserRatings marked as migrated: ${migratedIds.length}`);
}

async function printStats() {
  const [userRatingCount, workRatingCount, migratedCount] = await Promise.all([
    prisma.userRating.count(),
    prisma.workRating.count(),
    prisma.userRating.count({ where: { migratedToWorkRating: true } }),
  ]);

  console.log('\n--- Current Stats ---');
  console.log(`  Total UserRatings: ${userRatingCount}`);
  console.log(`  Migrated UserRatings: ${migratedCount}`);
  console.log(`  Unmigrated UserRatings: ${userRatingCount - migratedCount}`);
  console.log(`  Total WorkRatings: ${workRatingCount}`);
}

migrateRatingsToWork()
  .then(() => printStats())
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
