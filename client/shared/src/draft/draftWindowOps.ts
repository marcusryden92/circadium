import { v4 as uuidv4 } from "uuid";
import type { DraftOpFailure } from "./draftForestOps";
import { isValidStartDay } from "./draftTemplates";
import {
  collectCategorySubtreeIds,
  isValidCategoryColor,
  isValidWindowRange,
  MAX_DRAFT_CATEGORY_NAME_CHARS,
  type DraftCategoryRecord,
  type DraftWindowsState,
} from "./draftWindows";

// Deterministic operations on the assistant's working categories + windows
// state, executed server-side like draftTemplateOps: the model states intent,
// code performs the mutation, and the route emits the full next state
// wholesale. Window ops never reject on overlap — the route runs
// findWindowOverlaps on the result and reports collisions back to the model,
// which is instructed to resolve them.

export interface DraftWindowOpsResult {
  state: DraftWindowsState;
  changed: boolean;
  failures: DraftOpFailure[];
  // Categories whose useTimeWindows was auto-enabled by add_time_windows, so
  // the tool_result can report the side effect.
  autoEnabledCategoryIds: string[];
}

export interface DraftTimeWindowUpdate {
  id: string;
  categoryId?: string;
  day?: number;
  startTime?: string;
  endTime?: string;
}

export interface DraftCategoryUpdate {
  id: string;
  name?: string;
  color?: string | null;
  parentId?: string | null;
  locationId?: string | null;
  useTimeWindows?: boolean;
  isStrict?: boolean;
  confineToOwnWindows?: boolean;
}

const categoryIdSet = (state: DraftWindowsState): Set<string> =>
  new Set(state.categories.map((c) => c.id));

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

function siblingNameTaken(
  categories: DraftCategoryRecord[],
  name: string,
  parentId: string | null,
  excludeId?: string,
): boolean {
  const key = normalizedName(name);
  return categories.some(
    (c) =>
      c.id !== excludeId &&
      (c.parentId ?? null) === parentId &&
      normalizedName(c.name) === key,
  );
}

export function addDraftTimeWindows(
  state: DraftWindowsState,
  items: unknown[],
): DraftWindowOpsResult {
  const windows = [...state.windows];
  const categories = state.categories.map((c) => ({ ...c }));
  const validCategoryIds = categoryIdSet(state);
  const failures: DraftOpFailure[] = [];
  const autoEnabled = new Set<string>();
  let changed = false;

  for (const raw of Array.isArray(items) ? items : []) {
    if (typeof raw !== "object" || raw === null) {
      failures.push({ id: null, reason: "window must be an object" });
      continue;
    }
    const obj = raw as Record<string, unknown>;

    const categoryId =
      typeof obj.categoryId === "string" ? obj.categoryId : "";
    if (!validCategoryIds.has(categoryId)) {
      failures.push({ id: null, reason: "unknown categoryId" });
      continue;
    }
    if (!isValidStartDay(obj.day)) {
      failures.push({
        id: null,
        reason: "day must be an integer 0-6 (0 = Sunday)",
      });
      continue;
    }
    if (!isValidWindowRange(obj.startTime, obj.endTime)) {
      failures.push({
        id: null,
        reason:
          'startTime/endTime must be "HH:MM" (24h) and differ; startTime < endTime is within-day, startTime > endTime is overnight (e.g. "23:00"-"07:00"), "23:59" is end of day',
      });
      continue;
    }

    // New windows are new by definition — any model-supplied id is discarded
    // and a fresh uuid minted (it becomes the DB id at Save).
    windows.push({
      id: uuidv4(),
      categoryId,
      day: obj.day,
      startTime: obj.startTime as string,
      endTime: obj.endTime as string,
    });
    changed = true;

    const category = categories.find((c) => c.id === categoryId);
    if (category && !category.useTimeWindows) {
      category.useTimeWindows = true;
      autoEnabled.add(categoryId);
    }
  }

  return {
    state: { windows, categories },
    changed,
    failures,
    autoEnabledCategoryIds: [...autoEnabled],
  };
}

export function updateDraftTimeWindows(
  state: DraftWindowsState,
  updates: DraftTimeWindowUpdate[],
): DraftWindowOpsResult {
  const windows = state.windows.map((w) => ({ ...w }));
  const validCategoryIds = categoryIdSet(state);
  const failures: DraftOpFailure[] = [];
  let changed = false;

  for (const update of updates) {
    const id = typeof update.id === "string" ? update.id : "";
    const target = windows.find((w) => w.id === id);
    if (!target) {
      failures.push({ id: id || null, reason: "window not found" });
      continue;
    }

    if (update.categoryId !== undefined) {
      if (
        typeof update.categoryId !== "string" ||
        !validCategoryIds.has(update.categoryId)
      ) {
        failures.push({ id, reason: "unknown categoryId" });
        continue;
      }
    }
    if (update.day !== undefined && !isValidStartDay(update.day)) {
      failures.push({ id, reason: "day must be an integer 0-6 (0 = Sunday)" });
      continue;
    }
    // The range rule spans both fields, so validate the patched pair.
    const nextStart = update.startTime ?? target.startTime;
    const nextEnd = update.endTime ?? target.endTime;
    if (
      (update.startTime !== undefined || update.endTime !== undefined) &&
      !isValidWindowRange(nextStart, nextEnd)
    ) {
      failures.push({
        id,
        reason:
          'startTime/endTime must be "HH:MM" (24h) and differ; startTime > endTime makes an overnight window, "23:59" is end of day',
      });
      continue;
    }

    if (update.categoryId !== undefined) target.categoryId = update.categoryId;
    if (update.day !== undefined) target.day = update.day;
    if (update.startTime !== undefined) target.startTime = update.startTime;
    if (update.endTime !== undefined) target.endTime = update.endTime;
    changed = true;
  }

  return {
    state: { windows, categories: state.categories },
    changed,
    failures,
    autoEnabledCategoryIds: [],
  };
}

export function deleteDraftTimeWindows(
  state: DraftWindowsState,
  windowIds: string[],
): DraftWindowOpsResult {
  const ids = [...new Set(windowIds.filter((id) => typeof id === "string"))];
  const failures: DraftOpFailure[] = [];
  const present = new Set(state.windows.map((w) => w.id));

  for (const id of ids) {
    if (!present.has(id)) {
      failures.push({ id, reason: "window not found" });
    }
  }

  const remove = new Set(ids);
  const windows = state.windows.filter((w) => !remove.has(w.id));
  return {
    state: { windows, categories: state.categories },
    changed: windows.length !== state.windows.length,
    failures,
    autoEnabledCategoryIds: [],
  };
}

// Creates categories. Entries are processed in order, so one batch can create
// a parent and then a child under it. Model-supplied ids are discarded — the
// minted uuid becomes the DB id at Save.
export function addDraftCategories(
  state: DraftWindowsState,
  items: unknown[],
  validLocationIds: ReadonlySet<string>,
): DraftWindowOpsResult {
  const categories = state.categories.map((c) => ({ ...c }));
  const failures: DraftOpFailure[] = [];
  let changed = false;

  for (const raw of Array.isArray(items) ? items : []) {
    if (typeof raw !== "object" || raw === null) {
      failures.push({ id: null, reason: "category must be an object" });
      continue;
    }
    const obj = raw as Record<string, unknown>;

    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (name.length === 0 || name.length > MAX_DRAFT_CATEGORY_NAME_CHARS) {
      failures.push({
        id: null,
        reason: `name must be a non-empty string of at most ${MAX_DRAFT_CATEGORY_NAME_CHARS} characters`,
      });
      continue;
    }
    const parentId =
      obj.parentId === undefined || obj.parentId === null
        ? null
        : typeof obj.parentId === "string"
          ? obj.parentId
          : "";
    if (parentId !== null && !categories.some((c) => c.id === parentId)) {
      failures.push({ id: null, reason: `"${name}": unknown parentId` });
      continue;
    }
    if (siblingNameTaken(categories, name, parentId)) {
      failures.push({
        id: null,
        reason: `"${name}" already exists at that level — use the existing category or pick a distinct name`,
      });
      continue;
    }
    const color =
      obj.color === undefined || obj.color === null ? null : obj.color;
    if (color !== null && !isValidCategoryColor(color)) {
      failures.push({
        id: null,
        reason: `"${name}": color must be a 6-digit hex string like "#1976D2"`,
      });
      continue;
    }
    const locationId =
      obj.locationId === undefined || obj.locationId === null
        ? null
        : typeof obj.locationId === "string"
          ? obj.locationId
          : "";
    if (locationId !== null && !validLocationIds.has(locationId)) {
      failures.push({ id: null, reason: `"${name}": unknown locationId` });
      continue;
    }

    categories.push({
      id: uuidv4(),
      name,
      color,
      parentId,
      locationId,
      useTimeWindows: false,
      isStrict: false,
      confineToOwnWindows: false,
    });
    changed = true;
  }

  return {
    state: { windows: state.windows, categories },
    changed,
    failures,
    autoEnabledCategoryIds: [],
  };
}

export function updateDraftCategories(
  state: DraftWindowsState,
  updates: DraftCategoryUpdate[],
  validLocationIds: ReadonlySet<string>,
): DraftWindowOpsResult {
  const categories = state.categories.map((c) => ({ ...c }));
  const failures: DraftOpFailure[] = [];
  let changed = false;

  for (const update of updates) {
    const id = typeof update.id === "string" ? update.id : "";
    const target = categories.find((c) => c.id === id);
    if (!target) {
      failures.push({ id: id || null, reason: "category not found" });
      continue;
    }

    let name: string | undefined;
    if (update.name !== undefined) {
      name = typeof update.name === "string" ? update.name.trim() : "";
      if (
        name.length === 0 ||
        name.length > MAX_DRAFT_CATEGORY_NAME_CHARS
      ) {
        failures.push({
          id,
          reason: `name must be a non-empty string of at most ${MAX_DRAFT_CATEGORY_NAME_CHARS} characters`,
        });
        continue;
      }
    }
    if (
      update.color !== undefined &&
      update.color !== null &&
      !isValidCategoryColor(update.color)
    ) {
      failures.push({
        id,
        reason: 'color must be a 6-digit hex string like "#1976D2" or null',
      });
      continue;
    }
    if (update.parentId !== undefined && update.parentId !== null) {
      if (
        typeof update.parentId !== "string" ||
        !categories.some((c) => c.id === update.parentId)
      ) {
        failures.push({ id, reason: "unknown parentId" });
        continue;
      }
      // Reparenting into the category's own subtree would detach it into a
      // cycle; the subtree includes the category itself, covering self-parent.
      const subtree = collectCategorySubtreeIds(categories, id);
      if (subtree.has(update.parentId)) {
        failures.push({
          id,
          reason: "cannot move a category under itself or its own descendant",
        });
        continue;
      }
    }
    if (
      update.locationId !== undefined &&
      update.locationId !== null &&
      (typeof update.locationId !== "string" ||
        !validLocationIds.has(update.locationId))
    ) {
      failures.push({ id, reason: "unknown locationId" });
      continue;
    }
    const flagKeys = [
      "useTimeWindows",
      "isStrict",
      "confineToOwnWindows",
    ] as const;
    const badFlag = flagKeys.find(
      (key) => update[key] !== undefined && typeof update[key] !== "boolean",
    );
    if (badFlag) {
      failures.push({ id, reason: `${badFlag} must be a boolean` });
      continue;
    }
    const hasAnyField =
      name !== undefined ||
      update.color !== undefined ||
      update.parentId !== undefined ||
      update.locationId !== undefined ||
      flagKeys.some((key) => update[key] !== undefined);
    if (!hasAnyField) {
      failures.push({ id, reason: "no fields to update" });
      continue;
    }
    const nextParentId =
      update.parentId !== undefined ? update.parentId : target.parentId;
    if (
      name !== undefined &&
      siblingNameTaken(categories, name, nextParentId, id)
    ) {
      failures.push({
        id,
        reason: `"${name}" already exists at that level — pick a distinct name`,
      });
      continue;
    }

    if (name !== undefined) target.name = name;
    if (update.color !== undefined) target.color = update.color;
    if (update.parentId !== undefined) target.parentId = update.parentId;
    if (update.locationId !== undefined) target.locationId = update.locationId;
    if (update.useTimeWindows !== undefined) {
      target.useTimeWindows = update.useTimeWindows;
    }
    if (update.isStrict !== undefined) target.isStrict = update.isStrict;
    if (update.confineToOwnWindows !== undefined) {
      target.confineToOwnWindows = update.confineToOwnWindows;
    }
    changed = true;
  }

  return {
    state: { windows: state.windows, categories },
    changed,
    failures,
    autoEnabledCategoryIds: [],
  };
}

// Deletes categories together with their whole subtree (matching the DB's
// parentId cascade) and every window belonging to a deleted category. Items
// filed under them become uncategorized at Save (Planner.categoryId SetNull).
export function deleteDraftCategories(
  state: DraftWindowsState,
  categoryIds: string[],
): DraftWindowOpsResult {
  const ids = [...new Set(categoryIds.filter((id) => typeof id === "string"))];
  const failures: DraftOpFailure[] = [];
  const present = new Set(state.categories.map((c) => c.id));

  const remove = new Set<string>();
  for (const id of ids) {
    if (!present.has(id)) {
      failures.push({ id, reason: "category not found" });
      continue;
    }
    for (const member of collectCategorySubtreeIds(state.categories, id)) {
      remove.add(member);
    }
  }

  const categories = state.categories.filter((c) => !remove.has(c.id));
  const windows = state.windows.filter((w) => !remove.has(w.categoryId));
  return {
    state: { windows, categories },
    changed: categories.length !== state.categories.length,
    failures,
    autoEnabledCategoryIds: [],
  };
}
