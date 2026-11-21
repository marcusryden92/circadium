import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { intToWeekday } from "@/utils/calendarUtils";
import type { EventTemplate } from "@/types/prisma";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

// App holds startDay as WeekDayIntegers; DB expects the WeekDayType enum string.
function templateForWrite(template: EventTemplate) {
  return {
    ...template,
    startDay: intToWeekday(template.startDay),
  };
}

export function handleTemplateChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
  updatedAt: string
) {
  const operations = [];

  // CREATE
  if (databaseChanges.template.create.length) {
    operations.push(
      db.eventTemplate.createMany({
        data: databaseChanges.template.create.map((template) => ({
          ...templateForWrite(template),
          userId,
        })),
        skipDuplicates: true,
      })
    );
  }

  // UPDATE — bulk `UPDATE ... FROM VALUES`.
  if (databaseChanges.template.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"EventTemplates"`,
        rows: databaseChanges.template.update,
        userIdColumn: "userId",
        userId,
        updatedAtColumn: "updatedAt",
        updatedAt,
        columns: [
          { name: "title", cast: "text", extract: (r) => r.title },
          {
            name: "startDay",
            cast: `"WeekDayType"`,
            extract: (r) => intToWeekday(r.startDay),
          },
          { name: "startTime", cast: "text", extract: (r) => r.startTime },
          { name: "duration", cast: "int", extract: (r) => r.duration },
          { name: "color", cast: "text", extract: (r) => r.color },
          { name: "locationId", cast: "text", extract: (r) => r.locationId },
          {
            name: "recurrenceExceptions",
            cast: "text",
            extract: (r) => r.recurrenceExceptions,
          },
        ],
      })
    );
  }

  // DELETE
  if (databaseChanges.template.destroy.length) {
    operations.push(
      db.eventTemplate.deleteMany({
        where: {
          userId,
          id: { in: databaseChanges.template.destroy.map((t) => t.id) },
        },
      })
    );
  }

  return operations;
}
