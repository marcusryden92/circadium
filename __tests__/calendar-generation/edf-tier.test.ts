import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import {
  sortByPriorityAndConstraints,
  computeUrgencyScores,
} from "@/utils/calendar-generation/helpers/PrioritySorter";
import type { EventTemplate, Planner, SimpleEvent } from "@/types/prisma";

// EDF tier: a leaf whose (own or inherited) deadline falls within the EDF
// horizon sorts by slack ascending — above the score tier, below the
// category-constrained tier — so a task due tomorrow is not out-prioritized
// by deadline-free higher-priority work. Habit occurrences are excluded:
// their synthetic period deadline is a placement window, not a commitment,
// and hoisting them would break the designed contest where a low-priority
// habit yields to higher-priority tasks.

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
  recurrenceExceptions: null,
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

function daysFromToday(days: number, hour = 17): string {
  const d = new Date(FAKE_TODAY);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
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

function sortIds(planners: Planner[]): string[] {
  const scores = computeUrgencyScores(planners, planners, FAKE_TODAY);
  return sortByPriorityAndConstraints(
    planners,
    planners,
    scores,
    undefined,
    FAKE_TODAY,
  ).map((p) => p.id);
}

describe("candidate sort", () => {
  it("a low-priority task due tomorrow sorts before a high-priority deadline-free task", () => {
    const dueTomorrow = makePlanner("due-tomorrow", {
      deadline: daysFromToday(1),
      priority: 1,
    });
    const noDeadline = makePlanner("no-deadline", { priority: 7 });

    expect(sortIds([noDeadline, dueTomorrow])).toEqual([
      "due-tomorrow",
      "no-deadline",
    ]);
  });

  it("the category-constrained tier stays primary over the EDF tier", () => {
    const constrained = makePlanner("constrained", { categoryId: "cat-1" });
    const dueTomorrow = makePlanner("due-tomorrow", {
      deadline: daysFromToday(1),
      priority: 1,
    });

    expect(sortIds([dueTomorrow, constrained])).toEqual([
      "constrained",
      "due-tomorrow",
    ]);
  });

  it("orders EDF-tier items by slack ascending, not raw deadline", () => {
    // Later deadline but much larger block -> smaller slack -> first.
    const bigBlock = makePlanner("big-block", {
      deadline: daysFromToday(2),
      duration: 40 * 60,
    });
    const smallBlock = makePlanner("small-block", {
      deadline: daysFromToday(1, 12),
      duration: 30,
    });
    const slackBig = 2 * 24 * 60 + 9 * 60 - 40 * 60; // 1020
    const slackSmall = 24 * 60 + 4 * 60 - 30; // 1650
    expect(slackBig).toBeLessThan(slackSmall);

    expect(sortIds([smallBlock, bigBlock])).toEqual([
      "big-block",
      "small-block",
    ]);
  });

  it("far-future deadlines stay in the score tier", () => {
    const farDeadline = makePlanner("far-deadline", {
      deadline: daysFromToday(60),
      priority: 1,
    });
    const noDeadline = makePlanner("no-deadline", { priority: 7 });

    expect(sortIds([farDeadline, noDeadline])).toEqual([
      "no-deadline",
      "far-deadline",
    ]);
  });

  it("habit occurrences never enter the EDF tier", () => {
    const habitOccurrence = makePlanner("habit-1|2026-01-05", {
      plannerType: "habit",
      deadline: daysFromToday(1),
      priority: 1,
    });
    const noDeadline = makePlanner("no-deadline", { priority: 7 });

    expect(sortIds([habitOccurrence, noDeadline])).toEqual([
      "no-deadline",
      "habit-1|2026-01-05",
    ]);
  });

  it("a subtask inherits its ancestor's deadline for the EDF tier", () => {
    // A task tree (non-goal root) keeps its children as individual candidates.
    const rootTask = makePlanner("root-task", { deadline: daysFromToday(1) });
    const childTask = makePlanner("child-task", {
      parentId: "root-task",
      priority: 1,
    });
    const noDeadline = makePlanner("no-deadline", { priority: 7 });

    const ids = sortIds([noDeadline, childTask, rootTask]);
    expect(ids.indexOf("child-task")).toBeLessThan(ids.indexOf("no-deadline"));
  });
});

describe("full pipeline", () => {
  it("places the due-tomorrow task before the deadline-free higher-priority task", () => {
    const dueTomorrow = makePlanner("due-tomorrow", {
      deadline: daysFromToday(1),
      priority: 1,
    });
    const noDeadline = makePlanner("no-deadline", { priority: 7 });

    const { events } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [dueTomorrow, noDeadline],
      [],
      { injectTravelEvents: false },
    );

    const find = (id: string): SimpleEvent => {
      const event = events.find((e) => e.id === id);
      expect(event).toBeDefined();
      return event!;
    };
    expect(new Date(find("due-tomorrow").start).getTime()).toBeLessThan(
      new Date(find("no-deadline").start).getTime(),
    );
  });
});
