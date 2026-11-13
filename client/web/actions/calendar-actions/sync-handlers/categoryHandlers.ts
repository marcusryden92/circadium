import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

export function handleCategoryChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
  updatedAt: string,
) {
  const operations = [];

  if (databaseChanges.category.create.length) {
    operations.push(
      db.category.createMany({
        data: databaseChanges.category.create.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          color: c.color,
          sortOrder: c.sortOrder,
          isStrict: c.isStrict,
          useTimeWindows: c.useTimeWindows,
          confineToOwnWindows: c.confineToOwnWindows,
          locationId: c.locationId,
          parentId: c.parentId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          userId,
        })),
        skipDuplicates: true,
      }),
    );
  }

  if (databaseChanges.category.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"Categories"`,
        rows: databaseChanges.category.update,
        userIdColumn: "userId",
        userId,
        updatedAtColumn: "updatedAt",
        updatedAt,
        columns: [
          { name: "name", cast: "text", extract: (r) => r.name },
          { name: "icon", cast: "text", extract: (r) => r.icon },
          { name: "color", cast: "text", extract: (r) => r.color },
          { name: "sortOrder", cast: "int", extract: (r) => r.sortOrder },
          { name: "isStrict", cast: "boolean", extract: (r) => r.isStrict },
          {
            name: "useTimeWindows",
            cast: "boolean",
            extract: (r) => r.useTimeWindows,
          },
          {
            name: "confineToOwnWindows",
            cast: "boolean",
            extract: (r) => r.confineToOwnWindows,
          },
          { name: "locationId", cast: "text", extract: (r) => r.locationId },
          { name: "parentId", cast: "text", extract: (r) => r.parentId },
        ],
      }),
    );
  }

  if (databaseChanges.category.destroy.length) {
    operations.push(
      db.category.deleteMany({
        where: {
          userId,
          id: { in: databaseChanges.category.destroy.map((c) => c.id) },
        },
      }),
    );
  }

  return operations;
}
