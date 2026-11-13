-- AlterTable
ALTER TABLE "ExternalCalendarSources" ADD COLUMN     "locationExceptions" TEXT,
ADD COLUMN     "locationId" TEXT;

-- AddForeignKey
ALTER TABLE "ExternalCalendarSources" ADD CONSTRAINT "ExternalCalendarSources_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
