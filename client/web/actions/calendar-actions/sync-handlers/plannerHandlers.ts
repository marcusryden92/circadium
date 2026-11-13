import type { Prisma } from "@/generated/client";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { bulkUpdate } from "./bulkUpdate";
type Database = Prisma.TransactionClient;

export function handlePlannerChanges(
  db: Database,
  userId: string,
  databaseChanges: DatabaseChanges,
  updatedAt: string
) {
  const operations = [];

  // CREATE
  if (databaseChanges.planner.create.length) {
    operations.push(
      db.planner.createMany({
        data: databaseChanges.planner.create.map((planner) => ({
          ...planner,
          userId,
        })),
        skipDuplicates: true,
      })
    );
  }

  // UPDATE — bulk `UPDATE ... FROM VALUES` in a single round-trip. Previously
  // this looped a per-row `updateMany`, which multiplied wall-clock time on
  // big diffs (e.g. assistant save on a large goal restructure). Missing ids
  // just don't match in the join, preserving the earlier ghost-id safety.
  if (databaseChanges.planner.update.length) {
    operations.push(
      bulkUpdate({
        db,
        tableName: `"Planners"`,
        rows: databaseChanges.planner.update,
        userIdColumn: "userId",
        userId,
        updatedAtColumn: "updatedAt",
        updatedAt,
        columns: [
          { name: "title", cast: "text", extract: (r) => r.title },
          { name: "parentId", cast: "text", extract: (r) => r.parentId },
          {
            name: "plannerType",
            cast: `"PlannerType"`,
            extract: (r) => r.plannerType,
          },
          { name: "isReady", cast: "boolean", extract: (r) => r.isReady },
          { name: "isTriaged", cast: "boolean", extract: (r) => r.isTriaged },
          { name: "duration", cast: "int", extract: (r) => r.duration },
          { name: "deadline", cast: "text", extract: (r) => r.deadline },
          { name: "starts", cast: "text", extract: (r) => r.starts },
          { name: "recurrence", cast: "text", extract: (r) => r.recurrence },
          {
            name: "recurrenceExceptions",
            cast: "text",
            extract: (r) => r.recurrenceExceptions,
          },
          { name: "splitting", cast: "text", extract: (r) => r.splitting },
          {
            name: "completedSegments",
            cast: "text",
            extract: (r) => r.completedSegments,
          },
          {
            name: "maxMinutesPerDay",
            cast: "int",
            extract: (r) => r.maxMinutesPerDay,
          },
          {
            name: "earliestStartDate",
            cast: "text",
            extract: (r) => r.earliestStartDate,
          },
          {
            name: "allowedTimes",
            cast: "text",
            extract: (r) => r.allowedTimes,
          },
          {
            name: "linkedItemId",
            cast: "text",
            extract: (r) => r.linkedItemId,
          },
          { name: "notes", cast: "text", extract: (r) => r.notes },
          {
            name: "sortOrder",
            cast: "double precision",
            extract: (r) => r.sortOrder,
          },
          {
            name: "completedStartTime",
            cast: "text",
            extract: (r) => r.completedStartTime,
          },
          {
            name: "completedEndTime",
            cast: "text",
            extract: (r) => r.completedEndTime,
          },
          { name: "priority", cast: "int", extract: (r) => r.priority },
          { name: "color", cast: "text", extract: (r) => r.color },
          { name: "locationId", cast: "text", extract: (r) => r.locationId },
          {
            name: "useParentLocation",
            cast: "boolean",
            extract: (r) => r.useParentLocation,
          },
          { name: "categoryId", cast: "text", extract: (r) => r.categoryId },
        ],
      })
    );
  }

  // DELETE
  if (databaseChanges.planner.destroy.length) {
    operations.push(
      db.planner.deleteMany({
        where: {
          userId,
          id: { in: databaseChanges.planner.destroy.map((p) => p.id) },
        },
      })
    );
  }

  return operations;
}
