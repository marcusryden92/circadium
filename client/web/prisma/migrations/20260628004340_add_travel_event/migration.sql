-- AlterTable
ALTER TABLE "Categories" ALTER COLUMN "createdAt" SET DEFAULT NOW()::text;

-- AlterTable
ALTER TABLE "CategoryEvents" ALTER COLUMN "createdAt" SET DEFAULT NOW()::text;

-- CreateTable
CREATE TABLE "TravelEvents" (
    "id" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "travelMinutes" INTEGER NOT NULL,
    "requiredTravelMinutes" INTEGER,
    "insufficientTravel" BOOLEAN NOT NULL DEFAULT false,
    "overconstrained" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT NOW()::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "TravelEvents_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TravelEvents" ADD CONSTRAINT "TravelEvents_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelEvents" ADD CONSTRAINT "TravelEvents_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelEvents" ADD CONSTRAINT "TravelEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
