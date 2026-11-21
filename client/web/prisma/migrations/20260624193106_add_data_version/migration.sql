-- AlterTable
ALTER TABLE "Categories" ALTER COLUMN "createdAt" SET DEFAULT NOW()::text;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dataVersion" INTEGER NOT NULL DEFAULT 0;
