-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "googleBooksVolumeId" TEXT;

-- CreateIndex
CREATE INDEX "Book_googleBooksVolumeId_idx" ON "Book"("googleBooksVolumeId");
