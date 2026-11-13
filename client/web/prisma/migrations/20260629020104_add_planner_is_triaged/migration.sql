-- AlterTable
ALTER TABLE "Planners" ADD COLUMN "isTriaged" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: rows already past the triage stage are marked triaged so they
-- don't suddenly reappear in the Capture queue. Subtasks never triage,
-- completed items are done, items with a non-zero duration had it set during
-- triage, and goals whose updatedAt has diverged from createdAt have been
-- touched (the prior heuristic that gated queue inclusion).
UPDATE "Planners"
SET "isTriaged" = true
WHERE "parentId" IS NOT NULL
   OR "completedEndTime" IS NOT NULL
   OR "duration" > 0
   OR ("plannerType" = 'goal' AND "updatedAt" > "createdAt");
