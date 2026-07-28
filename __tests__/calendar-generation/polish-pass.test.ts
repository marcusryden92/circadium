/**
 * Direct-drive tests for the same-duration polish pass (static-travel-pass
 * pattern): hand-build the slot fabric with a deliberately bad layout, run
 * polishPass straight, and assert the swap (or the refusal). The pass is
 * opt-in (polishPass generation option, default off), so the full pipeline
 * is unaffected unless asked.
 */

import { EventType, PlannerType } from "@/types/prisma";
import type { EventTemplate, Planner, SimpleEvent } from "@/types/prisma";
import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { TimeSlotManager } from "@/utils/calendar-generation/core/TimeSlotManager";
import { TravelManager } from "@/utils/calendar-generation/core/TravelManager";
import { polishPass } from "@/utils/calendar-generation/helpers/Scheduler/polishPass";
import { buildPlannerConstraintsMap } from "@/utils/calendar-generation/helpers/CalendarGenerator/buildPlannerConstraintsMap";
import { serializeAllowedTimes } from "@/utils/allowedTimes";
import type { TravelTimeEntry } from "@/utils/calendar-generation/models/SchedulingModels";
import type {
  AvailableSlot,
  OccupiedSlot,
  Slot,
  TravelSlot,
} from "@/utils/calendar-generation/models/TimeSlot";

const HOME = "home";
const WORK = "work";

const BASE = new Date("2026-03-03T08:00:00"); // a Tuesday
const at = (minutes: number) => new Date(BASE.getTime() + minutes * 60000);
const iso = (minutes: number) => at(minutes).toISOString();

function buildMatrix(
  entries: Array<[string, string, number]>,
): Map<string, TravelTimeEntry> {
  const matrix = new Map<string, TravelTimeEntry>();
  for (const [from, to, minutes] of entries) {
    matrix.set(`${from}->${to}`, {
      fromLocationId: from,
      toLocationId: to,
      rushHourMinutes: minutes,
      regularMinutes: minutes,
      nightMinutes: minutes,
    });
  }
  return matrix;
}

function makeTravelManager(): TravelManager {
  return new TravelManager(
    new TimeSlotManager(BASE, 0),
    0,
    buildMatrix([
      [HOME, WORK, 30],
      [WORK, HOME, 30],
    ]),
  );
}

function available(
  startMin: number,
  endMin: number,
  prev: string | null,
  next: string | null,
): AvailableSlot {
  return {
    type: "available",
    start: at(startMin),
    end: at(endMin),
    durationMinutes: endMin - startMin,
    prevLocationId: prev,
    nextLocationId: next,
  };
}

function occupied(
  startMin: number,
  endMin: number,
  eventId: string,
  locationId?: string,
): OccupiedSlot {
  return {
    type: "occupied",
    start: at(startMin),
    end: at(endMin),
    durationMinutes: endMin - startMin,
    eventId,
    plannerType: PlannerType.task,
    eventType: EventType.planner,
    ...(locationId ? { locationId } : {}),
  };
}

function travel(
  startMin: number,
  endMin: number,
  from: string,
  to: string,
  eventId: string,
  travelType: TravelSlot["travelType"] = "inbound",
): TravelSlot {
  return {
    type: "travel",
    start: at(startMin),
    end: at(endMin),
    durationMinutes: endMin - startMin,
    eventId,
    eventType: EventType.travel,
    travelType,
    travelFromLocationId: from,
    travelToLocationId: to,
    insufficientTravel: false,
    requiredTravelMinutes: endMin - startMin,
  };
}

function makePlanner(id: string, overrides: Partial<Planner> = {}): Planner {
  const ts = BASE.toISOString();
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
    userId: "u",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  } as Planner;
}

function makeEvent(id: string, startMin: number, endMin: number): SimpleEvent {
  return {
    id,
    title: id,
    start: iso(startMin),
    end: iso(endMin),
  } as unknown as SimpleEvent;
}

function totalTravelMinutes(slots: Slot[]): number {
  return slots
    .filter((s): s is TravelSlot => s.type === "travel")
    .reduce((sum, s) => sum + s.durationMinutes, 0);
}

const DAY = 24 * 60;

// The doc scenario, hand-laid badly: Tuesday's work-anchored midday hosts the
// HOME errand (dragging W->H and H->W legs), Wednesday's home-anchored midday
// hosts the WORK errand (dragging H->W and W->H legs). Swapping the two
// same-duration errands eliminates all four legs.
function buildBadLayout(): {
  slots: Slot[];
  events: SimpleEvent[];
  planners: Planner[];
} {
  const slots: Slot[] = [
    occupied(0, 60, "plan-a", WORK),
    travel(60, 90, WORK, HOME, "leg-1"),
    occupied(90, 150, "errand-h"),
    travel(150, 180, HOME, WORK, "leg-2", "outbound"),
    occupied(180, 240, "plan-b", WORK),
    available(240, DAY, WORK, HOME),
    occupied(DAY, DAY + 60, "home-a", HOME),
    travel(DAY + 60, DAY + 90, HOME, WORK, "leg-3"),
    occupied(DAY + 90, DAY + 150, "errand-w"),
    travel(DAY + 150, DAY + 180, WORK, HOME, "leg-4", "outbound"),
    occupied(DAY + 180, DAY + 240, "home-b", HOME),
    available(DAY + 240, DAY + 480, HOME, null),
  ];
  const events = [
    makeEvent("errand-h", 90, 150),
    makeEvent("errand-w", DAY + 90, DAY + 150),
  ];
  const planners = [
    makePlanner("errand-h", { locationId: HOME }),
    makePlanner("errand-w", { locationId: WORK }),
  ];
  return { slots, events, planners };
}

function runPass(args: {
  slots: Slot[];
  events: SimpleEvent[];
  planners: Planner[];
  locationOverrides?: Map<string, string | null>;
  constraints?: boolean;
}) {
  const plannersById = new Map(args.planners.map((p) => [p.id, p]));
  const plannerLocationMap =
    args.locationOverrides ??
    new Map(args.planners.map((p) => [p.id, p.locationId ?? null]));
  return polishPass({
    slots: args.slots,
    bufferTimeMinutes: 0,
    travelManager: makeTravelManager(),
    events: args.events,
    plannersById,
    plannerLocationMap,
    plannerConstraintsMap: args.constraints
      ? buildPlannerConstraintsMap(args.planners)
      : undefined,
    excludedLeafIds: new Set(),
    windowedCategories: [],
    placementCutoffDate: null,
  });
}

describe("polish pass", () => {
  it("swaps the two errands and total travel drops to zero", () => {
    const { slots, events, planners } = buildBadLayout();
    expect(totalTravelMinutes(slots)).toBe(120);

    const { swaps } = runPass({ slots, events, planners });

    expect(swaps).toHaveLength(1);
    expect(totalTravelMinutes(slots)).toBe(0);

    const errandH = events.find((e) => e.id === "errand-h")!;
    const errandW = events.find((e) => e.id === "errand-w")!;
    expect(new Date(errandH.start).getTime()).toBe(at(DAY + 90).getTime());
    expect(new Date(errandW.start).getTime()).toBe(at(90).getTime());

    // The fabric agrees with the events: occupied slots sit at the swapped
    // positions and no travel slots survive.
    const occupiedH = slots.find(
      (s) => s.type === "occupied" && s.eventId === "errand-h",
    )!;
    const occupiedW = slots.find(
      (s) => s.type === "occupied" && s.eventId === "errand-w",
    )!;
    expect(occupiedH.start.getTime()).toBe(at(DAY + 90).getTime());
    expect(occupiedW.start.getTime()).toBe(at(90).getTime());
    expect(slots.some((s) => s.type === "travel")).toBe(false);
  });

  it("running the pass again changes nothing (no oscillation)", () => {
    const { slots, events, planners } = buildBadLayout();
    runPass({ slots, events, planners });
    const snapshotJson = JSON.stringify(slots);

    const second = runPass({ slots, events, planners });

    expect(second.swaps).toHaveLength(0);
    expect(JSON.stringify(slots)).toBe(snapshotJson);
  });

  it("never swaps a pair differing in duration", () => {
    const { slots, events, planners } = buildBadLayout();
    // Stretch errand-w by one minute.
    const w = slots.find(
      (s) => s.type === "occupied" && s.eventId === "errand-w",
    )!;
    w.end = at(DAY + 151);
    w.durationMinutes = 61;
    events.find((e) => e.id === "errand-w")!.end = iso(DAY + 151);

    const { swaps } = runPass({ slots, events, planners });

    expect(swaps).toHaveLength(0);
    expect(totalTravelMinutes(slots)).toBe(120);
  });

  it("rejects a swap that violates the partner position's allowed times", () => {
    const { slots, events, planners } = buildBadLayout();
    // errand-w is only allowed at its current time of day (11:30-13:00);
    // errand-h's position starts 09:30 — the swap must be refused.
    planners[1] = makePlanner("errand-w", {
      locationId: WORK,
      allowedTimes: serializeAllowedTimes({
        days: null,
        ranges: [{ startTime: "11:30", endTime: "13:00" }],
      }),
    });

    const { swaps } = runPass({ slots, events, planners, constraints: true });

    expect(swaps).toHaveLength(0);
    expect(totalTravelMinutes(slots)).toBe(120);
  });

  it("rejects a swap that would increase travel, leaving the fabric untouched", () => {
    // The GOOD layout: errands already at their matching anchors.
    const slots: Slot[] = [
      occupied(0, 60, "plan-a", WORK),
      available(60, 90, WORK, WORK),
      occupied(90, 150, "errand-w"),
      available(150, 180, WORK, WORK),
      occupied(180, 240, "plan-b", WORK),
      available(240, DAY, WORK, HOME),
      occupied(DAY, DAY + 60, "home-a", HOME),
      available(DAY + 60, DAY + 90, HOME, HOME),
      occupied(DAY + 90, DAY + 150, "errand-h"),
      available(DAY + 150, DAY + 180, HOME, HOME),
      occupied(DAY + 180, DAY + 240, "home-b", HOME),
      available(DAY + 240, DAY + 480, HOME, null),
    ];
    const events = [
      makeEvent("errand-w", 90, 150),
      makeEvent("errand-h", DAY + 90, DAY + 150),
    ];
    const planners = [
      makePlanner("errand-w", { locationId: WORK }),
      makePlanner("errand-h", { locationId: HOME }),
    ];
    const before = JSON.stringify(slots);

    const { swaps } = runPass({ slots, events, planners });

    expect(swaps).toHaveLength(0);
    expect(JSON.stringify(slots)).toBe(before);
    expect(new Date(events[0].start).getTime()).toBe(at(90).getTime());
  });

  it("excluded leaves (chain/precedence/cap involvement) never swap", () => {
    const { slots, events, planners } = buildBadLayout();
    const plannersById = new Map(planners.map((p) => [p.id, p]));
    const { swaps } = polishPass({
      slots,
      bufferTimeMinutes: 0,
      travelManager: makeTravelManager(),
      events,
      plannersById,
      plannerLocationMap: new Map(
        planners.map((p) => [p.id, p.locationId ?? null]),
      ),
      excludedLeafIds: new Set(["errand-h"]),
      windowedCategories: [],
      placementCutoffDate: null,
    });

    expect(swaps).toHaveLength(0);
    expect(totalTravelMinutes(slots)).toBe(120);
  });

  it("rides the full pipeline behind the opt-in flag without disturbing placement", () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    jest.setSystemTime(BASE);
    const spies = [
      jest.spyOn(console, "log").mockImplementation(() => {}),
      jest.spyOn(console, "warn").mockImplementation(() => {}),
      jest.spyOn(console, "info").mockImplementation(() => {}),
    ];
    try {
      const sleep = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        id: `sleep-${d}`,
        title: "Sleep",
        startDay: d,
        startTime: "22:00",
        duration: 480,
        userId: "u",
        color: null,
        locationId: null,
        createdAt: BASE.toISOString(),
        updatedAt: BASE.toISOString(),
      })) as unknown as EventTemplate[];
      const tasks = [
        makePlanner("task-1", { duration: 60 }),
        makePlanner("task-2", { duration: 90 }),
      ];

      const withFlag = generateCalendar("u", 1, sleep, tasks, [], {
        injectTravelEvents: false,
        polishPass: true,
      });
      const withoutFlag = generateCalendar("u", 1, sleep, tasks, [], {
        injectTravelEvents: false,
      });

      // No locations, no travel: nothing to improve — the flagged run must
      // produce exactly the unflagged placements.
      const starts = (events: SimpleEvent[]) =>
        events
          .map((e) => `${e.id}@${e.start}`)
          .sort()
          .join(",");
      expect(starts(withFlag.events)).toBe(starts(withoutFlag.events));
      expect(withFlag.events.find((e) => e.id === "task-1")).toBeDefined();
    } finally {
      spies.forEach((s) => s.mockRestore());
      jest.useRealTimers();
    }
  });

  it("composite-id placements (chunks, occurrences) never swap", () => {
    const { slots, events, planners } = buildBadLayout();
    // Rename errand-h to a chunk id everywhere.
    const chunkId = "errand-h|chunk:0";
    for (const slot of slots) {
      if (slot.type === "occupied" && slot.eventId === "errand-h") {
        slot.eventId = chunkId;
      }
    }
    events[0].id = chunkId;

    const { swaps } = runPass({ slots, events, planners });

    expect(swaps).toHaveLength(0);
  });
});
