import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

export function handleQueueMemberChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
  updatedAt: string,
) {
  const operations = [];

  if (databaseChanges.queueMember.create.length) {
    operations.push(
      db.queueMember.createMany({
        data: databaseChanges.queueMember.create.map((m) => ({
          id: m.id,
          sortOrder: m.sortOrder,
          queueId: m.queueId,
          plannerId: m.plannerId,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          userId,
        })),
        skipDuplicates: true,
      }),
    );
  }

  if (databaseChanges.queueMember.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"QueueMembers"`,
        rows: databaseChanges.queueMember.update,
        userIdColumn: "userId",
        userId,
        updatedAtColumn: "updatedAt",
        updatedAt,
        columns: [
          {
            name: "sortOrder",
            cast: "double precision",
            extract: (r) => r.sortOrder,
          },
          { name: "queueId", cast: "text", extract: (r) => r.queueId },
        ],
      }),
    );
  }

  if (databaseChanges.queueMember.destroy.length) {
    operations.push(
      db.queueMember.deleteMany({
        where: {
          userId,
          id: { in: databaseChanges.queueMember.destroy.map((m) => m.id) },
        },
      }),
    );
  }

  return operations;
}
