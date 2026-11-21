-- AlterTable
ALTER TABLE "Categories" ALTER COLUMN "createdAt" SET DEFAULT NOW()::text;

-- AlterTable
ALTER TABLE "CategoryEvents" ALTER COLUMN "createdAt" SET DEFAULT NOW()::text;

-- AlterTable
ALTER TABLE "TravelEvents" ALTER COLUMN "createdAt" SET DEFAULT NOW()::text;

-- CreateTable
CREATE TABLE "EngineMessages" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT NOW()::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "EngineMessages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EngineMessages" ADD CONSTRAINT "EngineMessages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
