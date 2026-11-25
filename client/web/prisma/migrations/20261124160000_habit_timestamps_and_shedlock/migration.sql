-- The habit tables' writes move to Java (plan 2.2), so their TEXT timestamps migrate to
-- timestamp(3) with them (the 1.13b per-group rule). Java stamps createdAt/updatedAt itself
-- (the UserViewStates pattern) — no defaults, no triggers. The USING cast preserves every
-- existing value (all were written as toISOString() by the retired actions).
ALTER TABLE "HabitBuckets"
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3);

ALTER TABLE "Habits"
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3);

ALTER TABLE "HabitItems"
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3);

-- ShedLock's lock table for the Java server's scheduled jobs (travel top-up first), per the
-- schema-authority rule: tables Java needs arrive through Prisma migrations until the 2.6
-- cutover. Shape is ShedLock's documented JdbcTemplate schema.
CREATE TABLE "shedlock" (
    "name" VARCHAR(64) NOT NULL,
    "lock_until" TIMESTAMP(3) NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL,
    "locked_by" VARCHAR(255) NOT NULL,

    CONSTRAINT "shedlock_pkey" PRIMARY KEY ("name")
);
