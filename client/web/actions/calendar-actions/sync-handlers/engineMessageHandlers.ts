import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

/**
 * EngineMessage rows are engine-derived. Dismissal is a `dismissed` field
 * flip that flows through the update path; there is no separate delete
 * edge for dismissal (the row survives so the engine can carry the flag
 * forward on the next regen).
 */
export function handleEngineMessageChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
) {
  const operations = [];
  const now = new Date().toISOString();

  const updates = databaseChanges.engineMessage.update;
  const creates = databaseChanges.engineMessage.create;
  const destroys = databaseChanges.engineMessage.destroy;

  if (destroys.length) {
    operations.push(
      db.engineMessage.deleteMany({
        where: { userId, id: { in: destroys.map((m) => m.id) } },
      }),
    );
  }

  if (creates.length) {
    operations.push(
      db.engineMessage.createMany({
        data: creates.map((m) => ({
          id: m.id,
          type: m.type,
          tone: m.tone,
          payload: m.payload as Prisma.InputJsonValue,
          dismissed: m.dismissed,
          userId,
          updatedAt: now,
        })),
      }),
    );
  }

  // UPDATE — bulk `UPDATE ... FROM VALUES`. Note: JSON payload is serialized
  // client-side and cast to jsonb; nulls stay null via the standard cast.
  if (updates.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"EngineMessages"`,
        rows: updates,
        userIdColumn: "userId",
        userId,
        updatedAtColumn: "updatedAt",
        updatedAt: now,
        columns: [
          { name: "type", cast: "text", extract: (r) => r.type },
          { name: "tone", cast: "text", extract: (r) => r.tone },
          {
            name: "payload",
            cast: "jsonb",
            extract: (r) => JSON.stringify(r.payload),
          },
          { name: "dismissed", cast: "boolean", extract: (r) => r.dismissed },
        ],
      }),
    );
  }

  return operations;
}
