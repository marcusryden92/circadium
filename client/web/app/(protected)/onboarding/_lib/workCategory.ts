import { v4 as uuidv4 } from "uuid";
import type { Category, CategoryTimeWindow } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import type { WorkInput } from "./weekTemplates";

// Work hours are modelled as time windows on a "Work" category nested under the
// "Professional" role — not as blocking templates. That way the engine
// schedules work tasks into those hours instead of treating work as a fixed
// event. "Professional" matches the Covey role preset so the Week step reuses
// that role instead of minting a stray one.
const PROFESSIONAL_ROLE_NAME = "Professional";
const WORK_NAME = "Work";
const PROFESSIONAL_COLOR = "#3b82f6";
const END_OF_DAY = "23:59";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// One window per picked day, split at midnight for the rare overnight shift so
// every row stays within a single day (WeekStructureModal can't render an
// overnight window; the "23:59" end mirrors the assistant's sentinel). The
// post-midnight piece belongs to the FOLLOWING day.
function buildWorkWindows(
  work: WorkInput,
  categoryId: string,
  userId: string,
): CategoryTimeWindow[] {
  const startMin = toMinutes(work.start);
  const endMin = toMinutes(work.end);
  const windows: CategoryTimeWindow[] = [];
  for (const day of work.days) {
    if (endMin > startMin) {
      windows.push({
        id: uuidv4(),
        day,
        startTime: work.start,
        endTime: work.end,
        recurrenceExceptions: null,
        categoryId,
        userId,
      });
      continue;
    }
    windows.push({
      id: uuidv4(),
      day,
      startTime: work.start,
      endTime: END_OF_DAY,
      recurrenceExceptions: null,
      categoryId,
      userId,
    });
    if (endMin > 0) {
      windows.push({
        id: uuidv4(),
        day: ((day + 1) % 7) as WeekDayIntegers,
        startTime: "00:00",
        endTime: work.end,
        recurrenceExceptions: null,
        categoryId,
        userId,
      });
    }
  }
  return windows;
}

// Ensures a Professional role and a Work sub-category exist, rebuilding the
// Work category's windows from the form. Find-by-name/parent keeps it
// idempotent across Back/forward re-commits — the windows are replaced
// wholesale, never stacked. Returns prev unchanged when there are no work hours
// to apply.
export function applyWorkCategory(
  prev: Category[],
  work: WorkInput | null,
  userId: string,
  nowIso: string,
): Category[] {
  if (!work || work.days.length === 0) return prev;

  const next = [...prev];

  let roleIdx = next.findIndex(
    (c) =>
      !c.parentId &&
      c.name.trim().toLowerCase() === PROFESSIONAL_ROLE_NAME.toLowerCase(),
  );
  if (roleIdx === -1) {
    next.push({
      id: uuidv4(),
      name: PROFESSIONAL_ROLE_NAME,
      icon: null,
      color: PROFESSIONAL_COLOR,
      sortOrder: next.length,
      useTimeWindows: false,
      isStrict: false,
      confineToOwnWindows: false,
      locationId: null,
      parentId: null,
      userId,
      timeSlots: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    roleIdx = next.length - 1;
  }
  const roleId = next[roleIdx].id;

  const workIdx = next.findIndex(
    (c) =>
      c.parentId === roleId &&
      c.name.trim().toLowerCase() === WORK_NAME.toLowerCase(),
  );
  if (workIdx === -1) {
    const workId = uuidv4();
    next.push({
      id: workId,
      name: WORK_NAME,
      icon: null,
      color: null,
      sortOrder: next.filter((c) => c.parentId === roleId).length,
      useTimeWindows: true,
      isStrict: false,
      confineToOwnWindows: false,
      locationId: work.locationId ?? null,
      parentId: roleId,
      userId,
      timeSlots: buildWorkWindows(work, workId, userId),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    const workId = next[workIdx].id;
    next[workIdx] = {
      ...next[workIdx],
      useTimeWindows: true,
      locationId: work.locationId ?? null,
      timeSlots: buildWorkWindows(work, workId, userId),
      updatedAt: nowIso,
    };
  }

  return next;
}

// The inverse of applyWorkCategory for the off-toggle: when the user disables
// work hours after a commit, the windows this flow put on the Work category are
// cleared instead of lingering. Only called when the flow actually applied work
// windows (the weekWorkApplied progress flag), so a pre-existing Work category
// the flow never touched is never stripped.
export function clearWorkCategoryWindows(
  prev: Category[],
  nowIso: string,
): Category[] {
  const role = prev.find(
    (c) =>
      !c.parentId &&
      c.name.trim().toLowerCase() === PROFESSIONAL_ROLE_NAME.toLowerCase(),
  );
  if (!role) return prev;
  const workIdx = prev.findIndex(
    (c) =>
      c.parentId === role.id &&
      c.name.trim().toLowerCase() === WORK_NAME.toLowerCase(),
  );
  if (workIdx === -1) return prev;
  const work = prev[workIdx];
  if (work.timeSlots.length === 0 && !work.useTimeWindows) return prev;
  const next = [...prev];
  next[workIdx] = {
    ...work,
    useTimeWindows: false,
    timeSlots: [],
    updatedAt: nowIso,
  };
  return next;
}
