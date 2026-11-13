-- Priority moved from a 0-10 scale to a 1-7 scale (higher = more important).
-- Clamp any rows that sit outside the new range into it; values already within
-- 1-7 are left untouched so deliberate user priorities are not rewritten.
UPDATE "Planners" SET "priority" = 1 WHERE "priority" < 1;
UPDATE "Planners" SET "priority" = 7 WHERE "priority" > 7;
