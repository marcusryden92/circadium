import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteGoal,
  getGoalTree,
  getTaskTreeIds,
} from "@/utils/goalPageHandlers";
import { toggleGoalIsReady } from "@/utils/goal-handlers/toggleGoalIsReady";
import { assignCategoryToSubtrees } from "@/utils/plannerBulkActions";
import { historyMessages } from "@/utils/historyMessages";
import type { Planner, Category } from "@/types/prisma";

type UpdatePlannerArrayFn = (
  planner: Planner[] | ((prev: Planner[]) => Planner[]),
  label: string,
) => void;

// Friendly names for the fields handleUpdateField reaches, so undo toasts
// speak plain language instead of column names.
const FIELD_LABELS: Partial<Record<keyof Planner, string>> = {
  starts: "start time",
  deadline: "deadline",
  duration: "duration",
  priority: "priority",
  plannerType: "type",
  recurrence: "repeat rule",
  recurrenceExceptions: "occurrence exceptions",
  allowedTimes: "allowed times",
  earliestStartDate: "earliest start",
  maxMinutesPerDay: "daily limit",
  splitting: "splitting",
  notes: "notes",
  useParentLocation: "location inheritance",
  completedStartTime: "completion time",
  completedEndTime: "completion time",
};

export function useItemHandlers(
  item: Planner | undefined,
  planner: Planner[],
  updatePlannerArray: UpdatePlannerArrayFn,
  updateAll: () => void,
  categoryHasLocation: boolean = false,
  categories: Category[] = [],
) {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetLocationsConfirm, setShowResetLocationsConfirm] =
    useState(false);
  const [locationOverrideEnabled, setLocationOverrideEnabled] = useState(
    () => !categoryHasLocation || !item?.useParentLocation,
  );

  const handleSaveTitle = useCallback(
    (newTitle: string) => {
      if (!item || !newTitle.trim()) return;
      updatePlannerArray(
        (prev: Planner[]) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  title: newTitle.trim(),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        historyMessages.item.rename(newTitle.trim()),
      );
    },
    [item, updatePlannerArray],
  );

  const handleDelete = useCallback(() => {
    if (!item) return;
    deleteGoal({ updateAll, taskId: item.id, title: item.title });
    router.push("/items");
  }, [item, updateAll, router]);

  const handleToggleReady = useCallback(() => {
    if (!item) return;
    toggleGoalIsReady(
      updatePlannerArray,
      item.id,
      historyMessages.item.ready(item.title, !item.isReady),
    );
  }, [item, updatePlannerArray]);

  const handleUpdateField = useCallback(
    (field: keyof Planner, value: unknown) => {
      if (!item) return;
      updatePlannerArray(
        (prev: Planner[]) =>
          prev.map((p) =>
            p.id === item.id
              ? { ...p, [field]: value, updatedAt: new Date().toISOString() }
              : p,
          ),
        historyMessages.item.field(FIELD_LABELS[field] ?? field, item.title),
      );
    },
    [item, updatePlannerArray],
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!item) return;
      // A goal and its subtasks read as one block on the calendar, so recolor
      // the whole subtree, not just this row.
      const treeIds = new Set(getTaskTreeIds(planner, item.id));
      updatePlannerArray(
        (prev: Planner[]) =>
          prev.map((p) =>
            treeIds.has(p.id)
              ? { ...p, color, updatedAt: new Date().toISOString() }
              : p,
          ),
        historyMessages.item.field("color", item.title),
      );
    },
    [item, planner, updatePlannerArray],
  );

  const handleDateChange = useCallback(
    (date: Date | undefined) => {
      if (!item) return;
      if (item.plannerType === "plan") {
        handleUpdateField("starts", date?.toISOString() ?? null);
      } else {
        handleUpdateField("deadline", date?.toISOString() ?? null);
      }
    },
    [item, handleUpdateField],
  );

  const handleCategoryChange = useCallback(
    (categoryId: string | null) => {
      if (!item) return;

      const newCategoryHasLocation = categoryId
        ? !!categories.find((c) => c.id === categoryId)?.locationId
        : false;

      updatePlannerArray(
        (prev: Planner[]) =>
          assignCategoryToSubtrees(
            prev,
            [item.id],
            categoryId,
            newCategoryHasLocation,
          ),
        historyMessages.item.field("category", item.title),
      );
      updateAll();
    },
    [item, categories, updatePlannerArray, updateAll],
  );

  // No cascade prompt: subtasks default to inheriting via the parent-chain
  // walk, so a root change flows down by itself; deliberate child overrides
  // are left alone ("Reset sub-goal places" is the explicit tree-wide reset).
  //
  // Picking a location from the item's own picker is an explicit choice, so it
  // must also stop inheriting from the category (clear useParentLocation) —
  // otherwise the engine keeps ignoring this locationId (useParentLocation
  // wins in resolveLocation) and the item schedules location-less.
  const handleLocationChange = useCallback(
    (locationId: string | null) => {
      if (!item) return;
      updatePlannerArray(
        (prev: Planner[]) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  locationId,
                  useParentLocation: false,
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        historyMessages.item.field("location", item.title),
      );
    },
    [item, updatePlannerArray],
  );

  const handleToggleLocationOverride = useCallback(() => {
    if (!item || !categoryHasLocation) return;

    const newOverrideEnabled = !locationOverrideEnabled;
    handleUpdateField("useParentLocation", !newOverrideEnabled);
    setLocationOverrideEnabled(newOverrideEnabled);
  }, [item, categoryHasLocation, locationOverrideEnabled, handleUpdateField]);

  const confirmResetSubgoalLocations = useCallback(() => {
    if (!item) return;

    const treeIds = getGoalTree(planner, item.id).map((i) => i.id);

    updatePlannerArray(
      (prev) =>
        prev.map((p) =>
          treeIds.includes(p.id) ? { ...p, useParentLocation: true } : p,
        ),
      historyMessages.item.field("sub-item locations", item.title),
    );
    setLocationOverrideEnabled(false);
    setShowResetLocationsConfirm(false);
  }, [item, planner, updatePlannerArray]);

  return {
    showDeleteConfirm,
    setShowDeleteConfirm,
    locationOverrideEnabled,
    handleSaveTitle,
    handleDelete,
    handleToggleReady,
    handleUpdateField,
    handleColorChange,
    handleDateChange,
    handleCategoryChange,
    handleLocationChange,
    handleToggleLocationOverride,
    showResetLocationsConfirm,
    setShowResetLocationsConfirm,
    confirmResetSubgoalLocations,
  };
}
