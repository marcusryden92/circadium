-- SimpleEvents start/end move from TEXT ISO strings to timestamp(3) (the 2.5
-- audit decision, landing with the cutover): every row is engine-written
-- toISOString() output — verified uniformly `.SSS'Z'`-shaped on prod and
-- staging 2026-11-25. The USING cast preserves every value as a naive UTC
-- instant (stored convention: timestamp without time zone, holding UTC).
ALTER TABLE "SimpleEvents"
    ALTER COLUMN "start" TYPE TIMESTAMP(3) USING "start"::timestamp(3),
    ALTER COLUMN "end" TYPE TIMESTAMP(3) USING "end"::timestamp(3);

-- The first server-side time-range consumer is the push scheduler's
-- upcoming-events scan (Phase 3); the composite index also serves any future
-- per-user range query.
CREATE INDEX "SimpleEvents_userId_start_idx" ON "SimpleEvents"("userId", "start");

-- Prisma's bookkeeping, orphaned by the cutover. Only present on databases
-- Prisma migrated (fresh Flyway-built ones never have it).
DROP TABLE IF EXISTS "_prisma_migrations";
