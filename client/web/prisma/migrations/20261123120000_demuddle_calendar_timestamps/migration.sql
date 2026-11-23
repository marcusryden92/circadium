-- De-muddle (plan 1.13b): the calendar audit columns createdAt/updatedAt move
-- from TEXT ISO strings to timestamp(3). The USING cast preserves every existing
-- value (all parse cleanly as instants; verified on dev before writing this).
-- updatedAt becomes DB-owned: a default for INSERTs plus a BEFORE UPDATE trigger,
-- so no application writer stamps it. createdAt stays client-write-once on the
-- three source tables (Planners/SimpleEvents/EventTemplates), so no default there.

-- Seven tables carried a (now())::text createdAt default; drop it before the type
-- change, then give both columns a timestamp default.
ALTER TABLE "Categories"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "CategoryEvents"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "EngineMessages"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "PlannerDependencies"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "QueueMembers"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Queues"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "TravelEvents"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Three source tables keep createdAt client-supplied (no default); only updatedAt
-- gets a default.
ALTER TABLE "EventTemplates"
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Planners"
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "SimpleEvents"
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3),
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- updatedAt is DB-owned audit: this trigger refreshes it on every UPDATE, so no
-- application writer stamps it. UTC wall-clock matches the stored convention
-- (timestamp without time zone, holding UTC).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW."updatedAt" := (now() AT TIME ZONE 'UTC');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "CategoryEvents" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "EngineMessages" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "PlannerDependencies" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "QueueMembers" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Queues" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "TravelEvents" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "EventTemplates" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Planners" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "SimpleEvents" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
