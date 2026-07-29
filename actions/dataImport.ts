"use server";

import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Counterpart to exportUserData: load a Circadium export back into the account.
// - "replace" wipes the account's data and restores the file (ids preserved,
//   re-owned to the current user) — the true restore, used for DB migration.
// - "add" brings the file's items in as NEW rows alongside existing data;
//   every id is remapped so nothing collides.
// Engine-derived rows (calendar/category/travel events, engine messages) are
// never imported — the engine regenerates them on the next load. The Google
// refresh token isn't in an export, so Google calendars re-activate once the
// account reconnects Google.

export type ImportMode = "replace" | "add";

const FORMAT = "circadium.data-export.v1";

type Row = Record<string, unknown>;

function asArray(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function strip(row: Row, keys: string[] = []): Row {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

export async function importUserData(
  payload: unknown,
  mode: ImportMode,
): Promise<
  | { success: true; imported: number }
  | { success: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { success: false, error: "Unauthorized" };

  if (!payload || typeof payload !== "object") {
    return { success: false, error: "That file isn't a valid Circadium export." };
  }
  const data = payload as Row;
  const meta = data.meta as Row | undefined;
  if (!meta || meta.format !== FORMAT) {
    return {
      success: false,
      error: "Unrecognized file — use a JSON file exported from Circadium.",
    };
  }

  // Ids in an export are always strings; anything else is treated as absent.
  const idOf = (value: unknown): string => (typeof value === "string" ? value : "");

  const remap = mode === "add";
  // old id -> new id, namespaced per table so ids from different tables never
  // clash. In replace mode ids are preserved (identity), so this is unused.
  const idMap = new Map<string, string>();
  const assign = (table: string, oldId: unknown): string => {
    const original = idOf(oldId);
    if (!remap) return original;
    const key = `${table}:${original}`;
    let next = idMap.get(key);
    if (!next) {
      next = randomUUID();
      idMap.set(key, next);
    }
    return next;
  };
  const ref = (table: string, oldId: unknown): string | null => {
    if (oldId == null) return null;
    const original = idOf(oldId);
    if (!remap) return original;
    return idMap.get(`${table}:${original}`) ?? null;
  };

  const locations = asArray(data.locations);
  const travelTimes = asArray(data.travelTimes);
  const categories = asArray(data.categories);
  const templates = asArray(data.weeklyTemplates);
  const planners = asArray(data.planners);
  const taskPreferences = asArray(data.taskPreferences);
  const queues = asArray(data.queues);
  const dependencies = asArray(data.dependencies);
  const conversations = asArray(data.aiConversations);
  const sources = asArray(data.externalCalendarSources);
  const events = asArray(data.externalCalendarEvents);
  const habitBuckets = asArray(data.habitBuckets);
  const habits = asArray(data.habits);
  const habitItems = asArray(data.habitItems);
  const occurrenceCompletions = asArray(data.occurrenceCompletions);
  const viewState =
    data.viewState && typeof data.viewState === "object"
      ? (data.viewState as Row)
      : null;
  const preferences =
    data.schedulingPreferences && typeof data.schedulingPreferences === "object"
      ? (data.schedulingPreferences as Row)
      : null;

  // A stale JWT can carry a user id from a different database (e.g. after a DB
  // migration): the session looks valid but no users row matches, so every
  // write fails an opaque userId foreign-key error. Catch it up front.
  const accountExists = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!accountExists) {
    return {
      success: false,
      error:
        "Your account wasn't found in this database. Sign out and sign in (or register) again, then retry the import.",
    };
  }

  try {
    let imported = 0;
    await db.$transaction(
      async (tx) => {
        if (mode === "replace") {
          // Children before parents. Engine-derived rows go too — they rebuild.
          // The Google connection row is deliberately left intact.
          await tx.externalEvent.deleteMany({ where: { userId } });
          await tx.externalCalendarSource.deleteMany({ where: { userId } });
          await tx.categoryEvent.deleteMany({ where: { userId } });
          await tx.travelEvent.deleteMany({ where: { userId } });
          await tx.engineMessage.deleteMany({ where: { userId } });
          await tx.draftConversation.deleteMany({ where: { userId } });
          await tx.simpleEvent.deleteMany({ where: { userId } });
          await tx.queueMember.deleteMany({ where: { userId } });
          await tx.queue.deleteMany({ where: { userId } });
          await tx.plannerDependency.deleteMany({ where: { userId } });
          await tx.taskPreferences.deleteMany({ where: { planner: { userId } } });
          await tx.habitItem.deleteMany({ where: { userId } });
          await tx.habit.deleteMany({ where: { userId } });
          await tx.habitBucket.deleteMany({ where: { userId } });
          await tx.occurrenceCompletion.deleteMany({ where: { userId } });
          await tx.categoryTimeWindow.deleteMany({ where: { userId } });
          await tx.planner.deleteMany({ where: { userId } });
          await tx.category.deleteMany({ where: { userId } });
          await tx.eventTemplate.deleteMany({ where: { userId } });
          await tx.travelTime.deleteMany({ where: { userId } });
          await tx.location.deleteMany({ where: { userId } });
          await tx.userViewState.deleteMany({ where: { userId } });
          await tx.userSchedulingPreferences.deleteMany({ where: { userId } });
        }

        // In add mode, a location with a placeId the user already has must
        // reuse the existing row (the [userId, placeId] unique would reject a
        // duplicate, and child rows need a valid target).
        const existingByPlace = new Map<string, string>();
        if (remap) {
          const existing = await tx.location.findMany({
            where: { userId },
            select: { id: true, placeId: true },
          });
          for (const loc of existing) existingByPlace.set(loc.placeId, loc.id);
        }

        const locationsToInsert: Row[] = [];
        for (const loc of locations) {
          const placeId = idOf(loc.placeId);
          if (remap && placeId && existingByPlace.has(placeId)) {
            idMap.set(`location:${idOf(loc.id)}`, existingByPlace.get(placeId)!);
            continue;
          }
          const id = assign("location", loc.id);
          locationsToInsert.push({ ...strip(loc), id, userId });
        }

        // Pre-assign ids so references resolve regardless of row order.
        for (const t of travelTimes) assign("travelTime", t.id);
        for (const c of categories) assign("category", c.id);
        for (const c of categories)
          for (const w of asArray(c.timeSlots)) assign("window", w.id);
        for (const t of templates) assign("template", t.id);
        for (const p of planners) assign("planner", p.id);
        for (const tp of taskPreferences) assign("taskPref", tp.id);
        for (const q of queues) assign("queue", q.id);
        for (const q of queues)
          for (const m of asArray(q.members)) assign("member", m.id);
        for (const d of dependencies) assign("dependency", d.id);
        for (const conv of conversations) assign("conversation", conv.id);
        for (const s of sources) assign("source", s.id);
        for (const hb of habitBuckets) assign("habitBucket", hb.id);
        for (const h of habits) assign("habit", h.id);
        for (const hi of habitItems) assign("habitItem", hi.id);
        for (const oc of occurrenceCompletions) assign("completion", oc.id);

        const travelTimesToInsert = travelTimes
          .map((t) => ({
            ...strip(t),
            id: ref("travelTime", t.id),
            fromLocationId: ref("location", t.fromLocationId),
            toLocationId: ref("location", t.toLocationId),
            userId,
          }))
          .filter((t) => t.fromLocationId && t.toLocationId);

        const categoriesToInsert = categories.map((c) => ({
          ...strip(c, ["timeSlots"]),
          id: ref("category", c.id),
          parentId: c.parentId ? ref("category", c.parentId) : null,
          locationId: c.locationId ? ref("location", c.locationId) : null,
          userId,
        }));

        const windowsToInsert = categories.flatMap((c) =>
          asArray(c.timeSlots).map((w) => ({
            ...strip(w),
            id: ref("window", w.id),
            categoryId: w.categoryId
              ? ref("category", w.categoryId)
              : ref("category", c.id),
            userId,
          })),
        );

        const templatesToInsert = templates.map((t) => ({
          ...strip(t),
          id: ref("template", t.id),
          locationId: t.locationId ? ref("location", t.locationId) : null,
          userId,
        }));

        const plannersToInsert = planners.map((p) => ({
          ...strip(p),
          id: ref("planner", p.id),
          // parentId is a plain column (no FK); still remap so the tree holds.
          parentId: p.parentId ? ref("planner", p.parentId) : null,
          categoryId: p.categoryId ? ref("category", p.categoryId) : null,
          locationId: p.locationId ? ref("location", p.locationId) : null,
          linkedItemId: p.linkedItemId ? ref("planner", p.linkedItemId) : null,
          userId,
        }));

        const taskPreferencesToInsert = taskPreferences
          .map((tp) => ({
            ...strip(tp),
            id: ref("taskPref", tp.id),
            plannerId: ref("planner", tp.plannerId),
            userId,
          }))
          .filter((tp) => tp.plannerId);

        const queuesToInsert = queues.map((q) => ({
          ...strip(q, ["members"]),
          id: ref("queue", q.id),
          categoryId: q.categoryId ? ref("category", q.categoryId) : null,
          userId,
        }));

        const membersToInsert = queues
          .flatMap((q) =>
            asArray(q.members).map((m) => ({
              ...strip(m),
              id: ref("member", m.id),
              queueId: ref("queue", q.id),
              plannerId: ref("planner", m.plannerId),
              userId,
            })),
          )
          .filter((m) => m.queueId && m.plannerId);

        const dependenciesToInsert = dependencies
          .map((d) => ({
            ...strip(d),
            id: ref("dependency", d.id),
            predecessorId: ref("planner", d.predecessorId),
            successorId: ref("planner", d.successorId),
            userId,
          }))
          .filter((d) => d.predecessorId && d.successorId);

        const conversationsToInsert = conversations.map((conv) => ({
          ...strip(conv),
          id: ref("conversation", conv.id),
          userId,
        }));

        const sourcesToInsert = sources.map((s) => ({
          ...strip(s, ["events"]),
          id: ref("source", s.id),
          userId,
        }));

        const eventsToInsert = events.flatMap((e) => {
          const sourceId = ref("source", e.sourceId);
          if (!sourceId) return [];
          // The external-event id is composite (`sourceId|uid|start`); rebuild
          // it when the source id changed under remap.
          const id = remap
            ? `${sourceId}|${idOf(e.uid)}|${idOf(e.start)}`
            : idOf(e.id);
          return [{ ...strip(e), id, sourceId, userId }];
        });

        const habitBucketsToInsert = habitBuckets.map((hb) => ({
          ...strip(hb),
          id: ref("habitBucket", hb.id),
          userId,
        }));

        // Legacy exports carried categoryId on habits (buckets were category
        // references before they became their own entity) — stripped so an
        // old file still imports, with those habits landing unsorted.
        const habitsToInsert = habits.map((h) => ({
          ...strip(h, ["categoryId"]),
          id: ref("habit", h.id),
          bucketId: h.bucketId ? ref("habitBucket", h.bucketId) : null,
          userId,
        }));

        const habitItemsToInsert = habitItems
          .map((hi) => ({
            ...strip(hi),
            id: ref("habitItem", hi.id),
            habitId: ref("habit", hi.habitId),
            plannerId: ref("planner", hi.plannerId),
            userId,
          }))
          .filter((hi) => hi.habitId && hi.plannerId);

        const completionsToInsert = occurrenceCompletions
          .map((oc) => ({
            ...strip(oc),
            id: ref("completion", oc.id),
            plannerId: ref("planner", oc.plannerId),
            userId,
          }))
          .filter((oc) => oc.plannerId);

        const skipDuplicates = remap;
        const insert = async (
          rows: Row[],
          run: (rows: Row[]) => Promise<{ count: number }>,
        ) => {
          if (rows.length === 0) return;
          const { count } = await run(rows);
          imported += count;
        };

        await insert(locationsToInsert, (rows) =>
          tx.location.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(travelTimesToInsert, (rows) =>
          tx.travelTime.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(categoriesToInsert, (rows) =>
          tx.category.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(windowsToInsert, (rows) =>
          tx.categoryTimeWindow.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(templatesToInsert, (rows) =>
          tx.eventTemplate.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(plannersToInsert, (rows) =>
          tx.planner.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(taskPreferencesToInsert, (rows) =>
          tx.taskPreferences.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(queuesToInsert, (rows) =>
          tx.queue.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(membersToInsert, (rows) =>
          tx.queueMember.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(dependenciesToInsert, (rows) =>
          tx.plannerDependency.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(conversationsToInsert, (rows) =>
          tx.draftConversation.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(sourcesToInsert, (rows) =>
          tx.externalCalendarSource.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(eventsToInsert, (rows) =>
          tx.externalEvent.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(habitBucketsToInsert, (rows) =>
          tx.habitBucket.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(habitsToInsert, (rows) =>
          tx.habit.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(habitItemsToInsert, (rows) =>
          tx.habitItem.createMany({ data: rows as never, skipDuplicates }),
        );
        await insert(completionsToInsert, (rows) =>
          tx.occurrenceCompletion.createMany({
            data: rows as never,
            skipDuplicates,
          }),
        );

        // Single-row, user-unique state: only restored on a full replace so an
        // "add" never clobbers current preferences / view settings.
        if (mode === "replace" && viewState) {
          await tx.userViewState.create({
            data: { ...strip(viewState), userId } as never,
          });
        }
        if (mode === "replace" && preferences) {
          await tx.userSchedulingPreferences.create({
            data: { ...strip(preferences), userId } as never,
          });
        }

        await tx.user.update({
          where: { id: userId },
          data: { dataVersion: { increment: 1 } },
        });
      },
      { timeout: 120000 },
    );

    return { success: true, imported };
  } catch (error) {
    console.error("Failed to import user data:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return {
      success: false,
      error: `Import failed — nothing was changed. Details: ${detail}`,
    };
  }
}
