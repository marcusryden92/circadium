-- AlterTable
ALTER TABLE "EventExtendedProps" ADD COLUMN     "trespassingEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trespassingStart" BOOLEAN NOT NULL DEFAULT false;
