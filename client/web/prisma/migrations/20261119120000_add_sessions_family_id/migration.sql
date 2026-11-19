-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "familyId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");
