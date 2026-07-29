import { format } from "date-fns";
import type { Planner } from "@/types/prisma";
import { PlannerType } from "@/types/prisma";
import {
  isRecurrenceOccurrenceId,
  plannerHasFlexibleRecurrence,
} from "@/utils/planRecurrence";

// Task splitting: a task row with non-null `splitting` is placed by the engine
// as dynamically sized chunks instead of one block. Chunk sizes are decided at
// placement time from the slot the scheduler picked — bounded by
// minMinutes/maxMinutes and the per-day cap — so chunk boundaries legitimately
// reshuffle between regens. Completion is per-chunk: each completed chunk
// persists as a CompletedSegment on the row, completed minutes are always
// derived by summing segments, and the engine schedules only the remainder.
//
// Chunk identity mirrors recurring-plan occurrences (utils/planRecurrence.ts):
// scheduled chunks get `${plannerId}|chunk:${n}` (ordinal within the regen),
// completed segments get `${plannerId}|done:${segment.start}` (stable forever).
// plannerIdFromEventId resolves both back to the row.

export interface TaskSplittingSettings {
  minMinutes: number;
  maxMinutes: number;
  maxMinutesPerDay: number | null;
  // Minimum break the engine keeps between consecutive chunks of this task
  // (and after its latest completed segment). null/absent = no forced gap,
  // chunks sit only the standard placement buffer apart.
  minSpacingMinutes?: number | null;
}

export interface CompletedSegment {
  start: string;
  end: string;
}

// Mirrors SCHEDULING_CONFIG.MIN_SLOT_SIZE — the smallest slot the engine's
// geometry helpers preserve; a chunk below it could never be placed.
export const MIN_CHUNK_MINUTES = 5;

// maxMinutes 0 is the "no upper bound" sentinel (a real 0-minute chunk is
// meaningless): chunks are bounded below by minMinutes only and grow to fill
// whatever headroom the selected slot offers.
export const SPLIT_MAX_UNLIMITED = 0;

export function splitMaxIsUnlimited(settings: TaskSplittingSettings): boolean {
  return settings.maxMinutes === SPLIT_MAX_UNLIMITED;
}

export function effectiveMaxChunkMinutes(
  settings: TaskSplittingSettings,
): number {
  return splitMaxIsUnlimited(settings) ? Infinity : settings.maxMinutes;
}

const CHUNK_ID_MARKER = "|chunk:";
const SEGMENT_ID_MARKER = "|done:";

// Object-level validation shared by the JSON parser and callers holding an
// already-parsed candidate (the AI draft ops). Returns null when the shape
// is not a usable settings object.
export function normalizeTaskSplittingSettings(
  value: unknown,
): TaskSplittingSettings | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<TaskSplittingSettings>;
  const min =
    typeof parsed.minMinutes === "number" &&
    parsed.minMinutes >= MIN_CHUNK_MINUTES
      ? Math.floor(parsed.minMinutes)
      : null;
  const max =
    typeof parsed.maxMinutes === "number"
      ? Math.floor(parsed.maxMinutes)
      : null;
  if (min === null || max === null) return null;
  if (max !== SPLIT_MAX_UNLIMITED && max < min) return null;
  const perDay =
    typeof parsed.maxMinutesPerDay === "number" && parsed.maxMinutesPerDay > 0
      ? Math.max(Math.floor(parsed.maxMinutesPerDay), min)
      : null;
  const spacing =
    typeof parsed.minSpacingMinutes === "number" && parsed.minSpacingMinutes > 0
      ? Math.floor(parsed.minSpacingMinutes)
      : null;
  return {
    minMinutes: min,
    maxMinutes: max,
    maxMinutesPerDay: perDay,
    minSpacingMinutes: spacing,
  };
}

export function parseTaskSplitting(
  value: string | null | undefined,
): TaskSplittingSettings | null {
  if (!value) return null;
  try {
    return normalizeTaskSplittingSettings(JSON.parse(value));
  } catch {
    return null;
  }
}

export function serializeTaskSplitting(
  settings: TaskSplittingSettings,
): string {
  return JSON.stringify({
    minMinutes: settings.minMinutes,
    maxMinutes: settings.maxMinutes,
    maxMinutesPerDay: settings.maxMinutesPerDay ?? null,
    // Omit when unset so existing rows serialize byte-identically (no sync churn).
    ...(settings.minSpacingMinutes
      ? { minSpacingMinutes: settings.minSpacingMinutes }
      : {}),
  });
}

export function parseCompletedSegments(
  value: string | null | undefined,
): CompletedSegment[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CompletedSegment => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as { start?: unknown; end?: unknown };
      return (
        typeof candidate.start === "string" &&
        typeof candidate.end === "string" &&
        !isNaN(new Date(candidate.start).getTime()) &&
        !isNaN(new Date(candidate.end).getTime()) &&
        new Date(candidate.end).getTime() > new Date(candidate.start).getTime()
      );
    });
  } catch {
    return [];
  }
}

export function serializeCompletedSegments(
  segments: CompletedSegment[],
): string | null {
  return segments.length
    ? JSON.stringify(segments.map((s) => ({ start: s.start, end: s.end })))
    : null;
}

// Splitting never applies to plans (fixed anchors), flexibly recurring rows,
// or recurrence-occurrence clones (both reuse the splitting column to store
// min/max bounds for a single flexible occurrence block, placed by the
// occurrence path — never the multi-chunk loop). Goal-typed rows are allowed
// because goal subtree leaves are goal-typed (see addSubtask) and leaves are
// exactly what the scheduler places — a parent container with splitting set
// is inert since only bottom-layer leaves ever schedule.
export function taskIsSplittable(item: Planner): boolean {
  if (
    item.plannerType === PlannerType.plan ||
    plannerHasFlexibleRecurrence(item) ||
    isRecurrenceOccurrenceId(item.id)
  ) {
    return false;
  }
  return parseTaskSplitting(item.splitting) !== null;
}

export function segmentMinutes(segment: CompletedSegment): number {
  return Math.round(
    (new Date(segment.end).getTime() - new Date(segment.start).getTime()) /
      60000,
  );
}

export function splitCompletedMinutes(item: Planner): number {
  return parseCompletedSegments(item.completedSegments).reduce(
    (sum, s) => sum + segmentMinutes(s),
    0,
  );
}

export function splitRemainingMinutes(item: Planner): number {
  return Math.max(0, item.duration - splitCompletedMinutes(item));
}

// Direct edit of a split task's completed total (item-detail progress bar).
// Segments stay the source of truth: raising the total appends a synthetic
// segment ending at `now`, lowering it trims from the most recent segment
// backward. Returns the serialized segments (null when empty); returns the
// row's value untouched when the target already matches, so an idle commit
// produces no sync diff.
export function setSplitCompletedMinutes(
  item: Planner,
  targetMinutes: number,
  now: Date,
): string | null {
  const target = Math.min(
    Math.max(0, Math.round(targetMinutes)),
    Math.max(0, item.duration),
  );
  const segments = parseCompletedSegments(item.completedSegments);
  const current = segments.reduce((sum, s) => sum + segmentMinutes(s), 0);
  if (target === current) return item.completedSegments ?? null;

  if (target > current) {
    const delta = target - current;
    const end = now.toISOString();
    const start = new Date(now.getTime() - delta * 60000).toISOString();
    return serializeCompletedSegments([...segments, { start, end }]);
  }

  const newestFirst = [...segments].sort((a, b) =>
    b.start.localeCompare(a.start),
  );
  let excess = current - target;
  const dropped = new Set<CompletedSegment>();
  const trimmed = new Map<CompletedSegment, CompletedSegment>();
  for (const segment of newestFirst) {
    if (excess <= 0) break;
    const minutes = segmentMinutes(segment);
    if (minutes <= excess) {
      dropped.add(segment);
      excess -= minutes;
    } else {
      trimmed.set(segment, {
        start: segment.start,
        end: new Date(
          new Date(segment.end).getTime() - excess * 60000,
        ).toISOString(),
      });
      excess = 0;
    }
  }
  return serializeCompletedSegments(
    segments.filter((s) => !dropped.has(s)).map((s) => trimmed.get(s) ?? s),
  );
}

// Auto-completion: a split task with all its minutes accumulated is done.
// Callers combine this with the timestamp check (plannerIsCompleted).
export function splitIsExhausted(item: Planner): boolean {
  if (!taskIsSplittable(item)) return false;
  return item.duration > 0 && splitRemainingMinutes(item) <= 0;
}

export function chunkEventId(plannerId: string, ordinal: number): string {
  return `${plannerId}${CHUNK_ID_MARKER}${ordinal}`;
}

export function completedSegmentEventId(
  plannerId: string,
  segment: CompletedSegment,
): string {
  return `${plannerId}${SEGMENT_ID_MARKER}${segment.start}`;
}

export function isChunkEventId(eventId: string): boolean {
  return eventId.includes(CHUNK_ID_MARKER);
}

export function isCompletedSegmentEventId(eventId: string): boolean {
  return eventId.includes(SEGMENT_ID_MARKER);
}

export function isSplitEventId(eventId: string): boolean {
  return isChunkEventId(eventId) || isCompletedSegmentEventId(eventId);
}

export function segmentStartFromEventId(eventId: string): string | null {
  const idx = eventId.indexOf(SEGMENT_ID_MARKER);
  return idx === -1 ? null : eventId.slice(idx + SEGMENT_ID_MARKER.length);
}

// The carving invariant: after every chunk, what remains is either zero or
// still schedulable (>= minMinutes). A remainder below 2*min therefore cannot
// be split — the only valid chunk is the whole remainder.
export function minChunkRequired(
  remaining: number,
  settings: TaskSplittingSettings,
): number {
  if (remaining <= 0) return 0;
  return remaining < settings.minMinutes * 2 ? remaining : settings.minMinutes;
}

// Grant the largest valid chunk for a slot with `headroom` usable minutes.
// Returns 0 when no valid chunk fits (slot too small for the required
// minimum, or the day budget can't host one). `maxOverride` lets the
// compromise ladder relax the max-chunk bound (relaxed = remaining).
export function grantChunkMinutes(args: {
  remaining: number;
  headroom: number;
  settings: TaskSplittingSettings;
  dayBudget?: number;
  maxOverride?: number;
}): number {
  const { remaining, headroom, settings } = args;
  if (remaining <= 0) return 0;
  const minRequired = minChunkRequired(remaining, settings);
  const maxBound = args.maxOverride ?? effectiveMaxChunkMinutes(settings);
  let granted = Math.min(
    headroom,
    maxBound,
    remaining,
    args.dayBudget ?? Infinity,
  );
  const leftover = remaining - granted;
  if (leftover > 0 && leftover < settings.minMinutes) {
    granted = remaining - settings.minMinutes;
  }
  return granted >= minRequired ? granted : 0;
}

export function dayKeyLocal(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Attributes an interval's minutes to local day keys, splitting at midnight
// so a chunk or segment straddling days charges each day's budget correctly.
export function addIntervalMinutesByDay(
  map: Map<string, number>,
  start: Date,
  end: Date,
): void {
  let cursor = start;
  while (cursor < end) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setHours(24, 0, 0, 0);
    const sliceEnd = nextMidnight < end ? nextMidnight : end;
    const key = dayKeyLocal(cursor);
    const minutes = Math.round((sliceEnd.getTime() - cursor.getTime()) / 60000);
    map.set(key, (map.get(key) ?? 0) + minutes);
    cursor = sliceEnd;
  }
}

// Per-day minutes already consumed by completed segments — seeds the engine's
// day-cap accounting so "already read 90 min today" counts against the cap.
export function completedMinutesByDay(item: Planner): Map<string, number> {
  const map = new Map<string, number>();
  for (const segment of parseCompletedSegments(item.completedSegments)) {
    addIntervalMinutesByDay(
      map,
      new Date(segment.start),
      new Date(segment.end),
    );
  }
  return map;
}
