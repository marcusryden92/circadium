-- AlterTable
ALTER TABLE "Categories" ALTER COLUMN "createdAt" SET DEFAULT NOW()::text;

-- CreateTable
CREATE TABLE "CategoryEvents" (
    "id" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "trespassingStart" BOOLEAN NOT NULL DEFAULT false,
    "trespassingEnd" BOOLEAN NOT NULL DEFAULT false,
    "categoryTimeWindowId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT NOW()::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "CategoryEvents_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CategoryEvents" ADD CONSTRAINT "CategoryEvents_categoryTimeWindowId_fkey" FOREIGN KEY ("categoryTimeWindowId") REFERENCES "CategoryTimeWindows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryEvents" ADD CONSTRAINT "CategoryEvents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryEvents" ADD CONSTRAINT "CategoryEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
