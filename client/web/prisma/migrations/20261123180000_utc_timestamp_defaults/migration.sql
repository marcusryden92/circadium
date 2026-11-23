-- The demuddle migration gave the calendar tables bare CURRENT_TIMESTAMP defaults, which cast
-- into timestamp(3) through the SESSION timezone. Java's inserts omit updatedAt, so the default
-- fires on every insert; a non-UTC session (local dev) would store local wall-clock that the
-- API then serves with a false Z. The update trigger already pins UTC; these defaults now match.
-- The connection may sit behind PgBouncer transaction pooling, so the fix must live in the
-- default expression, never in session state (SET TIME ZONE does not stick there).

ALTER TABLE "Categories"
    ALTER COLUMN "createdAt" SET DEFAULT timezone('utc'::text, now()),
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "CategoryEvents"
    ALTER COLUMN "createdAt" SET DEFAULT timezone('utc'::text, now()),
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "EngineMessages"
    ALTER COLUMN "createdAt" SET DEFAULT timezone('utc'::text, now()),
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "PlannerDependencies"
    ALTER COLUMN "createdAt" SET DEFAULT timezone('utc'::text, now()),
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "QueueMembers"
    ALTER COLUMN "createdAt" SET DEFAULT timezone('utc'::text, now()),
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "Queues"
    ALTER COLUMN "createdAt" SET DEFAULT timezone('utc'::text, now()),
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "TravelEvents"
    ALTER COLUMN "createdAt" SET DEFAULT timezone('utc'::text, now()),
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "EventTemplates"
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "Planners"
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());

ALTER TABLE "SimpleEvents"
    ALTER COLUMN "updatedAt" SET DEFAULT timezone('utc'::text, now());
