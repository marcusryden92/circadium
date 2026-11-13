-- Cascade Planner deletes when the owning User is deleted. Previously the FK
-- was ON DELETE RESTRICT, so account deletion had to explicitly delete every
-- Planner row first. This aligns the schema with the other user-owned tables.

ALTER TABLE "public"."Planners" DROP CONSTRAINT "Planners_userId_fkey";

ALTER TABLE "public"."Planners"
  ADD CONSTRAINT "Planners_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
