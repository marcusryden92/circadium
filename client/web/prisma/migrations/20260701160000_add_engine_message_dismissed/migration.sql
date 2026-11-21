-- User-owned soft-dismiss flag on EngineMessage. The engine carries this
-- forward at emit time so a subsequent regen with the same deterministic id
-- keeps the row hidden; dismissal cycles naturally because a row that stops
-- being emitted is destroyed by the diff sync and any later re-emit is a
-- fresh row with dismissed=false.

-- AlterTable
ALTER TABLE "EngineMessages" ADD COLUMN "dismissed" BOOLEAN NOT NULL DEFAULT false;
