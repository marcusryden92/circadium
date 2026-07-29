import { addDays, addMonths, addWeeks, addMinutes, format } from "date-fns";
import type { Planner } from "@/types/prisma";

// Recurring plans: a plan row with a non-null `recurrence` expands into one
// concrete occurrence event per repetition (materialized by buildPlanEvents,
// CategoryEvent-style). Occurrences are identified by the occurrence KEY —
// the local wall-clock start the rule dictates ("yyyy-MM-dd'T'HH:mm") — which
// stays stable when an occurrence is moved by exception, and by the composite
// event id `${planId}|${key}`. Exceptions live on the plan row as JSON and
// are keyed by that original key.

export type PlanRecurrenceFreq = "daily" | "weekly" | "monthly";

export interface PlanRecurrenceRule {
  freq: PlanRecurrenceFreq;
  interval: number;
  until?: string | null;
}

// A "moved" exception customizes a single occurrence: `newStart` is its
// wall-clock start (equal to the rule position when only the duration changed),
// and the optional `durationMinutes` overrides the entity's own duration for a
// per-occurrence resize. Absent duration means "inherit the series length".
export type PlanOccurrenceException =
  | { key: string; type: "moved"; newStart: string; durationMinutes?: number }
  | { key: string; type: "deleted" };

type MovedException = Extract<PlanOccurrenceException, { type: "moved" }>;

export interface PlanOccurrence {
  key: string;
  start: Date;
  end: Date;
  moved: boolean;
}

// Expansion is bounded: occurrences materialize from `starts` up to
// currentDate + this window (or `until`, whichever is earlier), hard-capped
// so a malformed rule can never balloon a regen. The cap must comfortably
// exceed window days + realistic anchor age for a daily rule, or future
// occurrences silently truncate.
export const PLAN_RECURRENCE_WINDOW_DAYS = 365;
export const MAX_PLAN_OCCURRENCES = 1500;

const OCCURRENCE_ID_SEPARATOR = "|";
const VALID_FREQS: PlanRecurrenceFreq[] = ["daily", "weekly", "monthly"];

export function parsePlanRecurrence(
  value: string | null | undefined,
): PlanRecurrenceRule | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PlanRecurrenceRule>;
    if (!parsed || !VALID_FREQS.includes(parsed.freq as PlanRecurrenceFreq)) {
      return null;
    }
    const interval =
      typeof parsed.interval === "number" && parsed.interval >= 1
        ? Math.floor(parsed.interval)
        : 1;
    const until =
      typeof parsed.until === "string" && !isNaN(new Date(parsed.until).getTime())
        ? parsed.until
        : null;
    return { freq: parsed.freq as PlanRecurrenceFreq, interval, until };
  } catch {
    return null;
  }
}

export function serializePlanRecurrence(rule: PlanRecurrenceRule): string {
  return JSON.stringify({
    freq: rule.freq,
    interval: rule.interval,
    until: rule.until ?? null,
  });
}

export function parseRecurrenceExceptions(
  value: string | null | undefined,
): PlanOccurrenceException[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const result: PlanOccurrenceException[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as {
        key?: unknown;
        type?: unknown;
        newStart?: unknown;
        durationMinutes?: unknown;
      };
      if (typeof candidate.key !== "string") continue;
      if (candidate.type === "deleted") {
        result.push({ key: candidate.key, type: "deleted" });
        continue;
      }
      if (
        candidate.type === "moved" &&
        typeof candidate.newStart === "string" &&
        !isNaN(new Date(candidate.newStart).getTime())
      ) {
        const moved: MovedException = {
          key: candidate.key,
          type: "moved",
          newStart: candidate.newStart,
        };
        if (
          typeof candidate.durationMinutes === "number" &&
          candidate.durationMinutes > 0
        ) {
          moved.durationMinutes = candidate.durationMinutes;
        }
        result.push(moved);
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function serializeRecurrenceExceptions(
  exceptions: PlanOccurrenceException[],
): string | null {
  return exceptions.length ? JSON.stringify(exceptions) : null;
}

export function occurrenceKey(start: Date): string {
  return format(start, "yyyy-MM-dd'T'HH:mm");
}

export function occurrenceKeyToDate(key: string): Date {
  return new Date(key);
}

export function occurrenceEventId(planId: string, key: string): string {
  return `${planId}${OCCURRENCE_ID_SEPARATOR}${key}`;
}

export function isOccurrenceEventId(eventId: string): boolean {
  return eventId.includes(OCCURRENCE_ID_SEPARATOR);
}

// Identity function for plain planner-event ids — safe on every event id.
export function plannerIdFromEventId(eventId: string): string {
  const separatorIndex = eventId.indexOf(OCCURRENCE_ID_SEPARATOR);
  return separatorIndex === -1 ? eventId : eventId.slice(0, separatorIndex);
}

export function occurrenceKeyFromEventId(eventId: string): string | null {
  const separatorIndex = eventId.indexOf(OCCURRENCE_ID_SEPARATOR);
  return separatorIndex === -1 ? null : eventId.slice(separatorIndex + 1);
}

export function planIsRecurring(plan: Planner): boolean {
  return parsePlanRecurrence(plan.recurrence) !== null;
}

// Strict occurrence-id test: `${plannerId}|${occurrenceKey}` where the suffix
// is exactly the local wall-clock key occurrenceKey() mints. Chunk ids
// (`|chunk:n`) and completed-segment ids (`|done:<iso>`) also contain the
// separator, so sites classifying pool leaves or events by "is this a
// recurrence occurrence" must use this, never bare isOccurrenceEventId.
const OCCURRENCE_KEY_SUFFIX = /\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isRecurrenceOccurrenceId(eventId: string): boolean {
  return OCCURRENCE_KEY_SUFFIX.test(eventId);
}

// A task or goal with a parseable recurrence rule schedules as one flexibly
// placed occurrence per period (the retired habit type's model) instead of as
// a single block. Root-only in effect: the engine expands roots, and a nested
// value is inert. Plans keep their own fixed-anchor recurrence semantics.
export function plannerHasFlexibleRecurrence(item: Planner): boolean {
  return (
    (item.plannerType === "task" || item.plannerType === "goal") &&
    parsePlanRecurrence(item.recurrence) !== null
  );
}

// True when the occurrence at `key` already carries a moved exception — i.e. it
// is a customized one-off tile. The scope prompt ("just this / every
// occurrence?") is skipped for these: re-editing an already-customized
// occurrence always means "just this one", and "every occurrence" there would
// rewrite or clear the whole series. Deleted occurrences render no tile, so
// only moved ones are reachable here.
export function hasMovedException(
  recurrenceExceptions: string | null | undefined,
  key: string,
): boolean {
  return parseRecurrenceExceptions(recurrenceExceptions).some(
    (e) => e.key === key && e.type === "moved",
  );
}

function stepOccurrence(
  anchor: Date,
  rule: PlanRecurrenceRule,
  n: number,
): Date {
  const amount = n * rule.interval;
  switch (rule.freq) {
    case "daily":
      return addDays(anchor, amount);
    case "weekly":
      return addWeeks(anchor, amount);
    case "monthly":
      return addMonths(anchor, amount);
  }
}

// Expands a recurring plan into concrete occurrences from its `starts` anchor
// up to `windowEnd` (bounded further by rule.until and MAX_PLAN_OCCURRENCES).
// Deleted exceptions are skipped; moved exceptions keep their original key but
// start at the exception's newStart. date-fns add* steps preserve local
// wall-clock time across DST, which is also what keeps keys deterministic.
export function expandPlanOccurrences(args: {
  starts: string;
  durationMinutes: number;
  rule: PlanRecurrenceRule;
  exceptions: PlanOccurrenceException[];
  windowEnd: Date;
}): PlanOccurrence[] {
  const { starts, durationMinutes, rule, exceptions, windowEnd } = args;
  const anchor = new Date(starts);
  if (isNaN(anchor.getTime())) return [];

  const untilMs = rule.until ? new Date(rule.until).getTime() : Infinity;
  const endMs = Math.min(windowEnd.getTime(), untilMs);
  const exceptionByKey = new Map(exceptions.map((e) => [e.key, e]));

  const occurrences: PlanOccurrence[] = [];
  for (let n = 0; n < MAX_PLAN_OCCURRENCES; n++) {
    const ruleStart = stepOccurrence(anchor, rule, n);
    if (ruleStart.getTime() > endMs) break;

    const key = occurrenceKey(ruleStart);
    const exception = exceptionByKey.get(key);
    if (exception?.type === "deleted") continue;

    const start =
      exception?.type === "moved" ? new Date(exception.newStart) : ruleStart;
    const occurrenceDuration =
      exception?.type === "moved" && exception.durationMinutes !== undefined
        ? exception.durationMinutes
        : durationMinutes;
    occurrences.push({
      key,
      start,
      end: addMinutes(start, occurrenceDuration),
      moved: exception?.type === "moved",
    });
  }
  return occurrences;
}

// Upserts a moved exception for one occurrence. Re-moving an already-moved
// occurrence updates the same entry — the key never changes. An explicit
// `durationMinutes` records a per-occurrence resize; omitting it preserves any
// duration a prior resize set (so a plain drag keeps the occurrence's length).
export function upsertMovedException(
  exceptions: PlanOccurrenceException[],
  key: string,
  newStart: string,
  durationMinutes?: number,
): PlanOccurrenceException[] {
  const existing = exceptions.find(
    (e): e is MovedException => e.key === key && e.type === "moved",
  );
  const resolvedDuration = durationMinutes ?? existing?.durationMinutes;
  const rest = exceptions.filter((e) => e.key !== key);
  const moved: MovedException = { key, type: "moved", newStart };
  if (resolvedDuration !== undefined) moved.durationMinutes = resolvedDuration;
  return [...rest, moved];
}

export function upsertDeletedException(
  exceptions: PlanOccurrenceException[],
  key: string,
): PlanOccurrenceException[] {
  const rest = exceptions.filter((e) => e.key !== key);
  return [...rest, { key, type: "deleted" }];
}

export function removeException(
  exceptions: PlanOccurrenceException[],
  key: string,
): PlanOccurrenceException[] {
  return exceptions.filter((e) => e.key !== key);
}

// Drops a moved occurrence's per-occurrence duration override so it inherits
// the series length again, without disturbing its position override. Used when
// a resize is applied to "every occurrence": the just-resized occurrence must
// take the new series duration rather than keep its own stale length.
export function clearMovedDuration(
  exceptions: PlanOccurrenceException[],
  key: string,
): PlanOccurrenceException[] {
  return exceptions.map((e) => {
    if (e.key !== key || e.type !== "moved" || e.durationMinutes === undefined) {
      return e;
    }
    return { key: e.key, type: "moved", newStart: e.newStart };
  });
}

// "Move all occurrences": the series anchor shifts by the drag delta, so every
// rule-derived occurrence start shifts with it — exception keys (and moved
// targets) must shift by the same delta to keep pointing at their occurrences.
export function shiftRecurrenceExceptions(
  exceptions: PlanOccurrenceException[],
  deltaMs: number,
): PlanOccurrenceException[] {
  return exceptions.map((e) => {
    const shiftedKey = occurrenceKey(
      new Date(occurrenceKeyToDate(e.key).getTime() + deltaMs),
    );
    if (e.type === "deleted") return { key: shiftedKey, type: "deleted" };
    const moved: MovedException = {
      key: shiftedKey,
      type: "moved",
      newStart: new Date(new Date(e.newStart).getTime() + deltaMs).toISOString(),
    };
    if (e.durationMinutes !== undefined) moved.durationMinutes = e.durationMinutes;
    return moved;
  });
}
