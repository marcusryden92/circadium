import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

// Travel times only flow through the diff for custom override updates.
// Create requires a Google distance lookup (refreshAllTravelTimes /
// fetchMissingTravelTimes own that path) and destroy happens by Prisma
// cascade when a location is deleted. Google base fields (rush/regular/
// night minutes, transport mode, identity) are server-authoritative and
// never written from the diff.
export function handleTravelTimeChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
) {
  const operations = [];

  if (databaseChanges.travelTime.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"TravelTimes"`,
        rows: databaseChanges.travelTime.update,
        userIdColumn: "userId",
        userId,
        columns: [
          {
            name: "customRushHourMinutes",
            cast: "int",
            extract: (r) => r.customRushHourMinutes,
          },
          {
            name: "customRegularMinutes",
            cast: "int",
            extract: (r) => r.customRegularMinutes,
          },
          {
            name: "customNightMinutes",
            cast: "int",
            extract: (r) => r.customNightMinutes,
          },
        ],
      }),
    );
  }

  return operations;
}
