-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."EnergyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('planner', 'template', 'travel', 'category');

-- CreateEnum
CREATE TYPE "public"."PlannerType" AS ENUM ('task', 'plan', 'goal');

-- CreateEnum
CREATE TYPE "public"."PriorityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."TaskTypeEnum" AS ENUM ('EXERCISE', 'DEEP_WORK', 'ADMIN', 'MEETING', 'CREATIVE', 'ROUTINE', 'HABIT', 'SOCIAL');

-- CreateEnum
CREATE TYPE "public"."TransportMode" AS ENUM ('DRIVING', 'TRANSIT', 'BICYCLING', 'WALKING');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "public"."WeekDayType" AS ENUM ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');

-- CreateTable
CREATE TABLE "public"."Categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "useTimeWindows" BOOLEAN NOT NULL DEFAULT true,
    "isStrict" BOOLEAN NOT NULL DEFAULT false,
    "locationId" TEXT,
    "parentId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "Categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CategoryTimeWindows" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "categoryId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CategoryTimeWindows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventExtendedProps" (
    "id" TEXT NOT NULL,
    "plannerType" "public"."PlannerType",
    "eventType" "public"."EventType" NOT NULL,
    "completedStartTime" TEXT,
    "completedEndTime" TEXT,
    "parentId" TEXT,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "EventExtendedProps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventTemplates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDay" "public"."WeekDayType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "color" TEXT,
    "locationId" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "EventTemplates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Planners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "plannerType" "public"."PlannerType" NOT NULL,
    "isReady" BOOLEAN,
    "duration" INTEGER NOT NULL,
    "deadline" TEXT,
    "starts" TEXT,
    "dependency" TEXT,
    "completedStartTime" TEXT,
    "completedEndTime" TEXT,
    "priority" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "color" TEXT,
    "locationId" TEXT,
    "useParentLocation" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "Planners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SimpleEvents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "duration" INTEGER,
    "userId" TEXT NOT NULL,
    "rrule" TEXT,
    "backgroundColor" TEXT NOT NULL,
    "borderColor" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "SimpleEvents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskPreferences" (
    "id" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "taskType" "public"."TaskTypeEnum",
    "preferredDays" INTEGER[],
    "preferredStartTime" TEXT,
    "preferredEndTime" TEXT,
    "avoidDays" INTEGER[],
    "priority" "public"."PriorityLevel" NOT NULL DEFAULT 'MEDIUM',
    "energyLevel" "public"."EnergyLevel",
    "allowFlexibility" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaskPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelTimes" (
    "id" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "transportMode" "public"."TransportMode" NOT NULL,
    "googleRushHourMinutes" INTEGER NOT NULL,
    "googleRegularMinutes" INTEGER NOT NULL,
    "googleNightMinutes" INTEGER NOT NULL,
    "customRushHourMinutes" INTEGER,
    "customRegularMinutes" INTEGER,
    "customNightMinutes" INTEGER,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelTimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TwoFactorConfirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TwoFactorConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TwoFactorToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSchedulingPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bufferTimeMinutes" INTEGER NOT NULL DEFAULT 10,
    "defaultTransportMode" "public"."TransportMode" NOT NULL DEFAULT 'DRIVING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSchedulingPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventExtendedProps_eventId_key" ON "public"."EventExtendedProps"("eventId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Locations_userId_placeId_key" ON "public"."Locations"("userId" ASC, "placeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_email_token_key" ON "public"."PasswordResetToken"("email" ASC, "token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "public"."PasswordResetToken"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TaskPreferences_plannerId_key" ON "public"."TaskPreferences"("plannerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TravelTimes_fromLocationId_toLocationId_transportMode_key" ON "public"."TravelTimes"("fromLocationId" ASC, "toLocationId" ASC, "transportMode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorConfirmation_userId_key" ON "public"."TwoFactorConfirmation"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_email_token_key" ON "public"."TwoFactorToken"("email" ASC, "token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_token_key" ON "public"."TwoFactorToken"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserSchedulingPreferences_userId_key" ON "public"."UserSchedulingPreferences"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_email_token_key" ON "public"."VerificationToken"("email" ASC, "token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "public"."accounts"("provider" ASC, "provider_account_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."Categories" ADD CONSTRAINT "Categories_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Categories" ADD CONSTRAINT "Categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Categories" ADD CONSTRAINT "Categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CategoryTimeWindows" ADD CONSTRAINT "CategoryTimeWindows_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CategoryTimeWindows" ADD CONSTRAINT "CategoryTimeWindows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventExtendedProps" ADD CONSTRAINT "EventExtendedProps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."SimpleEvents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventTemplates" ADD CONSTRAINT "EventTemplates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventTemplates" ADD CONSTRAINT "EventTemplates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Locations" ADD CONSTRAINT "Locations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Planners" ADD CONSTRAINT "Planners_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Planners" ADD CONSTRAINT "Planners_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Planners" ADD CONSTRAINT "Planners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SimpleEvents" ADD CONSTRAINT "SimpleEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelTimes" ADD CONSTRAINT "TravelTimes_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "public"."Locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelTimes" ADD CONSTRAINT "TravelTimes_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "public"."Locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TwoFactorConfirmation" ADD CONSTRAINT "TwoFactorConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
