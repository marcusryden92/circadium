import { buildPlanEvents } from "@/utils/calendar-generation/helpers/EventAssembler/buildPlanEvents";
import {
  occurrenceEventId,
  serializePlanRecurrence,
  serializeRecurrenceExceptions,
} from "@/utils/planRecurrence";
import type { Planner, SimpleEvent } from "@/types/prisma";

const USER_ID = "user-1";
const PLAN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000";
const TS = "2026-01-01T00:00:00.000Z";
// Local wall-clock anchor: Monday 2026-06-01 09:00.
const ANCHOR = new Date(2026, 5, 1, 9, 0, 0, 0);
const NOW = new Date(2026, 5, 1, 0, 0, 0, 0);

function plan(overrides: Partial<Planner> = {}): Planner {
  return {
    id: PLAN_ID,
    title: "Standup",
    parentId: null,
    plannerType: "plan",
    isReady: true,
    isTriaged: true,
    duration: 60,
    deadline: null,
    starts: ANCHOR.toISOString(),
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
    color: "#123456",
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function build(planners: Planner[], previous: SimpleEvent[] = []) {
  return buildPlanEvents(
    USER_ID,
    planners,
    new Set<string>(),
    new Map(previous.map((e) => [e.id, e])),
    NOW,
  );
}

describe("buildPlanEvents with recurrence", () => {
  it("emits a single event with the plan id for non-recurring plans", () => {
    const events = build([plan()]);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(PLAN_ID);
    expect(events[0].start).toBe(ANCHOR.toISOString());
  });

  it("expands a recurring plan into deterministic composite-id occurrences", () => {
    const events = build([
      plan({
        recurrence: serializePlanRecurrence({
          freq: "weekly",
          interval: 1,
          until: new Date(2026, 5, 30).toISOString(),
        }),
      }),
    ]);
    expect(events.map((e) => e.id)).toEqual([
      occurrenceEventId(PLAN_ID, "2026-06-01T09:00"),
      occurrenceEventId(PLAN_ID, "2026-06-08T09:00"),
      occurrenceEventId(PLAN_ID, "2026-06-15T09:00"),
      occurrenceEventId(PLAN_ID, "2026-06-22T09:00"),
      occurrenceEventId(PLAN_ID, "2026-06-29T09:00"),
    ]);
    for (const event of events) {
      expect(event.extendedProps?.eventId).toBe(event.id);
      expect(event.extendedProps?.plannerType).toBe("plan");
      expect(new Date(event.end).getTime() - new Date(event.start).getTime()).toBe(
        60 * 60000,
      );
    }
  });

  it("applies deleted and moved exceptions", () => {
    const movedTo = new Date(2026, 5, 9, 14, 0, 0, 0).toISOString();
    const events = build([
      plan({
        recurrence: serializePlanRecurrence({
          freq: "weekly",
          interval: 1,
          until: new Date(2026, 5, 16).toISOString(),
        }),
        recurrenceExceptions: serializeRecurrenceExceptions([
          { key: "2026-06-08T09:00", type: "moved", newStart: movedTo },
          { key: "2026-06-15T09:00", type: "deleted" },
        ]),
      }),
    ]);
    expect(events.map((e) => e.id)).toEqual([
      occurrenceEventId(PLAN_ID, "2026-06-01T09:00"),
      occurrenceEventId(PLAN_ID, "2026-06-08T09:00"),
    ]);
    expect(events[1].start).toBe(movedTo);
  });

  it("re-emits unchanged occurrences by object identity via stabilizeEvent", () => {
    const recurring = plan({
      recurrence: serializePlanRecurrence({
        freq: "weekly",
        interval: 1,
        until: new Date(2026, 5, 16).toISOString(),
      }),
    });
    const first = build([recurring]);
    const second = build([recurring], first);
    expect(second).toHaveLength(first.length);
    second.forEach((event, i) => {
      expect(event).toBe(first[i]);
    });
  });
});
