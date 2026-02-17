-- AlterTable
ALTER TABLE "UserRating" ADD COLUMN     "migratedToWorkRating" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WorkRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openLibraryWorkId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "ratedAt" TIMESTAMP(3),
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkRating_userId_idx" ON "WorkRating"("userId");

-- CreateIndex
CREATE INDEX "WorkRating_openLibraryWorkId_idx" ON "WorkRating"("openLibraryWorkId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkRating_userId_openLibraryWorkId_key" ON "WorkRating"("userId", "openLibraryWorkId");

-- AddForeignKey
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
