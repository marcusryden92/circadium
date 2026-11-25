-- The one TEXT timestamp 1.13b left behind (plan 2.1): HabitCompletions.createdAt
-- moves to timestamp(3) now that its writes live in Java. The USING cast preserves
-- every existing value (all were written as toISOString() by the retired action).
-- No default and no trigger: Java stamps createdAt on create and the upsert's
-- update branch never touches it. start/end stay TEXT until the 2.5 decision point.
ALTER TABLE "HabitCompletions"
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3);
