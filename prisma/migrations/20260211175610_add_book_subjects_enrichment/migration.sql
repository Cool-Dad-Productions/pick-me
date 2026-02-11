-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "lastEnrichedAt" TIMESTAMP(3),
ADD COLUMN     "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[];
