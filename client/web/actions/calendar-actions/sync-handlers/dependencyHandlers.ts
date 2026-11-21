import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
type Database = Prisma.TransactionClient;

// Dependency rows are immutable — created or deleted, never updated — so
// there is no bulkUpdate branch.
export function handleDependencyChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
) {
  const operations = [];

  if (databaseChanges.dependency.create.length) {
    operations.push(
      db.plannerDependency.createMany({
        data: databaseChanges.dependency.create.map((d) => ({
          id: d.id,
          predecessorId: d.predecessorId,
          successorId: d.successorId,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          userId,
        })),
        skipDuplicates: true,
      }),
    );
  }

  if (databaseChanges.dependency.destroy.length) {
    operations.push(
      db.plannerDependency.deleteMany({
        where: {
          userId,
          id: { in: databaseChanges.dependency.destroy.map((d) => d.id) },
        },
      }),
    );
  }

  return operations;
}
