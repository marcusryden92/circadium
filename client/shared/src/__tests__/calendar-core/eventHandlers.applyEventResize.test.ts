import { applyEventResize, type UpdateAllFn } from "../../calendar-core/eventHandlers";
import { buildPlanEvents } from "../../engine/helpers/EventAssembler/buildPlanEvents";
import {
  occurrenceEventId,
  serializePlanRecurrence,
} from "../../domain/planRecurrence";
import type { Planner, SimpleEvent } from "../../contracts";

const USER_ID = "user-1";
const PLAN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000";
const TASK_ID = "11111111-2222-3333-4444-555566667777";
const TS = "2026-01-01T00:00:00.000Z";
const NOW = new Date(2026, 10, 1, 0, 0, 0, 0);

// Local wall-clock times in the week of Mon 2026-11-23.
const TUE_12 = new Date(2026, 10, 24, 12, 0, 0, 0);
const WED_12 = new Date(2026, 10, 25, 12, 0, 0, 0);
const WED_16 = new Date(2026, 10, 25, 16, 0, 0, 0);
const WED_20 = new Date(2026, 10, 25, 20, 0, 0, 0);
const THU_10 = new Date(2026, 10, 26, 10, 0, 0, 0);

function row(overrides: Partial<Planner> = {}): Planner {
  return {
    id: PLAN_ID,
    title: "Workshop",
    parentId: null,
    plannerType: "plan",
    isReady: true,
    isTriaged: true,
    duration: 240,
    deadline: null,
    starts: WED_16.toISOString(),
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

// Runs applyEventResize's planner reducer against a fixed source, the way
// updateAllCalendarStates does, then rebuilds plan tiles as the inline engine
// regen would.
function resize(
  planner: Planner[],
  eventId: string,
  start: Date,
  end: Date,
): { planner: Planner[]; events: SimpleEvent[] } {
  let next = planner;
  const updateAll: UpdateAllFn = (plannerUpdate) => {
    if (typeof plannerUpdate === "function") next = plannerUpdate(planner);
    else if (plannerUpdate) next = plannerUpdate;
  };
  applyEventResize(updateAll, eventId, start, end, "Workshop");
  const events = buildPlanEvents(USER_ID, next, new Set(), new Map(), NOW);
  return { planner: next, events };
}

const span = (e: SimpleEvent) => [e.start, e.end];

describe("applyEventResize", () => {
  it("start edge dragged back across the day boundary moves the plan's start (Wed 16-20 -> Tue 12-Wed 20)", () => {
    const { planner, events } = resize([row()], PLAN_ID, TUE_12, WED_20);
    expect(planner[0].starts).toBe(TUE_12.toISOString());
    expect(planner[0].duration).toBe(32 * 60);
    expect(events.map(span)).toEqual([[TUE_12.toISOString(), WED_20.toISOString()]]);
  });

  it("start edge within the day moves the plan's start", () => {
    const { planner, events } = resize([row()], PLAN_ID, WED_12, WED_20);
    expect(planner[0].starts).toBe(WED_12.toISOString());
    expect(planner[0].duration).toBe(8 * 60);
    expect(events.map(span)).toEqual([[WED_12.toISOString(), WED_20.toISOString()]]);
  });

  it("end edge dragged forward across the day boundary changes duration only", () => {
    const original = row();
    const { planner, events } = resize([original], PLAN_ID, WED_16, THU_10);
    expect(planner[0].starts).toBe(original.starts);
    expect(planner[0].duration).toBe(18 * 60);
    expect(events.map(span)).toEqual([[WED_16.toISOString(), THU_10.toISOString()]]);
  });

  it("an end-edge resize leaves a differently formatted starts string untouched", () => {
    const original = row({ starts: "2026-11-25T16:00:00.000+00:00" });
    const start = new Date(original.starts as string);
    const end = new Date(start.getTime() + 5 * 3600000);
    const { planner } = resize([original], PLAN_ID, start, end);
    expect(planner[0].starts).toBe(original.starts);
    expect(planner[0].duration).toBe(300);
  });

  it("a task resize writes duration only, whichever edge moved", () => {
    const task = row({ id: TASK_ID, plannerType: "task", starts: null, duration: 60 });
    const { planner } = resize([task], TASK_ID, TUE_12, WED_20);
    expect(planner[0].starts).toBeNull();
    expect(planner[0].duration).toBe(32 * 60);
  });

  // Duration lives on the series row; an occurrence's own start is a rule
  // position, so a start-edge resize of one occurrence resizes the series
  // without shifting its anchor (unchanged behavior).
  it("a recurring occurrence start-edge resize changes series duration, not the anchor", () => {
    const series = row({
      recurrence: serializePlanRecurrence({ freq: "weekly", interval: 1, until: null }),
    });
    const id = occurrenceEventId(PLAN_ID, "2026-11-25T16:00");
    const { planner } = resize([series], id, TUE_12, WED_20);
    expect(planner[0].starts).toBe(series.starts);
    expect(planner[0].duration).toBe(32 * 60);
  });
});
