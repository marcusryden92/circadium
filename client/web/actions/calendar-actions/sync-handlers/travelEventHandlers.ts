import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
type Database = Prisma.TransactionClient;

// Same delete + recreate pattern as categoryEventHandlers — TravelEvent rows
// are entirely engine-derived, so collapsing updates to delete + createMany
// removes per-row UPDATE round-trips.
export function handleTravelEventChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
) {
  const operations: Promise<unknown>[] = [];
  const now = new Date().toISOString();

  const updates = databaseChanges.travelEvent.update;
  const creates = databaseChanges.travelEvent.create;
  const destroys = databaseChanges.travelEvent.destroy;

  const idsToDelete = [...destroys, ...updates].map((e) => e.id);
  const rowsToCreate = [...creates, ...updates];

  if (idsToDelete.length) {
    operations.push(
      db.travelEvent.deleteMany({
        where: { userId, id: { in: idsToDelete } },
      }),
    );
  }

  if (rowsToCreate.length) {
    operations.push(
      db.travelEvent.createMany({
        data: rowsToCreate.map((e) => ({
          id: e.id,
          start: e.start,
          end: e.end,
          fromLocationId: e.fromLocationId,
          toLocationId: e.toLocationId,
          travelMinutes: e.travelMinutes,
          requiredTravelMinutes: e.requiredTravelMinutes,
          insufficientTravel: e.insufficientTravel,
          overconstrained: e.overconstrained,
          userId,
          updatedAt: now,
        })),
      }),
    );
  }

  return operations;
}
