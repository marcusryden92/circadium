import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

// Locations only get simple name updates and deletes through the sync.
// Creation goes through actions/locations.ts because it needs a Google Places
// API lookup to populate address/lat/lng/placeId — those aren't known
// client-side at dispatch time. After a direct create, the page is expected to
// dispatch the returned Location to Redux AND mark it synced via the sync
// hook so the diff doesn't try to re-create it on the next pass.
export function handleLocationChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
) {
  const operations = [];

  if (databaseChanges.location.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"Locations"`,
        rows: databaseChanges.location.update,
        userIdColumn: "userId",
        userId,
        columns: [
          { name: "name", cast: "text", extract: (r) => r.name },
        ],
      }),
    );
  }

  if (databaseChanges.location.destroy.length) {
    operations.push(
      db.location.deleteMany({
        where: {
          userId,
          id: { in: databaseChanges.location.destroy.map((l) => l.id) },
        },
      }),
    );
  }

  return operations;
}
