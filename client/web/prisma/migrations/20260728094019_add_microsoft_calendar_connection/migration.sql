-- CreateTable
CREATE TABLE "MicrosoftCalendarConnections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrosoftCalendarConnections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MicrosoftCalendarConnections_userId_key" ON "MicrosoftCalendarConnections"("userId");

-- AddForeignKey
ALTER TABLE "MicrosoftCalendarConnections" ADD CONSTRAINT "MicrosoftCalendarConnections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
