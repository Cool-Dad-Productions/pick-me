-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "openLibraryWorkId" TEXT,
ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "publicationYear" INTEGER;

-- CreateIndex
CREATE INDEX "Book_openLibraryWorkId_idx" ON "Book"("openLibraryWorkId");
