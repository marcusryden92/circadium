-- Sibling/leaf order now lives in "sortOrder" (backfilled from the chain in
-- the previous migration); the legacy linked-list column is retired.
ALTER TABLE "Planners" DROP COLUMN "dependency";
