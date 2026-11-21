-- AlterTable
ALTER TABLE "Planners" ADD COLUMN     "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: derive per-sibling-group order from the legacy leaf dependency chain.
-- Leaves (rows with no children) form a linked list per root goal via "dependency";
-- an interior node's position among its siblings is the position of its subtree's
-- first leaf in that chain. Top-level roots keep the default 0 (order non-semantic).
WITH RECURSIVE leaves AS (
  SELECT p.id, p."dependency"
  FROM "Planners" p
  WHERE NOT EXISTS (SELECT 1 FROM "Planners" c WHERE c."parentId" = p.id)
),
chain AS (
  SELECT l.id, 1 AS seq
  FROM leaves l
  WHERE l."dependency" IS NULL
     OR NOT EXISTS (SELECT 1 FROM leaves d WHERE d.id = l."dependency")
  UNION ALL
  SELECT l.id, chain.seq + 1
  FROM leaves l
  JOIN chain ON l."dependency" = chain.id
  WHERE chain.seq < 100000
),
closure AS (
  SELECT p.id AS ancestor, p.id AS node FROM "Planners" p
  UNION
  SELECT closure.ancestor, c.id
  FROM closure
  JOIN "Planners" c ON c."parentId" = closure.node
),
first_leaf AS (
  SELECT closure.ancestor AS id, MIN(chain.seq) AS min_seq
  FROM closure
  JOIN chain ON chain.id = closure.node
  GROUP BY closure.ancestor
),
positions AS (
  SELECT p.id,
         ROW_NUMBER() OVER (
           PARTITION BY p."parentId"
           ORDER BY first_leaf.min_seq ASC NULLS LAST, p."createdAt" ASC, p.id ASC
         ) * 1024 AS pos
  FROM "Planners" p
  LEFT JOIN first_leaf ON first_leaf.id = p.id
  WHERE p."parentId" IS NOT NULL
)
UPDATE "Planners" p
SET "sortOrder" = positions.pos
FROM positions
WHERE p.id = positions.id;
