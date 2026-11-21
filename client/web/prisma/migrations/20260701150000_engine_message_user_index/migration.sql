-- Every fetch (fetchCalendarData, fetchFreshState) and every sync sweep
-- (deleteMany during rollback / stale recovery) queries EngineMessages by
-- userId. Without this index those queries scan the whole table, which
-- degrades linearly as messages accumulate.

-- CreateIndex
CREATE INDEX "EngineMessages_userId_idx" ON "EngineMessages"("userId");
