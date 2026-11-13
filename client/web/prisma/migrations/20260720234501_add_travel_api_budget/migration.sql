-- CreateTable
CREATE TABLE "TravelApiBudget" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "elementsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelApiBudget_pkey" PRIMARY KEY ("id")
);
