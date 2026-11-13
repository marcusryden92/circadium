import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import { dayKeyLocal } from "@/utils/taskSplitting";
import type {
  EventTemplate,
  Planner,
  PlannerDependency,
  SimpleEvent,
} from "@/types/prisma";

// Detour: a subtask carrying linkedItemId is a pure redirect — the engine
// splices the linked target's leaves into the host's sequence at that position
// (the placeholder's own duration/children are ignored). The target schedules
// once even when referenced from several hosts; multi-reference is reconciled
// by the leaf graph's chain predecessors.

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

function run(planners: Planner[], previousCalendar: SimpleEvent[] = []) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, previousCalendar, {
    categories: [],
    injectTravelEvents: false,
  });
}

const startMs = (e: SimpleEvent) => new Date(e.start).getTime();
const endMs = (e: SimpleEvent) => new Date(e.end).getTime();

function eventFor(events: SimpleEvent[], leafId: string): SimpleEvent {
  const e = events.find((ev) => plannerIdFromEventId(ev.id) === leafId);
  if (!e) throw new Error(`no event for ${leafId}`);
  return e;
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

describe("detour splice", () => {
  // Host goal: leaf-a, [placeholder -> target], leaf-b. Target goal: t1, t2.
  const buildSingleRef = () => {
    const host = makePlanner("host", { plannerType: "goal", duration: 0 });
    const leafA = makePlanner("leaf-a", {
      parentId: "host",
      duration: 60,
      sortOrder: 1024,
    });
    const placeholder = makePlanner("ph", {
      parentId: "host",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const leafB = makePlanner("leaf-b", {
      parentId: "host",
      duration: 60,
      sortOrder: 3072,
    });
    const target = makePlanner("target", { plannerType: "goal", duration: 0 });
    const t1 = makePlanner("t1", {
      parentId: "target",
      duration: 60,
      sortOrder: 1024,
    });
    const t2 = makePlanner("t2", {
      parentId: "target",
      duration: 60,
      sortOrder: 2048,
    });
    return [host, leafA, placeholder, leafB, target, t1, t2];
  };

  it("splices the target's leaves into the host sequence at the placeholder position", () => {
    const { events } = run(buildSingleRef());

    const a = eventFor(events, "leaf-a");
    const t1 = eventFor(events, "t1");
    const t2 = eventFor(events, "t2");
    const b = eventFor(events, "leaf-b");

    // leaf-a -> t1 -> t2 -> leaf-b, each after the previous.
    expect(startMs(t1)).toBeGreaterThanOrEqual(endMs(a));
    expect(startMs(t2)).toBeGreaterThanOrEqual(endMs(t1));
    expect(startMs(b)).toBeGreaterThanOrEqual(endMs(t2));

    // The placeholder itself is never scheduled.
    expect(events.find((e) => plannerIdFromEventId(e.id) === "ph")).toBeUndefined();

    // Each target leaf placed exactly once.
    expect(
      events.filter((e) => plannerIdFromEventId(e.id) === "t1"),
    ).toHaveLength(1);
    expect(
      events.filter((e) => plannerIdFromEventId(e.id) === "t2"),
    ).toHaveLength(1);
  });

  it("re-emits identical events on an idle regen", () => {
    const planners = buildSingleRef();
    const first = run(planners);
    const second = run(planners, first.events);

    const snap = (events: SimpleEvent[]) =>
      ["leaf-a", "t1", "t2", "leaf-b"]
        .map((id) => {
          const e = eventFor(events, id);
          return { id: e.id, start: e.start, end: e.end };
        })
        .sort((x, y) => x.id.localeCompare(y.id));

    expect(snap(second.events)).toEqual(snap(first.events));
  });

  it("schedules a target referenced by two hosts exactly once, after both hosts' before-leaves", () => {
    // Host H: hA, [ph1 -> target]. Host G: gA, [ph2 -> target].
    const hostH = makePlanner("host-h", { plannerType: "goal", duration: 0 });
    const hA = makePlanner("h-a", {
      parentId: "host-h",
      duration: 60,
      sortOrder: 1024,
    });
    const ph1 = makePlanner("ph1", {
      parentId: "host-h",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const hostG = makePlanner("host-g", { plannerType: "goal", duration: 0 });
    const gA = makePlanner("g-a", {
      parentId: "host-g",
      duration: 60,
      sortOrder: 1024,
    });
    const ph2 = makePlanner("ph2", {
      parentId: "host-g",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const target = makePlanner("target", { plannerType: "goal", duration: 0 });
    const t1 = makePlanner("t1", {
      parentId: "target",
      duration: 60,
      sortOrder: 1024,
    });

    const { events } = run([hostH, hA, ph1, hostG, gA, ph2, target, t1]);

    // The target leaf is placed exactly once.
    const t1Events = events.filter((e) => plannerIdFromEventId(e.id) === "t1");
    expect(t1Events).toHaveLength(1);

    // It starts after BOTH hosts' before-leaves.
    const t1e = t1Events[0];
    expect(startMs(t1e)).toBeGreaterThanOrEqual(endMs(eventFor(events, "h-a")));
    expect(startMs(t1e)).toBeGreaterThanOrEqual(endMs(eventFor(events, "g-a")));
  });

  it("composes the host and target day caps pointwise-min on spliced leaves", () => {
    // Host cap 120 (generous), target cap 60. The target's three 60-min leaves
    // are metered by BOTH caps — the target's tighter cap forces one per day.
    const host = makePlanner("host", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 120,
    });
    const hostLeaf = makePlanner("host-leaf", {
      parentId: "host",
      duration: 60,
      sortOrder: 1024,
    });
    const placeholder = makePlanner("ph", {
      parentId: "host",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const target = makePlanner("target", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 60,
    });
    const targetLeaves = ["t1", "t2", "t3"].map((id, i) =>
      makePlanner(id, {
        parentId: "target",
        duration: 60,
        sortOrder: (i + 1) * 1024,
      }),
    );

    const { events } = run([host, hostLeaf, placeholder, target, ...targetLeaves]);

    // The target's tighter cap (60) charges the target ledger, so its three
    // leaves land on three distinct local days.
    const targetDays = new Set(
      ["t1", "t2", "t3"].map((id) =>
        dayKeyLocal(new Date(eventFor(events, id).start)),
      ),
    );
    expect(targetDays.size).toBe(3);

    // The host cap (120) still meters the spliced leaves together with its own,
    // so no local day carries more than 120 minutes across the whole sequence.
    const perDay = new Map<string, number>();
    for (const id of ["host-leaf", "t1", "t2", "t3"]) {
      const e = eventFor(events, id);
      const key = dayKeyLocal(new Date(e.start));
      perDay.set(key, (perDay.get(key) ?? 0) + 60);
    }
    perDay.forEach((minutes) => expect(minutes).toBeLessThanOrEqual(120));
  });

  it("schedules a target independently when its only host is completed", () => {
    // Completing the host is normal lifecycle — it must free the target to
    // schedule on its own, not silently unschedule it.
    const host = makePlanner("host", {
      plannerType: "goal",
      duration: 0,
      completedStartTime: "2026-01-02T10:00:00.000Z",
      completedEndTime: "2026-01-02T11:00:00.000Z",
    });
    const hostLeaf = makePlanner("host-leaf", {
      parentId: "host",
      duration: 60,
      sortOrder: 1024,
    });
    const placeholder = makePlanner("ph", {
      parentId: "host",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const target = makePlanner("target", { duration: 60 });

    const { events } = run([host, hostLeaf, placeholder, target]);

    expect(
      events.filter((e) => plannerIdFromEventId(e.id) === "target"),
    ).toHaveLength(1);
    // The completed host's own subtree stays off the calendar.
    expect(
      events.find((e) => plannerIdFromEventId(e.id) === "host-leaf"),
    ).toBeUndefined();
  });

  it("does not schedule an unready target through a ready host", () => {
    // Readiness is the universal scheduling gate — the splice is transparent
    // for an unready target, and the chain flows through the placeholder.
    const host = makePlanner("host", { plannerType: "goal", duration: 0 });
    const leafA = makePlanner("leaf-a", {
      parentId: "host",
      duration: 60,
      sortOrder: 1024,
    });
    const placeholder = makePlanner("ph", {
      parentId: "host",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const leafB = makePlanner("leaf-b", {
      parentId: "host",
      duration: 60,
      sortOrder: 3072,
    });
    const target = makePlanner("target", {
      plannerType: "goal",
      duration: 0,
      isReady: false,
    });
    const t1 = makePlanner("t1", {
      parentId: "target",
      duration: 60,
      sortOrder: 1024,
    });
    const successor = makePlanner("succ", { duration: 60 });

    const dependencies: PlannerDependency[] = [
      {
        id: "dep1",
        predecessorId: "target",
        successorId: "succ",
        userId: USER_ID,
        createdAt: FAKE_TODAY.toISOString(),
        updatedAt: FAKE_TODAY.toISOString(),
      },
    ];

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [host, leafA, placeholder, leafB, target, t1, successor],
      [],
      { categories: [], injectTravelEvents: false, dependencies },
    );

    expect(events.find((e) => plannerIdFromEventId(e.id) === "t1")).toBeUndefined();
    // Host chain flows through the transparent placeholder.
    expect(startMs(eventFor(events, "leaf-b"))).toBeGreaterThanOrEqual(
      endMs(eventFor(events, "leaf-a")),
    );
    // Dependency on the unready target stays LOUD, not silenced by the splice.
    expect(eventFor(events, "succ")).toBeDefined();
    expect(
      messages.some(
        (m) =>
          m.type === "DEPENDENCY_BROKEN" &&
          (m.payload as { cause?: string }).cause === "unready",
      ),
    ).toBe(true);
  });

  it("keeps a fitting host cap steering a leaf that is oversized only for the target cap", () => {
    // Host cap 90, target cap 45, spliced leaf 60: oversized for the target
    // only. The host cap must still steer (60 placed + 60 more would blow the
    // host's 90/day), and the oversizedLeaf compromise lands on the target
    // alone — not on the host whose cap the leaf never exceeded.
    const host = makePlanner("host", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 90,
    });
    const hostLeaf = makePlanner("host-leaf", {
      parentId: "host",
      duration: 60,
      sortOrder: 1024,
    });
    const placeholder = makePlanner("ph", {
      parentId: "host",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const target = makePlanner("target", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 45,
    });
    const t1 = makePlanner("t1", {
      parentId: "target",
      duration: 60,
      sortOrder: 1024,
    });

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [host, hostLeaf, placeholder, target, t1],
      [],
      { categories: [], injectTravelEvents: false },
    );

    // Host budget after host-leaf is 30 < 60, so t1 lands on another day.
    expect(dayKeyLocal(new Date(eventFor(events, "t1").start))).not.toBe(
      dayKeyLocal(new Date(eventFor(events, "host-leaf").start)),
    );

    const capRelaxations = messages.filter(
      (m) => m.type === "GOAL_DAY_CAP_RELAXED",
    );
    expect(
      capRelaxations.some(
        (m) =>
          (m.payload as { plannerId: string; kind: string }).plannerId ===
            "target" &&
          (m.payload as { kind: string }).kind === "oversizedLeaf",
      ),
    ).toBe(true);
    expect(
      capRelaxations.some(
        (m) => (m.payload as { plannerId: string }).plannerId === "host",
      ),
    ).toBe(false);
  });

  it("schedules children added under a linked placeholder after the splice", () => {
    // The placeholder's own duration stays ignored, but real children under
    // it (the assistant can nest them unknowingly) must not vanish silently.
    const host = makePlanner("host", { plannerType: "goal", duration: 0 });
    const leafA = makePlanner("leaf-a", {
      parentId: "host",
      duration: 60,
      sortOrder: 1024,
    });
    const placeholder = makePlanner("ph", {
      parentId: "host",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const child = makePlanner("ph-child", {
      parentId: "ph",
      duration: 60,
      sortOrder: 1024,
    });
    const leafB = makePlanner("leaf-b", {
      parentId: "host",
      duration: 60,
      sortOrder: 3072,
    });
    const target = makePlanner("target", { plannerType: "goal", duration: 0 });
    const t1 = makePlanner("t1", {
      parentId: "target",
      duration: 60,
      sortOrder: 1024,
    });

    const { events } = run([host, leafA, placeholder, child, leafB, target, t1]);

    // leaf-a -> t1 (splice) -> ph-child -> leaf-b; placeholder itself absent.
    expect(startMs(eventFor(events, "t1"))).toBeGreaterThanOrEqual(
      endMs(eventFor(events, "leaf-a")),
    );
    expect(startMs(eventFor(events, "ph-child"))).toBeGreaterThanOrEqual(
      endMs(eventFor(events, "t1")),
    );
    expect(startMs(eventFor(events, "leaf-b"))).toBeGreaterThanOrEqual(
      endMs(eventFor(events, "ph-child")),
    );
    expect(events.find((e) => plannerIdFromEventId(e.id) === "ph")).toBeUndefined();
  });

  it("bounds a dependency successor on a detour target's last spliced leaf", () => {
    // The target is linked into a host AND is a dependency predecessor of a
    // standalone task. The successor must wait for the target's spliced leaves,
    // not break immediately (regression guard: a ready non-candidate target
    // must not be seeded as failed before the loop resolves it).
    const host = makePlanner("host", { plannerType: "goal", duration: 0 });
    const hostLeaf = makePlanner("host-leaf", {
      parentId: "host",
      duration: 60,
      sortOrder: 1024,
    });
    const placeholder = makePlanner("ph", {
      parentId: "host",
      duration: 15,
      sortOrder: 2048,
      linkedItemId: "target",
    });
    const target = makePlanner("target", { plannerType: "goal", duration: 0 });
    const t1 = makePlanner("t1", {
      parentId: "target",
      duration: 60,
      sortOrder: 1024,
    });
    const t2 = makePlanner("t2", {
      parentId: "target",
      duration: 60,
      sortOrder: 2048,
    });
    const successor = makePlanner("succ", { duration: 60 });

    const dependencies: PlannerDependency[] = [
      {
        id: "dep1",
        predecessorId: "target",
        successorId: "succ",
        userId: USER_ID,
        createdAt: FAKE_TODAY.toISOString(),
        updatedAt: FAKE_TODAY.toISOString(),
      },
    ];

    const { events } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [host, hostLeaf, placeholder, target, t1, t2, successor],
      [],
      { categories: [], injectTravelEvents: false, dependencies },
    );

    // succ starts after the target's last spliced leaf (t2).
    expect(startMs(eventFor(events, "succ"))).toBeGreaterThanOrEqual(
      endMs(eventFor(events, "t2")),
    );
  });
});
