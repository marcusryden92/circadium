-- AlterTable
ALTER TABLE "Planners" ADD COLUMN     "linkedItemId" TEXT;

-- AddForeignKey
ALTER TABLE "Planners" ADD CONSTRAINT "Planners_linkedItemId_fkey" FOREIGN KEY ("linkedItemId") REFERENCES "Planners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
