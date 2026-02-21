-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
