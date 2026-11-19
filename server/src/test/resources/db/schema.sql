-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WeekDayType" AS ENUM ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');

-- CreateEnum
CREATE TYPE "PlannerType" AS ENUM ('task', 'plan', 'goal');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('planner', 'template', 'travel', 'category', 'external');

-- CreateEnum
CREATE TYPE "ExternalCalendarKind" AS ENUM ('ICS', 'GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "ExternalCalendarMode" AS ENUM ('BUSY', 'VISUAL');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('DRIVING', 'TRANSIT', 'BICYCLING', 'WALKING');

-- CreateEnum
CREATE TYPE "TaskTypeEnum" AS ENUM ('EXERCISE', 'DEEP_WORK', 'ADMIN', 'MEETING', 'CREATIVE', 'ROUTINE', 'HABIT', 'SOCIAL');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EnergyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "AiMode" AS ENUM ('BYOK', 'MANAGED', 'OFF');

-- CreateTable
CREATE TABLE "SimpleEvents" (
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
CREATE TABLE "EventExtendedProps" (
    "id" TEXT NOT NULL,
    "plannerType" "PlannerType",
    "eventType" "EventType" NOT NULL,
    "completedStartTime" TEXT,
    "completedEndTime" TEXT,
    "parentId" TEXT,
    "trespassingStart" BOOLEAN NOT NULL DEFAULT false,
    "trespassingEnd" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "EventExtendedProps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Planners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "plannerType" "PlannerType" NOT NULL,
    "isReady" BOOLEAN,
    "isTriaged" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER NOT NULL,
    "deadline" TEXT,
    "starts" TEXT,
    "recurrence" TEXT,
    "recurrenceExceptions" TEXT,
    "splitting" TEXT,
    "completedSegments" TEXT,
    "maxMinutesPerDay" INTEGER,
    "earliestStartDate" TEXT,
    "allowedTimes" TEXT,
    "linkedItemId" TEXT,
    "notes" TEXT,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
CREATE TABLE "HabitCompletions" (
    "id" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "HabitCompletions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDay" "WeekDayType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "color" TEXT,
    "locationId" TEXT,
    "recurrenceExceptions" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "EventTemplates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "useTimeWindows" BOOLEAN NOT NULL DEFAULT true,
    "isStrict" BOOLEAN NOT NULL DEFAULT false,
    "confineToOwnWindows" BOOLEAN NOT NULL DEFAULT false,
    "locationId" TEXT,
    "parentId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "Categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryTimeWindows" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "recurrenceExceptions" TEXT,
    "categoryId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CategoryTimeWindows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryEvents" (
    "id" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "trespassingStart" BOOLEAN NOT NULL DEFAULT false,
    "trespassingEnd" BOOLEAN NOT NULL DEFAULT false,
    "categoryTimeWindowId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "CategoryEvents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerDependencies" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "PlannerDependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftConversations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "DraftConversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineMessages" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "EngineMessages_pkey" PRIMARY KEY ("id")
);

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
    "locationId" TEXT,
    "locationExceptions" TEXT,
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

-- CreateTable
CREATE TABLE "GoogleCalendarConnections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnections_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "FeedbackReports" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dataSnapshot" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,

    CONSTRAINT "FeedbackReports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,

    CONSTRAINT "Suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionVotes" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,

    CONSTRAINT "SuggestionVotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitBuckets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "HabitBuckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "bucketId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "Habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitItems" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "HabitItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locations" (
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
CREATE TABLE "TravelTimes" (
    "id" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "transportMode" "TransportMode" NOT NULL,
    "googleRushHourMinutes" INTEGER NOT NULL,
    "googleRegularMinutes" INTEGER NOT NULL,
    "googleNightMinutes" INTEGER NOT NULL,
    "customRushHourMinutes" INTEGER,
    "customRegularMinutes" INTEGER,
    "customNightMinutes" INTEGER,
    "unroutableAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelTimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelApiBudget" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "elementsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelApiBudget_pkey" PRIMARY KEY ("id")
);

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
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "TravelEvents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queues" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "categoryId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "Queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueMembers" (
    "id" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "queueId" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "QueueMembers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSchedulingPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bufferTimeMinutes" INTEGER NOT NULL DEFAULT 10,
    "defaultTransportMode" "TransportMode" NOT NULL DEFAULT 'DRIVING',
    "weekStartDay" INTEGER NOT NULL DEFAULT 1,
    "lastTravelRefreshAt" TIMESTAMP(3),
    "lastTravelTopUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSchedulingPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPreferences" (
    "id" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "taskType" "TaskTypeEnum",
    "preferredDays" INTEGER[],
    "preferredStartTime" TEXT,
    "preferredEndTime" TEXT,
    "avoidDays" INTEGER[],
    "priority" "PriorityLevel" NOT NULL DEFAULT 'MEDIUM',
    "energyLevel" "EnergyLevel",
    "allowFlexibility" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaskPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "password_changed_at" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dataVersion" INTEGER NOT NULL DEFAULT 0,
    "onboarded_at" TIMESTAMP(3),
    "ai_mode" "AiMode",
    "ai_model" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
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
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorConfirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TwoFactorConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceName" TEXT,
    "replacedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserViewStates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "graph" TEXT,
    "mindmap" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserViewStates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimpleEvents_userId_idx" ON "SimpleEvents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventExtendedProps_eventId_key" ON "EventExtendedProps"("eventId");

-- CreateIndex
CREATE INDEX "Planners_userId_idx" ON "Planners"("userId");

-- CreateIndex
CREATE INDEX "HabitCompletions_plannerId_idx" ON "HabitCompletions"("plannerId");

-- CreateIndex
CREATE INDEX "HabitCompletions_userId_idx" ON "HabitCompletions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCompletions_plannerId_occurrenceKey_key" ON "HabitCompletions"("plannerId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "EventTemplates_userId_idx" ON "EventTemplates"("userId");

-- CreateIndex
CREATE INDEX "Categories_userId_idx" ON "Categories"("userId");

-- CreateIndex
CREATE INDEX "CategoryTimeWindows_userId_idx" ON "CategoryTimeWindows"("userId");

-- CreateIndex
CREATE INDEX "CategoryEvents_userId_idx" ON "CategoryEvents"("userId");

-- CreateIndex
CREATE INDEX "PlannerDependencies_userId_idx" ON "PlannerDependencies"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerDependencies_predecessorId_successorId_key" ON "PlannerDependencies"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "DraftConversations_userId_idx" ON "DraftConversations"("userId");

-- CreateIndex
CREATE INDEX "EngineMessages_userId_idx" ON "EngineMessages"("userId");

-- CreateIndex
CREATE INDEX "ExternalCalendarSources_userId_idx" ON "ExternalCalendarSources"("userId");

-- CreateIndex
CREATE INDEX "ExternalEvents_userId_idx" ON "ExternalEvents"("userId");

-- CreateIndex
CREATE INDEX "ExternalEvents_sourceId_idx" ON "ExternalEvents"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnections_userId_key" ON "GoogleCalendarConnections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MicrosoftCalendarConnections_userId_key" ON "MicrosoftCalendarConnections"("userId");

-- CreateIndex
CREATE INDEX "FeedbackReports_userId_idx" ON "FeedbackReports"("userId");

-- CreateIndex
CREATE INDEX "Suggestions_userId_idx" ON "Suggestions"("userId");

-- CreateIndex
CREATE INDEX "SuggestionVotes_userId_idx" ON "SuggestionVotes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionVotes_suggestionId_userId_key" ON "SuggestionVotes"("suggestionId", "userId");

-- CreateIndex
CREATE INDEX "HabitBuckets_userId_idx" ON "HabitBuckets"("userId");

-- CreateIndex
CREATE INDEX "Habits_userId_idx" ON "Habits"("userId");

-- CreateIndex
CREATE INDEX "HabitItems_userId_idx" ON "HabitItems"("userId");

-- CreateIndex
CREATE INDEX "HabitItems_plannerId_idx" ON "HabitItems"("plannerId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitItems_habitId_plannerId_key" ON "HabitItems"("habitId", "plannerId");

-- CreateIndex
CREATE UNIQUE INDEX "Locations_userId_placeId_key" ON "Locations"("userId", "placeId");

-- CreateIndex
CREATE INDEX "TravelTimes_userId_idx" ON "TravelTimes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelTimes_fromLocationId_toLocationId_transportMode_key" ON "TravelTimes"("fromLocationId", "toLocationId", "transportMode");

-- CreateIndex
CREATE INDEX "TravelEvents_userId_idx" ON "TravelEvents"("userId");

-- CreateIndex
CREATE INDEX "Queues_userId_idx" ON "Queues"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueMembers_plannerId_key" ON "QueueMembers"("plannerId");

-- CreateIndex
CREATE INDEX "QueueMembers_userId_idx" ON "QueueMembers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSchedulingPreferences_userId_key" ON "UserSchedulingPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskPreferences_plannerId_key" ON "TaskPreferences"("plannerId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_email_token_key" ON "VerificationToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_email_token_key" ON "PasswordResetToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_token_key" ON "TwoFactorToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_email_token_key" ON "TwoFactorToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorConfirmation_userId_key" ON "TwoFactorConfirmation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletionToken_userId_key" ON "AccountDeletionToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletionToken_token_key" ON "AccountDeletionToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UserViewStates_userId_key" ON "UserViewStates"("userId");

-- AddForeignKey
ALTER TABLE "SimpleEvents" ADD CONSTRAINT "SimpleEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventExtendedProps" ADD CONSTRAINT "EventExtendedProps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SimpleEvents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planners" ADD CONSTRAINT "Planners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planners" ADD CONSTRAINT "Planners_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planners" ADD CONSTRAINT "Planners_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planners" ADD CONSTRAINT "Planners_linkedItemId_fkey" FOREIGN KEY ("linkedItemId") REFERENCES "Planners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCompletions" ADD CONSTRAINT "HabitCompletions_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCompletions" ADD CONSTRAINT "HabitCompletions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplates" ADD CONSTRAINT "EventTemplates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplates" ADD CONSTRAINT "EventTemplates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categories" ADD CONSTRAINT "Categories_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categories" ADD CONSTRAINT "Categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categories" ADD CONSTRAINT "Categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTimeWindows" ADD CONSTRAINT "CategoryTimeWindows_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTimeWindows" ADD CONSTRAINT "CategoryTimeWindows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryEvents" ADD CONSTRAINT "CategoryEvents_categoryTimeWindowId_fkey" FOREIGN KEY ("categoryTimeWindowId") REFERENCES "CategoryTimeWindows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryEvents" ADD CONSTRAINT "CategoryEvents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryEvents" ADD CONSTRAINT "CategoryEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerDependencies" ADD CONSTRAINT "PlannerDependencies_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerDependencies" ADD CONSTRAINT "PlannerDependencies_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerDependencies" ADD CONSTRAINT "PlannerDependencies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftConversations" ADD CONSTRAINT "DraftConversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineMessages" ADD CONSTRAINT "EngineMessages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarSources" ADD CONSTRAINT "ExternalCalendarSources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarSources" ADD CONSTRAINT "ExternalCalendarSources_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEvents" ADD CONSTRAINT "ExternalEvents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ExternalCalendarSources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEvents" ADD CONSTRAINT "ExternalEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarConnections" ADD CONSTRAINT "GoogleCalendarConnections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrosoftCalendarConnections" ADD CONSTRAINT "MicrosoftCalendarConnections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReports" ADD CONSTRAINT "FeedbackReports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestions" ADD CONSTRAINT "Suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionVotes" ADD CONSTRAINT "SuggestionVotes_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionVotes" ADD CONSTRAINT "SuggestionVotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitBuckets" ADD CONSTRAINT "HabitBuckets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habits" ADD CONSTRAINT "Habits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habits" ADD CONSTRAINT "Habits_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "HabitBuckets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitItems" ADD CONSTRAINT "HabitItems_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitItems" ADD CONSTRAINT "HabitItems_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitItems" ADD CONSTRAINT "HabitItems_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locations" ADD CONSTRAINT "Locations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelTimes" ADD CONSTRAINT "TravelTimes_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelTimes" ADD CONSTRAINT "TravelTimes_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelEvents" ADD CONSTRAINT "TravelEvents_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelEvents" ADD CONSTRAINT "TravelEvents_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelEvents" ADD CONSTRAINT "TravelEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queues" ADD CONSTRAINT "Queues_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queues" ADD CONSTRAINT "Queues_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMembers" ADD CONSTRAINT "QueueMembers_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMembers" ADD CONSTRAINT "QueueMembers_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMembers" ADD CONSTRAINT "QueueMembers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPreferences" ADD CONSTRAINT "TaskPreferences_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorConfirmation" ADD CONSTRAINT "TwoFactorConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionToken" ADD CONSTRAINT "AccountDeletionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserViewStates" ADD CONSTRAINT "UserViewStates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
