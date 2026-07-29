-- Habits become a tracking layer over ordinary planner items.
-- 1. New tracker tables (Habits + HabitItems).
-- 2. Every habit-typed planner row is retyped to task, keeping recurrence /
--    allowed times / duration / splitting — scheduling behavior is unchanged
--    (the engine expands any recurring task the way it expanded habits), and
--    completion keys stay valid (they anchor to the row's immutable createdAt).
--    One tracker is minted per old habit row (planner id reused as habit id)
--    with a HabitItem linking it to the retyped task.
-- 3. The habit value is dropped from PlannerType.

-- CreateTable
CREATE TABLE "Habits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "categoryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "Habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitItems" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "HabitItems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Habits_userId_idx" ON "Habits"("userId");

-- CreateIndex
CREATE INDEX "HabitItems_userId_idx" ON "HabitItems"("userId");

-- CreateIndex
CREATE INDEX "HabitItems_plannerId_idx" ON "HabitItems"("plannerId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitItems_habitId_plannerId_key" ON "HabitItems"("habitId", "plannerId");

-- AddForeignKey
ALTER TABLE "Habits" ADD CONSTRAINT "Habits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habits" ADD CONSTRAINT "Habits_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitItems" ADD CONSTRAINT "HabitItems_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitItems" ADD CONSTRAINT "HabitItems_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitItems" ADD CONSTRAINT "HabitItems_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mint one tracker per habit-typed row before the retype erases the marker.
INSERT INTO "Habits" ("id", "userId", "name", "color", "categoryId", "sortOrder", "createdAt", "updatedAt")
SELECT p."id", p."userId", p."title", p."color", p."categoryId", 0, p."createdAt", p."updatedAt"
FROM "Planners" p
WHERE p."plannerType" = 'habit';

INSERT INTO "HabitItems" ("id", "habitId", "plannerId", "userId", "createdAt")
SELECT gen_random_uuid()::text, p."id", p."id", p."userId", p."createdAt"
FROM "Planners" p
WHERE p."plannerType" = 'habit';

-- Retype habit rows to task (recurrence/allowedTimes/duration/splitting kept).
UPDATE "Planners" SET "plannerType" = 'task' WHERE "plannerType" = 'habit';
UPDATE "EventExtendedProps" SET "plannerType" = 'task' WHERE "plannerType" = 'habit';

-- AlterEnum
BEGIN;
CREATE TYPE "PlannerType_new" AS ENUM ('task', 'plan', 'goal');
ALTER TABLE "Planners" ALTER COLUMN "plannerType" TYPE "PlannerType_new" USING ("plannerType"::text::"PlannerType_new");
ALTER TABLE "EventExtendedProps" ALTER COLUMN "plannerType" TYPE "PlannerType_new" USING ("plannerType"::text::"PlannerType_new");
ALTER TYPE "PlannerType" RENAME TO "PlannerType_old";
ALTER TYPE "PlannerType_new" RENAME TO "PlannerType";
DROP TYPE "PlannerType_old";
COMMIT;
