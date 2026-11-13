import type { Prisma } from "@/generated/client";
type Database = Prisma.TransactionClient;

// A single column in a bulk `UPDATE ... FROM VALUES`. `cast` is the Postgres
// type used both in the VALUES row (`$1::cast`) and by the target column's
// existing type — needed because Postgres infers the VALUES-clause types from
// the first row and gets fussy about NULLs and enums otherwise.
export interface BulkUpdateColumn<T> {
  name: string; // SQL identifier without quotes (e.g. `title`, `parentId`)
  cast: string; // e.g. `text`, `int`, `boolean`, `"PlannerType"`
  extract: (row: T) => unknown;
}

// Build a single-statement bulk `UPDATE ... FROM (VALUES ...)` that:
//   - updates each row in `rows` to its own values
//   - is a no-op on ids that don't exist in the target table (WHERE join
//     preserves the earlier "no P2025 on ghost id" behavior of updateMany)
//   - is scoped by userId when `userIdColumn` is provided
//   - sets `updatedAt` to the transaction-level timestamp (if `updatedAtColumn`)
//
// Returns a PrismaPromise via `db.$executeRawUnsafe`, so it composes with the
// existing operations array + interactive transaction.
export function bulkUpdate<T extends { id: string }>({
  db,
  tableName,
  columns,
  rows,
  userIdColumn,
  userId,
  updatedAtColumn,
  updatedAt,
}: {
  db: Database;
  tableName: string; // quoted table name, e.g. `"Planners"`
  columns: BulkUpdateColumn<T>[];
  rows: T[];
  userIdColumn?: string; // unquoted, e.g. `userId`
  userId?: string;
  updatedAtColumn?: string; // unquoted, e.g. `updatedAt`
  updatedAt?: string;
}) {
  const params: unknown[] = [];

  const rowSqlFragments: string[] = [];
  for (const row of rows) {
    const cells: string[] = [];
    // id first, then each column in declared order
    params.push(row.id);
    cells.push(`$${params.length}::text`);
    for (const col of columns) {
      params.push(col.extract(row));
      cells.push(`$${params.length}::${col.cast}`);
    }
    rowSqlFragments.push(`(${cells.join(",")})`);
  }

  const columnNames = ["id", ...columns.map((c) => `"${c.name}"`)];
  const setClauses = columns.map(
    (c) => `"${c.name}" = v."${c.name}"`,
  );

  let setSql = setClauses.join(", ");
  if (updatedAtColumn && updatedAt !== undefined) {
    params.push(updatedAt);
    setSql += `, "${updatedAtColumn}" = $${params.length}::text`;
  }

  let whereSql = `t.id = v.id`;
  if (userIdColumn && userId !== undefined) {
    params.push(userId);
    whereSql += ` AND t."${userIdColumn}" = $${params.length}::text`;
  }

  const query = `
    UPDATE ${tableName} AS t SET ${setSql}
    FROM (VALUES ${rowSqlFragments.join(",")}) AS v(${columnNames.join(",")})
    WHERE ${whereSql}
  `;

  return db.$executeRawUnsafe(query, ...params);
}
