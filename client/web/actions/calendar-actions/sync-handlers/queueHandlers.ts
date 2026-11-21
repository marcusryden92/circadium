import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

export function handleQueueChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
  updatedAt: string,
) {
  const operations = [];

  if (databaseChanges.queue.create.length) {
    operations.push(
      db.queue.createMany({
        data: databaseChanges.queue.create.map((q) => ({
          id: q.id,
          title: q.title,
          sortOrder: q.sortOrder,
          color: q.color,
          categoryId: q.categoryId,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          userId,
        })),
        skipDuplicates: true,
      }),
    );
  }

  if (databaseChanges.queue.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"Queues"`,
        rows: databaseChanges.queue.update,
        userIdColumn: "userId",
        userId,
        updatedAtColumn: "updatedAt",
        updatedAt,
        columns: [
          { name: "title", cast: "text", extract: (r) => r.title },
          { name: "sortOrder", cast: "int", extract: (r) => r.sortOrder },
          { name: "color", cast: "text", extract: (r) => r.color },
          { name: "categoryId", cast: "text", extract: (r) => r.categoryId },
        ],
      }),
    );
  }

  if (databaseChanges.queue.destroy.length) {
    operations.push(
      db.queue.deleteMany({
        where: {
          userId,
          id: { in: databaseChanges.queue.destroy.map((q) => q.id) },
        },
      }),
    );
  }

  return operations;
}
