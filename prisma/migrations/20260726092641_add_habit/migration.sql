-- AlterEnum
ALTER TYPE "PlannerType" ADD VALUE 'habit';

-- CreateTable
CREATE TABLE "HabitCompletions" (
    "id" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "HabitCompletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitCompletions_plannerId_idx" ON "HabitCompletions"("plannerId");

-- CreateIndex
CREATE INDEX "HabitCompletions_userId_idx" ON "HabitCompletions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCompletions_plannerId_occurrenceKey_key" ON "HabitCompletions"("plannerId", "occurrenceKey");

-- AddForeignKey
ALTER TABLE "HabitCompletions" ADD CONSTRAINT "HabitCompletions_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCompletions" ADD CONSTRAINT "HabitCompletions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
