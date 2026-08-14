import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import type { Prisma } from "@/generated/client";
import type { EventExtendedProps } from "@/types/prisma";
type Database = Prisma.TransactionClient;

const COLUMN_LIST = `id, "eventId", "plannerType", "eventType", "parentId",
      "completedStartTime", "completedEndTime", "trespassingStart", "trespassingEnd"`;

// EventExtendedProps has no userId column of its own, so ownership scoping
// rides on the parent event: both write paths INSERT ... SELECT through a
// join against "SimpleEvents" on userId. Rows referencing events the caller
// doesn't own simply don't survive the join — same ghost-id philosophy as
// bulkUpdate (no error, no write).
function scopedInsert(
  db: Database,
  rows: EventExtendedProps[],
  userId: string,
  onConflictSql: string,
) {
  const params: unknown[] = [];
  const rowFragments: string[] = [];

  for (const props of rows) {
    const cells: string[] = [];
    const push = (value: unknown, cast: string) => {
      // Undefined never survives the client's JSON round-trip, but Prisma
      // rejects it as a bind value — normalize defensively.
      params.push(value ?? null);
      cells.push(`$${params.length}::${cast}`);
    };
    push(props.id, "text");
    push(props.eventId, "text");
    push(props.plannerType, `"PlannerType"`);
    push(props.eventType, `"EventType"`);
    push(props.parentId, "text");
    push(props.completedStartTime, "text");
    push(props.completedEndTime, "text");
    // Flags are runtime-optional on the type; the columns are NOT NULL.
    push(props.trespassingStart ?? false, "boolean");
    push(props.trespassingEnd ?? false, "boolean");
    rowFragments.push(`(${cells.join(",")})`);
  }

  params.push(userId);

  const query = `
    INSERT INTO "EventExtendedProps" (${COLUMN_LIST})
    SELECT v.id, v."eventId", v."plannerType", v."eventType", v."parentId",
           v."completedStartTime", v."completedEndTime",
           v."trespassingStart", v."trespassingEnd"
    FROM (VALUES ${rowFragments.join(",")}) AS v(${COLUMN_LIST})
    JOIN "SimpleEvents" se
      ON se.id = v."eventId" AND se."userId" = $${params.length}::text
    ${onConflictSql}
  `;

  return db.$executeRawUnsafe(query, ...params);
}

export function handleExtendedPropsChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
) {
  const operations = [];

  // CREATE — bare ON CONFLICT DO NOTHING matches the previous createMany
  // skipDuplicates behavior (skips on any unique collision: id PK or eventId).
  if (databaseChanges.extendedProps.create.length) {
    operations.push(
      scopedInsert(
        db,
        databaseChanges.extendedProps.create,
        userId,
        `ON CONFLICT DO NOTHING`,
      ),
    );
  }

  // UPSERT — one INSERT ... ON CONFLICT (eventId) DO UPDATE statement covers
  // every update row in a single round-trip. Note: eventType is intentionally
  // omitted from the DO UPDATE SET clause — it's set on create only, matching
  // the previous handler shape.
  if (databaseChanges.extendedProps.update.length) {
    operations.push(
      scopedInsert(
        db,
        databaseChanges.extendedProps.update,
        userId,
        `ON CONFLICT ("eventId") DO UPDATE SET
          "plannerType" = EXCLUDED."plannerType",
          "parentId" = EXCLUDED."parentId",
          "completedStartTime" = EXCLUDED."completedStartTime",
          "completedEndTime" = EXCLUDED."completedEndTime",
          "trespassingStart" = EXCLUDED."trespassingStart",
          "trespassingEnd" = EXCLUDED."trespassingEnd"`,
      ),
    );
  }

  // DELETE — scoped through the event relation.
  if (databaseChanges.extendedProps.destroy.length) {
    operations.push(
      db.eventExtendedProps.deleteMany({
        where: {
          id: { in: databaseChanges.extendedProps.destroy.map((p) => p.id) },
          event: { userId },
        },
      }),
    );
  }

  return operations;
}
