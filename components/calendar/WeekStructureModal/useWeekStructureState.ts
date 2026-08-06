import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { v4 as uuidv4 } from "uuid";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { EventTemplate, CategoryTimeWindow } from "@/types/prisma";
import type { AppDispatch } from "@/redux/store";
import {
  upsertTemplate,
  removeTemplate,
  upsertCategory,
  upsertTimeWindow,
  removeTimeWindow,
  recordHistory,
} from "@/redux/slices/calendarSourceSlice";
import { startDayAsInt } from "./eventSerializers";
import { historyMessages } from "@/utils/historyMessages";
import type { WorkingWindow } from "./timeWindow";

interface UseWeekStructureStateArgs {
  open: boolean;
  onClose: () => void;
}

export function useWeekStructureState({
  open,
  onClose,
}: UseWeekStructureStateArgs) {
  const dispatch = useDispatch<AppDispatch>();
  const { template, categories, updateAll } = useCalendarProvider();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tplsInitial, setTplsInitial] = useState<EventTemplate[]>([]);
  const [tplsWorking, setTplsWorking] = useState<EventTemplate[]>([]);
  const [winsInitial, setWinsInitial] = useState<WorkingWindow[]>([]);
  const [winsWorking, setWinsWorking] = useState<WorkingWindow[]>([]);

  // Everything comes from Redux — templates directly, windows nested inside
  // each category's timeSlots. No server fetch needed on open.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setTplsInitial(template);
    setTplsWorking(template);
    const initialWindows: WorkingWindow[] = categories.flatMap((c) =>
      c.timeSlots.map((ts) => ({
        id: ts.id,
        day: ts.day,
        startTime: ts.startTime,
        endTime: ts.endTime,
        categoryId: c.id,
        recurrenceExceptions: ts.recurrenceExceptions ?? null,
      })),
    );
    setWinsInitial(initialWindows);
    setWinsWorking(initialWindows);
  }, [open, template, categories]);

  const changeCount = useMemo(() => {
    const sig = (t: EventTemplate) =>
      JSON.stringify([
        t.id,
        t.title,
        startDayAsInt(t),
        t.startTime,
        t.duration,
        t.color,
        t.locationId ?? null,
        t.recurrenceExceptions ?? null,
      ]);
    const tplSet = new Set(tplsInitial.map(sig));
    let n = 0;
    for (const t of tplsWorking) if (!tplSet.has(sig(t))) n++;
    for (const t of tplsInitial)
      if (!tplsWorking.find((w) => w.id === t.id)) n++;
    const wsig = (w: WorkingWindow) =>
      JSON.stringify([
        w.id,
        w.day,
        w.startTime,
        w.endTime,
        w.categoryId,
        w.recurrenceExceptions ?? null,
      ]);
    const winSet = new Set(winsInitial.map(wsig));
    for (const w of winsWorking) if (!winSet.has(wsig(w))) n++;
    for (const w of winsInitial)
      if (!winsWorking.find((x) => x.id === w.id)) n++;
    return n;
  }, [tplsInitial, tplsWorking, winsInitial, winsWorking]);

  const saveAll = () => {
    setSaving(true);
    setError(null);
    try {
      // One undo entry for the whole save — never per granular dispatch, or a
      // single Save would fragment into several undo steps.
      if (changeCount > 0)
        dispatch(recordHistory({ label: historyMessages.weekStructure.save }));
      // Window diff via Redux. Unassigned drafts (categoryId === null) are
      // dropped here — they're UI-only and never persisted. Lookups against
      // `categories` recover the userId, which the slice needs but the
      // WorkingWindow shape doesn't carry.
      const initialMap = new Map(winsInitial.map((w) => [w.id, w]));
      const workingIds = new Set(winsWorking.map((w) => w.id));
      const ownerLookup = new Map<string, CategoryTimeWindow>();
      for (const c of categories) {
        for (const ts of c.timeSlots) ownerLookup.set(ts.id, ts);
      }

      // Drawing a window for a category implies you want the engine to use it,
      // so auto-enable useTimeWindows for any category that GAINS a window this
      // save (added or reassigned into it) — not merely any category that has
      // one, so an unrelated save can't re-enable a category the user turned
      // off. Flip before the window writes (which mutate the same category's
      // timeSlots — enabling first avoids clobbering them); the updatedAt bump
      // is what lets the category diff carry the flag change.
      const now = new Date().toISOString();
      const categoriesGainingWindows = new Set<string>();
      for (const w of winsWorking) {
        if (!w.categoryId) continue;
        const before = initialMap.get(w.id);
        if (!before || before.categoryId !== w.categoryId) {
          categoriesGainingWindows.add(w.categoryId);
        }
      }
      for (const c of categories) {
        if (categoriesGainingWindows.has(c.id) && !c.useTimeWindows) {
          dispatch(upsertCategory({ ...c, useTimeWindows: true, updatedAt: now }));
        }
      }

      for (const w of winsInitial) {
        if (!workingIds.has(w.id)) {
          dispatch(removeTimeWindow(w.id));
        }
      }
      const persistedWindows: WorkingWindow[] = [];
      for (const w of winsWorking) {
        if (w.categoryId === null) continue;
        const isNew = w.id.startsWith("tmp-");
        const id = isNew ? uuidv4() : w.id;
        const existing = isNew ? null : ownerLookup.get(w.id);
        const orig = initialMap.get(w.id);
        const unchanged =
          !isNew &&
          orig &&
          orig.day === w.day &&
          orig.startTime === w.startTime &&
          orig.endTime === w.endTime &&
          orig.categoryId === w.categoryId &&
          (orig.recurrenceExceptions ?? null) ===
            (w.recurrenceExceptions ?? null);
        if (!unchanged) {
          const payload: CategoryTimeWindow = {
            id,
            day: w.day,
            startTime: w.startTime,
            endTime: w.endTime,
            categoryId: w.categoryId,
            recurrenceExceptions: w.recurrenceExceptions ?? null,
            userId: existing?.userId ?? "",
          };
          dispatch(upsertTimeWindow(payload));
        }
        persistedWindows.push({ ...w, id });
      }
      setWinsInitial(persistedWindows);
      setWinsWorking(persistedWindows);

      // Template diff via Redux. tmp- ids are swapped for real uuids so the
      // sync layer treats them as creates.
      const workingTplIds = new Set(tplsWorking.map((t) => t.id));
      for (const t of tplsInitial) {
        if (!workingTplIds.has(t.id)) {
          dispatch(removeTemplate(t.id));
        }
      }
      const initialTplMap = new Map(tplsInitial.map((t) => [t.id, t]));
      const stamped: EventTemplate[] = tplsWorking.map((t) => {
        if (t.id.startsWith("tmp-")) {
          const { id: _stripped, ...rest } = t;
          const created = { ...rest, id: uuidv4() } as EventTemplate;
          dispatch(upsertTemplate(created));
          return created;
        }
        const prev = initialTplMap.get(t.id);
        const tplUnchanged =
          prev &&
          prev.title === t.title &&
          startDayAsInt(prev) === startDayAsInt(t) &&
          prev.startTime === t.startTime &&
          prev.duration === t.duration &&
          prev.color === t.color &&
          (prev.locationId ?? null) === (t.locationId ?? null) &&
          (prev.recurrenceExceptions ?? null) ===
            (t.recurrenceExceptions ?? null);
        if (!tplUnchanged) dispatch(upsertTemplate(t));
        return t;
      });
      setTplsInitial(stamped);
      setTplsWorking(stamped);

      // The dispatches above don't run the engine; regen once off the updated
      // state (the thunk reads getState() fresh, so it sees them).
      if (changeCount > 0) updateAll();

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return {
    saving,
    error,
    setError,
    tplsWorking,
    setTplsWorking,
    winsWorking,
    setWinsWorking,
    changeCount,
    saveAll,
  };
}
