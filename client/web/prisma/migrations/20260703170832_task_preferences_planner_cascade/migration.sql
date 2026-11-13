-- TaskPreferences.plannerId was a bare string; deleting a Planner left its
-- preferences row orphaned. Remove existing orphans before adding the FK,
-- or the constraint would fail to validate.
DELETE FROM "TaskPreferences" tp
WHERE NOT EXISTS (
  SELECT 1 FROM "Planners" p WHERE p."id" = tp."plannerId"
);

-- AddForeignKey
ALTER TABLE "TaskPreferences" ADD CONSTRAINT "TaskPreferences_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
