import type { Planner } from "@/types/prisma";
import { PlannerType } from "@/types/prisma";

// Allowed scheduling times: a task/goal row with non-null `allowedTimes` is
// only dynamically placed on the given weekdays and/or inside the given
// time-of-day ranges. Constraints inherit down the tree — a leaf must satisfy
// its own settings AND every ancestor's — so the engine resolves each planner
// to a chain of settings and intersects them at placement time.
//
// Ranges follow the category-window wrap convention: endTime <= startTime
// runs into the next morning (the occurrence belongs to its start day).
// "23:59" as endTime is the end-of-day sentinel (treated as 24:00). Plans are
// never constrained (fixed anchors), mirroring taskIsSplittable.

export interface AllowedTimeRange {
  startTime: string;
  endTime: string;
}

export interface AllowedTimesSettings {
  // 0=Sunday .. 6=Saturday (CategoryTimeWindow.day convention). null = every day.
  days: number[] | null;
  // Time-of-day ranges applying on each allowed day. null = any time of day.
  ranges: AllowedTimeRange[] | null;
}

export interface DateInterval {
  start: Date;
  end: Date;
}

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function rangeBoundsMinutes(
  range: AllowedTimeRange,
): { startMin: number; endMin: number } {
  const startMin = toMinutes(range.startTime);
  let endMin =
    range.endTime === "23:59" ? MINUTES_PER_DAY : toMinutes(range.endTime);
  if (endMin <= startMin) endMin += MINUTES_PER_DAY;
  return { startMin, endMin };
}

// A range wrapping past midnight (endTime <= startTime; "23:59" excepted —
// the end-of-day sentinel). Per-day-sampled capacity ceilings must drop the
// axis carrying one: its fragments chain across midnight at placement time,
// which per-day sampling truncates into a false-TOO_LARGE risk.
export function rangeIsOvernight(range: AllowedTimeRange): boolean {
  return rangeBoundsMinutes(range).endMin > MINUTES_PER_DAY;
}

function isValidRange(value: unknown): value is AllowedTimeRange {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { startTime?: unknown; endTime?: unknown };
  if (
    typeof candidate.startTime !== "string" ||
    typeof candidate.endTime !== "string" ||
    !HHMM_PATTERN.test(candidate.startTime) ||
    !HHMM_PATTERN.test(candidate.endTime)
  ) {
    return false;
  }
  return candidate.startTime !== candidate.endTime;
}

// Object-level validation shared by the JSON parser and callers holding an
// already-parsed candidate. Returns null when the shape carries no usable
// constraint (both facets unconstrained, or not a settings object at all).
export function normalizeAllowedTimesSettings(
  value: unknown,
): AllowedTimesSettings | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as { days?: unknown; ranges?: unknown };

  let days: number[] | null = null;
  if (Array.isArray(parsed.days)) {
    const cleaned = Array.from(
      new Set(
        parsed.days.filter(
          (d): d is number =>
            typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
        ),
      ),
    ).sort((a, b) => a - b);
    // All seven days is the same as no day constraint.
    if (cleaned.length > 0 && cleaned.length < 7) days = cleaned;
  }

  let ranges: AllowedTimeRange[] | null = null;
  if (Array.isArray(parsed.ranges)) {
    const cleaned = parsed.ranges
      .filter(isValidRange)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime }))
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    if (cleaned.length > 0) ranges = cleaned;
  }

  if (days === null && ranges === null) return null;
  return { days, ranges };
}

export function parseAllowedTimes(
  value: string | null | undefined,
): AllowedTimesSettings | null {
  if (!value) return null;
  try {
    return normalizeAllowedTimesSettings(JSON.parse(value));
  } catch {
    return null;
  }
}

export function serializeAllowedTimes(
  settings: AllowedTimesSettings,
): string | null {
  const normalized = normalizeAllowedTimesSettings(settings);
  if (!normalized) return null;
  return JSON.stringify({
    days: normalized.days,
    ranges: normalized.ranges,
  });
}

// Allowed times never apply to plans (fixed anchors). Parent containers are
// not inert (unlike splitting): their settings constrain every descendant
// leaf via the chain intersection.
export function plannerHasAllowedTimes(item: Planner): boolean {
  if (item.plannerType === PlannerType.plan) return false;
  return parseAllowedTimes(item.allowedTimes) !== null;
}

function dayIsAllowed(settings: AllowedTimesSettings, day: number): boolean {
  return settings.days === null || settings.days.includes(day);
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function shiftLocalDays(dayStart: Date, days: number): Date {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return d;
}

function atLocalMinutes(dayStart: Date, minutes: number): Date {
  // setHours keeps the result anchored to the local day even across DST.
  const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
  const rest = minutes % MINUTES_PER_DAY;
  const d = shiftLocalDays(dayStart, dayOffset);
  d.setHours(Math.floor(rest / 60), rest % 60, 0, 0);
  return d;
}

export function mergeIntervals(intervals: DateInterval[]): DateInterval[] {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: DateInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const next = sorted[i];
    if (next.start.getTime() <= last.end.getTime()) {
      if (next.end.getTime() > last.end.getTime()) last.end = next.end;
    } else {
      merged.push({ ...next });
    }
  }
  return merged;
}

// Concrete allowed intervals for ONE settings object over [rangeStart, rangeEnd],
// clipped to the range and merged. Starts one day early so an overnight range
// beginning the previous evening still covers the range's opening hours.
function intervalsForSettings(
  settings: AllowedTimesSettings,
  rangeStart: Date,
  rangeEnd: Date,
): DateInterval[] {
  const out: DateInterval[] = [];
  let dayStart = shiftLocalDays(startOfLocalDay(rangeStart), -1);
  while (dayStart < rangeEnd) {
    if (dayIsAllowed(settings, dayStart.getDay())) {
      if (settings.ranges === null) {
        out.push({ start: dayStart, end: shiftLocalDays(dayStart, 1) });
      } else {
        for (const range of settings.ranges) {
          const { startMin, endMin } = rangeBoundsMinutes(range);
          out.push({
            start: atLocalMinutes(dayStart, startMin),
            end: atLocalMinutes(dayStart, endMin),
          });
        }
      }
    }
    dayStart = shiftLocalDays(dayStart, 1);
  }

  const clipped = out
    .map((interval) => ({
      start: interval.start < rangeStart ? rangeStart : interval.start,
      end: interval.end > rangeEnd ? rangeEnd : interval.end,
    }))
    .filter((interval) => interval.start < interval.end);
  return mergeIntervals(clipped);
}

// Both lists must be sorted by start and internally non-overlapping.
export function intersectIntervalLists(
  a: DateInterval[],
  b: DateInterval[],
): DateInterval[] {
  const out: DateInterval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = a[i].start > b[j].start ? a[i].start : b[j].start;
    const end = a[i].end < b[j].end ? a[i].end : b[j].end;
    if (start < end) out.push({ start, end });
    if (a[i].end.getTime() <= b[j].end.getTime()) i++;
    else j++;
  }
  return out;
}

// The sub-intervals of [start, end] satisfying EVERY settings in the chain.
// An empty chain returns the whole interval untouched.
export function intersectIntervalWithAllowed(
  start: Date,
  end: Date,
  settingsChain: AllowedTimesSettings[],
): DateInterval[] {
  let current: DateInterval[] = [{ start, end }];
  for (const settings of settingsChain) {
    current = intersectIntervalLists(
      current,
      intervalsForSettings(settings, start, end),
    );
    if (current.length === 0) break;
  }
  return current;
}

// Generic-week minute-space machinery shared by the capacity ceilings below.
// Two-week unroll so blocks chaining across midnight and across the week seam
// measure correctly.
type MinuteInterval = { start: number; end: number };

const CEILING_UNROLL_WEEKS = 2;

function mergeMinuteIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  intervals.sort((a, b) => a.start - b.start);
  const merged: MinuteInterval[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function intersectMinuteIntervals(
  a: MinuteInterval[],
  b: MinuteInterval[],
): MinuteInterval[] {
  const next: MinuteInterval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start < end) next.push({ start, end });
    if (a[i].end <= b[j].end) i++;
    else j++;
  }
  return next;
}

function weeklySettingsIntervals(
  settings: AllowedTimesSettings,
): MinuteInterval[] {
  const weekly: MinuteInterval[] = [];
  for (let week = 0; week < CEILING_UNROLL_WEEKS; week++) {
    for (let day = 0; day < 7; day++) {
      if (!dayIsAllowed(settings, day)) continue;
      const dayBase = week * MINUTES_PER_WEEK + day * MINUTES_PER_DAY;
      if (settings.ranges === null) {
        weekly.push({ start: dayBase, end: dayBase + MINUTES_PER_DAY });
      } else {
        for (const range of settings.ranges) {
          const { startMin, endMin } = rangeBoundsMinutes(range);
          weekly.push({ start: dayBase + startMin, end: dayBase + endMin });
        }
      }
    }
  }
  return mergeMinuteIntervals(weekly);
}

// One weekly recurrence of a category window (CategoryTimeWindow shape);
// same wrap convention as AllowedTimeRange.
export interface WeeklyWindowOccurrence extends AllowedTimeRange {
  day: number;
}

function weeklyWindowIntervals(
  windows: WeeklyWindowOccurrence[],
): MinuteInterval[] {
  const weekly: MinuteInterval[] = [];
  for (let week = 0; week < CEILING_UNROLL_WEEKS; week++) {
    for (const window of windows) {
      if (!Number.isInteger(window.day) || window.day < 0 || window.day > 6) {
        continue;
      }
      const { startMin, endMin } = rangeBoundsMinutes(window);
      const dayBase = week * MINUTES_PER_WEEK + window.day * MINUTES_PER_DAY;
      weekly.push({ start: dayBase + startMin, end: dayBase + endMin });
    }
  }
  return mergeMinuteIntervals(weekly);
}

// Exact longest contiguous allowed block (in nominal minutes) in a generic
// week under the whole chain — the capacity ceiling that turns an impossible
// duration into a loud TOO_LARGE instead of an expansion-burning NO_SLOTS.
// A block covering a full week means the pattern never breaks, i.e. no ceiling.
export function maxAllowedBlockMinutes(
  settingsChain: AllowedTimesSettings[],
): number {
  return maxConstrainedBlockMinutes(settingsChain, null);
}

// Same ceiling with the eligible category windows folded in as a TRUE weekly
// intersection: 0 means the allowed-times pattern and the windows never
// coincide in any week — the item is structurally unplaceable, no matter how
// far the horizon expands. (min() of the two independent ceilings cannot see
// this: windows Monday + allowed times Tuesday both look roomy on their own.)
export function maxConstrainedBlockMinutes(
  settingsChain: AllowedTimesSettings[],
  windows: WeeklyWindowOccurrence[] | null,
): number {
  const hasWindows = !!windows && windows.length > 0;
  if (settingsChain.length === 0 && !hasWindows) return Infinity;

  let current: MinuteInterval[] = [
    { start: 0, end: CEILING_UNROLL_WEEKS * MINUTES_PER_WEEK },
  ];
  for (const settings of settingsChain) {
    current = intersectMinuteIntervals(
      current,
      weeklySettingsIntervals(settings),
    );
    if (current.length === 0) return 0;
  }
  if (hasWindows) {
    current = intersectMinuteIntervals(current, weeklyWindowIntervals(windows));
    if (current.length === 0) return 0;
  }

  let max = 0;
  for (const interval of current) {
    const len = interval.end - interval.start;
    if (len > max) max = len;
  }
  return max >= MINUTES_PER_WEEK ? Infinity : max;
}

export function parseEarliestStartDate(
  value: string | null | undefined,
): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}
