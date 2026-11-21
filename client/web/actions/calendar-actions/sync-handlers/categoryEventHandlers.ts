import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
type Database = Prisma.TransactionClient;

// CategoryEvent rows are entirely engine-derived (no user edits, no other
// writers). Updates collapse to delete + recreate at the same deterministic
// id: two batched queries replace N per-row UPDATE round-trips. The cost is
// that createdAt resets on every content change — acceptable because nothing
// in the app reads it. The transaction makes the swap atomic.
export function handleCategoryEventChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
) {
  const operations: Promise<unknown>[] = [];
  const now = new Date().toISOString();

  const updates = databaseChanges.categoryEvent.update;
  const creates = databaseChanges.categoryEvent.create;
  const destroys = databaseChanges.categoryEvent.destroy;

  const idsToDelete = [...destroys, ...updates].map((e) => e.id);
  const rowsToCreate = [...creates, ...updates];

  if (idsToDelete.length) {
    operations.push(
      db.categoryEvent.deleteMany({
        where: { userId, id: { in: idsToDelete } },
      }),
    );
  }

  if (rowsToCreate.length) {
    operations.push(
      db.categoryEvent.createMany({
        data: rowsToCreate.map((e) => ({
          id: e.id,
          start: e.start,
          end: e.end,
          trespassingStart: e.trespassingStart,
          trespassingEnd: e.trespassingEnd,
          categoryTimeWindowId: e.categoryTimeWindowId,
          categoryId: e.categoryId,
          userId,
          updatedAt: now,
        })),
      }),
    );
  }

  return operations;
}
