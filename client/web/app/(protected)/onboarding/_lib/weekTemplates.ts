import { v4 as uuidv4 } from "uuid";
import type { EventTemplate } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";

export const ALL_WEEK_DAYS: WeekDayIntegers[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: WeekDayIntegers[] = [1, 2, 3, 4, 5];

// All drawn from the calendar palette (data/calendarColors).
const SLEEP_COLOR = "#1D3557"; // navy — deep blue for night
const EXERCISE_COLOR = "#2E7D32"; // forest green
const MORNING_COLOR = "#FFB703"; // amber — sunrise
const EVENING_COLOR = "#6C5CE7"; // violet — dusk

// The Week step's whole form state. Lives in _lib (not the step component)
// because it is persisted in StoredProgress: without it, a resumed session
// would re-commit from defaults and silently delete previously committed
// blocks (weekTemplateIds survives a reload, so the reconcile is destructive).
export type WeekUIState = {
  sleepEnabled: boolean;
  sleepStart: string;
  sleepEnd: string;
  workEnabled: boolean;
  workStart: string;
  workEnd: string;
  workDays: WeekDayIntegers[];
  workLocationId: string | null;
  exerciseEnabled: boolean;
  exerciseStart: string;
  exerciseEnd: string;
  exerciseDays: WeekDayIntegers[];
  morningEnabled: boolean;
  morningStart: string;
  morningEnd: string;
  eveningEnabled: boolean;
  eveningStart: string;
  eveningEnd: string;
};

export const DEFAULT_WEEK: WeekUIState = {
  sleepEnabled: true,
  sleepStart: "22:00",
  sleepEnd: "07:00",
  workEnabled: false,
  workStart: "09:00",
  workEnd: "17:00",
  workDays: [1, 2, 3, 4, 5],
  workLocationId: null,
  exerciseEnabled: false,
  exerciseStart: "18:00",
  exerciseEnd: "19:00",
  exerciseDays: [1, 3, 5],
  morningEnabled: false,
  morningStart: "07:00",
  morningEnd: "07:30",
  eveningEnabled: false,
  eveningStart: "21:30",
  eveningEnd: "22:00",
};

export type SleepInput = {
  start: string;
  end: string;
  locationId?: string | null;
};
export type WorkInput = {
  start: string;
  end: string;
  days: WeekDayIntegers[];
  locationId: string | null;
};
export type ExerciseInput = {
  start: string;
  end: string;
  days: WeekDayIntegers[];
};
export type RitualInput = {
  start: string;
  end: string;
  locationId?: string | null;
};

export type WeekFormInput = {
  sleep: SleepInput | null;
  work: WorkInput | null;
  // Optional so existing callers/tests that only set sleep + work keep working.
  exercise?: ExerciseInput | null;
  morning?: RitualInput | null;
  evening?: RitualInput | null;
};

type RawBlock = {
  startDay: WeekDayIntegers;
  startTime: string;
  duration: number;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Expands a daily [start, end) range into one block per day.
//
// A within-day range (end after start) becomes a single same-day block. When
// end is not after start the range crosses midnight, and `allowOvernight`
// decides the treatment:
//   - true (sleep): kept as ONE block whose duration runs past 24:00. The
//     engine (masksToIntervals) and both calendar surfaces render a single
//     overnight block correctly, and one continuous Sleep block reads better
//     than the two split chips a midnight cut produced.
//   - false (work, exercise, routines): an end that isn't after the start is
//     user error — e.g. a "10:00" meant as 10 PM — so the range is dropped
//     rather than ballooned across the whole day. (Work windows, which cannot
//     be overnight in the grid, do their own midnight split in workCategory.)
export function expandDailyRange(
  days: WeekDayIntegers[],
  start: string,
  end: string,
  allowOvernight: boolean = true,
): RawBlock[] {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  const blocks: RawBlock[] = [];

  for (const day of days) {
    if (endMin > startMin) {
      blocks.push({
        startDay: day,
        startTime: start,
        duration: endMin - startMin,
      });
      continue;
    }
    if (!allowOvernight) continue;
    blocks.push({
      startDay: day,
      startTime: start,
      duration: 24 * 60 - startMin + endMin,
    });
  }

  return blocks;
}

// Mints EventTemplate rows from the onboarding week form. Only sleep is a
// template (a recurring committed block); work hours become time windows on a
// Work category instead — see applyWorkCategory.
export function buildWeekTemplates(
  input: WeekFormInput,
  userId: string,
  nowIso: string,
): EventTemplate[] {
  const templates: EventTemplate[] = [];

  const push = (
    block: RawBlock,
    title: string,
    color: string,
    locationId: string | null,
  ) => {
    templates.push({
      id: uuidv4(),
      title,
      startDay: block.startDay,
      startTime: block.startTime,
      duration: block.duration,
      color,
      locationId,
      recurrenceExceptions: null,
      userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  };

  if (input.sleep) {
    for (const block of expandDailyRange(
      ALL_WEEK_DAYS,
      input.sleep.start,
      input.sleep.end,
    )) {
      push(block, "Sleep", SLEEP_COLOR, input.sleep.locationId ?? null);
    }
  }

  if (input.exercise && input.exercise.days.length > 0) {
    for (const block of expandDailyRange(
      input.exercise.days,
      input.exercise.start,
      input.exercise.end,
      false,
    )) {
      push(block, "Exercise", EXERCISE_COLOR, null);
    }
  }

  if (input.morning) {
    for (const block of expandDailyRange(
      ALL_WEEK_DAYS,
      input.morning.start,
      input.morning.end,
      false,
    )) {
      push(
        block,
        "Morning routine",
        MORNING_COLOR,
        input.morning.locationId ?? null,
      );
    }
  }

  if (input.evening) {
    for (const block of expandDailyRange(
      ALL_WEEK_DAYS,
      input.evening.start,
      input.evening.end,
      false,
    )) {
      push(
        block,
        "Evening routine",
        EVENING_COLOR,
        input.evening.locationId ?? null,
      );
    }
  }

  return templates;
}

// Swaps freshly minted rows for the previously committed row when the block is
// unchanged, so a Back/forward pass through the Week step produces an empty
// sync diff instead of a delete+create per block. Matching consumes the pool so
// two identical blocks can't reuse the same previous row.
export function reconcileWeekTemplateRows(
  prevOwned: EventTemplate[],
  built: EventTemplate[],
): EventTemplate[] {
  const pool = [...prevOwned];
  return built.map((row) => {
    const idx = pool.findIndex(
      (p) =>
        p.title === row.title &&
        p.startDay === row.startDay &&
        p.startTime === row.startTime &&
        p.duration === row.duration &&
        p.color === row.color &&
        p.locationId === row.locationId,
    );
    if (idx === -1) return row;
    const [match] = pool.splice(idx, 1);
    return match;
  });
}
