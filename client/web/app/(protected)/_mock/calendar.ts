import { startOfWeek, addDays, addMinutes, format } from "date-fns";
import { vars } from "@/components/ui";

export type AreaKey =
  | "career"
  | "health"
  | "home"
  | "growth"
  | "rel"
  | "finance";

const areaColor: Record<AreaKey, string> = {
  career: vars.swatches.blue,
  health: vars.swatches.green,
  home: vars.swatches.teal,
  growth: vars.swatches.violet,
  rel: vars.swatches.rose,
  finance: vars.swatches.amber,
};

export type MockEventKind = "task" | "plan" | "template" | "travel";

type MockEventInput = {
  day: number;
  start: number;
  end: number;
  title: string;
  col?: AreaKey;
  kind?: MockEventKind;
  warn?: boolean;
  current?: boolean;
};

type MockStrictBand = {
  day: number;
  start: number;
  end: number;
  col?: AreaKey;
};

const RAW_EVENTS: MockEventInput[] = [
  { day: 0, start: 9, end: 9.5, title: "standup", kind: "template" },
  { day: 1, start: 9, end: 9.5, title: "standup", kind: "template" },
  { day: 2, start: 9, end: 9.5, title: "standup", kind: "template" },
  { day: 3, start: 9, end: 9.5, title: "standup", kind: "template" },
  { day: 4, start: 9, end: 9.5, title: "standup", kind: "template" },
  {
    day: 2,
    start: 9.5,
    end: 12,
    title: "Q4 strategy · deep work",
    col: "career",
    current: true,
  },
  { day: 2, start: 11.75, end: 12.5, title: "1:1 Ana", col: "career", kind: "plan" },
  { day: 2, start: 12.5, end: 12.83, title: "office → home", kind: "travel" },
  { day: 2, start: 14.5, end: 15.33, title: "intervals 800×4", col: "health" },
  {
    day: 2,
    start: 14,
    end: 14.25,
    title: "plant basil",
    col: "home",
    warn: true,
  },
  {
    day: 2,
    start: 17,
    end: 17.33,
    title: "submit expenses",
    col: "career",
    warn: true,
  },
  { day: 5, start: 7, end: 8.5, title: "long run · 8mi", col: "health" },
  { day: 0, start: 19, end: 20.5, title: "family dinner", col: "rel", kind: "plan" },
  { day: 1, start: 14, end: 16, title: "hiring · take-home review", col: "career" },
  { day: 3, start: 10, end: 12, title: "Q4 strategy · pt 2", col: "career" },
  { day: 3, start: 14, end: 15, title: "tempo · 25min", col: "health" },
  { day: 4, start: 11, end: 12, title: "1:1 Ana", col: "career", kind: "plan" },
  { day: 4, start: 15, end: 17, title: "spike · billing client", col: "career" },
  { day: 6, start: 9, end: 11, title: "brunch w/ T", col: "rel", kind: "plan" },
];

const RAW_STRICT: MockStrictBand[] = [
  { day: 0, start: 9, end: 12, col: "career" },
  { day: 2, start: 9, end: 12, col: "career" },
  { day: 4, start: 9, end: 12, col: "career" },
];

function hoursToDate(weekStart: Date, dayOffset: number, hoursFloat: number) {
  const minutes = Math.round(hoursFloat * 60);
  return addMinutes(addDays(weekStart, dayOffset), minutes);
}

export type MockFCEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  display?: "background" | "auto";
  extendedProps: {
    kind: MockEventKind;
    warn?: boolean;
    current?: boolean;
    col?: AreaKey;
  };
};

export function buildMockCalendar(now: Date = new Date()) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const events: MockFCEvent[] = RAW_EVENTS.map((e, i) => {
    const start = hoursToDate(weekStart, e.day, e.start);
    const end = hoursToDate(weekStart, e.day, e.end);
    const color = e.col ? areaColor[e.col] : vars.muted;
    const kind: MockEventKind = e.kind ?? "task";

    if (kind === "travel") {
      return {
        id: `ev-${i}`,
        title: e.title,
        start,
        end,
        backgroundColor: "transparent",
        borderColor: vars.glass.stroke,
        textColor: vars.muted,
        extendedProps: { kind, warn: e.warn, current: e.current, col: e.col },
      };
    }

    if (kind === "template") {
      return {
        id: `ev-${i}`,
        title: e.title,
        start,
        end,
        backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
        borderColor: "transparent",
        textColor: color,
        extendedProps: { kind, warn: e.warn, current: e.current, col: e.col },
      };
    }

    if (kind === "plan") {
      return {
        id: `ev-${i}`,
        title: e.title,
        start,
        end,
        backgroundColor: vars.ink,
        borderColor: vars.ink,
        textColor: vars.paper,
        extendedProps: { kind, warn: e.warn, current: e.current, col: e.col },
      };
    }

    return {
      id: `ev-${i}`,
      title: e.title,
      start,
      end,
      backgroundColor: color,
      borderColor: e.warn ? vars.accent.now : color,
      textColor: vars.textOnAccent,
      extendedProps: { kind, warn: e.warn, current: e.current, col: e.col },
    };
  });

  const strictBands: MockFCEvent[] = RAW_STRICT.map((s, i) => ({
    id: `strict-${i}`,
    title: "",
    start: hoursToDate(weekStart, s.day, s.start),
    end: hoursToDate(weekStart, s.day, s.end),
    display: "background",
    backgroundColor: `color-mix(in srgb, ${vars.ink} 4%, transparent)`,
    extendedProps: { kind: "task", col: s.col },
  }));

  return {
    weekStart,
    weekEnd,
    range: `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d")}`,
    events: [...strictBands, ...events],
  };
}

export type EngineTone = "fail" | "warn" | "info" | "done";

export type EngineMsg = {
  tag: string;
  tone: EngineTone;
  title: string;
  body: string;
};

export const ENGINE_MSGS: EngineMsg[] = [
  {
    tag: "FAIL",
    tone: "fail",
    title: "Couldn't place: 'refactor billing service'",
    body: "6h block needed. No 6h gap fits this week — strict Career window + 2 plans block it.",
  },
  {
    tag: "LATE",
    tone: "warn",
    title: "'Plant basil' planned 3 days after deadline",
    body: "Deadline May 25 passed. Earliest Home slot: today 2 pm.",
  },
  {
    tag: "TRAVEL",
    tone: "warn",
    title: "Insufficient travel · Wed 12:30",
    body: "Office → home is 20m. Only 10m between events.",
  },
  {
    tag: "OK",
    tone: "info",
    title: "42 items scheduled across 28 days",
    body: "38 honored fully · 2 deadlines missed · 2 travel-tight.",
  },
];

export const ENGINE_SUMMARY = {
  lastRun: "2m ago",
  failCount: 1,
  warnCount: 2,
  placedCount: 42,
  spanDays: 7,
};
