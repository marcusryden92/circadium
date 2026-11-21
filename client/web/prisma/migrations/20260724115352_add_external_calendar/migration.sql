-- CreateEnum
CREATE TYPE "ExternalCalendarKind" AS ENUM ('ICS', 'GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "ExternalCalendarMode" AS ENUM ('BUSY', 'VISUAL');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'external';

-- CreateTable
CREATE TABLE "ExternalCalendarSources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ExternalCalendarKind" NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" "ExternalCalendarMode" NOT NULL DEFAULT 'BUSY',
    "modeExceptions" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendarSources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalEvents" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExternalEvents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalCalendarSources_userId_idx" ON "ExternalCalendarSources"("userId");

-- CreateIndex
CREATE INDEX "ExternalEvents_userId_idx" ON "ExternalEvents"("userId");

-- CreateIndex
CREATE INDEX "ExternalEvents_sourceId_idx" ON "ExternalEvents"("sourceId");

-- AddForeignKey
ALTER TABLE "ExternalCalendarSources" ADD CONSTRAINT "ExternalCalendarSources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEvents" ADD CONSTRAINT "ExternalEvents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ExternalCalendarSources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEvents" ADD CONSTRAINT "ExternalEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
