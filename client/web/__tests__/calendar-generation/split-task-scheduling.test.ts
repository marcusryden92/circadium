import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import {
  chunkEventId,
  completedSegmentEventId,
  dayKeyLocal,
  isChunkEventId,
  isCompletedSegmentEventId,
  serializeTaskSplitting,
} from "@/utils/taskSplitting";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import type {
  Category,
  EventTemplate,
  Planner,
  SimpleEvent,
} from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";

// Split-task scheduling: a task with `splitting` set places as dynamically
// sized chunks (slot-driven, bounded by min/max and the per-day cap), its
// completed segments render frozen while only the remainder reschedules, a
// splittable goal leaf chains the next leaf after its last chunk, and an
// idle regen re-emits identical chunk events.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";

const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: null,
  createdAt: FAKE_TODAY.toISOString(),
  updatedAt: FAKE_TODAY.toISOString(),
})) as unknown as EventTemplate[];

function makePlanner(id: string, overrides: Partial<Planner>): Planner {
  const ts = FAKE_TODAY.toISOString();
  return {
    id,
    title: id,
    parentId: null,
    plannerType: "task",
    isReady: true,
    isTriaged: true,
    duration: 60,
    deadline: null,
    starts: null,
    recurrence: null,
    recurrenceExceptions: null,
    splitting: null,
    completedSegments: null,
    maxMinutesPerDay: null,
    earliestStartDate: null,
    allowedTimes: null,
    linkedItemId: null,
    notes: null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: 5,
    userId: USER_ID,
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function run(
  planners: Planner[],
  previousCalendar: SimpleEvent[] = [],
  categories: Category[] = [],
) {
  return generateCalendar(
    USER_ID,
    1,
    SLEEP_TEMPLATES,
    planners,
    previousCalendar,
    { categories, injectTravelEvents: false },
  );
}

function chunksOf(events: SimpleEvent[], plannerId: string): SimpleEvent[] {
  return events.filter(
    (e) => isChunkEventId(e.id) && plannerIdFromEventId(e.id) === plannerId,
  );
}

function eventMinutes(e: SimpleEvent): number {
  return Math.round(
    (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000,
  );
}

let consoleSpies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  jest.setSystemTime(FAKE_TODAY);
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "info").mockImplementation(() => {}),
  ];
});
afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  jest.useRealTimers();
});

describe("split task scheduling", () => {
  it("places the full duration as chunks within the min/max bounds", () => {
    const task = makePlanner("reading", {
      duration: 300,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
    });

    const { events, messages } = run([task]);

    expect(events.find((e) => e.id === "reading")).toBeUndefined();
    const chunks = chunksOf(events, "reading");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(300);
    for (const chunk of chunks) {
      expect(eventMinutes(chunk)).toBeGreaterThanOrEqual(45);
      expect(eventMinutes(chunk)).toBeLessThanOrEqual(120);
    }

    const failures = messages.filter(
      (m) => m.type === "TASK_UNSCHEDULABLE" || m.type === "TASK_TOO_LARGE",
    );
    expect(failures).toEqual([]);
  });

  it("prefers a slot hosting a larger chunk over an earlier minimum-size gap", () => {
    // Monday: a 55-minute gap at 08:00 (hosts a 30-minute fit + 2x10 buffer,
    // but not the 60-minute preferred fit), then a blocker until 13:00, then
    // an open afternoon. An unlimited-max split used to fit-test at the
    // minimum and fragment into the small gap first; the preferred-size pass
    // skips it and places the whole remainder in the roomy afternoon.
    const blocker: EventTemplate[] = [
      {
        id: "blocker-mon",
        title: "Blocker",
        startDay: 1,
        startTime: "08:55",
        duration: 245,
        userId: USER_ID,
        color: null,
        locationId: null,
        createdAt: FAKE_TODAY.toISOString(),
        updatedAt: FAKE_TODAY.toISOString(),
      },
    ] as unknown as EventTemplate[];
    const task = makePlanner("deep-work", {
      duration: 120,
      splitting: serializeTaskSplitting({
        minMinutes: 30,
        maxMinutes: 0,
        maxMinutesPerDay: null,
      }),
    });

    const { events } = generateCalendar(
      USER_ID,
      1,
      [...SLEEP_TEMPLATES, ...blocker],
      [task],
      [],
      { injectTravelEvents: false },
    );

    const chunks = chunksOf(events, "deep-work");
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(120);
    expect(chunks.length).toBe(1);
    expect(new Date(chunks[0].start).getHours()).toBeGreaterThanOrEqual(13);
  });

  it("a bounded max still uses an early gap that hosts a max-size chunk", () => {
    // A 65-minute gap at 08:00 hosts a full-max 45-minute chunk (+ 2x10
    // buffer), so the preferred-size pass must NOT skip it — the preferred
    // fit clamps to the max bound.
    const blocker: EventTemplate[] = [
      {
        id: "blocker-mon",
        title: "Blocker",
        startDay: 1,
        startTime: "09:05",
        duration: 235,
        userId: USER_ID,
        color: null,
        locationId: null,
        createdAt: FAKE_TODAY.toISOString(),
        updatedAt: FAKE_TODAY.toISOString(),
      },
    ] as unknown as EventTemplate[];
    const task = makePlanner("deep-work", {
      duration: 120,
      splitting: serializeTaskSplitting({
        minMinutes: 30,
        maxMinutes: 45,
        maxMinutesPerDay: null,
      }),
    });

    const { events } = generateCalendar(
      USER_ID,
      1,
      [...SLEEP_TEMPLATES, ...blocker],
      [task],
      [],
      { injectTravelEvents: false },
    );

    const chunks = chunksOf(events, "deep-work");
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(120);
    const first = chunks
      .slice()
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      )[0];
    expect(new Date(first.start).getHours()).toBe(8);
    expect(eventMinutes(first)).toBe(45);
  });

  it("respects the per-day cap", () => {
    const task = makePlanner("reading", {
      duration: 300,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 120,
        maxMinutesPerDay: 120,
      }),
    });

    const { events } = run([task]);

    const chunks = chunksOf(events, "reading");
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(300);

    const perDay = new Map<string, number>();
    for (const chunk of chunks) {
      const key = dayKeyLocal(new Date(chunk.start));
      perDay.set(key, (perDay.get(key) ?? 0) + eventMinutes(chunk));
    }
    perDay.forEach((minutes) => {
      expect(minutes).toBeLessThanOrEqual(120);
    });
    expect(perDay.size).toBeGreaterThanOrEqual(3);
  });

  it("packs same-day chunks without a forced inter-chunk gap", () => {
    const task = makePlanner("reading", {
      duration: 300,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 60,
        maxMinutesPerDay: null,
      }),
    });

    const { events } = run([task]);

    const chunks = chunksOf(events, "reading").sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(300);

    let sameDayPairs = 0;
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = new Date(chunks[i - 1].end);
      const start = new Date(chunks[i].start);
      const gapMinutes = (start.getTime() - prevEnd.getTime()) / 60000;
      expect(gapMinutes).toBeGreaterThanOrEqual(0); // never overlap
      if (dayKeyLocal(start) === dayKeyLocal(prevEnd)) {
        // No forced minMinutes break — chunks sit only the standard placement
        // buffer apart, like any two dynamic placements.
        expect(gapMinutes).toBeLessThan(45);
        sameDayPairs++;
      }
    }
    expect(sameDayPairs).toBeGreaterThan(0);
  });

  it("honors a requested minimum spacing between chunks", () => {
    const task = makePlanner("reading", {
      duration: 180,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 60,
        maxMinutesPerDay: null,
        minSpacingMinutes: 60,
      }),
    });

    const { events } = run([task]);

    const chunks = chunksOf(events, "reading").sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(180);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const gapMinutes =
        (new Date(chunks[i].start).getTime() -
          new Date(chunks[i - 1].end).getTime()) /
        60000;
      expect(gapMinutes).toBeGreaterThanOrEqual(60);
    }
  });

  it("freezes completed segments and schedules only the remainder", () => {
    const segment = {
      start: new Date("2026-01-04T10:00:00").toISOString(),
      end: new Date("2026-01-04T11:00:00").toISOString(),
    };
    const task = makePlanner("reading", {
      duration: 300,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
      completedSegments: JSON.stringify([segment]),
    });

    const { events } = run([task]);

    const done = events.filter((e) => isCompletedSegmentEventId(e.id));
    expect(done).toHaveLength(1);
    expect(done[0].id).toBe(completedSegmentEventId("reading", segment));
    expect(done[0].start).toBe(segment.start);
    expect(done[0].end).toBe(segment.end);

    const chunks = chunksOf(events, "reading");
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(240);
  });

  it("skips a fully segment-covered task and emits only its frozen segments", () => {
    const segment = {
      start: new Date("2026-01-04T10:00:00").toISOString(),
      end: new Date("2026-01-04T11:00:00").toISOString(),
    };
    const task = makePlanner("reading", {
      duration: 60,
      splitting: serializeTaskSplitting({
        minMinutes: 30,
        maxMinutes: 60,
        maxMinutesPerDay: null,
      }),
      completedSegments: JSON.stringify([segment]),
    });

    const { events } = run([task]);

    expect(chunksOf(events, "reading")).toHaveLength(0);
    expect(events.filter((e) => isCompletedSegmentEventId(e.id))).toHaveLength(1);
  });

  it("places an unsplittable remainder whole and surfaces the compromise", () => {
    const task = makePlanner("reading", {
      duration: 70,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 60,
        maxMinutesPerDay: null,
      }),
    });

    const { events, messages } = run([task]);

    const chunks = chunksOf(events, "reading");
    expect(chunks).toHaveLength(1);
    expect(eventMinutes(chunks[0])).toBe(70);

    const relaxed = messages.find(
      (m) => m.type === "SPLIT_CONSTRAINT_RELAXED",
    );
    expect(relaxed).toBeDefined();
    expect(relaxed!.payload).toMatchObject({
      plannerId: "reading",
      kind: "maxChunk",
      totalMinutes: 70,
    });
  });

  it("chains the next goal leaf after the split leaf's last chunk", () => {
    const goal = makePlanner("goal", {
      plannerType: "goal",
      duration: 0,
      isReady: true,
    });
    const leafA = makePlanner("leaf-a", {
      plannerType: "goal",
      parentId: "goal",
      duration: 240,
      sortOrder: 1024,
      splitting: serializeTaskSplitting({
        minMinutes: 60,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
    });
    const leafB = makePlanner("leaf-b", {
      plannerType: "goal",
      parentId: "goal",
      duration: 60,
      sortOrder: 2048,
    });

    const { events } = run([goal, leafA, leafB]);

    const chunks = chunksOf(events, "leaf-a");
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(240);

    const placedB = events.find((e) => e.id === "leaf-b");
    expect(placedB).toBeDefined();
    const lastChunkEnd = Math.max(
      ...chunks.map((c) => new Date(c.end).getTime()),
    );
    expect(new Date(placedB!.start).getTime()).toBeGreaterThanOrEqual(
      lastChunkEnd,
    );
  });

  it("keeps every chunk inside the parent's category windows", () => {
    const ts = FAKE_TODAY.toISOString();
    const study: Category = {
      id: "cat-study",
      name: "Study",
      icon: null,
      color: null,
      sortOrder: 0,
      useTimeWindows: true,
      isStrict: false,
      confineToOwnWindows: false,
      locationId: null,
      parentId: null,
      userId: USER_ID,
      createdAt: ts,
      updatedAt: ts,
      timeSlots: ([2, 3, 4] as WeekDayIntegers[]).map((day) => ({
        id: `win-study-${day}`,
        day,
        startTime: "09:00",
        endTime: "12:00",
        recurrenceExceptions: null,
        categoryId: "cat-study",
        userId: USER_ID,
      })),
    };
    const task = makePlanner("reading", {
      duration: 300,
      categoryId: "cat-study",
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
    });

    const { events } = run([task], [], [study]);

    const chunks = chunksOf(events, "reading");
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(300);
    for (const chunk of chunks) {
      const start = new Date(chunk.start);
      const end = new Date(chunk.end);
      expect([2, 3, 4]).toContain(start.getDay());
      expect(start.getHours()).toBeGreaterThanOrEqual(9);
      expect(
        end.getHours() * 60 + end.getMinutes(),
      ).toBeLessThanOrEqual(12 * 60);
    }
  });

  it("keeps a split goal leaf's chunks inside the goal root's category windows", () => {
    const ts = FAKE_TODAY.toISOString();
    const study: Category = {
      id: "cat-study",
      name: "Study",
      icon: null,
      color: null,
      sortOrder: 0,
      useTimeWindows: true,
      isStrict: false,
      confineToOwnWindows: false,
      locationId: null,
      parentId: null,
      userId: USER_ID,
      createdAt: ts,
      updatedAt: ts,
      timeSlots: ([2, 3, 4] as WeekDayIntegers[]).map((day) => ({
        id: `win-study-${day}`,
        day,
        startTime: "09:00",
        endTime: "12:00",
        recurrenceExceptions: null,
        categoryId: "cat-study",
        userId: USER_ID,
      })),
    };
    const goal = makePlanner("goal", {
      plannerType: "goal",
      duration: 0,
      isReady: true,
      categoryId: "cat-study",
      deadline: "2026-02-01",
    });
    const leaf = makePlanner("leaf", {
      plannerType: "goal",
      parentId: "goal",
      duration: 300,
      sortOrder: 1024,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
    });

    const { events } = run([goal, leaf], [], [study]);

    const chunks = chunksOf(events, "leaf");
    expect(chunks.reduce((sum, c) => sum + eventMinutes(c), 0)).toBe(300);
    for (const chunk of chunks) {
      const start = new Date(chunk.start);
      const end = new Date(chunk.end);
      expect([2, 3, 4]).toContain(start.getDay());
      expect(start.getHours()).toBeGreaterThanOrEqual(9);
      expect(
        end.getHours() * 60 + end.getMinutes(),
      ).toBeLessThanOrEqual(12 * 60);
    }
  });

  it("re-emits identical chunk events on an idle regen", () => {
    const task = makePlanner("reading", {
      duration: 300,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
    });

    const first = run([task]);
    const second = run([task], first.events);

    const snapshot = (events: SimpleEvent[]) =>
      chunksOf(events, "reading")
        .map((c) => ({ id: c.id, start: c.start, end: c.end }))
        .sort((a, b) => a.id.localeCompare(b.id));

    expect(snapshot(second.events)).toEqual(snapshot(first.events));
    expect(chunksOf(second.events, "reading")[0].id).toBe(
      chunkEventId("reading", 0),
    );
  });
});
