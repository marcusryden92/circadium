"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import { handlePlannerChanges } from "./sync-handlers/plannerHandlers";
import { handleCalendarChanges } from "./sync-handlers/calendarHandlers";
import { handleExtendedPropsChanges } from "./sync-handlers/extendedPropsHandlers";
import { handleTemplateChanges } from "./sync-handlers/templateHandlers";
import { handleCategoryChanges } from "./sync-handlers/categoryHandlers";
import { handleTimeWindowChanges } from "./sync-handlers/timeWindowHandlers";
import { handleCategoryEventChanges } from "./sync-handlers/categoryEventHandlers";
import { handleTravelEventChanges } from "./sync-handlers/travelEventHandlers";
import { handleEngineMessageChanges } from "./sync-handlers/engineMessageHandlers";
import { handleQueueChanges } from "./sync-handlers/queueHandlers";
import { handleQueueMemberChanges } from "./sync-handlers/queueMemberHandlers";
import { handleDependencyChanges } from "./sync-handlers/dependencyHandlers";
import { handleLocationChanges } from "./sync-handlers/locationHandlers";
import { handleTravelTimeChanges } from "./sync-handlers/travelTimeHandlers";
import { fetchFreshState, type FreshState } from "./fetchFreshState";

// Sentinel error used inside the interactive transaction to abort + roll back
// when the client's dataVersion doesn't match the server's. The catch block
// upstream maps this into a structured response rather than a thrown error.
class StaleVersionError extends Error {
  constructor() {
    super("stale");
    this.name = "StaleVersionError";
  }
}

export type SyncResponse =
  | { success: true; newDataVersion: number }
  | { success: false; reason: "stale"; freshState: FreshState }
  | { success: false; reason: "error"; error: string };

export async function syncCalendarData(
  databaseChanges: DatabaseChanges,
  clientKnownDataVersion: number,
): Promise<SyncResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, reason: "error", error: "Unauthorized" };
  }

  // Empty diffs must not bump dataVersion — a no-op bump forces every other
  // tab's next sync into stale-adoption, discarding its in-flight edits.
  const hasChanges = Object.values(databaseChanges).some(
    (group: { create: unknown[]; update: unknown[]; destroy: unknown[] }) =>
      group.create.length > 0 ||
      group.update.length > 0 ||
      group.destroy.length > 0,
  );
  if (!hasChanges) {
    return { success: true, newDataVersion: clientKnownDataVersion };
  }

  const now = new Date();
  const updatedAt = now.toISOString();

  try {
    const newDataVersion = await db.$transaction(
      async (tx) => {
        // OCC gate. updateMany returns count: 0 if the user row doesn't exist OR
        // if dataVersion has moved on since the client read it. Either way we
        // abort the transaction (rolling back any prior ops) and let the upstream
        // catch block return the fresh state to the client.
        const versionBump = await tx.user.updateMany({
          where: { id: userId, dataVersion: clientKnownDataVersion },
          data: { dataVersion: { increment: 1 } },
        });
        if (versionBump.count === 0) {
          throw new StaleVersionError();
        }

        // FK create ordering: a referenced row must exist before the row that
        // references it. Location <- Category <- Planner (a goal filed under a
        // category the same sync creates — e.g. an assistant save — would
        // otherwise hit Planners_categoryId_fkey), then the calendar/event
        // tables (SimpleEvent before its ExtendedProps), then the precedence
        // tables (Queue before its QueueMembers/Dependencies). Cross-table
        // deletes are handled by the schema's SetNull/Cascade FKs, so this one
        // per-table order is safe for destroys too.
        const operations = [
          ...handleLocationChanges(tx, userId, databaseChanges),
          ...handleCategoryChanges(tx, userId, databaseChanges, updatedAt),
          ...handlePlannerChanges(tx, userId, databaseChanges, updatedAt),
          ...handleCalendarChanges(tx, userId, databaseChanges, updatedAt),
          ...handleExtendedPropsChanges(tx, userId, databaseChanges),
          ...handleTemplateChanges(tx, userId, databaseChanges, updatedAt),
          ...handleTimeWindowChanges(tx, userId, databaseChanges),
          ...handleCategoryEventChanges(tx, userId, databaseChanges),
          ...handleTravelEventChanges(tx, userId, databaseChanges),
          ...handleEngineMessageChanges(tx, userId, databaseChanges),
          ...handleQueueChanges(tx, userId, databaseChanges, updatedAt),
          ...handleQueueMemberChanges(tx, userId, databaseChanges, updatedAt),
          ...handleDependencyChanges(tx, userId, databaseChanges),
          ...handleTravelTimeChanges(tx, userId, databaseChanges),
        ];

        // Sequential execution matches the previous array-form semantics so
        // ordering invariants (e.g. SimpleEvent must exist before ExtendedProps
        // upsert connects to it) still hold.
        for (const op of operations) {
          await op;
        }

        return clientKnownDataVersion + 1;
      },
      {
        // The first regen after a fresh load runs hundreds of writes:
        // CategoryEvent creates for every materialized weekly occurrence on top
        // of the usual planner/calendar/extendedProps churn. Prisma's 5s
        // interactive-transaction default tips over here. Assistant saves on a
        // large goal restructure hit the same shape (many planner ops + full
        // engine regen), so 60s gives steady headroom. Long syncs are still
        // bounded so a runaway diff can't block the connection indefinitely.
        timeout: 60_000,
      },
    );

    console.log("📊 Sync operations:", {
      newDataVersion,
      plannerOps:
        databaseChanges.planner.create.length +
        databaseChanges.planner.update.length +
        databaseChanges.planner.destroy.length,
      calendarOps:
        databaseChanges.calendar.create.length +
        databaseChanges.calendar.update.length +
        databaseChanges.calendar.destroy.length,
    });

    return { success: true, newDataVersion };
  } catch (error) {
    if (error instanceof StaleVersionError) {
      const freshState = await fetchFreshState(userId);
      return { success: false, reason: "stale", freshState };
    }
    // Log the real error server-side; return a generic message so Prisma /
    // driver internals don't leak across the action boundary.
    console.error("❌ Failed to sync planner and calendar data:", error);
    return {
      success: false,
      reason: "error",
      error: "Sync failed",
    };
  }
}
