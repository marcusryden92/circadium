-- Habit buckets: the habits surface's own grouping, distinct from the item
-- Category tree. Habits move from a category reference to a bucket reference;
-- every category currently referenced by a habit seeds one bucket (id, name,
-- and color copied) so no habit loses its grouping.

-- CreateTable
CREATE TABLE "HabitBuckets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "HabitBuckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitBuckets_userId_idx" ON "HabitBuckets"("userId");

-- AddForeignKey
ALTER TABLE "HabitBuckets" ADD CONSTRAINT "HabitBuckets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Habits" ADD COLUMN "bucketId" TEXT;

-- Seed one bucket per category habits currently point at (category id reused
-- as the bucket id so the habit update below is a straight copy).
INSERT INTO "HabitBuckets" ("id", "userId", "name", "color", "sortOrder", "createdAt", "updatedAt")
SELECT c."id", c."userId", c."name", c."color",
       (ROW_NUMBER() OVER (PARTITION BY c."userId" ORDER BY c."sortOrder", c."name"))::int - 1,
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM "Categories" c
WHERE c."id" IN (SELECT "categoryId" FROM "Habits" WHERE "categoryId" IS NOT NULL);

UPDATE "Habits" SET "bucketId" = "categoryId" WHERE "categoryId" IS NOT NULL;

-- DropForeignKey + DropColumn
ALTER TABLE "Habits" DROP CONSTRAINT "Habits_categoryId_fkey";
ALTER TABLE "Habits" DROP COLUMN "categoryId";

-- AddForeignKey
ALTER TABLE "Habits" ADD CONSTRAINT "Habits_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "HabitBuckets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
