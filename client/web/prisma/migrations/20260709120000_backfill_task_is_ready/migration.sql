-- Readiness is now the universal scheduling gate: an item schedules only when
-- isReady is true. Until now the engine gated goals only, so every triaged
-- task scheduled regardless of isReady. Backfill existing tasks and plans to
-- true so their current scheduling behavior is preserved once the gate applies
-- to tasks. Goals keep their user-controlled readiness untouched.
UPDATE "Planners" SET "isReady" = true
WHERE "plannerType" IN ('task', 'plan') AND ("isReady" IS DISTINCT FROM true);
