import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

export function handleTimeWindowChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
) {
  const operations = [];

  if (databaseChanges.categoryTimeWindow.create.length) {
    operations.push(
      db.categoryTimeWindow.createMany({
        data: databaseChanges.categoryTimeWindow.create.map((w) => ({
          id: w.id,
          day: w.day,
          startTime: w.startTime,
          endTime: w.endTime,
          recurrenceExceptions: w.recurrenceExceptions ?? null,
          categoryId: w.categoryId,
          userId,
        })),
        skipDuplicates: true,
      }),
    );
  }

  if (databaseChanges.categoryTimeWindow.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"CategoryTimeWindows"`,
        rows: databaseChanges.categoryTimeWindow.update,
        userIdColumn: "userId",
        userId,
        columns: [
          { name: "day", cast: "int", extract: (r) => r.day },
          { name: "startTime", cast: "text", extract: (r) => r.startTime },
          { name: "endTime", cast: "text", extract: (r) => r.endTime },
          {
            name: "recurrenceExceptions",
            cast: "text",
            extract: (r) => r.recurrenceExceptions,
          },
          { name: "categoryId", cast: "text", extract: (r) => r.categoryId },
        ],
      }),
    );
  }

  if (databaseChanges.categoryTimeWindow.destroy.length) {
    operations.push(
      db.categoryTimeWindow.deleteMany({
        where: {
          userId,
          id: {
            in: databaseChanges.categoryTimeWindow.destroy.map((w) => w.id),
          },
        },
      }),
    );
  }

  return operations;
}
