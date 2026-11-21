import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

export function handleCalendarChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
  updatedAt: string
) {
  const operations = [];

  // CREATE
  if (databaseChanges.calendar.create.length) {
    operations.push(
      db.simpleEvent.createMany({
        data: databaseChanges.calendar.create.map((event) => ({
          ...event,
          userId,
        })),
        skipDuplicates: true,
      })
    );
  }

  // UPDATE — bulk `UPDATE ... FROM VALUES`. Missing ids just don't match in
  // the join, preserving the earlier ghost-id safety.
  if (databaseChanges.calendar.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"SimpleEvents"`,
        rows: databaseChanges.calendar.update,
        userIdColumn: "userId",
        userId,
        updatedAtColumn: "updatedAt",
        updatedAt,
        columns: [
          { name: "title", cast: "text", extract: (r) => r.title },
          { name: "start", cast: "text", extract: (r) => r.start },
          { name: "end", cast: "text", extract: (r) => r.end },
          { name: "duration", cast: "int", extract: (r) => r.duration },
          { name: "rrule", cast: "text", extract: (r) => r.rrule },
          {
            name: "backgroundColor",
            cast: "text",
            extract: (r) => r.backgroundColor,
          },
          { name: "borderColor", cast: "text", extract: (r) => r.borderColor },
        ],
      })
    );
  }

  // DELETE
  if (databaseChanges.calendar.destroy.length) {
    operations.push(
      db.simpleEvent.deleteMany({
        where: {
          userId,
          id: { in: databaseChanges.calendar.destroy.map((e) => e.id) },
        },
      })
    );
  }

  return operations;
}
