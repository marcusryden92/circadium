-- Every fetch (fetchCalendarData, fetchFreshState) and every sync handler
-- queries these tables by userId, but Postgres does not auto-index FK
-- columns — only EngineMessages had its index. Without these, every load
-- and sync sweep sequential-scans across all users' rows.
-- Location is covered by the existing @@unique([userId, placeId]).

-- CreateIndex
CREATE INDEX "SimpleEvents_userId_idx" ON "SimpleEvents"("userId");

-- CreateIndex
CREATE INDEX "Planners_userId_idx" ON "Planners"("userId");

-- CreateIndex
CREATE INDEX "EventTemplates_userId_idx" ON "EventTemplates"("userId");

-- CreateIndex
CREATE INDEX "Categories_userId_idx" ON "Categories"("userId");

-- CreateIndex
CREATE INDEX "CategoryTimeWindows_userId_idx" ON "CategoryTimeWindows"("userId");

-- CreateIndex
CREATE INDEX "CategoryEvents_userId_idx" ON "CategoryEvents"("userId");

-- CreateIndex
CREATE INDEX "TravelEvents_userId_idx" ON "TravelEvents"("userId");

-- CreateIndex
CREATE INDEX "TravelTimes_userId_idx" ON "TravelTimes"("userId");
