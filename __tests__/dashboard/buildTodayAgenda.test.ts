import { buildTodayAgenda } from "@/app/(protected)/dashboard/_data/buildTodayAgenda";
import type { Planner, SimpleEvent } from "@/types/prisma";

// Regression #6: a habit is never wholesale-completed on its row
// (plannerCompletedEnd is null for habits), so a completed occurrence's
// completion must be read off the frozen event tile. Otherwise a completed
// habit that ended earlier today reads as incomplete and gets a "LATE" (warn)
// badge on the dashboard.

const USER_ID = "test-user";

function habitPlanner(id: string): Planner {
  return {
    id,
    title: "Meditate",
    parentId: null,
    plannerType: "habit",
    isReady: true,
    isTriaged: true,
    duration: 30,
    deadline: null,
    starts: null,
    recurrence: JSON.stringify({ freq: "daily", interval: 1 }),
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
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  };
}

function habitEvent(args: {
  id: string;
  start: Date;
  end: Date;
  completed: boolean;
}): SimpleEvent {
  return {
    id: args.id,
    title: "Meditate",
    start: args.start.toISOString(),
    end: args.end.toISOString(),
    duration: null,
    userId: USER_ID,
    rrule: null,
    backgroundColor: "#123456",
    borderColor: "",
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    extendedProps: {
      id: `xp-${args.id}`,
      eventId: args.id,
      plannerType: "habit",
      eventType: "planner",
      completedStartTime: args.completed ? args.start.toISOString() : null,
      completedEndTime: args.completed ? args.end.toISOString() : null,
      parentId: null,
    },
  } as unknown as SimpleEvent;
}

describe("buildTodayAgenda habit completion", () => {
  it("marks a completed habit occurrence as completed (no LATE warn)", () => {
    const now = new Date(2026, 0, 5, 14, 0, 0); // Jan 5, 2pm local

    const completed = habitEvent({
      id: "habit-1|2026-01-05T00:00",
      start: new Date(2026, 0, 5, 10, 0, 0),
      end: new Date(2026, 0, 5, 11, 0, 0),
      completed: true,
    });
    const live = habitEvent({
      id: "habit-1|2026-01-06T00:00",
      start: new Date(2026, 0, 5, 9, 0, 0),
      end: new Date(2026, 0, 5, 9, 30, 0),
      completed: false,
    });

    const agenda = buildTodayAgenda({
      now,
      calendar: [completed, live],
      travelEvents: [],
      templates: [],
      planners: [habitPlanner("habit-1")],
      categories: [],
      locations: [],
      inheritedLocationMap: new Map(),
    });

    const completedItem = agenda.find(
      (i) => i.id === "habit-1|2026-01-05T00:00",
    );
    const liveItem = agenda.find((i) => i.id === "habit-1|2026-01-06T00:00");

    // The completed occurrence, though it ended earlier today, is NOT flagged
    // late; the still-open occurrence that has already elapsed still is.
    expect(completedItem?.warn).toBe(false);
    expect(liveItem?.warn).toBe(true);
  });
});
