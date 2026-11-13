-- AlterTable
ALTER TABLE "TravelTimes" ADD COLUMN     "unroutableAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserSchedulingPreferences" ADD COLUMN     "lastTravelRefreshAt" TIMESTAMP(3);
